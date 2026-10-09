import { PageHeader } from '@/components/PageHeader'
import { Badge } from '@/components/ui/badge'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { useHealth } from '@/hooks/useHealth'

const funnel = ['Discovered', 'Matched', 'Review', 'Approved', 'Submitted', 'Interview', 'Offer']

const cards = [
  { label: 'Jobs discovered', value: '—' },
  { label: 'Strong matches', value: '—' },
  { label: 'Pending review', value: '—' },
  { label: 'Submitted', value: '—' },
  { label: 'Interviews', value: '—' },
  { label: 'Offers', value: '—' },
]

export function DashboardPage() {
  const { data, isLoading, isError } = useHealth()

  return (
    <div>
      <PageHeader
        title="Dashboard"
        description="Pipeline metrics will appear here after jobs and applications are added. Phase 1 only reports service health."
      />
      <div className="mb-6 grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
        {cards.map((card) => (
          <Card key={card.label}>
            <CardHeader>
              <CardTitle>{card.label}</CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-2xl font-semibold text-slate-400">{card.value}</p>
            </CardContent>
          </Card>
        ))}
      </div>
      <Card className="mb-6">
        <CardHeader>
          <CardTitle>Application funnel</CardTitle>
        </CardHeader>
        <CardContent>
          <ol className="flex flex-wrap gap-2">
            {funnel.map((step) => (
              <li key={step} className="rounded-full bg-slate-100 px-3 py-1 text-xs font-medium text-slate-600">
                {step}
              </li>
            ))}
          </ol>
        </CardContent>
      </Card>
      <Card>
        <CardHeader>
          <CardTitle>System status</CardTitle>
        </CardHeader>
        <CardContent className="space-y-2 text-sm text-slate-700">
          {isLoading && <p>Loading health…</p>}
          {isError && <p>Could not reach the API. Start the backend on port 8000.</p>}
          {data && (
            <dl className="grid gap-2 sm:grid-cols-2">
              <div>
                Status{' '}
                <Badge variant={data.status === 'ok' ? 'success' : 'warning'}>{data.status}</Badge>
              </div>
              <div>MongoDB: {data.mongodb}</div>
              <div>AI provider: {data.ai_provider}</div>
              <div>Storage: {data.storage_provider}</div>
              <div>Automation: {data.browser_automation_provider}</div>
              <div>Version: {data.version}</div>
            </dl>
          )}
        </CardContent>
      </Card>
    </div>
  )
}
