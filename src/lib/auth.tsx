/**
 * CoolDev auth context
 *
 * Tracks the current CoolDev session, owner account state, and whether the
 * workspace runtime is ready behind the scenes.
 */

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useState,
  type ReactNode,
} from 'react'
import {
  confirmPasswordReset,
  getBootstrapState,
  listServers,
  registerOwner,
  requestPasswordReset,
  signIn,
  signOut,
  type ApiBootstrapSetupProgress,
  type ApiBootstrapState,
  type ApiPasswordResetRequestResult,
  type ApiSessionUser,
} from './api'

export type AuthStatus =
  | 'loading'
  | 'unconfigured'
  | 'needs-onboarding'
  | 'ready'

type AuthContextValue = {
  status: AuthStatus
  error: string | null
  hasOwner: boolean
  platformReady: boolean
  setupProgress: ApiBootstrapSetupProgress | null
  currentUser: ApiSessionUser | null
  register: (data: {
    confirmPassword: string
    email: string
    name: string
    password: string
  }) => Promise<void>
  login: (data: { email: string; password: string }) => Promise<void>
  requestPasswordReset: (email: string) => Promise<ApiPasswordResetRequestResult>
  resetPassword: (data: {
    confirmPassword: string
    password: string
    resetToken: string
  }) => Promise<void>
  completeOnboarding: () => void
  disconnect: () => Promise<void>
  refresh: () => Promise<void>
}

const AuthContext = createContext<AuthContextValue | null>(null)

function resolveStatus(bootstrap: ApiBootstrapState): AuthStatus {
  if (!bootstrap.currentUser || !bootstrap.platformReady) {
    return 'unconfigured'
  }

  return (bootstrap.serverCount ?? 0) > 0 ? 'ready' : 'needs-onboarding'
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [status, setStatus] = useState<AuthStatus>('loading')
  const [error, setError] = useState<string | null>(null)
  const [hasOwner, setHasOwner] = useState(false)
  const [platformReady, setPlatformReady] = useState(false)
  const [setupProgress, setSetupProgress] = useState<ApiBootstrapSetupProgress | null>(null)
  const [currentUser, setCurrentUser] = useState<ApiSessionUser | null>(null)

  const applyBootstrap = useCallback((bootstrap: ApiBootstrapState) => {
    setPlatformReady(bootstrap.platformReady)
    setSetupProgress(bootstrap.setupProgress ?? null)
    setCurrentUser(bootstrap.currentUser)
    setHasOwner(bootstrap.hasOwner)
    setStatus(resolveStatus(bootstrap))
    setError(null)
  }, [])

  const refresh = useCallback(async () => {
    try {
      const bootstrap = await getBootstrapState()

      // Prevent onboarding flicker: bootstrap serverCount can be stale immediately
      // after the workspace runtime auto-connects the local server. Verify directly
      // before routing the user into the fullscreen onboarding gate.
      if (
        bootstrap.currentUser &&
        bootstrap.platformReady &&
        (bootstrap.serverCount ?? 0) === 0
      ) {
        try {
          const servers = await listServers()
          if (servers.length > 0) {
            applyBootstrap({ ...bootstrap, serverCount: servers.length })
            return
          }
        } catch {
          // listServers can fail before the platform is fully ready — fall through
          // to normal resolution so we don't block the auth flow.
        }
      }

      applyBootstrap(bootstrap)
    } catch (nextError) {
      setStatus('unconfigured')
      setCurrentUser(null)
      setPlatformReady(false)
      setSetupProgress(null)
      setHasOwner(false)
      setError(nextError instanceof Error ? nextError.message : String(nextError))
    }
  }, [applyBootstrap])

  useEffect(() => {
    void refresh()
  }, [refresh])

  const register = useCallback(async (data: {
    confirmPassword: string
    email: string
    name: string
    password: string
  }) => {
    await registerOwner(data)
    await refresh()
  }, [refresh])

  const login = useCallback(async (data: { email: string; password: string }) => {
    await signIn(data)
    await refresh()
  }, [refresh])

  const forgotPassword = useCallback(async (email: string) => {
    return requestPasswordReset(email)
  }, [])

  const resetPassword = useCallback(async (data: {
    confirmPassword: string
    password: string
    resetToken: string
  }) => {
    await confirmPasswordReset(data)
    await refresh()
  }, [refresh])

  const completeOnboarding = useCallback(() => {
    setStatus('ready')
  }, [])

  const disconnect = useCallback(async () => {
    await signOut()
    await refresh()
  }, [refresh])

  return (
    <AuthContext.Provider
      value={{
        status,
        error,
        hasOwner,
        platformReady,
        setupProgress,
        currentUser,
        register,
        login,
        requestPasswordReset: forgotPassword,
        resetPassword,
        completeOnboarding,
        disconnect,
        refresh,
      }}
    >
      {children}
    </AuthContext.Provider>
  )
}

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext)
  if (!ctx) throw new Error('useAuth must be used within <AuthProvider>')
  return ctx
}
