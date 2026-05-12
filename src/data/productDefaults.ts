import type { NavigationItem, ProviderConnection } from '../types'

export const navigation: readonly NavigationItem[] = [
  { id: 'home', label: 'Overview', eyebrow: 'Dashboard', path: '/simple' },
  {
    id: 'resources',
    label: 'Resources',
    eyebrow: 'Apps & databases',
    path: '/simple/resources',
  },
  {
    id: 'deployments',
    label: 'Deployments',
    eyebrow: 'Build activity',
    path: '/simple/deployments',
  },
  {
    id: 'providers',
    label: 'Providers',
    eyebrow: 'Git connections',
    path: '/simple/providers',
  },
  {
    id: 'onboarding',
    label: 'Servers',
    eyebrow: 'Connected servers',
    path: '/simple/onboarding',
  },
  {
    id: 'settings',
    label: 'Settings',
    eyebrow: 'Workspace & security',
    path: '/simple/settings',
  },
] as const

export const onboardingAutomations = [
  { label: 'Reverse proxy', detail: 'Traefik or Caddy applied automatically.' },
  { label: 'SSH keys', detail: 'Saved and reused across deployments.' },
  { label: 'Docker checks', detail: 'Validated before any repository setup.' },
  { label: 'Health monitoring', detail: 'Enabled by default without extra config.' },
] as const

export const serverRequirements = [
  'SSH access on port 22 (or a custom port)',
  'Docker Engine installed and running',
  'Outbound internet access for pulling images',
  'A reachable public IP address',
] as const

export const postConnectionSteps = [
  { label: 'Pick a source', detail: 'Choose a Git repository, template, or Docker image.' },
  { label: 'Configure', detail: 'Set environment variables, domain, and build settings.' },
  { label: 'Deploy', detail: 'CoolDev builds, ships, and monitors the release for you.' },
] as const

export const providerConnections: readonly ProviderConnection[] = [
  {
    key: 'github',
    name: 'GitHub',
    state: 'Connected',
    repos: '42 repos available',
    note: 'Best path for app installation and private repository sync.',
    capabilities: ['GitHub App auth', 'Deploy keys', 'Webhook setup'],
  },
  {
    key: 'gitlab',
    name: 'GitLab',
    state: 'Needs token',
    repos: 'Provider supported',
    note: 'Use personal access token or deploy key without switching flows.',
    capabilities: ['PAT auth', 'Deploy keys', 'Branch discovery'],
  },
  {
    key: 'forgejo',
    name: 'Forgejo / Gitea',
    state: 'Ready',
    repos: 'Self-hosted friendly',
    note: 'Reuse webhook and manual secret handling without switching to a different deployment flow.',
    capabilities: ['Self-hosted base URL', 'Manual webhook secret', 'Deploy keys'],
  },
  {
    key: 'bitbucket',
    name: 'Bitbucket',
    state: 'Ready',
    repos: 'Private repos supported',
    note: 'Keep the same wizard path, only swap auth requirements and webhook instructions.',
    capabilities: ['App password', 'Deploy keys', 'Webhook setup'],
  },
  {
    key: 'generic',
    name: 'Generic Git',
    state: 'Ready',
    repos: 'Bring any SSH URL',
    note: 'Expose only clone URL, branch, and optional deploy key instead of provider-specific setup screens.',
    capabilities: ['SSH clone URL', 'Deploy key', 'Branch selection'],
  },
] as const

export const sampleCompose = `services:
  app:
    image: ghcr.io/coollabsio/example-app:latest
    ports:
      - "3000:3000"
  postgres:
    image: postgres:16-alpine
    environment:
      POSTGRES_DB: app
      POSTGRES_USER: cooldev
      POSTGRES_PASSWORD: secret
  redis:
    image: redis:7-alpine
`