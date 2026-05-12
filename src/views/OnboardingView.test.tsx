import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import {
  createPrivateKey,
  createServer,
  listPrivateKeys,
  listServers,
  validateServer,
} from '../lib/api'
import { OnboardingView } from './OnboardingView'

vi.mock('../lib/api', async () => {
  const actual = await vi.importActual<typeof import('../lib/api')>('../lib/api')

  return {
    ...actual,
    createPrivateKey: vi.fn(),
    createServer: vi.fn(),
    listPrivateKeys: vi.fn(),
    listServers: vi.fn(),
    validateServer: vi.fn(),
  }
})

describe('OnboardingView', () => {
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
    vi.mocked(listPrivateKeys).mockResolvedValue([
      {
        uuid: 'key-1',
        name: 'Primary server key',
        fingerprint: 'SHA256:server-key',
        is_git_related: false,
      },
    ])
    vi.mocked(createPrivateKey).mockResolvedValue({ uuid: 'key-new' })
    vi.mocked(createServer).mockResolvedValue({ uuid: 'server-new' })
    vi.mocked(validateServer).mockResolvedValue({ message: 'Server validated' })
  })

  afterEach(() => {
    vi.clearAllMocks()
  })

  it('shows existing workspace servers when a server is already connected', async () => {
    render(<OnboardingView onNavigate={() => {}} />)

    await waitFor(() => {
      expect(screen.getByText('Deployment server ready')).toBeTruthy()
    })

    expect(screen.getByText('primary-vps')).toBeTruthy()
    expect(screen.getAllByText('root@203.0.113.10:22').length).toBeGreaterThan(0)
    expect(screen.queryByText('Connect your first server')).toBeNull()
  })

  it('surfaces backend loading errors without hiding the onboarding form', async () => {
    vi.mocked(listServers).mockRejectedValueOnce(new Error('Platform API 500'))

    render(<OnboardingView onNavigate={() => {}} />)

    await waitFor(() => {
      expect(screen.getByText(/Could not load existing servers/i)).toBeTruthy()
    })

    expect(screen.getByText(/Platform API 500/i)).toBeTruthy()
    expect(screen.getByText('Connect your first server')).toBeTruthy()
  })

  it('creates and validates a server with a saved SSH key before completing onboarding', async () => {
    const user = userEvent.setup()
    const onComplete = vi.fn()
    const onNavigate = vi.fn()

    vi.mocked(listServers).mockResolvedValue([])

    render(<OnboardingView onNavigate={onNavigate} onComplete={onComplete} />)

    await waitFor(() => {
      expect(screen.getByText(/No servers connected yet/i)).toBeTruthy()
    })
    await waitFor(() => {
      expect(screen.getByRole('combobox')).toBeTruthy()
    })

    await user.click(screen.getByRole('button', { name: 'Continue to dashboard' }))

    await waitFor(() => {
      expect(createServer).toHaveBeenCalledWith({
        name: 'primary-vps',
        ip: '203.0.113.10',
        port: 22,
        user: 'root',
        description: 'Region: Frankfurt',
        private_key_uuid: 'key-1',
      })
    })

    expect(createPrivateKey).not.toHaveBeenCalled()
    expect(validateServer).toHaveBeenCalledWith('server-new')
    await waitFor(() => {
      expect(onComplete).toHaveBeenCalledTimes(1)
      expect(onNavigate).toHaveBeenCalledWith('home')
    })
  })

  it('creates a new private key before creating the first server when no saved key exists', async () => {
    const user = userEvent.setup()
    const onComplete = vi.fn()
    const onNavigate = vi.fn()

    vi.mocked(listServers).mockResolvedValue([])
    vi.mocked(listPrivateKeys).mockResolvedValue([])

    render(<OnboardingView onNavigate={onNavigate} onComplete={onComplete} />)

    await waitFor(() => {
      expect(screen.getByPlaceholderText('Paste your OpenSSH private key')).toBeTruthy()
    })

    await user.type(
      screen.getByPlaceholderText('Paste your OpenSSH private key'),
      'mock-private-key-content',
    )

    await user.click(screen.getByRole('button', { name: 'Continue to dashboard' }))

    await waitFor(() => {
      expect(createPrivateKey).toHaveBeenCalledWith({
        name: 'primary-vps SSH key',
        description: 'SSH key created by CoolDev for primary-vps.',
        private_key: 'mock-private-key-content',
      })
    })

    expect(createServer).toHaveBeenCalledWith({
      name: 'primary-vps',
      ip: '203.0.113.10',
      port: 22,
      user: 'root',
      description: 'Region: Frankfurt',
      private_key_uuid: 'key-new',
    })
    expect(validateServer).toHaveBeenCalledWith('server-new')
    await waitFor(() => {
      expect(onComplete).toHaveBeenCalledTimes(1)
      expect(onNavigate).toHaveBeenCalledWith('home')
    })
  })

  it('opens the deploy wizard when onboarding is already satisfied by an existing server', async () => {
    const user = userEvent.setup()
    const onComplete = vi.fn()
    const onNavigate = vi.fn()

    render(<OnboardingView onNavigate={onNavigate} onComplete={onComplete} />)

    await waitFor(() => {
      expect(screen.getByText('Deployment server ready')).toBeTruthy()
    })

    await user.click(screen.getByRole('button', { name: 'Open deploy wizard' }))

    expect(onComplete).toHaveBeenCalledTimes(1)
    expect(onNavigate).toHaveBeenCalledWith('new')
    expect(createServer).not.toHaveBeenCalled()
  })

  it('surfaces server validation errors and does not complete onboarding', async () => {
    const user = userEvent.setup()
    const onComplete = vi.fn()

    vi.mocked(listServers).mockResolvedValue([])
    vi.mocked(validateServer).mockRejectedValueOnce(new Error('SSH validation failed'))

    render(<OnboardingView onNavigate={() => {}} onComplete={onComplete} />)

    await waitFor(() => {
      expect(screen.getByText(/No servers connected yet/i)).toBeTruthy()
    })
    await waitFor(() => {
      expect(screen.getByRole('combobox')).toBeTruthy()
    })

    await user.click(screen.getByRole('button', { name: 'Continue to dashboard' }))

    await waitFor(() => {
      expect(screen.getByText(/Could not connect the server/i)).toBeTruthy()
    })

    expect(screen.getByText(/SSH validation failed/i)).toBeTruthy()
    expect(onComplete).not.toHaveBeenCalled()
  })
})
