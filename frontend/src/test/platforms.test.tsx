import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { cleanup, render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { SubmissionReadiness } from '@/components/SubmissionReadiness'
import { evaluateApplicationPolicy, getPlatforms, requestApplicationHandoff } from '@/services/platforms'

afterEach(() => {
  cleanup()
  vi.unstubAllGlobals()
  vi.restoreAllMocks()
})

function stubFetch(payload: unknown, status = 200) {
  vi.stubGlobal(
    'fetch',
    vi.fn().mockResolvedValue({
      status,
      json: async () => payload,
    }),
  )
}

const PLATFORM_LIST = {
  platforms: [
    {
      platform: 'linkedin',
      displayName: 'LinkedIn',
      capabilities: {
        discovery: { status: 'unsupported' },
        detail: { status: 'unsupported' },
        questions: { status: 'unsupported' },
        prepare: { status: 'supported' },
        upload: { status: 'unavailable' },
        submit: { status: 'unsupported' },
        verify: { status: 'unavailable' },
        handoff: { status: 'supported' },
      },
      lastReviewed: '2026-10-09',
    },
  ],
}

function renderReadiness(status = 'APPROVED') {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  return render(
    <QueryClientProvider client={client}>
      <SubmissionReadiness applicationId="app-1" status={status} onChanged={() => {}} />
    </QueryClientProvider>,
  )
}

describe('platform services', () => {
  it('parses the capability matrix, policy decisions, and handoffs', async () => {
    stubFetch({ success: true, data: PLATFORM_LIST })
    await expect(getPlatforms()).resolves.toHaveLength(1)

    stubFetch({ success: true, data: { decision: 'manual_only', reasons: ['No auto path'], platform: 'linkedin' } })
    await expect(evaluateApplicationPolicy('app-1', 'linkedin')).resolves.toMatchObject({ decision: 'manual_only' })

    stubFetch({
      success: true,
      data: { application: {}, handoff: { applicationUrl: 'https://example.com/a', instructions: ['Open it'], status: 'NEEDS_MANUAL_ACTION' } },
    })
    await expect(requestApplicationHandoff('app-1')).resolves.toMatchObject({
      applicationUrl: 'https://example.com/a',
    })
  })
})

describe('SubmissionReadiness', () => {
  it('shows platform submit status and explains manual-only decisions', async () => {
    const user = userEvent.setup()
    stubFetch({ success: true, data: PLATFORM_LIST })
    renderReadiness()

    expect(await screen.findByText(/LinkedIn — apply: unsupported/)).toBeInTheDocument()

    stubFetch({
      success: true,
      data: { decision: 'manual_only', reasons: ['No verified automatic submission'], platform: 'linkedin' },
    })
    await user.click(screen.getByRole('button', { name: 'Check policy' }))

    expect(await screen.findByText('Manual handoff only')).toBeInTheDocument()
    expect(screen.getByText('No verified automatic submission')).toBeInTheDocument()
  })

  it('opens the platform page and shows handoff instructions without claiming submission', async () => {
    const user = userEvent.setup()
    const opened: string[] = []
    vi.spyOn(window, 'open').mockImplementation(((url: string) => {
      opened.push(url)
      return null
    }) as typeof window.open)
    stubFetch({ success: true, data: PLATFORM_LIST })
    renderReadiness('APPROVED')
    await screen.findByText(/LinkedIn — apply: unsupported/)

    stubFetch({
      success: true,
      data: {
        application: {},
        handoff: {
          applicationUrl: 'https://example.com/apply/9',
          instructions: ['Open the employer page', 'Submit there yourself'],
          status: 'NEEDS_MANUAL_ACTION',
        },
      },
    })
    await user.click(screen.getByRole('button', { name: 'Open application page' }))

    expect(await screen.findByText('Open the employer page')).toBeInTheDocument()
    expect(opened).toEqual(['https://example.com/apply/9'])
    expect(screen.queryByText(/submitted/i)).not.toBeInTheDocument()
  })

  it('hides handoff for draft applications', async () => {
    stubFetch({ success: true, data: PLATFORM_LIST })
    renderReadiness('DRAFT')
    await screen.findByText(/LinkedIn — apply: unsupported/)
    expect(screen.queryByRole('button', { name: 'Open application page' })).not.toBeInTheDocument()
  })
})
