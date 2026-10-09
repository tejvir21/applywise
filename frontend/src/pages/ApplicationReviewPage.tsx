import { useParams } from 'react-router-dom'
import { EmptyState } from '@/components/EmptyState'
import { PageHeader } from '@/components/PageHeader'

export function ApplicationReviewPage() {
  const { id } = useParams()
  return (
    <div>
      <PageHeader
        title="Review application"
        description="Human approval is required before submission. This screen is a route shell until Phase 8."
      />
      <EmptyState
        title={`Review for ${id ?? 'application'} is not ready`}
        description="Approve, reject, edit, and save-for-later actions will appear here. Nothing is submitted automatically."
      />
    </div>
  )
}
