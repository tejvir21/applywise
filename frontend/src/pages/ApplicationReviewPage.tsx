import { Link, useParams } from 'react-router-dom'
import { EmptyState } from '@/components/EmptyState'
import { PageHeader } from '@/components/PageHeader'

export function ApplicationReviewPage() {
  const { id } = useParams()
  return (
    <div>
      <PageHeader
        title="Review application"
        description="Human approval is required before anything proceeds. Review actions live on the application detail page."
      />
      <EmptyState
        title="This is a route shell"
        description="Nothing is submitted automatically."
      />
      {id && (
        <p className="mt-3 text-sm">
          <Link className="text-brand-700 underline" to={`/applications/${id}`}>
            Open the application detail page to review it
          </Link>
        </p>
      )}
    </div>
  )
}
