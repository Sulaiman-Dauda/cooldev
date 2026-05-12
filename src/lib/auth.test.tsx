import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { AuthProvider, useAuth } from './auth'
import {
  confirmPasswordReset,
  getBootstrapState,
  registerOwner,
  requestPasswordReset,
  signIn,
  signOut,
} from './api'

vi.mock('./api', () => ({
  confirmPasswordReset: vi.fn(),
  getBootstrapState: vi.fn(),
  registerOwner: vi.fn(),
  requestPasswordReset: vi.fn(),
  signIn: vi.fn(),
  signOut: vi.fn(),
}))

const OWNER = {
  id: 'owner-1',
  name: 'Sulaiman Operator',
  email: 'sulaiman@example.com',
  role: 'owner' as const,
}

function AuthProbe() {
  const {
    currentUser,
    disconnect,
    hasOwner,
    login,
    platformReady,
    register,
    requestPasswordReset: forgotPassword,
    resetPassword,
    status,
  } = useAuth()

  return (
    <div>
      <div data-testid="status">{status}</div>
      <div data-testid="has-owner">{String(hasOwner)}</div>
      <div data-testid="platform-ready">{String(platformReady)}</div>
      <div data-testid="current-user">{currentUser?.email ?? ''}</div>
      <button
        type="button"
        onClick={() => void register({
          confirmPassword: 'password123',
          email: OWNER.email,
          name: OWNER.name,
          password: 'password123',
        })}
      >
        Register
      </button>
      <button type="button" onClick={() => void login({ email: OWNER.email, password: 'password123' })}>
        Login
      </button>
      <button type="button" onClick={() => void forgotPassword(OWNER.email)}>
        Forgot password
      </button>
      <button
        type="button"
        onClick={() => void resetPassword({
          confirmPassword: 'newpassword123',
          password: 'newpassword123',
          resetToken: 'reset-token',
        })}
      >
        Reset password
      </button>
      <button type="button" onClick={() => void disconnect()}>
        Disconnect
      </button>
    </div>
  )
}

describe('AuthProvider', () => {
  beforeEach(() => {
    vi.mocked(getBootstrapState).mockResolvedValue({
      currentUser: null,
      hasOwner: false,
      platformBaseUrl: '',
      platformReachable: null,
      platformReady: false,
      serverCount: null,
    })
    vi.mocked(registerOwner).mockResolvedValue({ user: OWNER })
    vi.mocked(requestPasswordReset).mockResolvedValue({
      delivery: 'server-log',
      message: 'If that account exists, CoolDev has written a password reset link to the server log.',
    })
    vi.mocked(confirmPasswordReset).mockResolvedValue({ user: OWNER })
    vi.mocked(signIn).mockResolvedValue({ user: OWNER })
    vi.mocked(signOut).mockResolvedValue(undefined)
  })

  afterEach(() => {
    vi.clearAllMocks()
  })

  it('hydrates ready when bootstrap reports a signed-in owner and an existing server', async () => {
    vi.mocked(getBootstrapState).mockResolvedValueOnce({
      currentUser: OWNER,
      hasOwner: true,
      platformBaseUrl: 'http://platform.internal:8080',
      platformReachable: true,
      platformReady: true,
      serverCount: 1,
    })

    render(
      <AuthProvider>
        <AuthProbe />
      </AuthProvider>,
    )

    await waitFor(() => {
      expect(screen.getByTestId('status').textContent).toBe('ready')
    })

    expect(screen.getByTestId('platform-ready').textContent).toBe('true')
    expect(screen.getByTestId('current-user').textContent).toBe(OWNER.email)
  })

  it('registers the first owner and refreshes bootstrap state', async () => {
    const user = userEvent.setup()
    vi.mocked(getBootstrapState)
      .mockResolvedValueOnce({
        currentUser: null,
        hasOwner: false,
        platformBaseUrl: '',
        platformReachable: null,
        platformReady: false,
        serverCount: null,
      })
      .mockResolvedValueOnce({
        currentUser: OWNER,
        hasOwner: true,
        platformBaseUrl: '',
        platformReachable: null,
        platformReady: false,
        serverCount: null,
      })

    render(
      <AuthProvider>
        <AuthProbe />
      </AuthProvider>,
    )

    await waitFor(() => {
      expect(screen.getByTestId('status').textContent).toBe('unconfigured')
    })

    await user.click(screen.getByRole('button', { name: 'Register' }))

    await waitFor(() => {
      expect(screen.getByTestId('has-owner').textContent).toBe('true')
    })

    expect(registerOwner).toHaveBeenCalledWith({
      confirmPassword: 'password123',
      email: OWNER.email,
      name: OWNER.name,
      password: 'password123',
    })
    expect(screen.getByTestId('current-user').textContent).toBe(OWNER.email)
  })

  it('refreshes after sign-in and moves to onboarding when the platform is ready but no server exists yet', async () => {
    const user = userEvent.setup()
    vi.mocked(getBootstrapState)
      .mockResolvedValueOnce({
        currentUser: null,
        hasOwner: true,
        platformBaseUrl: '',
        platformReachable: null,
        platformReady: false,
        serverCount: null,
      })
      .mockResolvedValueOnce({
        currentUser: OWNER,
        hasOwner: true,
        platformBaseUrl: 'http://platform.internal:8080',
        platformReachable: true,
        platformReady: true,
        serverCount: 0,
      })

    render(
      <AuthProvider>
        <AuthProbe />
      </AuthProvider>,
    )

    await waitFor(() => {
      expect(screen.getByTestId('status').textContent).toBe('unconfigured')
    })

    await user.click(screen.getByRole('button', { name: 'Login' }))

    await waitFor(() => {
      expect(screen.getByTestId('status').textContent).toBe('needs-onboarding')
    })
  })

  it('requests a password reset through the auth context', async () => {
    const user = userEvent.setup()

    render(
      <AuthProvider>
        <AuthProbe />
      </AuthProvider>,
    )

    await waitFor(() => {
      expect(screen.getByTestId('status').textContent).toBe('unconfigured')
    })

    await user.click(screen.getByRole('button', { name: 'Forgot password' }))

    await waitFor(() => {
      expect(requestPasswordReset).toHaveBeenCalledWith(OWNER.email)
    })
  })

  it('resets the password and refreshes the active session', async () => {
    const user = userEvent.setup()
    vi.mocked(getBootstrapState)
      .mockResolvedValueOnce({
        currentUser: null,
        hasOwner: true,
        platformBaseUrl: '',
        platformReachable: null,
        platformReady: false,
        serverCount: null,
      })
      .mockResolvedValueOnce({
        currentUser: OWNER,
        hasOwner: true,
        platformBaseUrl: 'http://platform.internal:8080',
        platformReachable: true,
        platformReady: true,
        serverCount: 1,
      })

    render(
      <AuthProvider>
        <AuthProbe />
      </AuthProvider>,
    )

    await waitFor(() => {
      expect(screen.getByTestId('status').textContent).toBe('unconfigured')
    })

    await user.click(screen.getByRole('button', { name: 'Reset password' }))

    await waitFor(() => {
      expect(confirmPasswordReset).toHaveBeenCalledWith({
        confirmPassword: 'newpassword123',
        password: 'newpassword123',
        resetToken: 'reset-token',
      })
    })

    await waitFor(() => {
      expect(screen.getByTestId('status').textContent).toBe('ready')
    })
  })

  it('disconnects back to the signed-out state', async () => {
    const user = userEvent.setup()
    vi.mocked(getBootstrapState)
      .mockResolvedValueOnce({
        currentUser: OWNER,
        hasOwner: true,
        platformBaseUrl: 'http://platform.internal:8080',
        platformReachable: true,
        platformReady: true,
        serverCount: 1,
      })
      .mockResolvedValueOnce({
        currentUser: null,
        hasOwner: true,
        platformBaseUrl: '',
        platformReachable: null,
        platformReady: false,
        serverCount: null,
      })

    render(
      <AuthProvider>
        <AuthProbe />
      </AuthProvider>,
    )

    await waitFor(() => {
      expect(screen.getByTestId('status').textContent).toBe('ready')
    })

    await user.click(screen.getByRole('button', { name: 'Disconnect' }))

    await waitFor(() => {
      expect(screen.getByTestId('status').textContent).toBe('unconfigured')
    })

    expect(signOut).toHaveBeenCalledTimes(1)
    expect(screen.getByTestId('current-user').textContent).toBe('')
  })
})
