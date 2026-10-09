import { EmptyState } from '@/components/EmptyState'
import { PageHeader } from '@/components/PageHeader'

export function PreferencesPage() {
  return (
    <div>
      <PageHeader
        title="Job preferences"
        description="Roles, locations, salary bounds, and exclusions are configured in Phase 3."
      />
      <EmptyState title="No preferences saved" description="The system does not assume preferred roles or salary." />
    </div>
  )
}
