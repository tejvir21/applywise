import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { PageHeader } from '@/components/PageHeader'

describe('PageHeader', () => {
  it('renders title and description', () => {
    render(<PageHeader title="Dashboard" description="Pipeline overview" />)
    expect(screen.getByRole('heading', { name: 'Dashboard' })).toBeInTheDocument()
    expect(screen.getByText('Pipeline overview')).toBeInTheDocument()
  })
})
