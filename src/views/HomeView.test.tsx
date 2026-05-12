import { render, screen, waitFor, within } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import {
  getApplicationDeployments,
  listApplications,
  listDatabases,
  listDeployments,
  listServices,
} from '../lib/api'
import { HomeView } from './HomeView'

vi.mock('../lib/api', async () => {
  const actual = await vi.importActual<typeof import('../lib/api')>('../lib/api')

  return {
    ...actual,
    listApplications: vi.fn(),
    listDatabases: vi.fn(),
    listDeployments: vi.fn(),
    listServices: vi.fn(),
    getApplicationDeployments: vi.fn(),
  }
})

describe('HomeView', () => {
  beforeEach(() => {
    vi.mocked(listApplications).mockResolvedValue([
      {
        uuid: 'app-1',
        name: 'marketing-site',
        fqdn: 'marketing.example.com',
        git_branch: 'main',
        status: 'running',
      },
    ])
    vi.mocked(listDatabases).mockResolvedValue([
      {
        uuid: 'db-1',
        name: 'primary-db',
        type: 'postgresql',
        status: 'ready',
      },
    ])
    vi.mocked(listServices).mockResolvedValue([
      {
        uuid: 'svc-1',
        name: 'minio',
        fqdn: 'minio.example.com',
        status: 'running',
      },
    ])
    vi.mocked(listDeployments).mockResolvedValue([
      {
        deployment_uuid: 'queue-1',
        application_name: 'api',
        status: 'in_progress',
        commit: 'abc1234',
        server_name: 'primary-vps',
        logs: 'Cloning repository...',
      },
    ])
    vi.mocked(getApplicationDeployments).mockResolvedValue({
      count: 1,
      deployments: [
        {
          deployment_uuid: 'hist-1',
          status: 'failed',
          commit: '17dd0a7',
          logs: 'Container exited with code 137 due to memory pressure.',
          created_at: '2026-05-11T09:00:00.000Z',
        },
      ],
    })
  })

  afterEach(() => {
    vi.clearAllMocks()
  })

  it('renders the overview from live resources and deployments', async () => {
    render(<HomeView onNavigate={() => {}} />)

    await waitFor(() => {
      expect(screen.getAllByText('marketing-site').length).toBeGreaterThan(0)
    })

    expect(screen.getByText('primary-db')).toBeTruthy()
    expect(screen.getByText('minio')).toBeTruthy()
    expect(screen.getAllByText('api').length).toBeGreaterThan(0)
    expect(screen.getByText(/Exit code 137/i)).toBeTruthy()
  })

  it('shows a loading error when overview loading fails', async () => {
    vi.mocked(listApplications).mockRejectedValueOnce(new Error('Platform API 500'))

    render(<HomeView onNavigate={() => {}} />)

    await waitFor(() => {
      expect(screen.getByText(/Could not load the dashboard/i)).toBeTruthy()
    })

    expect(screen.getByText(/Platform API 500/i)).toBeTruthy()
  })

  it('treats unhealthy resources as failed instead of ready', async () => {
    vi.mocked(listApplications).mockResolvedValueOnce([
      {
        uuid: 'app-1',
        name: 'marketing-site',
        fqdn: 'marketing.example.com',
        git_branch: 'main',
        status: 'exited:unhealthy',
      },
    ])

    render(<HomeView onNavigate={() => {}} />)

    const appRow = (await screen.findAllByText('marketing-site'))[0]
    const row = appRow.closest('li')
    const failedSummary = screen.getAllByText('Failed')[0]?.parentElement

    expect(row).toBeTruthy()
    expect(within(row as HTMLLIElement).getByText('Failed')).toBeTruthy()
    expect(failedSummary?.textContent).toBe('1Failed')
  })
})