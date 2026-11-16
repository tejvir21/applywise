/** JobPriorityBadge component tests (Phase 8.3.12). */

import { describe, it, expect, afterEach } from 'vitest'
import { render, screen, cleanup } from '@testing-library/react'
import { JobPriorityBadge } from '@/components/JobPriorityBadge'
import type { JobPriorityLabel } from '@/services/jobs'

const PRIORITIES: JobPriorityLabel[] = [
  'HIGH_PRIORITY',
  'GOOD_MATCH_NEEDS_IMPROVEMENT',
  'PROFILE_INCOMPLETE',
  'LOW_MATCH',
]

const LABEL_TEXT: Record<JobPriorityLabel, string> = {
  HIGH_PRIORITY: 'High priority',
  GOOD_MATCH_NEEDS_IMPROVEMENT: 'Good match — needs improvement',
  PROFILE_INCOMPLETE: 'Profile incomplete',
  LOW_MATCH: 'Low match',
}

const BADGE_CLASS: Record<JobPriorityLabel, string> = {
  HIGH_PRIORITY: 'bg-emerald-100',
  GOOD_MATCH_NEEDS_IMPROVEMENT: 'bg-amber-100',
  PROFILE_INCOMPLETE: 'bg-slate-100',
  LOW_MATCH: 'bg-rose-100',
}

describe('JobPriorityBadge', () => {
  afterEach(() => {
    cleanup()
  })
  it('renders a badge for each priority label', () => {
    for (const priority of PRIORITIES) {
      render(<JobPriorityBadge priority={priority} />)
      expect(screen.getByText(LABEL_TEXT[priority])).toBeInTheDocument()
    }
  })

  it('renders HIGH_PRIORITY with emerald styling', () => {
    render(<JobPriorityBadge priority="HIGH_PRIORITY" />)
    const badge = screen.getByText('High priority')
    expect(badge).toHaveClass(BADGE_CLASS.HIGH_PRIORITY)
  })

  it('renders GOOD_MATCH_NEEDS_IMPROVEMENT with amber styling', () => {
    render(<JobPriorityBadge priority="GOOD_MATCH_NEEDS_IMPROVEMENT" />)
    const badge = screen.getByText('Good match — needs improvement')
    expect(badge).toHaveClass(BADGE_CLASS.GOOD_MATCH_NEEDS_IMPROVEMENT)
  })

  it('renders PROFILE_INCOMPLETE with slate styling', () => {
    render(<JobPriorityBadge priority="PROFILE_INCOMPLETE" />)
    const badge = screen.getByText('Profile incomplete')
    expect(badge).toHaveClass(BADGE_CLASS.PROFILE_INCOMPLETE)
  })

  it('renders LOW_MATCH with rose styling', () => {
    render(<JobPriorityBadge priority="LOW_MATCH" />)
    const badge = screen.getByText('Low match')
    expect(badge).toHaveClass(BADGE_CLASS.LOW_MATCH)
  })
})
