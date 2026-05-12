import { describe, expect, it } from 'vitest'
import { humanizeDeploymentFailure } from './diagnostics'

describe('deployment diagnostics', () => {
  it('treats successful health checks as successful deployments', () => {
    const diagnostic = humanizeDeploymentFailure(
      'Build completed. Health check passed. Deployment finished successfully.',
    )

    expect(diagnostic.title).toBe('Deployment completed')
    expect(diagnostic.severity).toBe('info')
  })

  it('humanizes exit code 137 failures', () => {
    const diagnostic = humanizeDeploymentFailure(
      'Container exited with code 137 during build due to memory pressure.',
    )

    expect(diagnostic.title).toBe('Exit code 137')
    expect(diagnostic.severity).toBe('critical')
  })

  it('humanizes repository authentication failures', () => {
    const diagnostic = humanizeDeploymentFailure(
      'Permission denied (publickey). Could not read from remote repository.',
    )

    expect(diagnostic.title).toBe('Repository authentication failed')
    expect(diagnostic.nextStep).toContain('credential')
  })
})
