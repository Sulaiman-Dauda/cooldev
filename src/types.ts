export type View = 'home' | 'onboarding' | 'new' | 'providers' | 'deployments' | 'resources' | 'settings'

export type RepositoryVisibility = 'public' | 'private'
export type DeploymentMode = 'repo' | 'compose'
export type ProviderKey =
  | 'github'
  | 'gitlab'
  | 'gitea'
  | 'forgejo'
  | 'bitbucket'
  | 'generic'

export type NavigationItem = {
  id: View
  label: string
  eyebrow: string
  path: string
}

export type ProviderConnection = {
  key: ProviderKey
  name: string
  state: string
  repos: string
  note: string
  capabilities: string[]
}

export type DeploymentRecord = {
  app: string
  status: 'Queued' | 'Building' | 'Ready' | 'Failed'
  rawLog: string
  branch?: string
  sha?: string
  time?: string
  eta?: string
}

export type ResourceType = 'app' | 'database' | 'service' | 'compose'

export type Resource = {
  id: string
  name: string
  type: 'app' | 'database' | 'service'
  status: 'Ready' | 'Failed' | 'Building' | 'Stopped'
  domain?: string
  branch?: string
  engine?: string
}
