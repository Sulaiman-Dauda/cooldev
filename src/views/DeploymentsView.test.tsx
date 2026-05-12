import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import {
  getApplicationDeployments,
  listApplications,
  listDeployments,
} from '../lib/api'
import { DeploymentsView } from './DeploymentsView'

vi.mock('../lib/api', async () => {
  const actual = await vi.importActual<typeof import('../lib/api')>('../lib/api')

  return {
    ...actual,
    listApplications: vi.fn(),
    listDeployments: vi.fn(),
    getApplicationDeployments: vi.fn(),
  }
})

describe('DeploymentsView', () => {
  beforeEach(() => {
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
    vi.mocked(listApplications).mockResolvedValue([
      {
        uuid: 'app-1',
        name: 'worker',
        status: 'running',
      },
      {
        uuid: 'app-2',
        name: 'dashboard',
        status: 'running',
      },
    ])
    vi.mocked(getApplicationDeployments)
      .mockResolvedValueOnce({
        count: 1,
        deployments: [
          {
            deployment_uuid: 'hist-1',
            status: 'failed',
            commit: '17dd0a7',
            logs: 'Permission denied (publickey). Could not read from remote repository.',
            created_at: '2026-05-11T09:00:00.000Z',
          },
        ],
      })
      .mockResolvedValueOnce({
        count: 1,
        deployments: [
          {
            deployment_uuid: 'hist-2',
            status: 'finished',
            commit: '8a13f42',
            logs: 'Deployment finished successfully.',
            created_at: '2026-05-11T08:00:00.000Z',
          },
        ],
      })
  })

  afterEach(() => {
    vi.clearAllMocks()
  })

  it('loads queue and history from the live deployment APIs', async () => {
    const user = userEvent.setup()

    render(<DeploymentsView />)

    await waitFor(() => {
      expect(screen.getAllByText('worker').length).toBeGreaterThan(0)
    })

    expect(screen.getByRole('log', { name: 'Deployment logs' })).toBeTruthy()
    expect(screen.getByText('Repository authentication failed')).toBeTruthy()
    expect(screen.getByText(/Could not read from remote repository/i)).toBeTruthy()

    await user.click(screen.getByRole('button', { name: 'Queue' }))

    await waitFor(() => {
      expect(screen.getAllByText('api').length).toBeGreaterThan(0)
    })

    expect(screen.getByText('On primary-vps')).toBeTruthy()
    expect(screen.getByText('Deployment in progress')).toBeTruthy()
  })

  it('shows a loading error when deployment loading fails', async () => {
    vi.mocked(listDeployments).mockRejectedValueOnce(new Error('Platform API 500'))

    render(<DeploymentsView />)

    await waitFor(() => {
      expect(screen.getByText(/Could not load deployments right now/i)).toBeTruthy()
    })

    expect(screen.getByText(/Platform API 500/i)).toBeTruthy()
  })
})