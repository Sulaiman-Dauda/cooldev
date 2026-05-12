import { Fragment, useCallback, useEffect, useRef, useState } from 'react'
import {
  AppWindowIcon,
  DatabaseIcon,
  ExternalLinkIcon,
  GridIcon,
  PlusIcon,
  RefreshCwIcon,
  TrashIcon,
} from '../components/Icons'
import { StatusChip } from '../components/StatusChip'
import {
  ApiError,
  deleteApplication,
  deleteDatabase,
  deleteService,
  getApplication,
  listApplications,
  listDatabases,
  listServices,
  triggerDeploy,
  updateApplication,
  type ApiApplication,
  type ApiApplicationDetails,
  type ApiApplicationUpdateData,
  type ApiDatabase,
  type ApiService,
} from '../lib/api'
import type { View } from '../types'

type ResourcesViewProps = {
  onNavigate: (view: View) => void
}

type ResourceType = 'application' | 'database' | 'service'

type AppEditorState = {
  name: string
  description: string
  domains: string
  gitBranch: string
  portsExposes: string
  baseDirectory: string
  publishDirectory: string
  installCommand: string
  buildCommand: string
  startCommand: string
  healthCheckEnabled: boolean
  healthCheckPath: string
  healthCheckPort: string
  autoDeployEnabled: boolean
  forceHttpsEnabled: boolean
}

function resourceKey(type: ResourceType, uuid: string): string {
  return `${type}:${uuid}`
}

function normalizeAppDomainsInput(value: string): string {
  const entries = value
    .split(/[\n,]+/)
    .map((item) => item.trim())
    .filter(Boolean)

  if (entries.length === 0) {
    return ''
  }

  return entries
    .map((item) => {
      const candidate = /^https?:\/\//i.test(item) ? item : `https://${item}`
      const parsed = new URL(candidate)

      if (!parsed.hostname) {
        throw new Error('Enter a valid domain or URL.')
      }

      return new URL(`https://${parsed.host}`).toString().replace(/\/$/, '')
    })
    .join(',')
}

function createAppEditorState(application: ApiApplicationDetails): AppEditorState {
  return {
    name: application.name ?? '',
    description: application.description ?? '',
    domains: application.domains ?? application.fqdn ?? '',
    gitBranch: application.git_branch ?? '',
    portsExposes: application.ports_exposes ?? '',
    baseDirectory: application.base_directory ?? '',
    publishDirectory: application.publish_directory ?? '',
    installCommand: application.install_command ?? '',
    buildCommand: application.build_command ?? '',
    startCommand: application.start_command ?? '',
    healthCheckEnabled: Boolean(application.health_check_enabled),
    healthCheckPath: application.health_check_path ?? '',
    healthCheckPort: application.health_check_port ?? '',
    autoDeployEnabled: application.is_auto_deploy_enabled ?? true,
    forceHttpsEnabled: application.is_force_https_enabled ?? true,
  }
}

function openUrl(fqdn: string | undefined): void {
  if (!fqdn) return
  const url = /^https?:\/\//i.test(fqdn) ? fqdn : `https://${fqdn}`
  window.open(url, '_blank', 'noopener,noreferrer')
}

export function ResourcesView({ onNavigate }: ResourcesViewProps) {
  const [apps, setApps] = useState<ApiApplication[]>([])
  const [databases, setDatabases] = useState<ApiDatabase[]>([])
  const [services, setServices] = useState<ApiService[]>([])
  const suppressedDeletedResourcesRef = useRef<Set<string>>(new Set())
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  // Lifecycle action state
  const [redeployingId, setRedeployingId] = useState<string | null>(null)
  const [deletingId, setDeletingId] = useState<string | null>(null)
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null)
  const [confirmDeleteType, setConfirmDeleteType] = useState<ResourceType | null>(null)
  const [confirmDeleteName, setConfirmDeleteName] = useState<string>('')
  const [actionError, setActionError] = useState<string | null>(null)
  const [redeployedId, setRedeployedId] = useState<string | null>(null)
  const [selectedResourceId, setSelectedResourceId] = useState<string | null>(null)
  const [selectedResourceType, setSelectedResourceType] = useState<ResourceType | null>(null)
  const [selectedApplication, setSelectedApplication] = useState<ApiApplicationDetails | null>(null)
  const [selectedApplicationLoading, setSelectedApplicationLoading] = useState(false)
  const [selectedApplicationError, setSelectedApplicationError] = useState<string | null>(null)
  const [editingApplication, setEditingApplication] = useState(false)
  const [savingApplication, setSavingApplication] = useState(false)
  const [applicationEditor, setApplicationEditor] = useState<AppEditorState | null>(null)
  const [resourceNotice, setResourceNotice] = useState<string | null>(null)

  const suppressDeletedResource = useCallback((type: ResourceType, uuid: string) => {
    suppressedDeletedResourcesRef.current.add(resourceKey(type, uuid))

    if (type === 'application') {
      setApps((current) => current.filter((app) => app.uuid !== uuid))
      return
    }

    if (type === 'database') {
      setDatabases((current) => current.filter((database) => database.uuid !== uuid))
      return
    }

    setServices((current) => current.filter((service) => service.uuid !== uuid))
  }, [])

  const loadResources = useCallback(async (quiet = false) => {
    if (!quiet) setLoading(true)
    setError(null)

    try {
      const [nextApps, nextDatabases, nextServices] = await Promise.all([
        listApplications(),
        listDatabases(),
        listServices(),
      ])

      setApps(nextApps.filter((app) => !suppressedDeletedResourcesRef.current.has(resourceKey('application', app.uuid))))
      setDatabases(nextDatabases.filter((database) => !suppressedDeletedResourcesRef.current.has(resourceKey('database', database.uuid))))
      setServices(nextServices.filter((service) => !suppressedDeletedResourcesRef.current.has(resourceKey('service', service.uuid))))
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err))
    } finally {
      if (!quiet) setLoading(false)
    }
  }, [])

  useEffect(() => {
    void loadResources()
  }, [loadResources])

  const selectedApp = selectedResourceType === 'application'
    ? apps.find((app) => app.uuid === selectedResourceId) ?? null
    : null
  const selectedDatabase = selectedResourceType === 'database'
    ? databases.find((database) => database.uuid === selectedResourceId) ?? null
    : null
  const selectedService = selectedResourceType === 'service'
    ? services.find((service) => service.uuid === selectedResourceId) ?? null
    : null

  useEffect(() => {
    if (!selectedResourceId || !selectedResourceType) {
      return
    }

    const exists = selectedResourceType === 'application'
      ? apps.some((app) => app.uuid === selectedResourceId)
      : selectedResourceType === 'database'
        ? databases.some((database) => database.uuid === selectedResourceId)
        : services.some((service) => service.uuid === selectedResourceId)

    if (!exists) {
      setSelectedResourceId(null)
      setSelectedResourceType(null)
      setSelectedApplication(null)
      setSelectedApplicationError(null)
      setSelectedApplicationLoading(false)
      setEditingApplication(false)
      setApplicationEditor(null)
      setResourceNotice(null)
    }
  }, [apps, databases, selectedResourceId, selectedResourceType, services])

  useEffect(() => {
    if (selectedResourceType !== 'application' || !selectedResourceId) {
      setSelectedApplication(null)
      setSelectedApplicationLoading(false)
      setSelectedApplicationError(null)
      setEditingApplication(false)
      setApplicationEditor(null)
      return
    }

    const applicationId = selectedResourceId
    let cancelled = false

    async function loadSelectedApplication() {
      setSelectedApplicationLoading(true)
      setSelectedApplicationError(null)

      try {
        const details = await getApplication(applicationId)
        if (cancelled) {
          return
        }

        setSelectedApplication(details)
        setApplicationEditor(createAppEditorState(details))
      } catch (error) {
        if (!cancelled) {
          setSelectedApplicationError(error instanceof Error ? error.message : String(error))
        }
      } finally {
        if (!cancelled) {
          setSelectedApplicationLoading(false)
        }
      }
    }

    void loadSelectedApplication()

    return () => {
      cancelled = true
    }
  }, [selectedResourceId, selectedResourceType])

  function requestDelete(type: ResourceType, uuid: string, name: string) {
    setActionError(null)
    setConfirmDeleteId(uuid)
    setConfirmDeleteType(type)
    setConfirmDeleteName(name)
  }

  function cancelDelete() {
    setConfirmDeleteId(null)
    setConfirmDeleteType(null)
    setConfirmDeleteName('')
  }

  function selectResource(type: ResourceType, uuid: string) {
    setSelectedResourceType(type)
    setSelectedResourceId(uuid)
    setEditingApplication(false)
    setSelectedApplicationError(null)
    setResourceNotice(null)
  }

  function handleRowKeyDown(event: React.KeyboardEvent<HTMLElement>, type: ResourceType, uuid: string) {
    if (event.key !== 'Enter' && event.key !== ' ') {
      return
    }

    event.preventDefault()
    selectResource(type, uuid)
  }

  function stopRowEvent(event: React.MouseEvent<HTMLElement>) {
    event.stopPropagation()
  }

  function setApplicationEditorValue<K extends keyof AppEditorState>(field: K, value: AppEditorState[K]) {
    setApplicationEditor((current) => {
      if (!current) {
        return current
      }

      return {
        ...current,
        [field]: value,
      }
    })
  }

  async function handleSaveApplication() {
    if (!selectedApplication || !applicationEditor) {
      return
    }

    setSavingApplication(true)
    setSelectedApplicationError(null)
    setResourceNotice(null)

    try {
      const payload: ApiApplicationUpdateData = {
        name: applicationEditor.name.trim(),
        description: applicationEditor.description.trim(),
        domains: normalizeAppDomainsInput(applicationEditor.domains),
        git_branch: applicationEditor.gitBranch.trim(),
        ports_exposes: applicationEditor.portsExposes.trim(),
        base_directory: applicationEditor.baseDirectory.trim(),
        publish_directory: applicationEditor.publishDirectory.trim(),
        install_command: applicationEditor.installCommand.trim(),
        build_command: applicationEditor.buildCommand.trim(),
        start_command: applicationEditor.startCommand.trim(),
        health_check_enabled: applicationEditor.healthCheckEnabled,
        health_check_path: applicationEditor.healthCheckEnabled ? applicationEditor.healthCheckPath.trim() : '',
        health_check_port: applicationEditor.healthCheckEnabled
          ? applicationEditor.healthCheckPort.trim() || null
          : null,
        is_auto_deploy_enabled: applicationEditor.autoDeployEnabled,
        is_force_https_enabled: applicationEditor.forceHttpsEnabled,
      }

      await updateApplication(selectedApplication.uuid, payload)
      const nextApplication = await getApplication(selectedApplication.uuid)
      setSelectedApplication(nextApplication)
      setApplicationEditor(createAppEditorState(nextApplication))
      setEditingApplication(false)
      setResourceNotice('Application configuration updated.')
      await loadResources(true)
    } catch (error) {
      setSelectedApplicationError(error instanceof Error ? error.message : String(error))
    } finally {
      setSavingApplication(false)
    }
  }

  function currentRowStyle(uuid: string): React.CSSProperties | undefined {
    if (confirmDeleteId === uuid) {
      return { borderColor: 'rgba(239,68,68,0.4)', background: 'rgba(239,68,68,0.04)' }
    }

    if (selectedResourceId === uuid) {
      return { borderColor: 'var(--accent-border)', background: 'var(--accent-muted)' }
    }

    return undefined
  }

  async function handleDelete() {
    if (!confirmDeleteId || !confirmDeleteType) return
    const targetId = confirmDeleteId
    const targetType = confirmDeleteType

    setDeletingId(targetId)
    setActionError(null)

    try {
      if (targetType === 'application') await deleteApplication(targetId)
      else if (targetType === 'database') await deleteDatabase(targetId)
      else if (targetType === 'service') await deleteService(targetId)

      suppressDeletedResource(targetType, targetId)
      cancelDelete()
      await loadResources(true)
    } catch (err) {
      if (err instanceof ApiError && err.status === 404) {
        suppressDeletedResource(targetType, targetId)
        cancelDelete()
        await loadResources(true)
        return
      }

      setActionError(err instanceof Error ? err.message : String(err))
    } finally {
      setDeletingId(null)
    }
  }

  async function handleRedeploy(uuid: string) {
    setRedeployingId(uuid)
    setActionError(null)

    try {
      await triggerDeploy(uuid)
      setRedeployedId(uuid)
      setTimeout(() => setRedeployedId((current) => (current === uuid ? null : current)), 3000)
    } catch (err) {
      setActionError(err instanceof Error ? err.message : String(err))
    } finally {
      setRedeployingId(null)
    }
  }

  const isAnyActionRunning = deletingId !== null || redeployingId !== null

  const totalCount = apps.length + databases.length + services.length
  const runningCount = [
    ...apps.map((a) => a.status),
    ...databases.map((d) => d.status),
    ...services.map((s) => s.status),
  ].filter((s) => s && (s.toLowerCase().includes('running') || s.toLowerCase().includes('ready'))).length

  return (
    <section className="content-grid">
      {/* ── Stats bar ─────────────────────────────────────── */}
      {!loading && totalCount > 0 && (
        <div className="stats-bar">
          <div className="stat-item">
            <GridIcon size={16} />
            <div>
              <strong>{totalCount}</strong>
              <span>Total resources</span>
            </div>
          </div>
          <div className="stat-item">
            <AppWindowIcon size={16} />
            <div>
              <strong>{apps.length}</strong>
              <span>Applications</span>
            </div>
          </div>
          <div className="stat-item">
            <DatabaseIcon size={16} />
            <div>
              <strong>{databases.length}</strong>
              <span>Databases</span>
            </div>
          </div>
          <div className="stat-item">
            <GridIcon size={16} />
            <div>
              <strong>{runningCount}</strong>
              <span>Healthy</span>
            </div>
          </div>
        </div>
      )}

      {/* ── Applications ──────────────────────────────────── */}
      <article className="panel panel-wide">
        <div className="panel-heading">
          <div>
            <p className="eyebrow">Applications</p>
            <h3>Deployed apps</h3>
          </div>
          <button type="button" className="primary-action" onClick={() => onNavigate('new')}>
            <PlusIcon size={13} />
            New resource
          </button>
        </div>

        {error && (
          <p className="field-hint" style={{ marginBottom: 12 }}>
            Could not load resources. {error}
          </p>
        )}

        {actionError && (
          <div className="error-banner" style={{ marginBottom: 12 }}>
            <span>{actionError}</span>
            <button
              type="button"
              style={{ marginLeft: 'auto', background: 'none', border: 'none', cursor: 'pointer', color: 'inherit', fontSize: '0.8rem' }}
              onClick={() => setActionError(null)}
            >
              Dismiss
            </button>
          </div>
        )}

        {loading ? (
          <div style={{ display: 'grid', gap: 6 }}>
            {[1, 2, 3].map((n) => (
              <div key={n} className="skeleton-row">
                <div className="skeleton-icon" />
                <div className="skeleton-body">
                  <div className="skeleton-line medium" />
                  <div className="skeleton-line short" />
                </div>
              </div>
            ))}
          </div>
        ) : apps.length === 0 ? (
          <div className="empty-state">
            <AppWindowIcon size={28} />
            <strong>No applications yet</strong>
            <p>Deploy your first app from a Git repository, template, or Docker image.</p>
            <button type="button" className="secondary-action" onClick={() => onNavigate('new')}>
              <PlusIcon size={13} />
              Deploy app
            </button>
          </div>
        ) : (
          <ul className="resources-list">
            {apps.map((r) => (
              <Fragment key={r.uuid}>
                <li
                  className="resource-row"
                  style={currentRowStyle(r.uuid)}
                  tabIndex={0}
                  onClick={() => selectResource('application', r.uuid)}
                  onKeyDown={(event) => handleRowKeyDown(event, 'application', r.uuid)}
                >
                  <div className="resource-row-left">
                    <span className="resource-icon">
                      <AppWindowIcon size={13} />
                    </span>
                    <div className="resource-info">
                      <strong>{r.name}</strong>
                      <small>
                        {r.fqdn && <span>{r.fqdn}</span>}
                        {r.git_branch && <span>{r.fqdn ? ' · ' : ''}{r.git_branch}</span>}
                        {!r.fqdn && !r.git_branch && <span>Application</span>}
                      </small>
                    </div>
                  </div>
                  <div className="resource-row-right">
                    <StatusChip
                      label={
                        redeployedId === r.uuid
                          ? 'Queued'
                          : redeployingId === r.uuid
                            ? 'Building'
                            : r.status ?? 'Unknown'
                      }
                    />
                    <div className="resource-row-actions">
                      {r.fqdn && (
                        <button
                          type="button"
                          className="resource-action-btn"
                          title="Open in browser"
                          onClick={(event) => {
                            stopRowEvent(event)
                            openUrl(r.fqdn)
                          }}
                        >
                          <ExternalLinkIcon size={12} />
                        </button>
                      )}
                      <button
                        type="button"
                        className="resource-action-btn"
                        title={redeployedId === r.uuid ? 'Redeploy queued' : 'Redeploy'}
                        disabled={redeployingId === r.uuid || isAnyActionRunning}
                        onClick={(event) => {
                          stopRowEvent(event)
                          void handleRedeploy(r.uuid)
                        }}
                      >
                        <RefreshCwIcon size={12} />
                      </button>
                      <button
                        type="button"
                        className="resource-action-btn danger"
                        title="Delete application"
                        disabled={isAnyActionRunning}
                        onClick={(event) => {
                          stopRowEvent(event)
                          requestDelete('application', r.uuid, r.name)
                        }}
                      >
                        <TrashIcon size={12} />
                      </button>
                    </div>
                  </div>
                </li>

                {confirmDeleteId === r.uuid && (
                  <li className="delete-confirm-row">
                    <span>
                      Delete <strong>{confirmDeleteName}</strong>? All deployments and data will be removed permanently.
                    </span>
                    <button
                      type="button"
                      className="secondary-action"
                      style={{ padding: '4px 10px', fontSize: '0.78rem' }}
                      onClick={cancelDelete}
                      disabled={deletingId !== null}
                    >
                      Cancel
                    </button>
                    <button
                      type="button"
                      className="primary-action danger-action"
                      style={{ padding: '4px 10px', fontSize: '0.78rem' }}
                      onClick={() => void handleDelete()}
                      disabled={deletingId !== null}
                    >
                      {deletingId === r.uuid ? 'Deleting…' : 'Confirm delete'}
                    </button>
                  </li>
                )}
              </Fragment>
            ))}
          </ul>
        )}
      </article>

      {/* ── Databases ─────────────────────────────────────── */}
      <article className="panel">
        <div className="panel-heading">
          <div>
            <p className="eyebrow">Databases</p>
            <h3>Managed databases</h3>
          </div>
        </div>

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
        ) : databases.length === 0 ? (
          <div className="empty-state">
            <DatabaseIcon size={28} />
            <strong>No databases yet</strong>
            <p>Add a managed database from the deploy wizard.</p>
          </div>
        ) : (
          <ul className="resources-list">
            {databases.map((r) => (
              <Fragment key={r.uuid}>
                <li
                  className="resource-row"
                  style={currentRowStyle(r.uuid)}
                  tabIndex={0}
                  onClick={() => selectResource('database', r.uuid)}
                  onKeyDown={(event) => handleRowKeyDown(event, 'database', r.uuid)}
                >
                  <div className="resource-row-left">
                    <span className="resource-icon">
                      <DatabaseIcon size={13} />
                    </span>
                    <div className="resource-info">
                      <strong>{r.name}</strong>
                      <small>{r.type}</small>
                    </div>
                  </div>
                  <div className="resource-row-right">
                    <StatusChip label={r.status ?? 'Unknown'} />
                    <div className="resource-row-actions">
                      <button
                        type="button"
                        className="resource-action-btn danger"
                        title="Delete database"
                        disabled={isAnyActionRunning}
                        onClick={(event) => {
                          stopRowEvent(event)
                          requestDelete('database', r.uuid, r.name)
                        }}
                      >
                        <TrashIcon size={12} />
                      </button>
                    </div>
                  </div>
                </li>

                {confirmDeleteId === r.uuid && (
                  <li className="delete-confirm-row">
                    <span>
                      Delete <strong>{confirmDeleteName}</strong>? All data will be permanently removed.
                    </span>
                    <button
                      type="button"
                      className="secondary-action"
                      style={{ padding: '4px 10px', fontSize: '0.78rem' }}
                      onClick={cancelDelete}
                      disabled={deletingId !== null}
                    >
                      Cancel
                    </button>
                    <button
                      type="button"
                      className="primary-action danger-action"
                      style={{ padding: '4px 10px', fontSize: '0.78rem' }}
                      onClick={() => void handleDelete()}
                      disabled={deletingId !== null}
                    >
                      {deletingId === r.uuid ? 'Deleting…' : 'Confirm delete'}
                    </button>
                  </li>
                )}
              </Fragment>
            ))}
          </ul>
        )}
      </article>

      {/* ── Services ──────────────────────────────────────── */}
      <article className="panel">
        <div className="panel-heading">
          <div>
            <p className="eyebrow">Services</p>
            <h3>One-click services</h3>
          </div>
        </div>

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
        ) : services.length === 0 ? (
          <div className="empty-state">
            <GridIcon size={28} />
            <strong>No services yet</strong>
            <p>One-click services like Plausible, Umami, and more are added here.</p>
          </div>
        ) : (
          <ul className="resources-list">
            {services.map((r) => (
              <Fragment key={r.uuid}>
                <li
                  className="resource-row"
                  style={currentRowStyle(r.uuid)}
                  tabIndex={0}
                  onClick={() => selectResource('service', r.uuid)}
                  onKeyDown={(event) => handleRowKeyDown(event, 'service', r.uuid)}
                >
                  <div className="resource-row-left">
                    <span className="resource-icon">
                      <GridIcon size={13} />
                    </span>
                    <div className="resource-info">
                      <strong>{r.name}</strong>
                      <small>{r.fqdn ?? 'Internal service'}</small>
                    </div>
                  </div>
                  <div className="resource-row-right">
                    <StatusChip label={r.status ?? 'Unknown'} />
                    <div className="resource-row-actions">
                      {r.fqdn && (
                        <button
                          type="button"
                          className="resource-action-btn"
                          title="Open in browser"
                          onClick={(event) => {
                            stopRowEvent(event)
                            openUrl(r.fqdn)
                          }}
                        >
                          <ExternalLinkIcon size={12} />
                        </button>
                      )}
                      <button
                        type="button"
                        className="resource-action-btn"
                        title="Redeploy"
                        disabled={redeployingId === r.uuid || isAnyActionRunning}
                        onClick={(event) => {
                          stopRowEvent(event)
                          void handleRedeploy(r.uuid)
                        }}
                      >
                        <RefreshCwIcon size={12} />
                      </button>
                      <button
                        type="button"
                        className="resource-action-btn danger"
                        title="Delete service"
                        disabled={isAnyActionRunning}
                        onClick={(event) => {
                          stopRowEvent(event)
                          requestDelete('service', r.uuid, r.name)
                        }}
                      >
                        <TrashIcon size={12} />
                      </button>
                    </div>
                  </div>
                </li>

                {confirmDeleteId === r.uuid && (
                  <li className="delete-confirm-row">
                    <span>
                      Delete <strong>{confirmDeleteName}</strong>? This cannot be undone.
                    </span>
                    <button
                      type="button"
                      className="secondary-action"
                      style={{ padding: '4px 10px', fontSize: '0.78rem' }}
                      onClick={cancelDelete}
                      disabled={deletingId !== null}
                    >
                      Cancel
                    </button>
                    <button
                      type="button"
                      className="primary-action danger-action"
                      style={{ padding: '4px 10px', fontSize: '0.78rem' }}
                      onClick={() => void handleDelete()}
                      disabled={deletingId !== null}
                    >
                      {deletingId === r.uuid ? 'Deleting…' : 'Confirm delete'}
                    </button>
                  </li>
                )}
              </Fragment>
            ))}
          </ul>
        )}
      </article>

      <article className="panel panel-wide">
        <div className="panel-heading">
          <div>
            <p className="eyebrow">Inspector</p>
            <h3>Resource details</h3>
          </div>
        </div>

        {!selectedResourceId || !selectedResourceType ? (
          <div className="empty-state" style={{ padding: '28px 20px' }}>
            <GridIcon size={28} />
            <strong>Select a resource</strong>
            <p>Click any application, database, or service row to inspect it, run quick actions, or edit an application configuration.</p>
          </div>
        ) : (
          <div style={{ display: 'grid', gap: 12 }}>
            {resourceNotice && (
              <div className="info-banner">
                <span>{resourceNotice}</span>
              </div>
            )}

            {selectedApplicationError && (
              <div className="error-banner">
                <span>{selectedApplicationError}</span>
              </div>
            )}

            {selectedApp && (
              <div className="split-panel">
                <div className="subpanel">
                  <div className="panel-heading" style={{ marginBottom: 0 }}>
                    <div>
                      <p className="eyebrow">Application</p>
                      <h3>{selectedApp.name}</h3>
                    </div>
                    <StatusChip label={selectedApp.status ?? 'Unknown'} />
                  </div>

                  {selectedApplicationLoading ? (
                    <div style={{ display: 'grid', gap: 8 }}>
                      <div className="skeleton-line medium" />
                      <div className="skeleton-line full" />
                      <div className="skeleton-line short" />
                    </div>
                  ) : selectedApplication ? (
                    editingApplication && applicationEditor ? (
                      <div className="settings-subform" style={{ marginTop: 0 }}>
                        <div className="form-grid">
                          <label className="field">
                            <span>Application name</span>
                            <input
                              value={applicationEditor.name}
                              onChange={(event) => setApplicationEditorValue('name', event.currentTarget.value)}
                              disabled={savingApplication}
                            />
                          </label>
                          <label className="field">
                            <span>Git branch</span>
                            <input
                              value={applicationEditor.gitBranch}
                              onChange={(event) => setApplicationEditorValue('gitBranch', event.currentTarget.value)}
                              disabled={savingApplication}
                            />
                          </label>
                          <label className="field field-wide">
                            <span>Domains</span>
                            <input
                              value={applicationEditor.domains}
                              onChange={(event) => setApplicationEditorValue('domains', event.currentTarget.value)}
                              placeholder="app.backnd.top or multiple comma-separated domains"
                              disabled={savingApplication}
                            />
                            <small className="field-hint">Use a host name or a full URL. Multiple domains can be comma-separated.</small>
                          </label>
                          <label className="field">
                            <span>Exposed port</span>
                            <input
                              value={applicationEditor.portsExposes}
                              onChange={(event) => setApplicationEditorValue('portsExposes', event.currentTarget.value)}
                              disabled={savingApplication}
                            />
                          </label>
                          <label className="field">
                            <span>Base directory</span>
                            <input
                              value={applicationEditor.baseDirectory}
                              onChange={(event) => setApplicationEditorValue('baseDirectory', event.currentTarget.value)}
                              disabled={savingApplication}
                            />
                          </label>
                          <label className="field">
                            <span>Publish directory</span>
                            <input
                              value={applicationEditor.publishDirectory}
                              onChange={(event) => setApplicationEditorValue('publishDirectory', event.currentTarget.value)}
                              disabled={savingApplication}
                            />
                          </label>
                          <label className="field field-wide">
                            <span>Description</span>
                            <input
                              value={applicationEditor.description}
                              onChange={(event) => setApplicationEditorValue('description', event.currentTarget.value)}
                              disabled={savingApplication}
                            />
                          </label>
                          <label className="field field-wide">
                            <span>Install command</span>
                            <input
                              value={applicationEditor.installCommand}
                              onChange={(event) => setApplicationEditorValue('installCommand', event.currentTarget.value)}
                              disabled={savingApplication}
                            />
                          </label>
                          <label className="field field-wide">
                            <span>Build command</span>
                            <input
                              value={applicationEditor.buildCommand}
                              onChange={(event) => setApplicationEditorValue('buildCommand', event.currentTarget.value)}
                              disabled={savingApplication}
                            />
                          </label>
                          <label className="field field-wide">
                            <span>Start command</span>
                            <input
                              value={applicationEditor.startCommand}
                              onChange={(event) => setApplicationEditorValue('startCommand', event.currentTarget.value)}
                              disabled={savingApplication}
                            />
                          </label>
                        </div>

                        <div className="settings-row" style={{ paddingTop: 0 }}>
                          <div>
                            <strong>Health check</strong>
                            <small>Configure the path and optional port used after each deploy.</small>
                          </div>
                          <label style={{ display: 'inline-flex', alignItems: 'center', gap: 8, fontSize: '0.82rem', color: 'var(--text-body)' }}>
                            <input
                              type="checkbox"
                              checked={applicationEditor.healthCheckEnabled}
                              onChange={(event) => setApplicationEditorValue('healthCheckEnabled', event.currentTarget.checked)}
                              disabled={savingApplication}
                            />
                            Enable health check
                          </label>
                        </div>

                        {applicationEditor.healthCheckEnabled && (
                          <div className="form-grid">
                            <label className="field">
                              <span>Health check path</span>
                              <input
                                value={applicationEditor.healthCheckPath}
                                onChange={(event) => setApplicationEditorValue('healthCheckPath', event.currentTarget.value)}
                                placeholder="/health"
                                disabled={savingApplication}
                              />
                            </label>
                            <label className="field">
                              <span>Health check port</span>
                              <input
                                value={applicationEditor.healthCheckPort}
                                onChange={(event) => setApplicationEditorValue('healthCheckPort', event.currentTarget.value)}
                                placeholder="3000"
                                disabled={savingApplication}
                              />
                            </label>
                          </div>
                        )}

                        <div className="form-grid">
                          <div className="settings-row" style={{ marginTop: 0 }}>
                            <div>
                              <strong>Auto-deploy on push</strong>
                              <small>Queue a redeploy automatically for matching webhook pushes.</small>
                            </div>
                            <label style={{ display: 'inline-flex', alignItems: 'center', gap: 8, fontSize: '0.82rem', color: 'var(--text-body)' }}>
                              <input
                                type="checkbox"
                                checked={applicationEditor.autoDeployEnabled}
                                onChange={(event) => setApplicationEditorValue('autoDeployEnabled', event.currentTarget.checked)}
                                disabled={savingApplication}
                              />
                              Enabled
                            </label>
                          </div>
                          <div className="settings-row" style={{ marginTop: 0 }}>
                            <div>
                              <strong>Force HTTPS</strong>
                              <small>Redirect inbound traffic to HTTPS when the domain is served securely.</small>
                            </div>
                            <label style={{ display: 'inline-flex', alignItems: 'center', gap: 8, fontSize: '0.82rem', color: 'var(--text-body)' }}>
                              <input
                                type="checkbox"
                                checked={applicationEditor.forceHttpsEnabled}
                                onChange={(event) => setApplicationEditorValue('forceHttpsEnabled', event.currentTarget.checked)}
                                disabled={savingApplication}
                              />
                              Enabled
                            </label>
                          </div>
                        </div>

                        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                          <button
                            type="button"
                            className="primary-action"
                            onClick={() => void handleSaveApplication()}
                            disabled={savingApplication}
                          >
                            {savingApplication ? 'Saving…' : 'Save changes'}
                          </button>
                          <button
                            type="button"
                            className="secondary-action"
                            onClick={() => {
                              setEditingApplication(false)
                              setApplicationEditor(createAppEditorState(selectedApplication))
                              setSelectedApplicationError(null)
                            }}
                            disabled={savingApplication}
                          >
                            Cancel
                          </button>
                        </div>
                      </div>
                    ) : (
                      <div style={{ display: 'grid', gap: 12 }}>
                        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, minmax(0, 1fr))', gap: 10 }}>
                          <div className="subpanel">
                            <strong style={{ fontSize: '0.8rem', color: 'var(--text-heading)' }}>Repository</strong>
                            <code style={{ fontFamily: 'var(--font-mono)', fontSize: '0.76rem', color: 'var(--text-muted)' }}>{selectedApplication.git_repository ?? 'Not set'}</code>
                          </div>
                          <div className="subpanel">
                            <strong style={{ fontSize: '0.8rem', color: 'var(--text-heading)' }}>Git branch</strong>
                            <code style={{ fontFamily: 'var(--font-mono)', fontSize: '0.76rem', color: 'var(--text-muted)' }}>{selectedApplication.git_branch ?? 'Not set'}</code>
                          </div>
                          <div className="subpanel">
                            <strong style={{ fontSize: '0.8rem', color: 'var(--text-heading)' }}>Domains</strong>
                            <code style={{ fontFamily: 'var(--font-mono)', fontSize: '0.76rem', color: 'var(--text-muted)' }}>{selectedApplication.domains ?? selectedApplication.fqdn ?? 'Internal only'}</code>
                          </div>
                          <div className="subpanel">
                            <strong style={{ fontSize: '0.8rem', color: 'var(--text-heading)' }}>Build pack</strong>
                            <code style={{ fontFamily: 'var(--font-mono)', fontSize: '0.76rem', color: 'var(--text-muted)' }}>{selectedApplication.build_pack ?? 'Not set'}</code>
                          </div>
                        </div>

                        <div className="subpanel">
                          <strong style={{ fontSize: '0.8rem', color: 'var(--text-heading)' }}>Deployment settings</strong>
                          <ul className="plain-list">
                            <li>Exposed port: {selectedApplication.ports_exposes ?? 'Not set'}</li>
                            <li>Base directory: {selectedApplication.base_directory || '/'}</li>
                            <li>Publish directory: {selectedApplication.publish_directory || 'Default output'}</li>
                            <li>Health check: {selectedApplication.health_check_enabled ? `${selectedApplication.health_check_path || '/'}${selectedApplication.health_check_port ? ` on ${selectedApplication.health_check_port}` : ''}` : 'Disabled'}</li>
                            <li>Auto-deploy: {selectedApplication.is_auto_deploy_enabled === false ? 'Disabled' : 'Enabled'}</li>
                            <li>Force HTTPS: {selectedApplication.is_force_https_enabled === false ? 'Disabled' : 'Enabled'}</li>
                          </ul>
                        </div>
                      </div>
                    )
                  ) : null}
                </div>

                <div className="subpanel">
                  <strong style={{ fontSize: '0.8rem', color: 'var(--text-heading)' }}>Quick actions</strong>
                  <div style={{ display: 'grid', gap: 8 }}>
                    {selectedApp.fqdn && (
                      <button type="button" className="secondary-action" onClick={() => openUrl(selectedApp.fqdn)}>
                        <ExternalLinkIcon size={13} />
                        Open application
                      </button>
                    )}
                    <button
                      type="button"
                      className="secondary-action"
                      onClick={() => void handleRedeploy(selectedApp.uuid)}
                      disabled={redeployingId === selectedApp.uuid || isAnyActionRunning}
                    >
                      <RefreshCwIcon size={13} />
                      {redeployingId === selectedApp.uuid ? 'Queueing redeploy…' : 'Redeploy now'}
                    </button>
                    <button
                      type="button"
                      className="secondary-action"
                      onClick={() => {
                        if (selectedApplication) {
                          setApplicationEditor(createAppEditorState(selectedApplication))
                        }
                        setEditingApplication((current) => !current)
                        setSelectedApplicationError(null)
                        setResourceNotice(null)
                      }}
                      disabled={selectedApplicationLoading || !selectedApplication}
                    >
                      {editingApplication ? 'Hide editor' : 'Edit configuration'}
                    </button>
                    <button
                      type="button"
                      className="secondary-action danger-action"
                      onClick={() => requestDelete('application', selectedApp.uuid, selectedApp.name)}
                      disabled={isAnyActionRunning}
                    >
                      <TrashIcon size={13} />
                      Delete application
                    </button>
                  </div>
                </div>
              </div>
            )}

            {selectedDatabase && (
              <div className="split-panel">
                <div className="subpanel">
                  <div className="panel-heading" style={{ marginBottom: 0 }}>
                    <div>
                      <p className="eyebrow">Database</p>
                      <h3>{selectedDatabase.name}</h3>
                    </div>
                    <StatusChip label={selectedDatabase.status ?? 'Unknown'} />
                  </div>
                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, minmax(0, 1fr))', gap: 10 }}>
                    <div className="subpanel">
                      <strong style={{ fontSize: '0.8rem', color: 'var(--text-heading)' }}>Engine</strong>
                      <code style={{ fontFamily: 'var(--font-mono)', fontSize: '0.76rem', color: 'var(--text-muted)' }}>{selectedDatabase.type}</code>
                    </div>
                    <div className="subpanel">
                      <strong style={{ fontSize: '0.8rem', color: 'var(--text-heading)' }}>Internal connection</strong>
                      <code style={{ fontFamily: 'var(--font-mono)', fontSize: '0.76rem', color: 'var(--text-muted)', wordBreak: 'break-all' }}>{selectedDatabase.internal_db_url ?? 'Managed by CoolDev'}</code>
                    </div>
                  </div>
                </div>

                <div className="subpanel">
                  <strong style={{ fontSize: '0.8rem', color: 'var(--text-heading)' }}>Quick actions</strong>
                  <p className="field-hint">Review the engine and connection details here, then remove the database when you are ready.</p>
                  <button
                    type="button"
                    className="secondary-action danger-action"
                    onClick={() => requestDelete('database', selectedDatabase.uuid, selectedDatabase.name)}
                    disabled={isAnyActionRunning}
                  >
                    <TrashIcon size={13} />
                    Delete database
                  </button>
                </div>
              </div>
            )}

            {selectedService && (
              <div className="split-panel">
                <div className="subpanel">
                  <div className="panel-heading" style={{ marginBottom: 0 }}>
                    <div>
                      <p className="eyebrow">Service</p>
                      <h3>{selectedService.name}</h3>
                    </div>
                    <StatusChip label={selectedService.status ?? 'Unknown'} />
                  </div>
                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, minmax(0, 1fr))', gap: 10 }}>
                    <div className="subpanel">
                      <strong style={{ fontSize: '0.8rem', color: 'var(--text-heading)' }}>Access</strong>
                      <code style={{ fontFamily: 'var(--font-mono)', fontSize: '0.76rem', color: 'var(--text-muted)' }}>{selectedService.fqdn ?? 'Internal service'}</code>
                    </div>
                    <div className="subpanel">
                      <strong style={{ fontSize: '0.8rem', color: 'var(--text-heading)' }}>Lifecycle</strong>
                      <p className="field-hint" style={{ margin: 0 }}>Use redeploy to refresh the service or delete to remove the stack. This inspector now gives services the same actionable surface as applications.</p>
                    </div>
                  </div>
                </div>

                <div className="subpanel">
                  <strong style={{ fontSize: '0.8rem', color: 'var(--text-heading)' }}>Quick actions</strong>
                  <div style={{ display: 'grid', gap: 8 }}>
                    {selectedService.fqdn && (
                      <button type="button" className="secondary-action" onClick={() => openUrl(selectedService.fqdn)}>
                        <ExternalLinkIcon size={13} />
                        Open service
                      </button>
                    )}
                    <button
                      type="button"
                      className="secondary-action"
                      onClick={() => void handleRedeploy(selectedService.uuid)}
                      disabled={redeployingId === selectedService.uuid || isAnyActionRunning}
                    >
                      <RefreshCwIcon size={13} />
                      {redeployingId === selectedService.uuid ? 'Queueing redeploy…' : 'Redeploy now'}
                    </button>
                    <button
                      type="button"
                      className="secondary-action danger-action"
                      onClick={() => requestDelete('service', selectedService.uuid, selectedService.name)}
                      disabled={isAnyActionRunning}
                    >
                      <TrashIcon size={13} />
                      Delete service
                    </button>
                  </div>
                </div>
              </div>
            )}
          </div>
        )}
      </article>
    </section>
  )
}
