export type TemplateCategory = 'database' | 'service'

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
