import { useDeferredValue, useEffect, useRef, useState } from 'react'
import { humanizeDeploymentFailure } from '../lib/diagnostics'
import {
  cancelDeployment,
  getApplicationDeployments,
  listApplications,
  listDeployments,
  triggerDeploy,
  type ApiDeployment,
} from '../lib/api'
import { AlertIcon, RefreshCwIcon, StopIcon } from '../components/Icons'
import { StatusChip } from '../components/StatusChip'
import type { DeploymentRecord } from '../types'

type DeploymentListRecord = DeploymentRecord & {
  id: string
  deploymentUuid?: string
  resourceUuid?: string
}

function recordLabel(record: DeploymentRecord): string {
  return record.sha ?? record.branch ?? 'pending'
}

function toDisplayStatus(status: string | undefined): DeploymentRecord['status'] {
  const normalized = status?.toLowerCase() ?? ''

  if (normalized === 'queued') return 'Queued'
  if (normalized === 'in_progress') return 'Building'
  if (normalized === 'finished') return 'Ready'

  return 'Failed'
}

function formatTimestamp(value: string | undefined): string | undefined {
  if (!value) return undefined

  const timestamp = new Date(value)
  if (Number.isNaN(timestamp.getTime())) {
    return value
  }

  return timestamp.toLocaleString()
}

function toQueueRecord(deployment: ApiDeployment): DeploymentListRecord {
  const label = deployment.commit?.slice(0, 7) ?? 'pending'
  const appName = deployment.application_name ?? 'Application deployment'

  return {
    id: deployment.deployment_uuid ?? deployment.uuid ?? `${appName}-${label}`,
    deploymentUuid: deployment.deployment_uuid ?? deployment.uuid,
    resourceUuid: typeof deployment.application_id === 'string' ? deployment.application_id : undefined,
    app: appName,
    status: toDisplayStatus(deployment.status),
    rawLog: deployment.logs ?? 'Deployment is still running. Live logs are not available yet.',
    sha: deployment.commit?.slice(0, 7),
    eta: deployment.server_name ? `On ${deployment.server_name}` : 'In progress',
  }
}

function toHistoryRecord(appName: string, resourceUuid: string, deployment: ApiDeployment): DeploymentListRecord {
  const label = deployment.commit?.slice(0, 7) ?? 'pending'

  return {
    id: deployment.deployment_uuid ?? deployment.uuid ?? `${appName}-${label}`,
    deploymentUuid: deployment.deployment_uuid ?? deployment.uuid,
    resourceUuid,
    app: appName,
    status: toDisplayStatus(deployment.status),
    rawLog: deployment.logs ?? 'No deployment logs were returned for this record.',
    sha: deployment.commit?.slice(0, 7),
    time: formatTimestamp(deployment.created_at),
  }
}

function describeDeployment(record: DeploymentRecord) {
  if (record.status === 'Failed') {
    return humanizeDeploymentFailure(record.rawLog)
  }

  if (record.status === 'Ready') {
    return {
      title: 'Deployment completed',
      probableCause: 'The latest deployment finished successfully and is ready to serve traffic.',
      nextStep: 'Verify the app URL, then leave this deployment alone unless you need to ship a new change.',
      severity: 'info' as const,
    }
  }

  if (record.status === 'Queued' || record.status === 'Building') {
    return {
      title: 'Deployment in progress',
      probableCause: 'The platform is still cloning, building, or starting the release on the target server.',
      nextStep: 'Keep the raw logs open and wait for the final readiness result before making more changes.',
      severity: 'info' as const,
    }
  }

  return {
    title: 'Deployment status changed',
    probableCause: 'The deployment is no longer actively running.',
    nextStep: 'Review the raw log to confirm whether any follow-up action is needed.',
    severity: 'info' as const,
  }
}

export function DeploymentsView() {
  const [activeTab, setActiveTab] = useState<'queue' | 'history'>('history')
  const [search, setSearch] = useState('')
  const [queueRecords, setQueueRecords] = useState<DeploymentListRecord[]>([])
  const [historyRecords, setHistoryRecords] = useState<DeploymentListRecord[]>([])
  const [selectedRecordId, setSelectedRecordId] = useState('')
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const deferredSearch = useDeferredValue(search)
  const logViewportRef = useRef<HTMLDivElement | null>(null)
  const shouldStickToBottomRef = useRef(true)

  // Action state
  const [cancellingId, setCancellingId] = useState<string | null>(null)
  const [redeployingId, setRedeployingId] = useState<string | null>(null)
  const [actionError, setActionError] = useState<string | null>(null)
  const [actionSuccess, setActionSuccess] = useState<string | null>(null)

  useEffect(() => {
    let cancelled = false

    async function loadDeployments() {
      setLoading(true)
      setError(null)

      try {
        const [queue, applications] = await Promise.all([
          listDeployments({ skip: 0, take: 20 }),
          listApplications(),
        ])

        const histories = await Promise.all(
          applications.map(async (application) => {
            const response = await getApplicationDeployments(application.uuid)
            return response.deployments.map((deployment) =>
              toHistoryRecord(application.name, application.uuid, deployment),
            )
          }),
        )

        if (cancelled) {
          return
        }

        const nextQueue = queue.map(toQueueRecord)
        const nextHistory = histories
          .flat()
          .sort((left, right) => {
            const leftDate = left.time ? new Date(left.time).getTime() : 0
            const rightDate = right.time ? new Date(right.time).getTime() : 0
            return rightDate - leftDate
          })

        setQueueRecords(nextQueue)
        setHistoryRecords(nextHistory)

        const defaultRecord =
          nextHistory.find((deployment) => deployment.status === 'Failed') ??
          nextHistory[0] ??
          nextQueue[0]

        setSelectedRecordId(defaultRecord?.id ?? '')
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

    void loadDeployments()

    return () => {
      cancelled = true
    }
  }, [])

  async function handleCancel(record: DeploymentListRecord) {
    if (!record.deploymentUuid) {
      setActionError('No deployment ID found — cannot cancel this deployment.')
      return
    }

    setCancellingId(record.id)
    setActionError(null)
    setActionSuccess(null)

    try {
      await cancelDeployment(record.deploymentUuid)
      setActionSuccess(`Cancellation requested for ${record.app}.`)

      // Update local state optimistically
      setQueueRecords((current) =>
        current.map((r) =>
          r.id === record.id ? { ...r, status: 'Failed' as const } : r,
        ),
      )
      setHistoryRecords((current) =>
        current.map((r) =>
          r.id === record.id ? { ...r, status: 'Failed' as const } : r,
        ),
      )
    } catch (err) {
      setActionError(err instanceof Error ? err.message : String(err))
    } finally {
      setCancellingId(null)
    }
  }

  async function handleRedeploy(record: DeploymentListRecord) {
    if (!record.resourceUuid) {
      setActionError('No resource ID found — cannot trigger a redeploy for this deployment.')
      return
    }

    setRedeployingId(record.id)
    setActionError(null)
    setActionSuccess(null)

    try {
      await triggerDeploy(record.resourceUuid)
      setActionSuccess(`Redeploy queued for ${record.app}.`)

      // Switch to queue tab to see the new deployment
      setActiveTab('queue')
    } catch (err) {
      setActionError(err instanceof Error ? err.message : String(err))
    } finally {
      setRedeployingId(null)
    }
  }

  const activeRecords = activeTab === 'queue' ? queueRecords : historyRecords
  const filteredRecords = activeRecords.filter((record) =>
    record.app.toLowerCase().includes(deferredSearch.toLowerCase()),
  )

  const selectedRecord =
    filteredRecords.find((record) => record.id === selectedRecordId) ??
    filteredRecords[0] ??
    historyRecords.find((record) => record.id === selectedRecordId) ??
    historyRecords[0] ??
    queueRecords[0]

  useEffect(() => {
    shouldStickToBottomRef.current = true
  }, [selectedRecord?.id])

  useEffect(() => {
    const node = logViewportRef.current

    if (!node || !selectedRecord || !shouldStickToBottomRef.current) {
      return
    }

    node.scrollTop = node.scrollHeight
  }, [selectedRecord?.id, selectedRecord?.rawLog])

  const diagnostic = selectedRecord
    ? describeDeployment(selectedRecord)
    : null

  const canCancel =
    selectedRecord?.status === 'Queued' || selectedRecord?.status === 'Building'
  const canRedeploy =
    selectedRecord?.status === 'Ready' || selectedRecord?.status === 'Failed'

  function handleLogScroll() {
    const node = logViewportRef.current

    if (!node) {
      return
    }

    const distanceFromBottom = node.scrollHeight - node.scrollTop - node.clientHeight
    shouldStickToBottomRef.current = distanceFromBottom < 24
  }

  return (
    <section className="content-grid">
      <article className="panel panel-wide">
        <div className="panel-heading">
          <div>
            <p className="eyebrow">Deployments</p>
            <h3>Logs and diagnostics</h3>
          </div>
          <div className="segmented-control" aria-label="Deployment tab">
            <button
              type="button"
              className={activeTab === 'queue' ? 'segment is-active' : 'segment'}
              onClick={() => setActiveTab('queue')}
            >
              Queue
              {queueRecords.filter((r) => r.status === 'Queued' || r.status === 'Building').length > 0 && (
                <span
                  aria-hidden="true"
                  style={{
                    marginLeft: 5,
                    background: 'var(--accent)',
                    color: '#000',
                    borderRadius: 4,
                    padding: '0 5px',
                    fontSize: '0.7rem',
                    fontWeight: 700,
                  }}
                >
                  {queueRecords.filter((r) => r.status === 'Queued' || r.status === 'Building').length}
                </span>
              )}
            </button>
            <button
              type="button"
              className={activeTab === 'history' ? 'segment is-active' : 'segment'}
              onClick={() => setActiveTab('history')}
            >
              History
            </button>
          </div>
        </div>

        {actionError && (
          <div className="error-banner" style={{ marginBottom: 12 }}>
            <AlertIcon size={13} />
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

        {actionSuccess && (
          <div className="info-banner" style={{ marginBottom: 12 }}>
            <span>{actionSuccess}</span>
          </div>
        )}

        <div className="wizard-layout">
          <div className="stacked-panel">
            <label className="field field-wide">
              <input
                value={search}
                onChange={(event) => setSearch(event.currentTarget.value)}
                placeholder="Filter by app name…"
              />
            </label>

            {error && (
              <p className="field-hint" style={{ marginBottom: 12 }}>
                Could not load deployments right now. {error}
              </p>
            )}

            <div className="subpanel subtle-panel table-panel">
              {loading ? (
                <div style={{ display: 'grid', gap: 4 }}>
                  {[1, 2, 3, 4].map((n) => (
                    <div key={n} className="skeleton-row" style={{ padding: '9px 11px' }}>
                      <div className="skeleton-body">
                        <div className="skeleton-line medium" />
                        <div className="skeleton-line short" />
                      </div>
                    </div>
                  ))}
                </div>
              ) : filteredRecords.length === 0 ? (
                <p className="field-hint">No deployments found for this view.</p>
              ) : filteredRecords.map((record) => (
                <button
                  key={record.id}
                  type="button"
                  className={record.id === selectedRecord?.id ? 'table-row is-active' : 'table-row'}
                  onClick={() => { setSelectedRecordId(record.id); setActionError(null); setActionSuccess(null) }}
                >
                  <div>
                    <strong>{record.app}</strong>
                    <span>{recordLabel(record)}</span>
                  </div>
                  <div className="provider-meta">
                    <StatusChip label={record.status} />
                    <small>{record.time ?? record.eta}</small>
                  </div>
                </button>
              ))}
            </div>
          </div>

          <aside className="stacked-panel">
            {selectedRecord && diagnostic ? (
              <>
                <div className="subpanel">
                  <p className="eyebrow">Selected deployment</p>
                  <h4>{selectedRecord.app}</h4>
                  <p>
                    <strong>Status:</strong> {selectedRecord.status}
                  </p>
                  <p>
                    <strong>Analysis:</strong> {diagnostic.title}
                  </p>
                  <p>
                    <strong>Probable cause:</strong> {diagnostic.probableCause}
                  </p>
                  <p>
                    <strong>Next step:</strong> {diagnostic.nextStep}
                  </p>

                  {/* ── Deployment actions ─── */}
                  <div style={{ display: 'flex', gap: 8, marginTop: 4, flexWrap: 'wrap' }}>
                    {canCancel && (
                      <button
                        type="button"
                        className="secondary-action danger-action"
                        style={{ fontSize: '0.79rem', padding: '5px 10px' }}
                        disabled={cancellingId === selectedRecord.id}
                        onClick={() => void handleCancel(selectedRecord)}
                      >
                        <StopIcon size={12} />
                        {cancellingId === selectedRecord.id ? 'Cancelling…' : 'Cancel deployment'}
                      </button>
                    )}
                    {canRedeploy && selectedRecord.resourceUuid && (
                      <button
                        type="button"
                        className="secondary-action"
                        style={{ fontSize: '0.79rem', padding: '5px 10px' }}
                        disabled={redeployingId === selectedRecord.id}
                        onClick={() => void handleRedeploy(selectedRecord)}
                      >
                        <RefreshCwIcon size={12} />
                        {redeployingId === selectedRecord.id ? 'Queuing…' : 'Redeploy'}
                      </button>
                    )}
                  </div>
                </div>

                <div className="subpanel subtle-panel">
                  <p className="eyebrow">Raw logs</p>
                  <div
                    ref={logViewportRef}
                    className="log-card-shell"
                    role="log"
                    aria-label="Deployment logs"
                    aria-live={selectedRecord.status === 'Building' ? 'polite' : 'off'}
                    tabIndex={0}
                    onScroll={handleLogScroll}
                  >
                    <pre className="log-card">{selectedRecord.rawLog}</pre>
                  </div>
                </div>
              </>
            ) : (
              <div className="subpanel subtle-panel">
                <p className="field-hint">Select a deployment to view logs and diagnostics.</p>
              </div>
            )}
          </aside>
        </div>
      </article>
    </section>
  )
}
