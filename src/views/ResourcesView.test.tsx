import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { saveConfig } from '../lib/api'
import { ResourcesView } from './ResourcesView'

function mockFetch(body: unknown, status = 200) {
  const response = new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  })

  vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce(response)
}

function mockFetchError(status: number, text = 'Error') {
  const response = new Response(text, { status })

  vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce(response)
}

function mockJsonFetch(body: unknown, status = 200) {
  const response = new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  })

  vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce(response)
}

describe('ResourcesView', () => {
  beforeEach(() => {
    saveConfig({ platformBaseUrl: 'http://coolify.test', apiToken: 'test-token' })
  })

  afterEach(() => {
    localStorage.clear()
    vi.restoreAllMocks()
  })

  it('loads applications, databases, and services from the backend', async () => {
    mockFetch([
      {
        uuid: 'app-1',
        name: 'marketing-site',
        fqdn: 'marketing.example.com',
        git_branch: 'main',
        status: 'running',
      },
    ])
    mockFetch([
      {
        uuid: 'db-1',
        name: 'primary-db',
        type: 'postgresql',
        status: 'ready',
      },
    ])
    mockFetch([
      {
        uuid: 'svc-1',
        name: 'minio',
        fqdn: 'minio.example.com',
        status: 'running',
      },
    ])

    render(<ResourcesView onNavigate={() => {}} />)

    // Skeleton loading — text is gone, check the data appears
    await waitFor(() => {
      expect(screen.getByText('marketing-site')).toBeTruthy()
    })

    expect(screen.getByText('primary-db')).toBeTruthy()
    expect(screen.getByText('postgresql')).toBeTruthy()
    expect(screen.getByText('minio')).toBeTruthy()
    expect(screen.getByText('minio.example.com')).toBeTruthy()
  })

  it('shows a loading error when resource loading fails', async () => {
    mockFetchError(500, 'Platform API 500')
    mockFetch([])
    mockFetch([])

    render(<ResourcesView onNavigate={() => {}} />)

    await waitFor(() => {
      expect(screen.getByText(/Could not load resources/i)).toBeTruthy()
    })

    expect(screen.getByText(/Platform API 500/i)).toBeTruthy()
  })

  it('refreshes the resource list when delete returns not found for an already removed application', async () => {
    const user = userEvent.setup()

    mockFetch([
      {
        uuid: 'app-1',
        name: 'marketing-site',
        fqdn: 'marketing.example.com',
        git_branch: 'main',
        status: 'running',
      },
    ])
    mockFetch([])
    mockFetch([])
    mockJsonFetch({ message: 'Application not found' }, 404)
    mockFetch([])
    mockFetch([])
    mockFetch([])

    render(<ResourcesView onNavigate={() => {}} />)

    await waitFor(() => {
      expect(screen.getByText('marketing-site')).toBeTruthy()
    })

    await user.click(screen.getByTitle('Delete application'))
    await user.click(screen.getByRole('button', { name: 'Confirm delete' }))

    await waitFor(() => {
      expect(screen.getByText('No applications yet')).toBeTruthy()
    })

    expect(screen.queryByText('marketing-site')).toBeNull()
    expect(screen.queryByText('Application not found')).toBeNull()
  })

  it('keeps a service hidden after delete succeeds even when the immediate refresh is stale', async () => {
    const user = userEvent.setup()

    mockFetch([])
    mockFetch([])
    mockFetch([
      {
        uuid: 'svc-1',
        name: 'qa-uptime-kuma-sweep',
        fqdn: null,
        status: 'running:healthy',
      },
    ])
    mockFetch({}, 200)
    mockFetch([])
    mockFetch([])
    mockFetch([
      {
        uuid: 'svc-1',
        name: 'qa-uptime-kuma-sweep',
        fqdn: null,
        status: 'running:healthy',
      },
    ])

    render(<ResourcesView onNavigate={() => {}} />)

    await waitFor(() => {
      expect(screen.getByText('qa-uptime-kuma-sweep')).toBeTruthy()
    })

    await user.click(screen.getByTitle('Delete service'))
    await user.click(screen.getByRole('button', { name: 'Confirm delete' }))

    await waitFor(() => {
      expect(screen.getByText('No services yet')).toBeTruthy()
    })

    expect(screen.queryByText('qa-uptime-kuma-sweep')).toBeNull()
  })

  it('opens the resource inspector when a database row is selected', async () => {
    const user = userEvent.setup()

    mockFetch([])
    mockFetch([
      {
        uuid: 'db-1',
        name: 'primary-db',
        type: 'postgresql',
        status: 'ready',
        internal_db_url: 'postgres://primary-db:5432',
      },
    ])
    mockFetch([])

    render(<ResourcesView onNavigate={() => {}} />)

    await waitFor(() => {
      expect(screen.getByText('primary-db')).toBeTruthy()
    })

    await user.click(screen.getByText('primary-db'))

    await waitFor(() => {
      expect(screen.getByText('Managed database')).toBeTruthy()
    })

    expect(screen.getByText('postgres://primary-db:5432')).toBeTruthy()
    expect(screen.getByText('Delete database')).toBeTruthy()
  })

  it('edits an application configuration from the inspector', async () => {
    const user = userEvent.setup()

    mockFetch([
      {
        uuid: 'app-1',
        name: 'marketing-site',
        fqdn: 'marketing.example.com',
        git_branch: 'main',
        status: 'running',
      },
    ])
    mockFetch([])
    mockFetch([])
    mockFetch({
      uuid: 'app-1',
      name: 'marketing-site',
      fqdn: 'marketing.example.com',
      git_repository: 'https://github.com/acme/marketing-site',
      git_branch: 'main',
      status: 'running',
      build_pack: 'nixpacks',
      ports_exposes: '3000',
      base_directory: '/app',
      publish_directory: 'dist',
      health_check_enabled: true,
      health_check_path: '/health',
      health_check_port: '3000',
      is_auto_deploy_enabled: true,
      is_force_https_enabled: true,
    })
    mockFetch({ uuid: 'app-1' })
    mockFetch({
      uuid: 'app-1',
      name: 'marketing-site',
      fqdn: 'marketing.example.com',
      git_repository: 'https://github.com/acme/marketing-site',
      git_branch: 'production',
      status: 'running',
      build_pack: 'nixpacks',
      ports_exposes: '3000',
      base_directory: '/app',
      publish_directory: 'dist',
      health_check_enabled: true,
      health_check_path: '/health',
      health_check_port: '3000',
      is_auto_deploy_enabled: true,
      is_force_https_enabled: true,
    })
    mockFetch([
      {
        uuid: 'app-1',
        name: 'marketing-site',
        fqdn: 'marketing.example.com',
        git_branch: 'production',
        status: 'running',
      },
    ])
    mockFetch([])
    mockFetch([])

    render(<ResourcesView onNavigate={() => {}} />)

    await waitFor(() => {
      expect(screen.getByText('marketing-site')).toBeTruthy()
    })

    await user.click(screen.getByText('marketing-site'))

    await waitFor(() => {
      expect(screen.getByText('Repository')).toBeTruthy()
    })

    await user.click(screen.getByRole('button', { name: 'Edit configuration' }))

    const branchInput = screen.getByLabelText('Git branch')
    await user.clear(branchInput)
    await user.type(branchInput, 'production')
    await user.click(screen.getByRole('button', { name: 'Save changes' }))

    await waitFor(() => {
      expect(screen.getByText('Application configuration updated.')).toBeTruthy()
    })

    expect(screen.getAllByText('production').length).toBeGreaterThan(0)
  })
})