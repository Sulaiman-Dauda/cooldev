import { useEffect, useState } from 'react'
import { onboardingAutomations, postConnectionSteps, serverRequirements } from '../data/productDefaults'
import {
  createPrivateKey,
  createServer,
  listPrivateKeys,
  listServers,
  validateServer,
  type ApiPrivateKey,
  type ApiServer,
} from '../lib/api'
import type { View } from '../types'

type OnboardingViewProps = {
  onNavigate: (view: View) => void
  onComplete?: () => void
}

export function OnboardingView({ onNavigate, onComplete }: OnboardingViewProps) {
  const [serverName, setServerName] = useState('primary-vps')
  const [ipAddress, setIpAddress] = useState('203.0.113.10')
  const [region, setRegion] = useState('Frankfurt')
  const [showAdvanced, setShowAdvanced] = useState(false)
  const [sshUser, setSshUser] = useState('root')
  const [sshPort, setSshPort] = useState('22')
  const [existingServers, setExistingServers] = useState<ApiServer[]>([])
  const [serversLoading, setServersLoading] = useState(true)
  const [serversError, setServersError] = useState<string | null>(null)
  const [privateKeys, setPrivateKeys] = useState<ApiPrivateKey[]>([])
  const [keysLoading, setKeysLoading] = useState(true)
  const [keysError, setKeysError] = useState<string | null>(null)
  const [sshKeyMode, setSshKeyMode] = useState<'existing' | 'paste'>('existing')
  const [selectedPrivateKeyUuid, setSelectedPrivateKeyUuid] = useState('')
  const [newPrivateKeyName, setNewPrivateKeyName] = useState('')
  const [newPrivateKeyValue, setNewPrivateKeyValue] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [submitError, setSubmitError] = useState<string | null>(null)

  useEffect(() => {
    let cancelled = false

    async function loadServerSetupState() {
      setServersLoading(true)
      setServersError(null)
      setKeysLoading(true)
      setKeysError(null)

      const [serversResult, keysResult] = await Promise.allSettled([
        listServers(),
        listPrivateKeys(),
      ])

      if (cancelled) {
        return
      }

      if (serversResult.status === 'fulfilled') {
        setExistingServers(serversResult.value)
      } else {
        setServersError(
          serversResult.reason instanceof Error
            ? serversResult.reason.message
            : String(serversResult.reason),
        )
      }
      setServersLoading(false)

      if (keysResult.status === 'fulfilled') {
        setPrivateKeys(keysResult.value.filter((key) => key.is_git_related !== true))
      } else {
        setKeysError(
          keysResult.reason instanceof Error
            ? keysResult.reason.message
            : String(keysResult.reason),
        )
      }
      setKeysLoading(false)
    }

    void loadServerSetupState()

    return () => {
      cancelled = true
    }
  }, [])

  useEffect(() => {
    if (keysLoading) {
      return
    }

    const firstPrivateKey = privateKeys[0]

    if (!firstPrivateKey) {
      setSelectedPrivateKeyUuid('')
      setSshKeyMode('paste')
      return
    }

    if (!privateKeys.some((key) => key.uuid === selectedPrivateKeyUuid)) {
      setSelectedPrivateKeyUuid(firstPrivateKey.uuid)
    }
  }, [keysLoading, privateKeys, selectedPrivateKeyUuid])

  const readinessChecks = [
    {
      label: 'Server identity',
      value: serverName.length > 2 ? 'Ready' : 'Missing name',
    },
    {
      label: 'Reachable IP',
      value: ipAddress.includes('.') ? 'Ready' : 'Add IP address',
    },
    {
      label: 'SSH defaults',
      value: `${sshUser}@${ipAddress}:${sshPort}`,
    },
    {
      label: 'SSH key',
      value: privateKeys.length > 0
        ? `${privateKeys.length} saved ${privateKeys.length === 1 ? 'key' : 'keys'} available`
        : 'Paste a private key once',
    },
    {
      label: 'Proxy mode',
      value: showAdvanced ? 'Advanced controls open' : 'Automatic by default',
    },
  ]

  async function resolvePrivateKeyUuid(nextServerName: string): Promise<string> {
    if (sshKeyMode === 'existing' && selectedPrivateKeyUuid) {
      return selectedPrivateKeyUuid
    }

    const trimmedPrivateKey = newPrivateKeyValue.trim()
    if (!trimmedPrivateKey) {
      throw new Error('Choose a saved SSH key or paste a new private key before continuing.')
    }

    const nextKeyName = newPrivateKeyName.trim() || `${nextServerName} SSH key`
    const createdKey = await createPrivateKey({
      name: nextKeyName,
      description: `SSH key created by CoolDev for ${nextServerName}.`,
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
          description: `SSH key created by CoolDev for ${nextServerName}.`,
          is_git_related: false,
        },
      ]
    })
    setSelectedPrivateKeyUuid(createdKey.uuid)
    return createdKey.uuid
  }

  async function handleContinue() {
    if (existingServers.length > 0) {
      onComplete?.()
      onNavigate(onComplete ? 'home' : 'new')
      return
    }

    const trimmedName = serverName.trim()
    const trimmedIpAddress = ipAddress.trim()
    const trimmedRegion = region.trim()
    const trimmedSshUser = sshUser.trim()
    const trimmedSshPort = Number(sshPort.trim())

    if (!trimmedName) {
      setSubmitError('Enter a server name before continuing.')
      return
    }

    if (!trimmedIpAddress) {
      setSubmitError('Enter the public IP address for the server.')
      return
    }

    if (!Number.isFinite(trimmedSshPort) || trimmedSshPort <= 0) {
      setSubmitError('Enter a valid SSH port before continuing.')
      return
    }

    setSubmitting(true)
    setSubmitError(null)

    try {
      const privateKeyUuid = await resolvePrivateKeyUuid(trimmedName)
      const server = await createServer({
        name: trimmedName,
        ip: trimmedIpAddress,
        port: trimmedSshPort,
        user: trimmedSshUser || 'root',
        description: trimmedRegion ? `Region: ${trimmedRegion}` : undefined,
        private_key_uuid: privateKeyUuid,
      })

      await validateServer(server.uuid)

      try {
        setExistingServers(await listServers())
      } catch {
        setExistingServers((current) => {
          const hasServer = current.some((item) => item.uuid === server.uuid)
          if (hasServer) {
            return current
          }

          return [
            ...current,
            {
              uuid: server.uuid,
              name: trimmedName,
              ip: trimmedIpAddress,
              port: trimmedSshPort,
              user: trimmedSshUser || 'root',
              description: trimmedRegion ? `Region: ${trimmedRegion}` : undefined,
            },
          ]
        })
      }

      onComplete?.()
      onNavigate(onComplete ? 'home' : 'new')
    } catch (err) {
      setSubmitError(err instanceof Error ? err.message : String(err))
    } finally {
      setSubmitting(false)
    }
  }

  const continueDisabled = submitting || (existingServers.length === 0 && keysLoading && sshKeyMode === 'existing')
  const hasConnectedServers = !serversLoading && !serversError && existingServers.length > 0

  if (hasConnectedServers) {
    return (
      <section className="content-grid">
        <article className="panel panel-wide">
          <div className="panel-heading">
            <div>
              <p className="eyebrow">Connected servers</p>
              <h3>Deployment server ready</h3>
            </div>
          </div>

          <div className="split-panel">
            <div className="subpanel">
              <p className="field-hint" style={{ marginBottom: 12 }}>
                CoolDev already connected the server that was installed on this machine.
                You can deploy immediately or add more servers later if you need them.
              </p>
              <ul className="plain-list readiness-list compact-list">
                {existingServers.map((server) => (
                  <li key={server.uuid}>
                    <strong>{server.name}</strong>
                    <span>{server.user}@{server.ip}:{server.port}</span>
                  </li>
                ))}
              </ul>
            </div>

            <div className="stacked-panel">
              <div className="subpanel">
                <p className="eyebrow">SSH access</p>
                {keysLoading ? (
                  <p className="field-hint">Loading saved SSH keys…</p>
                ) : keysError ? (
                  <p className="field-hint">Could not load saved SSH keys. {keysError}</p>
                ) : privateKeys.length === 0 ? (
                  <p className="field-hint">No saved SSH keys are available yet.</p>
                ) : (
                  <p className="field-hint">
                    CoolDev already has {privateKeys.length} saved SSH {privateKeys.length === 1 ? 'key' : 'keys'}
                    {' '}ready for this workspace.
                  </p>
                )}
              </div>

              <div className="subpanel">
                <p className="eyebrow">Handled for you</p>
                <ul className="plain-list compact-list">
                  {onboardingAutomations.map((item) => (
                    <li key={item.label}>
                      <span><strong>{item.label}</strong> — {item.detail}</span>
                    </li>
                  ))}
                </ul>
              </div>
            </div>
          </div>

          <div
            style={{
              marginTop: '20px',
              paddingTop: '20px',
              borderTop: '1px solid var(--border)',
              display: 'flex',
              justifyContent: 'flex-end',
              gap: '10px',
            }}
          >
            {onComplete ? (
              <button
                type="button"
                className="secondary-action"
                onClick={() => {
                  onComplete()
                  onNavigate('home')
                }}
              >
                Back to dashboard
              </button>
            ) : null}
            <button
              type="button"
              className="primary-action"
              onClick={() => {
                onComplete?.()
                onNavigate('new')
              }}
            >
              Open deploy wizard
            </button>
          </div>
        </article>

        <article className="panel">
          <div className="panel-heading">
            <div>
              <p className="eyebrow">Server requirements</p>
              <h3>What your server needs</h3>
            </div>
          </div>
          <ul className="plain-list">
            {serverRequirements.map((req) => (
              <li key={req}>{req}</li>
            ))}
          </ul>
        </article>

        <article className="panel">
          <div className="panel-heading">
            <div>
              <p className="eyebrow">Next step</p>
              <h3>Deploy your first resource</h3>
            </div>
          </div>
          <div className="timeline">
            {postConnectionSteps.map((step, index) => (
              <div
                key={step.label}
                className={`timeline-item${index === 0 ? ' is-current' : ''}`}
              >
                <strong>{step.label}</strong>
                <span>{step.detail}</span>
              </div>
            ))}
          </div>
        </article>
      </section>
    )
  }

  return (
    <section className="content-grid">
      <article className="panel panel-wide">
        <div className="panel-heading">
          <div>
            <p className="eyebrow">Server setup</p>
            <h3>Connect your first server</h3>
          </div>
        </div>

        <div className="step-progress">
          <div className="step-progress-item is-done">
            <div className="step-progress-dot">1</div>
            <span>Create account</span>
          </div>
          <div className="step-progress-line" />
          <div className="step-progress-item is-current">
            <div className="step-progress-dot">2</div>
            <span>Connect server</span>
          </div>
          <div className="step-progress-line" />
          <div className="step-progress-item">
            <div className="step-progress-dot">3</div>
            <span>Deploy app</span>
          </div>
        </div>

        <div className="split-panel">
          <div className="form-grid">
            <label className="field">
              <span>Server name</span>
              <input
                value={serverName}
                onChange={(event) => setServerName(event.currentTarget.value)}
                placeholder="primary-vps"
              />
            </label>
            <label className="field">
              <span>Public IP</span>
              <input
                value={ipAddress}
                onChange={(event) => setIpAddress(event.currentTarget.value)}
                placeholder="203.0.113.10"
              />
            </label>
            <label className="field field-wide">
              <span>Region label</span>
              <input
                value={region}
                onChange={(event) => setRegion(event.currentTarget.value)}
                placeholder="Frankfurt"
              />
            </label>
            <div className="toggle-row field-wide">
              <div>
                <strong>Advanced server options</strong>
                <p className="field-hint">
                  Keep proxy and SSH tweaks hidden by default. Open for edge cases only.
                </p>
              </div>
              <button
                type="button"
                className="secondary-action"
                onClick={() => setShowAdvanced((value) => !value)}
              >
                {showAdvanced ? 'Hide advanced' : 'Show advanced'}
              </button>
            </div>
            {showAdvanced ? (
              <>
                <label className="field">
                  <span>SSH user</span>
                  <input
                    value={sshUser}
                    onChange={(event) => setSshUser(event.currentTarget.value)}
                    placeholder="root"
                  />
                </label>
                <label className="field">
                  <span>SSH port</span>
                  <input
                    value={sshPort}
                    onChange={(event) => setSshPort(event.currentTarget.value)}
                    placeholder="22"
                  />
                </label>
              </>
            ) : null}
            <div className="field-wide">
              <div className="toggle-row">
                <div>
                  <strong>SSH access</strong>
                  <p className="field-hint">
                    CoolDev reuses a saved SSH key when one already exists. Otherwise,
                    paste a private key once and CoolDev stores it for this team.
                  </p>
                </div>
                {privateKeys.length > 0 ? (
                  <div className="segmented-control" aria-label="SSH key mode">
                    <button
                      type="button"
                      className={sshKeyMode === 'existing' ? 'segment is-active' : 'segment'}
                      onClick={() => setSshKeyMode('existing')}
                    >
                      Use saved key
                    </button>
                    <button
                      type="button"
                      className={sshKeyMode === 'paste' ? 'segment is-active' : 'segment'}
                      onClick={() => setSshKeyMode('paste')}
                    >
                      Paste new key
                    </button>
                  </div>
                ) : null}
              </div>

              {keysLoading ? (
                <p className="field-hint">Loading saved SSH keys…</p>
              ) : null}

              {keysError ? (
                <p className="field-hint">Could not load saved SSH keys. {keysError}</p>
              ) : null}

              {sshKeyMode === 'existing' && privateKeys.length > 0 ? (
                <label className="field">
                  <span>Saved SSH key</span>
                  <select
                    value={selectedPrivateKeyUuid}
                    onChange={(event) => setSelectedPrivateKeyUuid(event.currentTarget.value)}
                  >
                    {privateKeys.map((key) => (
                      <option key={key.uuid} value={key.uuid}>
                        {key.name}{key.fingerprint ? ` — ${key.fingerprint}` : ''}
                      </option>
                    ))}
                  </select>
                  <small className="field-hint">
                    Reuse an SSH key already stored for this team.
                  </small>
                </label>
              ) : (
                <>
                  <label className="field">
                    <span>SSH key name</span>
                    <input
                      value={newPrivateKeyName}
                      onChange={(event) => setNewPrivateKeyName(event.currentTarget.value)}
                      placeholder="primary-vps SSH key"
                    />
                  </label>
                  <label className="field field-wide">
                    <span>Private key</span>
                    <textarea
                      value={newPrivateKeyValue}
                      onChange={(event) => setNewPrivateKeyValue(event.currentTarget.value)}
                      rows={8}
                      placeholder="Paste your OpenSSH private key"
                    />
                    <small className="field-hint">
                      Paste the SSH private key the platform should use for this server.
                    </small>
                  </label>
                </>
              )}

            {submitError ? (
              <p className="field-hint field-wide">Could not connect the server. {submitError}</p>
            ) : null}
          </div>

          <div className="stacked-panel">
              <p className="eyebrow">Connected servers</p>
              {serversLoading ? (
                <p className="field-hint">Checking your workspace for existing servers…</p>
              ) : serversError ? (
                <p className="field-hint">Could not load existing servers. {serversError}</p>
              ) : existingServers.length === 0 ? (
                <p className="field-hint">No servers connected yet. Add your first server below.</p>
              ) : (
                <>
                  <p className="field-hint" style={{ marginBottom: 12 }}>
                    This workspace already has {existingServers.length} connected
                    {existingServers.length === 1 ? ' server' : ' servers'}. You can keep using them from CoolDev.
                  </p>
                  <ul className="plain-list readiness-list compact-list">
                    {existingServers.slice(0, 3).map((server) => (
                      <li key={server.uuid}>
                        <strong>{server.name}</strong>
                        <span>{server.user}@{server.ip}:{server.port}</span>
                      </li>
                    ))}
                  </ul>
                </>
              )}
            </div>
            <div className="subpanel">
              <p className="eyebrow">Handled for you</p>
              <ul className="plain-list compact-list">
                {onboardingAutomations.map((item) => (
                  <li key={item.label}>
                    <span><strong>{item.label}</strong> — {item.detail}</span>
                  </li>
                ))}
              </ul>
            </div>
            <div className="subpanel">
              <p className="eyebrow">Readiness</p>
              <ul className="plain-list readiness-list compact-list">
                {readinessChecks.map((item) => (
                  <li key={item.label}>
                    <strong>{item.label}</strong>
                    <span>{item.value}</span>
                  </li>
                ))}
              </ul>
            </div>
          </div>
        </div>

        <div
          style={{
            marginTop: '20px',
            paddingTop: '20px',
            borderTop: '1px solid var(--border)',
            display: 'flex',
            justifyContent: 'flex-end',
            gap: '10px',
          }}
        >
          {onComplete ? (
            <button
              type="button"
              className="primary-action"
              onClick={() => void handleContinue()}
              disabled={continueDisabled}
            >
              {submitting ? 'Connecting server…' : 'Continue to dashboard'}
            </button>
          ) : (
            <button
              type="button"
              className="primary-action"
              onClick={() => void handleContinue()}
              disabled={continueDisabled}
            >
              {submitting ? 'Connecting server…' : 'Continue to deploy wizard'}
            </button>
          )}
        </div>
      </article>

      <article className="panel">
        <div className="panel-heading">
          <div>
            <p className="eyebrow">Server requirements</p>
            <h3>What your server needs</h3>
          </div>
        </div>
        <ul className="plain-list">
          {serverRequirements.map((req) => (
            <li key={req}>{req}</li>
          ))}
        </ul>
      </article>

      <article className="panel">
        <div className="panel-heading">
          <div>
            <p className="eyebrow">After connection</p>
            <h3>What happens next</h3>
          </div>
        </div>
        <div className="timeline">
          {postConnectionSteps.map((step, index) => (
            <div
              key={step.label}
              className={`timeline-item${index === 0 ? ' is-current' : ''}`}
            >
              <strong>{step.label}</strong>
              <span>{step.detail}</span>
            </div>
          ))}
        </div>
      </article>
    </section>
  )
}