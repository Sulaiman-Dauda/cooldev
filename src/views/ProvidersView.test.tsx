import { render, screen, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import {
  getAccessStatus,
  getGithubAppStatus,
  getWebhookConfig,
  listApplications,
  listGithubApps,
  listPrivateKeys,
} from '../lib/api'
import { ProvidersView } from './ProvidersView'

vi.mock('../lib/api', async () => {
  const actual = await vi.importActual<typeof import('../lib/api')>('../lib/api')

  return {
    ...actual,
    getAccessStatus: vi.fn(),
    getGithubAppStatus: vi.fn(),
    getWebhookConfig: vi.fn(),
    listApplications: vi.fn(),
    listGithubApps: vi.fn(),
    listPrivateKeys: vi.fn(),
  }
})

describe('ProvidersView', () => {
  beforeEach(() => {
    vi.mocked(listGithubApps).mockResolvedValue([
      {
        uuid: 'gh-1',
        name: 'Acme GitHub App',
      },
    ])
    vi.mocked(listPrivateKeys).mockResolvedValue([
      {
        uuid: 'key-1',
        name: 'Primary server key',
        is_git_related: false,
      },
    ])
    vi.mocked(listApplications).mockResolvedValue([
      {
        uuid: 'app-1',
        name: 'marketing-site',
        git_repository: 'https://github.com/acme/marketing-site',
      },
      {
        uuid: 'app-2',
        name: 'docs',
        git_repository: 'https://gitlab.com/acme/docs',
      },
    ])
    vi.mocked(getWebhookConfig).mockResolvedValue({
      secret: 'webhook-secret',
      urls: {
        github: 'https://cooldev.example.com/webhooks/github',
        gitlab: 'https://cooldev.example.com/webhooks/gitlab',
      },
    })
    vi.mocked(getGithubAppStatus).mockResolvedValue({
      connected: true,
      appId: 12,
      appName: 'Acme GitHub App',
      htmlUrl: 'https://github.com/apps/acme-cooldev',
      installationUrl: 'https://github.com/apps/acme-cooldev/installations/new',
    })
    vi.mocked(getAccessStatus).mockResolvedValue({
      bootstrapUrl: 'http://203.0.113.10:3001',
      currentDomain: 'https://cooldev.example.com',
      detail: 'HTTPS is live.',
      dnsPointsToServer: true,
      httpsReady: true,
      preferredUrl: 'https://cooldev.example.com',
      proxyProvider: 'traefik',
      secureUrl: 'https://cooldev.example.com',
      sslStatus: 'ready',
      status: 'live',
      summary: 'Automatic 80/443 cutover is live.',
    })
  })

  afterEach(() => {
    vi.clearAllMocks()
  })

  it('renders live provider state from GitHub apps, SSH keys, and linked repositories', async () => {
    render(<ProvidersView />)

    await waitFor(() => {
      expect(screen.getByText(/1 GitHub app connected/i)).toBeTruthy()
    })

    expect(screen.getByText(/Acme GitHub App installed\. 1 app currently deploys from GitHub\./i)).toBeTruthy()
    expect(screen.getByText(/1 app currently deploys from GitLab\./i)).toBeTruthy()
    expect(screen.getAllByText(/1 SSH key available/i).length).toBeGreaterThan(0)
    expect(screen.getByText('GitHub')).toBeTruthy()
    expect(screen.getByText('Generic Git')).toBeTruthy()
    expect(screen.getAllByText('Key ready').length).toBeGreaterThan(0)
  })

  it('shows a loading error when provider loading fails', async () => {
    vi.mocked(listGithubApps).mockRejectedValueOnce(new Error('Platform API 500'))

    render(<ProvidersView />)

    await waitFor(() => {
      expect(screen.getByText(/Could not load provider connections/i)).toBeTruthy()
    })

    expect(screen.getByText(/Platform API 500/i)).toBeTruthy()
    expect(screen.getByText('Git providers')).toBeTruthy()
  })

  it('keeps GitHub App setup disabled until the workspace is live on HTTPS', async () => {
    vi.mocked(listGithubApps).mockResolvedValueOnce([])
    vi.mocked(getGithubAppStatus).mockResolvedValueOnce({ connected: false })
    vi.mocked(getAccessStatus).mockResolvedValueOnce({
      bootstrapUrl: 'http://203.0.113.10:3001',
      currentDomain: null,
      detail: 'Bootstrap access is active.',
      dnsPointsToServer: null,
      httpsReady: null,
      preferredUrl: 'http://203.0.113.10:3001',
      proxyProvider: 'traefik',
      secureUrl: null,
      sslStatus: 'inactive',
      status: 'bootstrap',
      summary: 'Bootstrap access is active.',
    })

    render(<ProvidersView />)

    await waitFor(() => {
      expect(screen.getByRole('button', { name: 'Create GitHub App' }).hasAttribute('disabled')).toBe(true)
    })

    expect(screen.getByText(/workspace domain and HTTPS setup/i)).toBeTruthy()
    expect(screen.getByRole('link', { name: 'Open Settings' }).getAttribute('href')).toBe('/simple/settings')
  })

  it('enables GitHub App setup once the workspace HTTPS URL is live', async () => {
    vi.mocked(listGithubApps).mockResolvedValueOnce([])
    vi.mocked(getGithubAppStatus).mockResolvedValueOnce({ connected: false })
    vi.mocked(getAccessStatus).mockResolvedValueOnce({
      bootstrapUrl: 'http://203.0.113.10:3001',
      currentDomain: 'https://cooldev.example.com',
      detail: 'HTTPS is live.',
      dnsPointsToServer: true,
      httpsReady: true,
      preferredUrl: 'https://cooldev.example.com',
      proxyProvider: 'traefik',
      secureUrl: 'https://cooldev.example.com',
      sslStatus: 'ready',
      status: 'live',
      summary: 'Automatic 80/443 cutover is live.',
    })

    render(<ProvidersView />)

    await waitFor(() => {
      expect(screen.getByRole('button', { name: 'Create GitHub App' }).hasAttribute('disabled')).toBe(false)
    })
  })
})
