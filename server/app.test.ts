// @vitest-environment node

import http from 'node:http'
import { once } from 'node:events'
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'
import type { AddressInfo } from 'node:net'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const {
  mockApplyAccessDomain,
  mockDeliverPasswordResetLink,
  mockGetPasswordResetDeliveryMode,
  mockReadAccessStatus,
} = vi.hoisted(() => ({
  mockApplyAccessDomain: vi.fn(),
  mockDeliverPasswordResetLink: vi.fn(),
  mockGetPasswordResetDeliveryMode: vi.fn(),
  mockReadAccessStatus: vi.fn(),
}))

vi.mock('./access.js', () => ({
  applyAccessDomain: mockApplyAccessDomain,
  readAccessStatus: mockReadAccessStatus,
}))

vi.mock('./mailer.js', () => ({
  deliverPasswordResetLink: mockDeliverPasswordResetLink,
  getPasswordResetDeliveryMode: mockGetPasswordResetDeliveryMode,
}))

import { createApp } from './app.js'
import { CooldevStore } from './persistence.js'

type HttpJsonResponse<T = unknown> = {
  body: T
  bodyText: string
  headers: http.IncomingHttpHeaders
  status: number
}

let nextClientIpOctet = 10

class TestClient {
  private readonly cookies = new Map<string, string>()
  private readonly clientIp = `198.51.100.${nextClientIpOctet++}`

  constructor(private readonly baseUrl: string) {}

  csrfToken(): string {
    return this.cookies.get('cooldev_csrf') ?? ''
  }

  async request<T = unknown>(input: {
    body?: unknown
    headers?: Record<string, string>
    method: string
    path: string
    withCsrf?: boolean
  }): Promise<HttpJsonResponse<T>> {
    const requestUrl = new URL(input.path, this.baseUrl)
    const payload = input.body === undefined ? undefined : JSON.stringify(input.body)

    const headers: Record<string, string> = {
      Accept: 'application/json',
      'X-Forwarded-For': this.clientIp,
      ...(input.headers ?? {}),
    }

    const cookieHeader = Array.from(this.cookies.entries())
      .map(([name, value]) => `${name}=${encodeURIComponent(value)}`)
      .join('; ')

    if (cookieHeader) {
      headers.Cookie = cookieHeader
    }

    if (payload !== undefined) {
      headers['Content-Type'] = 'application/json'
      headers['Content-Length'] = String(Buffer.byteLength(payload))
    }

    if (input.withCsrf) {
      headers['X-CSRF-Token'] = this.csrfToken()
    }

    const response = await new Promise<HttpJsonResponse<T>>((resolve, reject) => {
      const request = http.request(
        {
          headers,
          hostname: requestUrl.hostname,
          method: input.method,
          path: `${requestUrl.pathname}${requestUrl.search}`,
          port: requestUrl.port,
        },
        (result) => {
          const chunks: Buffer[] = []
          result.on('data', (chunk) => {
            chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk))
          })
          result.on('end', () => {
            const setCookie = result.headers['set-cookie']
            for (const cookie of Array.isArray(setCookie) ? setCookie : setCookie ? [setCookie] : []) {
              const [cookiePair] = cookie.split(';')
              const separatorIndex = cookiePair.indexOf('=')
              if (separatorIndex > 0) {
                const name = cookiePair.slice(0, separatorIndex)
                const value = decodeURIComponent(cookiePair.slice(separatorIndex + 1))
                this.cookies.set(name, value)
              }
            }

            const bodyText = Buffer.concat(chunks).toString('utf8')
            let body: T
            try {
              body = bodyText ? JSON.parse(bodyText) as T : undefined as T
            } catch {
              body = bodyText as T
            }

            resolve({
              body,
              bodyText,
              headers: result.headers,
              status: result.statusCode ?? 500,
            })
          })
        },
      )

      request.on('error', reject)
      if (payload !== undefined) {
        request.write(payload)
      }
      request.end()
    })

    return response
  }
}

type RunningServer = {
  baseUrl: string
  close: () => Promise<void>
  store: CooldevStore
}

const runningServers: RunningServer[] = []

const OWNER = {
  email: 'owner@example.com',
  name: 'Owner',
  password: 'password123',
}

async function startServer(): Promise<RunningServer> {
  const dataDir = mkdtempSync(path.join(tmpdir(), 'cooldev-server-test-'))
  const store = new CooldevStore(dataDir)
  const app = createApp({ rootDir: process.cwd(), store })
  const server = app.listen(0, '127.0.0.1')
  await once(server, 'listening')

  const address = server.address() as AddressInfo
  const runningServer: RunningServer = {
    baseUrl: `http://127.0.0.1:${address.port}`,
    close: async () => {
      await new Promise<void>((resolve, reject) => {
        server.close((error) => {
          if (error) {
            reject(error)
            return
          }
          resolve()
        })
      })
      rmSync(dataDir, { force: true, recursive: true })
    },
    store,
  }

  runningServers.push(runningServer)
  return runningServer
}

async function signIn(client: TestClient, email = OWNER.email, password = OWNER.password) {
  await client.request({ method: 'GET', path: '/api/healthz' })
  return client.request({
    body: { email, password },
    method: 'POST',
    path: '/api/auth/login',
    withCsrf: true,
  })
}

describe('CoolDev server routes', () => {
  beforeEach(() => {
    mockApplyAccessDomain.mockReset()
    mockDeliverPasswordResetLink.mockReset()
    mockGetPasswordResetDeliveryMode.mockReset()
    mockReadAccessStatus.mockReset()

    mockGetPasswordResetDeliveryMode.mockReturnValue('server-log')
    mockDeliverPasswordResetLink.mockResolvedValue('server-log')
    mockReadAccessStatus.mockResolvedValue({
      bootstrapUrl: 'http://203.0.113.10:8080',
      currentDomain: null,
      detail: 'Bootstrap access is active.',
      dnsPointsToServer: null,
      httpsReady: null,
      preferredUrl: 'http://203.0.113.10:8080',
      proxyProvider: 'traefik',
      secureUrl: null,
      sslStatus: 'inactive',
      status: 'bootstrap',
      summary: 'Bootstrap access is active.',
    })
    mockApplyAccessDomain.mockResolvedValue({
      bootstrapUrl: 'http://203.0.113.10:8080',
      currentDomain: 'https://cooldev.example.com',
      detail: 'DNS looks ready. CoolDev is finishing HTTPS provisioning.',
      dnsPointsToServer: true,
      httpsReady: false,
      preferredUrl: 'http://203.0.113.10:8080',
      proxyProvider: 'traefik',
      secureUrl: 'https://cooldev.example.com',
      sslStatus: 'pending',
      status: 'provisioning-ssl',
      summary: 'DNS is ready. CoolDev is now finishing the automatic 80/443 and HTTPS cutover.',
    })
  })

  afterEach(async () => {
    vi.restoreAllMocks()
    while (runningServers.length > 0) {
      const server = runningServers.pop()
      if (server) {
        await server.close()
      }
    }
  })

  it('sets a CSRF cookie on GET and rejects unsafe requests without the matching header or origin', async () => {
    const { baseUrl } = await startServer()
    const client = new TestClient(baseUrl)

    const healthResponse = await client.request({ method: 'GET', path: '/api/healthz' })
    expect(healthResponse.status).toBe(200)
    expect(client.csrfToken()).toBeTruthy()

    const missingTokenResponse = await client.request({
      body: {
        confirmPassword: OWNER.password,
        email: OWNER.email,
        name: OWNER.name,
        password: OWNER.password,
      },
      method: 'POST',
      path: '/api/auth/register',
    })
    expect(missingTokenResponse.status).toBe(403)
    expect(missingTokenResponse.body).toMatchObject({
      message: 'Your session could not be verified. Refresh and try again.',
    })

    const wrongOriginResponse = await client.request({
      body: {
        confirmPassword: OWNER.password,
        email: OWNER.email,
        name: OWNER.name,
        password: OWNER.password,
      },
      headers: { Origin: 'https://evil.example' },
      method: 'POST',
      path: '/api/auth/register',
      withCsrf: true,
    })
    expect(wrongOriginResponse.status).toBe(403)
    expect(wrongOriginResponse.body).toMatchObject({ message: 'Request origin is not allowed.' })
  })

  it('rate limits repeated failed sign-in attempts', async () => {
    const { baseUrl, store } = await startServer()
    store.createOwner(OWNER)
    const client = new TestClient(baseUrl)

    await client.request({ method: 'GET', path: '/api/healthz' })

    for (let attempt = 0; attempt < 10; attempt += 1) {
      const response = await client.request({
        body: { email: OWNER.email, password: 'wrong-password' },
        method: 'POST',
        path: '/api/auth/login',
        withCsrf: true,
      })
      expect(response.status).toBe(401)
    }

    const blockedResponse = await client.request({
      body: { email: OWNER.email, password: 'wrong-password' },
      method: 'POST',
      path: '/api/auth/login',
      withCsrf: true,
    })

    expect(blockedResponse.status).toBe(429)
    expect(blockedResponse.body).toMatchObject({
      message: 'Too many attempts. Wait a moment and try again.',
    })
    expect(blockedResponse.headers['retry-after']).toBeTruthy()
  })

  it('creates a password reset request and sends the reset link through the configured delivery channel', async () => {
    const { baseUrl, store } = await startServer()
    store.createOwner(OWNER)
    const client = new TestClient(baseUrl)

    await client.request({ method: 'GET', path: '/api/healthz' })

    const response = await client.request<{ delivery: string; message: string }>({
      body: { email: OWNER.email },
      method: 'POST',
      path: '/api/auth/password-reset/request',
      withCsrf: true,
    })

    expect(response.status).toBe(200)
    expect(response.body.delivery).toBe('server-log')
    expect(mockDeliverPasswordResetLink).toHaveBeenCalledTimes(1)
    expect(mockDeliverPasswordResetLink.mock.calls[0]?.[0]).toMatchObject({
      email: OWNER.email,
      name: OWNER.name,
    })
    expect(String(mockDeliverPasswordResetLink.mock.calls[0]?.[0]?.resetUrl ?? '')).toContain('/simple?resetToken=')
  })

  it('confirms a password reset and starts a signed-in session', async () => {
    const { baseUrl, store } = await startServer()
    store.createOwner(OWNER)
    const resetEntry = store.createPasswordReset(OWNER.email)
    const client = new TestClient(baseUrl)

    expect(resetEntry).toBeTruthy()

    await client.request({ method: 'GET', path: '/api/healthz' })
    const response = await client.request({
      body: {
        confirmPassword: 'newpassword123',
        password: 'newpassword123',
        resetToken: resetEntry?.token,
      },
      method: 'POST',
      path: '/api/auth/password-reset/confirm',
      withCsrf: true,
    })

    expect(response.status).toBe(200)
    expect(store.authenticate({ email: OWNER.email, password: 'newpassword123' })).toMatchObject({
      email: OWNER.email,
    })

    const sessionResponse = await client.request({ method: 'GET', path: '/api/auth/session' })
    expect(sessionResponse.status).toBe(200)
    expect(sessionResponse.body).toMatchObject({
      user: {
        email: OWNER.email,
      },
    })
  })

  it('reports live bootstrap progress while the managed platform is still finishing setup', async () => {
    const { baseUrl, store } = await startServer()
    const client = new TestClient(baseUrl)
    store.createOwner(OWNER)

    const loginResponse = await signIn(client)
    expect(loginResponse.status).toBe(200)

    const response = await client.request<{
      currentUser: { email: string }
      hasOwner: boolean
      platformReady: boolean
      setupProgress: {
        percent: number
        status: string
        summary: string
        steps: Array<{ id: string; state: string }>
      }
    }>({ method: 'GET', path: '/api/bootstrap' })

    expect(response.status).toBe(200)
    expect(response.body).toMatchObject({
      currentUser: { email: OWNER.email },
      hasOwner: true,
      platformReady: false,
      setupProgress: {
        percent: 25,
        status: 'starting-services',
        summary: 'Finishing workspace startup',
      },
    })
    expect(response.body.setupProgress.steps).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ id: 'owner-account', state: 'complete' }),
        expect.objectContaining({ id: 'managed-services', state: 'active' }),
      ]),
    )
  })

  it('protects access routes behind authentication and returns the saved access summary when signed in', async () => {
    const { baseUrl, store } = await startServer()
    const client = new TestClient(baseUrl)
    store.createOwner(OWNER)

    const unauthenticatedResponse = await client.request({ method: 'GET', path: '/api/admin/access' })
    expect(unauthenticatedResponse.status).toBe(401)

    const loginResponse = await signIn(client)
    expect(loginResponse.status).toBe(200)

    const response = await client.request({ method: 'GET', path: '/api/admin/access' })
    expect(response.status).toBe(200)
    expect(response.body).toMatchObject({
      status: 'bootstrap',
      summary: 'Bootstrap access is active.',
    })
  })

  it('saves a domain through the access route, updates the platform setting, and returns cutover status', async () => {
    const { baseUrl, store } = await startServer()
    const client = new TestClient(baseUrl)
    store.createOwner(OWNER)
    store.setPlatformConfig({
      apiToken: 'platform-token',
      platformBaseUrl: 'http://platform.internal:8080',
    })

    const loginResponse = await signIn(client)
    expect(loginResponse.status).toBe(200)

    const platformFetch = vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce(new Response(
      JSON.stringify({
        instance_name: 'CoolDev',
        public_ipv4: '203.0.113.10',
        public_url: 'https://cooldev.example.com',
      }),
      {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      },
    ))

    const response = await client.request({
      body: {
        forceDomainOverride: false,
        publicUrl: 'https://cooldev.example.com',
      },
      method: 'POST',
      path: '/api/admin/access/domain',
      withCsrf: true,
    })

    expect(response.status).toBe(200)
    expect(platformFetch).toHaveBeenCalledWith(
      'http://platform.internal:8080/api/v1/settings/instance',
      expect.objectContaining({
        body: JSON.stringify({
          force_domain_override: false,
          public_url: 'https://cooldev.example.com',
        }),
        method: 'PATCH',
      }),
    )
    expect(mockApplyAccessDomain).toHaveBeenCalledWith(
      store,
      expect.objectContaining({
        expectedIp: '203.0.113.10',
        publicUrl: 'https://cooldev.example.com',
        requestOrigin: baseUrl,
      }),
    )
    expect(response.body).toMatchObject({
      accessStatus: {
        status: 'provisioning-ssl',
      },
      instanceSettings: {
        public_url: 'https://cooldev.example.com',
      },
      workspaceSettingsSynced: true,
    })
  })

  it('falls back to local domain automation when the platform settings endpoint is unavailable', async () => {
    const { baseUrl, store } = await startServer()
    const client = new TestClient(baseUrl)
    store.createOwner(OWNER)
    store.setPlatformConfig({
      apiToken: 'platform-token',
      platformBaseUrl: 'http://platform.internal:8080',
    })

    const loginResponse = await signIn(client)
    expect(loginResponse.status).toBe(200)

    mockApplyAccessDomain.mockResolvedValueOnce({
      bootstrapUrl: 'http://127.0.0.1:3001',
      currentDomain: 'https://cooldev.backnd.top',
      detail: 'DNS looks ready. CoolDev is finishing HTTPS provisioning.',
      dnsPointsToServer: true,
      httpsReady: false,
      preferredUrl: 'http://127.0.0.1:3001',
      proxyProvider: 'traefik',
      secureUrl: 'https://cooldev.backnd.top',
      sslStatus: 'pending',
      status: 'provisioning-ssl',
      summary: 'DNS is ready. CoolDev is now finishing the automatic 80/443 and HTTPS cutover.',
    })

    const platformFetch = vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce(new Response(
      JSON.stringify({ message: 'Not found.' }),
      {
        status: 404,
        headers: { 'Content-Type': 'application/json' },
      },
    ))

    const response = await client.request({
      body: {
        forceDomainOverride: false,
        publicUrl: 'https://cooldev.backnd.top',
      },
      method: 'POST',
      path: '/api/admin/access/domain',
      withCsrf: true,
    })

    expect(response.status).toBe(200)
    expect(platformFetch).toHaveBeenCalledWith(
      'http://platform.internal:8080/api/v1/settings/instance',
      expect.objectContaining({
        body: JSON.stringify({
          force_domain_override: false,
          public_url: 'https://cooldev.backnd.top',
        }),
        method: 'PATCH',
      }),
    )
    expect(mockApplyAccessDomain).toHaveBeenCalledWith(
      store,
      expect.objectContaining({
        expectedIp: '127.0.0.1',
        publicUrl: 'https://cooldev.backnd.top',
        requestOrigin: baseUrl,
      }),
    )
    expect(response.body).toMatchObject({
      accessStatus: {
        currentDomain: 'https://cooldev.backnd.top',
        status: 'provisioning-ssl',
      },
      instanceSettings: {
        instance_name: 'CoolDev',
        public_ipv4: '127.0.0.1',
        public_url: 'https://cooldev.backnd.top',
      },
      workspaceSettingsSynced: false,
    })
  })

  it('returns local workspace settings metadata when the upstream settings endpoint is unavailable', async () => {
    const { baseUrl, store } = await startServer()
    const client = new TestClient(baseUrl)
    store.createOwner(OWNER)
    store.setPlatformConfig({
      apiToken: 'platform-token',
      platformBaseUrl: 'http://platform.internal:8080',
    })

    mockReadAccessStatus.mockResolvedValueOnce({
      bootstrapUrl: 'http://127.0.0.1:3001',
      currentDomain: 'https://cooldev.backnd.top',
      detail: 'Bootstrap access is active.',
      dnsPointsToServer: true,
      httpsReady: false,
      preferredUrl: 'http://127.0.0.1:3001',
      proxyProvider: 'traefik',
      secureUrl: 'https://cooldev.backnd.top',
      sslStatus: 'pending',
      status: 'provisioning-ssl',
      summary: 'DNS is ready. CoolDev is now finishing the automatic 80/443 and HTTPS cutover.',
    })

    const loginResponse = await signIn(client)
    expect(loginResponse.status).toBe(200)

    const platformFetch = vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce(new Response(
      JSON.stringify({ message: 'Not found.' }),
      {
        status: 404,
        headers: { 'Content-Type': 'application/json' },
      },
    ))

    const response = await client.request({
      method: 'GET',
      path: '/api/platform/settings/instance',
    })

    expect(response.status).toBe(200)
    expect(platformFetch).toHaveBeenCalledWith(
      'http://platform.internal:8080/api/v1/settings/instance',
      expect.objectContaining({
        headers: expect.objectContaining({
          Accept: 'application/json',
          Authorization: 'Bearer platform-token',
        }),
      }),
    )
    expect(response.body).toMatchObject({
      instance_name: 'CoolDev',
      public_ipv4: '127.0.0.1',
      public_url: 'https://cooldev.backnd.top',
      workspace_settings_supported: false,
    })
  })

  it('returns the signed-in owner as a fallback profile when the upstream profile endpoint is unavailable', async () => {
    const { baseUrl, store } = await startServer()
    const client = new TestClient(baseUrl)
    store.createOwner(OWNER)
    store.setPlatformConfig({
      apiToken: 'platform-token',
      platformBaseUrl: 'http://platform.internal:8080',
    })

    const loginResponse = await signIn(client)
    expect(loginResponse.status).toBe(200)

    const platformFetch = vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce(new Response(
      JSON.stringify({ message: 'Not found.' }),
      {
        status: 404,
        headers: { 'Content-Type': 'application/json' },
      },
    ))

    const response = await client.request({
      method: 'GET',
      path: '/api/platform/profile',
    })

    expect(response.status).toBe(200)
    expect(platformFetch).toHaveBeenCalledWith(
      'http://platform.internal:8080/api/v1/profile',
      expect.objectContaining({
        headers: expect.objectContaining({
          Accept: 'application/json',
          Authorization: 'Bearer platform-token',
        }),
      }),
    )
    expect(response.body).toMatchObject({
      email: OWNER.email,
      id: 0,
      name: OWNER.name,
      two_factor_enabled: false,
      two_factor_pending: false,
      two_factor_supported: false,
    })
  })

  it('rejects GitHub App setup until a live HTTPS workspace URL is available', async () => {
    const { baseUrl, store } = await startServer()
    const client = new TestClient(baseUrl)
    store.createOwner(OWNER)

    const loginResponse = await signIn(client)
    expect(loginResponse.status).toBe(200)

    const response = await client.request<{ message: string }>({
      method: 'POST',
      path: '/api/admin/github-app/manifest',
      withCsrf: true,
    })

    expect(response.status).toBe(422)
    expect(response.body).toMatchObject({
      message: 'GitHub App setup requires your live HTTPS workspace URL. Finish the domain and HTTPS setup in Settings, then try again.',
    })
  })

  it('builds the GitHub App manifest from the live secure URL', async () => {
    const { baseUrl, store } = await startServer()
    const client = new TestClient(baseUrl)
    store.createOwner(OWNER)

    mockReadAccessStatus.mockResolvedValueOnce({
      bootstrapUrl: baseUrl,
      currentDomain: 'https://cooldev.example.com',
      detail: 'HTTPS is live.',
      dnsPointsToServer: true,
      httpsReady: true,
      preferredUrl: 'https://cooldev.example.com',
      proxyProvider: 'traefik',
      secureUrl: 'https://cooldev.example.com',
      sslStatus: 'ready',
      status: 'live',
      summary: 'Automatic 80/443 cutover is live.',
    })

    const loginResponse = await signIn(client)
    expect(loginResponse.status).toBe(200)

    const response = await client.request<{
      actionUrl: string
      manifest: string
      state: string
    }>({
      method: 'POST',
      path: '/api/admin/github-app/manifest',
      withCsrf: true,
    })

    expect(response.status).toBe(200)
    expect(response.body.actionUrl).toContain('https://github.com/settings/apps/new?state=')
    expect(response.body.state).toBeTruthy()

    const manifest = JSON.parse(response.body.manifest) as {
      hook_attributes: { url: string }
      name: string
      redirect_url: string
      url: string
    }

    expect(manifest).toMatchObject({
      hook_attributes: { url: 'https://cooldev.example.com/webhooks/github' },
      name: 'CoolDev (cooldev.example.com)',
      redirect_url: 'https://cooldev.example.com/api/admin/github-app/callback',
      url: 'https://cooldev.example.com',
    })
  })

  it('accepts a GitHub App callback without an app session and returns the user to the originating host', async () => {
    const { baseUrl, store } = await startServer()
    const signedInClient = new TestClient(baseUrl)
    store.createOwner(OWNER)

    mockReadAccessStatus.mockResolvedValueOnce({
      bootstrapUrl: baseUrl,
      currentDomain: 'https://cooldev.example.com',
      detail: 'HTTPS is live.',
      dnsPointsToServer: true,
      httpsReady: true,
      preferredUrl: 'https://cooldev.example.com',
      proxyProvider: 'traefik',
      secureUrl: 'https://cooldev.example.com',
      sslStatus: 'ready',
      status: 'live',
      summary: 'Automatic 80/443 cutover is live.',
    })

    const loginResponse = await signIn(signedInClient)
    expect(loginResponse.status).toBe(200)

    const manifestResponse = await signedInClient.request<{
      actionUrl: string
      manifest: string
      state: string
    }>({
      method: 'POST',
      path: '/api/admin/github-app/manifest',
      withCsrf: true,
    })

    expect(manifestResponse.status).toBe(200)

    const conversionFetch = vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce(new Response(
      JSON.stringify({
        client_id: 'github-client-id',
        client_secret: 'github-client-secret',
        html_url: 'https://github.com/apps/cooldev-test',
        id: 12345,
        name: 'CoolDev Test',
        pem: '-----BEGIN PRIVATE KEY-----\nkey\n-----END PRIVATE KEY-----',
        slug: 'cooldev-test',
        webhook_secret: 'github-webhook-secret',
      }),
      {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      },
    ))

    const anonymousClient = new TestClient(baseUrl)
    const callbackResponse = await anonymousClient.request({
      method: 'GET',
      path: `/api/admin/github-app/callback?code=test-code&state=${manifestResponse.body.state}`,
    })

    expect(callbackResponse.status).toBe(302)
    expect(callbackResponse.headers.location).toBe(`${baseUrl}/simple/providers?github-success=1`)
    expect(conversionFetch).toHaveBeenCalledWith(
      'https://api.github.com/app-manifests/test-code/conversions',
      expect.objectContaining({
        headers: expect.objectContaining({
          Accept: 'application/vnd.github+json',
          'X-GitHub-Api-Version': '2022-11-28',
        }),
        method: 'POST',
      }),
    )
    expect(store.getGithubAppCredentials()).toMatchObject({
      appId: 12345,
      clientId: 'github-client-id',
      clientSecret: 'github-client-secret',
      htmlUrl: 'https://github.com/apps/cooldev-test',
      name: 'CoolDev Test',
      slug: 'cooldev-test',
      webhookSecret: 'github-webhook-secret',
    })
  })
})
