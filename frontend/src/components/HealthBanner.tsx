import { Badge } from '@/components/ui/badge'
import { useHealth } from '@/hooks/useHealth'

export function HealthBanner() {
  const { data, isLoading, isError } = useHealth()

  if (isLoading) {
    return <Badge>Checking API…</Badge>
  }

  if (isError || !data) {
    return <Badge variant="danger">API unreachable</Badge>
  }

  if (data.status === 'ok') {
    return <Badge variant="success">API healthy</Badge>
  }

  return <Badge variant="warning">API degraded · MongoDB {data.mongodb}</Badge>
}
