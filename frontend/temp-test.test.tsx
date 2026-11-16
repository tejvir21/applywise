import React from 'react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import { render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it } from 'vitest'
import { AutomationPage } from '@/pages/AutomationPage'

afterEach(() => {
  // cleanup not available as default, skip
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
    </QueryClientProvider>
  )
}

describe('test', () => {
  it('renders start automation', () => {
    const { result } = renderPage()
    expect(screen.getByText('Start Automation')).toBeInTheDocument()
  })
})