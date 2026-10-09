import { useParams } from 'react-router-dom'
import { EmptyState } from '@/components/EmptyState'
import { PageHeader } from '@/components/PageHeader'

export function JobDetailPage() {
  const { id } = useParams()
  return (
    <div>
      <PageHeader title="Job detail" description={`Route is ready for job ${id ?? ''}.`} />
      <EmptyState title="Job data is not available yet" description="Job models and APIs land in Phase 5." />
    </div>
  )
}
