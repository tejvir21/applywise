import type { KeyboardEvent } from 'react'
import { cn } from '@/lib/utils'

export interface ReviewTab {
  id: string
  label: string
  count?: number
}

/** Accessible segmented tab control with arrow-key navigation. */
export function CategoryTabs({
  tabs,
  active,
  onChange,
}: {
  tabs: ReviewTab[]
  active: string
  onChange: (id: string) => void
}) {
  function onKeyDown(event: KeyboardEvent<HTMLDivElement>) {
    if (event.key !== 'ArrowRight' && event.key !== 'ArrowLeft') return
    event.preventDefault()
    const index = tabs.findIndex((t) => t.id === active)
    const delta = event.key === 'ArrowRight' ? 1 : -1
    const next = tabs[(index + delta + tabs.length) % tabs.length]
    onChange(next.id)
    document.getElementById(`review-tab-${next.id}`)?.focus()
  }

  return (
    <div
      role="tablist"
      aria-label="Review categories"
      onKeyDown={onKeyDown}
      className="flex flex-wrap gap-1 rounded-xl border border-slate-200 bg-white p-1"
    >
      {tabs.map((tab) => {
        const selected = tab.id === active
        return (
          <button
            key={tab.id}
            id={`review-tab-${tab.id}`}
            role="tab"
            aria-selected={selected}
            aria-controls={`review-panel-${tab.id}`}
            tabIndex={selected ? 0 : -1}
            type="button"
            onClick={() => onChange(tab.id)}
            className={cn(
              'inline-flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-sm font-medium transition-colors',
              'focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-600',
              selected
                ? 'bg-slate-900 text-white'
                : 'text-slate-600 hover:bg-slate-100 hover:text-slate-900',
            )}
          >
            {tab.label}
            {tab.count !== undefined && (
              <span
                className={cn(
                  'rounded-full px-1.5 py-0.5 text-[11px] font-semibold',
                  selected ? 'bg-white/20 text-white' : 'bg-slate-100 text-slate-600',
                )}
              >
                {tab.count}
              </span>
            )}
          </button>
        )
      })}
    </div>
  )
}
