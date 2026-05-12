import { useDeferredValue, useEffect, useState } from 'react'
import { AppWindowIcon, ChevronRightIcon, DatabaseIcon, FileCodeIcon, GridIcon, SearchIcon } from '../components/Icons'
import { providerConnections, sampleCompose } from '../data/productDefaults'
import { appTemplates, databaseEngines, serviceTemplates } from '../data/templates'
import {
  ApiError,
  createApplicationBulkEnvs,
  createComposeService,
  createDatabaseBackup,
  createManagedDatabase,
  createOneClickService,
  createPrivateDeployKeyApplication,
  createPrivateGithubAppApplication,
  createPrivateKey,
  createProject,
  createProjectEnvironment,
  createPublicApplication,
  listGithubApps,
  listPrivateKeys,
  listProjectEnvironments,
  listProjects,
  listServers,
  type ApiApplicationCreateData,
  type ApiDomainConflictResponse,
  type ApiEnvironment,
  type ApiGithubApp,
  type ApiPrivateKey,
  type ApiProject,
  type ApiServer,
} from '../lib/api'
import { parseComposeImport } from '../lib/compose'
import { getProviderProfile, guessProviderFromUrl } from '../lib/providerDetection'
import type { ProviderKey, RepositoryVisibility, ResourceType, View } from '../types'

type DeployWizardViewProps = {
  onNavigate: (view: View) => void
}

type PrivateRepoCredentials =
  | { github_app_uuid: string }
  | { private_key_uuid: string }

type AdvancedAppOptions = Pick<ApiApplicationCreateData, 'ports_exposes'> &
  Partial<Pick<
    ApiApplicationCreateData,
    | 'install_command'
    | 'build_command'
    | 'base_directory'
    | 'publish_directory'
    | 'health_check_enabled'
    | 'health_check_path'
  >>

const CREATE_NEW_PROJECT_VALUE = '__create-new-project__'
const CREATE_NEW_ENVIRONMENT_VALUE = '__create-new-environment__'
const AUTO_BACKUP_DATABASE_ENGINES = new Set(['postgres', 'mysql', 'mariadb', 'mongodb'])
const DEFAULT_DATABASE_BACKUP = {
  frequency: 'daily',
  enabled: true,
  dump_all: true,
  save_s3: false,
} as const

function databaseSupportsAutoBackups(engine: string): boolean {
  return AUTO_BACKUP_DATABASE_ENGINES.has(engine)
}

export function DeployWizardView({ onNavigate }: DeployWizardViewProps) {
  const [step, setStep] = useState(0)
  const [resourceType, setResourceType] = useState<ResourceType | null>(null)

  // App-specific state
  const [appMode, setAppMode] = useState<'template' | 'custom'>('template')
  const [templateSearch, setTemplateSearch] = useState('')
  const [selectedAppTemplate, setSelectedAppTemplate] = useState<string | null>(null)

  // Repo state
  const [visibility, setVisibility] = useState<RepositoryVisibility>('public')
  const [repositoryUrl, setRepositoryUrl] = useState('https://github.com/acme/marketing-site')
  const [manualProvider, setManualProvider] = useState<ProviderKey>('generic')
  const [branch, setBranch] = useState('main')

  // Database state
  const [selectedEngine, setSelectedEngine] = useState<string>('postgres')

  // Service state
  const [serviceSearch, setServiceSearch] = useState('')
  const [selectedService, setSelectedService] = useState<string | null>(null)

  // Compose state
  const [composeText, setComposeText] = useState(sampleCompose)

  // Shared config state
  const [resourceName, setResourceName] = useState('')
  const [domain, setDomain] = useState('')
  const [showAdvanced, setShowAdvanced] = useState(false)
  const [appPortsExposes, setAppPortsExposes] = useState('')
  const [appInstallCommand, setAppInstallCommand] = useState('')
  const [appBuildCommand, setAppBuildCommand] = useState('')
  const [appBaseDirectory, setAppBaseDirectory] = useState('')
  const [appPublishDirectory, setAppPublishDirectory] = useState('')
  const [appHealthCheckPath, setAppHealthCheckPath] = useState('')
  const [appEnvironmentVariables, setAppEnvironmentVariables] = useState('')
  const [deploying, setDeploying] = useState(false)
  const [deployError, setDeployError] = useState<string | null>(null)
  const [githubApps, setGithubApps] = useState<ApiGithubApp[]>([])
  const [privateKeys, setPrivateKeys] = useState<ApiPrivateKey[]>([])
  const [providerAssetsLoading, setProviderAssetsLoading] = useState(false)
  const [providerAssetsResolved, setProviderAssetsResolved] = useState(false)
  const [providerAssetsError, setProviderAssetsError] = useState<string | null>(null)
  const [selectedGithubAppUuid, setSelectedGithubAppUuid] = useState('')
  const [selectedPrivateKeyUuid, setSelectedPrivateKeyUuid] = useState('')
  const [privateRepoAuthMode, setPrivateRepoAuthMode] = useState<'github-app' | 'saved-key' | 'paste-key'>('github-app')
  const [newPrivateKeyName, setNewPrivateKeyName] = useState('')
  const [newPrivateKeyValue, setNewPrivateKeyValue] = useState('')
  const [domainConflict, setDomainConflict] = useState<ApiDomainConflictResponse | null>(null)
  const [availableServers, setAvailableServers] = useState<ApiServer[]>([])
  const [availableProjects, setAvailableProjects] = useState<ApiProject[]>([])
  const [availableEnvironments, setAvailableEnvironments] = useState<ApiEnvironment[]>([])
  const [targetLoading, setTargetLoading] = useState(false)
  const [targetError, setTargetError] = useState<string | null>(null)
  const [environmentsLoading, setEnvironmentsLoading] = useState(false)
  const [environmentError, setEnvironmentError] = useState<string | null>(null)
  const [selectedServerUuid, setSelectedServerUuid] = useState('')
  const [selectedProjectUuid, setSelectedProjectUuid] = useState('')
  const [selectedEnvironmentUuid, setSelectedEnvironmentUuid] = useState('')
  const [newProjectName, setNewProjectName] = useState('CoolDev')
  const [newEnvironmentName, setNewEnvironmentName] = useState('production')

  const deferredRepoUrl = useDeferredValue(repositoryUrl)
  const deferredCompose = useDeferredValue(composeText)
  const deferredTemplateSearch = useDeferredValue(templateSearch)
  const deferredServiceSearch = useDeferredValue(serviceSearch)

  const guessedProvider = guessProviderFromUrl(deferredRepoUrl)
  const activeProvider = guessedProvider ?? manualProvider
  const providerProfile = getProviderProfile(
    activeProvider,
    visibility,
    deferredRepoUrl || 'git@example.com:owner/repo.git',
  )
  const composePreview = parseComposeImport(deferredCompose)

  const filteredAppTemplates = appTemplates.filter(
    (t) =>
      t.name.toLowerCase().includes(deferredTemplateSearch.toLowerCase()) ||
      t.tags.some((tag) => tag.toLowerCase().includes(deferredTemplateSearch.toLowerCase())),
  )
  const filteredServices = serviceTemplates.filter(
    (s) =>
      s.name.toLowerCase().includes(deferredServiceSearch.toLowerCase()) ||
      s.tags.some((tag) => tag.toLowerCase().includes(deferredServiceSearch.toLowerCase())),
  )
  const selectedTemplate = selectedAppTemplate
    ? appTemplates.find((template) => template.id === selectedAppTemplate) ?? null
    : null
  const needsPrivateRepoCredentials = resourceType === 'app' && appMode === 'custom' && visibility === 'private'
  const canUseGithubApp = activeProvider === 'github' && githubApps.length > 0
  const canUseSavedPrivateKey = privateKeys.length > 0
  const selectedServer = availableServers.find((server) => server.uuid === selectedServerUuid)
  const selectedProject = availableProjects.find((project) => project.uuid === selectedProjectUuid)
  const selectedEnvironment = availableEnvironments.find(
    (environment) => environment.uuid === selectedEnvironmentUuid,
  )
  const autoBackupsEnabled = localStorage.getItem('cooldev-auto-backups') !== 'false'

  useEffect(() => {
    if (!needsPrivateRepoCredentials) {
      setProviderAssetsError(null)
      setProviderAssetsLoading(false)
      setProviderAssetsResolved(false)
      return
    }

    let cancelled = false

    async function loadProviderAssets() {
      setProviderAssetsLoading(true)
      setProviderAssetsResolved(false)
      setProviderAssetsError(null)

      const [githubAppsResult, privateKeysResult] = await Promise.allSettled([
        listGithubApps(),
        listPrivateKeys(),
      ])

      if (cancelled) {
        return
      }

      const nextErrors: string[] = []

      if (githubAppsResult.status === 'fulfilled') {
        setGithubApps(githubAppsResult.value)
      } else {
        setGithubApps([])
        nextErrors.push(
          `GitHub Apps: ${githubAppsResult.reason instanceof Error ? githubAppsResult.reason.message : String(githubAppsResult.reason)}`,
        )
      }

      if (privateKeysResult.status === 'fulfilled') {
        setPrivateKeys(privateKeysResult.value)
      } else {
        setPrivateKeys([])
        nextErrors.push(
          `SSH keys: ${privateKeysResult.reason instanceof Error ? privateKeysResult.reason.message : String(privateKeysResult.reason)}`,
        )
      }

      setProviderAssetsError(nextErrors.length > 0 ? nextErrors.join(' ') : null)
      setProviderAssetsLoading(false)
      setProviderAssetsResolved(true)
    }

    void loadProviderAssets()

    return () => {
      cancelled = true
    }
  }, [needsPrivateRepoCredentials])

  useEffect(() => {
    const firstGithubApp = githubApps[0]
    if (!firstGithubApp) {
      setSelectedGithubAppUuid('')
      return
    }

    if (!githubApps.some((app) => app.uuid === selectedGithubAppUuid)) {
      setSelectedGithubAppUuid(firstGithubApp.uuid)
    }
  }, [githubApps, selectedGithubAppUuid])

  useEffect(() => {
    const firstPrivateKey = privateKeys[0]
    if (!firstPrivateKey) {
      setSelectedPrivateKeyUuid('')
      return
    }

    if (!privateKeys.some((key) => key.uuid === selectedPrivateKeyUuid)) {
      setSelectedPrivateKeyUuid(firstPrivateKey.uuid)
    }
  }, [privateKeys, selectedPrivateKeyUuid])

  useEffect(() => {
    if (!needsPrivateRepoCredentials || providerAssetsLoading || !providerAssetsResolved) {
      return
    }

    if (privateRepoAuthMode === 'github-app' && canUseGithubApp) {
      return
    }

    if (privateRepoAuthMode === 'saved-key' && canUseSavedPrivateKey) {
      return
    }

    if (privateRepoAuthMode === 'paste-key') {
      return
    }

    if (canUseGithubApp) {
      setPrivateRepoAuthMode('github-app')
      return
    }

    if (canUseSavedPrivateKey) {
      setPrivateRepoAuthMode('saved-key')
      return
    }

    setPrivateRepoAuthMode('paste-key')
  }, [
    canUseGithubApp,
    canUseSavedPrivateKey,
    needsPrivateRepoCredentials,
    privateRepoAuthMode,
    providerAssetsLoading,
    providerAssetsResolved,
  ])

  useEffect(() => {
    if (step !== 2) {
      return
    }

    let cancelled = false

    async function loadDeploymentTargets() {
      setTargetLoading(true)
      setTargetError(null)

      try {
        const [nextServers, nextProjects] = await Promise.all([
          listServers(),
          listProjects(),
        ])

        if (cancelled) {
          return
        }

        setAvailableServers(nextServers)
        setAvailableProjects(nextProjects)
        setSelectedServerUuid((current) => {
          if (current && nextServers.some((server) => server.uuid === current)) {
            return current
          }

          return nextServers[0]?.uuid ?? ''
        })
        setSelectedProjectUuid((current) => {
          if (current === CREATE_NEW_PROJECT_VALUE) {
            return current
          }

          if (current && nextProjects.some((project) => project.uuid === current)) {
            return current
          }

          return nextProjects[0]?.uuid ?? CREATE_NEW_PROJECT_VALUE
        })
      } catch (err) {
        if (!cancelled) {
          setTargetError(err instanceof Error ? err.message : String(err))
        }
      } finally {
        if (!cancelled) {
          setTargetLoading(false)
        }
      }
    }

    void loadDeploymentTargets()

    return () => {
      cancelled = true
    }
  }, [step])

  useEffect(() => {
    if (step !== 2) {
      return
    }

    if (!selectedProjectUuid || selectedProjectUuid === CREATE_NEW_PROJECT_VALUE) {
      setAvailableEnvironments([])
      setEnvironmentError(null)
      setEnvironmentsLoading(false)
      setSelectedEnvironmentUuid(CREATE_NEW_ENVIRONMENT_VALUE)
      return
    }

    let cancelled = false

    async function loadProjectEnvironments() {
      setEnvironmentsLoading(true)
      setEnvironmentError(null)

      try {
        const nextEnvironments = await listProjectEnvironments(selectedProjectUuid)

        if (cancelled) {
          return
        }

        setAvailableEnvironments(nextEnvironments)
        setSelectedEnvironmentUuid((current) => {
          if (current && nextEnvironments.some((environment) => environment.uuid === current)) {
            return current
          }

          return nextEnvironments[0]?.uuid ?? CREATE_NEW_ENVIRONMENT_VALUE
        })
      } catch (err) {
        if (!cancelled) {
          setAvailableEnvironments([])
          setSelectedEnvironmentUuid(CREATE_NEW_ENVIRONMENT_VALUE)
          setEnvironmentError(err instanceof Error ? err.message : String(err))
        }
      } finally {
        if (!cancelled) {
          setEnvironmentsLoading(false)
        }
      }
    }

    void loadProjectEnvironments()

    return () => {
      cancelled = true
    }
  }, [selectedProjectUuid, step])

  function selectType(type: ResourceType) {
    setResourceType(type)
    setStep(1)
  }

  function goBack() {
    if (step === 1) { setStep(0); setResourceType(null) }
    else if (step === 2) { setStep(1) }
  }

  async function resolveDeploymentTarget() {
    const nextServers = availableServers.length > 0 ? availableServers : await listServers()
    const serverUuid = selectedServerUuid || nextServers[0]?.uuid

    if (!serverUuid) {
      throw new Error('Connect one server before creating a resource.')
    }

    const nextProjects =
      availableProjects.length > 0 || selectedProjectUuid === CREATE_NEW_PROJECT_VALUE
        ? availableProjects
        : await listProjects()
    const projectUuid = selectedProjectUuid || nextProjects[0]?.uuid || CREATE_NEW_PROJECT_VALUE

    if (projectUuid === CREATE_NEW_PROJECT_VALUE) {
      const project = await createProject({
        name: newProjectName.trim() || 'CoolDev',
        description: 'Created by CoolDev from the deploy wizard.',
      })
      const seededEnvironments = await listProjectEnvironments(project.uuid)
      const environment = await ensureProjectEnvironment(project.uuid, seededEnvironments)

      return {
        server_uuid: serverUuid,
        project_uuid: project.uuid,
        environment_name: environment.name,
        environment_uuid: environment.uuid,
      }
    }

    let nextEnvironments =
      selectedProjectUuid === projectUuid && availableEnvironments.length > 0
        ? availableEnvironments
        : await listProjectEnvironments(projectUuid)
    let environmentUuid = selectedEnvironmentUuid || nextEnvironments[0]?.uuid || CREATE_NEW_ENVIRONMENT_VALUE

    if (environmentUuid !== CREATE_NEW_ENVIRONMENT_VALUE) {
      let environment = nextEnvironments.find((item) => item.uuid === environmentUuid)

      if (!environment) {
        nextEnvironments = await listProjectEnvironments(projectUuid)
        environment = nextEnvironments.find((item) => item.uuid === environmentUuid)
      }

      if (environment) {
        return {
          server_uuid: serverUuid,
          project_uuid: projectUuid,
          environment_name: environment.name,
          environment_uuid: environment.uuid,
        }
      }

      environmentUuid = CREATE_NEW_ENVIRONMENT_VALUE
    }

    const environment = await ensureProjectEnvironment(projectUuid, nextEnvironments)

    return {
      server_uuid: serverUuid,
      project_uuid: projectUuid,
      environment_name: environment.name,
      environment_uuid: environment.uuid,
    }
  }

  async function resolvePrivateRepoCredentials(nextResourceName: string): Promise<PrivateRepoCredentials> {
    if (privateRepoAuthMode === 'github-app') {
      if (!selectedGithubAppUuid) {
        throw new Error('Choose a GitHub App before deploying this private repository.')
      }

      return { github_app_uuid: selectedGithubAppUuid }
    }

    if (privateRepoAuthMode === 'saved-key') {
      if (!selectedPrivateKeyUuid) {
        throw new Error('Choose an SSH key before deploying this private repository.')
      }

      return { private_key_uuid: selectedPrivateKeyUuid }
    }

    const trimmedPrivateKey = newPrivateKeyValue.trim()
    if (!trimmedPrivateKey) {
      throw new Error('Paste an SSH private key before deploying this private repository.')
    }

    const nextKeyName = newPrivateKeyName.trim() || `${nextResourceName} deploy key`
    const createdKey = await createPrivateKey({
      name: nextKeyName,
      description: `Deploy key created by CoolDev for ${nextResourceName}.`,
      private_key: trimmedPrivateKey,
    })

    setPrivateKeys((current) => {
      if (current.some((key) => key.uuid === createdKey.uuid)) {
        return current
      }

      return [
        ...current,
        {
          uuid: createdKey.uuid,
          name: nextKeyName,
          description: `Deploy key created by CoolDev for ${nextResourceName}.`,
        },
      ]
    })
    setSelectedPrivateKeyUuid(createdKey.uuid)
    setPrivateRepoAuthMode('saved-key')
    setNewPrivateKeyValue('')

    return { private_key_uuid: createdKey.uuid }
  }

  function resolveAppPorts(defaultPortsExposes: string): string {
    return appPortsExposes.trim() || defaultPortsExposes
  }

  function normalizeAppDomain(value: string): string | undefined {
    const trimmed = value.trim()
    if (!trimmed) {
      return undefined
    }

    const candidate = /^https?:\/\//i.test(trimmed) ? trimmed : `https://${trimmed}`
    const parsed = new URL(candidate)

    if (!parsed.hostname) {
      throw new Error('Enter a valid domain or URL.')
    }

    return new URL(`https://${parsed.host}`).toString().replace(/\/$/, '')
  }

  function findEnvironmentByName(environments: ApiEnvironment[], name: string): ApiEnvironment | undefined {
    const normalizedName = name.trim().toLowerCase()

    return environments.find((environment) => environment.name.trim().toLowerCase() === normalizedName)
  }

  async function ensureProjectEnvironment(projectUuid: string, existingEnvironments: ApiEnvironment[] = []) {
    const desiredEnvironmentName = newEnvironmentName.trim() || 'production'
    const matchingEnvironment = findEnvironmentByName(existingEnvironments, desiredEnvironmentName)

    if (matchingEnvironment) {
      return matchingEnvironment
    }

    try {
      return await createProjectEnvironment(projectUuid, {
        name: desiredEnvironmentName,
      })
    } catch (error) {
      if (error instanceof ApiError && error.status === 409) {
        const refreshedEnvironments = await listProjectEnvironments(projectUuid)
        const recoveredEnvironment = findEnvironmentByName(refreshedEnvironments, desiredEnvironmentName)

        if (recoveredEnvironment) {
          return recoveredEnvironment
        }
      }

      throw error
    }
  }

  function resolveAdvancedAppOptions(defaultPortsExposes: string): AdvancedAppOptions {
    const healthCheckPath = appHealthCheckPath.trim()
    const options: AdvancedAppOptions = {
      ports_exposes: resolveAppPorts(defaultPortsExposes),
    }

    if (appInstallCommand.trim()) {
      options.install_command = appInstallCommand.trim()
    }

    if (appBuildCommand.trim()) {
      options.build_command = appBuildCommand.trim()
    }

    if (appBaseDirectory.trim()) {
      options.base_directory = appBaseDirectory.trim()
    }

    if (appPublishDirectory.trim()) {
      options.publish_directory = appPublishDirectory.trim()
    }

    if (healthCheckPath) {
      options.health_check_enabled = true
      options.health_check_path = healthCheckPath
    }

    return options
  }

  async function handleDeploy(forceDomainOverride = false) {
    if (!resourceType) {
      return
    }

    const nextResourceName = resourceName.trim() || placeholderName(
      resourceType,
      appMode === 'template' ? selectedAppTemplate : null,
      selectedEngine,
      selectedService,
    )

    setDeploying(true)
    setDeployError(null)
    if (forceDomainOverride) {
      setDomainConflict(null)
    }

    try {
      const target = await resolveDeploymentTarget()

      if (resourceType === 'database') {
        const createdDatabase = await createManagedDatabase(selectedEngine, {
          ...target,
          name: nextResourceName,
          instant_deploy: true,
        })

        if (autoBackupsEnabled && databaseSupportsAutoBackups(selectedEngine)) {
          await createDatabaseBackup(createdDatabase.uuid, DEFAULT_DATABASE_BACKUP)
        }
      }

      if (resourceType === 'service') {
        if (!selectedService) {
          throw new Error('Choose a service template before deploying.')
        }

        await createOneClickService({
          ...target,
          type: selectedService,
          name: nextResourceName,
          instant_deploy: true,
        })
      }

      if (resourceType === 'compose') {
        if (!composeText.trim()) {
          throw new Error('Paste a Docker Compose file before deploying.')
        }

        await createComposeService({
          ...target,
          name: nextResourceName,
          docker_compose_raw: composeText,
          instant_deploy: true,
        })
      }

      if (resourceType === 'app') {
        const deployFromTemplate = appMode === 'template'
        const gitRepository = deployFromTemplate
          ? selectedTemplate?.repositoryUrl
          : repositoryUrl.trim()
        const gitBranch = deployFromTemplate
          ? selectedTemplate?.branch ?? 'main'
          : branch.trim() || 'main'
        const buildPack = deployFromTemplate
          ? selectedTemplate?.buildPack ?? 'nixpacks'
          : 'nixpacks'
        const defaultPortsExposes = deployFromTemplate
          ? selectedTemplate?.portsExposes ?? '80'
          : '80'
        const environmentVariables = parseEnvironmentVariables(appEnvironmentVariables)

        if (deployFromTemplate && !selectedTemplate) {
          throw new Error('Choose a starter template before deploying.')
        }

        if (!gitRepository) {
          throw new Error('Enter a Git repository URL before deploying.')
        }

        const applicationPayload: ApiApplicationCreateData = {
          ...target,
          name: nextResourceName,
          git_repository: gitRepository,
          git_branch: gitBranch,
          build_pack: buildPack,
          domains: normalizeAppDomain(domain),
          instant_deploy: true,
          force_domain_override: forceDomainOverride || undefined,
          ...resolveAdvancedAppOptions(defaultPortsExposes),
        }

        let createdApplication

        if (deployFromTemplate || visibility === 'public') {
          createdApplication = await createPublicApplication(applicationPayload)
        } else {
          const privateRepoCredentials = await resolvePrivateRepoCredentials(nextResourceName)

          if ('github_app_uuid' in privateRepoCredentials) {
            createdApplication = await createPrivateGithubAppApplication({
              ...applicationPayload,
              github_app_uuid: privateRepoCredentials.github_app_uuid,
            })
          } else {
            createdApplication = await createPrivateDeployKeyApplication({
              ...applicationPayload,
              private_key_uuid: privateRepoCredentials.private_key_uuid,
            })
          }
        }

        if (environmentVariables.length > 0) {
          await createApplicationBulkEnvs(createdApplication.uuid, environmentVariables)
        }
      }

      onNavigate('deployments')
    } catch (err) {
      const nextDomainConflict = getDomainConflictResponse(err)

      if (nextDomainConflict) {
        setDomainConflict(nextDomainConflict)
        setDeployError(null)
      } else {
        setDomainConflict(null)
        setDeployError(err instanceof Error ? err.message : String(err))
      }
    } finally {
      setDeploying(false)
    }
  }

  const breadcrumbs = [
    { label: 'Choose type', active: step === 0 },
    { label: resourceType ? labelForType(resourceType) : 'Configure', active: step === 1 },
    { label: 'Review', active: step === 2 },
  ]

  return (
    <section className="content-grid">
      <article className="panel panel-wide">
        {/* Breadcrumb */}
        <div className="wizard-breadcrumb">
          {breadcrumbs.map((crumb, i) => (
            <span key={crumb.label} style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
              <span className={`wizard-breadcrumb-item${crumb.active ? ' is-active' : ''}`}>
                {crumb.label}
              </span>
              {i < breadcrumbs.length - 1 && <ChevronRightIcon size={12} />}
            </span>
          ))}
        </div>

        {/* Step 0: Choose resource type */}
        {step === 0 && (
          <div>
            <div className="panel-heading" style={{ marginBottom: 12 }}>
              <div>
                <p className="eyebrow">New resource</p>
                <h3>What do you want to deploy?</h3>
              </div>
            </div>
            <div className="resource-type-grid">
              <button type="button" className="resource-type-card" onClick={() => selectType('app')}>
                <AppWindowIcon size={20} />
                <div>
                  <h4>Application</h4>
                  <p>Deploy from a Git repository or choose a starter template.</p>
                </div>
              </button>
              <button type="button" className="resource-type-card" onClick={() => selectType('database')}>
                <DatabaseIcon size={20} />
                <div>
                  <h4>Database</h4>
                  <p>Provision Postgres, MySQL, Redis, MongoDB, and more.</p>
                </div>
              </button>
              <button type="button" className="resource-type-card" onClick={() => selectType('service')}>
                <GridIcon size={20} />
                <div>
                  <h4>Service</h4>
                  <p>One-click apps: Supabase, MinIO, Ghost, Gitea, n8n, and more.</p>
                </div>
              </button>
              <button type="button" className="resource-type-card" onClick={() => selectType('compose')}>
                <FileCodeIcon size={20} />
                <div>
                  <h4>Compose stack</h4>
                  <p>Paste a Docker Compose file and deploy the full stack at once.</p>
                </div>
              </button>
            </div>
          </div>
        )}

        {/* Step 1: Application */}
        {step === 1 && resourceType === 'app' && (
          <div>
            <div className="panel-heading">
              <div>
                <p className="eyebrow">Application</p>
                <h3>Choose a template or connect a repository</h3>
              </div>
              <div className="segmented-control" aria-label="App source">
                <button
                  type="button"
                  className={appMode === 'template' ? 'segment is-active' : 'segment'}
                  onClick={() => setAppMode('template')}
                >
                  Templates
                </button>
                <button
                  type="button"
                  className={appMode === 'custom' ? 'segment is-active' : 'segment'}
                  onClick={() => setAppMode('custom')}
                >
                  Git URL
                </button>
              </div>
            </div>

            {appMode === 'template' ? (
              <>
                <div className="template-search-box">
                  <SearchIcon size={14} />
                  <input
                    value={templateSearch}
                    onChange={(e) => setTemplateSearch(e.currentTarget.value)}
                    placeholder="Search frameworks and startersâ€¦"
                  />
                </div>
                <div className="template-grid">
                  {filteredAppTemplates.map((t) => (
                    <button
                      key={t.id}
                      type="button"
                      className={`template-card${selectedAppTemplate === t.id ? ' is-selected' : ''}`}
                      onClick={() => setSelectedAppTemplate(t.id)}
                    >
                      <h4>{t.name}</h4>
                      <p>{t.description}</p>
                      <div className="template-tags">
                        {t.tags.map((tag) => (
                          <span key={tag} className="template-tag">{tag}</span>
                        ))}
                      </div>
                    </button>
                  ))}
                </div>
              </>
            ) : (
              <div className="wizard-layout">
                <div className="stacked-panel">
                  <div className="subpanel">
                    <div className="form-grid">
                      <label className="field field-wide">
                        <span>Repository URL</span>
                        <input
                          value={repositoryUrl}
                          onChange={(e) => setRepositoryUrl(e.currentTarget.value)}
                          placeholder="https://github.com/acme/app"
                        />
                        <small className="field-hint">Paste any Git URL and CoolDev detects the provider.</small>
                      </label>
                      <label className="field">
                        <span>Branch</span>
                        <input
                          value={branch}
                          onChange={(e) => setBranch(e.currentTarget.value)}
                          placeholder="main"
                        />
                      </label>
                      <label className="field">
                        <span>Domain</span>
                        <input
                          value={domain}
                          onChange={(e) => {
                            setDomain(e.currentTarget.value)
                            setDomainConflict(null)
                          }}
                          placeholder="app.example.com"
                        />
                      </label>
                    </div>
                    <div className="toggle-row">
                      <div>
                        <strong>Repository visibility</strong>
                        <p className="field-hint">Public repos need no credentials. Private repos reveal only the auth fields needed.</p>
                      </div>
                      <div className="segmented-control" aria-label="Visibility">
                        <button type="button" className={visibility === 'public' ? 'segment is-active' : 'segment'} onClick={() => setVisibility('public')}>Public</button>
                        <button type="button" className={visibility === 'private' ? 'segment is-active' : 'segment'} onClick={() => setVisibility('private')}>Private</button>
                      </div>
                    </div>
                    {guessedProvider === null && (
                      <label className="field field-wide">
                        <span>Git provider</span>
                        <select
                          value={manualProvider}
                          onChange={(e) => setManualProvider(e.currentTarget.value as ProviderKey)}
                        >
                          {providerConnections.map((p) => (
                            <option key={p.key} value={p.key}>{p.name}</option>
                          ))}
                        </select>
                      </label>
                    )}

                    {visibility === 'private' && (
                      <div className="field field-wide">
                        <span>Private repo access</span>
                        {providerAssetsLoading ? (
                          <small className="field-hint">Loading saved provider credentials…</small>
                        ) : null}
                        {providerAssetsError ? (
                          <small className="field-hint">Could not load saved provider credentials. {providerAssetsError}</small>
                        ) : null}

                        <div className="settings-subform" style={{ marginTop: 8 }}>
                          <div className="toggle-row" style={{ borderTop: 'none', paddingTop: 0 }}>
                            <div>
                              <strong>Authentication method</strong>
                              <p className="field-hint">
                                {activeProvider === 'github'
                                  ? 'Use a connected GitHub App, reuse a saved SSH key, or paste a new deploy key without leaving this flow.'
                                  : 'Reuse a saved SSH key or paste a new deploy key without leaving this flow.'}
                              </p>
                            </div>
                            <div className="segmented-control" aria-label="Private repo auth mode">
                              {canUseGithubApp ? (
                                <button
                                  type="button"
                                  className={privateRepoAuthMode === 'github-app' ? 'segment is-active' : 'segment'}
                                  onClick={() => setPrivateRepoAuthMode('github-app')}
                                >
                                  GitHub App
                                </button>
                              ) : null}
                              {canUseSavedPrivateKey ? (
                                <button
                                  type="button"
                                  className={privateRepoAuthMode === 'saved-key' ? 'segment is-active' : 'segment'}
                                  onClick={() => setPrivateRepoAuthMode('saved-key')}
                                >
                                  Saved SSH key
                                </button>
                              ) : null}
                              <button
                                type="button"
                                className={privateRepoAuthMode === 'paste-key' ? 'segment is-active' : 'segment'}
                                onClick={() => setPrivateRepoAuthMode('paste-key')}
                              >
                                Paste new key
                              </button>
                            </div>
                          </div>

                          {privateRepoAuthMode === 'github-app' ? (
                            canUseGithubApp ? (
                              <label className="field field-wide">
                                <span>GitHub App</span>
                                <select
                                  value={selectedGithubAppUuid}
                                  onChange={(e) => setSelectedGithubAppUuid(e.currentTarget.value)}
                                >
                                  {githubApps.map((app) => (
                                    <option key={app.uuid} value={app.uuid}>{app.name}</option>
                                  ))}
                                </select>
                                <small className="field-hint">
                                  Best path for private GitHub repositories with repository discovery and webhook automation.
                                </small>
                              </label>
                            ) : (
                              <small className="field-hint">No GitHub App is connected yet. Switch to an SSH key to continue.</small>
                            )
                          ) : null}

                          {privateRepoAuthMode === 'saved-key' ? (
                            canUseSavedPrivateKey ? (
                              <label className="field field-wide">
                                <span>Saved SSH key</span>
                                <select
                                  value={selectedPrivateKeyUuid}
                                  onChange={(e) => setSelectedPrivateKeyUuid(e.currentTarget.value)}
                                >
                                  {privateKeys.map((key) => (
                                    <option key={key.uuid} value={key.uuid}>{key.name}</option>
                                  ))}
                                </select>
                                <small className="field-hint">
                                  Reuse an SSH key already stored for this CoolDev team.
                                </small>
                              </label>
                            ) : (
                              <small className="field-hint">No saved SSH keys are available yet. Paste a new deploy key to continue.</small>
                            )
                          ) : null}

                          {privateRepoAuthMode === 'paste-key' ? (
                            <>
                              <label className="field">
                                <span>Deploy key name</span>
                                <input
                                  value={newPrivateKeyName}
                                  onChange={(e) => setNewPrivateKeyName(e.currentTarget.value)}
                                  placeholder="my-app deploy key"
                                />
                              </label>
                              <label className="field field-wide">
                                <span>Private key</span>
                                <textarea
                                  value={newPrivateKeyValue}
                                  onChange={(e) => setNewPrivateKeyValue(e.currentTarget.value)}
                                  rows={8}
                                  placeholder="Paste your OpenSSH private key"
                                />
                                <small className="field-hint">
                                    CoolDev will store this deploy key for the team and reuse it for future private repository deploys.
                                </small>
                              </label>
                            </>
                          ) : null}
                        </div>
                      </div>
                    )}
                  </div>
                </div>
                <aside className="stacked-panel">
                  <div className="subpanel subtle-panel">
                    <p className="eyebrow">Detected provider</p>
                    <h4>{providerProfile.name}</h4>
                    <p><strong>Auth:</strong> {providerProfile.authLabel}</p>
                    <p><strong>Webhook:</strong> {providerProfile.webhookSupport}</p>
                    {providerProfile.requiredSecrets.length === 0 ? (
                      <p className="field-hint">No credentials required for a public repository.</p>
                    ) : (
                      <ul className="plain-list compact-list">
                        {providerProfile.requiredSecrets.map((s) => <li key={s}>{s}</li>)}
                      </ul>
                    )}
                  </div>
                </aside>
              </div>
            )}

            <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: 16, paddingTop: 16, borderTop: '1px solid var(--border)' }}>
              <button type="button" className="secondary-action" onClick={goBack}>Back</button>
              <button type="button" className="primary-action" onClick={() => setStep(2)}>
                Continue
              </button>
            </div>
          </div>
        )}

        {/* Step 1: Database */}
        {step === 1 && resourceType === 'database' && (
          <div>
            <div className="panel-heading" style={{ marginBottom: 12 }}>
              <div>
                <p className="eyebrow">Database</p>
                <h3>Choose a database engine</h3>
              </div>
            </div>
            <div className="resource-type-grid">
              {databaseEngines.map((db) => (
                <button
                  key={db.id}
                  type="button"
                  className={`resource-type-card${selectedEngine === db.id ? ' is-selected' : ''}`}
                  onClick={() => setSelectedEngine(db.id)}
                >
                  <DatabaseIcon size={18} />
                  <div>
                    <h4>{db.name}{db.recommended ? ' â˜…' : ''}</h4>
                    <p>{db.description}</p>
                  </div>
                </button>
              ))}
            </div>
            <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: 16, paddingTop: 16, borderTop: '1px solid var(--border)' }}>
              <button type="button" className="secondary-action" onClick={goBack}>Back</button>
              <button type="button" className="primary-action" onClick={() => setStep(2)}>Continue</button>
            </div>
          </div>
        )}

        {/* Step 1: Service */}
        {step === 1 && resourceType === 'service' && (
          <div>
            <div className="panel-heading" style={{ marginBottom: 12 }}>
              <div>
                <p className="eyebrow">One-click service</p>
                <h3>Search and select a service to deploy</h3>
              </div>
            </div>
            <div className="template-search-box">
              <SearchIcon size={14} />
              <input
                value={serviceSearch}
                onChange={(e) => setServiceSearch(e.currentTarget.value)}
                placeholder="Search servicesâ€¦"
              />
            </div>
            <div className="template-grid">
              {filteredServices.map((s) => (
                <button
                  key={s.id}
                  type="button"
                  className={`template-card${selectedService === s.id ? ' is-selected' : ''}`}
                  onClick={() => setSelectedService(s.id)}
                >
                  <h4>{s.name}</h4>
                  <p>{s.description}</p>
                  <div className="template-tags">
                    {s.tags.map((tag) => <span key={tag} className="template-tag">{tag}</span>)}
                  </div>
                </button>
              ))}
            </div>
            <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: 16, paddingTop: 16, borderTop: '1px solid var(--border)' }}>
              <button type="button" className="secondary-action" onClick={goBack}>Back</button>
              <button type="button" className="primary-action" onClick={() => setStep(2)}>Continue</button>
            </div>
          </div>
        )}

        {/* Step 1: Compose */}
        {step === 1 && resourceType === 'compose' && (
          <div>
            <div className="panel-heading" style={{ marginBottom: 12 }}>
              <div>
                <p className="eyebrow">Compose stack</p>
                <h3>Paste your Docker Compose file</h3>
              </div>
            </div>
            <div className="wizard-layout">
              <div className="stacked-panel">
                <label className="field field-wide">
                  <span>Compose file</span>
                  <textarea
                    value={composeText}
                    onChange={(e) => setComposeText(e.currentTarget.value)}
                    rows={18}
                  />
                </label>
                <label className="field field-wide">
                  <span>Primary domain</span>
                  <input
                    value={domain}
                    onChange={(e) => {
                      setDomain(e.currentTarget.value)
                      setDomainConflict(null)
                    }}
                    placeholder="app.example.com"
                  />
                </label>
              </div>
              <aside className="stacked-panel">
                <div className="subpanel subtle-panel">
                  <p className="eyebrow">Detected services</p>
                  <h4>{composePreview.services.length} services</h4>
                  <ul className="plain-list compact-list">
                    {composePreview.services.map((s) => (
                      <li key={s.name}>{s.name}: {s.image}</li>
                    ))}
                  </ul>
                </div>
                <div className="subpanel subtle-panel">
                  <p className="eyebrow">Database parity</p>
                  <h4>{composePreview.backupCandidates.length} backup-ready</h4>
                  <ul className="plain-list compact-list">
                    {composePreview.databaseServices.length === 0 ? (
                      <li>No database images detected.</li>
                    ) : (
                      composePreview.databaseServices.map((s) => (
                        <li key={s.name}>
                          {s.name}: {s.engine} {s.backupEligible ? 'âœ“ backup-ready' : 'â€” manual path'}
                        </li>
                      ))
                    )}
                  </ul>
                </div>
                {composePreview.warnings.length > 0 && (
                  <div className="subpanel subtle-panel">
                    <p className="eyebrow">Warnings</p>
                    <ul className="plain-list compact-list">
                      {composePreview.warnings.map((w) => <li key={w}>{w}</li>)}
                    </ul>
                  </div>
                )}
              </aside>
            </div>
            <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: 16, paddingTop: 16, borderTop: '1px solid var(--border)' }}>
              <button type="button" className="secondary-action" onClick={goBack}>Back</button>
              <button type="button" className="primary-action" onClick={() => setStep(2)}>Continue</button>
            </div>
          </div>
        )}

        {/* Step 2: Review and deploy */}
        {step === 2 && resourceType !== null && (
          <div>
            <div className="panel-heading" style={{ marginBottom: 12 }}>
              <div>
                <p className="eyebrow">Review</p>
                <h3>Confirm and deploy</h3>
              </div>
            </div>
            <div className="wizard-layout">
              <div className="stacked-panel">
                <div className="subpanel">
                  <div className="form-grid">
                    <label className="field field-wide">
                      <span>Resource name</span>
                      <input
                        value={resourceName}
                        onChange={(e) => setResourceName(e.currentTarget.value)}
                        placeholder={placeholderName(resourceType, selectedAppTemplate, selectedEngine, selectedService)}
                      />
                    </label>
                    {(resourceType === 'app' || resourceType === 'service') && (
                      <label className="field field-wide">
                        <span>Domain <span className="field-hint">(optional)</span></span>
                        <input
                          value={domain}
                          onChange={(e) => {
                            setDomain(e.currentTarget.value)
                            setDomainConflict(null)
                          }}
                          placeholder="app.example.com"
                        />
                      </label>
                    )}
                  </div>

                  <div className="settings-subform" style={{ marginTop: 16 }}>
                    <div>
                      <strong>Deployment target</strong>
                      <p className="field-hint">
                        Choose which server, project, and environment should receive this resource.
                      </p>
                    </div>

                    {targetLoading ? (
                      <p className="field-hint">Loading servers and projects…</p>
                    ) : null}
                    {targetError ? (
                      <p className="field-hint">Could not load deployment targets. {targetError}</p>
                    ) : null}

                    <div className="form-grid">
                      <label className="field">
                        <span>Server</span>
                        <select
                          value={selectedServerUuid}
                          onChange={(e) => setSelectedServerUuid(e.currentTarget.value)}
                        >
                          {availableServers.map((server) => (
                            <option key={server.uuid} value={server.uuid}>{server.name}</option>
                          ))}
                        </select>
                        <small className="field-hint">
                          {selectedServer
                            ? `${selectedServer.user}@${selectedServer.ip}:${selectedServer.port}`
                            : 'Select a connected server.'}
                        </small>
                      </label>

                      <label className="field">
                        <span>Project</span>
                        <select
                          value={selectedProjectUuid}
                          onChange={(e) => {
                            setSelectedProjectUuid(e.currentTarget.value)
                            setSelectedEnvironmentUuid('')
                          }}
                        >
                          {availableProjects.map((project) => (
                            <option key={project.uuid} value={project.uuid}>{project.name}</option>
                          ))}
                          <option value={CREATE_NEW_PROJECT_VALUE}>Create new project</option>
                        </select>
                      </label>

                      {selectedProjectUuid === CREATE_NEW_PROJECT_VALUE ? (
                        <>
                          <label className="field">
                            <span>New project name</span>
                            <input
                              value={newProjectName}
                              onChange={(e) => setNewProjectName(e.currentTarget.value)}
                              placeholder="CoolDev"
                            />
                          </label>
                          <label className="field">
                            <span>Environment name</span>
                            <input
                              value={newEnvironmentName}
                              onChange={(e) => setNewEnvironmentName(e.currentTarget.value)}
                              placeholder="production"
                            />
                          </label>
                        </>
                      ) : (
                        <>
                          <label className="field">
                            <span>Environment</span>
                            <select
                              value={selectedEnvironmentUuid}
                              onChange={(e) => setSelectedEnvironmentUuid(e.currentTarget.value)}
                            >
                              {availableEnvironments.map((environment) => (
                                <option key={environment.uuid} value={environment.uuid}>{environment.name}</option>
                              ))}
                              <option value={CREATE_NEW_ENVIRONMENT_VALUE}>Create new environment</option>
                            </select>
                          </label>

                          {selectedEnvironmentUuid === CREATE_NEW_ENVIRONMENT_VALUE ? (
                            <label className="field">
                              <span>New environment name</span>
                              <input
                                value={newEnvironmentName}
                                onChange={(e) => setNewEnvironmentName(e.currentTarget.value)}
                                placeholder="production"
                              />
                            </label>
                          ) : (
                            <div className="field">
                              <span>Environment details</span>
                              <small className="field-hint">
                                {environmentsLoading
                                  ? 'Loading environments…'
                                  : environmentError
                                    ? `Could not load environments. ${environmentError}`
                                    : selectedEnvironment
                                      ? `Deploy into ${selectedEnvironment.name}.`
                                      : 'Select an environment or create a new one.'}
                              </small>
                            </div>
                          )}
                        </>
                      )}
                    </div>
                  </div>

                  <div className="toggle-row">
                    <div>
                      <strong>Advanced controls</strong>
                      <p className="field-hint">Ports, build command, health path, environment overrides.</p>
                    </div>
                    <button
                      type="button"
                      className="secondary-action"
                      onClick={() => setShowAdvanced((v) => !v)}
                    >
                      {showAdvanced ? 'Hide' : 'Reveal'}
                    </button>
                  </div>

                  {showAdvanced && resourceType === 'app' && (
                    <div className="settings-subform" style={{ marginTop: 12 }}>
                      <div className="form-grid">
                        <label className="field">
                          <span>Exposed ports</span>
                          <input
                            value={appPortsExposes}
                            onChange={(e) => setAppPortsExposes(e.currentTarget.value)}
                            placeholder={selectedTemplate?.portsExposes ?? '80'}
                          />
                          <small className="field-hint">Comma-separated ports, for example 3000 or 80,443.</small>
                        </label>
                        <label className="field">
                          <span>Base directory</span>
                          <input
                            value={appBaseDirectory}
                            onChange={(e) => setAppBaseDirectory(e.currentTarget.value)}
                            placeholder="apps/web"
                          />
                        </label>
                        <label className="field">
                          <span>Install command</span>
                          <input
                            value={appInstallCommand}
                            onChange={(e) => setAppInstallCommand(e.currentTarget.value)}
                            placeholder="pnpm install --frozen-lockfile"
                          />
                        </label>
                        <label className="field">
                          <span>Build command</span>
                          <input
                            value={appBuildCommand}
                            onChange={(e) => setAppBuildCommand(e.currentTarget.value)}
                            placeholder="pnpm build"
                          />
                        </label>
                        <label className="field">
                          <span>Publish directory</span>
                          <input
                            value={appPublishDirectory}
                            onChange={(e) => setAppPublishDirectory(e.currentTarget.value)}
                            placeholder="dist"
                          />
                        </label>
                        <label className="field">
                          <span>Health check path</span>
                          <input
                            value={appHealthCheckPath}
                            onChange={(e) => setAppHealthCheckPath(e.currentTarget.value)}
                            placeholder="/health"
                          />
                        </label>
                        <label className="field field-wide">
                          <span>Environment variables</span>
                          <textarea
                            value={appEnvironmentVariables}
                            onChange={(e) => setAppEnvironmentVariables(e.currentTarget.value)}
                            rows={8}
                            placeholder={'NODE_ENV=production\nAPI_URL=https://api.example.com'}
                          />
                          <small className="field-hint">One KEY=value pair per line. Blank lines and # comments are ignored.</small>
                        </label>
                      </div>
                    </div>
                  )}

                  {showAdvanced && resourceType !== 'app' && (
                    <ul className="plain-list compact-list">
                      <li>Custom output directory</li>
                      <li>Custom health check path</li>
                      <li>Environment variable overrides</li>
                      <li>Manual port and build command</li>
                      <li>Restart policy</li>
                    </ul>
                  )}

                  {domainConflict && (
                    <div className="settings-subform" style={{ marginTop: 12 }}>
                      <div>
                        <strong>Domain conflict detected</strong>
                        <p className="field-hint" style={{ marginTop: 6 }}>
                          {domainConflict.warning ?? domainConflict.message ?? 'This domain is already in use by another resource.'}
                        </p>
                      </div>

                      {domainConflict.conflicts && domainConflict.conflicts.length > 0 ? (
                        <ul className="plain-list compact-list">
                          {domainConflict.conflicts.map((conflict) => (
                            <li key={`${conflict.domain}-${conflict.resource_uuid ?? conflict.resource_name}`}>
                              <strong>{conflict.domain}</strong>
                              <span>
                                {' '}→ {conflict.resource_name} ({conflict.resource_type})
                              </span>
                            </li>
                          ))}
                        </ul>
                      ) : null}

                      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                        <button
                          type="button"
                          className="secondary-action danger-action"
                          onClick={() => void handleDeploy(true)}
                          disabled={deploying}
                        >
                          {deploying ? 'Forcing deploy…' : 'Deploy anyway'}
                        </button>
                        <small className="field-hint">
                          Only continue if you intentionally want multiple resources to share this domain.
                        </small>
                      </div>
                    </div>
                  )}

                  {deployError && (
                    <p className="field-hint" style={{ marginTop: 12 }}>
                      Could not deploy this resource. {deployError}
                    </p>
                  )}
                </div>
              </div>

              <aside className="stacked-panel">
                <div className="subpanel subtle-panel">
                  <p className="eyebrow">Deploy plan</p>
                  <ul className="plain-list readiness-list">
                    <li><strong>Type</strong><span>{labelForType(resourceType)}</span></li>
                    <li>
                      <strong>Source</strong>
                      <span>{deploySource(resourceType, selectedAppTemplate, selectedEngine, selectedService, composePreview.services.length)}</span>
                    </li>
                    <li>
                      <strong>Server</strong>
                      <span>{selectedServer?.name ?? 'First connected server'}</span>
                    </li>
                    <li>
                      <strong>Project</strong>
                      <span>
                        {selectedProjectUuid === CREATE_NEW_PROJECT_VALUE
                          ? `${newProjectName.trim() || 'CoolDev'} (new)`
                          : selectedProject?.name ?? 'Default project'}
                      </span>
                    </li>
                    <li>
                      <strong>Environment</strong>
                      <span>
                        {selectedProjectUuid === CREATE_NEW_PROJECT_VALUE || selectedEnvironmentUuid === CREATE_NEW_ENVIRONMENT_VALUE
                          ? `${newEnvironmentName.trim() || 'production'} (new)`
                          : selectedEnvironment?.name ?? 'production'}
                      </span>
                    </li>
                    {resourceType === 'app' && appMode === 'custom' && visibility === 'private' ? (
                      <li>
                        <strong>Auth</strong>
                        <span>{privateRepoAuthMode === 'github-app' ? 'GitHub App' : privateRepoAuthMode === 'saved-key' ? 'Saved SSH key' : 'New deploy key'}</span>
                      </li>
                    ) : null}
                    {domain && <li><strong>Domain</strong><span>{domain}</span></li>}
                    <li><strong>Defaults</strong><span>Ports, SSL, proxy auto-applied</span></li>
                  </ul>
                </div>
              </aside>
            </div>

            <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: 16, paddingTop: 16, borderTop: '1px solid var(--border)' }}>
              <button type="button" className="secondary-action" onClick={goBack}>Back</button>
              <button
                type="button"
                className="primary-action"
                onClick={() => void handleDeploy()}
                disabled={deploying}
              >
                {deploying ? 'Deploying…' : 'Deploy now'}
              </button>
            </div>
          </div>
        )}
      </article>
    </section>
  )
}

function labelForType(type: ResourceType): string {
  if (type === 'app') return 'Application'
  if (type === 'database') return 'Database'
  if (type === 'service') return 'Service'
  return 'Compose stack'
}

function placeholderName(
  type: ResourceType,
  appTemplate: string | null,
  engine: string,
  service: string | null,
): string {
  if (type === 'app') return appTemplate ?? 'my-app'
  if (type === 'database') return engine + '-db'
  if (type === 'service') return service ?? 'my-service'
  return 'my-stack'
}

function deploySource(
  type: ResourceType,
  appTemplate: string | null,
  engine: string,
  service: string | null,
  serviceCount: number,
): string {
  if (type === 'app') return appTemplate ? `${appTemplate} template` : 'Git repository'
  if (type === 'database') return engine
  if (type === 'service') return service ?? 'service template'
  return `${serviceCount} Compose services`
}

function getDomainConflictResponse(error: unknown): ApiDomainConflictResponse | null {
  if (!(error instanceof ApiError) || error.status !== 409) {
    return null
  }

  if (!error.data || typeof error.data !== 'object') {
    return null
  }

  const payload = error.data as ApiDomainConflictResponse

  if (!Array.isArray(payload.conflicts) || payload.conflicts.length === 0) {
    return null
  }

  return payload
}

function parseEnvironmentVariables(value: string) {
  return value
    .split('\n')
    .map((line) => line.trim())
    .filter((line) => line.length > 0 && !line.startsWith('#'))
    .map((line, index) => {
      const normalized = line.startsWith('export ') ? line.slice(7).trim() : line
      const separatorIndex = normalized.indexOf('=')

      if (separatorIndex <= 0) {
        throw new Error(`Environment variables must use KEY=value format. Check line ${index + 1}.`)
      }

      const key = normalized.slice(0, separatorIndex).trim()
      const envValue = normalized.slice(separatorIndex + 1)

      if (!key) {
        throw new Error(`Environment variables must have a key before '='. Check line ${index + 1}.`)
      }

      return {
        key,
        value: envValue,
        is_literal: true,
        is_preview: false,
        is_multiline: false,
        is_shown_once: false,
      }
    })
}
