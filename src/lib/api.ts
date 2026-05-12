/**
 * CoolDev API adapter
 *
 * The product now talks to the CoolDev server over same-origin `/api/*`
 * routes. That server owns sessions, CSRF, rate limiting, password reset,
 * domain cutover automation, and the hidden managed-platform credential.
 *
 * Local config helpers remain in place only for the dev-only mock path and tests.
 */

// ── Config ────────────────────────────────────────────────────────────────────

const CONFIG_STORAGE_KEY = 'cooldev-config'
const ONBOARDING_STORAGE_KEY = 'cooldev-onboarding-complete'
const IGNORE_INJECTED_CONFIG_STORAGE_KEY = 'cooldev-ignore-injected-config'
const MOCK_STATE_STORAGE_KEY = 'cooldev-mock-state'
const CSRF_COOKIE_NAME = 'cooldev_csrf'
const SAFE_METHODS = new Set(['GET', 'HEAD', 'OPTIONS'])

export const MOCK_PLATFORM_BASE_URL = 'mock://platform'
export const MOCK_PLATFORM_API_TOKEN = 'demo-token'

export type PlatformConfig = {
  platformBaseUrl: string
  apiToken: string
}

export type ApiSessionUser = {
  id: string
  name: string
  email: string
  role: 'owner'
}

export type ApiBootstrapSetupStep = {
  detail: string
  id: 'owner-account' | 'managed-services' | 'server-connection' | 'workspace-api'
  label: string
  state: 'complete' | 'active' | 'pending'
}

export type ApiBootstrapSetupProgress = {
  detail: string
  percent: number
  status: 'waiting-for-owner' | 'starting-services' | 'creating-connection' | 'verifying-workspace' | 'ready'
  summary: string
  steps: ApiBootstrapSetupStep[]
}

export type ApiBootstrapState = {
  currentUser: ApiSessionUser | null
  hasOwner: boolean
  platformBaseUrl: string
  platformReachable: boolean | null
  platformReady: boolean
  serverCount: number | null
  setupProgress?: ApiBootstrapSetupProgress
}

export type ApiPlatformSetupStatus = {
  configured: boolean
  platformBaseUrl: string
}

export type ApiDomainConflict = {
  domain: string
  resource_name: string
  resource_uuid?: string | null
  resource_type: 'application' | 'service' | 'instance' | string
  message?: string
}

export type ApiDomainConflictResponse = {
  message?: string
  warning?: string
  conflicts?: ApiDomainConflict[]
}

export type ApiAccessStatus = {
  bootstrapUrl: string
  currentDomain: string | null
  detail: string
  dnsPointsToServer: boolean | null
  httpsReady: boolean | null
  preferredUrl: string
  proxyProvider: 'traefik' | 'caddy' | 'unavailable'
  secureUrl: string | null
  sslStatus: 'inactive' | 'pending' | 'ready' | 'unavailable'
  status: 'bootstrap' | 'pending-dns' | 'provisioning-ssl' | 'live' | 'unavailable'
  summary: string
}

export type ApiPasswordResetRequestResult = {
  delivery: 'email' | 'server-log'
  message: string
}

export class ApiError extends Error {
  public readonly status: number
  public readonly data?: unknown
  public readonly bodyText?: string

  constructor(
    status: number,
    message: string,
    data?: unknown,
    bodyText?: string,
  ) {
    super(message)
    this.name = 'ApiError'
    this.status = status
    this.data = data
    this.bodyText = bodyText
  }
}

function normalizePlatformConfig(input: Partial<PlatformConfig> | null | undefined): PlatformConfig {
  return {
    apiToken: input?.apiToken?.trim() || '',
    platformBaseUrl: (input?.platformBaseUrl?.trim() || '').replace(/\/$/, ''),
  }
}

function readCookie(name: string): string {
  const match = document.cookie
    .split(';')
    .map((chunk) => chunk.trim())
    .find((chunk) => chunk.startsWith(`${name}=`))

  return match ? decodeURIComponent(match.slice(name.length + 1)) : ''
}

function readInjectedConfig(): PlatformConfig | undefined {
  const injected = (window as unknown as {
    __COOLDEV_CONFIG__?: Partial<PlatformConfig>
  }).__COOLDEV_CONFIG__

  if (!injected) {
    return undefined
  }

  return normalizePlatformConfig(injected)
}

export function readConfig(): PlatformConfig {
  const stored = localStorage.getItem(CONFIG_STORAGE_KEY)
  if (stored) {
    try {
      return normalizePlatformConfig(JSON.parse(stored) as Partial<PlatformConfig>)
    } catch {
      // ignore malformed data and continue to injected defaults
    }
  }

  const ignoreInjectedConfig =
    localStorage.getItem(IGNORE_INJECTED_CONFIG_STORAGE_KEY) === 'true'

  if (!ignoreInjectedConfig) {
    const injected = readInjectedConfig()
    if (injected?.platformBaseUrl && injected?.apiToken) return injected
  }

  return { platformBaseUrl: '', apiToken: '' }
}

export function saveConfig(config: PlatformConfig): void {
  localStorage.removeItem(IGNORE_INJECTED_CONFIG_STORAGE_KEY)
  localStorage.setItem(CONFIG_STORAGE_KEY, JSON.stringify(config))
}

export function clearConfig(): void {
  localStorage.removeItem(CONFIG_STORAGE_KEY)
  localStorage.removeItem(ONBOARDING_STORAGE_KEY)
  localStorage.setItem(IGNORE_INJECTED_CONFIG_STORAGE_KEY, 'true')
}

export function isConfigured(): boolean {
  const cfg = readConfig()
  return Boolean(cfg.platformBaseUrl && cfg.apiToken)
}

// ── Core fetch ────────────────────────────────────────────────────────────────

async function apiFetch<T>(
  path: string,
  options: RequestInit = {},
  configOverride?: PlatformConfig,
): Promise<T> {
  if (configOverride) {
    if (import.meta.env.DEV && isMockConfig(configOverride)) {
      return mockApiFetch(path, options)
    }

    return directPlatformFetch(path, options, configOverride)
  }

  const legacyConfig = readConfig()
  if (import.meta.env.DEV && isMockConfig(legacyConfig)) {
    return mockApiFetch(path, options)
  }

  return serverFetch(`/api/platform${path}`, options)
}

async function directPlatformFetch<T>(
  path: string,
  options: RequestInit,
  config: PlatformConfig,
): Promise<T> {
  if (!config.platformBaseUrl || !config.apiToken) {
    throw new ApiError(401, 'CoolDev is still finishing setup. Retry in a moment.')
  }

  const url = `${config.platformBaseUrl.replace(/\/$/, '')}/api/v1${path}`

  return performHttpFetch(url, options, {
    Authorization: `Bearer ${config.apiToken}`,
  })
}

async function serverFetch<T>(
  path: string,
  options: RequestInit = {},
): Promise<T> {
  return performHttpFetch(path, {
    ...options,
    credentials: 'include',
  })
}

async function performHttpFetch<T>(
  url: string,
  options: RequestInit = {},
  requiredHeaders: HeadersInit = {},
): Promise<T> {
  const method = (options.method ?? 'GET').toUpperCase()
  const hasBody = options.body !== undefined
  const contentHeaders: HeadersInit = hasBody ? { 'Content-Type': 'application/json' } : {}
  const csrfHeaders: HeadersInit = SAFE_METHODS.has(method)
    ? {}
    : { 'X-CSRF-Token': readCookie(CSRF_COOKIE_NAME) }

  const response = await fetch(url, {
    ...options,
    headers: {
      Accept: 'application/json',
      ...contentHeaders,
      ...csrfHeaders,
      ...requiredHeaders,
      ...(options.headers ?? {}),
    },
  })

  return decodeResponse<T>(response)
}

async function decodeResponse<T>(response: Response): Promise<T> {
  if (!response.ok) {
    const contentType = response.headers.get('Content-Type') ?? ''
    let bodyText = ''
    let data: unknown

    if (contentType.includes('application/json')) {
      data = await response.json().catch(() => undefined)
      if (typeof data === 'string') {
        bodyText = data
      } else if (data !== undefined) {
        bodyText = JSON.stringify(data)
      }
    } else {
      bodyText = await response.text().catch(() => '')
      if (bodyText) {
        try {
          data = JSON.parse(bodyText) as unknown
        } catch {
          // ignore non-JSON error bodies
        }
      }
    }

    const apiMessage =
      data && typeof data === 'object' && 'message' in data && typeof data.message === 'string'
        ? data.message
        : bodyText || `Request failed with status ${response.status}`

    throw new ApiError(response.status, apiMessage, data, bodyText)
  }

  if (response.status === 204) return undefined as T

  const contentType = response.headers.get('Content-Type') ?? ''
  if (contentType.includes('application/json')) {
    return response.json() as Promise<T>
  }

  const bodyText = await response.text().catch(() => '')
  if (!bodyText) return undefined as T

  try {
    return JSON.parse(bodyText) as T
  } catch {
    return bodyText as T
  }
}

// ── Response types ────────────────────────────────────────────────────────────

export type ApiServer = {
  uuid: string
  name: string
  ip: string
  port: number
  user: string
  description?: string
  is_reachable?: boolean
  is_usable?: boolean
}

export type ApiResource = {
  id: string
  uuid: string
  name: string
  type: 'application' | 'database' | 'service'
  status: string
  fqdn?: string
}

export type ApiApplication = {
  uuid: string
  name: string
  fqdn?: string
  git_repository?: string
  git_branch?: string
  status?: string
  build_pack?: string
}

export type ApiApplicationDetails = ApiApplication & {
  description?: string | null
  domains?: string | null
  git_commit_sha?: string | null
  install_command?: string | null
  build_command?: string | null
  start_command?: string | null
  ports_exposes?: string | null
  ports_mappings?: string | null
  base_directory?: string | null
  publish_directory?: string | null
  health_check_enabled?: boolean
  health_check_path?: string | null
  health_check_port?: string | null
  is_auto_deploy_enabled?: boolean
  is_force_https_enabled?: boolean
}

export type ApiApplicationUpdateData = Partial<Pick<
  ApiApplicationDetails,
  | 'name'
  | 'description'
  | 'domains'
  | 'git_branch'
  | 'install_command'
  | 'build_command'
  | 'start_command'
  | 'ports_exposes'
  | 'base_directory'
  | 'publish_directory'
  | 'health_check_enabled'
  | 'health_check_path'
  | 'health_check_port'
  | 'is_auto_deploy_enabled'
  | 'is_force_https_enabled'
>> & {
  force_domain_override?: boolean
}

export type ApiDatabase = {
  uuid: string
  name: string
  type: string
  status?: string
  internal_db_url?: string
}

export type ApiService = {
  uuid: string
  name: string
  fqdn?: string
  status?: string
}

export type ApiPrivateKey = {
  uuid: string
  name: string
  description?: string
  public_key?: string
  fingerprint?: string
  is_git_related?: boolean
}

export type ApiGithubApp = {
  uuid: string
  name: string
  organization?: string | null
  api_url?: string
  html_url?: string
  installation_id?: number
  is_public?: boolean
  is_system_wide?: boolean
  type?: string
}

export type DeploymentStatus =
  | 'queued'
  | 'in_progress'
  | 'finished'
  | 'failed'
  | 'cancelled'

export type ApiDeployment = {
  id?: number
  uuid?: string
  deployment_uuid?: string
  application_id?: number | string
  application_name?: string
  service_id?: number
  pull_request_id?: number
  server_name?: string
  commit?: string
  commit_message?: string
  status: DeploymentStatus
  logs?: string
  created_at?: string
  finished_at?: string
}

export type ApiApplicationDeployments = {
  count: number
  deployments: ApiDeployment[]
}

function normalizeDeploymentLogs(logs: unknown): string | undefined {
  if (typeof logs !== 'string') {
    return undefined
  }

  const trimmed = logs.trim()
  if (!trimmed.startsWith('[')) {
    return logs
  }

  try {
    const parsed = JSON.parse(trimmed) as unknown
    if (!Array.isArray(parsed)) {
      return logs
    }

    const lines = parsed.flatMap((entry) => {
      if (!entry || typeof entry !== 'object') {
        return typeof entry === 'string' ? [entry] : []
      }

      const command =
        'command' in entry && typeof entry.command === 'string' && entry.hidden !== true
          ? `$ ${entry.command}`
          : ''
      const output = 'output' in entry && typeof entry.output === 'string' ? entry.output : ''

      return [command, output].filter(Boolean)
    })

    return lines.length > 0 ? lines.join('\n') : logs
  } catch {
    return logs
  }
}

function normalizeDeployment(deployment: ApiDeployment): ApiDeployment {
  return {
    ...deployment,
    logs: normalizeDeploymentLogs(deployment.logs) ?? deployment.logs,
  }
}

function normalizeDeploymentCollection(deployments: ApiDeployment[]): ApiDeployment[] {
  return deployments.map(normalizeDeployment)
}

export type ApiProject = {
  uuid: string
  name: string
  description?: string
}

export type ApiEnvironment = {
  uuid: string
  name: string
}

export type ApiTeam = {
  id: number
  name: string
  description?: string | null
  personal_team?: boolean
}

export type ApiTeamMember = {
  id: number
  name?: string
  email?: string
}

export type ApiInstanceSettings = {
  instance_name: string
  public_url?: string | null
  public_ipv4?: string | null
  public_ipv6?: string | null
  instance_timezone?: string | null
  disable_two_step_confirmation?: boolean
  workspace_settings_supported?: boolean
}

export type ApiInstanceSettingsUpdateData = {
  public_url?: string | null
  force_domain_override?: boolean
}

export type ApiCurrentProfile = {
  id: number
  name: string
  email: string
  email_verified_at?: string | null
  two_factor_enabled: boolean
  two_factor_pending: boolean
  two_factor_confirmed_at?: string | null
  two_factor_supported?: boolean
}

export type ApiTwoFactorSetup = {
  profile: ApiCurrentProfile
  qr_code_svg: string
  recovery_codes: string[]
  two_factor_pending: boolean
}

export type ApiCreatedResource = {
  uuid: string
  message?: string
}

export type ApiEnvironmentVariableInput = {
  key: string
  value: string
  is_preview?: boolean
  is_literal?: boolean
  is_multiline?: boolean
  is_shown_once?: boolean
}

export type ApiDatabaseBackupCreateData = {
  frequency: string
  enabled?: boolean
  save_s3?: boolean
  dump_all?: boolean
  backup_now?: boolean
  s3_storage_uuid?: string
  databases_to_backup?: string
  database_backup_retention_amount_locally?: number
  database_backup_retention_days_locally?: number
  database_backup_retention_max_storage_locally?: number
  database_backup_retention_amount_s3?: number
  database_backup_retention_days_s3?: number
  database_backup_retention_max_storage_s3?: number
  timeout?: number
}

type MockApplicationRecord = ApiApplication & {
  server_uuid: string
  project_uuid: string
  environment_name?: string
  environment_uuid?: string
  domains?: string
}

type MockDatabaseRecord = ApiDatabase & {
  server_uuid: string
  project_uuid?: string
  environment_name?: string
  environment_uuid?: string
}

type MockServiceRecord = ApiService & {
  server_uuid: string
  project_uuid?: string
  environment_name?: string
  environment_uuid?: string
  service_type?: string
}

type MockState = {
  nextId: number
  team: ApiTeam
  teamMembers: ApiTeamMember[]
  instanceSettings: ApiInstanceSettings
  profile: ApiCurrentProfile
  servers: ApiServer[]
  privateKeys: ApiPrivateKey[]
  githubApps: ApiGithubApp[]
  projects: ApiProject[]
  environmentsByProject: Record<string, ApiEnvironment[]>
  applications: MockApplicationRecord[]
  databases: MockDatabaseRecord[]
  services: MockServiceRecord[]
  deployments: ApiDeployment[]
  applicationDeployments: Record<string, ApiDeployment[]>
  applicationEnvs: Record<string, ApiEnvironmentVariableInput[]>
  databaseBackups: Record<string, ApiDatabaseBackupCreateData[]>
}

const databaseTypeByEngine: Record<string, string> = {
  postgres: 'postgresql',
  postgresql: 'postgresql',
  mysql: 'mysql',
  mariadb: 'mariadb',
  redis: 'redis',
  mongodb: 'mongodb',
  clickhouse: 'clickhouse',
}

function isMockConfig(config: PlatformConfig): boolean {
  return config.platformBaseUrl.trim().toLowerCase() === MOCK_PLATFORM_BASE_URL
}

function createDefaultMockState(): MockState {
  return {
    nextId: 2,
    team: {
      id: 1,
      name: 'CoolDev Demo Team',
      description: 'Local mock platform for product testing.',
      personal_team: false,
    },
    teamMembers: [
      { id: 1, name: 'Sulaiman Operator', email: 'sulaiman@example.com' },
      { id: 2, name: 'Deploy Bot', email: 'bot@example.com' },
    ],
    instanceSettings: {
      instance_name: 'CoolDev Demo Instance',
      public_url: 'https://demo.cooldev.local',
      public_ipv4: '203.0.113.10',
      public_ipv6: '2001:db8::10',
      instance_timezone: 'UTC',
      disable_two_step_confirmation: false,
    },
    profile: {
      id: 1,
      name: 'Sulaiman Operator',
      email: 'sulaiman@example.com',
      email_verified_at: new Date().toISOString(),
      two_factor_enabled: false,
      two_factor_pending: false,
      two_factor_confirmed_at: null,
    },
    servers: [],
    privateKeys: [
      {
        uuid: 'key-1',
        name: 'Primary server key',
        description: 'Seeded SSH key for local product testing.',
        fingerprint: 'SHA256:cooldev-demo-key',
        is_git_related: false,
      },
    ],
    githubApps: [
      {
        uuid: 'gh-app-1',
        name: 'Acme GitHub App',
        organization: 'Acme',
        html_url: 'https://github.com/apps/acme-cooldev',
        installation_id: 1,
        is_public: false,
        is_system_wide: false,
        type: 'github_app',
      },
    ],
    projects: [
      {
        uuid: 'project-1',
        name: 'CoolDev',
        description: 'Default project created by CoolDev.',
      },
    ],
    environmentsByProject: {
      'project-1': [{ uuid: 'env-1', name: 'production' }],
    },
    applications: [],
    databases: [],
    services: [],
    deployments: [],
    applicationDeployments: {},
    applicationEnvs: {},
    databaseBackups: {},
  }
}

function readMockState(): MockState {
  const stored = localStorage.getItem(MOCK_STATE_STORAGE_KEY)
  if (stored) {
    try {
      return JSON.parse(stored) as MockState
    } catch {
      localStorage.removeItem(MOCK_STATE_STORAGE_KEY)
    }
  }

  const nextState = createDefaultMockState()
  writeMockState(nextState)
  return nextState
}

function writeMockState(state: MockState): void {
  localStorage.setItem(MOCK_STATE_STORAGE_KEY, JSON.stringify(state))
}

function parseRequestBody<T>(options: RequestInit): T {
  if (typeof options.body !== 'string' || options.body.length === 0) {
    return {} as T
  }

  return JSON.parse(options.body) as T
}

function nextMockSequence(state: MockState): number {
  const value = state.nextId
  state.nextId += 1
  return value
}

function nextMockUuid(state: MockState, prefix: string): string {
  return `${prefix}-${nextMockSequence(state)}`
}

function nextMockCommit(state: MockState): string {
  return nextMockSequence(state).toString(16).padStart(7, '0').slice(-7)
}

function slugify(value: string): string {
  return value
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '') || 'resource'
}

function normalizeDomainCandidate(value: string): string {
  const trimmed = value.trim()
  if (!trimmed) {
    return ''
  }

  try {
    const normalized = /^[a-z]+:\/\//i.test(trimmed) ? trimmed : `https://${trimmed}`
    return new URL(normalized).host.toLowerCase()
  } catch {
    return trimmed
      .replace(/^[a-z]+:\/\//i, '')
      .replace(/\/.*$/, '')
      .toLowerCase()
  }
}

function extractDomains(value?: string | null): string[] {
  return (value ?? '')
    .split(/[,\s]+/)
    .map((item) => normalizeDomainCandidate(item))
    .filter(Boolean)
}

function createDomainConflictError(conflicts: ApiDomainConflict[]): ApiError {
  const payload: ApiDomainConflictResponse = {
    message: 'Domain conflicts detected. Use force_domain_override=true to proceed.',
    warning:
      'Using the same domain for multiple resources can cause routing conflicts and unpredictable behavior.',
    conflicts,
  }

  return new ApiError(
    409,
    'Platform API 409: Domain conflicts detected.',
    payload,
    JSON.stringify(payload),
  )
}

function ensureNoDomainConflict(
  state: MockState,
  domains: string[],
  forceDomainOverride = false,
): void {
  if (forceDomainOverride || domains.length === 0) {
    return
  }

  const conflicts: ApiDomainConflict[] = []
  const instanceDomain = normalizeDomainCandidate(state.instanceSettings.public_url ?? '')

  for (const domain of domains) {
    if (instanceDomain && domain === instanceDomain) {
      conflicts.push({
        domain,
        resource_name: state.instanceSettings.instance_name,
        resource_type: 'instance',
        message: `Domain ${domain} is already in use by instance '${state.instanceSettings.instance_name}'`,
      })
    }

    for (const application of state.applications) {
      const applicationDomains = extractDomains(application.domains ?? application.fqdn)
      if (applicationDomains.includes(domain)) {
        conflicts.push({
          domain,
          resource_name: application.name,
          resource_uuid: application.uuid,
          resource_type: 'application',
          message: `Domain ${domain} is already in use by application '${application.name}'`,
        })
      }
    }
  }

  if (conflicts.length > 0) {
    throw createDomainConflictError(conflicts)
  }
}

function getProjectEnvironments(state: MockState, projectUuid: string): ApiEnvironment[] {
  return state.environmentsByProject[projectUuid] ?? []
}

function ensureDeploymentTarget(
  state: MockState,
  data: {
    server_uuid: string
    project_uuid?: string
    environment_uuid?: string
  },
): { serverName: string } {
  const server = state.servers.find((item) => item.uuid === data.server_uuid)
  if (!server) {
    throw new ApiError(422, 'Select a valid server before deploying.')
  }

  if (data.project_uuid && !state.projects.some((item) => item.uuid === data.project_uuid)) {
    throw new ApiError(422, 'Select a valid project before deploying.')
  }

  if (data.project_uuid && data.environment_uuid) {
    const environments = getProjectEnvironments(state, data.project_uuid)
    if (!environments.some((item) => item.uuid === data.environment_uuid)) {
      throw new ApiError(422, 'Select a valid environment before deploying.')
    }
  }

  return { serverName: server.name }
}

function createMockDeploymentRecord(
  state: MockState,
  params: {
    applicationUuid?: string
    applicationName: string
    serverName?: string
    status: DeploymentStatus
    logs: string
  },
): ApiDeployment {
  const sequence = nextMockSequence(state)
  const createdAt = new Date(Date.now() - sequence * 60000).toISOString()

  return {
    uuid: `deployment-${sequence}`,
    deployment_uuid: `deployment-${sequence}`,
    application_id: params.applicationUuid,
    application_name: params.applicationName,
    server_name: params.serverName,
    commit: nextMockCommit(state),
    commit_message:
      params.status === 'finished'
        ? 'Local mock deployment completed successfully.'
        : 'Local mock deployment is in progress.',
    status: params.status,
    logs: params.logs,
    created_at: createdAt,
    finished_at: params.status === 'finished' ? createdAt : undefined,
  }
}

function listAllMockResources(state: MockState): ApiResource[] {
  return [
    ...state.applications.map((application) => ({
      id: application.uuid,
      uuid: application.uuid,
      name: application.name,
      type: 'application' as const,
      status: application.status ?? 'running',
      fqdn: application.fqdn,
    })),
    ...state.databases.map((database) => ({
      id: database.uuid,
      uuid: database.uuid,
      name: database.name,
      type: 'database' as const,
      status: database.status ?? 'running',
    })),
    ...state.services.map((service) => ({
      id: service.uuid,
      uuid: service.uuid,
      name: service.name,
      type: 'service' as const,
      status: service.status ?? 'running',
      fqdn: service.fqdn,
    })),
  ]
}

function createMockApplicationRecord(
  state: MockState,
  data: ApiApplicationCreateData,
): ApiCreatedResource {
  const { serverName } = ensureDeploymentTarget(state, data)
  const domains = extractDomains(data.domains)

  ensureNoDomainConflict(state, domains, Boolean(data.force_domain_override))

  const uuid = nextMockUuid(state, 'app')
  const fqdn = domains[0] ?? `${slugify(data.name ?? 'my-app')}.mock.cooldev.dev`
  const application: MockApplicationRecord = {
    uuid,
    name: data.name?.trim() || 'my-app',
    fqdn,
    git_repository: data.git_repository,
    git_branch: data.git_branch,
    status: 'running',
    build_pack: data.build_pack,
    server_uuid: data.server_uuid,
    project_uuid: data.project_uuid,
    environment_name: data.environment_name,
    environment_uuid: data.environment_uuid,
    domains: data.domains,
  }

  state.applications = [application, ...state.applications]

  const queueDeployment = createMockDeploymentRecord(state, {
    applicationUuid: uuid,
    applicationName: application.name,
    serverName,
    status: 'in_progress',
    logs: 'Cloning repository...\nInstalling dependencies...\nPreparing deployment target...',
  })
  const historyDeployment = createMockDeploymentRecord(state, {
    applicationUuid: uuid,
    applicationName: application.name,
    serverName,
    status: 'finished',
    logs: 'Build completed. Health check passed. Deployment finished successfully.',
  })

  state.deployments = [queueDeployment, ...state.deployments]
  state.applicationDeployments[uuid] = [
    historyDeployment,
    ...(state.applicationDeployments[uuid] ?? []),
  ]

  return { uuid }
}

function createMockDatabaseRecord(
  state: MockState,
  engine: string,
  data: {
    server_uuid: string
    project_uuid?: string
    environment_name?: string
    environment_uuid?: string
    name?: string
  },
): ApiCreatedResource {
  ensureDeploymentTarget(state, data)

  const normalizedEngine = databaseTypeByEngine[engine] ?? engine
  const uuid = nextMockUuid(state, 'db')
  const name = data.name?.trim() || `${engine}-db`

  state.databases = [
    {
      uuid,
      name,
      type: normalizedEngine,
      status: 'running',
      internal_db_url: `${normalizedEngine}://${slugify(name)}:5432`,
      server_uuid: data.server_uuid,
      project_uuid: data.project_uuid,
      environment_name: data.environment_name,
      environment_uuid: data.environment_uuid,
    },
    ...state.databases,
  ]

  state.deployments = [
    createMockDeploymentRecord(state, {
      applicationName: name,
      serverName: state.servers.find((item) => item.uuid === data.server_uuid)?.name,
      status: 'queued',
      logs: `Provisioning ${normalizedEngine} database...`,
    }),
    ...state.deployments,
  ]

  return { uuid }
}

function createMockServiceRecord(
  state: MockState,
  data: {
    server_uuid: string
    project_uuid?: string
    environment_name?: string
    environment_uuid?: string
    name?: string
    type?: string
    docker_compose_raw?: string
  },
): ApiCreatedResource | ApiService {
  ensureDeploymentTarget(state, data)

  const serviceName = data.name?.trim() || data.type?.trim() || 'compose-service'
  const uuid = nextMockUuid(state, 'svc')
  const service: MockServiceRecord = {
    uuid,
    name: serviceName,
    fqdn: undefined,
    status: 'running',
    server_uuid: data.server_uuid,
    project_uuid: data.project_uuid,
    environment_name: data.environment_name,
    environment_uuid: data.environment_uuid,
    service_type: data.type ?? (data.docker_compose_raw ? 'compose' : 'service'),
  }

  state.services = [service, ...state.services]
  state.deployments = [
    createMockDeploymentRecord(state, {
      applicationName: service.name,
      serverName: state.servers.find((item) => item.uuid === data.server_uuid)?.name,
      status: 'queued',
      logs: data.docker_compose_raw
        ? 'Importing Docker Compose stack...'
        : `Provisioning ${service.service_type} service...`,
    }),
    ...state.deployments,
  ]

  return { uuid }
}

async function mockApiFetch<T>(path: string, options: RequestInit = {}): Promise<T> {
  const requestUrl = new URL(path, 'http://cooldev.mock')
  const method = (options.method ?? 'GET').toUpperCase()
  const state = readMockState()

  const commit = <R>(result: R): R => {
    writeMockState(state)
    return result
  }

  if (method === 'GET' && requestUrl.pathname === '/health') {
    return { status: 'ok' } as T
  }

  if (method === 'GET' && requestUrl.pathname === '/version') {
    return { version: 'mock-2026.05' } as T
  }

  if (method === 'GET' && requestUrl.pathname === '/teams/current') {
    return state.team as T
  }

  if (method === 'GET' && requestUrl.pathname === '/teams/current/members') {
    return state.teamMembers as T
  }

  if (requestUrl.pathname === '/settings/instance') {
    if (method === 'GET') {
      return state.instanceSettings as T
    }

    if (method === 'PATCH') {
      const body = parseRequestBody<ApiInstanceSettingsUpdateData>(options)
      const nextPublicUrl = body.public_url?.trim() || null

      ensureNoDomainConflict(
        state,
        nextPublicUrl ? [normalizeDomainCandidate(nextPublicUrl)] : [],
        Boolean(body.force_domain_override),
      )

      state.instanceSettings = {
        ...state.instanceSettings,
        public_url: nextPublicUrl,
      }

      return commit(state.instanceSettings) as T
    }
  }

  if (requestUrl.pathname === '/profile') {
    if (method === 'GET') {
      return state.profile as T
    }
  }

  if (requestUrl.pathname === '/profile/two-factor') {
    if (method === 'POST') {
      state.profile = {
        ...state.profile,
        two_factor_enabled: false,
        two_factor_pending: true,
        two_factor_confirmed_at: null,
      }

      return commit({
        profile: state.profile,
        qr_code_svg:
          '<svg xmlns="http://www.w3.org/2000/svg" width="140" height="140" viewBox="0 0 140 140"><rect width="140" height="140" fill="#f4f4f0"/><rect x="16" y="16" width="36" height="36" fill="#1d2c20"/><rect x="88" y="16" width="36" height="36" fill="#1d2c20"/><rect x="16" y="88" width="36" height="36" fill="#1d2c20"/><path d="M64 24h12v12H64zm0 24h24v12H64zm36 24h12v12h-12zm-36 24h36v12H64z" fill="#1d2c20"/></svg>',
        recovery_codes: ['ABCD-1234', 'EFGH-5678', 'JKLM-9012', 'NOPQ-3456'],
        two_factor_pending: true,
      }) as T
    }

    if (method === 'DELETE') {
      state.profile = {
        ...state.profile,
        two_factor_enabled: false,
        two_factor_pending: false,
        two_factor_confirmed_at: null,
      }

      return commit(state.profile) as T
    }
  }

  if (method === 'POST' && requestUrl.pathname === '/profile/two-factor/confirm') {
    const body = parseRequestBody<{ code?: string }>(options)

    if (!/^\d{6}$/.test(body.code?.trim() ?? '')) {
      throw new ApiError(422, 'Enter a valid 6-digit code to confirm two-factor authentication.')
    }

    state.profile = {
      ...state.profile,
      two_factor_enabled: true,
      two_factor_pending: false,
      two_factor_confirmed_at: new Date().toISOString(),
    }

    return commit(state.profile) as T
  }

  if (method === 'GET' && requestUrl.pathname === '/servers') {
    return state.servers as T
  }

  if (method === 'GET' && requestUrl.pathname === '/security/keys') {
    return state.privateKeys as T
  }

  if (method === 'GET' && requestUrl.pathname === '/github-apps') {
    return state.githubApps as T
  }

  const privateKeyDeleteMatch = requestUrl.pathname.match(/^\/security\/keys\/([^/]+)$/)
  if (method === 'DELETE' && privateKeyDeleteMatch) {
    const keyUuid = privateKeyDeleteMatch[1]
    state.privateKeys = state.privateKeys.filter((item) => item.uuid !== keyUuid)
    return commit(undefined as T)
  }

  if (method === 'POST' && requestUrl.pathname === '/security/keys') {
    const body = parseRequestBody<{ name?: string; description?: string; private_key: string }>(options)
    if (!body.private_key?.trim()) {
      throw new ApiError(422, 'Paste a private key before creating a new SSH key.')
    }

    const key = {
      uuid: nextMockUuid(state, 'key'),
      name: body.name?.trim() || 'Imported SSH key',
      description: body.description?.trim() || undefined,
      fingerprint: `SHA256:${slugify(body.name?.trim() || 'imported-key')}`,
      is_git_related: false,
    }

    state.privateKeys = [key, ...state.privateKeys]
    return commit({ uuid: key.uuid }) as T
  }

  if (method === 'POST' && requestUrl.pathname === '/servers') {
    const body = parseRequestBody<{
      name: string
      ip: string
      port?: number
      user?: string
      description?: string
      private_key_uuid: string
    }>(options)

    if (!state.privateKeys.some((item) => item.uuid === body.private_key_uuid)) {
      throw new ApiError(422, 'Select an existing SSH key before creating a server.')
    }

    const server = {
      uuid: nextMockUuid(state, 'server'),
      name: body.name?.trim() || 'primary-vps',
      ip: body.ip?.trim() || '203.0.113.10',
      port: body.port ?? 22,
      user: body.user?.trim() || 'root',
      description: body.description?.trim() || undefined,
      is_reachable: true,
      is_usable: true,
    }

    state.servers = [server, ...state.servers]
    return commit({ uuid: server.uuid }) as T
  }

  const serverValidateMatch = requestUrl.pathname.match(/^\/servers\/([^/]+)\/validate$/)
  if (method === 'GET' && serverValidateMatch) {
    const serverUuid = serverValidateMatch[1]
    if (!state.servers.some((item) => item.uuid === serverUuid)) {
      throw new ApiError(404, `Mock server ${serverUuid} was not found.`)
    }

    return { message: 'Server validated' } as T
  }

  const serverResourcesMatch = requestUrl.pathname.match(/^\/servers\/([^/]+)\/resources$/)
  if (method === 'GET' && serverResourcesMatch) {
    const serverUuid = serverResourcesMatch[1]
    return listAllMockResources(state).filter((resource) => {
      const application = state.applications.find((item) => item.uuid === resource.uuid)
      const database = state.databases.find((item) => item.uuid === resource.uuid)
      const service = state.services.find((item) => item.uuid === resource.uuid)
      return application?.server_uuid === serverUuid || database?.server_uuid === serverUuid || service?.server_uuid === serverUuid
    }) as T
  }

  if (method === 'GET' && requestUrl.pathname === '/resources') {
    return listAllMockResources(state) as T
  }

  if (method === 'GET' && requestUrl.pathname === '/applications') {
    return state.applications as T
  }

  const applicationMatch = requestUrl.pathname.match(/^\/applications\/([^/]+)$/)
  if (applicationMatch && method === 'GET') {
    const application = state.applications.find((item) => item.uuid === applicationMatch[1])
    if (!application) {
      throw new ApiError(404, `Mock application ${applicationMatch[1]} was not found.`)
    }

    return application as T
  }

  if (applicationMatch && method === 'DELETE') {
    state.applications = state.applications.filter((item) => item.uuid !== applicationMatch[1])
    delete state.applicationDeployments[applicationMatch[1]]
    delete state.applicationEnvs[applicationMatch[1]]
    state.deployments = state.deployments.filter((item) => item.application_id !== applicationMatch[1])
    return commit(undefined as T)
  }

  const applicationEnvsGetMatch = requestUrl.pathname.match(/^\/applications\/([^/]+)\/envs$/)
  if (method === 'GET' && applicationEnvsGetMatch) {
    return (state.applicationEnvs[applicationEnvsGetMatch[1]] ?? []) as T
  }

  if (method === 'POST' && requestUrl.pathname === '/applications') {
    const body = parseRequestBody<ApiApplicationCreateData>(options)
    const application = createMockApplicationRecord(state, body)
    return commit({
      ...state.applications.find((item) => item.uuid === application.uuid),
    }) as T
  }

  if (method === 'POST' && requestUrl.pathname === '/applications/public') {
    const body = parseRequestBody<ApiApplicationCreateData>(options)
    return commit(createMockApplicationRecord(state, body)) as T
  }

  if (method === 'POST' && requestUrl.pathname === '/applications/private-github-app') {
    const body = parseRequestBody<ApiApplicationCreateData & { github_app_uuid: string }>(options)
    if (!state.githubApps.some((item) => item.uuid === body.github_app_uuid)) {
      throw new ApiError(422, 'Choose a connected GitHub App before deploying a private repository.')
    }

    return commit(createMockApplicationRecord(state, body)) as T
  }

  if (method === 'POST' && requestUrl.pathname === '/applications/private-deploy-key') {
    const body = parseRequestBody<ApiApplicationCreateData & { private_key_uuid: string }>(options)
    if (!state.privateKeys.some((item) => item.uuid === body.private_key_uuid)) {
      throw new ApiError(422, 'Choose a saved deploy key before deploying a private repository.')
    }

    return commit(createMockApplicationRecord(state, body)) as T
  }

  const applicationEnvsMatch = requestUrl.pathname.match(/^\/applications\/([^/]+)\/envs\/bulk$/)
  if (method === 'PATCH' && applicationEnvsMatch) {
    const body = parseRequestBody<{ data?: ApiEnvironmentVariableInput[] }>(options)
    state.applicationEnvs[applicationEnvsMatch[1]] = body.data ?? []
    return commit(undefined as T)
  }

  if (method === 'GET' && requestUrl.pathname === '/databases') {
    return state.databases as T
  }

  if (method === 'POST' && requestUrl.pathname === '/databases') {
    const body = parseRequestBody<{
      name: string
      type: string
      server_uuid: string
      project_uuid?: string
      environment_name?: string
      environment_uuid?: string
    }>(options)

    const created = createMockDatabaseRecord(state, body.type, body)
    const database = state.databases.find((item) => item.uuid === created.uuid)
    return commit(database as T)
  }

  const databaseDeleteMatch = requestUrl.pathname.match(/^\/databases\/([^/]+)$/)
  if (method === 'DELETE' && databaseDeleteMatch) {
    const databaseUuid = databaseDeleteMatch[1]
    state.databases = state.databases.filter((item) => item.uuid !== databaseUuid)
    delete state.databaseBackups[databaseUuid]
    state.deployments = state.deployments.filter(
      (item) => item.application_id !== databaseUuid && item.application_name !==
        (state.databases.find((d) => d.uuid === databaseUuid)?.name ?? '__none__'),
    )
    return commit(undefined as T)
  }

  const databaseBackupMatch = requestUrl.pathname.match(/^\/databases\/([^/]+)\/backups$/)
  if (method === 'POST' && databaseBackupMatch) {
    const body = parseRequestBody<ApiDatabaseBackupCreateData>(options)
    const databaseUuid = databaseBackupMatch[1]

    state.databaseBackups[databaseUuid] = [
      body,
      ...(state.databaseBackups[databaseUuid] ?? []),
    ]

    return commit({ message: 'Backup created.' }) as T
  }

  const managedDatabaseMatch = requestUrl.pathname.match(/^\/databases\/([^/]+)$/)
  if (method === 'POST' && managedDatabaseMatch) {
    const body = parseRequestBody<{
      server_uuid: string
      project_uuid?: string
      environment_name?: string
      environment_uuid?: string
      name?: string
    }>(options)
    return commit(createMockDatabaseRecord(state, managedDatabaseMatch[1], body)) as T
  }

  if (method === 'GET' && requestUrl.pathname === '/services') {
    return state.services as T
  }

  const serviceDeleteMatch = requestUrl.pathname.match(/^\/services\/([^/]+)$/)
  if (method === 'DELETE' && serviceDeleteMatch) {
    const serviceUuid = serviceDeleteMatch[1]
    state.services = state.services.filter((item) => item.uuid !== serviceUuid)
    return commit(undefined as T)
  }

  if (method === 'POST' && requestUrl.pathname === '/services') {
    const body = parseRequestBody<{
      name?: string
      type?: string
      project_uuid?: string
      server_uuid: string
      environment_name?: string
      environment_uuid?: string
      docker_compose_raw?: string
    }>(options)

    const created = createMockServiceRecord(state, body)
    if ('uuid' in created && !body.type && !body.docker_compose_raw) {
      const service = state.services.find((item) => item.uuid === created.uuid)
      return commit(service as T)
    }

    return commit(created as T)
  }

  if (method === 'GET' && requestUrl.pathname === '/deployments') {
    const skip = Number(requestUrl.searchParams.get('skip') ?? '0')
    const take = Number(requestUrl.searchParams.get('take') ?? String(state.deployments.length || 50))
    return state.deployments.slice(skip, skip + take) as T
  }

  const applicationDeploymentsMatch = requestUrl.pathname.match(/^\/deployments\/applications\/([^/]+)$/)
  if (method === 'GET' && applicationDeploymentsMatch) {
    const deployments = state.applicationDeployments[applicationDeploymentsMatch[1]] ?? []
    return {
      count: deployments.length,
      deployments,
    } as T
  }

  const deploymentMatch = requestUrl.pathname.match(/^\/deployments\/([^/]+)$/)
  if (method === 'GET' && deploymentMatch) {
    const deployment = [
      ...state.deployments,
      ...Object.values(state.applicationDeployments).flat(),
    ].find((item) => item.deployment_uuid === deploymentMatch[1] || item.uuid === deploymentMatch[1])

    if (!deployment) {
      throw new ApiError(404, `Mock deployment ${deploymentMatch[1]} was not found.`)
    }

    return deployment as T
  }

  const cancelDeploymentMatch = requestUrl.pathname.match(/^\/deployments\/([^/]+)\/cancel$/)
  if (method === 'POST' && cancelDeploymentMatch) {
    const deploymentUuid = cancelDeploymentMatch[1]
    state.deployments = state.deployments.map((item) =>
      item.deployment_uuid === deploymentUuid || item.uuid === deploymentUuid
        ? {
            ...item,
            status: 'cancelled',
            logs: `${item.logs ?? ''}\nDeployment cancelled from the local mock platform.`.trim(),
          }
        : item,
    )

    return commit({ message: 'Deployment cancelled.' }) as T
  }

  if (method === 'POST' && requestUrl.pathname === '/deploy') {
    const resourceUuid = requestUrl.searchParams.get('uuid')
    if (!resourceUuid) {
      throw new ApiError(422, 'Select a resource before triggering a deployment.')
    }

    const application = state.applications.find((item) => item.uuid === resourceUuid)
    const service = state.services.find((item) => item.uuid === resourceUuid)
    const database = state.databases.find((item) => item.uuid === resourceUuid)
    const resourceName = application?.name ?? service?.name ?? database?.name ?? 'Resource deployment'
    const serverName = application
      ? state.servers.find((item) => item.uuid === application.server_uuid)?.name
      : service
        ? state.servers.find((item) => item.uuid === service.server_uuid)?.name
        : database
          ? state.servers.find((item) => item.uuid === database.server_uuid)?.name
          : undefined

    const queueDeployment = createMockDeploymentRecord(state, {
      applicationUuid: application?.uuid,
      applicationName: resourceName,
      serverName,
      status: 'queued',
      logs: 'Redeploy queued from the local mock platform.',
    })
    state.deployments = [queueDeployment, ...state.deployments]

    if (application) {
      const historyDeployment = createMockDeploymentRecord(state, {
        applicationUuid: application.uuid,
        applicationName: application.name,
        serverName,
        status: 'finished',
        logs: 'Redeploy completed successfully.',
      })
      state.applicationDeployments[application.uuid] = [
        historyDeployment,
        ...(state.applicationDeployments[application.uuid] ?? []),
      ]
    }

    return commit({
      message: 'Deployment triggered.',
      deployments: [{ uuid: queueDeployment.deployment_uuid ?? queueDeployment.uuid ?? 'deployment' }],
    }) as T
  }

  if (method === 'GET' && requestUrl.pathname === '/projects') {
    return state.projects as T
  }

  if (method === 'POST' && requestUrl.pathname === '/projects') {
    const body = parseRequestBody<{ name: string; description?: string }>(options)
    const project = {
      uuid: nextMockUuid(state, 'project'),
      name: body.name?.trim() || 'Untitled project',
      description: body.description?.trim() || undefined,
    }

    state.projects = [project, ...state.projects]
    state.environmentsByProject[project.uuid] = []
    return commit(project) as T
  }

  const projectEnvironmentsMatch = requestUrl.pathname.match(/^\/projects\/([^/]+)\/environments$/)
  if (projectEnvironmentsMatch) {
    const projectUuid = projectEnvironmentsMatch[1]

    if (method === 'GET') {
      return getProjectEnvironments(state, projectUuid) as T
    }

    if (method === 'POST') {
      const body = parseRequestBody<{ name: string }>(options)
      const environment = {
        uuid: nextMockUuid(state, 'env'),
        name: body.name?.trim() || 'production',
      }

      state.environmentsByProject[projectUuid] = [
        environment,
        ...getProjectEnvironments(state, projectUuid),
      ]

      return commit({ uuid: environment.uuid }) as T
    }
  }

  throw new ApiError(404, `Mock platform does not implement ${method} ${requestUrl.pathname}.`)
}

// ── CoolDev server session and bootstrap ─────────────────────────────────────

export async function getBootstrapState(): Promise<ApiBootstrapState> {
  return serverFetch('/api/bootstrap')
}

export async function registerOwner(data: {
  confirmPassword: string
  email: string
  name: string
  password: string
}): Promise<{ user: ApiSessionUser }> {
  return serverFetch('/api/auth/register', {
    method: 'POST',
    body: JSON.stringify(data),
  })
}

export async function signIn(data: {
  email: string
  password: string
}): Promise<{ user: ApiSessionUser }> {
  return serverFetch('/api/auth/login', {
    method: 'POST',
    body: JSON.stringify(data),
  })
}

export async function signOut(): Promise<void> {
  return serverFetch('/api/auth/logout', {
    method: 'POST',
  })
}

export async function requestPasswordReset(email: string): Promise<ApiPasswordResetRequestResult> {
  return serverFetch('/api/auth/password-reset/request', {
    method: 'POST',
    body: JSON.stringify({ email }),
  })
}

export async function confirmPasswordReset(data: {
  confirmPassword: string
  password: string
  resetToken: string
}): Promise<{ user: ApiSessionUser }> {
  return serverFetch('/api/auth/password-reset/confirm', {
    method: 'POST',
    body: JSON.stringify(data),
  })
}

export async function getPlatformSetupStatus(): Promise<ApiPlatformSetupStatus> {
  const result = await serverFetch<{
    configured: boolean
    platformBaseUrl?: string
  }>('/api/admin/platform-config')

  return {
    configured: result.configured,
    platformBaseUrl: result.platformBaseUrl ?? '',
  }
}

export async function savePlatformSetup(config: PlatformConfig): Promise<ApiBootstrapState> {
  return serverFetch('/api/admin/platform-config', {
    method: 'POST',
    body: JSON.stringify({
      platformBaseUrl: config.platformBaseUrl,
      apiToken: config.apiToken,
    }),
  })
}

// ── Workspace preferences ──────────────────────────────────────────────────────────────────

export type ApiWorkspacePreferences = {
  autoBackups: boolean
}

export async function getWorkspacePreferences(): Promise<ApiWorkspacePreferences> {
  return serverFetch('/api/admin/preferences')
}

export async function updateWorkspacePreferences(
  data: Partial<ApiWorkspacePreferences>,
): Promise<ApiWorkspacePreferences> {
  return serverFetch('/api/admin/preferences', {
    method: 'PATCH',
    body: JSON.stringify(data),
  })
}

// ── Webhook configuration ──────────────────────────────────────────────────────────────────

export type ApiWebhookConfig = {
  secret: string
  urls: Record<string, string>
}

export async function getWebhookConfig(): Promise<ApiWebhookConfig> {
  return serverFetch('/api/admin/webhook-config')
}

export async function regenerateWebhookSecret(): Promise<ApiWebhookConfig> {
  return serverFetch('/api/admin/webhook-config/regenerate', { method: 'POST' })
}

// ── GitHub App ──────────────────────────────────────────────────────────────────────────────

export type ApiGithubAppStatus =
  | { connected: false }
  | { connected: true; appId: number; appName: string; htmlUrl: string; installationUrl: string }

export type ApiGithubAppManifestSetup = {
  actionUrl: string
  manifest: string
  state: string
}

export async function getGithubAppStatus(): Promise<ApiGithubAppStatus> {
  return serverFetch('/api/admin/github-app/status')
}

export async function initiateGithubAppSetup(): Promise<ApiGithubAppManifestSetup> {
  return serverFetch('/api/admin/github-app/manifest', { method: 'POST' })
}

export async function getAccessStatus(): Promise<ApiAccessStatus> {
  return serverFetch('/api/admin/access')
}

export async function saveWorkspaceDomainAccess(data: {
  forceDomainOverride: boolean
  publicUrl: string | null
}): Promise<{
  accessStatus: ApiAccessStatus
  instanceSettings: ApiInstanceSettings
  workspaceSettingsSynced?: boolean
}> {
  return serverFetch('/api/admin/access/domain', {
    method: 'POST',
    body: JSON.stringify(data),
  })
}

// ── Health ────────────────────────────────────────────────────────────────────

export async function checkHealth(
  configOverride?: PlatformConfig,
): Promise<{ status: string }> {
  const result = await apiFetch<{ status: string } | string>('/health', {}, configOverride)

  if (typeof result === 'string') {
    return { status: result.trim().toLowerCase() === 'ok' ? 'ok' : result.trim() }
  }

  return result
}

export async function getVersion(): Promise<{ version: string }> {
  return apiFetch('/version')
}

export async function getCurrentTeam(): Promise<ApiTeam> {
  return apiFetch('/teams/current')
}

export async function getCurrentTeamMembers(): Promise<ApiTeamMember[]> {
  return apiFetch('/teams/current/members')
}

export async function getInstanceSettings(): Promise<ApiInstanceSettings> {
  return apiFetch('/settings/instance')
}

export async function updateInstanceSettings(
  data: ApiInstanceSettingsUpdateData,
): Promise<ApiInstanceSettings> {
  return apiFetch('/settings/instance', {
    method: 'PATCH',
    body: JSON.stringify(data),
  })
}

export async function getCurrentProfile(): Promise<ApiCurrentProfile> {
  return apiFetch('/profile')
}

export async function enableTwoFactorAuthentication(): Promise<ApiTwoFactorSetup> {
  return apiFetch('/profile/two-factor', { method: 'POST' })
}

export async function confirmTwoFactorAuthentication(
  code: string,
): Promise<ApiCurrentProfile> {
  return apiFetch('/profile/two-factor/confirm', {
    method: 'POST',
    body: JSON.stringify({ code }),
  })
}

export async function disableTwoFactorAuthentication(): Promise<ApiCurrentProfile> {
  return apiFetch('/profile/two-factor', { method: 'DELETE' })
}

// ── Servers ───────────────────────────────────────────────────────────────────

export async function listServers(): Promise<ApiServer[]> {
  return apiFetch('/servers')
}

export async function listPrivateKeys(): Promise<ApiPrivateKey[]> {
  return apiFetch('/security/keys')
}

export async function listGithubApps(): Promise<ApiGithubApp[]> {
  return apiFetch('/github-apps')
}

export async function createPrivateKey(data: {
  name?: string
  description?: string
  private_key: string
}): Promise<ApiCreatedResource> {
  return apiFetch('/security/keys', { method: 'POST', body: JSON.stringify(data) })
}

export async function createServer(data: {
  name: string
  ip: string
  port?: number
  user?: string
  description?: string
  private_key_uuid: string
}): Promise<ApiCreatedResource> {
  return apiFetch('/servers', { method: 'POST', body: JSON.stringify(data) })
}

export async function validateServer(uuid: string): Promise<{ message: string }> {
  return apiFetch(`/servers/${uuid}/validate`)
}

export async function getServerResources(uuid: string): Promise<ApiResource[]> {
  return apiFetch(`/servers/${uuid}/resources`)
}

// ── Resources ─────────────────────────────────────────────────────────────────

export async function listResources(): Promise<ApiResource[]> {
  return apiFetch('/resources')
}

// ── Applications ──────────────────────────────────────────────────────────────

export async function listApplications(): Promise<ApiApplication[]> {
  return apiFetch('/applications')
}

export async function getApplication(uuid: string): Promise<ApiApplicationDetails> {
  return apiFetch(`/applications/${uuid}`)
}

export async function updateApplication(
  uuid: string,
  data: ApiApplicationUpdateData,
): Promise<{ uuid: string }> {
  return apiFetch(`/applications/${uuid}`, {
    method: 'PATCH',
    body: JSON.stringify(data),
  })
}

export async function createApplication(
  data: Record<string, unknown>,
): Promise<ApiApplication> {
  return apiFetch('/applications', { method: 'POST', body: JSON.stringify(data) })
}

export async function deleteApplication(uuid: string): Promise<void> {
  return apiFetch(`/applications/${uuid}`, { method: 'DELETE' })
}

export async function getApplicationEnvs(
  applicationUuid: string,
): Promise<ApiEnvironmentVariableInput[]> {
  return apiFetch(`/applications/${applicationUuid}/envs`)
}

// ── Databases ─────────────────────────────────────────────────────────────────

export async function listDatabases(): Promise<ApiDatabase[]> {
  return apiFetch('/databases')
}

export async function createDatabase(data: {
  name: string
  type: string
  server_uuid: string
  project_uuid?: string
  environment_name?: string
}): Promise<ApiDatabase> {
  return apiFetch('/databases', { method: 'POST', body: JSON.stringify(data) })
}

export async function deleteDatabase(uuid: string): Promise<void> {
  return apiFetch(`/databases/${uuid}`, { method: 'DELETE' })
}

// ── Services ──────────────────────────────────────────────────────────────────

export async function listServices(): Promise<ApiService[]> {
  return apiFetch('/services')
}

export async function createService(data: {
  name: string
  type: string
  server_uuid: string
  project_uuid?: string
  environment_name?: string
}): Promise<ApiService> {
  return apiFetch('/services', { method: 'POST', body: JSON.stringify(data) })
}

export async function deleteService(uuid: string): Promise<void> {
  return apiFetch(`/services/${uuid}`, { method: 'DELETE' })
}

export async function deletePrivateKey(uuid: string): Promise<void> {
  return apiFetch(`/security/keys/${uuid}`, { method: 'DELETE' })
}

// ── Deployments ───────────────────────────────────────────────────────────────

export async function listDeployments(params?: {
  skip?: number
  take?: number
}): Promise<ApiDeployment[]> {
  const qs = params ? `?skip=${params.skip ?? 0}&take=${params.take ?? 50}` : ''
  const deployments = await apiFetch<ApiDeployment[]>(`/deployments${qs}`)
  return normalizeDeploymentCollection(deployments)
}

export async function getDeployment(uuid: string): Promise<ApiDeployment> {
  const deployment = await apiFetch<ApiDeployment>(`/deployments/${uuid}`)
  return normalizeDeployment(deployment)
}

export async function getApplicationDeployments(
  applicationUuid: string,
): Promise<ApiApplicationDeployments> {
  const response = await apiFetch<ApiApplicationDeployments>(`/deployments/applications/${applicationUuid}`)

  return {
    ...response,
    deployments: normalizeDeploymentCollection(response.deployments),
  }
}

export async function triggerDeploy(resourceUuid: string): Promise<{
  message: string
  deployments: Array<{ uuid: string }>
}> {
  return apiFetch(`/deploy?uuid=${encodeURIComponent(resourceUuid)}`, { method: 'POST' })
}

export async function cancelDeployment(
  deploymentUuid: string,
): Promise<{ message: string }> {
  return apiFetch(`/deployments/${deploymentUuid}/cancel`, { method: 'POST' })
}

// ── Projects ──────────────────────────────────────────────────────────────────

export async function listProjects(): Promise<ApiProject[]> {
  return apiFetch('/projects')
}

export async function createProject(data: {
  name: string
  description?: string
}): Promise<ApiProject> {
  return apiFetch('/projects', { method: 'POST', body: JSON.stringify(data) })
}

export async function listProjectEnvironments(projectUuid: string): Promise<ApiEnvironment[]> {
  return apiFetch(`/projects/${projectUuid}/environments`)
}

export async function createProjectEnvironment(
  projectUuid: string,
  data: { name: string },
): Promise<ApiEnvironment> {
  const response = await apiFetch<{ uuid: string }>(
    `/projects/${projectUuid}/environments`,
    { method: 'POST', body: JSON.stringify(data) },
  )

  return {
    uuid: response.uuid,
    name: data.name,
  }
}

export type ApiApplicationCreateData = {
  project_uuid: string
  server_uuid: string
  environment_name?: string
  environment_uuid?: string
  git_repository: string
  git_branch: string
  build_pack: 'nixpacks' | 'static' | 'dockerfile' | 'dockercompose'
  ports_exposes: string
  name?: string
  description?: string
  domains?: string
  instant_deploy?: boolean
  force_domain_override?: boolean
  install_command?: string
  build_command?: string
  start_command?: string
  base_directory?: string
  publish_directory?: string
  health_check_enabled?: boolean
  health_check_path?: string
  health_check_port?: string
}

export async function createPublicApplication(data: ApiApplicationCreateData): Promise<ApiCreatedResource> {
  return apiFetch('/applications/public', {
    method: 'POST',
    body: JSON.stringify(data),
  })
}

export async function createPrivateGithubAppApplication(data: ApiApplicationCreateData & {
  github_app_uuid: string
}): Promise<ApiCreatedResource> {
  return apiFetch('/applications/private-github-app', {
    method: 'POST',
    body: JSON.stringify(data),
  })
}

export async function createPrivateDeployKeyApplication(data: ApiApplicationCreateData & {
  private_key_uuid: string
}): Promise<ApiCreatedResource> {
  return apiFetch('/applications/private-deploy-key', {
    method: 'POST',
    body: JSON.stringify(data),
  })
}

const databasePathByEngine: Record<string, string> = {
  postgres: '/databases/postgresql',
  mysql: '/databases/mysql',
  mariadb: '/databases/mariadb',
  redis: '/databases/redis',
  mongodb: '/databases/mongodb',
  clickhouse: '/databases/clickhouse',
}

export async function createManagedDatabase(
  engine: string,
  data: {
    server_uuid: string
    project_uuid: string
    environment_name?: string
    environment_uuid?: string
    name?: string
    description?: string
    instant_deploy?: boolean
  },
): Promise<ApiCreatedResource> {
  const path = databasePathByEngine[engine]
  if (!path) {
    throw new Error(`Unsupported database engine: ${engine}`)
  }

  return apiFetch(path, {
    method: 'POST',
    body: JSON.stringify(data),
  })
}

export async function createDatabaseBackup(
  databaseUuid: string,
  data: ApiDatabaseBackupCreateData,
): Promise<{ message?: string }> {
  return apiFetch(`/databases/${databaseUuid}/backups`, {
    method: 'POST',
    body: JSON.stringify(data),
  })
}

export async function createOneClickService(data: {
  type: string
  name?: string
  description?: string
  project_uuid: string
  server_uuid: string
  environment_name?: string
  environment_uuid?: string
  instant_deploy?: boolean
  force_domain_override?: boolean
}): Promise<ApiCreatedResource> {
  return apiFetch('/services', {
    method: 'POST',
    body: JSON.stringify(data),
  })
}

function encodeBase64(value: string): string {
  const bytes = new TextEncoder().encode(value)
  let binary = ''

  for (const byte of bytes) {
    binary += String.fromCharCode(byte)
  }

  return btoa(binary)
}

export async function createApplicationBulkEnvs(
  applicationUuid: string,
  data: ApiEnvironmentVariableInput[],
): Promise<void> {
  await apiFetch(`/applications/${applicationUuid}/envs/bulk`, {
    method: 'PATCH',
    body: JSON.stringify({ data }),
  })
}

export async function createComposeService(data: {
  name?: string
  description?: string
  project_uuid: string
  server_uuid: string
  environment_name?: string
  environment_uuid?: string
  instant_deploy?: boolean
  force_domain_override?: boolean
  docker_compose_raw: string
}): Promise<ApiCreatedResource> {
  return apiFetch('/services', {
    method: 'POST',
    body: JSON.stringify({
      ...data,
      docker_compose_raw: encodeBase64(data.docker_compose_raw),
    }),
  })
}
