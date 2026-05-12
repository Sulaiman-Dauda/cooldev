import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import {
  ApiError,
  getPlatformSetupStatus,
  getBootstrapState,
  checkHealth,
  clearConfig,
  confirmTwoFactorAuthentication,
  createApplicationBulkEnvs,
  createComposeService,
  createDatabaseBackup,
  createManagedDatabase,
  createPrivateDeployKeyApplication,
  createPrivateGithubAppApplication,
  createPrivateKey,
  createProjectEnvironment,
  createPublicApplication,
  getCurrentTeam,
  getCurrentTeamMembers,
  getCurrentProfile,
  getInstanceSettings,
  createServer,
  getApplicationDeployments,
  enableTwoFactorAuthentication,
  isConfigured,
  disableTwoFactorAuthentication,
  listGithubApps,
  listPrivateKeys,
  listProjectEnvironments,
  listDeployments,
  listServers,
  readConfig,
  registerOwner,
  saveConfig,
  savePlatformSetup,
  signIn,
  signOut,
  triggerDeploy,
  updateInstanceSettings,
} from './api'

// ── Helpers ───────────────────────────────────────────────────────────────────

function mockFetch(body: unknown, status = 200) {
  const response = new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  })
  vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce(response)
}

function mockTextFetch(body: string, status = 200) {
  const response = new Response(body, {
    status,
    headers: { 'Content-Type': 'text/plain' },
  })
  vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce(response)
}

function mockFetchError(status: number, text = 'Error') {
  const response = new Response(text, { status })
  vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce(response)
}

const MOCK_CONFIG = {
  platformBaseUrl: 'http://coolify.test',
  apiToken: 'test-token',
}

const testWindow = window as unknown as {
  __COOLDEV_CONFIG__?: {
    platformBaseUrl: string
    apiToken: string
  }
}

// ── Config management ─────────────────────────────────────────────────────────

describe('config management', () => {
  afterEach(() => {
    localStorage.clear()
    // Clear injected window config after each test
    delete testWindow.__COOLDEV_CONFIG__
  })

  it('returns empty config when nothing is stored', () => {
    const cfg = readConfig()
    expect(cfg.platformBaseUrl).toBe('')
    expect(cfg.apiToken).toBe('')
  })

  it('round-trips config through localStorage', () => {
    saveConfig(MOCK_CONFIG)
    const cfg = readConfig()
    expect(cfg.platformBaseUrl).toBe(MOCK_CONFIG.platformBaseUrl)
    expect(cfg.apiToken).toBe(MOCK_CONFIG.apiToken)
  })

  it('reports isConfigured false when empty', () => {
    expect(isConfigured()).toBe(false)
  })

  it('reports isConfigured true after saving config', () => {
    saveConfig(MOCK_CONFIG)
    expect(isConfigured()).toBe(true)
  })

  it('clears config, onboarding state, and disables injected defaults until reconnect', () => {
    saveConfig(MOCK_CONFIG)
    localStorage.setItem('cooldev-onboarding-complete', 'true')
    testWindow.__COOLDEV_CONFIG__ = {
      platformBaseUrl: 'http://injected',
      apiToken: 'injected-token',
    }

    clearConfig()

    expect(isConfigured()).toBe(false)
    expect(localStorage.getItem('cooldev-onboarding-complete')).toBeNull()
    expect(readConfig()).toEqual({ platformBaseUrl: '', apiToken: '' })
  })

  it('uses installer-injected config when no local override exists', () => {
    testWindow.__COOLDEV_CONFIG__ = {
      platformBaseUrl: 'http://injected',
      apiToken: 'injected-token',
    }

    const cfg = readConfig()

    expect(cfg.platformBaseUrl).toBe('http://injected')
    expect(cfg.apiToken).toBe('injected-token')
  })

  it('prefers a saved local override over installer-injected config', () => {
    saveConfig({ platformBaseUrl: 'http://stored', apiToken: 'stored-token' })
    testWindow.__COOLDEV_CONFIG__ = {
      platformBaseUrl: 'http://injected',
      apiToken: 'injected-token',
    }

    const cfg = readConfig()

    expect(cfg.platformBaseUrl).toBe('http://stored')
    expect(cfg.apiToken).toBe('stored-token')
  })
})

// ── API calls ─────────────────────────────────────────────────────────────────

describe('API calls', () => {
  beforeEach(() => {
    saveConfig(MOCK_CONFIG)
  })

  afterEach(() => {
    localStorage.clear()
    vi.restoreAllMocks()
  })

  it('checkHealth sends a GET through the same-origin platform proxy', async () => {
    mockFetch({ status: 'ok' })

    const result = await checkHealth()

    expect(result).toEqual({ status: 'ok' })
    const [url, init] = (fetch as ReturnType<typeof vi.spyOn>).mock.calls[0] as [string, RequestInit]
    expect(url).toBe('/api/platform/health')
    expect(init?.credentials).toBe('include')
    expect((init?.headers as Record<string, string>)['Authorization']).toBeUndefined()
  })

  it('checkHealth accepts a config override for direct verification requests', async () => {
    mockFetch({ status: 'ok' })

    await checkHealth({ platformBaseUrl: 'http://other', apiToken: 'other-token' })

    const [url, init] = (fetch as ReturnType<typeof vi.spyOn>).mock.calls[0] as [string, RequestInit]
    expect(url).toContain('http://other')
    expect((init?.headers as Record<string, string>)['Authorization']).toBe('Bearer other-token')
  })

  it('loads bootstrap state from the CoolDev backend', async () => {
    mockFetch({
      platformBaseUrl: 'http://coolify.test',
      platformReady: true,
      platformReachable: true,
      currentUser: { id: 'owner-1', name: 'Sulaiman', email: 'sulaiman@example.com', role: 'owner' },
      hasOwner: true,
      serverCount: 1,
    })

    const result = await getBootstrapState()

    expect(result).toMatchObject({
      platformReady: true,
      hasOwner: true,
      serverCount: 1,
    })

    const [url, init] = (fetch as ReturnType<typeof vi.spyOn>).mock.calls[0] as [string, RequestInit]
    expect(url).toBe('/api/bootstrap')
    expect(init?.credentials).toBe('include')
  })

  it('registers the first owner through the backend auth route', async () => {
    mockFetch({
      user: { id: 'owner-1', name: 'Sulaiman', email: 'sulaiman@example.com', role: 'owner' },
    }, 201)

    await registerOwner({
      name: 'Sulaiman',
      email: 'sulaiman@example.com',
      password: 'password123',
      confirmPassword: 'password123',
    })

    const [url, init] = (fetch as ReturnType<typeof vi.spyOn>).mock.calls[0] as [string, RequestInit]
    expect(url).toBe('/api/auth/register')
    expect(init?.method).toBe('POST')

    const body = JSON.parse(String(init?.body)) as { email: string; name: string }
    expect(body).toMatchObject({ email: 'sulaiman@example.com', name: 'Sulaiman' })
  })

  it('signs in through the backend auth route', async () => {
    mockFetch({
      user: { id: 'owner-1', name: 'Sulaiman', email: 'sulaiman@example.com', role: 'owner' },
    })

    await signIn({ email: 'sulaiman@example.com', password: 'password123' })

    const [url, init] = (fetch as ReturnType<typeof vi.spyOn>).mock.calls[0] as [string, RequestInit]
    expect(url).toBe('/api/auth/login')
    expect(init?.method).toBe('POST')
  })

  it('signs out through the backend auth route without a request body', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce(new Response(null, { status: 204 }))

    await signOut()

    const [url, init] = (fetch as ReturnType<typeof vi.spyOn>).mock.calls[0] as [string, RequestInit]
    expect(url).toBe('/api/auth/logout')
    expect(init?.method).toBe('POST')
    expect(init?.body).toBeUndefined()
  })

  it('requests a password reset through the backend auth route', async () => {
    mockFetch({
      delivery: 'server-log',
      message: 'If that account exists, CoolDev has written a password reset link to the server log.',
    })

    const { requestPasswordReset } = await import('./api')
    await requestPasswordReset('sulaiman@example.com')

    const [url, init] = (fetch as ReturnType<typeof vi.spyOn>).mock.calls[0] as [string, RequestInit]
    expect(url).toBe('/api/auth/password-reset/request')
    expect(init?.method).toBe('POST')
    expect(init?.body).toBe(JSON.stringify({ email: 'sulaiman@example.com' }))
  })

  it('confirms a password reset through the backend auth route', async () => {
    mockFetch({
      user: { id: 'owner-1', name: 'Sulaiman', email: 'sulaiman@example.com', role: 'owner' },
    })

    const { confirmPasswordReset } = await import('./api')
    await confirmPasswordReset({
      confirmPassword: 'newpassword123',
      password: 'newpassword123',
      resetToken: 'reset-token',
    })

    const [url, init] = (fetch as ReturnType<typeof vi.spyOn>).mock.calls[0] as [string, RequestInit]
    expect(url).toBe('/api/auth/password-reset/confirm')
    expect(init?.method).toBe('POST')
  })

  it('loads the access-status summary from the CoolDev backend', async () => {
    mockFetch({
      bootstrapUrl: 'http://203.0.113.10:8080',
      currentDomain: 'https://cooldev.example.com',
      detail: 'HTTPS is active.',
      dnsPointsToServer: true,
      httpsReady: true,
      preferredUrl: 'https://cooldev.example.com',
      proxyProvider: 'traefik',
      secureUrl: 'https://cooldev.example.com',
      sslStatus: 'ready',
      status: 'live',
      summary: 'Automatic 80/443 cutover is live.',
    })

    const { getAccessStatus } = await import('./api')
    const result = await getAccessStatus()

    expect(result.status).toBe('live')

    const [url] = (fetch as ReturnType<typeof vi.spyOn>).mock.calls[0] as [string]
    expect(url).toBe('/api/admin/access')
  })

  it('loads platform setup status from the CoolDev backend', async () => {
    mockFetch({ configured: true, platformBaseUrl: 'http://coolify.test' })

    const result = await getPlatformSetupStatus()

    expect(result).toEqual({
      configured: true,
      platformBaseUrl: 'http://coolify.test',
    })

    const [url] = (fetch as ReturnType<typeof vi.spyOn>).mock.calls[0] as [string]
    expect(url).toBe('/api/admin/platform-config')
  })

  it('saves platform setup through the CoolDev backend', async () => {
    mockFetch({
      platformBaseUrl: 'http://coolify.test',
      platformReady: true,
      platformReachable: true,
      currentUser: { id: 'owner-1', name: 'Sulaiman', email: 'sulaiman@example.com', role: 'owner' },
      hasOwner: true,
      serverCount: 1,
    })

    await savePlatformSetup({
      platformBaseUrl: 'http://coolify.test',
      apiToken: 'test-token',
    })

    const [url, init] = (fetch as ReturnType<typeof vi.spyOn>).mock.calls[0] as [string, RequestInit]
    expect(url).toBe('/api/admin/platform-config')
    expect(init?.method).toBe('POST')
    expect(init?.body).toBe(JSON.stringify({
      platformBaseUrl: 'http://coolify.test',
      apiToken: 'test-token',
    }))
  })

  it('checkHealth normalizes plain-text OK responses from real production backends', async () => {
    mockTextFetch('OK')

    const result = await checkHealth()

    expect(result).toEqual({ status: 'ok' })
  })

  it('gets the current authenticated team from the team route', async () => {
    mockFetch({ id: 7, name: 'Acme Team' })

    const result = await getCurrentTeam()

    expect(result).toMatchObject({ id: 7, name: 'Acme Team' })
    const [url] = (fetch as ReturnType<typeof vi.spyOn>).mock.calls[0] as [string]
    expect(url).toContain('/teams/current')
  })

  it('gets current team members from the nested team members route', async () => {
    mockFetch([{ id: 1, name: 'Sulaiman' }])

    const result = await getCurrentTeamMembers()

    expect(result).toHaveLength(1)
    expect(result[0]).toMatchObject({ id: 1, name: 'Sulaiman' })
    const [url] = (fetch as ReturnType<typeof vi.spyOn>).mock.calls[0] as [string]
    expect(url).toContain('/teams/current/members')
  })

  it('gets instance settings from the instance settings route', async () => {
    mockFetch({
      instance_name: 'CoolDev',
      public_url: 'https://cooldev.example.com',
    })

    const result = await getInstanceSettings()

    expect(result).toMatchObject({
      instance_name: 'CoolDev',
      public_url: 'https://cooldev.example.com',
    })
    const [url] = (fetch as ReturnType<typeof vi.spyOn>).mock.calls[0] as [string]
    expect(url).toContain('/settings/instance')
  })

  it('updates instance settings through the instance settings route', async () => {
    mockFetch({ public_url: 'https://next.example.com' })

    await updateInstanceSettings({
      public_url: 'https://next.example.com',
      force_domain_override: true,
    })

    const [url, init] = (fetch as ReturnType<typeof vi.spyOn>).mock.calls[0] as [string, RequestInit]
    expect(url).toContain('/settings/instance')
    expect(init?.method).toBe('PATCH')

    const body = JSON.parse(String(init?.body)) as {
      public_url: string
      force_domain_override: boolean
    }
    expect(body).toEqual({
      public_url: 'https://next.example.com',
      force_domain_override: true,
    })
  })

  it('gets the current profile from the profile route', async () => {
    mockFetch({
      id: 1,
      name: 'Sulaiman',
      email: 'sulaiman@example.com',
      two_factor_enabled: false,
      two_factor_pending: false,
    })

    const result = await getCurrentProfile()

    expect(result).toMatchObject({
      email: 'sulaiman@example.com',
      two_factor_enabled: false,
    })
    const [url] = (fetch as ReturnType<typeof vi.spyOn>).mock.calls[0] as [string]
    expect(url).toContain('/profile')
  })

  it('enables two factor without sending a body', async () => {
    mockFetch({
      profile: {
        id: 1,
        name: 'Sulaiman',
        email: 'sulaiman@example.com',
        two_factor_enabled: false,
        two_factor_pending: true,
      },
      qr_code_svg: '<svg></svg>',
      recovery_codes: ['code-1'],
      two_factor_pending: true,
    })

    const result = await enableTwoFactorAuthentication()

    expect(result.two_factor_pending).toBe(true)
    const [url, init] = (fetch as ReturnType<typeof vi.spyOn>).mock.calls[0] as [string, RequestInit]
    expect(url).toContain('/profile/two-factor')
    expect(init?.method).toBe('POST')
    expect(init?.body).toBeUndefined()
  })

  it('confirms two factor with the submitted code', async () => {
    mockFetch({
      id: 1,
      name: 'Sulaiman',
      email: 'sulaiman@example.com',
      two_factor_enabled: true,
      two_factor_pending: false,
    })

    await confirmTwoFactorAuthentication('123456')

    const [url, init] = (fetch as ReturnType<typeof vi.spyOn>).mock.calls[0] as [string, RequestInit]
    expect(url).toContain('/profile/two-factor/confirm')
    expect(init?.method).toBe('POST')

    const body = JSON.parse(String(init?.body)) as { code: string }
    expect(body).toEqual({ code: '123456' })
  })

  it('disables two factor through the profile route', async () => {
    mockFetch({
      id: 1,
      name: 'Sulaiman',
      email: 'sulaiman@example.com',
      two_factor_enabled: false,
      two_factor_pending: false,
    })

    await disableTwoFactorAuthentication()

    const [url, init] = (fetch as ReturnType<typeof vi.spyOn>).mock.calls[0] as [string, RequestInit]
    expect(url).toContain('/profile/two-factor')
    expect(init?.method).toBe('DELETE')
  })

  it('listServers returns parsed array', async () => {
    const servers = [{ uuid: 'abc', name: 'main', ip: '1.2.3.4', port: 22, user: 'root' }]
    mockFetch(servers)

    const result = await listServers()
    expect(result).toHaveLength(1)
    expect(result[0].uuid).toBe('abc')
  })

  it('lists private keys from the security route', async () => {
    mockFetch([{ uuid: 'key-1', name: 'Server key', is_git_related: false }])

    const result = await listPrivateKeys()

    expect(result[0].uuid).toBe('key-1')
    const [url] = (fetch as ReturnType<typeof vi.spyOn>).mock.calls[0] as [string]
    expect(url).toContain('/security/keys')
  })

  it('lists GitHub apps from the provider route', async () => {
    mockFetch([{ uuid: 'gh-1', name: 'Acme GitHub App' }])

    const result = await listGithubApps()

    expect(result[0].uuid).toBe('gh-1')
    const [url] = (fetch as ReturnType<typeof vi.spyOn>).mock.calls[0] as [string]
    expect(url).toContain('/github-apps')
  })

  it('creates a private key on the security route', async () => {
    mockFetch({ uuid: 'key-1' }, 201)

    const result = await createPrivateKey({
      name: 'Server key',
      description: 'Created by CoolDev',
      private_key: 'mock-private-key-content',
    })

    expect(result.uuid).toBe('key-1')
    const [url, init] = (fetch as ReturnType<typeof vi.spyOn>).mock.calls[0] as [string, RequestInit]
    expect(url).toContain('/security/keys')
    expect(init?.method).toBe('POST')

    const body = JSON.parse(String(init?.body)) as { private_key: string }
    expect(body.private_key).toBe('mock-private-key-content')
  })

  it('creates a server with a private key uuid', async () => {
    mockFetch({ uuid: 'server-1' }, 201)

    const result = await createServer({
      name: 'primary-vps',
      ip: '203.0.113.10',
      port: 22,
      user: 'root',
      private_key_uuid: 'key-1',
    })

    expect(result.uuid).toBe('server-1')
    const [url, init] = (fetch as ReturnType<typeof vi.spyOn>).mock.calls[0] as [string, RequestInit]
    expect(url).toContain('/servers')
    expect(init?.method).toBe('POST')

    const body = JSON.parse(String(init?.body)) as { private_key_uuid: string }
    expect(body.private_key_uuid).toBe('key-1')
  })

  it('listDeployments appends skip/take query params', async () => {
    mockFetch([])

    await listDeployments({ skip: 10, take: 20 })

    const [url] = (fetch as ReturnType<typeof vi.spyOn>).mock.calls[0] as [string]
    expect(url).toContain('skip=10')
    expect(url).toContain('take=20')
  })

  it('listDeployments flattens structured platform log batches into readable text', async () => {
    mockFetch([
      {
        deployment_uuid: 'queue-1',
        status: 'in_progress',
        logs: JSON.stringify([
          {
            command: null,
            output: 'Preparing container with helper image.',
            hidden: false,
          },
          {
            command: 'docker run helper',
            output: "Unable to find image 'ghcr.io/coollabsio/coolify-helper:1.0.13' locally",
            hidden: true,
          },
        ]),
      },
    ])

    const result = await listDeployments()

    expect(result[0].logs).toBe([
      'Preparing container with helper image.',
      "Unable to find image 'ghcr.io/coollabsio/coolify-helper:1.0.13' locally",
    ].join('\n'))
  })

  it('getApplicationDeployments returns the paged deployment payload', async () => {
    mockFetch({
      count: 1,
      deployments: [
        {
          deployment_uuid: 'dep-1',
          application_id: 'app-1',
          status: 'finished',
          commit: 'abc123',
        },
      ],
    })

    const result = await getApplicationDeployments('app-uuid')

    expect(result.count).toBe(1)
    expect(result.deployments).toHaveLength(1)
    expect(result.deployments[0].deployment_uuid).toBe('dep-1')

    const [url] = (fetch as ReturnType<typeof vi.spyOn>).mock.calls[0] as [string]
    expect(url).toContain('/deployments/applications/app-uuid')
  })

  it('lists project environments from the project route', async () => {
    mockFetch([{ uuid: 'env-1', name: 'production' }])

    const result = await listProjectEnvironments('project-1')

    expect(result[0].uuid).toBe('env-1')
    const [url] = (fetch as ReturnType<typeof vi.spyOn>).mock.calls[0] as [string]
    expect(url).toContain('/projects/project-1/environments')
  })

  it('creates a project environment on the nested project route', async () => {
    mockFetch({ uuid: 'env-1' }, 201)

    const result = await createProjectEnvironment('project-1', { name: 'production' })

    expect(result).toEqual({ uuid: 'env-1', name: 'production' })
    const [url, init] = (fetch as ReturnType<typeof vi.spyOn>).mock.calls[0] as [string, RequestInit]
    expect(url).toContain('/projects/project-1/environments')
    expect(init?.method).toBe('POST')
  })

  it('creates a public application using the dedicated application route', async () => {
    mockFetch({ uuid: 'app-1' }, 201)

    await createPublicApplication({
      project_uuid: 'project-1',
      server_uuid: 'server-1',
      environment_name: 'production',
      git_repository: 'https://github.com/acme/app',
      git_branch: 'main',
      build_pack: 'nixpacks',
      ports_exposes: '80',
      instant_deploy: true,
    })

    const [url, init] = (fetch as ReturnType<typeof vi.spyOn>).mock.calls[0] as [string, RequestInit]
    expect(url).toContain('/applications/public')
    expect(init?.method).toBe('POST')
  })

  it('creates application env vars through the bulk env route', async () => {
    mockFetch([], 201)

    await createApplicationBulkEnvs('app-1', [
      {
        key: 'NODE_ENV',
        value: 'production',
        is_literal: true,
      },
    ])

    const [url, init] = (fetch as ReturnType<typeof vi.spyOn>).mock.calls[0] as [string, RequestInit]
    expect(url).toContain('/applications/app-1/envs/bulk')
    expect(init?.method).toBe('PATCH')

    const body = JSON.parse(String(init?.body)) as { data: Array<{ key: string; value: string }> }
    expect(body.data[0]).toMatchObject({ key: 'NODE_ENV', value: 'production' })
  })

  it('creates a private GitHub application using the GitHub App route', async () => {
    mockFetch({ uuid: 'app-1' }, 201)

    await createPrivateGithubAppApplication({
      project_uuid: 'project-1',
      server_uuid: 'server-1',
      environment_name: 'production',
      environment_uuid: 'env-1',
      github_app_uuid: 'gh-app-1',
      git_repository: 'https://github.com/acme/private-app',
      git_branch: 'main',
      build_pack: 'nixpacks',
      ports_exposes: '80',
      instant_deploy: true,
    })

    const [url, init] = (fetch as ReturnType<typeof vi.spyOn>).mock.calls[0] as [string, RequestInit]
    expect(url).toContain('/applications/private-github-app')
    expect(init?.method).toBe('POST')
  })

  it('creates a private application using the deploy-key route', async () => {
    mockFetch({ uuid: 'app-1' }, 201)

    await createPrivateDeployKeyApplication({
      project_uuid: 'project-1',
      server_uuid: 'server-1',
      environment_name: 'production',
      environment_uuid: 'env-1',
      private_key_uuid: 'key-1',
      git_repository: 'git@github.com:acme/private-app.git',
      git_branch: 'main',
      build_pack: 'nixpacks',
      ports_exposes: '80',
      instant_deploy: true,
    })

    const [url, init] = (fetch as ReturnType<typeof vi.spyOn>).mock.calls[0] as [string, RequestInit]
    expect(url).toContain('/applications/private-deploy-key')
    expect(init?.method).toBe('POST')
  })

  it('maps managed database creation to the engine-specific route', async () => {
    mockFetch({ uuid: 'db-1' }, 201)

    await createManagedDatabase('postgres', {
      project_uuid: 'project-1',
      server_uuid: 'server-1',
      environment_name: 'production',
      name: 'primary-db',
      instant_deploy: true,
    })

    const [url] = (fetch as ReturnType<typeof vi.spyOn>).mock.calls[0] as [string]
    expect(url).toContain('/databases/postgresql')
  })

  it('creates a scheduled backup on the nested database backup route', async () => {
    mockFetch({ message: 'Backup created.' }, 201)

    await createDatabaseBackup('db-1', {
      frequency: 'daily',
      enabled: true,
      dump_all: true,
      save_s3: false,
    })

    const [url, init] = (fetch as ReturnType<typeof vi.spyOn>).mock.calls[0] as [string, RequestInit]
    expect(url).toContain('/databases/db-1/backups')
    expect(init?.method).toBe('POST')

    const body = JSON.parse(String(init?.body)) as { frequency: string; enabled: boolean }
    expect(body).toMatchObject({ frequency: 'daily', enabled: true })
  })

  it('base64 encodes compose input before creating a compose service', async () => {
    mockFetch({ uuid: 'svc-1' }, 201)

    await createComposeService({
      project_uuid: 'project-1',
      server_uuid: 'server-1',
      environment_name: 'production',
      docker_compose_raw: 'services:\n  app:\n    image: nginx:alpine\n',
      instant_deploy: true,
    })

    const [, init] = (fetch as ReturnType<typeof vi.spyOn>).mock.calls[0] as [string, RequestInit]
    const body = JSON.parse(String(init?.body)) as { docker_compose_raw: string }
    expect(body.docker_compose_raw).toBe('c2VydmljZXM6CiAgYXBwOgogICAgaW1hZ2U6IG5naW54OmFscGluZQo=')
  })

  it('triggerDeploy encodes the uuid in the query string', async () => {
    mockFetch({ message: 'ok', deployments: [] })

    await triggerDeploy('abc-123')

    const [url, init] = (fetch as ReturnType<typeof vi.spyOn>).mock.calls[0] as [string, RequestInit]
    expect(url).toContain('uuid=abc-123')
    expect(init?.method).toBe('POST')
  })

  it('throws ApiError on non-OK response from listServers', async () => {
    mockFetchError(422, 'Unprocessable')

    await expect(listServers()).rejects.toBeInstanceOf(ApiError)
  })

  it('captures structured JSON error payloads on ApiError', async () => {
    mockFetch(
      {
        message: 'Domain conflicts detected. Use force_domain_override=true to proceed.',
        warning: 'Using the same domain for multiple resources can cause routing conflicts and unpredictable behavior.',
        conflicts: [
          {
            domain: 'app.example.com',
            resource_name: 'marketing-site',
            resource_type: 'application',
          },
        ],
      },
      409,
    )

    await expect(
      createPublicApplication({
        project_uuid: 'project-1',
        server_uuid: 'server-1',
        environment_name: 'production',
        git_repository: 'https://github.com/acme/app',
        git_branch: 'main',
        build_pack: 'nixpacks',
        ports_exposes: '80',
        domains: 'app.example.com',
      }),
    ).rejects.toMatchObject({
      status: 409,
      data: {
        warning: 'Using the same domain for multiple resources can cause routing conflicts and unpredictable behavior.',
      },
    })
  })

  it('throws ApiError on non-OK response from checkHealth', async () => {
    mockFetchError(422, 'Unprocessable')

    await expect(checkHealth()).rejects.toMatchObject({ status: 422 })
  })

  it('forwards 401 errors from the platform proxy', async () => {
    localStorage.clear()
    mockFetchError(401, 'Sign in to continue.')

    await expect(listServers()).rejects.toMatchObject({ status: 401 })
  })

  it('does not add Content-Type on bodyless POST', async () => {
    mockFetch({ message: 'ok', deployments: [] })

    await triggerDeploy('xyz')

    const [, init] = (fetch as ReturnType<typeof vi.spyOn>).mock.calls[0] as [string, RequestInit]
    const headers = init?.headers as Record<string, string> | undefined
    // Content-Type should NOT be set for bodyless POSTs
    expect(headers?.['Content-Type']).toBeUndefined()
  })
})
