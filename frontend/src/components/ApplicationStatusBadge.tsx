import { Badge } from '@/components/ui/badge'

const statusVariants: Record<string, 'default' | 'accent' | 'success' | 'warning' | 'danger' | 'info'> = {
  applied: 'info',
  interviewing: 'accent',
  offer: 'success',
  rejected: 'danger',
  withdrawn: 'default',
  saved: 'default',
}

export function ApplicationStatusBadge({ status }: { status: string }) {
  const variant = statusVariants[status.toLowerCase()] ?? 'default'
  return <Badge variant={variant}>{status.replace(/_/g, ' ')}</Badge>
}
