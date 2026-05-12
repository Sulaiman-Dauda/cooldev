import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import {
  ApiError,
  createApplicationBulkEnvs,
  createComposeService,
  createDatabaseBackup,
  createManagedDatabase,
  createPrivateDeployKeyApplication,
  createPrivateGithubAppApplication,
  createPrivateKey,
  createProject,
  createProjectEnvironment,
  createPublicApplication,
  listGithubApps,
  listPrivateKeys,
  listProjectEnvironments,
  listProjects,
  listServers,
} from '../lib/api'
import { DeployWizardView } from './DeployWizardView'

vi.mock('../lib/api', async () => {
  const actual = await vi.importActual<typeof import('../lib/api')>('../lib/api')

  return {
    ...actual,
    createApplicationBulkEnvs: vi.fn(),
    createComposeService: vi.fn(),
    createDatabaseBackup: vi.fn(),
    createManagedDatabase: vi.fn(),
    createPrivateDeployKeyApplication: vi.fn(),
    createPrivateGithubAppApplication: vi.fn(),
    createPrivateKey: vi.fn(),
    createProject: vi.fn(),
    createProjectEnvironment: vi.fn(),
    createPublicApplication: vi.fn(),
    listGithubApps: vi.fn(),
    listPrivateKeys: vi.fn(),
    listProjectEnvironments: vi.fn(),
    listProjects: vi.fn(),
    listServers: vi.fn(),
  }
})

describe('DeployWizardView', () => {
  beforeEach(() => {
    vi.mocked(listServers).mockResolvedValue([
      {
        uuid: 'server-1',
        name: 'primary-vps',
        ip: '203.0.113.10',
        port: 22,
        user: 'root',
      },
    ])
    vi.mocked(listProjects).mockResolvedValue([])
    vi.mocked(createProject).mockResolvedValue({
      uuid: 'project-1',
      name: 'CoolDev',
      description: 'Default project created by CoolDev.',
    })
    vi.mocked(listProjectEnvironments).mockResolvedValue([])
    vi.mocked(createProjectEnvironment).mockResolvedValue({
      uuid: 'env-1',
      name: 'production',
    })
    vi.mocked(createDatabaseBackup).mockResolvedValue({ message: 'Backup created.' })
    vi.mocked(createManagedDatabase).mockResolvedValue({ uuid: 'db-1' })
    vi.mocked(createPrivateDeployKeyApplication).mockResolvedValue({ uuid: 'app-private-key-1' })
    vi.mocked(createPrivateGithubAppApplication).mockResolvedValue({ uuid: 'app-private-gh-1' })
    vi.mocked(createPrivateKey).mockResolvedValue({ uuid: 'key-new' })
    vi.mocked(createPublicApplication).mockResolvedValue({ uuid: 'app-1' })
    vi.mocked(createApplicationBulkEnvs).mockResolvedValue(undefined)
    vi.mocked(createComposeService).mockResolvedValue({ uuid: 'svc-1' })
    vi.mocked(listGithubApps).mockResolvedValue([
      {
        uuid: 'gh-app-1',
        name: 'Acme GitHub App',
      },
    ])
    vi.mocked(listPrivateKeys).mockResolvedValue([
      {
        uuid: 'key-1',
        name: 'Deploy key',
      },
    ])
  })

  afterEach(() => {
    vi.clearAllMocks()
  })

  it('creates a managed database before opening deployments', async () => {
    const user = userEvent.setup()
    const onNavigate = vi.fn()

    render(<DeployWizardView onNavigate={onNavigate} />)

    await user.click(screen.getByRole('button', { name: /Database/i }))
    await user.click(screen.getByRole('button', { name: 'Continue' }))
    await user.click(screen.getByRole('button', { name: 'Deploy now' }))

    await waitFor(() => {
      expect(createManagedDatabase).toHaveBeenCalledWith('postgres', {
        server_uuid: 'server-1',
        project_uuid: 'project-1',
        environment_name: 'production',
        environment_uuid: 'env-1',
        name: 'postgres-db',
        instant_deploy: true,
      })
    })

    expect(createDatabaseBackup).toHaveBeenCalledWith('db-1', {
      frequency: 'daily',
      enabled: true,
      dump_all: true,
      save_s3: false,
    })

    expect(onNavigate).toHaveBeenCalledWith('deployments')
  })

  it('creates a public Git application with sane defaults', async () => {
    const user = userEvent.setup()
    const onNavigate = vi.fn()

    render(<DeployWizardView onNavigate={onNavigate} />)

    await user.click(screen.getByRole('button', { name: /Application/i }))
    await user.click(screen.getByRole('button', { name: 'Git URL' }))
    await user.click(screen.getByRole('button', { name: 'Continue' }))
    await user.click(screen.getByRole('button', { name: 'Deploy now' }))

    await waitFor(() => {
      expect(createPublicApplication).toHaveBeenCalledWith({
        server_uuid: 'server-1',
        project_uuid: 'project-1',
        environment_name: 'production',
        environment_uuid: 'env-1',
        name: 'my-app',
        git_repository: 'https://github.com/acme/marketing-site',
        git_branch: 'main',
        build_pack: 'nixpacks',
        ports_exposes: '80',
        domains: undefined,
        instant_deploy: true,
      })
    })

    expect(onNavigate).toHaveBeenCalledWith('deployments')
  })

  it('normalizes a bare application domain to an https URL before deploying', async () => {
    const user = userEvent.setup()
    const onNavigate = vi.fn()

    render(<DeployWizardView onNavigate={onNavigate} />)

    await user.click(screen.getByRole('button', { name: /Application/i }))
    await user.click(screen.getByRole('button', { name: 'Git URL' }))
    await user.type(screen.getByPlaceholderText('app.example.com'), 'deploytest.backnd.top')
    await user.click(screen.getByRole('button', { name: 'Continue' }))
    await user.click(screen.getByRole('button', { name: 'Deploy now' }))

    await waitFor(() => {
      expect(createPublicApplication).toHaveBeenCalledWith({
        server_uuid: 'server-1',
        project_uuid: 'project-1',
        environment_name: 'production',
        environment_uuid: 'env-1',
        name: 'my-app',
        git_repository: 'https://github.com/acme/marketing-site',
        git_branch: 'main',
        build_pack: 'nixpacks',
        ports_exposes: '80',
        domains: 'https://deploytest.backnd.top',
        instant_deploy: true,
      })
    })

    expect(onNavigate).toHaveBeenCalledWith('deployments')
  })

  it('shows domain conflicts clearly and lets the user force the deploy', async () => {
    const user = userEvent.setup()
    const onNavigate = vi.fn()

    vi.mocked(createPublicApplication)
      .mockRejectedValueOnce(
        new ApiError(409, 'Platform API 409: Domain conflicts detected.', {
          message: 'Domain conflicts detected. Use force_domain_override=true to proceed.',
          warning: 'Using the same domain for multiple resources can cause routing conflicts and unpredictable behavior.',
          conflicts: [
            {
              domain: 'app.example.com',
              resource_name: 'marketing-site',
              resource_uuid: 'app-123',
              resource_type: 'application',
              message: "Domain app.example.com is already in use by application 'marketing-site'",
            },
          ],
        }),
      )
      .mockResolvedValueOnce({ uuid: 'app-1' })

    render(<DeployWizardView onNavigate={onNavigate} />)

    await user.click(screen.getByRole('button', { name: /Application/i }))
    await user.click(screen.getByRole('button', { name: 'Git URL' }))
    await user.click(screen.getByRole('button', { name: 'Continue' }))
    await user.type(screen.getByPlaceholderText('app.example.com'), 'app.example.com')
    await user.click(screen.getByRole('button', { name: 'Deploy now' }))

    await waitFor(() => {
      expect(screen.getByText(/Domain conflict detected/i)).toBeTruthy()
    })

    expect(screen.getByText(/marketing-site/i)).toBeTruthy()
    expect(screen.getAllByText(/app.example.com/i).length).toBeGreaterThan(0)

    await user.click(screen.getByRole('button', { name: 'Deploy anyway' }))

    await waitFor(() => {
      expect(createPublicApplication).toHaveBeenNthCalledWith(2, {
        server_uuid: 'server-1',
        project_uuid: 'project-1',
        environment_name: 'production',
        environment_uuid: 'env-1',
        name: 'my-app',
        git_repository: 'https://github.com/acme/marketing-site',
        git_branch: 'main',
        build_pack: 'nixpacks',
        ports_exposes: '80',
        domains: 'https://app.example.com',
        instant_deploy: true,
        force_domain_override: true,
      })
    })

    expect(onNavigate).toHaveBeenCalledWith('deployments')
  })

  it('applies advanced app controls and creates environment variables after app creation', async () => {
    const user = userEvent.setup()
    const onNavigate = vi.fn()

    render(<DeployWizardView onNavigate={onNavigate} />)

    await user.click(screen.getByRole('button', { name: /Application/i }))
    await user.click(screen.getByRole('button', { name: 'Git URL' }))
    await user.click(screen.getByRole('button', { name: 'Continue' }))
    await user.click(screen.getByRole('button', { name: 'Reveal' }))

    await user.type(screen.getByPlaceholderText('80'), '3000,8080')
    await user.type(screen.getByPlaceholderText('pnpm build'), 'npm run build:prod')
    await user.type(screen.getByPlaceholderText('/health'), '/ready')
    await user.type(
      screen.getByPlaceholderText(/NODE_ENV=production/),
      'NODE_ENV=production\nAPI_URL=https://api.example.com',
    )

    await user.click(screen.getByRole('button', { name: 'Deploy now' }))

    await waitFor(() => {
      expect(createPublicApplication).toHaveBeenCalledWith({
        server_uuid: 'server-1',
        project_uuid: 'project-1',
        environment_name: 'production',
        environment_uuid: 'env-1',
        name: 'my-app',
        git_repository: 'https://github.com/acme/marketing-site',
        git_branch: 'main',
        build_pack: 'nixpacks',
        ports_exposes: '3000,8080',
        build_command: 'npm run build:prod',
        health_check_enabled: true,
        health_check_path: '/ready',
        domains: undefined,
        instant_deploy: true,
      })
    })

    expect(createApplicationBulkEnvs).toHaveBeenCalledWith('app-1', [
      {
        key: 'NODE_ENV',
        value: 'production',
        is_literal: true,
        is_preview: false,
        is_multiline: false,
        is_shown_once: false,
      },
      {
        key: 'API_URL',
        value: 'https://api.example.com',
        is_literal: true,
        is_preview: false,
        is_multiline: false,
        is_shown_once: false,
      },
    ])
    expect(onNavigate).toHaveBeenCalledWith('deployments')
  })

  it('shows a validation error for malformed environment variables before deploying', async () => {
    const user = userEvent.setup()

    render(<DeployWizardView onNavigate={() => {}} />)

    await user.click(screen.getByRole('button', { name: /Application/i }))
    await user.click(screen.getByRole('button', { name: 'Git URL' }))
    await user.click(screen.getByRole('button', { name: 'Continue' }))
    await user.click(screen.getByRole('button', { name: 'Reveal' }))
    await user.type(
      screen.getByPlaceholderText(/NODE_ENV=production/),
      'INVALID_LINE',
    )

    await user.click(screen.getByRole('button', { name: 'Deploy now' }))

    await waitFor(() => {
      expect(screen.getByText(/Environment variables must use KEY=value format/i)).toBeTruthy()
    })

    expect(createPublicApplication).not.toHaveBeenCalled()
    expect(createApplicationBulkEnvs).not.toHaveBeenCalled()
  })

  it('deploys to the selected server, project, and environment', async () => {
    const user = userEvent.setup()
    const onNavigate = vi.fn()

    vi.mocked(listServers).mockResolvedValue([
      {
        uuid: 'server-1',
        name: 'primary-vps',
        ip: '203.0.113.10',
        port: 22,
        user: 'root',
      },
      {
        uuid: 'server-2',
        name: 'backup-vps',
        ip: '203.0.113.20',
        port: 22,
        user: 'ubuntu',
      },
    ])
    vi.mocked(listProjects).mockResolvedValue([
      { uuid: 'project-1', name: 'Core Apps' },
      { uuid: 'project-2', name: 'Client Apps' },
    ])
    vi.mocked(listProjectEnvironments).mockImplementation(async (projectUuid: string) => {
      if (projectUuid === 'project-2') {
        return [{ uuid: 'env-2', name: 'staging' }]
      }

      return [{ uuid: 'env-1', name: 'production' }]
    })

    render(<DeployWizardView onNavigate={onNavigate} />)

    await user.click(screen.getByRole('button', { name: /Database/i }))
    await user.click(screen.getByRole('button', { name: 'Continue' }))

    await waitFor(() => {
      expect(screen.getAllByRole('combobox').length).toBeGreaterThanOrEqual(3)
    })

    const [serverSelect, projectSelect] = screen.getAllByRole('combobox')
    await user.selectOptions(serverSelect, 'server-2')
    await user.selectOptions(projectSelect, 'project-2')

    await waitFor(() => {
      expect(screen.getByText(/Deploy into staging/i)).toBeTruthy()
    })

    const environmentSelect = screen.getAllByRole('combobox')[2]
    await user.selectOptions(environmentSelect, 'env-2')
    await user.click(screen.getByRole('button', { name: 'Deploy now' }))

    await waitFor(() => {
      expect(createManagedDatabase).toHaveBeenCalledWith('postgres', {
        server_uuid: 'server-2',
        project_uuid: 'project-2',
        environment_name: 'staging',
        environment_uuid: 'env-2',
        name: 'postgres-db',
        instant_deploy: true,
      })
    })

    expect(createProject).not.toHaveBeenCalled()
    expect(onNavigate).toHaveBeenCalledWith('deployments')
  })

  it('creates a new project and environment from the review step', async () => {
    const user = userEvent.setup()
    const onNavigate = vi.fn()

    vi.mocked(listProjects).mockResolvedValue([])
    vi.mocked(createProject).mockResolvedValue({
      uuid: 'project-new',
      name: 'Client Apps',
      description: 'Created by CoolDev from the deploy wizard.',
    })
    vi.mocked(createProjectEnvironment).mockResolvedValue({
      uuid: 'env-new',
      name: 'preview',
    })

    render(<DeployWizardView onNavigate={onNavigate} />)

    await user.click(screen.getByRole('button', { name: /Database/i }))
    await user.click(screen.getByRole('button', { name: 'Continue' }))

    await waitFor(() => {
      expect(screen.getByLabelText('New project name')).toBeTruthy()
    })

    await user.clear(screen.getByLabelText('New project name'))
    await user.type(screen.getByLabelText('New project name'), 'Client Apps')
    await user.clear(screen.getByLabelText('Environment name'))
    await user.type(screen.getByLabelText('Environment name'), 'preview')
    await user.click(screen.getByRole('button', { name: 'Deploy now' }))

    await waitFor(() => {
      expect(createProject).toHaveBeenCalledWith({
        name: 'Client Apps',
        description: 'Created by CoolDev from the deploy wizard.',
      })
    })

    expect(createProjectEnvironment).toHaveBeenCalledWith('project-new', { name: 'preview' })
    expect(createManagedDatabase).toHaveBeenCalledWith('postgres', {
      server_uuid: 'server-1',
      project_uuid: 'project-new',
      environment_name: 'preview',
      environment_uuid: 'env-new',
      name: 'postgres-db',
      instant_deploy: true,
    })
    expect(onNavigate).toHaveBeenCalledWith('deployments')
  })

  it('reuses the default environment that already exists on a newly created project', async () => {
    const user = userEvent.setup()
    const onNavigate = vi.fn()

    vi.mocked(listProjects).mockResolvedValue([])
    vi.mocked(createProject).mockResolvedValue({
      uuid: 'project-seeded',
      name: 'CoolDev',
      description: 'Created by CoolDev from the deploy wizard.',
    })
    vi.mocked(listProjectEnvironments).mockImplementation(async (projectUuid: string) => {
      if (projectUuid === 'project-seeded') {
        return [{ uuid: 'env-seeded', name: 'production' }]
      }

      return []
    })

    render(<DeployWizardView onNavigate={onNavigate} />)

    await user.click(screen.getByRole('button', { name: /Application/i }))
    await user.click(screen.getByRole('button', { name: 'Git URL' }))
    await user.click(screen.getByRole('button', { name: 'Continue' }))
    await user.click(screen.getByRole('button', { name: 'Deploy now' }))

    await waitFor(() => {
      expect(createPublicApplication).toHaveBeenCalledWith({
        server_uuid: 'server-1',
        project_uuid: 'project-seeded',
        environment_name: 'production',
        environment_uuid: 'env-seeded',
        name: 'my-app',
        git_repository: 'https://github.com/acme/marketing-site',
        git_branch: 'main',
        build_pack: 'nixpacks',
        ports_exposes: '80',
        domains: undefined,
        instant_deploy: true,
      })
    })

    expect(createProjectEnvironment).not.toHaveBeenCalled()
    expect(onNavigate).toHaveBeenCalledWith('deployments')
  })

  it('creates a starter application from the selected template', async () => {
    const user = userEvent.setup()
    const onNavigate = vi.fn()

    render(<DeployWizardView onNavigate={onNavigate} />)

    await user.click(screen.getByRole('button', { name: /Application/i }))
    await user.click(screen.getByRole('button', { name: /Next\.js/i }))
    await user.click(screen.getByRole('button', { name: 'Continue' }))
    await user.click(screen.getByRole('button', { name: 'Deploy now' }))

    await waitFor(() => {
      expect(createPublicApplication).toHaveBeenCalledWith({
        server_uuid: 'server-1',
        project_uuid: 'project-1',
        environment_name: 'production',
        environment_uuid: 'env-1',
        name: 'nextjs',
        git_repository: 'https://github.com/vercel/next.js',
        git_branch: 'canary',
        build_pack: 'nixpacks',
        ports_exposes: '3000',
        domains: undefined,
        instant_deploy: true,
      })
    })

    expect(onNavigate).toHaveBeenCalledWith('deployments')
  })

  it('creates a compose-backed service from the pasted compose file', async () => {
    const user = userEvent.setup()
    const onNavigate = vi.fn()

    render(<DeployWizardView onNavigate={onNavigate} />)

    await user.click(screen.getByRole('button', { name: /Compose stack/i }))
    await user.click(screen.getByRole('button', { name: 'Continue' }))
    await user.click(screen.getByRole('button', { name: 'Deploy now' }))

    await waitFor(() => {
      expect(createComposeService).toHaveBeenCalledWith({
        server_uuid: 'server-1',
        project_uuid: 'project-1',
        environment_name: 'production',
        environment_uuid: 'env-1',
        name: 'my-stack',
        docker_compose_raw: expect.stringContaining('services:'),
        instant_deploy: true,
      })
    })

    expect(onNavigate).toHaveBeenCalledWith('deployments')
  })

  it('creates a private GitHub application through the connected GitHub App', async () => {
    const user = userEvent.setup()
    const onNavigate = vi.fn()

    render(<DeployWizardView onNavigate={onNavigate} />)

    await user.click(screen.getByRole('button', { name: /Application/i }))
    await user.click(screen.getByRole('button', { name: 'Git URL' }))
    await user.click(screen.getByRole('button', { name: 'Private' }))
    await waitFor(() => {
      expect(screen.getByDisplayValue('Acme GitHub App')).toBeTruthy()
    })
    await user.click(screen.getByRole('button', { name: 'Continue' }))
    await user.click(screen.getByRole('button', { name: 'Deploy now' }))

    await waitFor(() => {
      expect(createPrivateGithubAppApplication).toHaveBeenCalledWith({
        server_uuid: 'server-1',
        project_uuid: 'project-1',
        environment_name: 'production',
        environment_uuid: 'env-1',
        github_app_uuid: 'gh-app-1',
        name: 'my-app',
        git_repository: 'https://github.com/acme/marketing-site',
        git_branch: 'main',
        build_pack: 'nixpacks',
        ports_exposes: '80',
        domains: undefined,
        instant_deploy: true,
      })
    })

    expect(onNavigate).toHaveBeenCalledWith('deployments')
  })

  it('can switch a private GitHub deployment to a saved SSH key instead of a GitHub App', async () => {
    const user = userEvent.setup()
    const onNavigate = vi.fn()

    render(<DeployWizardView onNavigate={onNavigate} />)

    await user.click(screen.getByRole('button', { name: /Application/i }))
    await user.click(screen.getByRole('button', { name: 'Git URL' }))
    await user.click(screen.getByRole('button', { name: 'Private' }))
    await waitFor(() => {
      expect(screen.getByDisplayValue('Acme GitHub App')).toBeTruthy()
    })

    await user.click(screen.getByRole('button', { name: 'Saved SSH key' }))

    await waitFor(() => {
      expect(screen.getByDisplayValue('Deploy key')).toBeTruthy()
    })

    await user.click(screen.getByRole('button', { name: 'Continue' }))
    await user.click(screen.getByRole('button', { name: 'Deploy now' }))

    await waitFor(() => {
      expect(createPrivateDeployKeyApplication).toHaveBeenCalledWith({
        server_uuid: 'server-1',
        project_uuid: 'project-1',
        environment_name: 'production',
        environment_uuid: 'env-1',
        private_key_uuid: 'key-1',
        name: 'my-app',
        git_repository: 'https://github.com/acme/marketing-site',
        git_branch: 'main',
        build_pack: 'nixpacks',
        ports_exposes: '80',
        domains: undefined,
        instant_deploy: true,
      })
    })

    expect(createPrivateGithubAppApplication).not.toHaveBeenCalled()
    expect(onNavigate).toHaveBeenCalledWith('deployments')
  })

  it('creates a private non-GitHub application through a saved deploy key', async () => {
    const user = userEvent.setup()
    const onNavigate = vi.fn()

    render(<DeployWizardView onNavigate={onNavigate} />)

    await user.click(screen.getByRole('button', { name: /Application/i }))
    await user.click(screen.getByRole('button', { name: 'Git URL' }))
    await user.clear(screen.getByPlaceholderText('https://github.com/acme/app'))
    await user.type(screen.getByPlaceholderText('https://github.com/acme/app'), 'git@git.example.com:acme/private-app.git')
    await user.click(screen.getByRole('button', { name: 'Private' }))
    await waitFor(() => {
      expect(screen.getByDisplayValue('Deploy key')).toBeTruthy()
    })
    await user.click(screen.getByRole('button', { name: 'Continue' }))
    await user.click(screen.getByRole('button', { name: 'Deploy now' }))

    await waitFor(() => {
      expect(createPrivateDeployKeyApplication).toHaveBeenCalledWith({
        server_uuid: 'server-1',
        project_uuid: 'project-1',
        environment_name: 'production',
        environment_uuid: 'env-1',
        private_key_uuid: 'key-1',
        name: 'my-app',
        git_repository: 'git@git.example.com:acme/private-app.git',
        git_branch: 'main',
        build_pack: 'nixpacks',
        ports_exposes: '80',
        domains: undefined,
        instant_deploy: true,
      })
    })

    expect(onNavigate).toHaveBeenCalledWith('deployments')
  })

  it('creates a new deploy key inline when no saved private repo credentials exist', async () => {
    const user = userEvent.setup()
    const onNavigate = vi.fn()

    vi.mocked(listPrivateKeys).mockResolvedValue([])
    vi.mocked(listGithubApps).mockResolvedValue([])

    render(<DeployWizardView onNavigate={onNavigate} />)

    await user.click(screen.getByRole('button', { name: /Application/i }))
    await user.click(screen.getByRole('button', { name: 'Git URL' }))
    await user.clear(screen.getByPlaceholderText('https://github.com/acme/app'))
    await user.type(screen.getByPlaceholderText('https://github.com/acme/app'), 'git@git.example.com:acme/private-app.git')
    await user.click(screen.getByRole('button', { name: 'Private' }))

    await waitFor(() => {
      expect(screen.getByPlaceholderText('Paste your OpenSSH private key')).toBeTruthy()
    })

    await user.type(
      screen.getByPlaceholderText('Paste your OpenSSH private key'),
      'mock-private-key-content',
    )

    await user.click(screen.getByRole('button', { name: 'Continue' }))
    await user.click(screen.getByRole('button', { name: 'Deploy now' }))

    await waitFor(() => {
      expect(createPrivateKey).toHaveBeenCalledWith({
        name: 'my-app deploy key',
        description: 'Deploy key created by CoolDev for my-app.',
        private_key: 'mock-private-key-content',
      })
    })

    expect(createPrivateDeployKeyApplication).toHaveBeenCalledWith({
      server_uuid: 'server-1',
      project_uuid: 'project-1',
      environment_name: 'production',
      environment_uuid: 'env-1',
      private_key_uuid: 'key-new',
      name: 'my-app',
      git_repository: 'git@git.example.com:acme/private-app.git',
      git_branch: 'main',
      build_pack: 'nixpacks',
      ports_exposes: '80',
      domains: undefined,
      instant_deploy: true,
    })
    expect(onNavigate).toHaveBeenCalledWith('deployments')
  })
})
