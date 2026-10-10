/** User-facing messages for resume API failures, keyed by HTTP status. */

function statusOf(err: unknown): number | undefined {
  const status = (err as { status?: unknown })?.status
  return typeof status === 'number' ? status : undefined
}

/** Clear, actionable messages per HTTP status. Upload vs analysis failures
 *  are distinguished by the caller-supplied action label. */
export function resumeErrorMessage(err: unknown, action: string): string {
  const raw = err instanceof Error && err.message ? err.message : `${action} failed.`
  switch (statusOf(err)) {
    case 401:
      return 'You are signed out. Sign in again, then retry.'
    case 403:
      return 'You do not have access to this resume.'
    case 404:
      return 'Resume not found. It may have been deleted — refresh the list and retry.'
    case 409:
      return `Storage conflict: ${raw} Nothing was overwritten.`
    case 413:
      return 'File exceeds the 10 MB limit. Choose a smaller file and retry.'
    case 422:
      return raw
    case 503:
      return 'Resume storage is temporarily unavailable. Wait a moment and retry — nothing was lost.'
    default:
      return raw
  }
}
