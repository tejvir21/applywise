import { EmptyState } from '@/components/EmptyState'
import { PageHeader } from '@/components/PageHeader'

export function ResumePage() {
  return (
    <div>
      <PageHeader
        title="Resumes"
        description="Upload, parse, and review resumes in Phase 4. Files are private to the owning user."
      />
      <EmptyState title="No resumes uploaded" description="Storage and parsing are not enabled in Phase 1." />
    </div>
  )
}
