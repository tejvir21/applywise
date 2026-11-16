/** Browser automation execution page (Phase 9.1.2).
 *
 * Candidate-facing workflow for browser-based form inspection and filling.
 * Does NOT submit applications — final submission remains manual.
 */

import { useState } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { PageHeader } from '@/components/PageHeader'
import { Card, CardContent } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { AutomationExecutionPanel } from '@/components/AutomationExecutionPanel'
import { Loader2, AlertCircle } from 'lucide-react'
import {
  useAutomationExecution,
  useCreateAutomationExecution,
  usePauseAutomationExecution,
  useResumeAutomationExecution,
  useCancelAutomationExecution,
  useReviewAutomationExecution,
} from '@/hooks/useAutomation'


export function AutomationPage() {
  const { id: jobId } = useParams()
  const navigate = useNavigate()
  const [executionId, setExecutionId] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)

  const executionQuery = useAutomationExecution(executionId)
  const createMutation = useCreateAutomationExecution()
  const pauseMutation = usePauseAutomationExecution()
  const resumeMutation = useResumeAutomationExecution()
  const cancelMutation = useCancelAutomationExecution()
  const reviewMutation = useReviewAutomationExecution()

  const execution = executionQuery.data

  async function handleStart() {
    if (!jobId) return
    setError(null)
    try {
      const result = await createMutation.mutateAsync({
        applicationUrl: window.location.origin + '/jobs/' + jobId,
        jobId,
      })
      setExecutionId(result.id)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to start automation')
    }
  }

  async function handlePause() {
    if (!executionId) return
    try {
      await pauseMutation.mutateAsync({ executionId, reason: 'Candidate requested pause' })
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to pause')
    }
  }

  async function handleResume() {
    if (!executionId) return
    setError(null)
    try {
      await resumeMutation.mutateAsync({ executionId })
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to resume')
    }
  }

  async function handleCancel() {
    if (!executionId) return
    try {
      await cancelMutation.mutateAsync(executionId)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to cancel')
    }
  }

  async function handleReview(approved: boolean) {
    if (!executionId) return
    try {
      await reviewMutation.mutateAsync({ executionId, approved })
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to review')
    }
  }

  if (createMutation.isPending) {
    return (
      <div className="mx-auto max-w-6xl space-y-8">
        <PageHeader title="Automation" description="Starting browser automation…" eyebrow="AUTOMATION" />
        <Card className="border-[var(--border)] shadow-[var(--shadow-sm)]">
          <CardContent className="flex items-center gap-3 py-10 text-center text-sm text-[var(--text-secondary)]">
            <Loader2 className="h-4 w-4 animate-spin" /> Starting automation…
          </CardContent>
        </Card>
      </div>
    )
  }

  if (error) {
    return (
      <div className="mx-auto max-w-6xl space-y-8">
        <PageHeader title="Automation" description="Automation error." eyebrow="AUTOMATION" />
        <Card className="border-[var(--border)] shadow-[var(--shadow-sm)]">
          <CardContent className="flex flex-col items-center gap-3 py-10 text-center">
            <AlertCircle className="h-6 w-6 text-[var(--text-tertiary)]" />
            <p className="text-sm font-medium text-[var(--text-primary)]">{error}</p>
            <Button variant="secondary" size="sm" onClick={() => setError(null)}>
              Retry
            </Button>
          </CardContent>
        </Card>
      </div>
    )
  }

  if (!executionId) {
    return (
      <div className="mx-auto max-w-6xl space-y-8">
        <PageHeader
          title="Browser Automation"
          description="Inspect and fill job application forms automatically."
          eyebrow="AUTOMATION"
          actions={
            <Button variant="ghost" size="sm" onClick={() => navigate(`/jobs/${jobId}`)}>
              Back to job
            </Button>
          }
        />
        <Card className="border-[var(--border)] shadow-[var(--shadow-sm)]">
          <CardContent className="flex flex-col items-center gap-3 py-10 text-center">
            <p className="text-sm text-[var(--text-secondary)]">
              Start browser automation to inspect the application form for this job.
            </p>
            <Button onClick={handleStart}>Start Automation</Button>
          </CardContent>
        </Card>
      </div>
    )
  }

  if (executionQuery.isPending) {
    return (
      <div className="mx-auto max-w-6xl space-y-8">
        <PageHeader title="Automation" description="Loading execution…" eyebrow="AUTOMATION" />
        <Card className="border-[var(--border)] shadow-[var(--shadow-sm)]">
          <CardContent className="flex items-center gap-3 py-10 text-center text-sm text-[var(--text-secondary)]">
            <Loader2 className="h-4 w-4 animate-spin" /> Loading…
          </CardContent>
        </Card>
      </div>
    )
  }

  if (executionQuery.isError || !execution) {
    return (
      <div className="mx-auto max-w-6xl space-y-8">
        <PageHeader title="Automation" description="Could not load execution." eyebrow="AUTOMATION" />
        <Card className="border-[var(--border)] shadow-[var(--shadow-sm)]">
          <CardContent className="flex flex-col items-center gap-3 py-10 text-center">
            <AlertCircle className="h-6 w-6 text-[var(--text-tertiary)]" />
            <p className="text-sm font-medium text-[var(--text-primary)]">
              {error || 'Could not load execution.'}
            </p>
          </CardContent>
        </Card>
      </div>
    )
  }

  return (
    <div className="mx-auto max-w-6xl space-y-8">
      <PageHeader
        title="Browser Automation"
        description="Inspect and fill job application forms automatically."
        eyebrow="AUTOMATION"
        actions={
          <Button variant="ghost" size="sm" onClick={() => navigate(`/jobs/${jobId}`)}>
            Back to job
          </Button>
        }
      />
      <AutomationExecutionPanel
        execution={execution}
        onPause={handlePause}
        onResume={handleResume}
        onCancel={handleCancel}
        onReview={(approved) => handleReview(approved)}
      />

      {execution.state === 'PAUSED' && execution.pauseReason && (
        <Card className="border-[var(--border)] shadow-[var(--shadow-sm)] bg-amber-50 border-amber-200">
          <CardContent className="p-5 sm:p-6">
            <h3 className="text-sm font-semibold text-amber-900">Manual action required</h3>
            <p className="text-sm text-amber-800 mt-1">
              {execution.pauseReason}
            </p>
            <p className="text-sm text-amber-700 mt-3">
              A challenge was detected and filling has been stopped. Your previous approval has been
              invalidated. Click <strong>Resume</strong> to re-inspect the form, then review and
              re-approve before filling can continue. No challenge is solved or bypassed automatically.
            </p>
          </CardContent>
        </Card>
      )}
    </div>
  )
}