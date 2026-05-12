export type ComposeService = {
  name: string
  image: string
  type: 'application' | 'database'
  engine: string | null
  backupEligible: boolean
}

export type ComposePreview = {
  services: ComposeService[]
  databaseServices: ComposeService[]
  backupCandidates: ComposeService[]
  warnings: string[]
}

const databaseMatchers = [
  { engine: 'PostgreSQL', matcher: /postgres/i, backupEligible: true },
  { engine: 'MySQL', matcher: /mysql/i, backupEligible: true },
  { engine: 'MariaDB', matcher: /mariadb/i, backupEligible: true },
  { engine: 'MongoDB', matcher: /mongo/i, backupEligible: true },
  { engine: 'Redis', matcher: /redis/i, backupEligible: false },
  { engine: 'KeyDB', matcher: /keydb/i, backupEligible: false },
  { engine: 'Dragonfly', matcher: /dragonfly/i, backupEligible: false },
  { engine: 'ClickHouse', matcher: /clickhouse/i, backupEligible: false },
] as const

function classifyImage(image: string): ComposeService['type'] {
  return detectDatabaseEngine(image) ? 'database' : 'application'
}

export function detectDatabaseEngine(
  image: string,
): { engine: string; backupEligible: boolean } | null {
  for (const candidate of databaseMatchers) {
    if (candidate.matcher.test(image)) {
      return {
        engine: candidate.engine,
        backupEligible: candidate.backupEligible,
      }
    }
  }

  return null
}

export function parseComposeImport(text: string): ComposePreview {
  const trimmed = text.trim()

  if (trimmed.length === 0) {
    return {
      services: [],
      databaseServices: [],
      backupCandidates: [],
      warnings: ['Paste a docker-compose file to inspect services and backup candidates.'],
    }
  }

  const lines = trimmed.split(/\r?\n/)
  const services: ComposeService[] = []
  const warnings: string[] = []
  let inServices = false
  let currentServiceName = ''
  let currentImage = ''

  function pushCurrentService(): void {
    if (!currentServiceName) {
      return
    }

    const engine = currentImage ? detectDatabaseEngine(currentImage) : null
    services.push({
      name: currentServiceName,
      image: currentImage || 'Build from Dockerfile',
      type: currentImage ? classifyImage(currentImage) : 'application',
      engine: engine?.engine ?? null,
      backupEligible: engine?.backupEligible ?? false,
    })

    currentServiceName = ''
    currentImage = ''
  }

  for (const line of lines) {
    const trimmedLine = line.trim()

    if (trimmedLine.length === 0 || trimmedLine.startsWith('#')) {
      continue
    }

    if (trimmedLine === 'services:') {
      inServices = true
      continue
    }

    if (!inServices) {
      continue
    }

    const serviceMatch = line.match(/^\s{2}([A-Za-z0-9._-]+):\s*$/)
    if (serviceMatch) {
      pushCurrentService()
      currentServiceName = serviceMatch[1]
      continue
    }

    if (/^[A-Za-z0-9_-]+:\s*$/.test(line) && trimmedLine !== 'services:') {
      pushCurrentService()
      inServices = false
      continue
    }

    if (!currentServiceName) {
      continue
    }

    const imageMatch = line.match(/^\s{4,}image:\s*["']?([^"']+)["']?\s*$/)
    if (imageMatch) {
      currentImage = imageMatch[1]
      continue
    }

    if (/^\s{4,}build:\s*/.test(line) && currentImage.length === 0) {
      currentImage = 'Local Dockerfile build'
    }
  }

  pushCurrentService()

  if (services.length === 0) {
    warnings.push('No services were detected. Use standard Compose indentation under the services key.')
  }

  const databaseServices = services.filter((service) => service.type === 'database')
  const backupCandidates = services.filter((service) => service.backupEligible)

  if (databaseServices.length > 0 && backupCandidates.length === 0) {
    warnings.push('Database services were detected, but none map cleanly to backup-ready defaults yet.')
  }

  return {
    services,
    databaseServices,
    backupCandidates,
    warnings,
  }
}
