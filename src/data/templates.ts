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

// Curated starter repositories for common application stacks.
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

// Curated from the bundled Coolify one-click catalog.
export const serviceTemplates: readonly ServiceTemplate[] = [
  {
    id: 'supabase',
    name: 'Supabase',
    description: 'Postgres-backed backend stack with auth, storage, realtime, and admin APIs.',
    tags: ['backend', 'database', 'auth', 'storage'],
  },
  {
    id: 'appwrite',
    name: 'Appwrite',
    description: 'Backend platform with auth, databases, storage, functions, and messaging.',
    tags: ['backend', 'baas', 'auth', 'storage'],
  },
  {
    id: 'n8n-with-postgresql',
    name: 'n8n + PostgreSQL',
    description: 'Workflow automation with durable Postgres storage and a visual editor.',
    tags: ['automation', 'workflow', 'postgres'],
  },
  {
    id: 'authentik',
    name: 'Authentik',
    description: 'Identity provider with SSO, OAuth, OIDC, SAML, and user portal flows.',
    tags: ['auth', 'sso', 'oauth', 'oidc', 'saml'],
  },
  {
    id: 'open-webui',
    name: 'Open WebUI',
    description: 'Self-hosted chat interface for local or remote LLMs with model management.',
    tags: ['ai', 'llm', 'chat'],
  },
  {
    id: 'uptime-kuma',
    name: 'Uptime Kuma',
    description: 'Uptime monitoring with health checks, status pages, and alerting.',
    tags: ['monitoring', 'ops', 'status-page'],
  },
  {
    id: 'plausible',
    name: 'Plausible',
    description: 'Privacy-first website analytics with simple traffic and goal reporting.',
    tags: ['analytics', 'privacy'],
  },
  {
    id: 'umami',
    name: 'Umami',
    description: 'Lightweight open-source analytics with clean dashboards and event tracking.',
    tags: ['analytics', 'privacy'],
  },
  {
    id: 'ghost',
    name: 'Ghost',
    description: 'Publishing platform for blogs, memberships, newsletters, and paid content.',
    tags: ['cms', 'blog', 'publishing'],
  },
  {
    id: 'wordpress-with-mariadb',
    name: 'WordPress + MariaDB',
    description: 'Full WordPress stack for websites, blogs, and marketing pages.',
    tags: ['cms', 'blog', 'mariadb'],
  },
  {
    id: 'nextcloud-with-postgres',
    name: 'Nextcloud + Postgres',
    description: 'File sync, sharing, office collaboration, and calendar stack.',
    tags: ['collaboration', 'storage', 'productivity', 'postgres'],
  },
  {
    id: 'gitea-with-postgresql',
    name: 'Gitea + PostgreSQL',
    description: 'Self-hosted Git platform with repos, issues, actions, and team workflows.',
    tags: ['git', 'devtool', 'postgres'],
  },
  {
    id: 'directus-with-postgresql',
    name: 'Directus + PostgreSQL',
    description: 'Headless CMS and data platform running on top of Postgres.',
    tags: ['cms', 'headless', 'database', 'postgres'],
  },
  {
    id: 'meilisearch',
    name: 'Meilisearch',
    description: 'Fast typo-tolerant search engine for apps, docs, and product catalogs.',
    tags: ['search', 'api'],
  },
  {
    id: 'vaultwarden',
    name: 'Vaultwarden',
    description: 'Bitwarden-compatible password manager for teams and personal vaults.',
    tags: ['security', 'passwords'],
  },
  {
    id: 'docuseal-with-postgres',
    name: 'DocuSeal + Postgres',
    description: 'Document signing and approval workflows with a built-in database.',
    tags: ['documents', 'signing', 'postgres'],
  },
] as const
