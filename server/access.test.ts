// @vitest-environment node

import { mkdirSync, mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const { mockExecInDockerContainer, mockLookup } = vi.hoisted(() => ({
  mockExecInDockerContainer: vi.fn(),
  mockLookup: vi.fn(),
}))

vi.mock('node:dns/promises', () => ({
  lookup: mockLookup,
}))

vi.mock('./dockerApi.js', () => ({
  execInDockerContainer: mockExecInDockerContainer,
}))

import { applyAccessDomain, readProxyDynamicConfig } from './access.js'
import { CooldevStore } from './persistence.js'

describe('access proxy integration', () => {
  let dataDir = ''

  beforeEach(() => {
    dataDir = mkdtempSync(path.join(tmpdir(), 'cooldev-access-test-'))
    mkdirSync(path.join(dataDir, 'platform-proxy', 'dynamic'), { recursive: true })
    mockLookup.mockResolvedValue([{ address: '203.0.113.10', family: 4 }])
    mockExecInDockerContainer.mockResolvedValue(undefined)
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('tls pending')))
  })

  afterEach(() => {
    vi.unstubAllGlobals()
    rmSync(dataDir, { force: true, recursive: true })
    mockLookup.mockReset()
    mockExecInDockerContainer.mockReset()
  })

  it('writes Traefik config when Coolify exposes a flat dynamic proxy directory', async () => {
    const store = new CooldevStore(dataDir)

    const status = await applyAccessDomain(store, {
      expectedIp: '203.0.113.10',
      publicUrl: 'https://cooldev.backnd.top',
      requestOrigin: 'http://203.0.113.10:3001',
    })

    expect(status.proxyProvider).toBe('traefik')
    expect(status.status).toBe('provisioning-ssl')
    expect(readProxyDynamicConfig(store)).toContain('Host(`cooldev.backnd.top`)')
    expect(readProxyDynamicConfig(store)).toContain('!PathPrefix(`/.well-known/acme-challenge/`)')
    expect(mockExecInDockerContainer).not.toHaveBeenCalled()
  })
})