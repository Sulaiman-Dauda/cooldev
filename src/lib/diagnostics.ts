export type HumanizedDiagnostic = {
  title: string
  probableCause: string
  nextStep: string
  severity: 'info' | 'warning' | 'critical'
}

const heuristics = [
  {
    test: (rawLog: string) =>
      /deployment finished successfully|health check passed|ready to accept traffic|build completed/i.test(rawLog),
    title: 'Deployment completed',
    probableCause: 'The latest deployment finished and the app passed its readiness checks.',
    nextStep:
      'Verify the app URL and trigger another deployment only after a real config or code change.',
    severity: 'info',
  },
  {
    test: (rawLog: string) => /137|out of memory|memory pressure|oom/i.test(rawLog),
    title: 'Exit code 137',
    probableCause: 'The server ran out of memory during build or startup.',
    nextStep:
      'Reduce build concurrency, add swap, or move to a larger VPS before digging through raw Docker output.',
    severity: 'critical',
  },
  {
    test: (rawLog: string) =>
      /health check failed|health check timed out|unhealthy|never responded/i.test(rawLog),
    title: 'Health check failed',
    probableCause: 'The app started on a different port or never became ready in time.',
    nextStep:
      'Confirm the detected port and readiness path, then expose an advanced override only if the default guess was wrong.',
    severity: 'warning',
  },
  {
    test: (rawLog: string) => /environment|missing.+variable|undefined.+variable/i.test(rawLog),
    title: 'Missing environment variable',
    probableCause: 'A required secret or runtime variable is missing from the deployment configuration.',
    nextStep:
      'List the missing variable names directly in the UI and keep the raw logs behind a secondary action.',
    severity: 'warning',
  },
  {
    test: (rawLog: string) => /cloudflare|ssl mode|origin cert|525|526/i.test(rawLog),
    title: 'Cloudflare or SSL mismatch',
    probableCause: 'Proxy mode and origin SSL expectations do not match.',
    nextStep:
      'Explain whether the fix is DNS-only, SSL-mode-only, or both, then link to the exact certificate log lines.',
    severity: 'warning',
  },
  {
    test: (rawLog: string) => /dns|nxdomain|resolve host|host not found/i.test(rawLog),
    title: 'DNS is not resolving yet',
    probableCause: 'The domain is missing an A record or still propagating.',
    nextStep:
      'Show the expected target IP and ask the user to retry once DNS matches the connected server.',
    severity: 'info',
  },
  {
    test: (rawLog: string) => /permission denied|repository not found|could not read from remote repository|authentication failed/i.test(rawLog),
    title: 'Repository authentication failed',
    probableCause: 'The provider credentials or deploy key do not have access to the target repository.',
    nextStep:
      'Offer the exact credential that is missing for this provider and keep raw git output available below.',
    severity: 'critical',
  },
] as const

export function humanizeDeploymentFailure(rawLog: string): HumanizedDiagnostic {
  const trimmed = rawLog.trim()

  for (const heuristic of heuristics) {
    if (heuristic.test(trimmed)) {
      return {
        title: heuristic.title,
        probableCause: heuristic.probableCause,
        nextStep: heuristic.nextStep,
        severity: heuristic.severity,
      }
    }
  }

  return {
    title: 'Needs log review',
    probableCause: 'The failure does not match a common deployment heuristic yet.',
    nextStep:
      'Keep the raw log open and capture this signature so it can become a future humanized diagnostic.',
    severity: 'info',
  }
}
