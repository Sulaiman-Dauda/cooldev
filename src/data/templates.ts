export type TemplateCategory = 'app' | 'database' | 'service'

export type AppTemplate = {
  id: string
  name: string
  description: string
  tags: string[]
  repositoryUrl: string
  branch?: string
  buildPack?: 'nixpacks' | 'static' | 'dockerfile' | 'dockercompose'
  portsExposes?: string
}

export type DatabaseEngine = {
  id: string
  name: string
  description: string
  image: string
  recommended?: boolean
}

export type ServiceTemplate = {
  id: string
  name: string
  description: string
  tags: string[]
}

export const appTemplates: readonly AppTemplate[] = [
  {
    id: 'nextjs',
    name: 'Next.js',
    description: 'React framework with SSR, static generation, and API routes.',
    tags: ['react', 'node', 'ssr'],
    repositoryUrl: 'https://github.com/vercel/next.js',
    branch: 'canary',
    buildPack: 'nixpacks',
    portsExposes: '3000',
  },
  {
    id: 'remix',
    name: 'Remix',
    description: 'Full-stack React with nested routing and server-side data loading.',
    tags: ['react', 'node'],
    repositoryUrl: 'https://github.com/remix-run/remix',
    branch: 'main',
    buildPack: 'nixpacks',
    portsExposes: '3000',
  },
  {
    id: 'astro',
    name: 'Astro',
    description: 'Content-first framework with island architecture and zero JS by default.',
    tags: ['static', 'ssg', 'multi-framework'],
    repositoryUrl: 'https://github.com/withastro/astro',
    branch: 'main',
    buildPack: 'nixpacks',
    portsExposes: '4321',
  },
  {
    id: 'sveltekit',
    name: 'SvelteKit',
    description: 'Svelte-based full-stack framework with file-based routing.',
    tags: ['svelte', 'node'],
    repositoryUrl: 'https://github.com/sveltejs/kit',
    branch: 'main',
    buildPack: 'nixpacks',
    portsExposes: '3000',
  },
  {
    id: 'nuxt',
    name: 'Nuxt',
    description: 'Vue framework with SSR, static generation, and file-based routing.',
    tags: ['vue', 'node'],
    repositoryUrl: 'https://github.com/nuxt/nuxt',
    branch: 'main',
    buildPack: 'nixpacks',
    portsExposes: '3000',
  },
  {
    id: 'express',
    name: 'Express',
    description: 'Minimal Node.js web framework. Good for REST APIs and microservices.',
    tags: ['node', 'api'],
    repositoryUrl: 'https://github.com/expressjs/express',
    branch: 'master',
    buildPack: 'nixpacks',
    portsExposes: '3000',
  },
  {
    id: 'nestjs',
    name: 'NestJS',
    description: 'Opinionated Node.js framework with TypeScript, decorators, and DI.',
    tags: ['node', 'typescript', 'api'],
    repositoryUrl: 'https://github.com/nestjs/nest',
    branch: 'master',
    buildPack: 'nixpacks',
    portsExposes: '3000',
  },
  {
    id: 'fastapi',
    name: 'FastAPI',
    description: 'High-performance Python API with async support and auto-generated docs.',
    tags: ['python', 'api'],
    repositoryUrl: 'https://github.com/fastapi/fastapi',
    branch: 'master',
    buildPack: 'nixpacks',
    portsExposes: '8000',
  },
  {
    id: 'django',
    name: 'Django',
    description: 'Batteries-included Python web framework with ORM and admin UI.',
    tags: ['python', 'fullstack'],
    repositoryUrl: 'https://github.com/django/django',
    branch: 'main',
    buildPack: 'nixpacks',
    portsExposes: '8000',
  },
  {
    id: 'laravel',
    name: 'Laravel',
    description: 'Expressive PHP framework with routing, ORM, and first-class tooling.',
    tags: ['php', 'fullstack'],
    repositoryUrl: 'https://github.com/laravel/laravel',
    branch: 'master',
    buildPack: 'nixpacks',
    portsExposes: '80',
  },
  {
    id: 'rails',
    name: 'Ruby on Rails',
    description: 'Convention-over-configuration full-stack framework for rapid development.',
    tags: ['ruby', 'fullstack'],
    repositoryUrl: 'https://github.com/rails/rails',
    branch: 'main',
    buildPack: 'nixpacks',
    portsExposes: '3000',
  },
  {
    id: 'phoenix',
    name: 'Phoenix',
    description: 'High-performance Elixir web framework with real-time features.',
    tags: ['elixir', 'fullstack'],
    repositoryUrl: 'https://github.com/phoenixframework/phoenix',
    branch: 'main',
    buildPack: 'nixpacks',
    portsExposes: '4000',
  },
] as const

export const databaseEngines: readonly DatabaseEngine[] = [
  {
    id: 'postgres',
    name: 'PostgreSQL',
    description: 'Open-source relational database. Best general-purpose choice.',
    image: 'postgres:16-alpine',
    recommended: true,
  },
  {
    id: 'mysql',
    name: 'MySQL',
    description: 'Widely supported relational database used by most web stacks.',
    image: 'mysql:8',
  },
  {
    id: 'mariadb',
    name: 'MariaDB',
    description: 'MySQL-compatible with extra storage engines and community governance.',
    image: 'mariadb:11',
  },
  {
    id: 'redis',
    name: 'Redis',
    description: 'In-memory data store for caching, session management, and queues.',
    image: 'redis:7-alpine',
  },
  {
    id: 'mongodb',
    name: 'MongoDB',
    description: 'Document-oriented database with flexible schema and horizontal scale.',
    image: 'mongo:7',
  },
  {
    id: 'clickhouse',
    name: 'ClickHouse',
    description: 'Column-oriented analytics database for high-volume query workloads.',
    image: 'clickhouse/clickhouse-server:24',
  },
] as const

export const serviceTemplates: readonly ServiceTemplate[] = [
  {
    id: 'supabase',
    name: 'Supabase',
    description: 'Open-source Firebase alternative with Postgres, auth, and storage.',
    tags: ['auth', 'database', 'storage'],
  },
  {
    id: 'minio',
    name: 'MinIO',
    description: 'High-performance S3-compatible object storage for self-hosted environments.',
    tags: ['storage', 's3'],
  },
  {
    id: 'umami',
    name: 'Umami',
    description: 'Privacy-focused, open-source web analytics with a clean dashboard.',
    tags: ['analytics'],
  },
  {
    id: 'plausible',
    name: 'Plausible',
    description: 'Lightweight privacy-first analytics. No cookies, no GDPR fuss.',
    tags: ['analytics'],
  },
  {
    id: 'ghost',
    name: 'Ghost',
    description: 'Professional publishing platform with memberships and newsletters.',
    tags: ['cms', 'blog'],
  },
  {
    id: 'gitea',
    name: 'Gitea',
    description: 'Lightweight self-hosted Git service with issue tracker and CI integration.',
    tags: ['git', 'devtool'],
  },
  {
    id: 'n8n',
    name: 'n8n',
    description: 'Node-based workflow automation with 300+ integrations and a visual editor.',
    tags: ['automation', 'workflows'],
  },
  {
    id: 'uptime-kuma',
    name: 'Uptime Kuma',
    description: 'Self-hosted uptime monitoring with status pages and alert channels.',
    tags: ['monitoring', 'ops'],
  },
  {
    id: 'wordpress',
    name: 'WordPress',
    description: 'Most popular CMS powering over 40% of the web.',
    tags: ['cms', 'blog'],
  },
  {
    id: 'keycloak',
    name: 'Keycloak',
    description: 'Open-source identity and access management with SSO and OIDC.',
    tags: ['auth', 'sso', 'oidc'],
  },
  {
    id: 'meilisearch',
    name: 'Meilisearch',
    description: 'Fast, typo-tolerant full-text search engine with a simple REST API.',
    tags: ['search'],
  },
  {
    id: 'appwrite',
    name: 'Appwrite',
    description: 'Backend-as-a-service with auth, databases, storage, and functions.',
    tags: ['baas', 'auth', 'storage'],
  },
] as const
