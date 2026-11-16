import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import { cleanup, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it } from 'vitest'
import { AutomationPage } from '@/pages/AutomationPage'

afterEach(() => {
  cleanup()
})

function renderPage() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  return render(
    <QueryClientProvider client={client}>
      <MemoryRouter initialEntries={['/automation/job-1']}>
        <Routes>
          <Route path="/automation/:id" element={<AutomationPage />} />
        </Routes>
      </MemoryRouter>
    </QueryClientProvider>,
  )
}

describe('automation page', () => {
  it('renders the start automation screen', () => {
    renderPage()
    expect(screen.getByText('Start Automation')).toBeInTheDocument()
    expect(screen.getByText(/Inspect and fill job application forms automatically/i)).toBeInTheDocument()
  })
})
