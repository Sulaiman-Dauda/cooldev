import { describe, expect, it } from 'vitest'
import {
  getProviderProfile,
  guessProviderFromUrl,
} from './providerDetection'

describe('provider detection', () => {
  it('detects GitHub from an https URL', () => {
    expect(guessProviderFromUrl('https://github.com/acme/site')).toBe('github')
  })

  it('falls back to generic git for custom ssh hosts', () => {
    expect(guessProviderFromUrl('git@git.example.com:acme/site.git')).toBe(
      'generic',
    )
  })

  it('returns private GitLab auth requirements', () => {
    const profile = getProviderProfile(
      'gitlab',
      'private',
      'https://gitlab.com/acme/site',
    )

    expect(profile.authLabel).toBe('Personal access token or deploy key')
    expect(profile.requiredSecrets).toContain('Webhook secret')
  })
})
