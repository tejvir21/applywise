import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import { cleanup, render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { RequireAuth } from '@/components/RequireAuth'
import { ResumeReviewPage } from '@/pages/ResumeReviewPage'
import { useAuthStore } from '@/stores/auth-store'

interface MockResponse {
  ok: boolean
  status: number
  headers: { get: (name: string) => string | null }
  json: () => Promise<unknown>
  blob: () => Promise<Blob>
}

function jsonResponse(payload: unknown, status = 200): MockResponse {
  return {
    ok: status >= 200 && status < 300,
    status,
    headers: { get: () => null },
    json: async () => payload,
    blob: async () => {
      throw new Error('no blob here')
    },
  }
}

function errorEnvelope(code: string, message: string, status: number): MockResponse {
  return jsonResponse({ success: false, error: { code, message, details: {} } }, status)
}

const HEALTH = {
  success: true,
  data: {
    status: 'ok',
    service: 'api',
    version: '0.1.0',
    environment: 'test',
    mongodb: 'connected',
    ai_provider: 'mock',
    storage_provider: 'supabase',
    browser_automation_provider: 'mock',
    storage: { active: 'supabase', primary: 'supabase', fallback: 'none', healthy: true, durable: true, degraded: false },
  },
}

const RESUME = {
  id: 'r1',
  originalFilename: 'chirag.pdf',
  status: 'ready',
  fileSize: 4096,
  isDefault: true,
  createdAt: '2026-01-01T00:00:00.000Z',
  mimeType: 'application/pdf',
  version: 1,
  storageProvider: 'supabase',
  updatedAt: '2026-01-02T00:00:00.000Z',
}

const PROFILE = {
  _id: 'p1',
  userId: 'u1',
  firstName: 'Existing',
  lastName: 'Person',
  professionalSummary: 'Existing summary',
  phone: '+1 555 0000',
  location: 'Old Town',
  skills: [{ _id: 's1', name: 'Cobol' }],
  socialLinks: {},
}

const ANALYSIS = {
  id: 'a1',
  status: 'completed',
  extractedText: 'Chirag Pandit UI/UX Designer Noida',
  structuredData: {
    personal: {
      name: 'Chirag Pandit',
      email: 'chirag@example.com',
      phone: '+91 9876543210',
      location: 'Noida, India',
      city: 'Noida',
      country: 'India',
      locationEvidence: 'Noida, India',
    },
    summary: 'Designer summary.',
    skills: [
      { name: 'HTML', confidence: 'high', evidence: 'Frontend: HTML', section: 'skills', method: 'skills_list', reviewStatus: 'verified', category: 'technical', context: 'Frontend' },
      { name: 'Figma', confidence: 'high', evidence: 'Figma', section: 'skills', method: 'skills_list', reviewStatus: 'verified', category: 'design' },
    ],
    reviewCandidates: [
      { text: 'Landing Page', reason: 'unrecognized term (not in skill dictionary)', section: 'skills' },
    ],
    experience: [
      { title: 'UI Designer', company: 'PixelWorks', startDate: '2021', endDate: 'Present', location: 'Noida', description: 'Designed screens.', technologies: ['Figma'] },
    ],
    education: [
      { degree: 'B.Des', institution: 'National Institute of Design', startDate: '2018', endDate: '2022' },
    ],
    links: { linkedin: 'https://linkedin.com/in/chirag' },
  },
  warnings: [{ field: 'skills', message: '2 lines reassigned by content.', severity: 'warning' }],
  confidence: 'high',
}

let handleRequest: (url: string, init: RequestInit) => Promise<MockResponse> | MockResponse

function baseHandler() {
  return (url: string) => {
    if (url.endsWith('/api/health')) return jsonResponse(HEALTH)
    if (url.endsWith('/api/profile')) return jsonResponse({ success: true, data: PROFILE })
    if (url.endsWith('/api/resumes/r1')) return jsonResponse({ success: true, data: RESUME })
    if (url.endsWith('/api/resumes/r1/analysis')) return jsonResponse({ success: true, data: ANALYSIS })
    return errorEnvelope('NOT_FOUND', 'Missing', 404)
  }
}

function renderReviewPage(path = '/resumes/r1/review') {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  return render(
    <QueryClientProvider client={client}>
      <MemoryRouter initialEntries={[path]}>
        <Routes>
          <Route path="/login" element={<p>Sign in page</p>} />
          <Route path="/resumes" element={<p>Resume list page</p>} />
          <Route
            path="/resumes/:id/review"
          />
          <Route path="/resumes/:id/analysis" element={
            <RequireAuth>
              <ResumeReviewPage />
            </RequireAuth>
          } />
        </Routes>
      </MemoryRouter>
    </QueryClientProvider>,
  )
}

beforeEach(() => {
  handleRequest = baseHandler()
  window.localStorage.clear()
  vi.stubGlobal(
    'fetch',
    vi.fn(async (url: string, init: RequestInit) => handleRequest(url, init)),
  )
  useAuthStore.setState({ status: 'signed-in', email: 'test@example.com', accessToken: 'token' })
})

afterEach(() => {
  cleanup()
  vi.unstubAllGlobals()
  vi.restoreAllMocks()
  useAuthStore.setState({ status: 'unknown', email: null, accessToken: null })
})

function fetchedUrls(): string[] {
  return vi.mocked(fetch).mock.calls.map(([url]) => String(url))
}

describe('ResumeReviewPage structure', () => {
  it('renders the header with filename, status, instruction, and back link', async () => {
    renderReviewPage()
    expect(await screen.findByRole('heading', { name: 'Resume Review' })).toBeInTheDocument()
    expect(await screen.findByText('chirag.pdf')).toBeInTheDocument()
    expect(screen.getByText(/Review extracted information before importing/)).toBeInTheDocument()
    expect(screen.getByRole('link', { name: /Back to resumes/ })).toHaveAttribute('href', '/resumes')
    expect(screen.getByText(/confidence high/)).toBeInTheDocument()
  })

  it('shows the storage snapshot without implying file verification', async () => {
    renderReviewPage()
    await screen.findByText('chirag.pdf')
    expect(screen.getByText(/Storage: supabase/)).toBeInTheDocument()
    expect(screen.getByText(/does not verify this file/)).toBeInTheDocument()
  })

  it('shows loading, then tab navigation by category', async () => {
    renderReviewPage()
    expect(screen.getByText('Loading resume review…')).toBeInTheDocument()
    expect(await screen.findByRole('tablist', { name: 'Review categories' })).toBeInTheDocument()
    for (const tab of ['Overview', 'Skills', 'Personal details', 'Experience', 'Education', 'Links']) {
      expect(screen.getByRole('tab', { name: new RegExp(tab) })).toBeInTheDocument()
    }
  })

  it('supports keyboard navigation between tabs', async () => {
    const user = userEvent.setup()
    renderReviewPage()
    const skills = await screen.findByRole('tab', { name: /Skills/ })
    await user.click(screen.getByRole('tab', { name: /^Overview$/ }))
    screen.getByRole('tab', { name: /^Overview$/ }).focus()
    await user.keyboard('{ArrowRight}')
    expect(skills).toHaveAttribute('aria-selected', 'true')
  })

  it('renders an error state with retry when the resume is missing', async () => {
    handleRequest = (url: string) => {
      if (url.endsWith('/api/health')) return jsonResponse(HEALTH)
      return errorEnvelope('NOT_FOUND', 'Resume not found', 404)
    }
    renderReviewPage()
    expect(await screen.findByText('Could not load this resume', undefined, { timeout: 5000 })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Retry' })).toBeInTheDocument()
  })

  it('never calls storage endpoints directly from the frontend', async () => {
    renderReviewPage()
    await screen.findByText('chirag.pdf')
    await screen.findByRole('tab', { name: /Skills/ })
    expect(fetchedUrls().every((url) => !/supabase|storage\/v1/i.test(url))).toBe(true)
  })
})

describe('ResumeReviewPage summary and skills queue', () => {
  it('shows summary counts from live state', async () => {
    renderReviewPage()
    await screen.findByText('chirag.pdf')
    expect(screen.getByText('Verified skills')).toBeInTheDocument()
    expect(screen.getByText('Needs review')).toBeInTheDocument()
    expect(screen.getByText('Approved')).toBeInTheDocument()
    expect(screen.getByText('Rejected')).toBeInTheDocument()
    expect(screen.getByText('Ready to import')).toBeInTheDocument()
  })

  it('normalizes Frontend: HTML with context, evidence, and an approve path', async () => {
    const user = userEvent.setup()
    renderReviewPage()
    await screen.findByText('chirag.pdf')
    await user.click(screen.getByRole('tab', { name: /Skills/ }))

    expect(await screen.findByText('HTML')).toBeInTheDocument()
    expect(screen.getByText('Frontend')).toBeInTheDocument()
    expect(screen.getByText(/Evidence.*“Frontend: HTML”/)).toBeInTheDocument()
    // The raw prefixed string is evidence, never a skill of its own.
    expect(screen.queryByText('Frontend: HTML', { exact: true })).not.toBeInTheDocument()
    expect(screen.queryByText(/intermediate|advanced/)).not.toBeInTheDocument()
  })

  it('approves a candidate, updating counts immediately without touching the profile', async () => {
    const user = userEvent.setup()
    renderReviewPage()
    await screen.findByText('chirag.pdf')
    await user.click(screen.getByRole('tab', { name: /Skills/ }))
    await screen.findByText('“Landing Page”')

    await user.click(screen.getByRole('button', { name: 'Approve candidate Landing Page for import' }))
    expect(await screen.findByText('Approved for import')).toBeInTheDocument()
    const posts = vi.mocked(fetch).mock.calls.filter(([url, init]) =>
      String(url).endsWith('/import') && (init as RequestInit)?.method === 'POST',
    )
    expect(posts).toHaveLength(0)
  })

  it('rejects a candidate into the rejected group and restores it to review', async () => {
    const user = userEvent.setup()
    renderReviewPage()
    await screen.findByText('chirag.pdf')
    await user.click(screen.getByRole('tab', { name: /Skills/ }))
    await screen.findByText('“Landing Page”')

    await user.click(screen.getByRole('button', { name: 'Reject candidate Landing Page' }))
    expect(await screen.findByText('Rejected (1)')).toBeInTheDocument()
    expect(screen.getByText('Rejected — excluded from import.')).toBeInTheDocument()

    await user.click(screen.getByRole('button', { name: 'Restore candidate Landing Page' }))
    expect(await screen.findByText('Needs review (1)')).toBeInTheDocument()
    expect(screen.queryByText('Rejected — excluded from import.')).not.toBeInTheDocument()
    // Restored to review, not silently approved.
    expect(screen.queryByText('Approved for import')).not.toBeInTheDocument()
  })

  it('rejects a verified skill and restores it with evidence intact', async () => {
    const user = userEvent.setup()
    renderReviewPage()
    await screen.findByText('chirag.pdf')
    await user.click(screen.getByRole('tab', { name: /Skills/ }))
    await screen.findByText('Figma')

    await user.click(screen.getByRole('button', { name: 'Reject skill Figma' }))
    expect(await screen.findByText('Rejected (1)')).toBeInTheDocument()

    await user.click(screen.getByRole('button', { name: 'Restore skill Figma' }))
    expect(screen.getByText(/Evidence.*“Figma”/)).toBeInTheDocument()
  })

  it('reports persistence failures instead of false success', async () => {
    const user = userEvent.setup()
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new Error('denied')
    })
    renderReviewPage()
    await screen.findByText('chirag.pdf')
    await user.click(screen.getByRole('tab', { name: /Skills/ }))
    await screen.findByText('“Landing Page”')

    await user.click(screen.getByRole('button', { name: 'Approve candidate Landing Page for import' }))
    expect(await screen.findByText(/Could not save your review decision/)).toBeInTheDocument()
    expect(screen.queryByText('Approved for import')).not.toBeInTheDocument()
  })
})

describe('ResumeReviewPage persistence', () => {
  it('keeps decisions across reload', async () => {
    const user = userEvent.setup()
    const first = renderReviewPage()
    await screen.findByText('chirag.pdf')
    await user.click(screen.getByRole('tab', { name: /Skills/ }))
    await screen.findByText('“Landing Page”')
    await user.click(screen.getByRole('button', { name: 'Approve candidate Landing Page for import' }))
    expect(await screen.findByText('Approved for import')).toBeInTheDocument()

    first.unmount()
    renderReviewPage()
    await screen.findByText('chirag.pdf')
    await user.click(screen.getByRole('tab', { name: /Skills/ }))
    expect(await screen.findByText('Approved for import')).toBeInTheDocument()
  })

  it('scopes decisions by resume and survives re-analysis', async () => {
    const user = userEvent.setup()
    const first = renderReviewPage()
    await screen.findByText('chirag.pdf')
    await user.click(screen.getByRole('tab', { name: /Skills/ }))
    await screen.findByText('Figma')
    await user.click(screen.getByRole('button', { name: 'Reject skill Figma' }))
    expect(await screen.findByText('Rejected (1)')).toBeInTheDocument()
    first.unmount()

    // Re-analysis returns an extra skill; the Figma rejection must survive.
    handleRequest = (url: string) => {
      if (url.endsWith('/api/health')) return jsonResponse(HEALTH)
      if (url.endsWith('/api/profile')) return jsonResponse({ success: true, data: PROFILE })
      if (url.endsWith('/api/resumes/r1')) return jsonResponse({ success: true, data: RESUME })
      if (url.endsWith('/api/resumes/r1/analysis')) {
        return jsonResponse({
          success: true,
          data: {
            ...ANALYSIS,
            structuredData: {
              ...ANALYSIS.structuredData,
              skills: [
                ...(ANALYSIS.structuredData.skills as unknown[]),
                { name: 'Webflow', confidence: 'high', evidence: 'Webflow', section: 'skills', method: 'skills_list', reviewStatus: 'verified', category: 'design' },
              ],
            },
          },
        })
      }
      return errorEnvelope('NOT_FOUND', 'Missing', 404)
    }
    renderReviewPage()
    await screen.findByText('chirag.pdf')
    await user.click(screen.getByRole('tab', { name: /Skills/ }))
    expect(await screen.findByText('Rejected (1)')).toBeInTheDocument()
    expect(screen.getByText('Webflow')).toBeInTheDocument()
  })

  it('does not leak one resume’s decisions into another', async () => {
    const user = userEvent.setup()
    renderReviewPage()
    await screen.findByText('chirag.pdf')
    await user.click(screen.getByRole('tab', { name: /Skills/ }))
    await screen.findByText('“Landing Page”')
    await user.click(screen.getByRole('button', { name: 'Approve candidate Landing Page for import' }))
    expect(await screen.findByText('Approved for import')).toBeInTheDocument()
    cleanup()

    handleRequest = (url: string) => {
      if (url.endsWith('/api/health')) return jsonResponse(HEALTH)
      if (url.endsWith('/api/profile')) return jsonResponse({ success: true, data: PROFILE })
      if (url.endsWith('/api/resumes/r2')) {
        return jsonResponse({ success: true, data: { ...RESUME, id: 'r2', originalFilename: 'other.pdf' } })
      }
      if (url.endsWith('/api/resumes/r2/analysis')) {
        return jsonResponse({
          success: true,
          data: { ...ANALYSIS, id: 'a2', structuredData: { ...ANALYSIS.structuredData, skills: [], reviewCandidates: [] } },
        })
      }
      return errorEnvelope('NOT_FOUND', 'Missing', 404)
    }
    renderReviewPage('/resumes/r2/review')
    await screen.findByText('other.pdf')
    await user.click(screen.getByRole('tab', { name: /Skills/ }))
    expect(await screen.findByText(/No verified skills\./)).toBeInTheDocument()
    expect(screen.queryByText('Approved for import')).not.toBeInTheDocument()
  })

  it('reads decisions stored by the older shape without migration', async () => {
    window.localStorage.setItem('applywise-review-rejected', JSON.stringify({ r1: ['Figma'] }))
    window.localStorage.setItem('applywise-review-approved', JSON.stringify({ r1: ['Landing Page'] }))
    renderReviewPage()
    await screen.findByText('chirag.pdf')
    await userEvent.setup().click(screen.getByRole('tab', { name: /Skills/ }))
    // Figma rejected, Landing Page approved-but-visible: both presets honored.
    expect(await screen.findByText('Rejected (1)')).toBeInTheDocument()
    expect(screen.getByText('Approved for import')).toBeInTheDocument()
  })
})

describe('ResumeReviewPage personal classification', () => {
  it('proposes Noida as a city with evidence, not as a skill', async () => {
    const user = userEvent.setup()
    renderReviewPage()
    await screen.findByText('chirag.pdf')
    await user.click(screen.getByRole('tab', { name: 'Personal details' }))

    expect(await screen.findByText('Noida')).toBeInTheDocument()
    expect(screen.getByText(/As written: “Noida, India”/)).toBeInTheDocument()
    await user.click(screen.getByRole('tab', { name: /Skills/ }))
    expect(screen.queryByText('Noida', { exact: true })).not.toBeInTheDocument()
  })

  it('proposes the header name as first and last name with the original text', async () => {
    const user = userEvent.setup()
    renderReviewPage()
    await screen.findByText('chirag.pdf')
    await user.click(screen.getByRole('tab', { name: 'Personal details' }))

    expect(await screen.findByText('Chirag')).toBeInTheDocument()
    expect(screen.getByText('Pandit')).toBeInTheDocument()
    expect(screen.getByText(/Original text preserved: “Chirag Pandit”/)).toBeInTheDocument()
  })

  it('previews experience, education, and links with evidence', async () => {
    const user = userEvent.setup()
    renderReviewPage()
    await screen.findByText('chirag.pdf')

    await user.click(screen.getByRole('tab', { name: /Experience/ }))
    expect(await screen.findByText('UI Designer')).toBeInTheDocument()
    expect(screen.getByText(/PixelWorks/)).toBeInTheDocument()

    await user.click(screen.getByRole('tab', { name: /Education/ }))
    expect(await screen.findByText(/National Institute of Design/)).toBeInTheDocument()

    await user.click(screen.getByRole('tab', { name: /Links/ }))
    expect(screen.getAllByText(/linkedin\.com\/in\/chirag/).length).toBeGreaterThan(0)
    expect(screen.getByText(/Detected from hostname/)).toBeInTheDocument()
  })
})

describe('ResumeReviewPage import safety', () => {
  it('keeps fill-empty default and excludes rejected candidates', async () => {
    const user = userEvent.setup()
    handleRequest = (url: string, init: RequestInit) => {
      if (url.endsWith('/api/health')) return jsonResponse(HEALTH)
      if (url.endsWith('/api/profile')) return jsonResponse({ success: true, data: PROFILE })
      if (url.endsWith('/api/resumes/r1')) return jsonResponse({ success: true, data: RESUME })
      if (url.endsWith('/api/resumes/r1/analysis')) return jsonResponse({ success: true, data: ANALYSIS })
      if (url.endsWith('/import') && init.method === 'POST') {
        const body = JSON.parse(String(init.body)) as { fields: string[]; mode?: string; excludeSkills?: string[] }
        expect(body.mode).toBe('fill')
        expect(body.excludeSkills).toContain('Figma')
        return jsonResponse({
          success: true,
          data: { imported: ['skills'], skipped: ['skills (1 rejected in review)'], conflicts: [], applied: ['skills'], removed: [] },
        })
      }
      return errorEnvelope('NOT_FOUND', 'Missing', 404)
    }
    renderReviewPage()
    await screen.findByText('chirag.pdf')
    await user.click(screen.getByRole('tab', { name: /Skills/ }))
    await screen.findByText('Figma')
    await user.click(screen.getByRole('button', { name: 'Reject skill Figma' }))

    const fill = screen.getByRole('radio', { name: 'Fill empty' }) as HTMLInputElement
    expect(fill.checked).toBe(true)
    await user.click(screen.getByRole('button', { name: 'Import to profile' }))
    expect(await screen.findByText(/Excluded by your review: Figma/)).toBeInTheDocument()
  })

  it('requires confirmation for replacements and shows applied results', async () => {
    const user = userEvent.setup()
    vi.spyOn(window, 'confirm').mockReturnValue(true)
    handleRequest = (url: string, init: RequestInit) => {
      if (url.endsWith('/api/health')) return jsonResponse(HEALTH)
      if (url.endsWith('/api/profile')) return jsonResponse({ success: true, data: PROFILE })
      if (url.endsWith('/api/resumes/r1')) return jsonResponse({ success: true, data: RESUME })
      if (url.endsWith('/api/resumes/r1/analysis')) return jsonResponse({ success: true, data: ANALYSIS })
      if (url.endsWith('/import') && init.method === 'POST') {
        const body = JSON.parse(String(init.body)) as Record<string, unknown>
        expect(body.confirmReplace).toBe(true)
        return jsonResponse({
          success: true,
          data: { imported: ['summary'], skipped: [], conflicts: [], applied: ['summary.professionalSummary'], removed: [] },
        })
      }
      return errorEnvelope('NOT_FOUND', 'Missing', 404)
    }
    renderReviewPage()
    await screen.findByText('chirag.pdf')
    await user.click(screen.getByRole('radio', { name: 'Selective update' }))
    await user.click(screen.getByRole('button', { name: 'Import to profile' }))
    expect(await screen.findByText(/Applied: summary.professionalSummary/)).toBeInTheDocument()
  })
})
