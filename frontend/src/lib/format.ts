/**
 * Format a timestamp for display.
 *
 * Returns null for missing or unparseable input so callers can omit the field
 * entirely rather than rendering "Invalid Date" or inventing a value.
 */
export function formatDateTime(value?: string | Date | null): string | null {
  if (!value) return null
  const date = value instanceof Date ? value : new Date(value)
  if (Number.isNaN(date.getTime())) return null
  return date.toLocaleString(undefined, {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  })
}

/**
 * Short relative description ("2 hours ago"). Falls back to an absolute
 * timestamp for anything older than a week, and to null when unparseable.
 */
export function formatRelativeTime(value?: string | Date | null): string | null {
  if (!value) return null
  const date = value instanceof Date ? value : new Date(value)
  const time = date.getTime()
  if (Number.isNaN(time)) return null

  const diffMs = Date.now() - time
  if (diffMs < 0) return formatDateTime(date)

  const seconds = Math.floor(diffMs / 1000)
  if (seconds < 60) return 'just now'
  const minutes = Math.floor(seconds / 60)
  if (minutes < 60) return `${minutes} minute${minutes === 1 ? '' : 's'} ago`
  const hours = Math.floor(minutes / 60)
  if (hours < 24) return `${hours} hour${hours === 1 ? '' : 's'} ago`
  const days = Math.floor(hours / 24)
  if (days <= 7) return `${days} day${days === 1 ? '' : 's'} ago`
  return formatDateTime(date)
}