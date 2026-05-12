import { useEffect, useRef, useState } from 'react'
import { AlertIcon, CheckIcon, CopyIcon, ExternalLinkIcon, KeyIcon, ShieldIcon } from '../components/Icons'
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

/** Strip upstream platform brand names from error text. */
function sanitizeError(message: string): string {
  return message.replace(/\bcoolify\b/gi, 'CoolDev')
}

function getErrorMessage(error: unknown, fallback: string): string {
  if (error instanceof Error && error.message) {
    return sanitizeError(error.message)
  }
  return fallback
}

function accessChipClass(accessStatus: ApiAccessStatus | null, accessError: string | null): string {
  if (accessError) return 'chip-failed'
  if (!accessStatus) return 'chip-neutral'
  if (accessStatus.status === 'live') return 'chip-ready'
  if (
    accessStatus.status === 'bootstrap'
    || accessStatus.status === 'pending-dns'
    || accessStatus.status === 'provisioning-ssl'
  ) return 'chip-neutral'
  return 'chip-failed'
}

function accessChipLabel(accessStatus: ApiAccessStatus | null, accessError: string | null): string {
  if (accessError) return 'Unavailable'
  if (!accessStatus) return 'Checking'
  switch (accessStatus.status) {
    case 'live': return 'Live'
    case 'bootstrap': return 'Bootstrap'
    case 'pending-dns': return 'Waiting for DNS'
    case 'provisioning-ssl': return 'Provisioning'
    default: return 'Unavailable'
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
  const [twoFactorCapable, setTwoFactorCapable] = useState<boolean | null>(null)
  const [copiedCodes, setCopiedCodes] = useState(false)
  const codeInputRef = useRef<HTMLInputElement>(null)

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

      if (cancelled) return

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
        if (profileErr instanceof ApiError && profileErr.status === 404) {
          setTwoFactorCapable(false)
        }
        setProfileError(
          getErrorMessage(profileErr, 'Could not load the current profile.'),
        )
        setTwoFactorSetup(null)
        setTwoFactorCode('')
      }

      if (!cancelled) {
        if (preferencesResult.status === 'fulfilled') {
          setAutoBackups(preferencesResult.value.autoBackups)
        } else {
          setAutoBackups(localStorage.getItem('cooldev-auto-backups') !== 'false')
        }
        setAutoBackupsLoaded(true)
      }
    }

    void loadWorkspaceMetadata()
    return () => { cancelled = true }
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
    return () => { window.clearInterval(timerId) }
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
    return () => { window.clearTimeout(timerId) }
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
        setWorkspaceDomainError(sanitizeError(errorData?.message ?? error.message))
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
      setTimeout(() => codeInputRef.current?.focus(), 300)
    } catch (error) {
      if (error instanceof ApiError && error.status === 404) {
        setTwoFactorCapable(false)
        setSecurityError(
          'Two-factor authentication is not available on this CoolDev installation. Update CoolDev to enable it.',
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
        setSecurityError('Two-factor authentication is not available on this CoolDev installation.')
      } else {
        setSecurityError(getErrorMessage(error, 'Could not disable two-factor authentication.'))
      }
    } finally {
      setSecurityAction('idle')
    }
  }

  function copyRecoveryCodes() {
    if (!twoFactorSetup) return
    void navigator.clipboard.writeText(twoFactorSetup.recoveryCodes.join('\n')).then(() => {
      setCopiedCodes(true)
      setTimeout(() => setCopiedCodes(false), 2000)
    })
  }

  // ── Derived values ───────────────────────────────────────────────────────────

  const canManageWorkspaceDomain = platformReady && accessStatus?.proxyProvider !== 'unavailable'
  const workspaceSettingsFallbackActive = instanceSettingsStatus === 'failed' && canManageWorkspaceDomain

  const instanceStatusSummary =
    instanceSettingsStatus === 'ready' && instanceSettings
      ? `${instanceSettings.instance_name}${instanceSettings.instance_timezone ? ` • ${instanceSettings.instance_timezone}` : ''}${instanceSettings.public_ipv4 ? ` • ${instanceSettings.public_ipv4}` : ''}`
      : instanceSettingsStatus === 'checking'
        ? 'Loading shared workspace settings…'
        : workspaceSettingsFallbackActive
          ? 'Shared workspace settings are not available yet. Domain management still works in CoolDev.'
          : instanceSettingsError ?? 'Workspace settings unavailable.'

  const twoFaStatusText =
    twoFactorCapable === false
      ? 'Not Available'
      : profileStatus === 'checking'
        ? 'Checking…'
        : profileStatus === 'failed'
          ? 'Unavailable'
          : profile?.two_factor_enabled
            ? 'Enabled'
            : profile?.two_factor_pending
              ? 'Pending'
              : 'Disabled'

  const twoFaChipClass =
    twoFactorCapable === false ? 'chip-failed'
      : profileStatus === 'checking' ? 'chip-neutral'
        : profileStatus === 'failed' ? 'chip-failed'
          : profile?.two_factor_enabled ? 'chip-ready'
            : profile?.two_factor_pending ? 'chip-neutral'
              : 'chip-failed'

  const twoFaSummary =
    twoFactorCapable === false
      ? 'Two-factor authentication is not available on this CoolDev installation.'
      : profileStatus === 'checking'
        ? 'Loading the authenticated user profile…'
        : profileStatus === 'failed'
          ? profileError ?? 'Profile unavailable.'
          : profile?.two_factor_enabled
            ? 'This account is protected with an authenticator app and recovery codes.'
            : profile?.two_factor_pending
              ? 'Scan the QR code and enter the 6-digit code below to finish setup.'
              : 'Add a second layer of security to protect your account.'

  const bootstrapAccessUrl = accessStatus?.bootstrapUrl || window.location.origin
  const currentDomainLabel = accessStatus?.currentDomain?.trim()
    ? `Active: ${accessStatus.currentDomain}`
    : `No custom domain configured — using ${bootstrapAccessUrl}`

  const domainAccessChipClass = accessChipClass(accessStatus, accessStatusError)
  const domainAccessChipLabel = accessChipLabel(accessStatus, accessStatusError)

  const sslChipLabel = accessStatus?.sslStatus === 'ready' ? 'Ready'
    : accessStatus?.sslStatus === 'pending' ? 'Automatic'
      : accessStatus?.sslStatus === 'unavailable' ? 'Unavailable'
        : 'Inactive'
  const sslChipClass = accessStatus?.sslStatus === 'ready' ? 'chip-ready'
    : accessStatus?.sslStatus === 'pending' ? 'chip-neutral'
      : accessStatus?.sslStatus === 'inactive' ? 'chip-neutral'
        : 'chip-failed'

  const openSecureDomainUrl = accessStatus?.status === 'live' ? accessStatus.secureUrl : null

  const sslSummary = accessStatus?.status === 'live'
    ? `HTTPS is active on ${accessStatus.secureUrl}.`
    : accessStatus?.status === 'pending-dns'
      ? 'Certificates will be issued automatically after DNS points to this server.'
      : accessStatus?.status === 'provisioning-ssl'
        ? 'CoolDev is requesting a TLS certificate and switching traffic to 80/443.'
        : accessStatus?.status === 'bootstrap'
          ? 'Save a domain to enable automatic HTTPS.'
          : accessStatus?.status === 'unavailable'
            ? (accessStatus.detail ?? 'Domain automation unavailable.')
            : 'Checking domain automation status…'

  const isSetupInProgress = Boolean(twoFactorSetup || profile?.two_factor_pending)

  return (
    <section className="content-grid settings-view">

      {/* ── Workspace session ─────────────────────────────────── */}
      <article className="panel panel-wide settings-panel">
        <div className="panel-heading">
          <div>
            <p className="eyebrow">Session</p>
            <h3>Workspace overview</h3>
          </div>
          <button
            type="button"
            className="secondary-action danger-action"
            onClick={() => void disconnect()}
          >
            Sign out
          </button>
        </div>

        <div className="settings-grid-4">
          <div className="settings-stat-card">
            <span className="settings-stat-label">Runtime</span>
            <span className={`chip ${platformReady ? 'chip-ready' : 'chip-neutral'}`}>
              {platformReady ? 'Ready' : 'Starting'}
            </span>
            <p className="settings-stat-detail">
              {platformReady ? 'Connected and operating normally.' : 'Still finishing setup for this workspace.'}
            </p>
          </div>

          <div className="settings-stat-card">
            <span className="settings-stat-label">Health</span>
            <span className={`chip ${platformHealthStatus === 'ready' ? 'chip-ready' : platformHealthStatus === 'checking' ? 'chip-neutral' : 'chip-failed'}`}>
              {platformHealthStatus === 'ready' ? 'Healthy' : platformHealthStatus === 'checking' ? 'Checking' : 'Unreachable'}
            </span>
            <p className="settings-stat-detail">
              {platformHealthStatus === 'ready'
                ? 'Health check passed.'
                : platformHealthStatus === 'checking'
                  ? 'Running health check…'
                  : (platformHealthError ?? 'Cannot reach the workspace runtime.')}
            </p>
          </div>

          <div className="settings-stat-card">
            <span className="settings-stat-label">Version</span>
            <span className={`chip ${platformVersionStatus === 'ready' ? 'chip-ready' : platformVersionStatus === 'checking' ? 'chip-neutral' : 'chip-failed'}`}>
              {platformVersionStatus === 'ready' ? (platformVersion ?? 'Unknown') : platformVersionStatus === 'checking' ? 'Detecting' : 'Unknown'}
            </span>
            <p className="settings-stat-detail">
              {platformVersion ? `Running v${platformVersion}.` : platformVersionStatus === 'checking' ? 'Detecting runtime version…' : 'Version unavailable.'}
            </p>
          </div>

          <div className="settings-stat-card">
            <span className="settings-stat-label">Team</span>
            <span className={`chip ${teamStatus === 'ready' ? 'chip-ready' : teamStatus === 'checking' ? 'chip-neutral' : 'chip-failed'}`}>
              {teamStatus === 'ready' ? 'Synced' : teamStatus === 'checking' ? 'Loading' : 'Unavailable'}
            </span>
            <p className="settings-stat-detail">
              {teamStatus === 'ready' && currentTeam
                ? `${currentTeam.name}${currentTeamMemberCount !== null ? ` · ${currentTeamMemberCount} ${currentTeamMemberCount === 1 ? 'member' : 'members'}` : ''}`
                : teamStatus === 'checking'
                  ? 'Loading the active workspace team…'
                  : 'Team context unavailable.'}
            </p>
          </div>
        </div>
      </article>

      {/* ── Domain & HTTPS ───────────────────────────────────── */}
      <article className="panel settings-panel">
        <div className="panel-heading">
          <div>
            <p className="eyebrow">Network</p>
            <h3>Domain & HTTPS</h3>
          </div>
        </div>

        <p className="settings-description">
          CoolDev is accessible immediately on the bootstrap URL. Point your DNS and save a
          custom domain — CoolDev handles the 80/443 cutover and TLS certificate automatically.
        </p>

        <div className="settings-status-list">
          <div className="settings-status-item">
            <div className="settings-status-body">
              <strong>Bootstrap URL</strong>
              <small style={{ fontFamily: 'var(--font-mono)', fontSize: '0.74rem' }}>{bootstrapAccessUrl}</small>
            </div>
            <span className="chip chip-ready">Live</span>
          </div>

          <div className="settings-status-item">
            <div className="settings-status-body">
              <strong>Domain cutover</strong>
              <small>{accessStatusError ?? accessStatus?.summary ?? 'Checking domain automation status…'}</small>
            </div>
            <span className={`chip ${domainAccessChipClass}`}>{domainAccessChipLabel}</span>
          </div>

          <div className="settings-status-item">
            <div className="settings-status-body">
              <strong>HTTPS certificates</strong>
              <small>{sslSummary}</small>
            </div>
            <span className={`chip ${sslChipClass}`}>{sslChipLabel}</span>
          </div>

          <div className="settings-status-item">
            <div className="settings-status-body">
              <strong>Workspace settings</strong>
              <small>{instanceStatusSummary}</small>
            </div>
            <span className={`chip ${instanceSettingsStatus === 'ready' ? 'chip-ready' : instanceSettingsStatus === 'checking' ? 'chip-neutral' : 'chip-failed'}`}>
              {instanceSettingsStatus === 'ready' ? 'Synced' : instanceSettingsStatus === 'checking' ? 'Checking' : 'Unavailable'}
            </span>
          </div>
        </div>

        <div className="settings-subform">
          <label className="field">
            <span>Custom domain</span>
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
              CoolDev will keep this domain active locally while shared settings remain unavailable.
            </p>
          )}

          <label className="settings-checkbox-row">
            <input
              type="checkbox"
              checked={forceDomainOverride}
              onChange={(event) => setForceDomainOverride(event.currentTarget.checked)}
              disabled={!canManageWorkspaceDomain || isSavingWorkspaceDomain}
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
            <ul className="settings-conflict-list">
              {workspaceDomainConflicts.map((conflict) => (
                <li key={`${conflict.resource_type}-${conflict.resource_uuid ?? conflict.resource_name}-${conflict.domain}`}>
                  <span className="settings-conflict-domain">{conflict.domain}</span>
                  <span>{conflict.resource_name} ({conflict.resource_type})</span>
                </li>
              ))}
            </ul>
          )}

          {redirectingToSecureDomain && openSecureDomainUrl && (
            <div className="info-banner">
              <ExternalLinkIcon size={13} />
              <p>Secure domain is live. Redirecting to {openSecureDomainUrl}…</p>
            </div>
          )}

          <div className="settings-form-actions">
            <button
              type="button"
              className="primary-action"
              onClick={() => void saveWorkspaceDomain()}
              disabled={!canManageWorkspaceDomain || isSavingWorkspaceDomain}
            >
              {isSavingWorkspaceDomain ? 'Saving…' : workspaceDomainSaved ? '✓ Saved' : 'Save domain'}
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

            <span className="field-hint settings-domain-hint">{currentDomainLabel}</span>
          </div>

          {accessStatus?.detail && (
            <p className="field-hint" style={{ margin: 0 }}>{accessStatus.detail}</p>
          )}
        </div>
      </article>

      {/* ── Two-factor authentication ────────────────────────── */}
      <article className="panel settings-panel">
        <div className="panel-heading">
          <div>
            <p className="eyebrow">Security</p>
            <h3>Two-factor authentication</h3>
          </div>
          <ShieldIcon size={16} />
        </div>

        {/* Account row */}
        <div className="settings-status-item" style={{ marginBottom: 4 }}>
          <div className="settings-status-body">
            <strong>Account</strong>
            <small>
              {profileStatus === 'ready' && profile
                ? `${profile.name} · ${profile.email}`
                : profileStatus === 'checking'
                  ? 'Loading account…'
                  : (profileError ?? 'Profile unavailable.')}
            </small>
          </div>
          <span className={`chip ${twoFaChipClass}`}>{twoFaStatusText}</span>
        </div>

        {/* 2FA state card */}
        <div className={`twofa-state-card ${
          twoFactorCapable === false ? 'twofa-unavailable'
            : profile?.two_factor_enabled ? 'twofa-enabled'
              : 'twofa-disabled'
        }`}>
          <div className="twofa-state-icon">
            <ShieldIcon size={22} />
          </div>
          <div className="twofa-state-body">
            <strong>
              {twoFactorCapable === false ? 'Not available on this installation'
                : profile?.two_factor_enabled ? '2FA is active'
                  : profile?.two_factor_pending ? 'Setup in progress'
                    : '2FA is not enabled'}
            </strong>
            <p>{twoFaSummary}</p>
          </div>
        </div>

        {securityError && (
          <div className="error-banner" style={{ marginTop: 10 }}>
            <AlertIcon size={13} />
            <span>{securityError}</span>
          </div>
        )}

        {/* Action buttons */}
        {profileStatus === 'ready' && twoFactorCapable !== false && (
          <div className="settings-form-actions" style={{ marginTop: 10 }}>
            {!profile?.two_factor_enabled && (
              <button
                type="button"
                className="primary-action"
                onClick={() => void handleEnableTwoFactor()}
                disabled={securityAction !== 'idle'}
              >
                {securityAction === 'enabling'
                  ? 'Preparing setup…'
                  : profile?.two_factor_pending
                    ? 'Generate new QR code'
                    : 'Enable 2FA'}
              </button>
            )}

            {profile?.two_factor_enabled && (
              <button
                type="button"
                className="secondary-action danger-action"
                onClick={() => void handleDisableTwoFactor()}
                disabled={securityAction !== 'idle'}
              >
                {securityAction === 'disabling' ? 'Disabling…' : 'Disable 2FA'}
              </button>
            )}
          </div>
        )}

        {/* Setup flow */}
        {isSetupInProgress && (
          <div className="settings-subform twofa-setup-form">
            {twoFactorSetup && (
              <>
                <div className="twofa-setup-steps">
                  <div className="twofa-step">
                    <span className="twofa-step-num">1</span>
                    <div className="twofa-step-body">
                      <strong>Scan QR code</strong>
                      <p>Open your authenticator app (Google Authenticator, Authy, etc.) and scan this code.</p>
                      <div className="twofa-qr-wrapper">
                        <div
                          className="twofa-qr"
                          dangerouslySetInnerHTML={{ __html: twoFactorSetup.qrCodeSvg }}
                        />
                      </div>
                    </div>
                  </div>

                  <div className="twofa-step">
                    <span className="twofa-step-num">2</span>
                    <div className="twofa-step-body">
                      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8 }}>
                        <strong>Save recovery codes</strong>
                        <button
                          type="button"
                          className="secondary-action"
                          style={{ padding: '4px 10px', fontSize: '0.75rem' }}
                          onClick={copyRecoveryCodes}
                        >
                          {copiedCodes ? <><CheckIcon size={12} /> Copied</> : <><CopyIcon size={12} /> Copy all</>}
                        </button>
                      </div>
                      <p>Store these in a safe place. Each code can only be used once if you lose access to your authenticator.</p>
                      <ul className="twofa-recovery-grid">
                        {twoFactorSetup.recoveryCodes.map((code) => (
                          <li key={code} className="twofa-recovery-code">{code}</li>
                        ))}
                      </ul>
                    </div>
                  </div>

                  <div className="twofa-step">
                    <span className="twofa-step-num">3</span>
                    <div className="twofa-step-body">
                      <strong>Confirm setup</strong>
                      <p>Enter the current 6-digit code from your authenticator app to activate 2FA.</p>
                    </div>
                  </div>
                </div>
              </>
            )}

            {!twoFactorSetup && (
              <p className="field-hint" style={{ margin: 0 }}>
                Enter the current 6-digit code from your authenticator app, or generate a new QR code above.
              </p>
            )}

            <div className="twofa-confirm-row">
              <label className="field" style={{ flex: 1 }}>
                <span>Authenticator code</span>
                <input
                  ref={codeInputRef}
                  type="text"
                  inputMode="numeric"
                  autoComplete="one-time-code"
                  maxLength={6}
                  value={twoFactorCode}
                  onChange={(event) => setTwoFactorCode(event.currentTarget.value)}
                  placeholder="123456"
                  disabled={securityAction !== 'idle'}
                  style={{ letterSpacing: '0.2em', fontFamily: 'var(--font-mono)', fontSize: '1.1rem' }}
                />
              </label>
              <button
                type="button"
                className="primary-action"
                style={{ alignSelf: 'flex-end' }}
                onClick={() => void handleConfirmTwoFactor()}
                disabled={securityAction !== 'idle' || twoFactorCode.length < 6}
              >
                {securityAction === 'confirming' ? 'Confirming…' : 'Confirm & Activate'}
              </button>
            </div>
          </div>
        )}
      </article>

      {/* ── Automatic backups ─────────────────────────────────── */}
      <article className="panel settings-panel">
        <div className="panel-heading">
          <div>
            <p className="eyebrow">Databases</p>
            <h3>Automatic backups</h3>
          </div>
        </div>

        <p className="settings-description">
          When enabled, CoolDev applies a default daily backup schedule to every
          backup-supported managed database provisioned through the New Resource flow.
        </p>

        <div className="settings-toggle-card">
          <div className="settings-toggle-info">
            <strong>Auto-backup managed databases</strong>
            <p>Applies the default workspace backup schedule on creation for supported engines. Preference is saved server-side and persists across sessions.</p>
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
      </article>

      {/* ── SSH keys ─────────────────────────────────────────── */}
      <article className="panel settings-panel">
        <div className="panel-heading">
          <div>
            <p className="eyebrow">Access keys</p>
            <h3>SSH keys</h3>
          </div>
          <KeyIcon size={16} />
        </div>

        <p className="settings-description">
          SSH keys are managed in the Providers section — add, view, and delete keys used
          for server connections and private repository deployments.
        </p>

        <div className="settings-status-item">
          <div className="settings-status-body">
            <strong>Key management</strong>
            <small>Add or remove SSH keys for deploy operations and server connections.</small>
          </div>
          <a
            href="/simple/providers"
            className="secondary-action"
            style={{ textDecoration: 'none', flexShrink: 0 }}
            onClick={(e) => {
              e.preventDefault()
              window.history.pushState({}, '', '/simple/providers')
              window.dispatchEvent(new PopStateEvent('popstate'))
            }}
          >
            <ExternalLinkIcon size={13} />
            Manage keys
          </a>
        </div>
      </article>

    </section>
  )
}
