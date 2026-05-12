import { createHash, randomBytes, randomUUID, scryptSync, timingSafeEqual } from 'node:crypto'
import {
  existsSync,
  mkdirSync,
  readFileSync,
  renameSync,
  writeFileSync,
} from 'node:fs'
import path from 'node:path'

export type PlatformConfig = {
  apiToken: string
  platformBaseUrl: string
  updatedAt: string
}

export type ProductConfig = {
  bootstrapUrl: string
  updatedAt: string
}

export type WorkspacePreferences = {
  autoBackups: boolean
  updatedAt: string
}

export type WebhookConfig = {
  generatedAt: string
  secret: string
}

export type GithubAppCredentials = {
  appId: number
  clientId: string
  clientSecret: string
  htmlUrl: string
  name: string
  privateKeyPem: string
  slug: string
  updatedAt: string
  webhookSecret: string
}

export type BootstrapConnectionHints = {
  apiToken: string
  bootstrapUrl: string
  platformBaseUrl: string
}

export type AccessDomainState = {
  expectedIp: string | null
  hostname: string
  proxyProvider: 'traefik' | 'caddy' | 'unavailable'
  publicUrl: string
  updatedAt: string
}

type BootstrapConfigInput = {
  apiToken?: string
  bootstrapUrl?: string
  platformBaseUrl?: string
}

type StoredUser = {
  createdAt: string
  email: string
  id: string
  name: string
  passwordHash: string
  passwordSalt: string
  role: 'owner'
}

type StoredSession = {
  createdAt: string
  expiresAt: string
  id: string
  userId: string
}

type StoredPasswordResetToken = {
  createdAt: string
  expiresAt: string
  id: string
  tokenHash: string
  userId: string
}

type PersistedState = {
  accessDomain: AccessDomainState | null
  githubAppCredentials: GithubAppCredentials | null
  passwordResetTokens: StoredPasswordResetToken[]
  platformConfig: PlatformConfig | null
  productConfig: ProductConfig | null
  sessions: StoredSession[]
  users: StoredUser[]
  webhookConfig: WebhookConfig | null
  workspacePreferences: WorkspacePreferences | null
}

export type PublicUser = {
  email: string
  id: string
  name: string
  role: 'owner'
}

export type CreatedSession = {
  expiresAt: string
  sessionId: string
}

export type CreatedPasswordReset = {
  expiresAt: string
  token: string
  user: PublicUser
}

const SESSION_TTL_MS = 1000 * 60 * 60 * 24 * 30
const PASSWORD_RESET_TTL_MS = Number(process.env.COOLDEV_PASSWORD_RESET_TTL_MINUTES ?? 30) * 60 * 1000

function normalizeEmail(value: string): string {
  return value.trim().toLowerCase()
}

function ensurePasswordHash(password: string, salt = randomBytes(16).toString('hex')) {
  const hash = scryptSync(password, salt, 64).toString('hex')
  return { hash, salt }
}

function verifyPassword(password: string, salt: string, expectedHash: string): boolean {
  const actualHash = scryptSync(password, salt, 64)
  const expectedBuffer = Buffer.from(expectedHash, 'hex')

  if (actualHash.byteLength !== expectedBuffer.byteLength) {
    return false
  }

  return timingSafeEqual(actualHash, expectedBuffer)
}

function hashToken(token: string): string {
  return createHash('sha256').update(token).digest('hex')
}

function toPublicUser(user: StoredUser): PublicUser {
  return {
    email: user.email,
    id: user.id,
    name: user.name,
    role: user.role,
  }
}

function normalizePlatformConfig(
  input: BootstrapConfigInput | PlatformConfig | null | undefined,
): PlatformConfig | null {
  const platformBaseUrl = input?.platformBaseUrl?.trim() || ''
  const apiToken = input?.apiToken?.trim() || ''

  if (!platformBaseUrl || !apiToken) {
    return null
  }

  return {
    apiToken,
    platformBaseUrl: platformBaseUrl.replace(/\/$/, ''),
    updatedAt: new Date().toISOString(),
  }
}

function normalizeProductConfig(input: { bootstrapUrl?: string } | ProductConfig | null | undefined): ProductConfig | null {
  const bootstrapUrl = input?.bootstrapUrl?.trim() || ''

  if (!bootstrapUrl) {
    return null
  }

  return {
    bootstrapUrl: bootstrapUrl.replace(/\/$/, ''),
    updatedAt: new Date().toISOString(),
  }
}

function normalizeAccessDomain(input: AccessDomainState | null | undefined): AccessDomainState | null {
  if (!input?.publicUrl?.trim() || !input.hostname?.trim()) {
    return null
  }

  return {
    expectedIp: input.expectedIp?.trim() || null,
    hostname: input.hostname.trim().toLowerCase(),
    proxyProvider: input.proxyProvider,
    publicUrl: input.publicUrl.trim(),
    updatedAt: input.updatedAt || new Date().toISOString(),
  }
}

function normalizeBootstrapConnectionHints(
  input: BootstrapConfigInput | BootstrapConnectionHints | null | undefined,
): BootstrapConnectionHints {
  return {
    apiToken: input?.apiToken?.trim() || '',
    bootstrapUrl: input?.bootstrapUrl?.trim().replace(/\/$/, '') || '',
    platformBaseUrl: input?.platformBaseUrl?.trim().replace(/\/$/, '') || '',
  }
}

export function readBootstrapConnectionHints(dataDir: string): BootstrapConnectionHints {
  const envHints = normalizeBootstrapConnectionHints({
    apiToken: process.env.COOLDEV_PLATFORM_API_TOKEN?.trim() || process.env.COOLDEV_API_TOKEN?.trim(),
    bootstrapUrl: process.env.COOLDEV_BOOTSTRAP_URL?.trim(),
    platformBaseUrl:
      process.env.COOLDEV_PLATFORM_BASE_URL?.trim()
      || process.env.COOLDEV_MANAGED_SERVICE_URL?.trim(),
  })

  const bootstrapPath = path.join(dataDir, 'cooldev-config.json')
  if (!existsSync(bootstrapPath)) {
    return envHints
  }

  try {
    const raw = readFileSync(bootstrapPath, 'utf8')
    const parsed = normalizeBootstrapConnectionHints(JSON.parse(raw) as BootstrapConfigInput)

    return {
      apiToken: envHints.apiToken || parsed.apiToken,
      bootstrapUrl: envHints.bootstrapUrl || parsed.bootstrapUrl,
      platformBaseUrl: envHints.platformBaseUrl || parsed.platformBaseUrl,
    }
  } catch {
    return envHints
  }
}

function readBootstrapConfig(dataDir: string): {
  platformConfig: PlatformConfig | null
  productConfig: ProductConfig | null
} {
  const hints = readBootstrapConnectionHints(dataDir)

  return {
    platformConfig: normalizePlatformConfig(hints),
    productConfig: normalizeProductConfig(hints),
  }
}

function loadState(dataDir: string, stateFilePath: string): PersistedState {
  const bootstrapConfig = readBootstrapConfig(dataDir)
  const emptyState: PersistedState = {
    accessDomain: null,
    githubAppCredentials: null,
    passwordResetTokens: [],
    platformConfig: bootstrapConfig.platformConfig,
    productConfig: bootstrapConfig.productConfig,
    sessions: [],
    users: [],
    webhookConfig: null,
    workspacePreferences: null,
  }

  if (!existsSync(stateFilePath)) {
    return emptyState
  }

  try {
    const raw = readFileSync(stateFilePath, 'utf8')
    const parsed = JSON.parse(raw) as Partial<PersistedState> & {
      accessDomain?: AccessDomainState | null
      platformConfig?: BootstrapConfigInput | PlatformConfig | null
      productConfig?: ProductConfig | null
    }

    return {
      accessDomain: normalizeAccessDomain(parsed.accessDomain ?? null),
      githubAppCredentials: parsed.githubAppCredentials ?? null,
      passwordResetTokens: Array.isArray(parsed.passwordResetTokens) ? parsed.passwordResetTokens : [],
      platformConfig:
        normalizePlatformConfig(parsed.platformConfig ?? null)
        ?? bootstrapConfig.platformConfig,
      productConfig: normalizeProductConfig(parsed.productConfig ?? null) ?? bootstrapConfig.productConfig,
      sessions: Array.isArray(parsed.sessions) ? parsed.sessions : [],
      users: Array.isArray(parsed.users) ? parsed.users : [],
      webhookConfig: parsed.webhookConfig ?? null,
      workspacePreferences: parsed.workspacePreferences ?? null,
    }
  } catch {
    return emptyState
  }
}

export class CooldevStore {
  private readonly dataDir: string
  private readonly stateFilePath: string
  private state: PersistedState

  constructor(dataDir = process.env.COOLDEV_DATA_DIR || path.resolve(process.cwd(), '.cooldev')) {
    this.dataDir = path.resolve(dataDir)
    this.stateFilePath = path.join(this.dataDir, 'state.json')
    this.state = loadState(this.dataDir, this.stateFilePath)
    this.pruneExpiredSessions()
    this.pruneExpiredPasswordResetTokens()
    this.persist()
  }

  getDataDir(): string {
    return this.dataDir
  }

  hasOwner(): boolean {
    return this.state.users.length > 0
  }

  hasPlatformConfig(): boolean {
    return Boolean(this.state.platformConfig?.platformBaseUrl && this.state.platformConfig.apiToken)
  }

  getPlatformConfig(): PlatformConfig | null {
    return this.state.platformConfig
  }

  setPlatformConfig(config: { apiToken: string; platformBaseUrl: string }): PlatformConfig {
    this.state.platformConfig = {
      apiToken: config.apiToken.trim(),
      platformBaseUrl: config.platformBaseUrl.trim().replace(/\/$/, ''),
      updatedAt: new Date().toISOString(),
    }
    this.persist()
    return this.state.platformConfig
  }

  getProductConfig(): ProductConfig | null {
    return this.state.productConfig
  }

  getBootstrapUrl(): string {
    return this.state.productConfig?.bootstrapUrl ?? ''
  }

  getAccessDomain(): AccessDomainState | null {
    return this.state.accessDomain
  }

  setAccessDomain(input: {
    expectedIp?: string | null
    hostname: string
    proxyProvider: AccessDomainState['proxyProvider']
    publicUrl: string
  }): AccessDomainState {
    this.state.accessDomain = {
      expectedIp: input.expectedIp?.trim() || null,
      hostname: input.hostname.trim().toLowerCase(),
      proxyProvider: input.proxyProvider,
      publicUrl: input.publicUrl.trim(),
      updatedAt: new Date().toISOString(),
    }
    this.persist()
    return this.state.accessDomain
  }

  clearAccessDomain(): void {
    this.state.accessDomain = null
    this.persist()
  }

  createOwner(input: { email: string; name: string; password: string }): PublicUser {
    if (this.hasOwner()) {
      throw new Error('The first owner has already been created.')
    }

    const email = normalizeEmail(input.email)
    if (!email) {
      throw new Error('Enter an email address.')
    }

    if (input.password.length < 8) {
      throw new Error('Use a password with at least 8 characters.')
    }

    const { hash, salt } = ensurePasswordHash(input.password)
    const user: StoredUser = {
      createdAt: new Date().toISOString(),
      email,
      id: randomUUID(),
      name: input.name.trim() || email.split('@')[0],
      passwordHash: hash,
      passwordSalt: salt,
      role: 'owner',
    }

    this.state.users.push(user)
    this.persist()
    return toPublicUser(user)
  }

  authenticate(input: { email: string; password: string }): PublicUser | null {
    const email = normalizeEmail(input.email)
    const user = this.state.users.find((candidate) => candidate.email === email)

    if (!user) {
      return null
    }

    return verifyPassword(input.password, user.passwordSalt, user.passwordHash)
      ? toPublicUser(user)
      : null
  }

  createSession(userId: string): CreatedSession {
    const expiresAt = new Date(Date.now() + SESSION_TTL_MS).toISOString()
    const session: StoredSession = {
      createdAt: new Date().toISOString(),
      expiresAt,
      id: randomUUID(),
      userId,
    }

    this.state.sessions.push(session)
    this.persist()

    return {
      expiresAt,
      sessionId: session.id,
    }
  }

  deleteSession(sessionId: string | null | undefined): void {
    if (!sessionId) {
      return
    }

    const nextSessions = this.state.sessions.filter((session) => session.id !== sessionId)
    if (nextSessions.length === this.state.sessions.length) {
      return
    }

    this.state.sessions = nextSessions
    this.persist()
  }

  getUserBySession(sessionId: string | null | undefined): PublicUser | null {
    if (!sessionId) {
      return null
    }

    this.pruneExpiredSessions()

    const session = this.state.sessions.find((candidate) => candidate.id === sessionId)
    if (!session) {
      return null
    }

    const user = this.state.users.find((candidate) => candidate.id === session.userId)
    return user ? toPublicUser(user) : null
  }

  createPasswordReset(emailAddress: string): CreatedPasswordReset | null {
    const email = normalizeEmail(emailAddress)
    const user = this.state.users.find((candidate) => candidate.email === email)

    if (!user) {
      return null
    }

    const token = randomBytes(32).toString('hex')
    const expiresAt = new Date(Date.now() + PASSWORD_RESET_TTL_MS).toISOString()

    this.state.passwordResetTokens = this.state.passwordResetTokens.filter((item) => item.userId !== user.id)
    this.state.passwordResetTokens.push({
      createdAt: new Date().toISOString(),
      expiresAt,
      id: randomUUID(),
      tokenHash: hashToken(token),
      userId: user.id,
    })
    this.persist()

    return {
      expiresAt,
      token,
      user: toPublicUser(user),
    }
  }

  consumePasswordReset(token: string, nextPassword: string): PublicUser {
    const trimmedToken = token.trim()
    if (!trimmedToken) {
      throw new Error('Reset link is missing or invalid.')
    }

    if (nextPassword.length < 8) {
      throw new Error('Use a password with at least 8 characters.')
    }

    this.pruneExpiredPasswordResetTokens()

    const tokenHash = hashToken(trimmedToken)
    const resetEntry = this.state.passwordResetTokens.find((candidate) => candidate.tokenHash === tokenHash)

    if (!resetEntry) {
      throw new Error('This password reset link is invalid or has expired.')
    }

    const user = this.state.users.find((candidate) => candidate.id === resetEntry.userId)
    if (!user) {
      throw new Error('This password reset link is invalid or has expired.')
    }

    const { hash, salt } = ensurePasswordHash(nextPassword)
    user.passwordHash = hash
    user.passwordSalt = salt

    this.state.passwordResetTokens = this.state.passwordResetTokens.filter((candidate) => candidate.userId !== user.id)
    this.persist()

    return toPublicUser(user)
  }

  getOrCreateWebhookSecret(): string {
    if (this.state.webhookConfig?.secret) {
      return this.state.webhookConfig.secret
    }

    return this.regenerateWebhookSecret()
  }

  regenerateWebhookSecret(): string {
    const secret = randomBytes(32).toString('hex')
    this.state.webhookConfig = { generatedAt: new Date().toISOString(), secret }
    this.persist()
    return secret
  }

  getWorkspacePreferences(): WorkspacePreferences | null {
    return this.state.workspacePreferences
  }

  setWorkspacePreferences(input: { autoBackups: boolean }): WorkspacePreferences {
    this.state.workspacePreferences = {
      autoBackups: Boolean(input.autoBackups),
      updatedAt: new Date().toISOString(),
    }
    this.persist()
    return this.state.workspacePreferences
  }

  getGithubAppCredentials(): GithubAppCredentials | null {
    return this.state.githubAppCredentials
  }

  setGithubAppCredentials(input: Omit<GithubAppCredentials, 'updatedAt'>): GithubAppCredentials {
    this.state.githubAppCredentials = {
      ...input,
      updatedAt: new Date().toISOString(),
    }
    this.persist()
    return this.state.githubAppCredentials
  }

  private pruneExpiredSessions(): void {
    const now = Date.now()
    const nextSessions = this.state.sessions.filter(
      (session) => Date.parse(session.expiresAt) > now,
    )

    if (nextSessions.length !== this.state.sessions.length) {
      this.state.sessions = nextSessions
    }
  }

  private pruneExpiredPasswordResetTokens(): void {
    const now = Date.now()
    const nextTokens = this.state.passwordResetTokens.filter(
      (token) => Date.parse(token.expiresAt) > now,
    )

    if (nextTokens.length !== this.state.passwordResetTokens.length) {
      this.state.passwordResetTokens = nextTokens
    }
  }

  private persist(): void {
    mkdirSync(this.dataDir, { recursive: true })
    const tempFilePath = `${this.stateFilePath}.tmp`
    writeFileSync(tempFilePath, JSON.stringify(this.state, null, 2))
    renameSync(tempFilePath, this.stateFilePath)
  }
}
