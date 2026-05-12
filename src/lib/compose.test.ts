import { describe, expect, it } from 'vitest'
import { parseComposeImport } from './compose'

describe('compose import parsing', () => {
  it('detects services and backup-ready databases', () => {
    const preview = parseComposeImport(`services:\n  app:\n    image: ghcr.io/acme/app:latest\n  postgres:\n    image: postgres:16-alpine\n  redis:\n    image: redis:7-alpine\n`)

    expect(preview.services).toHaveLength(3)
    expect(preview.databaseServices.map((service) => service.engine)).toEqual([
      'PostgreSQL',
      'Redis',
    ])
    expect(preview.backupCandidates.map((service) => service.name)).toEqual([
      'postgres',
    ])
  })

  it('returns a warning when nothing can be parsed', () => {
    const preview = parseComposeImport('name: broken-compose')

    expect(preview.services).toHaveLength(0)
    expect(preview.warnings[0]).toContain('No services were detected')
  })
})
