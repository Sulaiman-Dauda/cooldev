import { Fragment, useEffect, useState } from 'react'
import { providerConnections } from '../data/productDefaults'
import {
  ApiError,
  createPrivateKey,
  deletePrivateKey,
  getAccessStatus,
  getGithubAppStatus,
  getWebhookConfig,
  initiateGithubAppSetup,
  listApplications,
  listGithubApps,
  listPrivateKeys,
  regenerateWebhookSecret,
  type ApiGithubAppStatus,
  type ApiAccessStatus,
  type ApiWebhookConfig,
  type ApiApplication,
  type ApiGithubApp,
  type ApiPrivateKey,
} from '../lib/api'
import { guessProviderFromUrl } from '../lib/providerDetection'
import { AlertIcon, CopyIcon, ExternalLinkIcon, KeyIcon, PlusIcon, RefreshCwIcon, TrashIcon, WebhookIcon } from '../components/Icons'
import { StatusChip } from '../components/StatusChip'
import type { ProviderConnection, ProviderKey } from '../types'

function pluralize(count: number, singular: string, plural = `${singular}s`): string {
  return `${count} ${count === 1 ? singular : plural}`
}

function normalizeProviderKey(provider: ProviderKey | null): ProviderKey | null {
  if (provider === 'gitea') {
    return 'forgejo'
  }

  return provider
}

function countProviderUsage(applications: ApiApplication[]): Record<ProviderKey, number> {
  const usage: Record<ProviderKey, number> = {
    github: 0,
    gitlab: 0,
    gitea: 0,
    forgejo: 0,
    bitbucket: 0,
    generic: 0,
  }

  for (const application of applications) {
    const provider = normalizeProviderKey(guessProviderFromUrl(application.git_repository ?? ''))

    if (provider) {
      usage[provider] += 1
    }
  }

  return usage
}

function describeConfiguredProvider(providerName: string, usageCount: number): string {
  return `${pluralize(usageCount, 'app')} currently ${usageCount === 1 ? 'deploys' : 'deploy'} from ${providerName}.`
}

function isConnectedState(state: string): boolean {
  return state === 'Connected' || state === 'Configured'
}

function buildProviderCards(
  githubApps: ApiGithubApp[],
  privateKeys: ApiPrivateKey[],
  applications: ApiApplication[],
): ProviderConnection[] {
  const sshReadyKeys = privateKeys.filter((key) => key.is_git_related !== true)
  const providerUsage = countProviderUsage(applications)
  const githubAppLabel =
    githubApps.length > 0
      ? `${pluralize(githubApps.length, 'GitHub app')} connected`
      : 'No GitHub App connected'
  const githubAppNames = githubApps.slice(0, 2).map((app) => app.name).join(', ')
  const sshKeyLabel =
    sshReadyKeys.length > 0
      ? `${pluralize(sshReadyKeys.length, 'SSH key')} available`
      : 'Add an SSH key below'

  return providerConnections.map((provider) => {
    const usageCount = providerUsage[provider.key] ?? 0

    if (provider.key === 'github') {
      if (githubApps.length > 0) {
        const usageSummary = usageCount > 0 ? `, ${pluralize(usageCount, 'app')} linked` : ''

        return {
          ...provider,
          state: 'Connected',
          repos: `${githubAppLabel}${usageSummary}`,
          note:
            usageCount > 0
              ? `${githubAppNames}${githubApps.length > 2 ? ` +${githubApps.length - 2} more` : ''} installed. ${describeConfiguredProvider('GitHub', usageCount)}`
              : `${githubAppNames}${githubApps.length > 2 ? ` +${githubApps.length - 2} more` : ''} ready for repository installs.`,
        }
      }

      if (usageCount > 0) {
        return {
          ...provider,
          state: 'Configured',
          repos: `${pluralize(usageCount, 'app')} linked`,
          note: `${describeConfiguredProvider('GitHub', usageCount)} Connect a GitHub App below to add repository discovery and automatic webhooks.`,
        }
      }

      return {
        ...provider,
        state: 'Needs action',
        repos: githubAppLabel,
        note: 'Connect a GitHub App below to browse repositories and automate webhooks.',
      }
    }

    if (
      provider.key === 'gitlab' ||
      provider.key === 'forgejo' ||
      provider.key === 'bitbucket' ||
      provider.key === 'generic'
    ) {
      if (usageCount > 0) {
        return {
          ...provider,
          state: 'Configured',
          repos: `${pluralize(usageCount, 'app')} linked`,
          note: `${describeConfiguredProvider(provider.name, usageCount)} ${provider.note}`,
        }
      }

      if (sshReadyKeys.length > 0) {
        return {
          ...provider,
          state: 'Key ready',
          repos: sshKeyLabel,
          note: `No ${provider.name} repositories are linked yet. ${provider.note}`,
        }
      }

      return {
        ...provider,
        state: 'Needs action',
        repos: 'No apps linked yet',
        note: `No ${provider.name} repositories are linked yet. Add an SSH key below before deploying through this path.`,
      }
    }

    return { ...provider }
  })
}

export function ProvidersView() {
  const [filter, setFilter] = useState<'all' | 'connected' | 'needs-action'>('all')
  const [providers, setProviders] = useState<ProviderConnection[]>(() =>
    providerConnections.map((provider) => ({ ...provider })),
  )
  const [privateKeys, setPrivateKeys] = useState<ApiPrivateKey[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  // Webhook config state
  const [webhookConfig, setWebhookConfig] = useState<ApiWebhookConfig | null>(null)
  const [webhookLoading, setWebhookLoading] = useState(true)
  const [secretVisible, setSecretVisible] = useState(false)
  const [copiedKey, setCopiedKey] = useState<string | null>(null)
  const [regeneratingSecret, setRegeneratingSecret] = useState(false)
  const [webhookError, setWebhookError] = useState<string | null>(null)

  // CoolDev-native GitHub App state
  const [githubAppStatus, setGithubAppStatus] = useState<ApiGithubAppStatus | null>(null)
  const [githubAppAccessStatus, setGithubAppAccessStatus] = useState<ApiAccessStatus | null>(null)
  const [githubAppLoading, setGithubAppLoading] = useState(true)
  const [creatingGithubApp, setCreatingGithubApp] = useState(false)
  const [githubAppAccessError, setGithubAppAccessError] = useState<string | null>(null)
  const [githubAppError, setGithubAppError] = useState<string | null>(null)
  const [githubAppSuccess, setGithubAppSuccess] = useState(false)

  // SSH Key management state
  const [showAddKeyForm, setShowAddKeyForm] = useState(false)
  const [newKeyName, setNewKeyName] = useState('')
  const [newKeyValue, setNewKeyValue] = useState('')
  const [addingKey, setAddingKey] = useState(false)
  const [addKeyError, setAddKeyError] = useState<string | null>(null)
  const [confirmDeleteKeyId, setConfirmDeleteKeyId] = useState<string | null>(null)
  const [deletingKeyId, setDeletingKeyId] = useState<string | null>(null)
  const [keyActionError, setKeyActionError] = useState<string | null>(null)

  useEffect(() => {
    let cancelled = false

    async function loadProviders() {
      setLoading(true)
      setError(null)

      try {
        const [nextGithubApps, nextPrivateKeys, applications] = await Promise.all([
          listGithubApps(),
          listPrivateKeys(),
          listApplications(),
        ])

        if (!cancelled) {
          setPrivateKeys(nextPrivateKeys.filter((k) => k.is_git_related !== true))
          setProviders(buildProviderCards(nextGithubApps, nextPrivateKeys, applications))
        }
      } catch (err) {
        if (!cancelled) {
          setError(err instanceof Error ? err.message : String(err))
        }
      } finally {
        if (!cancelled) {
          setLoading(false)
        }
      }
    }

    void loadProviders()

    return () => {
      cancelled = true
    }
  }, [])

  // Load webhook config, native GitHub App status, and live access status in parallel.
  useEffect(() => {
    let cancelled = false

    async function loadWebhookData() {
      const [webhookResult, githubAppResult, accessResult] = await Promise.allSettled([
        getWebhookConfig(),
        getGithubAppStatus(),
        getAccessStatus(),
      ])

      if (cancelled) return

      if (webhookResult.status === 'fulfilled') {
        setWebhookConfig(webhookResult.value)
      } else {
        setWebhookError('Could not load webhook configuration.')
      }
      setWebhookLoading(false)

      if (githubAppResult.status === 'fulfilled') {
        setGithubAppStatus(githubAppResult.value)
      }

      if (accessResult.status === 'fulfilled') {
        setGithubAppAccessStatus(accessResult.value)
        setGithubAppAccessError(null)
      } else {
        setGithubAppAccessError('Could not verify the workspace HTTPS status. Open Settings and confirm the live URL before creating the GitHub App.')
      }

      setGithubAppLoading(false)
    }

    void loadWebhookData()

    return () => {
      cancelled = true
    }
  }, [])

  const githubAppReadyForSetup = githubAppAccessStatus?.status === 'live' && Boolean(githubAppAccessStatus.secureUrl)
  const githubAppSetupMessage = githubAppStatus?.connected
    ? null
    : githubAppAccessError
      ? githubAppAccessError
      : githubAppReadyForSetup
        ? null
        : githubAppAccessStatus?.secureUrl
          ? `GitHub App setup unlocks once HTTPS is live on ${githubAppAccessStatus.secureUrl}.`
          : 'GitHub App setup unlocks after you finish the workspace domain and HTTPS setup in Settings.'

  // Detect GitHub App callback redirect params
  useEffect(() => {
    const params = new URLSearchParams(window.location.search)
    const success = params.get('github-success')
    const err = params.get('github-error')

    if (success === '1') {
      setGithubAppSuccess(true)
      window.history.replaceState({}, '', window.location.pathname)
      // Reload GitHub App status
      void getGithubAppStatus().then(setGithubAppStatus).catch(() => null)
    }

    if (err) {
      const messages: Record<string, string> = {
        'conversion-failed': 'GitHub returned an error while creating the app. Please try again.',
        'invalid-state': 'The GitHub App setup session expired. Please start again.',
        network: 'A network error occurred during GitHub App setup. Please try again.',
      }
      setGithubAppError(messages[err] ?? 'GitHub App setup failed. Please try again.')
      window.history.replaceState({}, '', window.location.pathname)
    }
  }, [])

  async function handleAddKey() {
    const trimmedKey = newKeyValue.trim()
    const trimmedName = newKeyName.trim()

    if (!trimmedKey) {
      setAddKeyError('Paste a private key before saving.')
      return
    }

    setAddingKey(true)
    setAddKeyError(null)

    try {
      const created = await createPrivateKey({
        name: trimmedName || 'SSH deploy key',
        description: `Deploy key added via CoolDev Providers.`,
        private_key: trimmedKey,
      })

      setPrivateKeys((current) => {
        if (current.some((k) => k.uuid === created.uuid)) return current
        return [
          ...current,
          {
            uuid: created.uuid,
            name: trimmedName || 'SSH deploy key',
            description: 'Deploy key added via CoolDev Providers.',
            is_git_related: false,
          },
        ]
      })

      setNewKeyName('')
      setNewKeyValue('')
      setShowAddKeyForm(false)
    } catch (err) {
      const message =
        err instanceof ApiError
          ? err.message
          : err instanceof Error
            ? err.message
            : String(err)
      setAddKeyError(message)
    } finally {
      setAddingKey(false)
    }
  }

  async function handleDeleteKey(uuid: string) {
    setDeletingKeyId(uuid)
    setKeyActionError(null)

    try {
      await deletePrivateKey(uuid)
      setPrivateKeys((current) => current.filter((k) => k.uuid !== uuid))
      setConfirmDeleteKeyId(null)
    } catch (err) {
      setKeyActionError(err instanceof Error ? err.message : String(err))
    } finally {
      setDeletingKeyId(null)
    }
  }

  async function handleRegenerateSecret() {
    setRegeneratingSecret(true)
    setWebhookError(null)
    try {
      const newConfig = await regenerateWebhookSecret()
      setWebhookConfig(newConfig)
      setSecretVisible(true)
    } catch (err) {
      setWebhookError(err instanceof Error ? err.message : String(err))
    } finally {
      setRegeneratingSecret(false)
    }
  }

  function copyToClipboard(text: string, key: string) {
    void navigator.clipboard.writeText(text).then(() => {
      setCopiedKey(key)
      setTimeout(() => setCopiedKey((current) => (current === key ? null : current)), 2000)
    })
  }

  async function handleCreateGithubApp() {
    setCreatingGithubApp(true)
    setGithubAppError(null)
    try {
      const setup = await initiateGithubAppSetup()
      // Submit a hidden form to GitHub's manifest endpoint
      const form = document.createElement('form')
      form.method = 'POST'
      form.action = setup.actionUrl
      const input = document.createElement('input')
      input.type = 'hidden'
      input.name = 'manifest'
      input.value = setup.manifest
      form.appendChild(input)
      document.body.appendChild(form)
      form.submit()
      // Browser will redirect; no need to reset creatingGithubApp
    } catch (err) {
      setGithubAppError(err instanceof Error ? err.message : String(err))
      setCreatingGithubApp(false)
    }
  }

  const filteredProviders = providers.filter((provider) => {
    if (filter === 'connected') {
      return isConnectedState(provider.state)
    }

    if (filter === 'needs-action') {
      return !isConnectedState(provider.state)
    }

    return true
  })

  const needsActionCount = providers.filter((p) => p.state === 'Needs action').length

  return (
    <section className="content-grid">
      {/* ── Provider Status Cards ────────────────────────── */}
      <article className="panel panel-wide">
        <div className="panel-heading">
          <div>
            <p className="eyebrow">Git providers</p>
            <h3>Connected providers</h3>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            {needsActionCount > 0 && (
              <span style={{
                fontSize: '0.76rem',
                color: 'var(--status-building-fg)',
                background: 'var(--status-building-bg)',
                padding: '2px 8px',
                borderRadius: 5,
                fontWeight: 600,
              }}>
                {needsActionCount} need setup
              </span>
            )}
            <div className="segmented-control" aria-label="Provider filter">
              <button
                type="button"
                className={filter === 'all' ? 'segment is-active' : 'segment'}
                onClick={() => setFilter('all')}
              >
                All
              </button>
              <button
                type="button"
                className={filter === 'connected' ? 'segment is-active' : 'segment'}
                onClick={() => setFilter('connected')}
              >
                Connected
              </button>
              <button
                type="button"
                className={filter === 'needs-action' ? 'segment is-active' : 'segment'}
                onClick={() => setFilter('needs-action')}
              >
                Needs action
              </button>
            </div>
          </div>
        </div>

        {loading ? (
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, minmax(0, 1fr))', gap: 8, marginBottom: 4 }}>
            {[1, 2, 3].map((n) => (
              <div key={n} className="provider-card" style={{ gap: 10 }}>
                <div className="skeleton-line medium tall" />
                <div className="skeleton-line full" />
                <div className="skeleton-line short" />
              </div>
            ))}
          </div>
        ) : null}

        {error ? (
          <p className="field-hint" style={{ marginBottom: 12 }}>
            Could not load provider connections. {error}
          </p>
        ) : null}

        <div className="provider-card-grid">
          {filteredProviders.map((provider) => (
            <div key={provider.key} className="subpanel provider-card">
              <div className="panel-heading">
                <div>
                  <p className="eyebrow">{provider.repos}</p>
                  <h4>{provider.name}</h4>
                </div>
                <StatusChip label={provider.state} />
              </div>
              <p>{provider.note}</p>
              <ul className="plain-list compact-list capability-list">
                {provider.capabilities.map((capability) => (
                  <li key={capability}>{capability}</li>
                ))}
              </ul>
            </div>
          ))}
        </div>
      </article>

      {/* ── SSH Key Management ───────────────────────────── */}
      <article className="panel panel-wide">
        <div className="panel-heading">
          <div>
            <p className="eyebrow">Access keys</p>
            <h3>SSH keys</h3>
          </div>
          <button
            type="button"
            className="secondary-action"
            onClick={() => { setShowAddKeyForm((v) => !v); setAddKeyError(null) }}
          >
            <PlusIcon size={13} />
            {showAddKeyForm ? 'Cancel' : 'Add SSH key'}
          </button>
        </div>

        <p className="field-hint" style={{ marginBottom: 14 }}>
          SSH keys saved here are available for all deploy operations in this workspace.
          Add a key for each server or private repository you want to deploy from.
        </p>

        {showAddKeyForm && (
          <div className="settings-subform" style={{ marginBottom: 14 }}>
            <div className="form-grid">
              <label className="field field-wide">
                <span>Key name</span>
                <input
                  type="text"
                  value={newKeyName}
                  onChange={(e) => setNewKeyName(e.currentTarget.value)}
                  placeholder="Deploy key for my-server"
                  disabled={addingKey}
                />
              </label>
              <label className="field field-wide">
                <span>Private key</span>
                <textarea
                  value={newKeyValue}
                  onChange={(e) => setNewKeyValue(e.currentTarget.value)}
                  rows={7}
                  placeholder={'Paste your OpenSSH private key here\n-----BEGIN OPENSSH PRIVATE KEY-----\n...\n-----END OPENSSH PRIVATE KEY-----'}
                  disabled={addingKey}
                />
                <small className="field-hint">
                  The private key is stored securely and used only for SSH connections from this workspace.
                </small>
              </label>
            </div>

            {addKeyError && (
              <div className="error-banner">
                <AlertIcon size={13} />
                <span>{addKeyError}</span>
              </div>
            )}

            <div style={{ display: 'flex', gap: 8 }}>
              <button
                type="button"
                className="primary-action"
                onClick={() => void handleAddKey()}
                disabled={addingKey}
              >
                {addingKey ? 'Saving key…' : 'Save SSH key'}
              </button>
              <button
                type="button"
                className="secondary-action"
                onClick={() => { setShowAddKeyForm(false); setNewKeyName(''); setNewKeyValue(''); setAddKeyError(null) }}
                disabled={addingKey}
              >
                Cancel
              </button>
            </div>
          </div>
        )}

        {keyActionError && (
          <div className="error-banner" style={{ marginBottom: 12 }}>
            <AlertIcon size={13} />
            <span>{keyActionError}</span>
          </div>
        )}

        {loading ? (
          <div style={{ display: 'grid', gap: 6 }}>
            {[1, 2].map((n) => (
              <div key={n} className="skeleton-row">
                <div className="skeleton-icon" />
                <div className="skeleton-body">
                  <div className="skeleton-line medium" />
                  <div className="skeleton-line short" />
                </div>
              </div>
            ))}
          </div>
        ) : privateKeys.length === 0 ? (
          <div className="empty-state" style={{ padding: '28px 20px' }}>
            <KeyIcon size={28} />
            <strong>No SSH keys yet</strong>
            <p>Add an SSH key to deploy from private repositories or connect additional servers.</p>
          </div>
        ) : (
          <ul className="resources-list">
            {privateKeys.map((key) => (
              <Fragment key={key.uuid}>
                <li
                  className="resource-row"
                  style={confirmDeleteKeyId === key.uuid ? { borderColor: 'rgba(239,68,68,0.4)', background: 'rgba(239,68,68,0.04)' } : undefined}
                >
                  <div className="resource-row-left">
                    <span className="resource-icon">
                      <KeyIcon size={13} />
                    </span>
                    <div className="resource-info">
                      <strong>{key.name}</strong>
                      <small>
                        {key.fingerprint
                          ? key.fingerprint
                          : key.description ?? 'SSH key'}
                      </small>
                    </div>
                  </div>
                  <div className="resource-row-right">
                    <div className="resource-row-actions">
                      <button
                        type="button"
                        className="resource-action-btn danger"
                        title="Delete SSH key"
                        disabled={deletingKeyId !== null}
                        onClick={() => { setConfirmDeleteKeyId(key.uuid); setKeyActionError(null) }}
                      >
                        <TrashIcon size={12} />
                      </button>
                    </div>
                  </div>
                </li>

                {confirmDeleteKeyId === key.uuid && (
                  <li className="delete-confirm-row">
                    <span>
                      Delete <strong>{key.name}</strong>? Any servers or repos using this key will lose access.
                    </span>
                    <button
                      type="button"
                      className="secondary-action"
                      style={{ padding: '4px 10px', fontSize: '0.78rem' }}
                      onClick={() => setConfirmDeleteKeyId(null)}
                      disabled={deletingKeyId !== null}
                    >
                      Cancel
                    </button>
                    <button
                      type="button"
                      className="primary-action danger-action"
                      style={{ padding: '4px 10px', fontSize: '0.78rem' }}
                      onClick={() => void handleDeleteKey(key.uuid)}
                      disabled={deletingKeyId !== null}
                    >
                      {deletingKeyId === key.uuid ? 'Deleting…' : 'Delete key'}
                    </button>
                  </li>
                )}
              </Fragment>
            ))}
          </ul>
        )}
      </article>

      {/* ── Push-to-deploy: webhook config ───────────────── */}
      <article className="panel">
        <div className="panel-heading">
          <div>
            <p className="eyebrow">Push-to-deploy</p>
            <h3>Webhook setup</h3>
          </div>
          <WebhookIcon size={15} />
        </div>

        <p className="field-hint" style={{ marginBottom: 14 }}>
          Add the webhook URL and secret to your Git repository to auto-redeploy on every
          branch push. CoolDev verifies the HMAC signature before queuing any deploy.
        </p>

        {webhookError && (
          <div className="error-banner" style={{ marginBottom: 12 }}>
            <AlertIcon size={13} />
            <span>{webhookError}</span>
          </div>
        )}

        {webhookLoading ? (
          <div style={{ display: 'grid', gap: 8 }}>
            {[1, 2, 3].map((n) => (
              <div key={n} className="skeleton-row" style={{ padding: '9px 12px' }}>
                <div className="skeleton-body">
                  <div className="skeleton-line medium" />
                  <div className="skeleton-line short" />
                </div>
              </div>
            ))}
          </div>
        ) : webhookConfig ? (
          <div style={{ display: 'grid', gap: 12 }}>
            <div style={{
              padding: '10px 12px',
              border: '1px solid var(--border)',
              borderRadius: 8,
              background: 'var(--bg-elevated)',
              display: 'grid',
              gap: 6,
            }}>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8 }}>
                <strong style={{ fontSize: '0.82rem', color: 'var(--text-heading)' }}>Webhook secret</strong>
                <div style={{ display: 'flex', gap: 6 }}>
                  <button type="button" className="resource-action-btn" title={secretVisible ? 'Hide' : 'Reveal'} onClick={() => setSecretVisible((v) => !v)}>
                    <KeyIcon size={12} />
                  </button>
                  <button type="button" className="resource-action-btn" title="Copy secret" onClick={() => copyToClipboard(webhookConfig.secret, 'secret')}>
                    {copiedKey === 'secret' ? <span style={{ fontSize: '0.65rem', color: 'var(--status-ready-fg)' }}>✓</span> : <CopyIcon size={12} />}
                  </button>
                  <button type="button" className="resource-action-btn" title="Regenerate" disabled={regeneratingSecret} onClick={() => void handleRegenerateSecret()}>
                    <RefreshCwIcon size={12} />
                  </button>
                </div>
              </div>
              <code style={{
                fontFamily: 'var(--font-mono)',
                fontSize: '0.78rem',
                color: secretVisible ? 'var(--text-heading)' : 'var(--text-muted)',
                wordBreak: 'break-all',
              }}>
                {secretVisible ? webhookConfig.secret : '•'.repeat(32)}
              </code>
            </div>

            <div style={{ display: 'grid', gap: 6 }}>
              {Object.entries(webhookConfig.urls).map(([provider, url]) => (
                <div key={provider} style={{
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  gap: 10,
                  padding: '8px 12px',
                  border: '1px solid var(--border)',
                  borderRadius: 7,
                  background: 'var(--bg-elevated)',
                }}>
                  <div style={{ display: 'grid', gap: 2, minWidth: 0 }}>
                    <strong style={{ fontSize: '0.79rem', color: 'var(--text-heading)', textTransform: 'capitalize' }}>
                      {provider === 'github' ? 'GitHub App' : provider.charAt(0).toUpperCase() + provider.slice(1)}
                    </strong>
                    <code style={{ fontSize: '0.7rem', color: 'var(--text-muted)', fontFamily: 'var(--font-mono)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                      {url}
                    </code>
                  </div>
                  <button type="button" className="resource-action-btn" title="Copy URL" onClick={() => copyToClipboard(url, `url-${provider}`)}>
                    {copiedKey === `url-${provider}` ? <span style={{ fontSize: '0.65rem', color: 'var(--status-ready-fg)' }}>✓</span> : <CopyIcon size={12} />}
                  </button>
                </div>
              ))}
            </div>

            <p className="field-hint">
              Set Content-Type to <code style={{ fontFamily: 'var(--font-mono)', fontSize: '0.76rem' }}>application/json</code> in
              your repository webhook settings. After regenerating the secret, update it in every connected repository.
            </p>
          </div>
        ) : null}
      </article>

      {/* ── CoolDev-native GitHub App (automated webhook) ── */}
      <article className="panel">
        <div className="panel-heading">
          <div>
            <p className="eyebrow">GitHub automated setup</p>
            <h3>CoolDev GitHub App</h3>
          </div>
          {!githubAppLoading && (
            githubAppStatus?.connected
              ? <StatusChip label="Connected" />
              : <StatusChip label="Not connected" />
          )}
        </div>

        <p className="field-hint" style={{ marginBottom: 14 }}>
          Create a dedicated CoolDev GitHub App so GitHub automatically routes push events
          here — no manual webhook configuration needed per repository.
        </p>

        {githubAppSuccess && (
          <div className="info-banner" style={{ marginBottom: 12 }}>
            <span>✓ GitHub App created and connected. Install it on your repositories to start auto-deploying.</span>
          </div>
        )}

        {githubAppError && (
          <div className="error-banner" style={{ marginBottom: 12 }}>
            <AlertIcon size={13} />
            <span>{githubAppError}</span>
          </div>
        )}

        {githubAppLoading ? (
          <div style={{ display: 'grid', gap: 8 }}>
            <div className="skeleton-line medium" />
            <div className="skeleton-line short" />
          </div>
        ) : githubAppStatus?.connected ? (
          <div style={{ display: 'grid', gap: 10 }}>
            <div className="settings-row" style={{ paddingTop: 0, marginTop: 0 }}>
              <div>
                <strong>{githubAppStatus.appName}</strong>
                <small>App ID: {githubAppStatus.appId}</small>
              </div>
              <StatusChip label="Active" />
            </div>
            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
              <a href={githubAppStatus.installationUrl} target="_blank" rel="noopener noreferrer" className="secondary-action" style={{ textDecoration: 'none' }}>
                <ExternalLinkIcon size={13} />
                Install on repositories
              </a>
              <a href={githubAppStatus.htmlUrl} target="_blank" rel="noopener noreferrer" className="secondary-action" style={{ textDecoration: 'none' }}>
                <ExternalLinkIcon size={13} />
                View on GitHub
              </a>
            </div>
            <p className="field-hint">
              Install the app on each repository you want to auto-deploy. Every push triggers CoolDev
              to verify the signature and queue a redeploy automatically.
            </p>
          </div>
        ) : (
          <div style={{ display: 'grid', gap: 12 }}>
            {githubAppSetupMessage && (
              <div className="info-banner">
                <span>{githubAppSetupMessage}</span>
              </div>
            )}
            <div className="timeline">
              <div className="timeline-item">
                <strong>Click &ldquo;Create GitHub App&rdquo;</strong>
                <span>CoolDev generates a pre-filled manifest and redirects you to GitHub.</span>
              </div>
              <div className="timeline-item">
                <strong>Confirm on GitHub</strong>
                <span>Review the permissions and click &ldquo;Create GitHub App&rdquo; on GitHub&rsquo;s page.</span>
              </div>
              <div className="timeline-item">
                <strong>Install on your repositories</strong>
                <span>After creation, install the app on the repos you want to auto-deploy.</span>
              </div>
              <div className="timeline-item">
                <strong>Push to deploy</strong>
                <span>Every push is verified by signature and routed to the matching deployment automatically.</span>
              </div>
            </div>
            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
              <button
                type="button"
                className="primary-action"
                disabled={creatingGithubApp || !githubAppReadyForSetup}
                onClick={() => void handleCreateGithubApp()}
              >
                {creatingGithubApp ? 'Redirecting to GitHub…' : 'Create GitHub App'}
              </button>
              {!githubAppReadyForSetup && (
                <a href="/simple/settings" className="secondary-action" style={{ textDecoration: 'none' }}>
                  Open Settings
                </a>
              )}
            </div>
          </div>
        )}
      </article>
    </section>
  )
}
