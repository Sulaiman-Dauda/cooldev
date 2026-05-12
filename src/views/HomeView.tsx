import { useEffect, useState } from 'react'
import { humanizeDeploymentFailure } from '../lib/diagnostics'
import {
  getApplicationDeployments,
  listApplications,
  listDatabases,
  listDeployments,
  listServices,
  type ApiDeployment,
} from '../lib/api'
import { StatusChip } from '../components/StatusChip'
import { AppWindowIcon, DatabaseIcon, GridIcon, LayersIcon } from '../components/Icons'
import type { View } from '../types'

type HomeViewProps = {
  onNavigate: (view: View) => void
}

type ResourcePreview = {
  id: string
  name: string
  type: 'app' | 'database' | 'service'
  status: 'Ready' | 'Failed' | 'Building' | 'Stopped'
  detail: string
}

type DeploymentPreview = {
  id: string
  app: string
  status: 'Queued' | 'Building' | 'Ready' | 'Failed'
  rawLog: string
  sha?: string
  time?: string
  eta?: string
}

function toDeploymentStatus(status: string | undefined): DeploymentPreview['status'] {
  const normalized = status?.toLowerCase() ?? ''

  if (normalized === 'queued') return 'Queued'
  if (normalized === 'in_progress') return 'Building'
  if (normalized === 'finished') return 'Ready'

  return 'Failed'
}

function toResourceStatus(status: string | undefined): ResourcePreview['status'] {
  const normalized = status?.toLowerCase() ?? ''

  if (/(failed|error|unhealthy|exited)/.test(normalized)) return 'Failed'
  if (/(building|queued|in_progress)/.test(normalized)) return 'Building'
  if (/(ready|running|healthy|finished)/.test(normalized)) return 'Ready'

  return 'Stopped'
}

function formatTimestamp(value: string | undefined): string | undefined {
  if (!value) return undefined

  const timestamp = new Date(value)
  if (Number.isNaN(timestamp.getTime())) {
    return value
  }

  return timestamp.toLocaleString()
}

export function HomeView({ onNavigate }: HomeViewProps) {
  const [resources, setResources] = useState<ResourcePreview[]>([])
  const [queueRecords, setQueueRecords] = useState<DeploymentPreview[]>([])
  const [historyRecords, setHistoryRecords] = useState<DeploymentPreview[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    let cancelled = false

    async function loadOverview() {
      setLoading(true)
      setError(null)

      try {
        const [applications, databases, services, queue] = await Promise.all([
          listApplications(),
          listDatabases(),
          listServices(),
          listDeployments({ skip: 0, take: 10 }),
        ])

        const histories = await Promise.all(
          applications.map(async (application) => {
            const response = await getApplicationDeployments(application.uuid)
            return response.deployments.map((deployment) => ({
              id: deployment.deployment_uuid ?? deployment.uuid ?? `${application.name}-${deployment.commit ?? 'pending'}`,
              app: application.name,
              status: toDeploymentStatus(deployment.status),
              rawLog: deployment.logs ?? 'No deployment logs were returned for this record.',
              sha: deployment.commit?.slice(0, 7),
              time: formatTimestamp(deployment.created_at),
            }))
          }),
        )

        if (cancelled) {
          return
        }

        const nextResources: ResourcePreview[] = [
          ...applications.map((resource) => ({
            id: resource.uuid,
            name: resource.name,
            type: 'app' as const,
            status: toResourceStatus(resource.status),
            detail: resource.fqdn ?? resource.git_branch ?? 'application',
          })),
          ...databases.map((resource) => ({
            id: resource.uuid,
            name: resource.name,
            type: 'database' as const,
            status: toResourceStatus(resource.status),
            detail: resource.type,
          })),
          ...services.map((resource) => ({
            id: resource.uuid,
            name: resource.name,
            type: 'service' as const,
            status: toResourceStatus(resource.status),
            detail: resource.fqdn ?? 'Internal service',
          })),
        ]

        const nextQueue: DeploymentPreview[] = queue.map((deployment: ApiDeployment) => ({
          id: deployment.deployment_uuid ?? deployment.uuid ?? `${deployment.application_name ?? 'deployment'}-${deployment.commit ?? 'pending'}`,
          app: deployment.application_name ?? 'Application deployment',
          status: toDeploymentStatus(deployment.status),
          rawLog: deployment.logs ?? 'Deployment is still running. Live logs are not available yet.',
          sha: deployment.commit?.slice(0, 7),
          eta: deployment.server_name ? `On ${deployment.server_name}` : 'In progress',
        }))

        const nextHistory = histories.flat().sort((left, right) => {
          const leftDate = left.time ? new Date(left.time).getTime() : 0
          const rightDate = right.time ? new Date(right.time).getTime() : 0
          return rightDate - leftDate
        })

        setResources(nextResources)
        setQueueRecords(nextQueue)
        setHistoryRecords(nextHistory)
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

    void loadOverview()

    return () => {
      cancelled = true
    }
  }, [])

  const diagnostics = historyRecords
    .filter((deployment) => deployment.status === 'Failed')
    .slice(0, 3)
    .map((deployment) => ({
      app: deployment.app,
      detail: humanizeDeploymentFailure(deployment.rawLog),
    }))

  const readyCount = resources.filter((r) => r.status === 'Ready').length
  const buildingCount = queueRecords.filter((d) => d.status === 'Building').length
  const failedCount = resources.filter((r) => r.status === 'Failed').length
  const appCount = resources.filter((r) => r.type === 'app').length

  return (
    <section className="content-grid">
      {/* Stats bar */}
      <div className="stats-bar">
        <div className="stat-item">
          <AppWindowIcon size={14} />
          <div>
            <strong>{appCount}</strong>
            <span>Apps</span>
          </div>
        </div>
        <div className="stat-item">
          <GridIcon size={14} />
          <div>
            <strong>{resources.length}</strong>
            <span>Total resources</span>
          </div>
        </div>
        <div className="stat-item">
          <LayersIcon size={14} />
          <div>
            <strong className={buildingCount > 0 ? 'status-building' : ''}>{buildingCount}</strong>
            <span>Building</span>
          </div>
        </div>
        <div className="stat-item">
          <DatabaseIcon size={14} />
          <div>
            <strong className={failedCount > 0 ? 'status-failed' : ''}>{failedCount}</strong>
            <span>Failed</span>
          </div>
        </div>
        <div className="stat-item">
          <AppWindowIcon size={14} />
          <div>
            <strong className="status-ready">{readyCount}</strong>
            <span>Ready</span>
          </div>
        </div>
      </div>

      {error && (
        <article className="panel panel-wide">
          <p className="field-hint">Could not load the dashboard. {error}</p>
        </article>
      )}

      {/* Resources preview */}
      <article className="panel panel-wide">
        <div className="panel-heading">
          <div>
            <p className="eyebrow">Resources</p>
            <h3>Apps, databases, and services</h3>
          </div>
          <div style={{ display: 'flex', gap: 8 }}>
            <button type="button" className="secondary-action" onClick={() => onNavigate('resources')}>
              View all
            </button>
            <button type="button" className="primary-action" onClick={() => onNavigate('new')}>
              + New resource
            </button>
          </div>
        </div>

        {loading ? (
          <p className="field-hint">Loading resources…</p>
        ) : resources.length === 0 ? (
          <p className="field-hint">No resources created yet.</p>
        ) : (
          <ul className="resources-list">
            {resources.slice(0, 5).map((r) => (
              <li key={r.id} className="resource-row">
                <span className="resource-icon">
                  {r.type === 'app' && <AppWindowIcon size={13} />}
                  {r.type === 'database' && <DatabaseIcon size={13} />}
                  {r.type === 'service' && <GridIcon size={13} />}
                </span>
                <div className="resource-info">
                  <strong>{r.name}</strong>
                  <small>{r.detail}</small>
                </div>
                <StatusChip label={r.status} />
              </li>
            ))}
          </ul>
        )}
      </article>

      {/* Deployments cockpit preview */}
      <article className="panel panel-wide">
        <div className="panel-heading">
          <div>
            <p className="eyebrow">Deployments</p>
            <h3>Queue and recent history</h3>
          </div>
          <button type="button" className="secondary-action" onClick={() => onNavigate('deployments')}>
            Open cockpit
          </button>
        </div>

        <div className="deployments-grid">
          <section className="deployment-column">
            <h4>Queue</h4>
            {loading ? (
              <p className="field-hint">Loading queue…</p>
            ) : queueRecords.length === 0 ? (
              <p className="field-hint">No active deployments.</p>
            ) : queueRecords.map((deployment) => (
              <div key={deployment.id} className="deployment-card">
                <div>
                  <strong>{deployment.app}</strong>
                  <span>{deployment.sha ?? 'pending'}</span>
                </div>
                <div className="provider-meta">
                  <StatusChip label={deployment.status} />
                  <small>{deployment.eta}</small>
                </div>
              </div>
            ))}
          </section>

          <section className="deployment-column">
            <h4>Recent</h4>
            {loading ? (
              <p className="field-hint">Loading history…</p>
            ) : historyRecords.length === 0 ? (
              <p className="field-hint">No recent deployments yet.</p>
            ) : historyRecords.slice(0, 3).map((deployment) => (
              <div key={deployment.id} className="deployment-card">
                <div>
                  <strong>{deployment.app}</strong>
                  <span>{deployment.sha ?? 'pending'}</span>
                </div>
                <div className="provider-meta">
                  <StatusChip label={deployment.status} />
                  <small>{deployment.time}</small>
                </div>
              </div>
            ))}
          </section>
        </div>
      </article>

      {/* Diagnostics */}
      {diagnostics.length > 0 && (
        <article className="panel panel-wide">
          <div className="panel-heading">
            <div>
              <p className="eyebrow">Diagnostics</p>
              <h3>Failure insights</h3>
            </div>
          </div>
          <div className="diagnostics-grid">
            {diagnostics.map((item) => (
              <div key={item.app} className="diagnostic-card">
                <h4>{item.app}</h4>
                <p>
                  <strong>{item.detail.title}:</strong> {item.detail.probableCause}
                </p>
                <p>
                  <strong>Next step:</strong> {item.detail.nextStep}
                </p>
              </div>
            ))}
          </div>
        </article>
      )}
    </section>
  )
}

