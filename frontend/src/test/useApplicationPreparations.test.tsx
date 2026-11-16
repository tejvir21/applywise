/** useApplicationPreparations hook tests (Phase 8.3.13).
 *
 * The service layer is mocked so no HTTP fetch is involved.
 */

import { act, renderHook, waitFor } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { afterEach, describe, expect, it, vi } from 'vitest'
import {
  usePreparations,
  usePreparation,
  useStartPreparation,
  useGenerateTailoredResume,
  useGenerateCoverLetter,
  useGenerateAnswers,
  useUpdateAnswer,
  useReviewPreparation,
  useSavePreparation,
  useCancelPreparation,
} from '@/hooks/useApplicationPreparations'
import {
  startPreparation,
  listPreparations,
  getPreparation,
  savePreparation,
  generateTailoredResume,
  generateCoverLetter,
  generateAnswers,
  updateAnswer,
  reviewPreparation,
  cancelPreparation,
  type StartPreparationResult,
  type ApplicationPreparation,
  type PreparationsPage,
} from '@/services/application-preparations'

vi.mock('@/services/application-preparations', () => ({
  startPreparation: vi.fn(),
  listPreparations: vi.fn(),
  getPreparation: vi.fn(),
  savePreparation: vi.fn(),
  generateTailoredResume: vi.fn(),
  generateCoverLetter: vi.fn(),
  generateAnswers: vi.fn(),
  updateAnswer: vi.fn(),
  reviewPreparation: vi.fn(),
  cancelPreparation: vi.fn(),
}))

const PREPARATION: ApplicationPreparation = {
  id: 'prep-1',
  userId: 'user-1',
  jobId: 'job-1',
  jobSnapshot: { title: 'Senior Software Engineer', companyName: 'TechCorp' },
  resumeId: 'resume-1',
  resumeVersion: 1,
  status: 'DRAFT',
  missingInformation: [],
  tailoredResume: undefined,
  coverLetter: undefined,
  answers: [],
  createdAt: '2026-01-01T00:00:00.000Z',
  updatedAt: '2026-01-01T00:00:00.000Z',
}

const PREPARATIONS_PAGE: PreparationsPage = {
  preparations: [PREPARATION],
  total: 1,
  page: 1,
  pageSize: 20,
  totalPages: 1,
}

const START_RESULT: StartPreparationResult = {
  preparationId: 'prep-1',
  status: 'DRAFT',
  job: { id: 'job-1', title: 'Senior Software Engineer', companyName: 'TechCorp' },
  readiness: {
    ready: false,
    missingRequiredProfileFields: ['personal', 'professional', 'skills'],
    missingRecommendedProfileFields: ['experience', 'education'],
    matchedSkills: [],
    missingSkills: [],
  },
  missingInformation: ['personal', 'professional', 'skills'],
}

function makeWrapper() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  return ({ children }: { children: React.ReactNode }) => (
    <QueryClientProvider client={client}>{children}</QueryClientProvider>
  )
}

describe('usePreparations', () => {
  afterEach(() => {
    vi.mocked(listPreparations).mockReset()
  })

  it('lists preparations for the candidate', async () => {
    vi.mocked(listPreparations).mockResolvedValue(PREPARATIONS_PAGE)
    const wrapper = makeWrapper()
    const { result } = renderHook(() => usePreparations({ status: 'DRAFT', page: 1, pageSize: 20 }), { wrapper })
    await waitFor(() => expect(result.current.isSuccess).toBe(true))
    expect(vi.mocked(listPreparations)).toHaveBeenCalledWith({
      status: 'DRAFT',
      page: 1,
      pageSize: 20,
    })
    expect(result.current.data).toEqual(PREPARATIONS_PAGE)
  })
})

describe('usePreparation', () => {
  afterEach(() => {
    vi.mocked(getPreparation).mockReset()
  })

  it('gets preparation details by id', async () => {
    vi.mocked(getPreparation).mockResolvedValue(PREPARATION)
    const wrapper = makeWrapper()
    const { result } = renderHook(() => usePreparation('prep-1'), { wrapper })
    await waitFor(() => expect(result.current.isSuccess).toBe(true))
    expect(vi.mocked(getPreparation)).toHaveBeenCalledWith('prep-1')
    expect(result.current.data).toEqual(PREPARATION)
  })

  it('does not execute without a preparation id', () => {
    const wrapper = makeWrapper()
    const { result } = renderHook(() => usePreparation(undefined), { wrapper })
    expect(result.current.data).toBeUndefined()
    expect(vi.mocked(getPreparation)).not.toHaveBeenCalled()
  })
})

describe('useStartPreparation', () => {
  afterEach(() => {
    vi.mocked(startPreparation).mockReset()
  })

  it('starts preparation for a job', async () => {
    vi.mocked(startPreparation).mockResolvedValue(START_RESULT)
    const wrapper = makeWrapper()
    const { result } = renderHook(() => useStartPreparation(), { wrapper })
    await act(async () => {
      await result.current.mutateAsync({ jobId: 'job-1', resumeId: 'resume-1' })
    })
    expect(vi.mocked(startPreparation)).toHaveBeenCalledWith('job-1', 'resume-1')
  })
})

describe('useGenerateTailoredResume', () => {
  afterEach(() => {
    vi.mocked(generateTailoredResume).mockReset()
  })

  it('generates tailored resume', async () => {
    const tailoredResume = {
      summary: 'Experienced engineer',
      highlights: ['Built scalable systems'],
      skillsUsed: ['TypeScript', 'Node.js'],
      flaggedGaps: [],
      generatedAt: '2026-01-01T00:00:00.000Z',
      reviewStatus: 'PENDING' as const,
    }
    vi.mocked(generateTailoredResume).mockResolvedValue({
      tailoredResume,
      provider: 'mock',
      model: 'mock-model',
    })
    const wrapper = makeWrapper()
    const { result } = renderHook(() => useGenerateTailoredResume(), { wrapper })
    await act(async () => {
      await result.current.mutateAsync({ preparationId: 'prep-1', replace: false })
    })
    expect(vi.mocked(generateTailoredResume)).toHaveBeenCalledWith('prep-1', {
      replace: false,
    })
  })
})

describe('useGenerateCoverLetter', () => {
  afterEach(() => {
    vi.mocked(generateCoverLetter).mockReset()
  })

  it('generates cover letter', async () => {
    const coverLetter = {
      body: 'Dear Hiring Manager,',
      flaggedGaps: [],
      generatedAt: '2026-01-01T00:00:00.000Z',
      reviewStatus: 'PENDING' as const,
    }
    vi.mocked(generateCoverLetter).mockResolvedValue({
      coverLetter,
      provider: 'mock',
      model: 'mock-model',
    })
    const wrapper = makeWrapper()
    const { result } = renderHook(() => useGenerateCoverLetter(), { wrapper })
    await act(async () => {
      await result.current.mutateAsync({ preparationId: 'prep-1', replace: false })
    })
    expect(vi.mocked(generateCoverLetter)).toHaveBeenCalledWith('prep-1', {
      replace: false,
    })
  })
})

describe('useGenerateAnswers', () => {
  afterEach(() => {
    vi.mocked(generateAnswers).mockReset()
  })

  it('generates answers for questions', async () => {
    const answers = [
      {
        _id: 'ans-1',
        question: 'What is your experience with TypeScript?',
        answer: '5 years of professional TypeScript experience.',
        verified: false,
        sensitive: false,
        source: 'verified profile and resume',
        reviewStatus: 'GENERATED' as const,
        generatedAt: '2026-01-01T00:00:00.000Z',
      },
    ]
    vi.mocked(generateAnswers).mockResolvedValue({
      answers,
      provider: 'mock',
      model: 'mock-model',
    })
    const wrapper = makeWrapper()
    const { result } = renderHook(() => useGenerateAnswers(), { wrapper })
    await act(async () => {
      await result.current.mutateAsync({
        preparationId: 'prep-1',
        questions: ['What is your experience with TypeScript?'],
      })
    })
    expect(vi.mocked(generateAnswers)).toHaveBeenCalledWith('prep-1', [
      'What is your experience with TypeScript?',
    ])
  })
})

describe('useUpdateAnswer', () => {
  afterEach(() => {
    vi.mocked(updateAnswer).mockReset()
  })

  it('updates an answer', async () => {
    const updated: ApplicationPreparation = { ...PREPARATION }
    vi.mocked(updateAnswer).mockResolvedValue(updated)
    const wrapper = makeWrapper()
    const { result } = renderHook(() => useUpdateAnswer(), { wrapper })
    await act(async () => {
      await result.current.mutateAsync({
        preparationId: 'prep-1',
        answerId: 'ans-1',
        body: { answer: 'Updated answer', reviewStatus: 'APPROVED' },
      })
    })
    expect(vi.mocked(updateAnswer)).toHaveBeenCalledWith('prep-1', 'ans-1', {
      answer: 'Updated answer',
      reviewStatus: 'APPROVED',
    })
  })
})

describe('useReviewPreparation', () => {
  afterEach(() => {
    vi.mocked(reviewPreparation).mockReset()
  })

  it('reviews preparation component', async () => {
    const updated: ApplicationPreparation = { ...PREPARATION, status: 'READY_FOR_REVIEW' }
    vi.mocked(reviewPreparation).mockResolvedValue(updated)
    const wrapper = makeWrapper()
    const { result } = renderHook(() => useReviewPreparation(), { wrapper })
    await act(async () => {
      await result.current.mutateAsync({
        preparationId: 'prep-1',
        body: { component: 'coverLetter', decision: 'approve' },
      })
    })
    expect(vi.mocked(reviewPreparation)).toHaveBeenCalledWith('prep-1', {
      component: 'coverLetter',
      decision: 'approve',
    })
  })
})

describe('useSavePreparation', () => {
  afterEach(() => {
    vi.mocked(savePreparation).mockReset()
  })

  it('saves preparation draft', async () => {
    const updated: ApplicationPreparation = { ...PREPARATION }
    vi.mocked(savePreparation).mockResolvedValue(updated)
    const wrapper = makeWrapper()
    const { result } = renderHook(() => useSavePreparation(), { wrapper })
    await act(async () => {
      await result.current.mutateAsync({
        preparationId: 'prep-1',
        body: { missingInformation: ['skills'] },
      })
    })
    expect(vi.mocked(savePreparation)).toHaveBeenCalledWith('prep-1', {
      missingInformation: ['skills'],
    })
  })
})

describe('useCancelPreparation', () => {
  afterEach(() => {
    vi.mocked(cancelPreparation).mockReset()
  })

  it('cancels preparation', async () => {
    const cancelled: ApplicationPreparation = { ...PREPARATION, status: 'CANCELLED' }
    vi.mocked(cancelPreparation).mockResolvedValue(cancelled)
    const wrapper = makeWrapper()
    const { result } = renderHook(() => useCancelPreparation(), { wrapper })
    await act(async () => {
      await result.current.mutateAsync('prep-1')
    })
    expect(vi.mocked(cancelPreparation)).toHaveBeenCalledWith('prep-1')
  })
})
