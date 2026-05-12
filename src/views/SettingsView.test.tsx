import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
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
  saveWorkspaceDomainAccess,
} from '../lib/api'
import { useAuth } from '../lib/auth'
import { SettingsView } from './SettingsView'

vi.mock('../lib/api', async () => {
  const actual = await vi.importActual<typeof import('../lib/api')>('../lib/api')

  return {
    ...actual,
    checkHealth: vi.fn(),
    confirmTwoFactorAuthentication: vi.fn(),
    disableTwoFactorAuthentication: vi.fn(),
    enableTwoFactorAuthentication: vi.fn(),
    getAccessStatus: vi.fn(),
    getCurrentProfile: vi.fn(),
    getCurrentTeam: vi.fn(),
    getCurrentTeamMembers: vi.fn(),
    getInstanceSettings: vi.fn(),
    getVersion: vi.fn(),
    saveWorkspaceDomainAccess: vi.fn(),
  }
})

vi.mock('../lib/auth', () => ({
  useAuth: vi.fn(),
}))

describe('SettingsView', () => {
  beforeEach(() => {
    vi.mocked(useAuth).mockReturnValue({
      status: 'ready',
      error: null,
      hasOwner: true,
      platformReady: true,
      setupProgress: null,
      currentUser: {
        id: 'owner-1',
        name: 'Sulaiman Operator',
        email: 'sulaiman@example.com',
        role: 'owner',
      },
      register: vi.fn(),
      login: vi.fn(),
      requestPasswordReset: vi.fn(),
      resetPassword: vi.fn(),
      completeOnboarding: vi.fn(),
      disconnect: vi.fn(),
      refresh: vi.fn(),
    })
    vi.mocked(getAccessStatus).mockResolvedValue({
      bootstrapUrl: 'http://203.0.113.10:8080',
      currentDomain: 'https://cooldev.example.com',
      detail: 'HTTPS is live on https://cooldev.example.com. The bootstrap URL still works as a fallback.',
      dnsPointsToServer: true,
      httpsReady: true,
      preferredUrl: 'https://cooldev.example.com',
      proxyProvider: 'traefik',
      secureUrl: 'https://cooldev.example.com',
      sslStatus: 'ready',
      status: 'live',
      summary: 'Automatic 80/443 cutover is live. CoolDev is now serving the secure domain.',
    })
    vi.mocked(checkHealth).mockResolvedValue({ status: 'ok' })
    vi.mocked(getCurrentTeam).mockResolvedValue({ id: 7, name: 'Acme Team' })
    vi.mocked(getCurrentTeamMembers).mockResolvedValue([
      { id: 1, name: 'Sulaiman' },
      { id: 2, name: 'Operator' },
    ])
    vi.mocked(getInstanceSettings).mockResolvedValue({
      instance_name: 'CoolDev',
      public_url: 'https://cooldev.example.com',
      public_ipv4: '203.0.113.10',
      instance_timezone: 'UTC',
    })
    vi.mocked(getCurrentProfile).mockResolvedValue({
      id: 1,
      name: 'Sulaiman Operator',
      email: 'sulaiman@example.com',
      two_factor_enabled: false,
      two_factor_pending: false,
      two_factor_confirmed_at: null,
      email_verified_at: null,
    })
    vi.mocked(saveWorkspaceDomainAccess).mockResolvedValue({
      accessStatus: {
        bootstrapUrl: 'http://203.0.113.10:8080',
        currentDomain: 'https://next.example.com',
        detail: 'DNS looks ready. CoolDev is finishing HTTPS provisioning.',
        dnsPointsToServer: true,
        httpsReady: false,
        preferredUrl: 'http://203.0.113.10:8080',
        proxyProvider: 'traefik',
        secureUrl: 'https://next.example.com',
        sslStatus: 'pending',
        status: 'provisioning-ssl',
        summary: 'DNS is ready. CoolDev is now finishing the automatic 80/443 and HTTPS cutover.',
      },
      instanceSettings: {
        instance_name: 'CoolDev',
        public_url: 'https://next.example.com',
        public_ipv4: '203.0.113.10',
        instance_timezone: 'UTC',
      },
    })
    vi.mocked(enableTwoFactorAuthentication).mockResolvedValue({
      profile: {
        id: 1,
        name: 'Sulaiman Operator',
        email: 'sulaiman@example.com',
        two_factor_enabled: false,
        two_factor_pending: true,
        two_factor_confirmed_at: null,
        email_verified_at: null,
      },
      qr_code_svg: '<svg><title>QR</title></svg>',
      recovery_codes: ['recovery-1', 'recovery-2'],
      two_factor_pending: true,
    })
    vi.mocked(confirmTwoFactorAuthentication).mockResolvedValue({
      id: 1,
      name: 'Sulaiman Operator',
      email: 'sulaiman@example.com',
      two_factor_enabled: true,
      two_factor_pending: false,
      two_factor_confirmed_at: '2025-01-01T00:00:00.000000Z',
      email_verified_at: null,
    })
    vi.mocked(disableTwoFactorAuthentication).mockResolvedValue({
      id: 1,
      name: 'Sulaiman Operator',
      email: 'sulaiman@example.com',
      two_factor_enabled: false,
      two_factor_pending: false,
      two_factor_confirmed_at: null,
      email_verified_at: null,
    })
    vi.mocked(getVersion).mockResolvedValue({ version: '4.0.0' })
  })

  afterEach(() => {
    localStorage.clear()
    vi.resetAllMocks()
  })

  it('shows live platform, domain automation, and profile details', async () => {
    render(<SettingsView />)

    await waitFor(() => {
      expect(screen.getByText('Healthy')).toBeTruthy()
    })

    expect(screen.getByText(/Health check passed/i)).toBeTruthy()
    expect(screen.getByText('Version 4.0.0')).toBeTruthy()
    expect(screen.getByText('Detected')).toBeTruthy()
    expect(screen.getByText('Acme Team • 2 members')).toBeTruthy()
    expect(screen.getByText('CoolDev • UTC • 203.0.113.10')).toBeTruthy()
    expect(screen.getByDisplayValue('https://cooldev.example.com')).toBeTruthy()
    expect(screen.getByText('http://203.0.113.10:8080')).toBeTruthy()
    expect(screen.getByText(/Automatic 80\/443 cutover is live/i)).toBeTruthy()
    expect(screen.getByText(/HTTPS is active on https:\/\/cooldev.example.com/i)).toBeTruthy()
    expect(screen.getByText('Sulaiman Operator • sulaiman@example.com')).toBeTruthy()
    expect(screen.getByText('This account does not have two-factor authentication enabled yet.')).toBeTruthy()
  })

  it('saves the workspace domain through the automated cutover endpoint', async () => {
    const user = userEvent.setup()

    render(<SettingsView />)

    const domainInput = await screen.findByLabelText('Workspace domain')
    await user.clear(domainInput)
    await user.type(domainInput, 'https://next.example.com')
    await user.click(screen.getByRole('button', { name: 'Save domain' }))

    await waitFor(() => {
      expect(saveWorkspaceDomainAccess).toHaveBeenCalledWith({
        publicUrl: 'https://next.example.com',
        forceDomainOverride: false,
      })
    })

    expect(screen.getByText('Saved')).toBeTruthy()
    expect(screen.getByText('Current domain: https://next.example.com')).toBeTruthy()
    expect(screen.getByText(/CoolDev is finishing HTTPS provisioning/i)).toBeTruthy()
  })

  it('keeps domain management available when shared workspace settings are unavailable', async () => {
    const user = userEvent.setup()

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
      summary: 'Bootstrap access is active. Save a domain to turn on automatic 80/443 access.',
    })
    vi.mocked(getInstanceSettings).mockRejectedValueOnce(new Error('Not found.'))
    vi.mocked(saveWorkspaceDomainAccess).mockResolvedValueOnce({
      accessStatus: {
        bootstrapUrl: 'http://203.0.113.10:3001',
        currentDomain: 'https://cooldev.backnd.top',
        detail: 'DNS looks ready. CoolDev is finishing HTTPS provisioning.',
        dnsPointsToServer: true,
        httpsReady: false,
        preferredUrl: 'http://203.0.113.10:3001',
        proxyProvider: 'traefik',
        secureUrl: 'https://cooldev.backnd.top',
        sslStatus: 'pending',
        status: 'provisioning-ssl',
        summary: 'DNS is ready. CoolDev is now finishing the automatic 80/443 and HTTPS cutover.',
      },
      instanceSettings: {
        instance_name: 'CoolDev',
        public_url: 'https://cooldev.backnd.top',
        public_ipv4: '203.0.113.10',
      },
      workspaceSettingsSynced: false,
    })

    render(<SettingsView />)

    const domainInput = await screen.findByLabelText('Workspace domain')
    await waitFor(() => {
      expect(domainInput.hasAttribute('disabled')).toBe(false)
    })

    expect(screen.getByText(/Shared workspace settings are not available yet/i)).toBeTruthy()

    await user.clear(domainInput)
    await user.type(domainInput, 'https://cooldev.backnd.top')
    await user.click(screen.getByRole('button', { name: 'Save domain' }))

    await waitFor(() => {
      expect(saveWorkspaceDomainAccess).toHaveBeenCalledWith({
        publicUrl: 'https://cooldev.backnd.top',
        forceDomainOverride: false,
      })
    })

    expect(screen.getByText('Current domain: https://cooldev.backnd.top')).toBeTruthy()
    expect(screen.getByText(/keep this workspace domain active locally on this host/i)).toBeTruthy()
  })

  it('shows local fallback metadata when shared settings and 2FA are unavailable', async () => {
    vi.mocked(getInstanceSettings).mockResolvedValueOnce({
      instance_name: 'CoolDev',
      public_url: 'https://cooldev.backnd.top',
      public_ipv4: '203.0.113.10',
      workspace_settings_supported: false,
    })
    vi.mocked(getCurrentProfile).mockResolvedValueOnce({
      id: 0,
      name: 'Sulaiman Operator',
      email: 'sulaiman@example.com',
      two_factor_enabled: false,
      two_factor_pending: false,
      two_factor_supported: false,
      two_factor_confirmed_at: null,
      email_verified_at: null,
    })

    render(<SettingsView />)

    await waitFor(() => {
      expect(screen.getByText(/Shared workspace settings are not available yet/i)).toBeTruthy()
    })

    expect(screen.getByDisplayValue('https://cooldev.backnd.top')).toBeTruthy()
    expect(screen.getByText('Sulaiman Operator • sulaiman@example.com')).toBeTruthy()
    expect(screen.getAllByText('Unavailable').length).toBeGreaterThan(0)
    expect(screen.getAllByText(/Two-factor management is not available on this workspace yet/i).length).toBeGreaterThan(0)
    expect(screen.getByText(/^Not available on this installation$/i)).toBeTruthy()
  })

  it('shows domain conflicts and allows forcing the workspace domain override on retry', async () => {
    const user = userEvent.setup()

    vi.mocked(saveWorkspaceDomainAccess)
      .mockRejectedValueOnce(
        new ApiError(
          409,
          'Platform API 409: Domain conflicts detected. Use force_domain_override=true to proceed.',
          {
            message: 'Domain conflicts detected. Use force_domain_override=true to proceed.',
            warning:
              'Using the same domain for multiple resources can cause routing conflicts and unpredictable behavior.',
            conflicts: [
              {
                domain: 'app.example.com',
                resource_name: 'marketing-site',
                resource_type: 'application',
              },
            ],
          },
        ),
      )
      .mockResolvedValueOnce({
        accessStatus: {
          bootstrapUrl: 'http://203.0.113.10:8080',
          currentDomain: 'https://app.example.com',
          detail: 'DNS looks ready. CoolDev is finishing HTTPS provisioning.',
          dnsPointsToServer: true,
          httpsReady: false,
          preferredUrl: 'http://203.0.113.10:8080',
          proxyProvider: 'traefik',
          secureUrl: 'https://app.example.com',
          sslStatus: 'pending',
          status: 'provisioning-ssl',
          summary: 'DNS is ready. CoolDev is now finishing the automatic 80/443 and HTTPS cutover.',
        },
        instanceSettings: {
          instance_name: 'CoolDev',
          public_url: 'https://app.example.com',
          public_ipv4: '203.0.113.10',
          instance_timezone: 'UTC',
        },
      })

    render(<SettingsView />)

    const domainInput = await screen.findByLabelText('Workspace domain')
    await user.clear(domainInput)
    await user.type(domainInput, 'https://app.example.com')
    await user.click(screen.getByRole('button', { name: 'Save domain' }))

    await waitFor(() => {
      expect(saveWorkspaceDomainAccess).toHaveBeenNthCalledWith(1, {
        publicUrl: 'https://app.example.com',
        forceDomainOverride: false,
      })
    })

    await waitFor(() => {
      expect(screen.getByText('Domain conflicts detected. Use force_domain_override=true to proceed.')).toBeTruthy()
      expect(screen.getByText('Using the same domain for multiple resources can cause routing conflicts and unpredictable behavior.')).toBeTruthy()
      expect(screen.getByText('app.example.com • marketing-site (application)')).toBeTruthy()
    })

    await user.click(screen.getByLabelText('Allow domain override if another resource is already using this domain'))
    await user.click(screen.getByRole('button', { name: 'Save domain' }))

    await waitFor(() => {
      expect(saveWorkspaceDomainAccess).toHaveBeenNthCalledWith(2, {
        publicUrl: 'https://app.example.com',
        forceDomainOverride: true,
      })
    })

    expect(screen.queryByText('app.example.com • marketing-site (application)')).toBeNull()
    expect(screen.getByText('Saved')).toBeTruthy()
    expect(screen.getByText('Current domain: https://app.example.com')).toBeTruthy()
  })

  it('enables, confirms, and disables two factor from settings', async () => {
    const user = userEvent.setup()

    render(<SettingsView />)

    await user.click(await screen.findByRole('button', { name: 'Enable 2FA' }))

    await waitFor(() => {
      expect(enableTwoFactorAuthentication).toHaveBeenCalledTimes(1)
    })

    expect(screen.getByText('Authenticator QR')).toBeTruthy()
    expect(screen.getByText('recovery-1')).toBeTruthy()

    await user.type(screen.getByLabelText('Authenticator code'), '123456')
    await user.click(screen.getByRole('button', { name: 'Confirm 2FA' }))

    await waitFor(() => {
      expect(confirmTwoFactorAuthentication).toHaveBeenCalledWith('123456')
    })

    expect(screen.getByRole('button', { name: 'Disable 2FA' })).toBeTruthy()

    await user.click(screen.getByRole('button', { name: 'Disable 2FA' }))

    await waitFor(() => {
      expect(disableTwoFactorAuthentication).toHaveBeenCalledTimes(1)
    })

    expect(screen.getByRole('button', { name: 'Enable 2FA' })).toBeTruthy()
  })

  it('shows unavailable live status when platform probing fails', async () => {
    vi.mocked(getAccessStatus).mockResolvedValueOnce({
      bootstrapUrl: 'http://203.0.113.10:8080',
      currentDomain: 'https://cooldev.example.com',
      detail: 'Could not verify automatic domain cutover.',
      dnsPointsToServer: null,
      httpsReady: false,
      preferredUrl: 'http://203.0.113.10:8080',
      proxyProvider: 'unavailable',
      secureUrl: 'https://cooldev.example.com',
      sslStatus: 'unavailable',
      status: 'unavailable',
      summary: 'CoolDev could not apply the automatic 80/443 cutover on this host.',
    })
    vi.mocked(checkHealth).mockRejectedValueOnce(new Error('Network down'))
    vi.mocked(getCurrentTeam).mockRejectedValueOnce(new Error('Team unavailable'))
    vi.mocked(getCurrentTeamMembers).mockRejectedValueOnce(new Error('Members unavailable'))
    vi.mocked(getInstanceSettings).mockRejectedValueOnce(new Error('Instance settings unavailable'))
    vi.mocked(getCurrentProfile).mockRejectedValueOnce(new Error('Profile unavailable'))
    vi.mocked(getVersion).mockRejectedValueOnce(new Error('Version endpoint unavailable'))

    render(<SettingsView />)

    await waitFor(() => {
      expect(screen.getAllByText('Unavailable').length).toBeGreaterThan(0)
    })

    expect(screen.getByText(/Cannot reach the workspace runtime/i)).toBeTruthy()
    expect(screen.getByText('Version unavailable.')).toBeTruthy()
    expect(screen.getByText('Team context unavailable.')).toBeTruthy()
    expect(screen.getByText('Instance settings unavailable')).toBeTruthy()
    expect(screen.getByText(/automatic 80\/443 cutover on this host/i)).toBeTruthy()
    expect(screen.getAllByText('Profile unavailable').length).toBeGreaterThan(0)
  })
})
