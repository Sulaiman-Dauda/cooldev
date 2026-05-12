import { lookup } from 'node:dns/promises'
import {
  existsSync,
  mkdirSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from 'node:fs'
import path from 'node:path'
import type { CooldevStore } from './persistence.js'
import { execInDockerContainer } from './dockerApi.js'

export type AccessProxyProvider = 'traefik' | 'caddy' | 'unavailable'
export type AccessStatus = {
  bootstrapUrl: string
  currentDomain: string | null
  detail: string
  dnsPointsToServer: boolean | null
  httpsReady: boolean | null
  preferredUrl: string
  proxyProvider: AccessProxyProvider
  secureUrl: string | null
  sslStatus: 'inactive' | 'pending' | 'ready' | 'unavailable'
  status: 'bootstrap' | 'pending-dns' | 'provisioning-ssl' | 'live' | 'unavailable'
  summary: string
}

type ApplyAccessInput = {
  expectedIp?: string | null
  publicUrl: string | null
  requestOrigin?: string
}

function normalizePublicUrl(value: string | null | undefined): URL | null {
  const trimmed = value?.trim() || ''
  if (!trimmed) {
    return null
  }

  const candidate = /^https?:\/\//i.test(trimmed) ? trimmed : `https://${trimmed}`
  const parsed = new URL(candidate)

  if (!parsed.hostname) {
    throw new Error('Enter a valid domain or URL.')
  }

  return new URL(`https://${parsed.hostname}`)
}

function getProxyRoot(store: CooldevStore): string {
  return path.join(store.getDataDir(), 'platform-proxy')
}

function resolveTraefikDynamicDir(proxyRoot: string): string {
  const nestedDynamicDir = path.join(proxyRoot, 'traefik', 'dynamic')
  if (existsSync(nestedDynamicDir)) {
    return nestedDynamicDir
  }

  return path.join(proxyRoot, 'dynamic')
}

function detectProxyProvider(proxyRoot: string): AccessProxyProvider {
  if (existsSync(path.join(proxyRoot, 'traefik', 'dynamic')) || existsSync(path.join(proxyRoot, 'dynamic'))) {
    return 'traefik'
  }

  if (existsSync(path.join(proxyRoot, 'caddy', 'dynamic'))) {
    return 'caddy'
  }

  return 'unavailable'
}

function buildTraefikDynamicConfig(hostname: string): string {
  return [
    '# This file is managed by CoolDev.',
    'http:',
    '  middlewares:',
    '    cooldev-redirect-to-https:',
    '      redirectScheme:',
    '        scheme: https',
    '    cooldev-gzip:',
    '      compress: true',
    '  routers:',
    '    cooldev-http:',
    '      entryPoints:',
    '        - http',
    `      rule: Host(\`${hostname}\`) && !PathPrefix(\`/.well-known/acme-challenge/\`)`,
    '      middlewares:',
    '        - cooldev-redirect-to-https',
    '      service: cooldev-ui',
    '    cooldev-https:',
    '      entryPoints:',
    '        - https',
    `      rule: Host(\`${hostname}\`)`,
    '      service: cooldev-ui',
    '      tls:',
    '        certresolver: letsencrypt',
    '  services:',
    '    cooldev-ui:',
    '      loadBalancer:',
    '        servers:',
    '          - url: http://cooldev:80',
    '',
  ].join('\n')
}

function buildCaddyDynamicConfig(hostname: string): string {
  return [
    '# This file is managed by CoolDev.',
    `https://${hostname} {`,
    '    reverse_proxy cooldev:80',
    '}',
    '',
  ].join('\n')
}

async function reloadCaddyProxyIfNeeded(proxyProvider: AccessProxyProvider): Promise<void> {
  if (proxyProvider !== 'caddy') {
    return
  }

  await execInDockerContainer('coolify-proxy', [
    'caddy',
    'reload',
    '--config',
    '/config/caddy/Caddyfile.autosave',
  ])
}

function writeProxyConfig(proxyRoot: string, proxyProvider: AccessProxyProvider, hostname: string | null): void {
  const traefikFile = path.join(resolveTraefikDynamicDir(proxyRoot), 'cooldev.yaml')
  const caddyFile = path.join(proxyRoot, 'caddy', 'dynamic', 'cooldev.caddy')

  if (!hostname) {
    rmSync(traefikFile, { force: true })
    rmSync(caddyFile, { force: true })
    return
  }

  if (proxyProvider === 'traefik') {
    mkdirSync(path.dirname(traefikFile), { recursive: true })
    writeFileSync(traefikFile, buildTraefikDynamicConfig(hostname), 'utf8')
    rmSync(caddyFile, { force: true })
    return
  }

  if (proxyProvider === 'caddy') {
    mkdirSync(path.dirname(caddyFile), { recursive: true })
    writeFileSync(caddyFile, buildCaddyDynamicConfig(hostname), 'utf8')
    rmSync(traefikFile, { force: true })
  }
}

async function resolveDns(hostname: string, expectedIp: string | null): Promise<boolean | null> {
  if (!expectedIp) {
    return null
  }

  try {
    const addresses = await lookup(hostname, { all: true })
    return addresses.some((item) => item.address === expectedIp)
  } catch {
    return false
  }
}

async function probeSecureUrl(secureUrl: string | null): Promise<boolean | null> {
  if (!secureUrl) {
    return null
  }

  try {
    const response = await fetch(`${secureUrl}/api/healthz`, {
      headers: { Accept: 'application/json' },
      signal: AbortSignal.timeout(4000),
    })

    if (!response.ok) {
      return false
    }

    const payload = await response.json().catch(() => null) as { status?: string } | null
    return payload?.status === 'ok'
  } catch {
    return false
  }
}

function resolveBootstrapUrl(store: CooldevStore, requestOrigin?: string): string {
  return store.getBootstrapUrl() || requestOrigin || ''
}

export async function readAccessStatus(store: CooldevStore, requestOrigin?: string): Promise<AccessStatus> {
  const proxyRoot = getProxyRoot(store)
  const proxyProvider = detectProxyProvider(proxyRoot)
  const domainState = store.getAccessDomain()
  const bootstrapUrl = resolveBootstrapUrl(store, requestOrigin)
  const secureUrl = domainState ? `https://${domainState.hostname}` : null
  const dnsPointsToServer = domainState
    ? await resolveDns(domainState.hostname, domainState.expectedIp)
    : null
  const httpsReady = domainState ? await probeSecureUrl(secureUrl) : null

  if (!domainState) {
    return {
      bootstrapUrl,
      currentDomain: null,
      detail: bootstrapUrl
        ? `Bootstrap access stays available at ${bootstrapUrl} until you save a domain.`
        : 'Save a domain when you are ready to switch to automatic 80/443 access.',
      dnsPointsToServer: null,
      httpsReady: null,
      preferredUrl: bootstrapUrl,
      proxyProvider,
      secureUrl: null,
      sslStatus: proxyProvider === 'unavailable' ? 'unavailable' : 'inactive',
      status: proxyProvider === 'unavailable' ? 'unavailable' : 'bootstrap',
      summary: proxyProvider === 'unavailable'
        ? 'Automatic 80/443 cutover is not available on this host yet.'
        : 'Bootstrap access is active. Save a domain to turn on automatic 80/443 access.',
    }
  }

  if (proxyProvider === 'unavailable') {
    return {
      bootstrapUrl,
      currentDomain: domainState.publicUrl,
      detail: 'The managed proxy configuration directory is not available inside this CoolDev install.',
      dnsPointsToServer,
      httpsReady: false,
      preferredUrl: bootstrapUrl || domainState.publicUrl,
      proxyProvider,
      secureUrl,
      sslStatus: 'unavailable',
      status: 'unavailable',
      summary: 'CoolDev could not apply the automatic 80/443 cutover on this host.',
    }
  }

  if (httpsReady) {
    return {
      bootstrapUrl,
      currentDomain: domainState.publicUrl,
      detail: bootstrapUrl
        ? `HTTPS is live on ${secureUrl}. The bootstrap URL ${bootstrapUrl} still works as a fallback.`
        : `HTTPS is live on ${secureUrl}.`,
      dnsPointsToServer,
      httpsReady: true,
      preferredUrl: secureUrl ?? domainState.publicUrl,
      proxyProvider,
      secureUrl,
      sslStatus: 'ready',
      status: 'live',
      summary: 'Automatic 80/443 cutover is live. CoolDev is now serving the secure domain.',
    }
  }

  if (dnsPointsToServer === false) {
    return {
      bootstrapUrl,
      currentDomain: domainState.publicUrl,
      detail: bootstrapUrl
        ? `Point the domain at this server first, then keep using ${bootstrapUrl} while HTTPS finishes automatically.`
        : 'Point the domain at this server first. CoolDev will finish HTTPS setup automatically after DNS is ready.',
      dnsPointsToServer: false,
      httpsReady: false,
      preferredUrl: bootstrapUrl || domainState.publicUrl,
      proxyProvider,
      secureUrl,
      sslStatus: 'pending',
      status: 'pending-dns',
      summary: 'CoolDev saved the domain, but DNS is not pointing to this server yet.',
    }
  }

  return {
    bootstrapUrl,
    currentDomain: domainState.publicUrl,
    detail: bootstrapUrl
      ? `DNS looks ready. Keep using ${bootstrapUrl} while CoolDev finishes automatic HTTPS provisioning.`
      : 'DNS looks ready. CoolDev is finishing automatic HTTPS provisioning now.',
    dnsPointsToServer,
    httpsReady: false,
    preferredUrl: bootstrapUrl || domainState.publicUrl,
    proxyProvider,
    secureUrl,
    sslStatus: 'pending',
    status: 'provisioning-ssl',
    summary: 'DNS is ready. CoolDev is now finishing the automatic 80/443 and HTTPS cutover.',
  }
}

export async function applyAccessDomain(
  store: CooldevStore,
  input: ApplyAccessInput,
): Promise<AccessStatus> {
  const proxyRoot = getProxyRoot(store)
  const proxyProvider = detectProxyProvider(proxyRoot)
  const normalizedUrl = normalizePublicUrl(input.publicUrl)

  writeProxyConfig(proxyRoot, proxyProvider, normalizedUrl?.hostname ?? null)
  await reloadCaddyProxyIfNeeded(proxyProvider)

  if (!normalizedUrl) {
    store.clearAccessDomain()
    return readAccessStatus(store, input.requestOrigin)
  }

  store.setAccessDomain({
    expectedIp: input.expectedIp ?? null,
    hostname: normalizedUrl.hostname,
    proxyProvider,
    publicUrl: normalizedUrl.toString(),
  })

  return readAccessStatus(store, input.requestOrigin)
}

export function readProxyDynamicConfig(store: CooldevStore): string | null {
  const proxyRoot = getProxyRoot(store)
  const proxyProvider = detectProxyProvider(proxyRoot)

  if (proxyProvider === 'traefik') {
    const filePath = path.join(resolveTraefikDynamicDir(proxyRoot), 'cooldev.yaml')
    return existsSync(filePath) ? readFileSync(filePath, 'utf8') : null
  }

  if (proxyProvider === 'caddy') {
    const filePath = path.join(proxyRoot, 'caddy', 'dynamic', 'cooldev.caddy')
    return existsSync(filePath) ? readFileSync(filePath, 'utf8') : null
  }

  return null
}
