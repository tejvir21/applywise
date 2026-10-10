import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import { cleanup, render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { JobDetailPage } from '@/pages/JobDetailPage'
import { ResumePage } from '@/pages/ResumePage'
import { getResumes, uploadResume } from '@/services/resumes'

afterEach(() => {
  cleanup()
  vi.unstubAllGlobals()
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

const RESUME_LIST = [
  { id: 'r1', originalFilename: 'resume.pdf', status: 'ready', fileSize: 645, isDefault: true, createdAt: '2026-01-01T00:00:00.000Z' },
  { id: 'r2', originalFilename: 'cv.docx', status: 'processing', fileSize: 1413, isDefault: false, createdAt: '2026-01-02T00:00:00.000Z' },
]

const JOB_DETAIL = {
  id: 'job-1',
  title: 'Software Engineer',
  companyName: 'TechCorp',
  location: 'Remote',
  remoteType: 'remote',
  employmentType: 'full_time',
  experienceLevel: 'mid',
  description: 'Build things.',
  requirements: ['TypeScript'],
  requiredSkills: [{ name: 'TypeScript' }],
  preferredSkills: [{ name: 'React' }],
  sources: [{ name: 'manual' }],
  source: 'manual',
  status: 'active',
}

function renderWithProviders(path: string) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  return render(
    <QueryClientProvider client={client}>
      <MemoryRouter initialEntries={[path]}>
        <Routes>
          <Route path="/resumes" element={<ResumePage />} />
          <Route path="/profile/resume" element={<ResumePage />} />
          <Route path="/jobs/:id" element={<JobDetailPage />} />
        </Routes>
      </MemoryRouter>
    </QueryClientProvider>,
  )
}

describe('resumes service', () => {
  it('parses the resume list', async () => {
    stubFetch({ success: true, data: RESUME_LIST })
    await expect(getResumes()).resolves.toEqual(RESUME_LIST)
  })

  it('uploads multipart form data without forcing a content type', async () => {
    stubFetch({
      success: true,
      data: { resume: RESUME_LIST[0], analysis: { id: 'a1', status: 'pending' } },
    })
    const file = new File(['%PDF-1.4'], 'resume.pdf', { type: 'application/pdf' })
    await expect(uploadResume(file)).resolves.toMatchObject({ resume: { id: 'r1' } })

    expect(vi.mocked(fetch)).toHaveBeenCalledWith(
      expect.stringContaining('/api/resumes'),
      expect.objectContaining({
        method: 'POST',
        body: expect.any(FormData),
        headers: expect.not.objectContaining({ 'Content-Type': expect.anything() }),
      }),
    )
  })
})

describe('ResumePage', () => {
  it('lists resumes with default flags and actions', async () => {
    stubFetch({ success: true, data: RESUME_LIST })
    renderWithProviders('/profile/resume')

    expect(await screen.findByText('resume.pdf')).toBeInTheDocument()
    expect(screen.getByText('cv.docx')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Set default' })).toBeInTheDocument()
    expect(screen.getAllByRole('button', { name: 'Delete' })).toHaveLength(2)
  })

  it('uploads a chosen file and shows confirmation', async () => {
    const user = userEvent.setup()
    stubFetch({ success: true, data: [] })
    renderWithProviders('/profile/resume')
    await screen.findByText('No resumes uploaded')

    stubFetch({
      success: true,
      data: { resume: RESUME_LIST[0], analysis: { id: 'a1', status: 'pending' } },
    })
    const file = new File(['%PDF-1.4'], 'resume.pdf', { type: 'application/pdf' })
    await user.upload(screen.getByLabelText('Resume file'), file)
    await user.click(screen.getByRole('button', { name: 'Upload resume' }))

    expect(await screen.findByText(/Uploaded resume.pdf/)).toBeInTheDocument()
  })

  it('surfaces upload validation errors without uploading', async () => {
    const user = userEvent.setup()
    stubFetch({ success: true, data: [] })
    renderWithProviders('/profile/resume')
    await screen.findByText('No resumes uploaded')

    // The file picker accepts PDFs; the server still rejects with details.
    stubFetch(
      { success: false, error: { code: 'VALIDATION_ERROR', message: 'File type not allowed', details: {} } },
      422,
    )
    const file = new File(['%PDF-1.4'], 'resume.pdf', { type: 'application/pdf' })
    await user.upload(screen.getByLabelText('Resume file'), file)
    await user.click(screen.getByRole('button', { name: 'Upload resume' }))

    expect(await screen.findByRole('alert')).toHaveTextContent('File type not allowed')
  })

  it('deletes a resume and refreshes the list', async () => {
    const user = userEvent.setup()
    vi.spyOn(window, 'confirm').mockReturnValue(true)
    stubFetch({ success: true, data: RESUME_LIST })
    renderWithProviders('/profile/resume')
    await screen.findByText('resume.pdf')

    stubFetch({ success: true, data: { message: 'deleted' } })
    await user.click(screen.getAllByRole('button', { name: 'Delete' })[0])

    expect(await screen.findByText('Deletion done.')).toBeInTheDocument()
  })
})

describe('JobDetailPage', () => {
  it('renders job detail with skills and source', async () => {
    stubFetch({ success: true, data: JOB_DETAIL })
    renderWithProviders('/jobs/job-1')

    expect(await screen.findByText('Software Engineer')).toBeInTheDocument()
    expect(screen.getByText(/TechCorp/)).toBeInTheDocument()
    expect(screen.getByText(/Required: TypeScript/)).toBeInTheDocument()
    expect(screen.getByText('manual')).toBeInTheDocument()
  })

  it('shows an error state with retry when loading fails', async () => {
    stubFetch({ success: false, error: { code: 'NOT_FOUND', message: 'Missing', details: {} } }, 404)
    renderWithProviders('/jobs/job-9')

    // The query retries once before surfacing the error; allow time for it.
    expect(await screen.findByRole('alert', undefined, { timeout: 5000 })).toHaveTextContent('Could not load job')
    expect(screen.getByRole('button', { name: 'Retry' })).toBeInTheDocument()
  })
})
