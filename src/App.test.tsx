import type { ReactNode } from 'react'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import App from './App'

const { mockUseAuth } = vi.hoisted(() => ({
  mockUseAuth: vi.fn(),
}))

vi.mock('./lib/auth', () => ({
  AuthProvider: ({ children }: { children: ReactNode }) => <>{children}</>,
  useAuth: mockUseAuth,
}))

vi.mock('./views/HomeView', () => ({
  HomeView: () => <div>Home screen</div>,
}))

vi.mock('./views/ResourcesView', () => ({
  ResourcesView: () => <div>Resources screen</div>,
}))

vi.mock('./views/DeploymentsView', () => ({
  DeploymentsView: () => <div>Deployments screen</div>,
}))

vi.mock('./views/DeployWizardView', () => ({
  DeployWizardView: () => <div>What do you want to deploy?</div>,
}))

vi.mock('./views/ProvidersView', () => ({
  ProvidersView: () => <div>Git providers</div>,
}))

vi.mock('./views/SettingsView', () => ({
  SettingsView: () => <div>Workspace access</div>,
}))

type MockAuthState = {
  completeOnboarding: () => void
  currentUser: { email: string; id: string; name: string; role: 'owner' } | null
  disconnect: ReturnType<typeof vi.fn>
  error: string | null
  hasOwner: boolean
  login: ReturnType<typeof vi.fn>
  platformReady: boolean
  refresh: ReturnType<typeof vi.fn>
  register: ReturnType<typeof vi.fn>
  requestPasswordReset: ReturnType<typeof vi.fn>
  resetPassword: ReturnType<typeof vi.fn>
  setupProgress: {
    detail: string
    percent: number
    status: 'waiting-for-owner' | 'starting-services' | 'creating-connection' | 'verifying-workspace' | 'ready'
    summary: string
    steps: Array<{
      detail: string
      id: 'owner-account' | 'managed-services' | 'server-connection' | 'workspace-api'
      label: string
      state: 'complete' | 'active' | 'pending'
    }>
  } | null
  status: 'loading' | 'unconfigured' | 'needs-onboarding' | 'ready'
}

function createSetupProgress(overrides: Partial<NonNullable<MockAuthState['setupProgress']>> = {}) {
  return {
    detail: 'CoolDev is checking the background services automatically every few seconds.',
    percent: 25,
    status: 'starting-services' as const,
    summary: 'Finishing workspace startup',
    steps: [
      {
        detail: 'Signed in as sulaiman@example.com.',
        id: 'owner-account' as const,
        label: 'Owner account created',
        state: 'complete' as const,
      },
      {
        detail: 'CoolDev is bringing the workspace online.',
        id: 'managed-services' as const,
        label: 'Background services ready',
        state: 'active' as const,
      },
      {
        detail: 'CoolDev will continue as soon as the workspace connection is ready.',
        id: 'server-connection' as const,
        label: 'Workspace connection ready',
        state: 'pending' as const,
      },
      {
        detail: 'CoolDev will verify the workspace automatically as setup completes.',
        id: 'workspace-api' as const,
        label: 'Workspace ready',
        state: 'pending' as const,
      },
    ],
    ...overrides,
  }
}

function createAuthState(overrides: Partial<MockAuthState> = {}): MockAuthState {
  return {
    completeOnboarding: vi.fn(),
    currentUser: {
      id: 'owner-1',
      name: 'Sulaiman Operator',
      email: 'sulaiman@example.com',
      role: 'owner',
    },
    disconnect: vi.fn(),
    error: null,
    hasOwner: true,
    login: vi.fn(),
    platformReady: true,
    refresh: vi.fn(),
    register: vi.fn(),
    requestPasswordReset: vi.fn(),
    resetPassword: vi.fn(),
    setupProgress: null,
    status: 'ready',
    ...overrides,
  }
}

afterEach(() => {
  window.history.pushState({}, '', '/simple')
  vi.clearAllMocks()
})

describe('CoolDev app shell', () => {
  beforeEach(() => {
    mockUseAuth.mockReturnValue(createAuthState())
  })

  it('normalizes the root path to the simple dashboard', async () => {
    window.history.pushState({}, '', '/')

    render(<App />)

    await waitFor(() => {
      expect(window.location.pathname).toBe('/simple')
    })
    expect(screen.getByText('CoolDev')).toBeTruthy()
  })

  it('renders the deploy wizard route', async () => {
    window.history.pushState({}, '', '/simple/new')

    render(<App />)

    await waitFor(() => {
      expect(screen.getByText('What do you want to deploy?')).toBeTruthy()
    })
  })

  it('navigates to providers from the primary navigation', async () => {
    const user = userEvent.setup()
    window.history.pushState({}, '', '/simple')

    render(<App />)

    await user.click(screen.getByRole('button', { name: /Providers.*Git connections/i }))

    await waitFor(() => {
      expect(window.location.pathname).toBe('/simple/providers')
    })
    expect(screen.getByText('Git providers')).toBeTruthy()
  })

  it('navigates to settings from the primary navigation', async () => {
    const user = userEvent.setup()
    window.history.pushState({}, '', '/simple')

    render(<App />)

    await user.click(screen.getByRole('button', { name: /Settings.*Workspace/i }))

    await waitFor(() => {
      expect(window.location.pathname).toBe('/simple/settings')
    })
    expect(screen.getByText('Workspace access')).toBeTruthy()
  })
})

describe('CoolDev auth gate', () => {
  it('shows registration when no owner exists yet', () => {
    mockUseAuth.mockReturnValue(createAuthState({
      currentUser: null,
      hasOwner: false,
      platformReady: false,
      status: 'unconfigured',
    }))

    render(<App />)

    expect(screen.getByText('Create your owner account')).toBeTruthy()
    expect(screen.getByRole('button', { name: 'Create owner account' })).toBeTruthy()
  })

  it('shows sign-in when the owner exists but no session is active', () => {
    mockUseAuth.mockReturnValue(createAuthState({
      currentUser: null,
      hasOwner: true,
      platformReady: false,
      status: 'unconfigured',
    }))

    render(<App />)

    expect(screen.getByText('Welcome back')).toBeTruthy()
    expect(screen.getByRole('button', { name: 'Sign in' })).toBeTruthy()
  })

  it('shows live managed-platform progress after the owner signs in but before setup completes', () => {
    mockUseAuth.mockReturnValue(createAuthState({
      platformReady: false,
      setupProgress: createSetupProgress(),
      status: 'unconfigured',
    }))

    render(<App />)

    expect(screen.getByText('Finalizing setup')).toBeTruthy()
    expect(screen.getByText('Finishing workspace startup')).toBeTruthy()
    expect(screen.getByText('1 of 4 steps complete')).toBeTruthy()
    expect(screen.getByText('Background services ready')).toBeTruthy()
    expect(screen.getByRole('button', { name: 'Retry now' })).toBeTruthy()
  })

  it('shows the onboarding gate when the platform is ready but no servers exist yet', async () => {
    mockUseAuth.mockReturnValue(createAuthState({
      status: 'needs-onboarding',
    }))

    render(<App />)

    await waitFor(() => {
      expect(screen.getByText('Connect your first server')).toBeTruthy()
    })
    expect(screen.getByRole('button', { name: 'Continue to dashboard' })).toBeTruthy()
  })
})
