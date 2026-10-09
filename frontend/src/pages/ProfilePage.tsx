import { EmptyState } from '@/components/EmptyState'
import { PageHeader } from '@/components/PageHeader'

export function ProfilePage() {
  return (
    <div>
      <PageHeader
        title="Candidate profile"
        description="Structured personal and professional information is added in Phase 3."
      />
      <EmptyState title="Profile is empty" description="No candidate data is assumed or fabricated." />
    </div>
  )
}
