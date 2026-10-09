export function ApplicationStatusBadge({ status }: { status: string }) {
  return (
    <span className="inline-flex items-center rounded-full bg-slate-200 px-2.5 py-0.5 text-xs font-semibold text-slate-700">
      {status}
    </span>
  )
}
