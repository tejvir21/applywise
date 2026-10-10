import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import { cleanup, render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { AppLayout } from '@/layouts/AppLayout'
import { RequireAuth } from '@/components/RequireAuth'
import { ResumesPage } from '@/pages/ResumesPage'
import {
  downloadResumeFile,
  importResumeToProfile,
  retryResumeAnalysis,
} from '@/services/resumes'
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
    storage_provider: 'local',
    browser_automation_provider: 'mock',
    storage: { active: 'local', primary: 'local', fallback: 'none', healthy: true, durable: true, degraded: false },
  },
}

const RESUME = {
  id: 'r1',
  originalFilename: 'resume.pdf',
  status: 'ready',
  fileSize: 2048,
  isDefault: true,
  createdAt: '2026-01-01T00:00:00.000Z',
}

let handleRequest: (url: string, init: RequestInit) => Promise<MockResponse> | MockResponse

function defaultHandler(list: unknown[] = []) {
  return (url: string) => {
    if (url.endsWith('/api/health')) return jsonResponse(HEALTH)
    if (url.endsWith('/api/resumes')) return jsonResponse({ success: true, data: list })
    return errorEnvelope('NOT_FOUND', 'Missing', 404)
  }
}

function renderResumesPage(path = '/resumes') {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  return render(
    <QueryClientProvider client={client}>
      <MemoryRouter initialEntries={[path]}>
        <Routes>
          <Route path="/login" element={<p>Sign in page</p>} />
          <Route
            path="/resumes"
            element={
              <RequireAuth>
                <ResumesPage />
              </RequireAuth>
            }
          />
        </Routes>
      </MemoryRouter>
    </QueryClientProvider>,
  )
}

beforeEach(() => {
  handleRequest = defaultHandler([])
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

describe('ResumesPage access', () => {
  it('redirects signed-out visitors to login', async () => {
    useAuthStore.setState({ status: 'signed-out', email: null, accessToken: null })
    renderResumesPage()
    expect(await screen.findByText('Sign in page')).toBeInTheDocument()
    expect(screen.queryByText('No resumes uploaded')).not.toBeInTheDocument()
  })

  it('renders a Resumes navigation item', async () => {
    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } })
    render(
      <QueryClientProvider client={client}>
        <MemoryRouter initialEntries={['/dashboard']}>
          <AppLayout />
        </MemoryRouter>
      </QueryClientProvider>,
    )
    const link = await screen.findByRole('link', { name: 'Resumes' })
    expect(link).toHaveAttribute('href', '/resumes')
  })
})

describe('ResumesPage listing and upload', () => {
  it('shows a loading indicator, then the empty state', async () => {
    renderResumesPage()
    expect(screen.getByText('Loading resumes…')).toBeInTheDocument()
    expect(await screen.findByText('No resumes uploaded')).toBeInTheDocument()
  })

  it('shows storage status only when the backend provides it', async () => {
    renderResumesPage()
    await screen.findByText('No resumes uploaded')
    expect(screen.getByText(/Storage: local/)).toBeInTheDocument()
  })

  it('omits storage status when the backend provides none', async () => {
    const withoutStorage = {
      ...HEALTH,
      data: { ...HEALTH.data, storage: undefined },
    }
    handleRequest = (url: string) => {
      if (url.endsWith('/api/health')) return jsonResponse(withoutStorage)
      if (url.endsWith('/api/resumes')) return jsonResponse({ success: true, data: [] })
      return errorEnvelope('NOT_FOUND', 'Missing', 404)
    }
    renderResumesPage()
    await screen.findByText('No resumes uploaded')
    expect(screen.queryByText(/Storage:/)).not.toBeInTheDocument()
  })

  it('uploads a file and refreshes the list', async () => {
    const user = userEvent.setup()
    let list: unknown[] = []
    handleRequest = (url: string, init: RequestInit) => {
      if (url.endsWith('/api/health')) return jsonResponse(HEALTH)
      if (url.endsWith('/api/resumes') && init.method === 'GET') {
        return jsonResponse({ success: true, data: list })
      }
      if (url.endsWith('/api/resumes') && init.method === 'POST') {
        list = [RESUME]
        return jsonResponse({
          success: true,
          data: { resume: RESUME, analysis: { id: 'a1', status: 'pending' } },
        })
      }
      return errorEnvelope('NOT_FOUND', 'Missing', 404)
    }
    renderResumesPage()
    await screen.findByText('No resumes uploaded')

    await user.upload(
      screen.getByLabelText('Resume file'),
      new File(['%PDF-1.4 fake'], 'resume.pdf', { type: 'application/pdf' }),
    )
    await user.click(screen.getByRole('button', { name: 'Upload resume' }))

    expect(await screen.findByText(/Uploaded resume.pdf/)).toBeInTheDocument()
    expect(await screen.findByText('resume.pdf')).toBeInTheDocument()
  })

  it('rejects unsupported extensions without uploading', async () => {
    renderResumesPage()
    await screen.findByText('No resumes uploaded')

    // fireEvent bypasses the input's accept filter so the page's own
    // extension gate is exercised (user-event would pre-filter the file).
    const { fireEvent } = await import('@testing-library/react')
    fireEvent.change(screen.getByLabelText('Resume file'), {
      target: { files: [new File(['plain text'], 'notes.txt', { type: 'text/plain' })] },
    })
    expect(await screen.findByRole('alert')).toHaveTextContent('Only PDF (.pdf) and DOCX (.docx)')
    expect(vi.mocked(fetch)).not.toHaveBeenCalledWith(
      expect.stringContaining('/api/resumes'),
      expect.objectContaining({ method: 'POST' }),
    )
  })

  it('rejects files over 10 MB without uploading', async () => {
    const user = userEvent.setup()
    renderResumesPage()
    await screen.findByText('No resumes uploaded')

    const big = new File([new Uint8Array(11 * 1024 * 1024)], 'big.pdf', { type: 'application/pdf' })
    await user.upload(screen.getByLabelText('Resume file'), big)
    await user.click(screen.getByRole('button', { name: 'Upload resume' }))

    expect(await screen.findByRole('alert')).toHaveTextContent('exceeds the 10 MB limit')
    const posts = vi.mocked(fetch).mock.calls.filter(([url, init]) =>
      String(url).endsWith('/api/resumes') && (init as RequestInit)?.method === 'POST',
    )
    expect(posts).toHaveLength(0)
  })

  it('explains a 401 with sign-in guidance', async () => {
    const user = userEvent.setup()
    let attempts = 0
    handleRequest = (url: string, init: RequestInit) => {
      if (url.endsWith('/api/health')) return jsonResponse(HEALTH)
      if (url.endsWith('/api/resumes') && init.method === 'GET') {
        return jsonResponse({ success: true, data: [] })
      }
      if (url.endsWith('/api/auth/refresh')) {
        return jsonResponse({ success: true, data: { access_token: 'fresh' } })
      }
      if (url.endsWith('/api/resumes') && init.method === 'POST') {
        attempts += 1
        return errorEnvelope('UNAUTHORIZED', 'Authentication required', 401)
      }
      return errorEnvelope('NOT_FOUND', 'Missing', 404)
    }
    renderResumesPage()
    await screen.findByText('No resumes uploaded')

    await user.upload(
      screen.getByLabelText('Resume file'),
      new File(['%PDF-1.4'], 'resume.pdf', { type: 'application/pdf' }),
    )
    await user.click(screen.getByRole('button', { name: 'Upload resume' }))

    expect(await screen.findByRole('alert')).toHaveTextContent('signed out')
    expect(attempts).toBeGreaterThan(0)
  })

  it('explains a 413 with resize guidance', async () => {
    const user = userEvent.setup()
    handleRequest = (url: string, init: RequestInit) => {
      if (url.endsWith('/api/health')) return jsonResponse(HEALTH)
      if (url.endsWith('/api/resumes') && init.method === 'GET') {
        return jsonResponse({ success: true, data: [] })
      }
      if (url.endsWith('/api/resumes') && init.method === 'POST') {
        return errorEnvelope('PAYLOAD_TOO_LARGE', 'File size exceeds 10MB limit', 413)
      }
      return errorEnvelope('NOT_FOUND', 'Missing', 404)
    }
    renderResumesPage()
    await screen.findByText('No resumes uploaded')

    await user.upload(
      screen.getByLabelText('Resume file'),
      new File(['%PDF-1.4'], 'resume.pdf', { type: 'application/pdf' }),
    )
    await user.click(screen.getByRole('button', { name: 'Upload resume' }))

    expect(await screen.findByRole('alert')).toHaveTextContent('exceeds the 10 MB limit')
  })

  it('explains a 503 with retry guidance', async () => {
    const user = userEvent.setup()
    handleRequest = (url: string, init: RequestInit) => {
      if (url.endsWith('/api/health')) return jsonResponse(HEALTH)
      if (url.endsWith('/api/resumes') && init.method === 'GET') {
        return jsonResponse({ success: true, data: [] })
      }
      if (url.endsWith('/api/resumes') && init.method === 'POST') {
        return errorEnvelope('STORAGE_UNAVAILABLE', 'Resume storage is temporarily unavailable', 503)
      }
      return errorEnvelope('NOT_FOUND', 'Missing', 404)
    }
    renderResumesPage()
    await screen.findByText('No resumes uploaded')

    await user.upload(
      screen.getByLabelText('Resume file'),
      new File(['%PDF-1.4'], 'resume.pdf', { type: 'application/pdf' }),
    )
    await user.click(screen.getByRole('button', { name: 'Upload resume' }))

    expect(await screen.findByRole('alert')).toHaveTextContent('temporarily unavailable')
  })

  it('prevents duplicate submissions while uploading', async () => {
    const user = userEvent.setup()
    let release!: (value: MockResponse) => void
    const gate = new Promise<MockResponse>((resolve) => {
      release = resolve
    })
    handleRequest = (url: string, init: RequestInit) => {
      if (url.endsWith('/api/health')) return jsonResponse(HEALTH)
      if (url.endsWith('/api/resumes') && init.method === 'GET') {
        return jsonResponse({ success: true, data: [] })
      }
      if (url.endsWith('/api/resumes') && init.method === 'POST') return gate
      return errorEnvelope('NOT_FOUND', 'Missing', 404)
    }
    renderResumesPage()
    await screen.findByText('No resumes uploaded')

    await user.upload(
      screen.getByLabelText('Resume file'),
      new File(['%PDF-1.4'], 'resume.pdf', { type: 'application/pdf' }),
    )
    await user.click(screen.getByRole('button', { name: 'Upload resume' }))
    expect(await screen.findByRole('button', { name: 'Uploading…' })).toBeDisabled()

    // A second submit while busy must not fire another upload.
    await user.click(screen.getByRole('button', { name: 'Uploading…' }))
    release(
      jsonResponse({ success: true, data: { resume: RESUME, analysis: { id: 'a1', status: 'pending' } } }),
    )
    expect(await screen.findByText(/Uploaded resume.pdf/)).toBeInTheDocument()

    const posts = vi.mocked(fetch).mock.calls.filter(([url, init]) =>
      String(url).endsWith('/api/resumes') && (init as RequestInit)?.method === 'POST',
    )
    expect(posts).toHaveLength(1)
  })
})

describe('ResumesPage analysis', () => {
  const COMPLETED = {
    id: 'a1',
    status: 'completed',
    extractedText: 'Ada Lovelace',
    structuredData: { skills: [{ name: 'TypeScript' }, { name: 'Node.js' }] },
    warnings: [],
    confidence: 'high',
  }

  function analysisHandler(overrides: Partial<Record<string, MockResponse | (() => MockResponse)>>) {
    return (url: string, init: RequestInit) => {
      if (url.endsWith('/api/health')) return jsonResponse(HEALTH)
      if (url.endsWith('/api/resumes')) return jsonResponse({ success: true, data: [RESUME] })
      const key = `${init.method} ${url.split('/api/resumes/r1')[1] ?? ''}`
      const override = overrides[key]
      if (typeof override === 'function') return override()
      if (override) return override
      return errorEnvelope('NOT_FOUND', 'Missing', 404)
    }
  }

  it('runs analysis and shows parsed skills', async () => {
    const user = userEvent.setup()
    handleRequest = analysisHandler({
      'POST /analyze': jsonResponse({ success: true, data: { success: true, analysisId: 'a1' } }),
      'GET /analysis': jsonResponse({ success: true, data: COMPLETED }),
    })
    renderResumesPage()
    await screen.findByText('resume.pdf')

    await user.click(screen.getByRole('button', { name: 'Analyze' }))
    expect(await screen.findByText('Analysis completed.')).toBeInTheDocument()
    expect(screen.getByText('Analysis: completed · confidence high')).toBeInTheDocument()
    expect(screen.getAllByText('TypeScript').length).toBeGreaterThan(0)
  })

  it('distinguishes parsing failure from upload failure and offers retry', async () => {
    const user = userEvent.setup()
    const failed = { ...COMPLETED, status: 'failed', warnings: [{ field: 'general', message: 'Unparseable content', severity: 'error' }] }
    let retried = false
    handleRequest = (url: string, _init: RequestInit) => {
      if (url.endsWith('/api/health')) return jsonResponse(HEALTH)
      if (url.endsWith('/api/resumes')) return jsonResponse({ success: true, data: [RESUME] })
      if (url.endsWith('/analyze')) {
        return errorEnvelope('VALIDATION_ERROR', 'Resume content could not be analyzed', 422)
      }
      if (url.endsWith('/analysis/retry')) {
        retried = true
        return jsonResponse({ success: true, data: { success: true, analysisId: 'a1' } })
      }
      if (url.endsWith('/analysis')) {
        return jsonResponse({ success: true, data: retried ? COMPLETED : failed })
      }
      return errorEnvelope('NOT_FOUND', 'Missing', 404)
    }
    renderResumesPage()
    await screen.findByText('resume.pdf')

    await user.click(screen.getByRole('button', { name: 'Analyze' }))
    expect(await screen.findByRole('alert')).toHaveTextContent('Analysis failed')
    expect(screen.getByText(/Unparseable content/)).toBeInTheDocument()

    await user.click(screen.getByRole('button', { name: 'Retry analysis' }))
    expect(await screen.findByText('Analysis completed.')).toBeInTheDocument()
    expect(retried).toBe(true)
  })
})

describe('ResumesPage download, import, delete', () => {
  function rowHandler(extra: (url: string, _init: RequestInit) => MockResponse | null) {
    return (url: string, init: RequestInit) => {
      if (url.endsWith('/api/health')) return jsonResponse(HEALTH)
      if (url.endsWith('/api/resumes')) return jsonResponse({ success: true, data: [RESUME] })
      return extra(url, init) ?? errorEnvelope('NOT_FOUND', 'Missing', 404)
    }
  }

  it('downloads the stored file through the backend route', async () => {
    const user = userEvent.setup()
    const createObjectURL = vi.fn(() => 'blob:mock')
    const revokeObjectURL = vi.fn()
    Object.defineProperty(URL, 'createObjectURL', { value: createObjectURL, configurable: true })
    Object.defineProperty(URL, 'revokeObjectURL', { value: revokeObjectURL, configurable: true })
    handleRequest = rowHandler((url) => {
      if (url.endsWith('/download')) {
        return {
          ok: true,
          status: 200,
          headers: {
            get: (name: string) =>
              name === 'Content-Type' ? 'application/pdf' : 'attachment; filename="resume.pdf"',
          },
          json: async () => ({}),
          blob: async () => new Blob(['%PDF-1.4'], { type: 'application/pdf' }),
        }
      }
      return null
    })
    renderResumesPage()
    await screen.findByText('resume.pdf')

    await user.click(screen.getByRole('button', { name: 'Download' }))
    expect(await screen.findByText(/Downloaded resume.pdf/)).toBeInTheDocument()
    expect(createObjectURL).toHaveBeenCalled()
  })

  it('imports parsed fields without overwriting verified data', async () => {
    const user = userEvent.setup()
    handleRequest = rowHandler((url, init) => {
      if (url.endsWith('/import') && init.method === 'POST') {
        const body = JSON.parse(String(init.body)) as { fields: string[] }
        expect(body.fields).toContain('skills')
        return jsonResponse({
          success: true,
          data: { imported: ['skills'], skipped: [], conflicts: ['personal (already set: firstName)'] },
        })
      }
      return null
    })
    renderResumesPage()
    await screen.findByText('resume.pdf')

    await user.click(screen.getByRole('button', { name: 'Import' }))
    await user.click(screen.getByRole('button', { name: 'Import to profile' }))
    expect(await screen.findByText(/Imported: skills/)).toBeInTheDocument()
    expect(screen.getByText(/Already set/)).toBeInTheDocument()
  })

  it('asks for confirmation before deletion', async () => {
    const user = userEvent.setup()
    const confirm = vi.spyOn(window, 'confirm').mockReturnValue(false)
    handleRequest = rowHandler(() => null)
    renderResumesPage()
    await screen.findByText('resume.pdf')

    await user.click(screen.getByRole('button', { name: 'Delete' }))
    expect(confirm).toHaveBeenCalled()
    const deletes = vi.mocked(fetch).mock.calls.filter(([url, init]) =>
      String(url).endsWith('/api/resumes/r1') && (init as RequestInit)?.method === 'DELETE',
    )
    expect(deletes).toHaveLength(0)
  })

  it('deletes after confirmation and refreshes', async () => {
    const user = userEvent.setup()
    vi.spyOn(window, 'confirm').mockReturnValue(true)
    let list: unknown[] = [RESUME]
    handleRequest = (url: string, init: RequestInit) => {
      if (url.endsWith('/api/health')) return jsonResponse(HEALTH)
      if (url.endsWith('/api/resumes') && init.method === 'GET') {
        return jsonResponse({ success: true, data: list })
      }
      if (url.endsWith('/api/resumes/r1') && init.method === 'DELETE') {
        list = []
        return jsonResponse({ success: true, data: { message: 'Resume deleted successfully' } })
      }
      return errorEnvelope('NOT_FOUND', 'Missing', 404)
    }
    renderResumesPage()
    await screen.findByText('resume.pdf')

    await user.click(screen.getByRole('button', { name: 'Delete' }))
    expect(await screen.findByText('Deletion done.')).toBeInTheDocument()
    expect(await screen.findByText('No resumes uploaded')).toBeInTheDocument()
  })
})

describe('ResumesPage analysis review', () => {
  const RICH_ANALYSIS = {
    id: 'a1',
    status: 'completed',
    extractedText: 'Chirag Pandit UI/UX Designer',
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
      skills: [
        { name: 'Figma', confidence: 'high', evidence: 'Figma 95%', section: 'skills', method: 'skills_list', reviewStatus: 'verified', rating: '95%' },
        { name: 'Webflow', confidence: 'high', evidence: 'Webflow', section: 'skills', method: 'skills_list', reviewStatus: 'verified' },
      ],
      reviewCandidates: [
        { text: 'Landing Page', reason: 'unrecognized term (not in skill dictionary)', section: 'skills' },
      ],
      links: { linkedin: 'https://linkedin.com/in/chirag', github: 'https://github.com/chiragp' },
    },
    warnings: [{ field: 'personal.location', message: 'Ambiguous location-like text ignored', severity: 'warning' }],
    confidence: 'high',
  }

  function richHandler(extra?: (url: string, init: RequestInit) => MockResponse | null) {
    return (url: string, init: RequestInit) => {
      if (url.endsWith('/api/health')) return jsonResponse(HEALTH)
      if (url.endsWith('/api/resumes')) return jsonResponse({ success: true, data: [RESUME] })
      if (url.endsWith('/analysis')) return jsonResponse({ success: true, data: RICH_ANALYSIS })
      return extra?.(url, init) ?? errorEnvelope('NOT_FOUND', 'Missing', 404)
    }
  }

  it('separates verified skills, review candidates, evidence, and warnings', async () => {
    const user = userEvent.setup()
    handleRequest = richHandler()
    renderResumesPage()
    await screen.findByText('resume.pdf')

    await user.click(screen.getByRole('button', { name: 'View analysis' }))
    expect(await screen.findByText(/Verified skills \(2\)/)).toBeInTheDocument()
    expect(screen.getByText(/Evidence \(Listed\): “Figma 95%”/)).toBeInTheDocument()
    expect(screen.getAllByText('proficiency: not specified')).toHaveLength(2)
    expect(screen.getByText(/Needs review \(1\)/)).toBeInTheDocument()
    expect(screen.getByText(/Landing Page/)).toBeInTheDocument()
    expect(screen.getByText(/Ambiguous location-like text ignored/)).toBeInTheDocument()
    expect(screen.getByText(/Location: Noida, India/)).toBeInTheDocument()
    expect(screen.getByText(/linkedin: https:\/\/linkedin.com\/in\/chirag/)).toBeInTheDocument()
  })

  it('rejects false positives and excludes them from import', async () => {
    const user = userEvent.setup()
    handleRequest = richHandler((url, init) => {
      if (url.endsWith('/import') && init.method === 'POST') {
        const body = JSON.parse(String(init.body)) as { fields: string[]; excludeSkills?: string[] }
        expect(body.excludeSkills).toContain('Figma')
        return jsonResponse({
          success: true,
          data: { imported: ['skills'], skipped: ['skills (1 rejected in review)'], conflicts: [] },
        })
      }
      return null
    })
    renderResumesPage()
    await screen.findByText('resume.pdf')

    await user.click(screen.getByRole('button', { name: 'View analysis' }))
    await screen.findByText(/Verified skills \(2\)/)
    await user.click(screen.getByRole('button', { name: 'Reject skill Figma' }))
    expect(screen.getByText('Rejected — excluded from import.')).toBeInTheDocument()

    await user.click(screen.getByRole('button', { name: 'Import' }))
    expect(screen.getByText(/Proposed: Webflow/)).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: 'Import to profile' }))
    expect(await screen.findByText(/Excluded by your review: Figma/)).toBeInTheDocument()
  })

  it('offers location, contact, and links import fields with proposed values', async () => {    const user = userEvent.setup()
    handleRequest = richHandler()
    renderResumesPage()
    await screen.findByText('resume.pdf')

    await user.click(screen.getByRole('button', { name: 'View analysis' }))
    await screen.findByText(/Verified skills \(2\)/)
    await user.click(screen.getByRole('button', { name: 'Import' }))
    for (const field of ['location', 'contact', 'links']) {
      expect(screen.getByText(field, { exact: true })).toBeInTheDocument()
    }
    expect(screen.getAllByText(/Proposed:.*Noida, India/).length).toBeGreaterThan(0)
    expect(screen.getAllByText(/Proposed:.*chirag@example.com/).length).toBeGreaterThan(0)
  })
  it('shows source-provided ratings as evidence, not proficiency', async () => {
    const user = userEvent.setup()
    handleRequest = richHandler()
    renderResumesPage()
    await screen.findByText('resume.pdf')

    await user.click(screen.getByRole('button', { name: 'View analysis' }))
    expect(await screen.findByText('stated: 95%')).toBeInTheDocument()
    expect(screen.getAllByText('proficiency: not specified').length).toBeGreaterThan(0)
  })

  it('persists rejections across reload and restores candidates', async () => {    const user = userEvent.setup()
    handleRequest = richHandler()
    const first = renderResumesPage()
    await screen.findByText('resume.pdf')

    await user.click(screen.getByRole('button', { name: 'View analysis' }))
    await screen.findByText(/Verified skills \(2\)/)
    await user.click(screen.getByRole('button', { name: 'Reject skill Figma' }))
    expect(screen.getByText('Rejected — excluded from import.')).toBeInTheDocument()

    // Reload: state must survive via localStorage.
    first.unmount()
    renderResumesPage()
    await screen.findByText('resume.pdf')
    await user.click(screen.getByRole('button', { name: 'View analysis' }))
    await screen.findByText(/Verified skills \(2\)/)
    expect(screen.getByText('Rejected — excluded from import.')).toBeInTheDocument()

    await user.click(screen.getByRole('button', { name: 'Restore skill Figma' }))
    expect(screen.queryByText('Rejected — excluded from import.')).not.toBeInTheDocument()
  })
  it('shows categories, sources, and stated proficiency without inventing levels', async () => {
    const user = userEvent.setup()
    handleRequest = (url: string) => {
      if (url.endsWith('/api/health')) return jsonResponse(HEALTH)
      if (url.endsWith('/api/resumes')) return jsonResponse({ success: true, data: [RESUME] })
      if (url.endsWith('/analysis')) {
        return jsonResponse({
          success: true,
          data: {
            id: 'a1',
            status: 'completed',
            extractedText: 'Meera Nair',
            structuredData: {
              personal: {},
              skills: [
                { name: 'MS Excel', confidence: 'high', evidence: 'MS Excel', section: 'skills', method: 'skills_list', reviewStatus: 'verified', category: 'technical' },
                { name: 'Communication', confidence: 'medium', evidence: 'Communication', section: 'skills', method: 'skills_list', reviewStatus: 'verified', category: 'soft' },
                { name: 'English', confidence: 'medium', evidence: 'English - Fluent', section: 'languages', method: 'skills_list', reviewStatus: 'verified', category: 'language', proficiency: 'Fluent' },
                { name: 'AutoCAD', confidence: 'medium', evidence: '…site plans in AutoCAD…', section: 'projects', method: 'dictionary_match', reviewStatus: 'verified', category: 'technical' },
              ],
              reviewCandidates: [],
              links: {},
            },
            warnings: [],
            confidence: 'high',
          },
        })
      }
      return errorEnvelope('NOT_FOUND', 'Missing', 404)
    }
    renderResumesPage()
    await screen.findByText('resume.pdf')

    await user.click(screen.getByRole('button', { name: 'View analysis' }))
    expect(await screen.findByText(/Verified skills \(4\)/)).toBeInTheDocument()
    expect(screen.getAllByText('technical', { exact: false }).length).toBeGreaterThan(0)
    expect(screen.getByText('soft', { exact: false })).toBeInTheDocument()
    expect(screen.getByText('language', { exact: false })).toBeInTheDocument()
    expect(screen.getByText(/Mentioned in projects/)).toBeInTheDocument()
    expect(screen.getAllByText(/Listed/).length).toBeGreaterThan(0)
    expect(screen.getByText('stated proficiency: Fluent')).toBeInTheDocument()
    expect(screen.queryByText(/intermediate|advanced/)).not.toBeInTheDocument()
  })

  it('approves review candidates explicitly and persists the approval', async () => {
    const user = userEvent.setup()
    handleRequest = richHandler((url, init) => {
      if (url.endsWith('/import') && init.method === 'POST') {
        const body = JSON.parse(String(init.body)) as { fields: string[]; includeReview?: string[] }
        expect(body.includeReview).toContain('Landing Page')
        return jsonResponse({
          success: true,
          data: { imported: ['skills'], skipped: [], conflicts: [] },
        })
      }
      return null
    })
    const first = renderResumesPage()
    await screen.findByText('resume.pdf')

    await user.click(screen.getByRole('button', { name: 'View analysis' }))
    await screen.findByText(/Needs review \(1\)/)
    await user.click(screen.getByRole('button', { name: 'Approve candidate Landing Page for import' }))
    expect(screen.getByText(/Approved — imports only with your explicit approval/)).toBeInTheDocument()

    // Approval survives reload via localStorage.
    first.unmount()
    renderResumesPage()
    await screen.findByText('resume.pdf')
    await user.click(screen.getByRole('button', { name: 'View analysis' }))
    expect(await screen.findByText(/Approved — imports only with your explicit approval/)).toBeInTheDocument()

    await user.click(screen.getByRole('button', { name: 'Import' }))
    await user.click(screen.getByRole('button', { name: 'Import to profile' }))
    expect(await screen.findByText(/Imported: skills/)).toBeInTheDocument()
  })
})

describe('ResumesPage import modes', () => {
  const PROFILE = {
    _id: 'p1',
    userId: 'u1',
    firstName: 'Kept',
    lastName: 'Name',
    professionalSummary: 'Existing summary',
    phone: '+1 555 0000',
    location: 'Old Town',
    city: 'Oldville',
    email: 'old@example.com',
    skills: [{ _id: 's1', name: 'Cobol' }, { _id: 's2', name: 'Figma' }, { _id: 's3', name: 'Pascal' }],
    socialLinks: { github: 'https://github.com/kept' },
  }

  const REVIEW_ANALYSIS = {
    id: 'a1',
    status: 'completed',
    extractedText: 'text',
    structuredData: {
      personal: {
        name: 'Chiara New',
        email: 'chiara@new.test',
        phone: '+1 555 0100',
        location: 'Austin, TX',
        city: 'Austin',
        state: 'TX',
        country: 'USA',
      },
      summary: 'New summary from resume.',
      skills: [
        { name: 'Figma', confidence: 'high', evidence: 'Figma', section: 'skills', method: 'skills_list', reviewStatus: 'verified', category: 'design' },
        { name: 'Cobol', confidence: 'high', evidence: 'Cobol', section: 'skills', method: 'skills_list', reviewStatus: 'verified', category: 'technical' },
      ],
      reviewCandidates: [],
      links: { linkedin: 'https://linkedin.com/in/new' },
    },
    warnings: [],
    confidence: 'high',
  }

  function modesHandler(extra?: (url: string, init: RequestInit) => MockResponse | null) {
    return (url: string, init: RequestInit) => {
      if (url.endsWith('/api/health')) return jsonResponse(HEALTH)
      if (url.endsWith('/api/profile')) return jsonResponse({ success: true, data: PROFILE })
      if (url.endsWith('/api/resumes')) return jsonResponse({ success: true, data: [RESUME] })
      if (url.endsWith('/analysis')) return jsonResponse({ success: true, data: REVIEW_ANALYSIS })
      return extra?.(url, init) ?? errorEnvelope('NOT_FOUND', 'Missing', 404)
    }
  }

  async function openImportPanel(user: ReturnType<typeof userEvent.setup>) {
    renderResumesPage()
    await screen.findByText('resume.pdf')
    await user.click(screen.getByRole('button', { name: 'View analysis' }))
    await screen.findByText(/Verified skills \(2\)/)
    await user.click(screen.getByRole('button', { name: 'Import' }))
  }

  it('defaults to Fill empty mode', async () => {
    const user = userEvent.setup()
    handleRequest = modesHandler()
    renderResumesPage()
    await screen.findByText('resume.pdf')
    await user.click(screen.getByRole('button', { name: 'View analysis' }))
    await screen.findByText(/Verified skills \(2\)/)
    await user.click(screen.getByRole('button', { name: 'Import' }))

    const fill = screen.getByRole('radio', { name: 'Fill empty' }) as HTMLInputElement
    expect(fill.checked).toBe(true)
  })

  it('renders current-vs-proposed comparisons in review mode', async () => {
    const user = userEvent.setup()
    handleRequest = modesHandler()
    await openImportPanel(user)

    await user.click(screen.getByRole('radio', { name: 'Review all changes' }))
    expect(await screen.findByText(/Existing summary/)).toBeInTheDocument()
    expect(screen.getByText(/New summary from resume\./)).toBeInTheDocument()
    expect(screen.getAllByText('update').length).toBeGreaterThan(0)
  })

  it('sends only selected fields in selective mode', async () => {
    const user = userEvent.setup()
    vi.spyOn(window, 'confirm').mockReturnValue(true)
    handleRequest = modesHandler((url, init) => {
      if (url.endsWith('/import') && init.method === 'POST') {
        const body = JSON.parse(String(init.body)) as Record<string, unknown>
        expect(body.mode).toBe('select')
        // Only the selected group plus the visibly-staged skills block.
        expect(body.fields).toEqual(['summary', 'skills'])
        return jsonResponse({ success: true, data: { imported: ['summary', 'skills'], skipped: [], conflicts: [], applied: ['summary.professionalSummary'], removed: [] } })
      }
      return null
    })
    await openImportPanel(user)

    await user.click(screen.getByRole('radio', { name: 'Selective update' }))
    // Uncheck every group except summary.
    for (const label of ['personal', 'skills', 'location', 'contact', 'links']) {
      const box = screen.getByRole('checkbox', { name: new RegExp(`^${label}$`) });
      if ((box as HTMLInputElement).checked) await user.click(box)
    }
    await user.click(screen.getByRole('button', { name: 'Import to profile' }))
    expect(await screen.findByText(/Applied: summary.professionalSummary/)).toBeInTheDocument()
  })

  it('requires confirmation before destructive replacement', async () => {
    const user = userEvent.setup()
    const confirm = vi.spyOn(window, 'confirm').mockReturnValue(false)
    handleRequest = modesHandler()
    await openImportPanel(user)

    await user.click(screen.getByRole('radio', { name: 'Selective update' }))
    await user.click(screen.getByRole('radio', { name: 'Replace' }))
    await user.click(screen.getByRole('button', { name: 'Import to profile' }))
    expect(confirm).toHaveBeenCalled()
    const posts = vi.mocked(fetch).mock.calls.filter(([url, init]) =>
      String(url).endsWith('/import') && (init as RequestInit)?.method === 'POST',
    )
    expect(posts).toHaveLength(0)
  })

  it('replaces the skill list after confirmation and shows removals', async () => {
    const user = userEvent.setup()
    vi.spyOn(window, 'confirm').mockReturnValue(true)
    handleRequest = modesHandler((url, init) => {
      if (url.endsWith('/import') && init.method === 'POST') {
        const body = JSON.parse(String(init.body)) as Record<string, unknown>
        expect(body.skillsMode).toBe('replace')
        expect(body.confirmReplace).toBe(true)
        return jsonResponse({
          success: true,
          data: { imported: ['skills'], skipped: [], conflicts: [], applied: ['skills'], removed: ['Pascal'] },
        })
      }
      return null
    })
    await openImportPanel(user)

    await user.click(screen.getByRole('radio', { name: 'Selective update' }))
    await user.click(screen.getByRole('radio', { name: 'Replace' }))
    expect(screen.getByText(/Replace will remove: Pascal/)).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: 'Import to profile' }))
    expect(await screen.findByText(/Removed skills: Pascal/)).toBeInTheDocument()
  })

  it('cancel performs no mutation', async () => {
    const user = userEvent.setup()
    handleRequest = modesHandler()
    await openImportPanel(user)

    await user.click(screen.getByRole('radio', { name: 'Review all changes' }))
    expect(await screen.findByText(/Existing summary/)).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: 'Cancel' }))
    expect(screen.queryByText(/Existing summary/)).not.toBeInTheDocument()
    const posts = vi.mocked(fetch).mock.calls.filter(([url, init]) =>
      String(url).endsWith('/import') && (init as RequestInit)?.method === 'POST',
    )
    expect(posts).toHaveLength(0)
  })

  it('persists mode choices per resume without leaking', async () => {
    const user = userEvent.setup()
    handleRequest = modesHandler()
    await openImportPanel(user)

    await user.click(screen.getByRole('radio', { name: 'Selective update' }))
    const stored = JSON.parse(window.localStorage.getItem('applywise-import-prefs') ?? '{}')
    expect(stored.r1?.mode).toBe('select')
    expect(stored.otherResumeId).toBeUndefined()
  })
})

describe('resume services', () => {  it('retries failed analysis through the verified endpoint', async () => {
    vi.mocked(fetch).mockResolvedValueOnce(
      jsonResponse({ success: true, data: { success: true, analysisId: 'a1' } }) as unknown as Response,
    )
    await expect(retryResumeAnalysis('r1')).resolves.toEqual({ success: true, analysisId: 'a1' })
    expect(vi.mocked(fetch)).toHaveBeenCalledWith(
      expect.stringContaining('/api/resumes/r1/analysis/retry'),
      expect.objectContaining({ method: 'POST' }),
    )
  })

  it('imports selected fields through the verified endpoint', async () => {
    const payload = { imported: ['skills'], skipped: ['bogus'], conflicts: [] as string[] }
    vi.mocked(fetch).mockResolvedValueOnce(jsonResponse({ success: true, data: payload }) as unknown as Response)
    await expect(importResumeToProfile('r1', ['skills'])).resolves.toEqual(payload)
    const [, init] = vi.mocked(fetch).mock.calls[0] as [string, RequestInit]
    expect(String(init.body)).toContain('skills')
  })

  it('downloads binary content without touching direct storage URLs', async () => {
    vi.mocked(fetch).mockResolvedValueOnce({
      ok: true,
      status: 200,
      headers: { get: (name: string) => (name === 'Content-Type' ? 'application/pdf' : null) },
      blob: async () => new Blob(['data'], { type: 'application/pdf' }),
    } as unknown as Response)
    const result = await downloadResumeFile('r1')
    expect(vi.mocked(fetch)).toHaveBeenCalledWith(
      expect.stringContaining('/api/resumes/r1/download'),
      expect.objectContaining({ method: 'GET' }),
    )
    expect(result.contentType).toContain('application/pdf')
    const calledUrl = String(vi.mocked(fetch).mock.calls[0][0])
    expect(calledUrl).not.toContain('supabase')
  })
})
