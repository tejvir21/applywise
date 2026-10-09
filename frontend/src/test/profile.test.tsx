import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import { cleanup, render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { PreferencesPage } from '@/pages/PreferencesPage'
import { ProfilePage } from '@/pages/ProfilePage'
import { getPreferences, getProfile } from '@/services/profile'

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

const PROFILE = {
  firstName: 'Ada',
  lastName: 'Lovelace',
  headline: 'Engineer',
  yearsOfExperience: 5,
  professionalSummary: 'Builds things.',
  skills: [{ _id: 's1', name: 'TypeScript', level: 'advanced' }],
}

const PREFS = {
  desiredRoles: ['Engineer'],
  preferredLocations: ['Remote'],
  preferredCountries: [],
  workMode: ['remote'],
  employmentTypes: ['full_time'],
  experienceLevels: [],
  salaryMin: 100000,
  salaryMax: 150000,
  salaryCurrency: 'USD',
  salaryPeriod: 'yearly',
  industries: [],
  requiredSkills: [],
  preferredSkills: [],
  excludedCompanies: [],
  excludedJobTypes: [],
}

function renderAt(path: string) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  return render(
    <QueryClientProvider client={client}>
      <MemoryRouter initialEntries={[path]}>
        <Routes>
          <Route path="/profile" element={<ProfilePage />} />
          <Route path="/profile/preferences" element={<PreferencesPage />} />
        </Routes>
      </MemoryRouter>
    </QueryClientProvider>,
  )
}

describe('profile services', () => {
  it('returns null when no profile exists', async () => {
    stubFetch({ success: false, error: { code: 'NOT_FOUND', message: 'Missing', details: {} } }, 404)
    await expect(getProfile()).resolves.toBeNull()
  })

  it('parses preferences', async () => {
    stubFetch({ success: true, data: PREFS })
    await expect(getPreferences()).resolves.toMatchObject({ salaryCurrency: 'USD' })
  })
})

describe('ProfilePage', () => {
  it('loads an existing profile into the form and saves edits', async () => {
    const user = userEvent.setup()
    stubFetch({ success: true, data: PROFILE })
    renderAt('/profile')
    expect(await screen.findByDisplayValue('Ada')).toBeInTheDocument()
    expect(screen.getByText('TypeScript (advanced)')).toBeInTheDocument()

    stubFetch({ success: true, data: { ...PROFILE, headline: 'Senior Engineer' } })
    await user.clear(screen.getByLabelText('Headline'))
    await user.type(screen.getByLabelText('Headline'), 'Senior Engineer')
    await user.click(screen.getByRole('button', { name: 'Save profile' }))

    expect(await screen.findByText('Profile saved.')).toBeInTheDocument()
    expect(vi.mocked(fetch)).toHaveBeenCalledWith(
      expect.stringContaining('/api/profile'),
      expect.objectContaining({ method: 'PATCH' }),
    )
  })

  it('creates a profile when none exists and requires names', async () => {
    const user = userEvent.setup()
    stubFetch({ success: false, error: { code: 'NOT_FOUND', message: 'Missing', details: {} } }, 404)
    renderAt('/profile')
    expect(await screen.findByText('No profile yet')).toBeInTheDocument()

    // Native required-field validation blocks submit with empty names:
    // no create request is issued.
    await user.click(screen.getByRole('button', { name: 'Create profile' }))
    expect(
      vi.mocked(fetch).mock.calls.filter(
        ([url, init]) => String(url).includes('/api/profile') && (init as RequestInit).method === 'POST',
      ),
    ).toHaveLength(0)

    stubFetch({ success: true, data: { ...PROFILE } })
    await user.type(screen.getByLabelText('First name'), 'Ada')
    await user.type(screen.getByLabelText('Last name'), 'Lovelace')
    await user.click(screen.getByRole('button', { name: 'Create profile' }))

    expect(await screen.findByText('Profile created.')).toBeInTheDocument()
    expect(vi.mocked(fetch)).toHaveBeenCalledWith(
      expect.stringContaining('/api/profile'),
      expect.objectContaining({ method: 'POST' }),
    )
  })

  it('adds and removes skills', async () => {
    const user = userEvent.setup()
    stubFetch({ success: true, data: PROFILE })
    renderAt('/profile')
    await screen.findByText('TypeScript (advanced)')

    stubFetch({ success: true, data: { ...PROFILE, skills: [...PROFILE.skills, { _id: 's2', name: 'React' }] } })
    await user.type(screen.getByLabelText('New skill name'), 'React')
    await user.click(screen.getByRole('button', { name: 'Add' }))
    expect(await screen.findByText('Skill added.')).toBeInTheDocument()

    stubFetch({ success: true, data: PROFILE })
    await user.click(screen.getByRole('button', { name: 'Remove skill TypeScript' }))
    expect(await screen.findByText('Skill removed.')).toBeInTheDocument()
  })
})

describe('PreferencesPage', () => {
  it('loads preferences and saves changes', async () => {
    const user = userEvent.setup()
    stubFetch({ success: true, data: PREFS })
    renderAt('/profile/preferences')
    expect(await screen.findByDisplayValue('Engineer')).toBeInTheDocument()
    expect(screen.getByDisplayValue('100000')).toBeInTheDocument()

    stubFetch({ success: true, data: { ...PREFS, desiredRoles: ['Engineer', 'Designer'] } })
    await user.clear(screen.getByLabelText('Desired roles'))
    await user.type(screen.getByLabelText('Desired roles'), 'Engineer, Designer')
    await user.click(screen.getByRole('button', { name: 'Save preferences' }))

    expect(await screen.findByText('Preferences saved.')).toBeInTheDocument()
    expect(vi.mocked(fetch)).toHaveBeenCalledWith(
      expect.stringContaining('/api/profile/preferences'),
      expect.objectContaining({ method: 'PUT' }),
    )
  })

  it('rejects an inverted salary range before requesting', async () => {
    const user = userEvent.setup()
    stubFetch({ success: true, data: PREFS })
    renderAt('/profile/preferences')
    await screen.findByDisplayValue('Engineer')

    const calls = vi.mocked(fetch).mock.calls.length
    await user.clear(screen.getByLabelText('Minimum salary'))
    await user.type(screen.getByLabelText('Minimum salary'), '200000')
    await user.clear(screen.getByLabelText('Maximum salary'))
    await user.type(screen.getByLabelText('Maximum salary'), '100000')
    await user.click(screen.getByRole('button', { name: 'Save preferences' }))

    expect(await screen.findByText('Minimum salary cannot exceed maximum salary.')).toBeInTheDocument()
    expect(vi.mocked(fetch).mock.calls.length).toBe(calls)
  })
})
