import { useEffect, useMemo, useState } from 'react'
import { AlertIcon, ShieldIcon } from '../components/Icons'
import { useAuth } from '../lib/auth'

type LoginMode = 'sign-in' | 'request-reset' | 'reset-password'

export function LoginView() {
  const {
    currentUser,
    disconnect,
    error: authError,
    hasOwner,
    login,
    platformReady,
    refresh,
    register,
    requestPasswordReset,
    resetPassword,
    setupProgress,
  } = useAuth()

  const resetToken = useMemo(() => {
    const params = new URLSearchParams(window.location.search)
    return params.get('resetToken')?.trim() || ''
  }, [])

  const [loginMode, setLoginMode] = useState<LoginMode>(resetToken ? 'reset-password' : 'sign-in')
  const [emailAddress, setEmailAddress] = useState('')
  const [fullName, setFullName] = useState('')
  const [password, setPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [retrying, setRetrying] = useState(false)
  const [notice, setNotice] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)

  const needsRegistration = !hasOwner
  const needsSignIn = hasOwner && !currentUser
  const needsSystemSetup = Boolean(currentUser && !platformReady)

  useEffect(() => {
    if (!needsSystemSetup) {
      return
    }

    const timerId = window.setInterval(() => {
      void refresh().catch(() => {
        // The auth context already stores the latest bootstrap error.
      })
    }, 3000)

    return () => {
      window.clearInterval(timerId)
    }
  }, [needsSystemSetup, refresh])

  async function handleRegister() {
    if (!fullName.trim()) {
      setError('Enter the full name for the first owner account.')
      return
    }

    if (!emailAddress.trim()) {
      setError('Enter an email address.')
      return
    }

    if (!password) {
      setError('Enter a password.')
      return
    }

    if (password !== confirmPassword) {
      setError('Password confirmation does not match.')
      return
    }

    setSubmitting(true)
    setError(null)
    setNotice(null)

    try {
      await register({
        confirmPassword,
        email: emailAddress,
        name: fullName,
        password,
      })
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err))
      setSubmitting(false)
    }
  }

  async function handleSignIn() {
    if (!emailAddress.trim()) {
      setError('Enter your email address.')
      return
    }

    if (!password) {
      setError('Enter your password.')
      return
    }

    setSubmitting(true)
    setError(null)
    setNotice(null)

    try {
      await login({
        email: emailAddress,
        password,
      })
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err))
      setSubmitting(false)
    }
  }

  async function handleRequestReset() {
    if (!emailAddress.trim()) {
      setError('Enter your email address.')
      return
    }

    setSubmitting(true)
    setError(null)
    setNotice(null)

    try {
      const result = await requestPasswordReset(emailAddress)
      setNotice(result.message)
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err))
    } finally {
      setSubmitting(false)
    }
  }

  async function handleResetPassword() {
    if (!password) {
      setError('Enter a new password.')
      return
    }

    if (password !== confirmPassword) {
      setError('Password confirmation does not match.')
      return
    }

    setSubmitting(true)
    setError(null)
    setNotice(null)

    try {
      await resetPassword({
        confirmPassword,
        password,
        resetToken,
      })
      window.history.replaceState({}, '', '/simple')
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err))
      setSubmitting(false)
    }
  }

  async function handleRetrySetup() {
    setRetrying(true)
    setError(null)
    setNotice(null)

    try {
      await refresh()
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err))
    } finally {
      setRetrying(false)
    }
  }

  function switchMode(nextMode: LoginMode) {
    setLoginMode(nextMode)
    setError(null)
    setNotice(null)
    setPassword('')
    setConfirmPassword('')
  }

  const activeError = error ?? authError
  const setupSteps = setupProgress?.steps ?? [
    {
      detail: currentUser ? `Signed in as ${currentUser.email}.` : 'Create the owner account to continue.',
      id: 'owner-account',
      label: 'Owner account created',
      state: currentUser ? 'complete' : 'active',
    },
    {
      detail: 'CoolDev is waiting for the managed services to answer internal health checks.',
      id: 'managed-services',
      label: 'Managed services responding',
      state: currentUser ? 'active' : 'pending',
    },
    {
      detail: 'CoolDev will continue as soon as the server-side platform connection is available.',
      id: 'server-connection',
      label: 'Server-side connection ready',
      state: 'pending',
    },
    {
      detail: 'The managed workspace API will be verified automatically once the connection is ready.',
      id: 'workspace-api',
      label: 'Workspace API verified',
      state: 'pending',
    },
  ]
  const completedSetupSteps = setupSteps.filter((step) => step.state === 'complete').length
  const setupPercent = setupProgress?.percent ?? Math.round((completedSetupSteps / setupSteps.length) * 100)
  const setupMeterWidth = Math.max(setupPercent, currentUser ? 25 : 8)
  const setupSummary = setupProgress?.summary ?? 'CoolDev is checking the managed platform behind the scenes.'
  const setupDetail = setupProgress?.detail
    ?? 'Keep this page open while CoolDev checks real startup milestones automatically every few seconds.'

  return (
    <div className="login-shell">
      <div className="login-card">
        <div className="login-brand">
          <div className="brand-mark" aria-hidden="true">
            <span />
            <span />
            <span />
          </div>
          <div className="brand-name">
            <p>Self-hosted</p>
            <strong>CoolDev</strong>
          </div>
        </div>

        {needsRegistration && (
          <>
            <h1 className="login-heading">Create your owner account</h1>
            <p className="login-subheading">
              This account manages your workspace, servers, domains, and
              deployments. No one else can register until you invite them.
            </p>

            <div className="info-banner">
              <ShieldIcon size={14} />
              <div>
                <strong>First-time setup</strong>
                <p>You are the first person here. This becomes the owner account for this CoolDev instance.</p>
              </div>
            </div>

            <div className="login-form">
              <label className="field">
                <span>Full name</span>
                <input
                  type="text"
                  value={fullName}
                  onChange={(event) => {
                    setFullName(event.currentTarget.value)
                    setError(null)
                  }}
                  placeholder="Sulaiman"
                  autoComplete="name"
                />
              </label>
              <label className="field">
                <span>Email address</span>
                <input
                  type="email"
                  value={emailAddress}
                  onChange={(event) => {
                    setEmailAddress(event.currentTarget.value)
                    setError(null)
                  }}
                  placeholder="owner@example.com"
                  autoComplete="email"
                />
              </label>
              <label className="field">
                <span>Password</span>
                <input
                  type="password"
                  value={password}
                  onChange={(event) => {
                    setPassword(event.currentTarget.value)
                    setError(null)
                  }}
                  placeholder="Create a strong password"
                  autoComplete="new-password"
                />
              </label>
              <label className="field">
                <span>Confirm password</span>
                <input
                  type="password"
                  value={confirmPassword}
                  onChange={(event) => {
                    setConfirmPassword(event.currentTarget.value)
                    setError(null)
                  }}
                  placeholder="Repeat the password"
                  autoComplete="new-password"
                />
              </label>

              {notice && (
                <div className="info-banner">
                  <ShieldIcon size={14} />
                  <p>{notice}</p>
                </div>
              )}

              {activeError && (
                <div className="error-banner">
                  <AlertIcon size={14} />
                  <span style={{ whiteSpace: 'pre-wrap' }}>{activeError}</span>
                </div>
              )}

              <button
                type="button"
                className="primary-action login-submit"
                onClick={() => void handleRegister()}
                disabled={submitting}
              >
                {submitting ? 'Creating owner account…' : 'Create owner account'}
              </button>
            </div>
          </>
        )}

        {needsSignIn && loginMode === 'sign-in' && (
          <>
            <h1 className="login-heading">Welcome back</h1>
            <p className="login-subheading">
              Sign in with your owner account to manage servers, deploy
              applications, and configure your workspace.
            </p>

            <div className="login-form">
              <label className="field">
                <span>Email address</span>
                <input
                  type="email"
                  value={emailAddress}
                  onChange={(event) => {
                    setEmailAddress(event.currentTarget.value)
                    setError(null)
                  }}
                  placeholder="owner@example.com"
                  autoComplete="email"
                />
              </label>
              <label className="field">
                <span>Password</span>
                <input
                  type="password"
                  value={password}
                  onChange={(event) => {
                    setPassword(event.currentTarget.value)
                    setError(null)
                  }}
                  placeholder="Enter your password"
                  autoComplete="current-password"
                />
              </label>

              {notice && (
                <div className="info-banner">
                  <ShieldIcon size={14} />
                  <p>{notice}</p>
                </div>
              )}

              {activeError && (
                <div className="error-banner">
                  <AlertIcon size={14} />
                  <span style={{ whiteSpace: 'pre-wrap' }}>{activeError}</span>
                </div>
              )}

              <button
                type="button"
                className="primary-action login-submit"
                onClick={() => void handleSignIn()}
                disabled={submitting}
              >
                {submitting ? 'Signing in…' : 'Sign in'}
              </button>

              <button
                type="button"
                className="secondary-action login-submit"
                onClick={() => switchMode('request-reset')}
                disabled={submitting}
              >
                Forgot password?
              </button>
            </div>
          </>
        )}

        {needsSignIn && loginMode === 'request-reset' && (
          <>
            <h1 className="login-heading">Reset your password</h1>
            <p className="login-subheading">
              Enter your email address. CoolDev will send a reset link, or write
              one to the server log if SMTP is not configured yet.
            </p>

            <div className="login-form">
              <label className="field">
                <span>Email address</span>
                <input
                  type="email"
                  value={emailAddress}
                  onChange={(event) => {
                    setEmailAddress(event.currentTarget.value)
                    setError(null)
                  }}
                  placeholder="owner@example.com"
                  autoComplete="email"
                />
              </label>

              {notice && (
                <div className="info-banner">
                  <ShieldIcon size={14} />
                  <p>{notice}</p>
                </div>
              )}

              {activeError && (
                <div className="error-banner">
                  <AlertIcon size={14} />
                  <span style={{ whiteSpace: 'pre-wrap' }}>{activeError}</span>
                </div>
              )}

              <button
                type="button"
                className="primary-action login-submit"
                onClick={() => void handleRequestReset()}
                disabled={submitting}
              >
                {submitting ? 'Sending reset link…' : 'Send reset link'}
              </button>

              <button
                type="button"
                className="secondary-action login-submit"
                onClick={() => switchMode('sign-in')}
                disabled={submitting}
              >
                Back to sign in
              </button>
            </div>
          </>
        )}

        {needsSignIn && loginMode === 'reset-password' && (
          <>
            <h1 className="login-heading">Set a new password</h1>
            <p className="login-subheading">
              Choose a strong password for your CoolDev owner account. You will
              be signed in automatically after saving.
            </p>

            <div className="login-form">
              <label className="field">
                <span>New password</span>
                <input
                  type="password"
                  value={password}
                  onChange={(event) => {
                    setPassword(event.currentTarget.value)
                    setError(null)
                  }}
                  placeholder="Create a strong password"
                  autoComplete="new-password"
                />
              </label>
              <label className="field">
                <span>Confirm password</span>
                <input
                  type="password"
                  value={confirmPassword}
                  onChange={(event) => {
                    setConfirmPassword(event.currentTarget.value)
                    setError(null)
                  }}
                  placeholder="Repeat the password"
                  autoComplete="new-password"
                />
              </label>

              {notice && (
                <div className="info-banner">
                  <ShieldIcon size={14} />
                  <p>{notice}</p>
                </div>
              )}

              {activeError && (
                <div className="error-banner">
                  <AlertIcon size={14} />
                  <span style={{ whiteSpace: 'pre-wrap' }}>{activeError}</span>
                </div>
              )}

              <button
                type="button"
                className="primary-action login-submit"
                onClick={() => void handleResetPassword()}
                disabled={submitting}
              >
                {submitting ? 'Saving new password…' : 'Save new password'}
              </button>

              <button
                type="button"
                className="secondary-action login-submit"
                onClick={() => switchMode('sign-in')}
                disabled={submitting}
              >
                Back to sign in
              </button>
            </div>
          </>
        )}

        {needsSystemSetup && (
          <>
            <h1 className="login-heading">Finalizing setup</h1>
            <p className="login-subheading">
              Your account is ready. CoolDev is bringing up the managed platform
              and will take you directly into server onboarding once everything
              is live.
            </p>

            <div className="info-banner">
              <ShieldIcon size={14} />
              <div>
                <strong>Signed in as {currentUser?.email}</strong>
                <p>CoolDev checks real startup milestones automatically every few seconds.</p>
              </div>
            </div>

            <div className="login-form">
              <div className="setup-progress-card" aria-live="polite" role="status">
                <div className="setup-progress-header">
                  <div>
                    <strong>{setupSummary}</strong>
                    <p>{setupDetail}</p>
                  </div>
                  <div className="setup-progress-meta">
                    <strong>{setupPercent}%</strong>
                    <small>
                      {completedSetupSteps} of {setupSteps.length} steps complete
                    </small>
                  </div>
                </div>

                <div className="setup-progress-meter" aria-hidden="true">
                  <div
                    className="setup-progress-fill"
                    style={{ width: `${setupMeterWidth}%` }}
                  />
                </div>

                <ol className="setup-progress-steps">
                  {setupSteps.map((step) => (
                    <li key={step.id} className={`setup-progress-step is-${step.state}`}>
                      <span className={`setup-progress-indicator is-${step.state}`} aria-hidden="true">
                        {step.state === 'complete' ? '✓' : step.state === 'active' ? '•' : ''}
                      </span>
                      <div>
                        <strong>{step.label}</strong>
                        <p>{step.detail}</p>
                      </div>
                    </li>
                  ))}
                </ol>
              </div>

              <div className="field-hint" style={{ display: 'grid', gap: 8 }}>
                <span>• You will continue to server setup as soon as the platform is ready.</span>
                <span>• If this takes more than a minute or two, rerun the installer on the server.</span>
              </div>

              {notice && (
                <div className="info-banner">
                  <ShieldIcon size={14} />
                  <p>{notice}</p>
                </div>
              )}

              {activeError && (
                <div className="error-banner">
                  <AlertIcon size={14} />
                  <span style={{ whiteSpace: 'pre-wrap' }}>{activeError}</span>
                </div>
              )}

              <button
                type="button"
                className="primary-action login-submit"
                onClick={() => void handleRetrySetup()}
                disabled={retrying}
              >
                {retrying ? 'Checking setup…' : 'Retry now'}
              </button>

              <button
                type="button"
                className="secondary-action login-submit"
                onClick={() => void disconnect()}
                disabled={retrying}
              >
                Sign out
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  )
}
