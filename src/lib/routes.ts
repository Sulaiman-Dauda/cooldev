import type { View } from '../types'

export const routeByView: Record<View, string> = {
  home: '/simple',
  onboarding: '/simple/onboarding',
  new: '/simple/new',
  providers: '/simple/providers',
  deployments: '/simple/deployments',
  resources: '/simple/resources',
  settings: '/simple/settings',
}

export function pathToView(pathname: string): View {
  const normalized = pathname.replace(/\/+$/, '') || '/'

  if (normalized === '/simple/onboarding') return 'onboarding'
  if (normalized === '/simple/new') return 'new'
  if (normalized === '/simple/providers') return 'providers'
  if (normalized === '/simple/deployments') return 'deployments'
  if (normalized === '/simple/resources') return 'resources'
  if (normalized === '/simple/settings') return 'settings'

  return 'home'
}
