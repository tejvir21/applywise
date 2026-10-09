import { Link } from 'react-router-dom'
import { PageHeader } from '@/components/PageHeader'

export function NotFoundPage() {
  return (
    <div>
      <PageHeader title="Page not found" description="The route does not exist." />
      <Link className="text-sm text-brand-700 underline" to="/dashboard">
        Back to dashboard
      </Link>
    </div>
  )
}
