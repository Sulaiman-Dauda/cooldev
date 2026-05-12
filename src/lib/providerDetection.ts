import type { ProviderKey, RepositoryVisibility } from '../types'

export type ProviderProfile = {
  provider: ProviderKey
  name: string
  host: string
  normalizedUrl: string
  authLabel: string
  requiredSecrets: string[]
  webhookSupport: string
}

const providerNames: Record<ProviderKey, string> = {
  github: 'GitHub',
  gitlab: 'GitLab',
  gitea: 'Gitea',
  forgejo: 'Forgejo',
  bitbucket: 'Bitbucket',
  generic: 'Generic Git',
}

function extractHost(url: string): string {
  const trimmed = url.trim()
  const sshMatch = trimmed.match(/^git@([^:]+):/)

  if (sshMatch) {
    return sshMatch[1]
  }

  try {
    return new URL(trimmed).hostname
  } catch {
    return ''
  }
}

export function guessProviderFromUrl(url: string): ProviderKey | null {
  const host = extractHost(url).toLowerCase()

  if (host.length === 0) {
    return null
  }

  if (host.includes('github.com')) {
    return 'github'
  }

  if (host.includes('gitlab.com')) {
    return 'gitlab'
  }

  if (host.includes('bitbucket.org')) {
    return 'bitbucket'
  }

  if (host.includes('forgejo')) {
    return 'forgejo'
  }

  if (host.includes('gitea')) {
    return 'gitea'
  }

  if (host.includes('git.')) {
    return 'generic'
  }

  if (url.trim().startsWith('git@')) {
    return 'generic'
  }

  return null
}

export function getProviderProfile(
  provider: ProviderKey,
  visibility: RepositoryVisibility,
  url: string,
): ProviderProfile {
  const host = extractHost(url) || 'custom git host'

  if (provider === 'github') {
    return {
      provider,
      name: providerNames[provider],
      host,
      normalizedUrl: url.trim(),
      authLabel: visibility === 'public' ? 'No credentials required' : 'GitHub App or deploy key',
      requiredSecrets:
        visibility === 'public' ? [] : ['GitHub App installation or deploy key', 'Webhook secret'],
      webhookSupport: 'Automatic webhook path available',
    }
  }

  if (provider === 'gitlab') {
    return {
      provider,
      name: providerNames[provider],
      host,
      normalizedUrl: url.trim(),
      authLabel: visibility === 'public' ? 'No credentials required' : 'Personal access token or deploy key',
      requiredSecrets:
        visibility === 'public' ? [] : ['Access token or deploy key', 'Webhook secret'],
      webhookSupport: 'Project webhook required for push deploys',
    }
  }

  if (provider === 'bitbucket') {
    return {
      provider,
      name: providerNames[provider],
      host,
      normalizedUrl: url.trim(),
      authLabel: visibility === 'public' ? 'No credentials required' : 'App password or deploy key',
      requiredSecrets:
        visibility === 'public' ? [] : ['App password or deploy key', 'Webhook secret'],
      webhookSupport: 'Webhook setup supported',
    }
  }

  if (provider === 'gitea' || provider === 'forgejo') {
    return {
      provider,
      name: providerNames[provider],
      host,
      normalizedUrl: url.trim(),
      authLabel: visibility === 'public' ? 'No credentials required' : 'Access token or deploy key',
      requiredSecrets:
        visibility === 'public' ? [] : ['Access token or deploy key', 'Manual webhook secret'],
      webhookSupport: 'Manual webhook secret supported',
    }
  }

  return {
    provider,
    name: providerNames[provider],
    host,
    normalizedUrl: url.trim(),
    authLabel: visibility === 'public' ? 'HTTPS clone only' : 'SSH deploy key',
    requiredSecrets: visibility === 'public' ? [] : ['Deploy key', 'Optional webhook secret'],
    webhookSupport: 'Manual webhook URL',
  }
}
