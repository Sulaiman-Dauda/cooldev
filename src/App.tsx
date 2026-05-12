import {
  startTransition,
  useEffect,
  useEffectEvent,
  useState,
} from 'react'
import './App.css'
import {
  DatabaseIcon,
  GitBranchIcon,
  GridIcon,
  HomeIcon,
  LayersIcon,
  MoonIcon,
  PlusIcon,
  ServerIcon,
  SettingsIcon,
  SunIcon,
} from './components/Icons'
import { navigation } from './data/productDefaults'
import { AuthProvider, useAuth } from './lib/auth'
import { pathToView, routeByView } from './lib/routes'
import type { View } from './types'
import { DeploymentsView } from './views/DeploymentsView'
import { DeployWizardView } from './views/DeployWizardView'
import { HomeView } from './views/HomeView'
import { LoginView } from './views/LoginView'
import { OnboardingView } from './views/OnboardingView'
import { ProvidersView } from './views/ProvidersView'
import { ResourcesView } from './views/ResourcesView'
import { SettingsView } from './views/SettingsView'

const navIcons: Record<View, React.ReactNode> = {
  home: <HomeIcon size={15} />,
  resources: <GridIcon size={15} />,
  deployments: <LayersIcon size={15} />,
  providers: <GitBranchIcon size={15} />,
  onboarding: <ServerIcon size={15} />,
  new: <PlusIcon size={15} />,
  settings: <SettingsIcon size={15} />,
}

function initTheme(): 'light' | 'dark' {
  const stored = localStorage.getItem('cooldev-theme')
  if (stored === 'light' || stored === 'dark') return stored
  // Default: always dark (Vercel-style)
  return 'dark'
}

function AppShell() {
  const { status, completeOnboarding, currentUser, disconnect } = useAuth()
  const [theme, setTheme] = useState<'light' | 'dark'>(initTheme)

  const [pathname, setPathname] = useState(
    () => routeByView[pathToView(window.location.pathname || routeByView.home)],
  )

  const activeView = pathToView(pathname)
  const currentView = navigation.find((item) => item.id === activeView) ?? navigation[0]

  // Override title for views not in navigation
  const topbarTitle = activeView === 'new'
    ? { label: 'New resource', eyebrow: 'Deploy wizard' }
    : currentView

  useEffect(() => {
    document.documentElement.dataset.theme = theme
    localStorage.setItem('cooldev-theme', theme)
  }, [theme])

  const handlePopState = useEffectEvent(() => {
    setPathname(window.location.pathname || routeByView.home)
  })

  useEffect(() => {
    const nextView = pathToView(window.location.pathname)
    const canonicalPath = routeByView[nextView]

    if (window.location.pathname !== canonicalPath) {
      window.history.replaceState({}, '', canonicalPath)
    }

    const onPopState = () => handlePopState()
    window.addEventListener('popstate', onPopState)
    return () => { window.removeEventListener('popstate', onPopState) }
  }, [])

  function navigateTo(view: View): void {
    const nextPath = routeByView[view]
    if (window.location.pathname === nextPath) return
    window.history.pushState({}, '', nextPath)
    startTransition(() => { setPathname(nextPath) })
  }

  // ── Auth gate: loading ───────────────────────────────────────────────────
  if (status === 'loading') {
    return (
      <div className="gate-shell">
        <div className="gate-loading-brand">
          <div className="brand-mark" aria-hidden="true">
            <span /><span /><span />
          </div>
          <div className="brand-name">
            <p>Self-hosted</p>
            <strong>CoolDev</strong>
          </div>
        </div>
        <div className="gate-spinner" aria-label="Loading…" />
      </div>
    )
  }

  // ── Auth gate: unconfigured → show login ─────────────────────────────────
  if (status === 'unconfigured') {
    return <LoginView />
  }

  // ── Auth gate: needs-onboarding → force onboarding before dashboard ──────
  if (status === 'needs-onboarding') {
    return (
      <div className="gate-shell gate-onboarding">
        <div className="gate-onboarding-inner">
          <div className="gate-brand">
            <div className="brand-mark" aria-hidden="true">
              <span /><span /><span />
            </div>
            <div className="brand-name">
              <p>Self-hosted</p>
              <strong>CoolDev</strong>
            </div>
          </div>
          <OnboardingView onNavigate={navigateTo} onComplete={completeOnboarding} />
        </div>
      </div>
    )
  }

  // ── Main app shell ────────────────────────────────────────────────────────
  let activeScreen = <HomeView onNavigate={navigateTo} />

  if (activeView === 'resources') activeScreen = <ResourcesView onNavigate={navigateTo} />
  if (activeView === 'onboarding') activeScreen = <OnboardingView onNavigate={navigateTo} onComplete={completeOnboarding} />
  if (activeView === 'new') activeScreen = <DeployWizardView onNavigate={navigateTo} />
  if (activeView === 'providers') activeScreen = <ProvidersView />
  if (activeView === 'deployments') activeScreen = <DeploymentsView />
  if (activeView === 'settings') activeScreen = <SettingsView />

  return (
    <div className="app-shell">
      <aside className="sidebar">
        <div className="sidebar-header">
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

        <nav className="nav-list" aria-label="Primary">
          {navigation.map((item) => (
            <button
              key={item.id}
              type="button"
              className={item.id === activeView ? 'nav-item is-active' : 'nav-item'}
              onClick={() => navigateTo(item.id)}
            >
              {navIcons[item.id]}
              <span className="nav-item-text">
                <span>{item.label}</span>
                <small>{item.eyebrow}</small>
              </span>
            </button>
          ))}
        </nav>

        {currentUser && (
          <footer className="sidebar-account">
            <div className="sidebar-account-avatar" aria-hidden="true">
              {currentUser.name.trim().charAt(0).toUpperCase()}
            </div>
            <div className="sidebar-account-info">
              <strong>{currentUser.name}</strong>
              <small>{currentUser.email}</small>
            </div>
            <button
              type="button"
              className="sidebar-account-signout"
              onClick={() => void disconnect()}
              title="Sign out"
              aria-label="Sign out"
            >
              <svg width="13" height="13" viewBox="0 0 16 16" fill="none" aria-hidden="true">
                <path d="M6 2H3a1 1 0 0 0-1 1v10a1 1 0 0 0 1 1h3" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round"/>
                <path d="M11 11l3-3-3-3" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round"/>
                <path d="M14 8H6" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round"/>
              </svg>
            </button>
          </footer>
        )}
      </aside>

      <main className="main-panel">
        <header className="topbar">
          <div className="topbar-title">
            <p className="eyebrow">{topbarTitle.eyebrow}</p>
            <h2>{topbarTitle.label}</h2>
          </div>
          <div className="topbar-actions">
            <button
              type="button"
              className="icon-action"
              onClick={() => setTheme((t) => (t === 'light' ? 'dark' : 'light'))}
              aria-label={theme === 'dark' ? 'Switch to light mode' : 'Switch to dark mode'}
              title={theme === 'dark' ? 'Light mode' : 'Dark mode'}
            >
              {theme === 'dark' ? <SunIcon size={15} /> : <MoonIcon size={15} />}
            </button>
            <button
              type="button"
              className="primary-action"
              onClick={() => navigateTo('new')}
            >
              <DatabaseIcon size={14} />
              New resource
            </button>
          </div>
        </header>

        {activeScreen}
      </main>
    </div>
  )
}

function App() {
  return (
    <AuthProvider>
      <AppShell />
    </AuthProvider>
  )
}

export default App

