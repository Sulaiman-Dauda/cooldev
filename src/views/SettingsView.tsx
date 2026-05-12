import { useEffect, useState } from 'react'
import { AlertIcon, ExternalLinkIcon, KeyIcon, ShieldIcon } from '../components/Icons'
import {
  ApiError,
  checkHealth,
  confirmTwoFactorAuthentication,
  disableTwoFactorAuthentication,
  enableTwoFactorAuthentication,
  getAccessStatus,
  getCurrentProfile,
  getCurrentTeam,
  getCurrentTeamMembers,
  getInstanceSettings,
  getVersion,
  getWorkspacePreferences,
  saveWorkspaceDomainAccess,
  updateWorkspacePreferences,
  type ApiAccessStatus,
  type ApiCurrentProfile,
  type ApiDomainConflict,
  type ApiDomainConflictResponse,
  type ApiInstanceSettings,
  type ApiTeam,
} from '../lib/api'
import { useAuth } from '../lib/auth'

type LoadStatus = 'checking' | 'ready' | 'failed'
type SecurityAction = 'idle' | 'enabling' | 'confirming' | 'disabling'

function getErrorMessage(error: unknown, fallback: string): string {
  if (error instanceof Error && error.message) {
    return error.message
  }

  return fallback
}

function accessChipClass(accessStatus: ApiAccessStatus | null, accessError: string | null): string {
  if (accessError) {
    return 'chip-failed'
  }

  if (!accessStatus) {
    return 'chip-neutral'
  }

  if (accessStatus.status === 'live') {
    return 'chip-ready'
  }

  if (
    accessStatus.status === 'bootstrap'
    || accessStatus.status === 'pending-dns'
    || accessStatus.status === 'provisioning-ssl'
  ) {
    return 'chip-neutral'
  }

  return 'chip-failed'
}

function accessChipLabel(accessStatus: ApiAccessStatus | null, accessError: string | null): string {
  if (accessError) {
    return 'Unavailable'
  }

  if (!accessStatus) {
    return 'Checking'
  }

  switch (accessStatus.status) {
    case 'live':
      return 'Live'
    case 'bootstrap':
      return 'Bootstrap'
    case 'pending-dns':
      return 'Waiting for DNS'
    case 'provisioning-ssl':
      return 'Provisioning'
    default:
      return 'Unavailable'
  }
}

export function SettingsView() {
  const { platformReady, disconnect } = useAuth()

  const [workspaceDomain, setWorkspaceDomain] = useState('')
  const [workspaceDomainSaved, setWorkspaceDomainSaved] = useState(false)
  const [isSavingWorkspaceDomain, setIsSavingWorkspaceDomain] = useState(false)
  const [forceDomainOverride, setForceDomainOverride] = useState(false)
  const [instanceSettingsStatus, setInstanceSettingsStatus] = useState<LoadStatus>(
    platformReady ? 'checking' : 'failed',
  )
  const [instanceSettings, setInstanceSettings] = useState<ApiInstanceSettings | null>(null)
  const [instanceSettingsError, setInstanceSettingsError] = useState<string | null>(null)
  const [workspaceDomainError, setWorkspaceDomainError] = useState<string | null>(null)
  const [workspaceDomainConflictWarning, setWorkspaceDomainConflictWarning] = useState<string | null>(null)
  const [workspaceDomainConflicts, setWorkspaceDomainConflicts] = useState<ApiDomainConflict[]>([])
  const [accessStatus, setAccessStatus] = useState<ApiAccessStatus | null>(null)
  const [accessStatusError, setAccessStatusError] = useState<string | null>(null)
  const [redirectWhenReady, setRedirectWhenReady] = useState(false)
  const [redirectingToSecureDomain, setRedirectingToSecureDomain] = useState(false)

  const [autoBackups, setAutoBackups] = useState(true)
  const [autoBackupsLoaded, setAutoBackupsLoaded] = useState(false)

  const [platformHealthStatus, setPlatformHealthStatus] = useState<'checking' | 'ready' | 'failed'>(
    platformReady ? 'checking' : 'failed',
  )
  const [platformHealthError, setPlatformHealthError] = useState<string | null>(null)
  const [platformVersionStatus, setPlatformVersionStatus] = useState<LoadStatus>(
    platformReady ? 'checking' : 'failed',
  )
  const [platformVersion, setPlatformVersion] = useState<string | null>(null)
  const [currentTeam, setCurrentTeam] = useState<ApiTeam | null>(null)
  const [currentTeamMemberCount, setCurrentTeamMemberCount] = useState<number | null>(null)
  const [teamStatus, setTeamStatus] = useState<LoadStatus>(
    platformReady ? 'checking' : 'failed',
  )

  const [profileStatus, setProfileStatus] = useState<LoadStatus>(
    platformReady ? 'checking' : 'failed',
  )
  const [profile, setProfile] = useState<ApiCurrentProfile | null>(null)
  const [profileError, setProfileError] = useState<string | null>(null)
  const [securityAction, setSecurityAction] = useState<SecurityAction>('idle')
  const [securityError, setSecurityError] = useState<string | null>(null)
  const [twoFactorCode, setTwoFactorCode] = useState('')
  const [twoFactorSetup, setTwoFactorSetup] = useState<{
    qrCodeSvg: string
    recoveryCodes: string[]
  } | null>(null)
  // null = unknown, true = capable, false = not available on this installation
  const [twoFactorCapable, setTwoFactorCapable] = useState<boolean | null>(null)

  useEffect(() => {
    let cancelled = false

    async function loadWorkspaceMetadata() {
      setAccessStatusError(null)

      const results = await Promise.allSettled([
        getAccessStatus(),
        platformReady ? checkHealth() : Promise.resolve({ status: 'starting' }),
        platformReady ? getVersion() : Promise.resolve(null),
        platformReady ? getCurrentTeam() : Promise.resolve(null),
        platformReady ? getCurrentTeamMembers() : Promise.resolve([]),
        platformReady ? getInstanceSettings() : Promise.resolve(null),
        platformReady ? getCurrentProfile() : Promise.resolve(null),
        getWorkspacePreferences(),
      ])

      if (cancelled) {
        return
      }

      const [
        nextAccessResult,
        healthResult,
        versionResult,
        teamResult,
        teamMembersResult,
        instanceSettingsResult,
        profileResult,
        preferencesResult,
      ] = results
      const fallbackWorkspaceDomain = nextAccessResult.status === 'fulfilled'
        ? nextAccessResult.value.currentDomain ?? ''
        : ''

      if (nextAccessResult.status === 'fulfilled') {
        setAccessStatus(nextAccessResult.value)
      } else {
        setAccessStatus(null)
        setAccessStatusError(getErrorMessage(nextAccessResult.reason, 'Could not load access status.'))
      }

      if (!platformReady) {
        setPlatformHealthStatus('failed')
        setPlatformHealthError('CoolDev is still finishing setup. Live platform status will appear in a moment.')
        setPlatformVersionStatus('failed')
        setPlatformVersion(null)
        setCurrentTeam(null)
        setCurrentTeamMemberCount(null)
        setTeamStatus('failed')
        setInstanceSettingsStatus('failed')
        setInstanceSettings(null)
        setInstanceSettingsError('CoolDev is still finishing setup. Domain settings will appear once the platform is ready.')
        setProfileStatus('failed')
        setProfile(null)
        setProfileError('CoolDev is still finishing setup. Account security settings will appear once the platform is ready.')
        setTwoFactorSetup(null)
        setTwoFactorCode('')
        return
      }

      if (healthResult.status === 'fulfilled') {
        setPlatformHealthStatus('ready')
        setPlatformHealthError(null)
      } else {
        setPlatformHealthStatus('failed')
        setPlatformHealthError(getErrorMessage(healthResult.reason, 'Could not reach the workspace runtime.'))
      }

      if (versionResult.status === 'fulfilled' && versionResult.value) {
        setPlatformVersion(versionResult.value.version)
        setPlatformVersionStatus('ready')
      } else {
        setPlatformVersion(null)
        setPlatformVersionStatus('failed')
      }

      if (teamResult.status === 'fulfilled' && teamResult.value) {
        setCurrentTeam(teamResult.value)
        setTeamStatus('ready')
      } else {
        setCurrentTeam(null)
        setTeamStatus('failed')
      }

      if (teamMembersResult.status === 'fulfilled') {
        setCurrentTeamMemberCount(teamMembersResult.value.length)
      } else {
        setCurrentTeamMemberCount(null)
      }

      if (instanceSettingsResult.status === 'fulfilled' && instanceSettingsResult.value) {
        const workspaceSettingsSupported = instanceSettingsResult.value.workspace_settings_supported !== false

        setInstanceSettings(instanceSettingsResult.value)
        setInstanceSettingsStatus(workspaceSettingsSupported ? 'ready' : 'failed')
        setInstanceSettingsError(
          workspaceSettingsSupported
            ? null
            : 'Shared workspace settings are not available yet. Domain management still works in CoolDev.',
        )
        setWorkspaceDomain(instanceSettingsResult.value.public_url ?? fallbackWorkspaceDomain)
      } else {
        setInstanceSettings(null)
        setInstanceSettingsStatus('failed')
        setInstanceSettingsError(
          getErrorMessage(
            instanceSettingsResult.status === 'rejected' ? instanceSettingsResult.reason : null,
            'Could not load workspace settings.',
          ),
        )
        setWorkspaceDomain(fallbackWorkspaceDomain)
      }

      if (profileResult.status === 'fulfilled' && profileResult.value) {
        const twoFactorSupported = profileResult.value.two_factor_supported !== false

        setProfile(profileResult.value)
        setProfileStatus('ready')
        setProfileError(null)
        setTwoFactorCapable(twoFactorSupported)

        if (!twoFactorSupported || !profileResult.value.two_factor_pending) {
          setTwoFactorSetup(null)
          setTwoFactorCode('')
        }
      } else {
        setProfile(null)
        setProfileStatus('failed')
        const profileErr = profileResult.status === 'rejected' ? profileResult.reason : null
        // A 404 on the profile endpoint means two-factor management is not available on this installation.
        if (profileErr instanceof ApiError && profileErr.status === 404) {
          setTwoFactorCapable(false)
        }
        setProfileError(
          getErrorMessage(
            profileErr,
            'Could not load the current profile.',
          ),
        )
        setTwoFactorSetup(null)
        setTwoFactorCode('')
      }

      if (!cancelled) {
        if (preferencesResult.status === 'fulfilled') {
          setAutoBackups(preferencesResult.value.autoBackups)
        } else {
          // Fall back to localStorage for dev/mock environments
          setAutoBackups(localStorage.getItem('cooldev-auto-backups') !== 'false')
        }

        setAutoBackupsLoaded(true)
      }
    }

    void loadWorkspaceMetadata()

    return () => {
      cancelled = true
    }
  }, [platformReady])

  useEffect(() => {
    if (!accessStatus?.currentDomain || accessStatus.status === 'live' || accessStatus.status === 'unavailable') {
      return
    }

    const timerId = window.setInterval(() => {
      void getAccessStatus()
        .then((nextStatus) => {
          setAccessStatus(nextStatus)
          setAccessStatusError(null)
        })
        .catch((error) => {
          setAccessStatusError(getErrorMessage(error, 'Could not refresh domain access status.'))
        })
    }, 5000)

    return () => {
      window.clearInterval(timerId)
    }
  }, [accessStatus?.currentDomain, accessStatus?.status])

  useEffect(() => {
    if (
      !redirectWhenReady
      || !accessStatus?.secureUrl
      || accessStatus.status !== 'live'
      || accessStatus.secureUrl === window.location.origin
    ) {
      setRedirectingToSecureDomain(false)
      return
    }

    setRedirectingToSecureDomain(true)
    const timerId = window.setTimeout(() => {
      window.location.assign(accessStatus.secureUrl as string)
    }, 1800)

    return () => {
      window.clearTimeout(timerId)
    }
  }, [accessStatus, redirectWhenReady])

  async function saveWorkspaceDomain() {
    setIsSavingWorkspaceDomain(true)
    setWorkspaceDomainSaved(false)
    setWorkspaceDomainError(null)
    setWorkspaceDomainConflictWarning(null)
    setWorkspaceDomainConflicts([])

    try {
      const result = await saveWorkspaceDomainAccess({
        publicUrl: workspaceDomain.trim() || null,
        forceDomainOverride,
      })
      const workspaceSettingsSynced = result.workspaceSettingsSynced !== false

      setInstanceSettings(result.instanceSettings)
      setInstanceSettingsStatus(workspaceSettingsSynced ? 'ready' : 'failed')
      setInstanceSettingsError(
        workspaceSettingsSynced
          ? null
          : 'Shared workspace settings are not available yet. CoolDev saved this domain locally instead.'
      )
      setWorkspaceDomain(result.instanceSettings.public_url ?? result.accessStatus.currentDomain ?? '')
      setAccessStatus(result.accessStatus)
      setAccessStatusError(null)
      setForceDomainOverride(false)
      setWorkspaceDomainSaved(true)
      setRedirectWhenReady(Boolean(result.accessStatus.currentDomain))
      window.setTimeout(() => setWorkspaceDomainSaved(false), 2000)
    } catch (error) {
      if (error instanceof ApiError) {
        const errorData = error.data as ApiDomainConflictResponse | undefined
        setWorkspaceDomainError(errorData?.message ?? error.message)
        setWorkspaceDomainConflictWarning(errorData?.warning ?? null)
        setWorkspaceDomainConflicts(errorData?.conflicts ?? [])
      } else {
        setWorkspaceDomainError(getErrorMessage(error, 'Could not update the workspace domain.'))
      }
    } finally {
      setIsSavingWorkspaceDomain(false)
    }
  }

  async function toggleAutoBackups() {
    const next = !autoBackups
    setAutoBackups(next)

    try {
      await updateWorkspacePreferences({ autoBackups: next })
    } catch {
      // Fall back to localStorage so the toggle still persists locally
      localStorage.setItem('cooldev-auto-backups', String(next))
    }
  }

  async function handleEnableTwoFactor() {
    setSecurityAction('enabling')
    setSecurityError(null)

    try {
      const result = await enableTwoFactorAuthentication()
      setProfile(result.profile)
      setProfileStatus('ready')
      setTwoFactorCapable(true)
      setTwoFactorSetup({
        qrCodeSvg: result.qr_code_svg,
        recoveryCodes: result.recovery_codes,
      })
      setTwoFactorCode('')
    } catch (error) {
      // A 404 means this installation does not expose the two-factor management endpoints.
      if (error instanceof ApiError && error.status === 404) {
        setTwoFactorCapable(false)
        setSecurityError(
          'Two-factor management is not available on this workspace yet. ' +
          'Update the workspace runtime to enable it.',
        )
      } else {
        setSecurityError(getErrorMessage(error, 'Could not start two-factor authentication setup.'))
      }
    } finally {
      setSecurityAction('idle')
    }
  }

  async function handleConfirmTwoFactor() {
    if (!twoFactorCode.trim()) {
      setSecurityError('Enter the current 6-digit code from your authenticator app.')
      return
    }

    setSecurityAction('confirming')
    setSecurityError(null)

    try {
      const nextProfile = await confirmTwoFactorAuthentication(twoFactorCode.trim())
      setProfile(nextProfile)
      setProfileStatus('ready')
      setTwoFactorSetup(null)
      setTwoFactorCode('')
    } catch (error) {
      setSecurityError(getErrorMessage(error, 'Could not confirm two-factor authentication.'))
    } finally {
      setSecurityAction('idle')
    }
  }

  async function handleDisableTwoFactor() {
    setSecurityAction('disabling')
    setSecurityError(null)

    try {
      const nextProfile = await disableTwoFactorAuthentication()
      setProfile(nextProfile)
      setProfileStatus('ready')
      setTwoFactorCapable(true)
      setTwoFactorSetup(null)
      setTwoFactorCode('')
    } catch (error) {
      if (error instanceof ApiError && error.status === 404) {
        setTwoFactorCapable(false)
        setSecurityError('Two-factor management is not available on this workspace yet.')
      } else {
        setSecurityError(getErrorMessage(error, 'Could not disable two-factor authentication.'))
      }
    } finally {
      setSecurityAction('idle')
    }
  }

  const canManageWorkspaceDomain = platformReady && accessStatus?.proxyProvider !== 'unavailable'
  const workspaceSettingsFallbackActive = instanceSettingsStatus === 'failed' && canManageWorkspaceDomain
  const instanceStatusSummary =
    instanceSettingsStatus === 'ready' && instanceSettings
      ? `${instanceSettings.instance_name}${instanceSettings.instance_timezone ? ` • ${instanceSettings.instance_timezone}` : ''}${instanceSettings.public_ipv4 ? ` • ${instanceSettings.public_ipv4}` : ''}`
      : instanceSettingsStatus === 'checking'
        ? 'Loading shared workspace settings.'
        : workspaceSettingsFallbackActive
          ? 'Shared workspace settings are not available yet. Domain management still works in CoolDev.'
          : instanceSettingsError ?? 'Workspace settings unavailable.'

  const securityChipText =
    twoFactorCapable === false
      ? 'Unavailable'
      : profileStatus === 'checking'
        ? 'Checking'
        : profileStatus === 'failed'
          ? 'Unavailable'
          : profile?.two_factor_enabled
            ? 'Enabled'
            : profile?.two_factor_pending
              ? 'Pending'
              : 'Off'

  const securityChipClass =
    twoFactorCapable === false
      ? 'chip-failed'
      : profileStatus === 'checking'
        ? 'chip-neutral'
        : profileStatus === 'failed'
          ? 'chip-failed'
          : profile?.two_factor_enabled
            ? 'chip-ready'
            : profile?.two_factor_pending
              ? 'chip-neutral'
              : 'chip-failed'

  const securitySummary =
    twoFactorCapable === false
      ? 'Two-factor management is not available on this workspace yet. Update the workspace runtime to enable it.'
      : profileStatus === 'checking'
        ? 'Loading the authenticated user profile.'
        : profileStatus === 'failed'
          ? profileError ?? 'Profile unavailable.'
          : profile?.two_factor_enabled
            ? 'This account has a confirmed authenticator app and recovery codes.'
            : profile?.two_factor_pending
              ? 'Finish setup by entering the current 6-digit code from your authenticator app.'
              : 'This account does not have two-factor authentication enabled yet.'

  const bootstrapAccessUrl = accessStatus?.bootstrapUrl || window.location.origin
  const currentDomainLabel = accessStatus?.currentDomain?.trim()
    ? `Current domain: ${accessStatus.currentDomain}`
    : `No custom domain is configured yet. Keep using ${bootstrapAccessUrl} until DNS is ready.`
  const domainAccessChipClass = accessChipClass(accessStatus, accessStatusError)
  const domainAccessChipLabel = accessChipLabel(accessStatus, accessStatusError)
  const sslChipLabel = accessStatus?.sslStatus === 'ready'
    ? 'Ready'
    : accessStatus?.sslStatus === 'pending'
      ? 'Automatic'
      : accessStatus?.sslStatus === 'unavailable'
        ? 'Unavailable'
        : 'Inactive'
  const sslChipClass = accessStatus?.sslStatus === 'ready'
    ? 'chip-ready'
    : accessStatus?.sslStatus === 'pending'
      ? 'chip-neutral'
      : accessStatus?.sslStatus === 'inactive'
        ? 'chip-neutral'
        : 'chip-failed'
  const openSecureDomainUrl = accessStatus?.status === 'live' ? accessStatus.secureUrl : null
  const sslSummary = accessStatus?.status === 'live'
    ? `HTTPS is active on ${accessStatus.secureUrl}.`
    : accessStatus?.status === 'pending-dns'
      ? 'Certificates will be issued automatically after DNS points to this server.'
      : accessStatus?.status === 'provisioning-ssl'
        ? 'CoolDev is automatically switching traffic to 80/443 and requesting the TLS certificate.'
        : accessStatus?.status === 'bootstrap'
          ? 'Save a domain to turn on automatic HTTPS and reverse proxy cutover.'
          : accessStatus?.status === 'unavailable'
            ? accessStatus.detail
            : 'Checking domain automation status.'

  return (
    <section className="content-grid">
      <article className="panel panel-wide">
        <div className="panel-heading">
          <div>
            <p className="eyebrow">Session</p>
            <h3>Workspace access</h3>
          </div>
          <button
            type="button"
            className="secondary-action danger-action"
            onClick={() => void disconnect()}
          >
            Sign out
          </button>
        </div>

        <div className="settings-row">
          <div>
            <strong>Workspace runtime</strong>
            <small>
              {platformReady
                ? 'Connected and operating normally.'
                : 'Still finishing setup for this workspace.'}
            </small>
          </div>
          <span className={`chip ${platformReady ? 'chip-ready' : 'chip-neutral'}`}>
            {platformReady ? 'Ready' : 'Starting'}
          </span>
        </div>

        <div className="settings-row">
          <div>
            <strong>Runtime health</strong>
            <small>
              {platformHealthStatus === 'ready'
                ? 'Health check passed.'
                : platformHealthStatus === 'checking'
                  ? 'Running health check…'
                  : `Cannot reach the workspace runtime. ${platformHealthError ?? ''}`.trim()}
            </small>
          </div>
          <span className={`chip ${platformHealthStatus === 'ready' ? 'chip-ready' : platformHealthStatus === 'checking' ? 'chip-neutral' : 'chip-failed'}`}>
            {platformHealthStatus === 'ready' ? 'Healthy' : platformHealthStatus === 'checking' ? 'Checking' : 'Unavailable'}
          </span>
        </div>

        <div className="settings-row">
          <div>
            <strong>Runtime version</strong>
            <small>
              {platformVersion
                ? `Version ${platformVersion}`
                : platformVersionStatus === 'checking'
                  ? 'Detecting the workspace runtime version.'
                  : 'Version unavailable.'}
            </small>
          </div>
          <span className={`chip ${platformVersionStatus === 'ready' ? 'chip-ready' : platformVersionStatus === 'checking' ? 'chip-neutral' : 'chip-failed'}`}>
            {platformVersionStatus === 'ready' ? 'Detected' : platformVersionStatus === 'checking' ? 'Checking' : 'Unavailable'}
          </span>
        </div>

        <div className="settings-row">
          <div>
            <strong>Workspace team</strong>
            <small>
              {teamStatus === 'ready' && currentTeam
                ? `${currentTeam.name}${currentTeamMemberCount === null ? '' : ` • ${currentTeamMemberCount} ${currentTeamMemberCount === 1 ? 'member' : 'members'}`}`
                : teamStatus === 'checking'
                  ? 'Loading the active workspace team.'
                  : 'Team context unavailable.'}
            </small>
          </div>
          <span className={`chip ${teamStatus === 'ready' ? 'chip-ready' : teamStatus === 'checking' ? 'chip-neutral' : 'chip-failed'}`}>
            {teamStatus === 'ready' ? 'Synced' : teamStatus === 'checking' ? 'Checking' : 'Unavailable'}
          </span>
        </div>
      </article>

      <article className="panel">
        <div className="panel-heading">
          <div>
            <p className="eyebrow">Domain</p>
            <h3>Access & HTTPS</h3>
          </div>
        </div>
        <p className="field-hint" style={{ marginBottom: 12 }}>
          CoolDev is accessible immediately on the bootstrap URL. Save a domain when
          your DNS is ready—CoolDev handles the 80/443 cutover and HTTPS automatically.
        </p>

        <div className="settings-row">
          <div>
            <strong>Bootstrap URL</strong>
            <small>{bootstrapAccessUrl}</small>
          </div>
          <span className="chip chip-ready">Live</span>
        </div>

        <div className="settings-row">
          <div>
            <strong>Domain cutover</strong>
            <small>{accessStatusError ?? accessStatus?.summary ?? 'Checking domain automation status.'}</small>
          </div>
          <span className={`chip ${domainAccessChipClass}`}>{domainAccessChipLabel}</span>
        </div>

        <div className="settings-row">
          <div>
            <strong>HTTPS certificates</strong>
            <small>{sslSummary}</small>
          </div>
          <span className={`chip ${sslChipClass}`}>{sslChipLabel}</span>
        </div>

        <div className="settings-row">
          <div>
            <strong>Workspace settings</strong>
            <small>{instanceStatusSummary}</small>
          </div>
          <span className={`chip ${instanceSettingsStatus === 'ready' ? 'chip-ready' : instanceSettingsStatus === 'checking' ? 'chip-neutral' : 'chip-failed'}`}>
            {instanceSettingsStatus === 'ready' ? 'Synced' : instanceSettingsStatus === 'checking' ? 'Checking' : 'Unavailable'}
          </span>
        </div>

        <div className="settings-subform">
          <label className="field">
            <span>Workspace domain</span>
            <input
              type="url"
              value={workspaceDomain}
              onChange={(event) => setWorkspaceDomain(event.currentTarget.value)}
              placeholder="https://cooldev.yourdomain.com"
              disabled={!canManageWorkspaceDomain || isSavingWorkspaceDomain}
            />
          </label>

          {workspaceSettingsFallbackActive && (
            <p className="field-hint" style={{ margin: 0 }}>
              CoolDev will keep this workspace domain active locally on this host while
              shared settings remain unavailable.
            </p>
          )}

          <label
            style={{
              display: 'flex',
              gap: 10,
              alignItems: 'flex-start',
              fontSize: '0.82rem',
              color: 'var(--text-body)',
            }}
          >
            <input
              type="checkbox"
              checked={forceDomainOverride}
              onChange={(event) => setForceDomainOverride(event.currentTarget.checked)}
              disabled={!canManageWorkspaceDomain || isSavingWorkspaceDomain}
              style={{ marginTop: 2 }}
            />
            <span>Allow domain override if another resource is already using this domain</span>
          </label>

          {workspaceDomainError && (
            <div className="error-banner">
              <AlertIcon size={13} />
              <span>{workspaceDomainError}</span>
            </div>
          )}

          {workspaceDomainConflictWarning && (
            <div className="info-banner">
              <AlertIcon size={13} />
              <p>{workspaceDomainConflictWarning}</p>
            </div>
          )}

          {workspaceDomainConflicts.length > 0 && (
            <ul
              style={{
                margin: 0,
                paddingLeft: 18,
                display: 'grid',
                gap: 6,
                fontSize: '0.8rem',
                color: 'var(--text-body)',
              }}
            >
              {workspaceDomainConflicts.map((conflict) => (
                <li key={`${conflict.resource_type}-${conflict.resource_uuid ?? conflict.resource_name}-${conflict.domain}`}>
                  {conflict.domain} • {conflict.resource_name} ({conflict.resource_type})
                </li>
              ))}
            </ul>
          )}

          {redirectingToSecureDomain && openSecureDomainUrl && (
            <div className="info-banner">
              <ExternalLinkIcon size={13} />
              <p>Secure domain is live. Redirecting to {openSecureDomainUrl} now…</p>
            </div>
          )}

          <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
            <button
              type="button"
              className="primary-action"
              onClick={() => void saveWorkspaceDomain()}
              disabled={!canManageWorkspaceDomain || isSavingWorkspaceDomain}
            >
              {isSavingWorkspaceDomain ? 'Saving...' : workspaceDomainSaved ? 'Saved' : 'Save domain'}
            </button>

            {openSecureDomainUrl && (
              <a
                href={openSecureDomainUrl}
                className="secondary-action"
                style={{ textDecoration: 'none' }}
              >
                <ExternalLinkIcon size={13} />
                Open secure domain
              </a>
            )}

            <span className="field-hint">{currentDomainLabel}</span>
          </div>

          {accessStatus?.detail && (
            <p className="field-hint" style={{ margin: 0 }}>
              {accessStatus.detail}
            </p>
          )}
        </div>
      </article>

      <article className="panel">
        <div className="panel-heading">
          <div>
            <p className="eyebrow">Security</p>
            <h3>Two-factor authentication</h3>
          </div>
          <ShieldIcon size={15} />
        </div>
        <div className="settings-row">
          <div>
            <strong>Current account</strong>
            <small>
              {profileStatus === 'ready' && profile
                ? `${profile.name} • ${profile.email}`
                : profileStatus === 'checking'
                  ? 'Loading the authenticated user.'
                  : profileError ?? 'Profile unavailable.'}
            </small>
          </div>
          <span className={`chip ${securityChipClass}`}>{securityChipText}</span>
        </div>

        <div className="settings-row">
          <div>
            <strong>Two-factor status</strong>
            <small>{securitySummary}</small>
          </div>
          <span className={`chip ${securityChipClass}`}>{securityChipText}</span>
        </div>

        {securityError && (
          <div className="error-banner" style={{ marginTop: 12 }}>
            <AlertIcon size={13} />
            <span>{securityError}</span>
          </div>
        )}

        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginTop: 12 }}>
          {profileStatus === 'ready' && twoFactorCapable !== false && !profile?.two_factor_enabled && (
            <button
              type="button"
              className="primary-action"
              onClick={() => void handleEnableTwoFactor()}
              disabled={securityAction !== 'idle'}
            >
              {securityAction === 'enabling'
                ? 'Preparing setup...'
                : profile?.two_factor_pending
                  ? 'Generate new setup'
                  : 'Enable 2FA'}
            </button>
          )}

          {profile?.two_factor_enabled && twoFactorCapable !== false && (
            <button
              type="button"
              className="secondary-action danger-action"
              onClick={() => void handleDisableTwoFactor()}
              disabled={securityAction !== 'idle'}
            >
              {securityAction === 'disabling' ? 'Disabling...' : 'Disable 2FA'}
            </button>
          )}

          {twoFactorCapable === false && (
            <div className="info-banner" style={{ flex: 1, marginTop: 0 }}>
              <AlertIcon size={13} />
              <div>
                <strong>Not available on this installation</strong>
                <p>
                  Two-factor management is not available on this workspace yet.
                  Update the runtime to enable two-factor authentication.
                </p>
              </div>
            </div>
          )}
        </div>

        {(twoFactorSetup || profile?.two_factor_pending) && (
          <div className="settings-subform" style={{ marginTop: 12 }}>
            <p className="field-hint" style={{ margin: 0 }}>
              Scan the authenticator QR code, store the recovery codes somewhere safe,
              then confirm the current 6-digit code to finish setup.
            </p>

            {twoFactorSetup && (
              <div
                style={{
                  display: 'grid',
                  gap: 12,
                }}
              >
                <div
                  style={{
                    display: 'grid',
                    gap: 10,
                    padding: 14,
                    border: '1px solid var(--border)',
                    borderRadius: 8,
                    background: 'var(--bg-subtle)',
                  }}
                >
                  <strong style={{ fontSize: '0.84rem', color: 'var(--text-heading)' }}>Authenticator QR</strong>
                  <div
                    style={{ width: 'fit-content', maxWidth: '100%' }}
                    dangerouslySetInnerHTML={{ __html: twoFactorSetup.qrCodeSvg }}
                  />
                </div>

                <div style={{ display: 'grid', gap: 10 }}>
                  <strong style={{ fontSize: '0.84rem', color: 'var(--text-heading)' }}>Recovery codes</strong>
                  <ul
                    style={{
                      listStyle: 'none',
                      margin: 0,
                      padding: 0,
                      display: 'grid',
                      gridTemplateColumns: 'repeat(auto-fit, minmax(130px, 1fr))',
                      gap: 8,
                    }}
                  >
                    {twoFactorSetup.recoveryCodes.map((code) => (
                      <li
                        key={code}
                        style={{
                          padding: '9px 10px',
                          borderRadius: 8,
                          border: '1px solid var(--border)',
                          background: 'var(--bg-subtle)',
                          fontFamily: 'var(--font-mono)',
                          fontSize: '0.78rem',
                          color: 'var(--text-heading)',
                        }}
                      >
                        {code}
                      </li>
                    ))}
                  </ul>
                </div>
              </div>
            )}

            {!twoFactorSetup && (
              <p className="field-hint" style={{ margin: 0 }}>
                If you already scanned the QR code, enter the current code below. If not,
                generate a new setup payload.
              </p>
            )}

            <label className="field">
              <span>Authenticator code</span>
              <input
                type="text"
                inputMode="numeric"
                autoComplete="one-time-code"
                value={twoFactorCode}
                onChange={(event) => setTwoFactorCode(event.currentTarget.value)}
                placeholder="123456"
                disabled={securityAction !== 'idle'}
              />
            </label>

            <button
              type="button"
              className="primary-action"
              onClick={() => void handleConfirmTwoFactor()}
              disabled={securityAction !== 'idle'}
            >
              {securityAction === 'confirming' ? 'Confirming...' : 'Confirm 2FA'}
            </button>
          </div>
        )}
      </article>

      <article className="panel">
        <div className="panel-heading">
          <div>
            <p className="eyebrow">Databases</p>
            <h3>Automatic backups</h3>
          </div>
        </div>
        <p className="field-hint" style={{ marginBottom: 12 }}>
          When enabled, CoolDev applies a default daily backup schedule to every
          backup-supported managed database provisioned through the New Resource flow.
        </p>
        <div className="toggle-row">
          <div>
            <strong>Auto-backup managed databases</strong>
            <p className="field-hint">Applies the default workspace backup schedule on creation for supported engines. Preference is saved server-side and persists across browsers.</p>
          </div>
          <button
            type="button"
            className={autoBackups ? 'toggle-btn is-on' : 'toggle-btn'}
            onClick={() => void toggleAutoBackups()}
            aria-pressed={autoBackups}
            disabled={!autoBackupsLoaded}
          >
            <span className="toggle-thumb" />
          </button>
        </div>
        <p className="field-hint" style={{ marginTop: 10 }}>
          Note: This preference is stored locally in your browser. Server-side backup
          scheduling requires configuring backup settings per-database after creation.
        </p>
      </article>

      <article className="panel">
        <div className="panel-heading">
          <div>
            <p className="eyebrow">Access keys</p>
            <h3>SSH keys</h3>
          </div>
          <KeyIcon size={15} />
        </div>
        <p className="field-hint" style={{ marginBottom: 12 }}>
          SSH keys are managed in the Providers section where you can add, view, and
          delete keys used for server connections and private repository deployments.
        </p>
        <div className="settings-row">
          <div>
            <strong>Key management</strong>
            <small>Add or remove SSH keys for deploy operations and server connections.</small>
          </div>
          <a
            href="/simple/providers"
            className="secondary-action"
            style={{ textDecoration: 'none' }}
            onClick={(e) => {
              e.preventDefault()
              window.history.pushState({}, '', '/simple/providers')
              window.dispatchEvent(new PopStateEvent('popstate'))
            }}
          >
            <ExternalLinkIcon size={13} />
            Manage in Providers
          </a>
        </div>
      </article>
    </section>
  )
}
