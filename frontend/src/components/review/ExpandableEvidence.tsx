import { useRef, useState } from 'react'
import { ChevronDown } from 'lucide-react'
import { cn } from '@/lib/utils'

/** Short excerpt with an expandable full value. Never dumps long paragraphs. */
export function ExpandableEvidence({ text, label = 'Evidence' }: { text: string; label?: string }) {
  const [open, setOpen] = useState(false)
  const buttonRef = useRef<HTMLButtonElement | null>(null)
  const preview = text.length > 90 ? `${text.slice(0, 90)}…` : text
  if (text.length <= 90) {
    return (
      <span className="block break-words text-xs text-slate-500">
        {label}: “{text}”
      </span>
    )
  }
  return (
    <span className="block text-xs text-slate-500">
      {label}: “{open ? text : preview}”{' '}
      <button
        ref={buttonRef}
        type="button"
        aria-expanded={open}
        onClick={() => {
          setOpen((v) => !v)
          // Keep keyboard focus visible on the toggle itself.
          requestAnimationFrame(() => buttonRef.current?.focus({ preventScroll: true }))
        }}
        className="inline-flex items-center gap-0.5 rounded text-[11px] font-medium text-brand-700 underline underline-offset-2 hover:text-brand-600 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-600"
      >
        {open ? 'Show less' : 'Show more'}
        <ChevronDown className={cn('h-3 w-3 transition-transform', open && 'rotate-180')} aria-hidden="true" />
      </button>
    </span>
  )
}
