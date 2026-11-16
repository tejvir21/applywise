import { cn } from '@/lib/utils'

/**
 * Neutral typographic company placeholder.
 *
 * ApplyWise does not have verified company logos, and inventing one would be
 * misleading. This renders a monogram derived from the company name, with a
 * stable colour so the same company keeps the same tile across listings.
 */
const PALETTE = [
  'bg-brand-50 text-brand-700',
  'bg-emerald-50 text-emerald-700',
  'bg-amber-50 text-amber-800',
  'bg-violet-50 text-violet-700',
  'bg-rose-50 text-rose-700',
  'bg-cyan-50 text-cyan-700',
  'bg-slate-100 text-slate-700',
] as const

/** Deterministic index from the company name so colour is stable per company. */
function paletteFor(name: string): string {
  let hash = 0
  for (let i = 0; i < name.length; i += 1) {
    hash = (hash * 31 + name.charCodeAt(i)) % 100003
  }
  return PALETTE[hash % PALETTE.length]
}

function initialsFor(name: string): string {
  const words = name
    .replace(/[^\p{L}\p{N}\s]/gu, ' ')
    .split(/\s+/)
    .filter(Boolean)
  if (words.length === 0) return '?'
  if (words.length === 1) return words[0]!.slice(0, 2).toUpperCase()
  return `${words[0]![0] ?? ''}${words[1]![0] ?? ''}`.toUpperCase()
}

export function CompanyAvatar({
  name,
  size = 'md',
  className,
}: {
  name: string
  size?: 'sm' | 'md' | 'lg'
  className?: string
}) {
  const sizes = {
    sm: 'size-8 text-[11px] rounded-[8px]',
    md: 'size-11 text-[13px] rounded-[10px]',
    lg: 'size-14 text-[16px] rounded-[12px]',
  } as const

  return (
    <span
      aria-hidden="true"
      className={cn(
        'inline-flex shrink-0 items-center justify-center font-semibold tracking-tight select-none',
        sizes[size],
        paletteFor(name),
        className,
      )}
    >
      {initialsFor(name)}
    </span>
  )
}