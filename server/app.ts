import { createHmac, randomBytes, timingSafeEqual } from 'node:crypto'
import { existsSync } from 'node:fs'
import { isIP } from 'node:net'
import path from 'node:path'
import express, {
  type NextFunction,
  type Request,
  type Response as ExpressResponse,
} from 'express'
import { applyAccessDomain, readAccessStatus } from './access.js'
import {
  CooldevStore,
  readBootstrapConnectionHints,
  type PublicUser,
} from './persistence.js'
import { deliverPasswordResetLink, getPasswordResetDeliveryMode } from './mailer.js'

type BootstrapSetupStep = {
  detail: string
  id: 'owner-account' | 'managed-services' | 'server-connection' | 'workspace-api'
  label: string
  state: 'complete' | 'active' | 'pending'
}

export type BootstrapSetupProgress = {
  detail: string
  percent: number
  status: 'waiting-for-owner' | 'starting-services' | 'creating-connection' | 'verifying-workspace' | 'ready'
  summary: string
  steps: BootstrapSetupStep[]
}

type BootstrapResponse = {
  currentUser: PublicUser | null
  hasOwner: boolean
  platformBaseUrl: string
  platformReachable: boolean | null
  platformReady: boolean
  serverCount: number | null
  setupProgress: BootstrapSetupProgress
}

type Locals = {
  csrfToken: string
  sessionId: string | null
  user: PublicUser | null
}

const SESSION_COOKIE_NAME = 'cooldev_session'
const CSRF_COOKIE_NAME = 'cooldev_csrf'
const SAFE_METHODS = new Set(['GET', 'HEAD', 'OPTIONS'])

type RateBucket = {
  count: number
  resetAt: number
}

function readCookie(header: string | undefined, name: string): string | null {
  if (!header) {
    return null
  }

  const match = header
    .split(';')
    .map((chunk) => chunk.trim())
    .find((chunk) => chunk.startsWith(`${name}=`))

  return match ? decodeURIComponent(match.slice(name.length + 1)) : null
}

function isSecureRequest(request: Request): boolean {
  const forwardedProto = request.get('x-forwarded-proto')?.split(',')[0]?.trim()
  return forwardedProto === 'https' || request.secure
}

function buildCookieValue(name: string, value: string, options?: {
  expiresAt?: string
  httpOnly?: boolean
  request?: Request
}) {
  const cookieParts = [
    `${name}=${encodeURIComponent(value)}`,
    'Path=/',
    'SameSite=Lax',
  ]

  if (options?.httpOnly) {
    cookieParts.push('HttpOnly')
  }

  if (options?.expiresAt) {
    cookieParts.push(`Expires=${new Date(options.expiresAt).toUTCString()}`)
  }

  if (options?.request && isSecureRequest(options.request)) {
    cookieParts.push('Secure')
  }

  return cookieParts.join('; ')
}

function setSessionCookie(request: Request, response: ExpressResponse, sessionId: string, expiresAt: string): void {
  response.setHeader(
    'Set-Cookie',
    buildCookieValue(SESSION_COOKIE_NAME, sessionId, {
      expiresAt,
      httpOnly: true,
      request,
    }),
  )
}

function clearSessionCookie(request: Request, response: ExpressResponse): void {
  response.setHeader(
    'Set-Cookie',
    buildCookieValue(SESSION_COOKIE_NAME, '', {
      expiresAt: 'Thu, 01 Jan 1970 00:00:00 GMT',
      httpOnly: true,
      request,
    }),
  )
}

function setCsrfCookie(request: Request, response: ExpressResponse, csrfToken: string): void {
  response.append(
    'Set-Cookie',
    buildCookieValue(CSRF_COOKIE_NAME, csrfToken, {
      request,
    }),
  )
}

function getLocals(response: ExpressResponse): Locals {
  return response.locals as Locals
}

function getErrorMessage(error: unknown, fallback: string): string {
  if (error instanceof Error && error.message) {
    return error.message
  }

  return fallback
}

function requestOrigin(request: Request): string {
  const forwardedProto = request.get('x-forwarded-proto')?.split(',')[0]?.trim()
  const protocol = forwardedProto || (request.secure ? 'https' : 'http')
  return `${protocol}://${request.get('host')}`
}

function inferExpectedIp(store: CooldevStore, request: Request): string | null {
  const candidates = [store.getBootstrapUrl(), requestOrigin(request)]

  for (const candidate of candidates) {
    if (!candidate) {
      continue
    }

    try {
      const parsed = new URL(candidate)
      if (isIP(parsed.hostname)) {
        return parsed.hostname
      }
    } catch {
      continue
    }
  }

  return null
}

function isSameOrigin(request: Request): boolean {
  const origin = request.get('origin')
  if (!origin) {
    return true
  }

  return origin === requestOrigin(request)
}

function createRateLimiter(options: {
  keyPrefix: string
  max: number
  windowMs: number
}) {
  const buckets = new Map<string, RateBucket>()

  return (request: Request, response: ExpressResponse, next: NextFunction): void => {
    const forwardedFor = request.get('x-forwarded-for')?.split(',')[0]?.trim()
    const clientIp = forwardedFor || request.socket.remoteAddress || 'unknown'
    const key = `${options.keyPrefix}:${clientIp}`
    const now = Date.now()
    const existing = buckets.get(key)

    if (!existing || existing.resetAt <= now) {
      buckets.set(key, {
        count: 1,
        resetAt: now + options.windowMs,
      })
      next()
      return
    }

    if (existing.count >= options.max) {
      response.setHeader('Retry-After', Math.ceil((existing.resetAt - now) / 1000))
      response.status(429).json({
        message: 'Too many attempts. Wait a moment and try again.',
      })
      return
    }

    existing.count += 1
    next()
  }
}

function resolvePlatformConfig(store: CooldevStore) {
  const existingConfig = store.getPlatformConfig()
  const bootstrapHints = readBootstrapConnectionHints(store.getDataDir())

  if (!bootstrapHints.platformBaseUrl || !bootstrapHints.apiToken) {
    return existingConfig
  }

  if (
    existingConfig
    && existingConfig.platformBaseUrl === bootstrapHints.platformBaseUrl
    && existingConfig.apiToken === bootstrapHints.apiToken
  ) {
    return existingConfig
  }

  return store.setPlatformConfig({
    apiToken: bootstrapHints.apiToken,
    platformBaseUrl: bootstrapHints.platformBaseUrl,
  })
}

async function proxyPlatformRequest(
  store: CooldevStore,
  suffix: string,
  init: RequestInit = {},
): Promise<globalThis.Response> {
  const config = resolvePlatformConfig(store)

  if (!config?.platformBaseUrl || !config.apiToken) {
    return new globalThis.Response(
      JSON.stringify({ message: 'CoolDev is still finishing setup. Retry in a moment.' }),
      {
        status: 503,
        headers: { 'Content-Type': 'application/json' },
      },
    )
  }

  const targetUrl = `${config.platformBaseUrl.replace(/\/$/, '')}/api/v1${suffix}`

  return fetch(targetUrl, {
    ...init,
    headers: {
      Accept: 'application/json',
      Authorization: `Bearer ${config.apiToken}`,
      ...(init.headers ?? {}),
    },
  })
}

async function verifyPlatformConfig(
  store: CooldevStore,
  config: { apiToken: string; platformBaseUrl: string },
): Promise<void> {
  const previousConfig = store.getPlatformConfig()

  store.setPlatformConfig(config)

  try {
    const response = await proxyPlatformRequest(store, '/health')
    if (!response.ok) {
      const detail = await response.text().catch(() => '')
      throw new Error(detail || `Verification failed with status ${response.status}.`)
    }
  } catch (error) {
    if (previousConfig) {
      store.setPlatformConfig(previousConfig)
    }
    throw error
  }
}

async function probePlatformHealth(platformBaseUrl: string): Promise<boolean | null> {
  if (!platformBaseUrl) {
    return null
  }

  try {
    const response = await fetch(`${platformBaseUrl.replace(/\/$/, '')}/api/v1/health`, {
      headers: { Accept: 'application/json' },
      signal: AbortSignal.timeout(4000),
    })

    if (!response.ok) {
      return false
    }

    const payload = await readJsonOrText(response)
    if (payload && typeof payload === 'object' && 'status' in payload) {
      return payload.status === 'ok'
    }

    if (typeof payload === 'string') {
      return payload.trim().toLowerCase() === 'ok'
    }

    return true
  } catch {
    return false
  }
}

function buildBootstrapSetupProgress(input: {
  currentUser: PublicUser | null
  hasOwner: boolean
  platformBaseUrl: string
  platformReachable: boolean | null
  servicesHealthy: boolean | null
  tokenConfigured: boolean
}): BootstrapSetupProgress {
  const ownerStep: BootstrapSetupStep = {
    detail: input.currentUser
      ? `Signed in as ${input.currentUser.email}.`
      : input.hasOwner
        ? 'The first owner account already exists. Sign in to continue.'
        : 'Create the first owner account to continue.',
    id: 'owner-account',
    label: 'Owner account created',
    state: input.hasOwner ? 'complete' : 'active',
  }

  const managedServicesState: BootstrapSetupStep['state'] = !input.hasOwner
    ? 'pending'
    : input.servicesHealthy === true
      ? 'complete'
      : 'active'
  const managedServicesStep: BootstrapSetupStep = {
    detail: input.servicesHealthy === true
      ? 'Background services are online.'
      : input.platformBaseUrl
        ? 'CoolDev is bringing the workspace online.'
        : 'CoolDev is finishing workspace setup.',
    id: 'managed-services',
    label: 'Background services ready',
    state: managedServicesState,
  }

  const connectionState: BootstrapSetupStep['state'] = !input.hasOwner || input.servicesHealthy !== true
    ? 'pending'
    : input.tokenConfigured
      ? 'complete'
      : 'active'
  const connectionStep: BootstrapSetupStep = {
    detail: input.tokenConfigured
      ? 'The workspace connection is ready.'
      : input.servicesHealthy === true
        ? 'CoolDev is finalizing the workspace connection.'
        : 'CoolDev will finalize the workspace connection after the background services are ready.',
    id: 'server-connection',
    label: 'Workspace connection ready',
    state: connectionState,
  }

  const workspaceState: BootstrapSetupStep['state'] = !input.hasOwner || input.servicesHealthy !== true || !input.tokenConfigured
    ? 'pending'
    : input.platformReachable === true
      ? 'complete'
      : 'active'
  const workspaceStep: BootstrapSetupStep = {
    detail: input.platformReachable === true
      ? 'The workspace is responding and ready to continue.'
      : input.tokenConfigured && input.servicesHealthy === true
        ? 'CoolDev is verifying the workspace before continuing.'
        : 'CoolDev will verify the workspace automatically as setup completes.',
    id: 'workspace-api',
    label: 'Workspace ready',
    state: workspaceState,
  }

  const steps = [ownerStep, managedServicesStep, connectionStep, workspaceStep]
  const completedSteps = steps.filter((step) => step.state === 'complete').length
  const percent = Math.round((completedSteps / steps.length) * 100)

  if (!input.hasOwner) {
    return {
      detail: 'CoolDev can finish setup in the background while you create the owner account.',
      percent,
      status: 'waiting-for-owner',
      steps,
      summary: 'Create the owner account to finish setup',
    }
  }

  if (input.servicesHealthy !== true) {
    return {
      detail: 'CoolDev is checking the background services automatically every few seconds.',
      percent,
      status: 'starting-services',
      steps,
      summary: 'Finishing workspace startup',
    }
  }

  if (!input.tokenConfigured) {
    return {
      detail: 'CoolDev will continue automatically as soon as the workspace connection is ready.',
      percent,
      status: 'creating-connection',
      steps,
      summary: 'Preparing your workspace',
    }
  }

  if (input.platformReachable !== true) {
    return {
      detail: 'Core services are online and CoolDev is verifying the workspace.',
      percent,
      status: 'verifying-workspace',
      steps,
      summary: 'Verifying your workspace',
    }
  }

  return {
    detail: 'CoolDev can continue directly into server onboarding.',
    percent,
    status: 'ready',
    steps,
    summary: 'Setup is complete',
  }
}

async function buildBootstrapResponse(
  store: CooldevStore,
  user: PublicUser | null,
): Promise<BootstrapResponse> {
  const bootstrapHints = readBootstrapConnectionHints(store.getDataDir())
  const platformConfig = resolvePlatformConfig(store)
  const platformBaseUrl = bootstrapHints.platformBaseUrl || platformConfig?.platformBaseUrl || ''
  const tokenConfigured = Boolean((bootstrapHints.apiToken || platformConfig?.apiToken) && platformBaseUrl)
  let platformReachable: boolean | null = null
  let serverCount: number | null = null
  let servicesHealthy: boolean | null = null

  if (platformBaseUrl) {
    servicesHealthy = await probePlatformHealth(platformBaseUrl)
  }

  if (user && platformConfig) {
    try {
      const response = await proxyPlatformRequest(store, '/servers')
      platformReachable = response.ok

      if (response.ok) {
        const payload = await response.json().catch(() => []) as unknown
        serverCount = Array.isArray(payload) ? payload.length : null
      }
    } catch {
      platformReachable = false
    }
  }

  return {
    currentUser: user,
    hasOwner: store.hasOwner(),
    platformBaseUrl: user && platformConfig ? platformConfig.platformBaseUrl : '',
    platformReachable,
    platformReady: Boolean(platformConfig?.platformBaseUrl && platformConfig.apiToken),
    serverCount,
    setupProgress: buildBootstrapSetupProgress({
      currentUser: user,
      hasOwner: store.hasOwner(),
      platformBaseUrl,
      platformReachable,
      servicesHealthy,
      tokenConfigured,
    }),
  }
}

function requireUser(_request: Request, response: ExpressResponse, next: NextFunction): void {
  const { user } = getLocals(response)

  if (!user) {
    response.status(401).json({ message: 'Sign in to continue.' })
    return
  }

  next()
}

function ensureCsrf(request: Request, response: ExpressResponse, next: NextFunction): void {
  const existingCsrfToken = readCookie(request.headers.cookie, CSRF_COOKIE_NAME)
  const csrfToken = existingCsrfToken || randomBytes(24).toString('hex')

  if (!existingCsrfToken) {
    setCsrfCookie(request, response, csrfToken)
  }

  response.locals.csrfToken = csrfToken

  if (SAFE_METHODS.has(request.method.toUpperCase())) {
    next()
    return
  }

  if (!isSameOrigin(request)) {
    response.status(403).json({ message: 'Request origin is not allowed.' })
    return
  }

  const headerToken = request.get('x-csrf-token')?.trim()
  if (!headerToken || headerToken !== csrfToken) {
    response.status(403).json({ message: 'Your session could not be verified. Refresh and try again.' })
    return
  }

  next()
}

function readAuthBody(request: Request): {
  confirmPassword?: string
  email?: string
  forceDomainOverride?: boolean
  name?: string
  password?: string
  platformBaseUrl?: string
  publicUrl?: string | null
  resetToken?: string
  apiToken?: string
} {
  if (!request.body || typeof request.body !== 'object' || Array.isArray(request.body)) {
    return {}
  }

  return request.body as {
    confirmPassword?: string
    email?: string
    forceDomainOverride?: boolean
    name?: string
    password?: string
    platformBaseUrl?: string
    publicUrl?: string | null
    resetToken?: string
    apiToken?: string
  }
}

async function readJsonOrText(response: globalThis.Response): Promise<unknown> {
  const contentType = response.headers.get('content-type') ?? ''

  if (contentType.includes('application/json')) {
    return response.json().catch(() => ({}))
  }

  return response.text().catch(() => '')
}

function sanitizePlatformMessage(message: string): string {
  // Strip any upstream platform brand names so users only see CoolDev messaging.
  return message.replace(/\bcoolify\b/gi, 'CoolDev')
}

function extractApiMessage(payload: unknown, fallback: string): string {
  if (payload && typeof payload === 'object' && 'message' in payload && typeof payload.message === 'string') {
    return payload.message
  }

  if (typeof payload === 'string' && payload.trim()) {
    return payload.trim()
  }

  return fallback
}

async function buildFallbackInstanceSettings(store: CooldevStore, request: Request) {
  const accessStatus = await readAccessStatus(store, requestOrigin(request))

  return {
    instance_name: 'CoolDev',
    public_ipv4: inferExpectedIp(store, request),
    public_url: accessStatus.currentDomain ?? null,
    workspace_settings_supported: false as const,
  }
}

function buildFallbackProfile(user: PublicUser) {
  return {
    email: user.email,
    email_verified_at: null,
    id: 0,
    name: user.name,
    two_factor_confirmed_at: null,
    two_factor_enabled: false,
    two_factor_pending: false,
    two_factor_supported: false as const,
  }
}

const registerRateLimit = createRateLimiter({ keyPrefix: 'register', max: 5, windowMs: 15 * 60 * 1000 })
const loginRateLimit = createRateLimiter({ keyPrefix: 'login', max: 10, windowMs: 15 * 60 * 1000 })
const passwordResetRequestRateLimit = createRateLimiter({ keyPrefix: 'password-reset-request', max: 5, windowMs: 15 * 60 * 1000 })
const passwordResetConfirmRateLimit = createRateLimiter({ keyPrefix: 'password-reset-confirm', max: 10, windowMs: 15 * 60 * 1000 })

// ── Webhook verification helpers ───────────────────────────────────────────────

function verifyHmacSig(
  rawBody: Buffer,
  signature: string,
  secret: string,
  prefix: string,
): boolean {
  const algo = prefix.startsWith('sha1') ? 'sha1' : 'sha256'
  const expected = `${prefix}${createHmac(algo, secret).update(rawBody).digest('hex')}`

  if (expected.length !== signature.length) {
    return false
  }

  try {
    return timingSafeEqual(Buffer.from(expected), Buffer.from(signature))
  } catch {
    return false
  }
}

function verifyTokenEquality(token: string, secret: string): boolean {
  if (token.length !== secret.length) {
    return false
  }

  try {
    return timingSafeEqual(Buffer.from(token), Buffer.from(secret))
  } catch {
    return false
  }
}

type WebhookRepoInfo = {
  branch: string
  httpsUrl: string
  sshUrl?: string
}

function extractWebhookRepoInfo(provider: string, payload: unknown): WebhookRepoInfo | null {
  if (!payload || typeof payload !== 'object') {
    return null
  }

  const p = payload as Record<string, unknown>

  if (provider === 'github' || provider === 'gitea') {
    const ref = typeof p.ref === 'string' ? p.ref : null
    if (!ref?.startsWith('refs/heads/')) return null
    const branch = ref.slice('refs/heads/'.length)
    const repo = p.repository as Record<string, unknown> | undefined
    const httpsUrl = typeof repo?.clone_url === 'string' ? repo.clone_url : ''
    const sshUrl = typeof repo?.ssh_url === 'string' ? repo.ssh_url : undefined
    return { branch, httpsUrl, sshUrl }
  }

  if (provider === 'gitlab') {
    const ref = typeof p.ref === 'string' ? p.ref : null
    if (!ref?.startsWith('refs/heads/')) return null
    const branch = ref.slice('refs/heads/'.length)
    const repo = p.repository as Record<string, unknown> | undefined
    const httpsUrl =
      typeof repo?.git_http_url === 'string'
        ? repo.git_http_url
        : typeof repo?.url === 'string'
          ? repo.url
          : ''
    return { branch, httpsUrl }
  }

  if (provider === 'bitbucket') {
    const push = p.push as Record<string, unknown> | undefined
    const changes = Array.isArray(push?.changes) ? push.changes : []
    const firstChange = changes[0] as Record<string, unknown> | undefined
    const newBranch = firstChange?.new as Record<string, unknown> | undefined
    const branch = typeof newBranch?.name === 'string' ? newBranch.name : null
    if (!branch) return null
    const repo = p.repository as Record<string, unknown> | undefined
    const links = repo?.links as Record<string, unknown> | undefined
    const html = links?.html as Record<string, unknown> | undefined
    const htmlUrl = typeof html?.href === 'string' ? html.href : ''
    const httpsUrl = htmlUrl ? `${htmlUrl}.git` : ''
    return { branch, httpsUrl }
  }

  return null
}

function normalizeGitUrl(url: string): string {
  return url
    .replace(/\.git$/, '')
    .replace(/^git@([^:]+):/, 'https://$1/')
    .toLowerCase()
    .trim()
}

async function triggerMatchingDeploys(
  store: CooldevStore,
  repoInfo: WebhookRepoInfo,
): Promise<{ triggered: number; skipped: number }> {
  const result = { triggered: 0, skipped: 0 }

  let apps: Array<{ uuid: string; git_repository?: string; git_branch?: string }> = []
  try {
    const appsResponse = await proxyPlatformRequest(store, '/applications')
    if (!appsResponse.ok) return result
    apps = (await appsResponse.json().catch(() => [])) as typeof apps
  } catch {
    return result
  }

  const normalizedHttps = normalizeGitUrl(repoInfo.httpsUrl)
  const normalizedSsh = repoInfo.sshUrl ? normalizeGitUrl(repoInfo.sshUrl) : null

  const matchingApps = apps.filter((app) => {
    const appRepo = normalizeGitUrl(app.git_repository ?? '')
    const branchMatch = app.git_branch === repoInfo.branch
    const repoMatch =
      appRepo === normalizedHttps || (normalizedSsh !== null && appRepo === normalizedSsh)
    return branchMatch && repoMatch
  })

  for (const app of matchingApps) {
    try {
      const deployResponse = await proxyPlatformRequest(
        store,
        `/deploy?uuid=${encodeURIComponent(app.uuid)}`,
        { method: 'POST' },
      )
      if (deployResponse.ok) {
        result.triggered += 1
      } else {
        result.skipped += 1
      }
    } catch {
      result.skipped += 1
    }
  }

  if (matchingApps.length === 0) {
    result.skipped = apps.length
  }

  return result
}

// ── GitHub App manifest flow state ────────────────────────────────────────────

const pendingManifestStates = new Map<string, { createdAt: number; returnUrl: string }>()
const MANIFEST_STATE_TTL_MS = 15 * 60 * 1000

function cleanManifestStates(): void {
  const now = Date.now()
  for (const [key, value] of pendingManifestStates) {
    if (now - value.createdAt > MANIFEST_STATE_TTL_MS) {
      pendingManifestStates.delete(key)
    }
  }
}

function getPublicWebhookBase(store: CooldevStore, requestOrig: string): string {
  const domain = store.getAccessDomain()
  return domain?.publicUrl && domain.publicUrl !== requestOrig ? domain.publicUrl : requestOrig
}

function buildProvidersRedirectUrl(baseUrl: string, errorOrSuccess: string): string {
  const normalizedBaseUrl = baseUrl.replace(/\/$/, '')
  return `${normalizedBaseUrl}/simple/providers?${errorOrSuccess}`
}

export function createApp(options?: { rootDir?: string; store?: CooldevStore }) {
  const app = express()
  const store = options?.store ?? new CooldevStore()
  const rootDir = options?.rootDir ?? process.cwd()
  const clientDistDir = path.resolve(rootDir, 'dist/client')
  const clientIndexFile = path.join(clientDistDir, 'index.html')

  app.disable('x-powered-by')
  app.set('trust proxy', true)

  // ── Webhook inbound routes ──────────────────────────────────────────────────────────────
  // Must be registered BEFORE express.json() so the raw Buffer body is available for
  // HMAC signature verification. Each provider checks a different header.

  app.post(
    '/webhooks/:provider',
    express.raw({ limit: '2mb', type: '*/*' }),
    async (request, response) => {
      const provider = request.params.provider
      const rawBody = request.body as Buffer

      if (!Buffer.isBuffer(rawBody)) {
        response.status(400).json({ message: 'Webhook body could not be read.' })
        return
      }

      const secret = store.getOrCreateWebhookSecret()
      let signatureValid = false

      if (provider === 'github') {
        const sig = request.get('x-hub-signature-256') ?? ''
        signatureValid = sig.length > 0 && verifyHmacSig(rawBody, sig, secret, 'sha256=')
      } else if (provider === 'gitlab') {
        const token = request.get('x-gitlab-token') ?? ''
        signatureValid = token.length > 0 && verifyTokenEquality(token, secret)
      } else if (provider === 'gitea') {
        const sig = request.get('x-gitea-signature') ?? ''
        signatureValid = sig.length > 0 && verifyHmacSig(rawBody, sig, secret, '')
      } else if (provider === 'bitbucket') {
        const sig = request.get('x-hub-signature') ?? ''
        signatureValid = sig.length > 0 && verifyHmacSig(rawBody, sig, secret, 'sha1=')
      } else {
        response.status(404).json({ message: 'Unknown webhook provider.' })
        return
      }

      if (!signatureValid) {
        response.status(401).json({ message: 'Webhook signature verification failed.' })
        return
      }

      let payload: unknown
      try {
        payload = JSON.parse(rawBody.toString('utf8'))
      } catch {
        response.status(400).json({ message: 'Webhook payload is not valid JSON.' })
        return
      }

      // Silently ignore non-push events (ping, installation, etc.)
      const repoInfo = extractWebhookRepoInfo(provider, payload)
      if (!repoInfo) {
        response.json({ message: 'Event acknowledged (not a branch push).' })
        return
      }

      const deployResult = await triggerMatchingDeploys(store, repoInfo)

      response.json({
        branch: repoInfo.branch,
        message: `Webhook received. ${deployResult.triggered} deploy(s) queued.`,
        skipped: deployResult.skipped,
        triggered: deployResult.triggered,
      })
    },
  )

  app.use(express.json({ limit: '1mb' }))

  app.use((request, response, next) => {
    const sessionId = readCookie(request.headers.cookie, SESSION_COOKIE_NAME)
    const user = store.getUserBySession(sessionId)

    response.locals.sessionId = sessionId
    response.locals.user = user

    next()
  })

  app.use('/api', ensureCsrf)

  app.get('/api/healthz', (_request, response) => {
    response.json({ status: 'ok' })
  })

  app.get('/api/bootstrap', async (_request, response) => {
    response.json(await buildBootstrapResponse(store, getLocals(response).user))
  })

  app.post('/api/auth/register', registerRateLimit, async (request, response) => {
    if (store.hasOwner()) {
      response.status(409).json({ message: 'The first owner account already exists. Sign in instead.' })
      return
    }

    const { confirmPassword = '', email = '', name = '', password = '' } = readAuthBody(request)

    if (!email.trim()) {
      response.status(422).json({ message: 'Enter an email address.' })
      return
    }

    if (!password.trim()) {
      response.status(422).json({ message: 'Enter a password.' })
      return
    }

    if (password !== confirmPassword) {
      response.status(422).json({ message: 'Password confirmation does not match.' })
      return
    }

    try {
      const user = store.createOwner({
        email,
        name,
        password,
      })
      const session = store.createSession(user.id)
      setSessionCookie(request, response, session.sessionId, session.expiresAt)
      response.status(201).json({ user })
    } catch (error) {
      response.status(422).json({ message: getErrorMessage(error, 'Could not create the first owner account.') })
    }
  })

  app.post('/api/auth/login', loginRateLimit, (request, response) => {
    const { email = '', password = '' } = readAuthBody(request)
    const user = store.authenticate({ email, password })

    if (!user) {
      response.status(401).json({ message: 'The email or password is incorrect.' })
      return
    }

    const session = store.createSession(user.id)
    setSessionCookie(request, response, session.sessionId, session.expiresAt)
    response.json({ user })
  })

  app.post('/api/auth/logout', (request, response) => {
    const { sessionId } = getLocals(response)
    store.deleteSession(sessionId)
    clearSessionCookie(request, response)
    response.status(204).end()
  })

  app.post('/api/auth/password-reset/request', passwordResetRequestRateLimit, async (request, response) => {
    const { email = '' } = readAuthBody(request)
    const deliveryMode = getPasswordResetDeliveryMode()
    const resetEntry = email.trim() ? store.createPasswordReset(email) : null

    if (resetEntry) {
      const origin = requestOrigin(request)
      const accessStatus = await readAccessStatus(store, origin)
      const resetBaseUrl = accessStatus.status === 'live' && accessStatus.secureUrl
        ? accessStatus.secureUrl
        : accessStatus.bootstrapUrl || origin
      const resetUrl = `${resetBaseUrl.replace(/\/$/, '')}/simple?resetToken=${encodeURIComponent(resetEntry.token)}`

      await deliverPasswordResetLink({
        email: resetEntry.user.email,
        expiresAt: resetEntry.expiresAt,
        name: resetEntry.user.name,
        resetUrl,
      })
    }

    response.json({
      delivery: deliveryMode,
      message: deliveryMode === 'email'
        ? 'If that account exists, CoolDev has sent a password reset link by email.'
        : 'If that account exists, CoolDev has written a password reset link to the server log.',
    })
  })

  app.post('/api/auth/password-reset/confirm', passwordResetConfirmRateLimit, (request, response) => {
    const { confirmPassword = '', password = '', resetToken = '' } = readAuthBody(request)

    if (!password.trim()) {
      response.status(422).json({ message: 'Enter a new password.' })
      return
    }

    if (password !== confirmPassword) {
      response.status(422).json({ message: 'Password confirmation does not match.' })
      return
    }

    try {
      const user = store.consumePasswordReset(resetToken, password)
      const session = store.createSession(user.id)
      setSessionCookie(request, response, session.sessionId, session.expiresAt)
      response.json({ user })
    } catch (error) {
      response.status(422).json({ message: getErrorMessage(error, 'Could not reset the password.') })
    }
  })

  app.get('/api/auth/session', (request, response) => {
    const user = getLocals(response).user

    if (!user) {
      response.status(401).json({ message: 'There is no active session.' })
      return
    }

    response.json({ user, path: request.path })
  })

  app.get('/api/admin/platform-config', requireUser, (_request, response) => {
    const platformConfig = store.getPlatformConfig()

    response.json({
      configured: Boolean(platformConfig?.platformBaseUrl && platformConfig.apiToken),
      platformBaseUrl: platformConfig?.platformBaseUrl ?? '',
    })
  })

  app.post('/api/admin/platform-config', requireUser, async (request, response) => {
    const { apiToken = '', platformBaseUrl = '' } = readAuthBody(request)

    if (!platformBaseUrl.trim()) {
      response.status(422).json({ message: 'Enter the platform URL.' })
      return
    }

    if (!apiToken.trim()) {
      response.status(422).json({ message: 'Enter the platform access token.' })
      return
    }

    try {
      await verifyPlatformConfig(store, { apiToken, platformBaseUrl })
      response.json(await buildBootstrapResponse(store, getLocals(response).user))
    } catch (error) {
      response.status(422).json({ message: getErrorMessage(error, 'Could not verify the platform connection.') })
    }
  })

  app.get('/api/admin/access', requireUser, async (request, response) => {
    response.json(await readAccessStatus(store, requestOrigin(request)))
  })

  app.post('/api/admin/access/domain', requireUser, async (request, response) => {
    const { forceDomainOverride = false, publicUrl = null } = readAuthBody(request)
    const normalizedPublicUrl = typeof publicUrl === 'string' ? publicUrl.trim() || null : null
    const origin = requestOrigin(request)
    const expectedIp = inferExpectedIp(store, request)

    try {
      const upstreamResponse = await proxyPlatformRequest(store, '/settings/instance', {
        body: JSON.stringify({
          force_domain_override: Boolean(forceDomainOverride),
          public_url: normalizedPublicUrl,
        }),
        headers: { 'Content-Type': 'application/json' },
        method: 'PATCH',
      })

      const payload = await readJsonOrText(upstreamResponse)
      if (!upstreamResponse.ok) {
        if (upstreamResponse.status === 404) {
          const accessStatus = await applyAccessDomain(store, {
            expectedIp,
            publicUrl: normalizedPublicUrl,
            requestOrigin: origin,
          })

          response.json({
            accessStatus,
            instanceSettings: {
              instance_name: 'CoolDev',
              public_ipv4: expectedIp,
              public_url: normalizedPublicUrl,
            },
            workspaceSettingsSynced: false,
          })
          return
        }

        response.status(upstreamResponse.status).json({
          ...(payload && typeof payload === 'object' ? payload : {}),
          message: extractApiMessage(payload, 'Could not update the workspace domain.'),
        })
        return
      }

      const instanceSettings = payload as {
        public_ipv4?: string | null
        public_url?: string | null
      }
      const accessStatus = await applyAccessDomain(store, {
        expectedIp: instanceSettings.public_ipv4 ?? null,
        publicUrl: typeof instanceSettings.public_url === 'string' ? instanceSettings.public_url : null,
        requestOrigin: origin,
      })

      response.json({
        accessStatus,
        instanceSettings: payload,
        workspaceSettingsSynced: true,
      })
    } catch (error) {
      response.status(422).json({ message: getErrorMessage(error, 'Could not update the workspace domain.') })
    }
  })

  // ── Workspace preferences ──────────────────────────────────────────────────────────────

  app.get('/api/admin/preferences', requireUser, (_request, response) => {
    const prefs = store.getWorkspacePreferences()
    response.json(prefs ?? { autoBackups: true })
  })

  app.patch('/api/admin/preferences', requireUser, (request, response) => {
    const body = request.body as { autoBackups?: unknown }
    const current = store.getWorkspacePreferences() ?? { autoBackups: true }
    const updated = store.setWorkspacePreferences({
      autoBackups: typeof body.autoBackups === 'boolean' ? body.autoBackups : current.autoBackups,
    })
    response.json(updated)
  })

  // ── Webhook configuration ──────────────────────────────────────────────────────────────

  function buildWebhookConfigResponse(
    request: Request,
    secret: string,
  ): { secret: string; urls: Record<string, string> } {
    const publicBase = getPublicWebhookBase(store, requestOrigin(request))
    return {
      secret,
      urls: {
        bitbucket: `${publicBase}/webhooks/bitbucket`,
        gitea: `${publicBase}/webhooks/gitea`,
        github: `${publicBase}/webhooks/github`,
        gitlab: `${publicBase}/webhooks/gitlab`,
      },
    }
  }

  app.get('/api/admin/webhook-config', requireUser, (request, response) => {
    response.json(buildWebhookConfigResponse(request, store.getOrCreateWebhookSecret()))
  })

  app.post('/api/admin/webhook-config/regenerate', requireUser, (request, response) => {
    response.json(buildWebhookConfigResponse(request, store.regenerateWebhookSecret()))
  })

  // ── GitHub App manifest flow ───────────────────────────────────────────────────────────

  app.post('/api/admin/github-app/manifest', requireUser, async (request, response) => {
    cleanManifestStates()
    const origin = requestOrigin(request)

    try {
      const accessStatus = await readAccessStatus(store, origin)

      if (accessStatus.status !== 'live' || !accessStatus.secureUrl) {
        response.status(422).json({
          message: 'GitHub App setup requires your live HTTPS workspace URL. Finish the domain and HTTPS setup in Settings, then try again.',
        })
        return
      }

      const publicBase = accessStatus.secureUrl.replace(/\/$/, '')
      const state = randomBytes(16).toString('hex')
      pendingManifestStates.set(state, { createdAt: Date.now(), returnUrl: origin })

      const manifest = {
        default_events: ['push', 'pull_request'],
        default_permissions: { contents: 'read', metadata: 'read', pull_requests: 'read' },
        hook_attributes: { url: `${publicBase}/webhooks/github` },
        name: `CoolDev (${new URL(publicBase).hostname})`,
        public: false,
        redirect_url: `${publicBase}/api/admin/github-app/callback`,
        url: publicBase,
      }

      response.json({
        actionUrl: `https://github.com/settings/apps/new?state=${state}`,
        manifest: JSON.stringify(manifest),
        state,
      })
    } catch (error) {
      response.status(502).json({ message: getErrorMessage(error, 'Could not prepare GitHub App setup.') })
    }
  })

  app.get('/api/admin/github-app/callback', async (request, response) => {
    const code = typeof request.query.code === 'string' ? request.query.code.trim() : ''
    const state = typeof request.query.state === 'string' ? request.query.state.trim() : ''
    const pendingState = pendingManifestStates.get(state)
    const redirectBaseUrl = pendingState?.returnUrl || requestOrigin(request)

    if (!code || !state || !pendingState) {
      response.redirect(buildProvidersRedirectUrl(redirectBaseUrl, 'github-error=invalid-state'))
      return
    }

    pendingManifestStates.delete(state)

    try {
      const conversionResponse = await fetch(
        `https://api.github.com/app-manifests/${code}/conversions`,
        {
          headers: {
            Accept: 'application/vnd.github+json',
            'X-GitHub-Api-Version': '2022-11-28',
          },
          method: 'POST',
        },
      )

      if (!conversionResponse.ok) {
        console.error(
          `GitHub App manifest conversion failed: HTTP ${conversionResponse.status}`,
          await conversionResponse.text().catch(() => ''),
        )
        response.redirect(buildProvidersRedirectUrl(redirectBaseUrl, 'github-error=conversion-failed'))
        return
      }

      const creds = (await conversionResponse.json()) as {
        id: number
        name: string
        slug?: string
        client_id: string
        client_secret: string
        webhook_secret: string
        pem: string
        html_url: string
      }

      store.setGithubAppCredentials({
        appId: creds.id,
        clientId: creds.client_id,
        clientSecret: creds.client_secret,
        htmlUrl: creds.html_url,
        name: creds.name,
        privateKeyPem: creds.pem,
        slug: creds.slug ?? '',
        webhookSecret: creds.webhook_secret,
      })

      response.redirect(buildProvidersRedirectUrl(redirectBaseUrl, 'github-success=1'))
    } catch (error) {
      console.error('GitHub App callback error:', error)
      response.redirect(buildProvidersRedirectUrl(redirectBaseUrl, 'github-error=network'))
    }
  })

  app.get('/api/admin/github-app/status', requireUser, (_request, response) => {
    const creds = store.getGithubAppCredentials()

    if (!creds) {
      response.json({ connected: false })
      return
    }

    response.json({
      appId: creds.appId,
      appName: creds.name,
      connected: true,
      htmlUrl: creds.htmlUrl,
      installationUrl: `${creds.htmlUrl}/installations/new`,
    })
  })

  app.get('/api/platform/settings/instance', requireUser, async (request, response) => {
    try {
      const upstreamResponse = await proxyPlatformRequest(store, '/settings/instance')
      const payload = await readJsonOrText(upstreamResponse)

      if (upstreamResponse.ok) {
        response.json(payload)
        return
      }

      if (upstreamResponse.status === 404) {
        response.json(await buildFallbackInstanceSettings(store, request))
        return
      }

      response.status(upstreamResponse.status).json({
        ...(payload && typeof payload === 'object' ? payload : {}),
        message: extractApiMessage(payload, 'Could not load workspace settings.'),
      })
    } catch (error) {
      response.status(502).json({ message: getErrorMessage(error, 'Could not reach the workspace runtime.') })
    }
  })

  // ── Dedicated 2FA endpoint handlers (sanitise upstream brand names) ──────────

  app.post('/api/platform/profile/two-factor', requireUser, async (_request, response) => {
    try {
      const upstreamResponse = await proxyPlatformRequest(store, '/profile/two-factor', { method: 'POST' })
      const payload = await readJsonOrText(upstreamResponse)

      if (upstreamResponse.ok) {
        response.json(payload)
        return
      }

      if (upstreamResponse.status === 404) {
        response.status(404).json({
          message: 'Two-factor authentication is not available on this CoolDev installation. Update CoolDev to enable it.',
        })
        return
      }

      response.status(upstreamResponse.status).json({
        ...(payload && typeof payload === 'object' ? payload : {}),
        message: sanitizePlatformMessage(extractApiMessage(payload, 'Could not start two-factor setup.')),
      })
    } catch (error) {
      response.status(502).json({ message: getErrorMessage(error, 'Could not reach the workspace runtime.') })
    }
  })

  app.delete('/api/platform/profile/two-factor', requireUser, async (_request, response) => {
    try {
      const upstreamResponse = await proxyPlatformRequest(store, '/profile/two-factor', { method: 'DELETE' })
      const payload = await readJsonOrText(upstreamResponse)

      if (upstreamResponse.ok) {
        response.json(payload)
        return
      }

      if (upstreamResponse.status === 404) {
        response.status(404).json({
          message: 'Two-factor authentication is not available on this CoolDev installation. Update CoolDev to enable it.',
        })
        return
      }

      response.status(upstreamResponse.status).json({
        ...(payload && typeof payload === 'object' ? payload : {}),
        message: sanitizePlatformMessage(extractApiMessage(payload, 'Could not disable two-factor authentication.')),
      })
    } catch (error) {
      response.status(502).json({ message: getErrorMessage(error, 'Could not reach the workspace runtime.') })
    }
  })

  app.post('/api/platform/profile/two-factor/confirm', requireUser, async (request, response) => {
    try {
      const upstreamResponse = await proxyPlatformRequest(store, '/profile/two-factor/confirm', {
        method: 'POST',
        body: JSON.stringify(request.body),
        headers: { 'Content-Type': 'application/json' },
      })
      const payload = await readJsonOrText(upstreamResponse)

      if (upstreamResponse.ok) {
        response.json(payload)
        return
      }

      if (upstreamResponse.status === 404) {
        response.status(404).json({
          message: 'Two-factor authentication is not available on this CoolDev installation. Update CoolDev to enable it.',
        })
        return
      }

      response.status(upstreamResponse.status).json({
        ...(payload && typeof payload === 'object' ? payload : {}),
        message: sanitizePlatformMessage(extractApiMessage(payload, 'Could not confirm two-factor authentication.')),
      })
    } catch (error) {
      response.status(502).json({ message: getErrorMessage(error, 'Could not reach the workspace runtime.') })
    }
  })

  // ──────────────────────────────────────────────────────────────────────────

  app.get('/api/platform/profile', requireUser, async (_request, response) => {
    const { user } = getLocals(response)

    if (!user) {
      response.status(401).json({ message: 'Sign in to continue.' })
      return
    }

    try {
      const upstreamResponse = await proxyPlatformRequest(store, '/profile')
      const payload = await readJsonOrText(upstreamResponse)

      if (upstreamResponse.ok) {
        response.json(payload)
        return
      }

      if (upstreamResponse.status === 404) {
        response.json(buildFallbackProfile(user))
        return
      }

      response.status(upstreamResponse.status).json({
        ...(payload && typeof payload === 'object' ? payload : {}),
        message: extractApiMessage(payload, 'Could not load the current profile.'),
      })
    } catch (error) {
      response.status(502).json({ message: getErrorMessage(error, 'Could not reach the workspace runtime.') })
    }
  })

  app.use('/api/platform', requireUser, async (request, response) => {
    const suffix = request.originalUrl.slice('/api/platform'.length) || '/'
    const hasBody = !SAFE_METHODS.has(request.method.toUpperCase()) && request.body !== undefined
    const contentType = request.get('content-type') ?? ''

    try {
      const upstreamResponse = await proxyPlatformRequest(store, suffix, {
        body: hasBody ? JSON.stringify(request.body) : undefined,
        headers: hasBody && contentType.includes('application/json')
          ? { 'Content-Type': 'application/json' }
          : undefined,
        method: request.method,
      })

      const rawPayload = await upstreamResponse.text()
      const responseContentType = upstreamResponse.headers.get('content-type')

      if (responseContentType) {
        response.setHeader('Content-Type', responseContentType)
      }

      // Sanitise any upstream brand names that leak through the generic proxy.
      const payload = !upstreamResponse.ok && responseContentType?.includes('application/json')
        ? rawPayload.replace(/\bCoolify\b/g, 'CoolDev').replace(/\bcoolify\b/g, 'CoolDev')
        : rawPayload

      response.status(upstreamResponse.status).send(payload)
    } catch (error) {
      response.status(502).json({ message: getErrorMessage(error, 'Could not reach the workspace runtime.') })
    }
  })

  if (existsSync(clientDistDir) && existsSync(clientIndexFile)) {
    app.use(express.static(clientDistDir, { index: false }))
    app.get(/^(?!\/api\/).*/, (request, response, next) => {
      if (request.path.startsWith('/api/')) {
        next()
        return
      }

      response.sendFile(clientIndexFile)
    })
  }

  return app
}
