/**
 * Frontend challenge pause / recovery tests (Phase 9.1.15).
 *
 * Verifies the candidate-facing UI for a paused/manual-intervention automation
 * execution: status display, resume/recovery action, and approval invalidation.
 * Tests the AutomationExecutionPanel component directly with a paused execution.
 */

import { cleanup, render, screen, fireEvent } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { AutomationExecutionPanel } from '@/components/AutomationExecutionPanel'

afterEach(() => {
  cleanup()
})

function renderPausedPanel() {
  const onResume = vi.fn()
  const onCancel = vi.fn()

  render(
    <AutomationExecutionPanel
      execution={{
        id: 'exec-1',
        userId: 'user-1',
        applicationUrl: 'https://example.com/apply',
        state: 'PAUSED',
        pauseReason: 'Challenge detected: CAPTCHA - manual intervention required',
        approvedForExecution: false,
        approvalFingerprint: undefined,
        fieldMappings: [],
      } as any}
      onPause={vi.fn()}
      onResume={onResume}
      onCancel={onCancel}
      onReview={vi.fn()}
    />
  )

  return { onResume, onCancel }
}

describe('automation challenge recovery UI', () => {
  it('displays paused/manual-intervention status and reason', () => {
    renderPausedPanel()
    expect(screen.getByText('Paused')).toBeInTheDocument()
    expect(screen.getByText(/Challenge detected: CAPTCHA/i)).toBeInTheDocument()
  })

  it('shows the challenge pause reason without exposing secrets', () => {
    renderPausedPanel()
    expect(screen.getByText(/Challenge detected: CAPTCHA - manual intervention required/i)).toBeInTheDocument()
    expect(screen.queryByText(/password/i)).not.toBeInTheDocument()
    expect(screen.queryByText(/otp/i)).not.toBeInTheDocument()
  })

  it('offers an explicit resume/reinspection action when paused', () => {
    renderPausedPanel()
    expect(screen.getByRole('button', { name: /^Resume$/ })).toBeInTheDocument()
  })

  it('calls the onResume handler when the resume button is clicked', () => {
    const { onResume } = renderPausedPanel()
    fireEvent.click(screen.getByRole('button', { name: /^Resume$/ }))
    expect(onResume).toHaveBeenCalledTimes(1)
  })

  it('shows that previous approval is invalidated (not approved)', () => {
    renderPausedPanel()
    // No "Approve for filling" fill action should be primary; state is PAUSED
    expect(screen.queryByRole('button', { name: /Fill form/ })).not.toBeInTheDocument()
    expect(screen.getByRole('button', { name: /^Resume$/ })).toBeInTheDocument()
  })

  it('does not imply submission when paused', () => {
    renderPausedPanel()
    expect(screen.queryByText(/submitted/i)).not.toBeInTheDocument()
    expect(screen.queryByText(/Submit/i)).not.toBeInTheDocument()
  })
})
