import { PageHeader } from '@/components/PageHeader'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'

export function SettingsPage() {
  return (
    <div>
      <PageHeader
        title="Settings"
        description="Account, AI provider, and privacy controls will live here. External AI is opt-in."
      />
      <Card>
        <CardHeader>
          <CardTitle>Phase 1</CardTitle>
        </CardHeader>
        <CardContent className="text-sm text-slate-600">
          Authentication, provider selection, and data-export controls are not implemented yet.
        </CardContent>
      </Card>
    </div>
  )
}
