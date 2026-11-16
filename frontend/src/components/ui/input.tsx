import {
  type InputHTMLAttributes,
  type SelectHTMLAttributes,
  type TextareaHTMLAttributes,
  type ReactNode,
  forwardRef,
} from 'react'
import { cn } from '@/lib/utils'

const fieldBase =
  'w-full rounded-lg border border-[var(--border-strong)] bg-[var(--surface)] px-3 text-sm text-[var(--text-primary)] placeholder:text-[var(--text-quaternary)] shadow-[var(--shadow-xs)] transition-all duration-150 focus-visible:border-[var(--accent)] focus-visible:outline-none focus-visible:shadow-[var(--shadow-focus)] disabled:cursor-not-allowed disabled:opacity-40'

export function Field({
  label,
  htmlFor,
  hint,
  error,
  children,
  className,
  action,
}: {
  label?: string
  htmlFor?: string
  hint?: string
  error?: string
  children: ReactNode
  className?: string
  action?: ReactNode
}) {
  return (
    <div className={cn('flex flex-col gap-1.5', className)}>
      {(label || action) && (
        <div className="flex items-baseline justify-between gap-3">
          {label && (
            <label htmlFor={htmlFor} className="text-sm font-medium text-[var(--text-primary)]">
              {label}
            </label>
          )}
          {action}
        </div>
      )}
      {children}
      {error ? (
        <p className="text-xs font-medium text-[var(--text-primary)]">{error}</p>
      ) : hint ? (
        <p className="text-xs text-[var(--text-tertiary)]">{hint}</p>
      ) : null}
    </div>
  )
}

export const Input = forwardRef<HTMLInputElement, InputHTMLAttributes<HTMLInputElement>>(
  function Input({ className, ...props }, ref) {
    return (
      <input
        ref={ref}
        className={cn(fieldBase, 'h-[var(--control-height-lg)] px-3.5', className)}
        {...props}
      />
    )
  },
)

export const InputSm = forwardRef<HTMLInputElement, InputHTMLAttributes<HTMLInputElement>>(
  function InputSm({ className, ...props }, ref) {
    return (
      <input
        ref={ref}
        className={cn(fieldBase, 'h-[var(--control-height-md)] px-3', className)}
        {...props}
      />
    )
  },
)

export const Textarea = forwardRef<HTMLTextAreaElement, TextareaHTMLAttributes<HTMLTextAreaElement>>(
  function Textarea({ className, ...props }, ref) {
    return (
      <textarea
        ref={ref}
        className={cn(fieldBase, 'min-h-28 px-3.5 py-2.5 leading-relaxed', className)}
        {...props}
      />
    )
  },
)

export const Select = forwardRef<HTMLSelectElement, SelectHTMLAttributes<HTMLSelectElement>>(
  function Select({ className, children, ...props }, ref) {
    return (
      <select
        ref={ref}
        className={cn(
          fieldBase,
          'h-[var(--control-height-lg)] cursor-pointer appearance-none bg-no-repeat pr-9 pl-3.5',
          className,
        )}
        style={{
          backgroundImage:
            "url(\"data:image/svg+xml;charset=UTF-8,%3csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 24 24' fill='none' stroke='%236e6e73' stroke-width='1.5' stroke-linecap='round' stroke-linejoin='round'%3e%3cpath d='m6 9 6 6 6-6'/%3e%3c/svg%3e\")",
          backgroundPosition: 'right 0.7rem center',
          backgroundSize: '1rem 1rem',
        }}
        {...props}
      >
        {children}
      </select>
    )
  },
)

export const SearchInput = forwardRef<
  HTMLInputElement,
  InputHTMLAttributes<HTMLInputElement> & { leading?: ReactNode }
>(function SearchInput({ className, leading, ...props }, ref) {
  return (
    <div className="relative">
      {leading && (
        <span
          aria-hidden="true"
          className="pointer-events-none absolute top-1/2 left-3.5 -translate-y-1/2 text-[var(--text-quaternary)]"
        >
          {leading}
        </span>
      )}
      <input
        ref={ref}
        type="search"
        className={cn(
          fieldBase,
          'h-[var(--control-height-lg)] pl-10',
          '[&::-webkit-search-cancel-button]:appearance-none',
          className,
        )}
        {...props}
      />
    </div>
  )
})

export function Checkbox({
  label,
  description,
  className,
  id,
  ...props
}: InputHTMLAttributes<HTMLInputElement> & { label?: ReactNode; description?: string; id?: string }) {
  const inputId = id || (typeof props.name === 'string' ? props.name : undefined)
  return (
    <label
      htmlFor={inputId}
      className={cn('group flex cursor-pointer items-start gap-2.5', className)}
    >
      <input
        id={inputId}
        type="checkbox"
        className={cn(
          'mt-0.5 size-[18px] shrink-0 cursor-pointer appearance-none rounded-[4px] border border-[var(--border-strong)] bg-[var(--surface)] transition-all',
          'checked:border-[var(--accent)] checked:bg-[var(--accent)]',
          'relative',
          'after:absolute after:left-[5px] after:top-[2px] after:h-[9px] after:w-[5px] after:rotate-45 after:border-b-2 after:border-r-2 after:border-white after:content-[""] after:opacity-0',
          'checked:after:opacity-100',
          'focus-visible:shadow-[var(--shadow-focus)]',
        )}
        {...props}
      />
      {(label || description) && (
        <span className="min-w-0">
          {label && <span className="block text-sm text-[var(--text-primary)]">{label}</span>}
          {description && <span className="mt-0.5 block text-xs text-[var(--text-tertiary)]">{description}</span>}
        </span>
      )}
    </label>
  )
}

export function Radio({
  label,
  description,
  className,
  id,
  ...props
}: InputHTMLAttributes<HTMLInputElement> & { label?: ReactNode; description?: string; id?: string }) {
  const generated = typeof id === 'string' ? id : undefined
  return (
    <label
      htmlFor={generated}
      className={cn('group flex cursor-pointer items-start gap-2.5', className)}
    >
      <input
        id={generated}
        type="radio"
        className={cn(
          'mt-0.5 size-[18px] shrink-0 cursor-pointer appearance-none rounded-full border border-[var(--border-strong)] bg-[var(--surface)] transition-all duration-150',
          'checked:border-[var(--accent)] checked:bg-[var(--accent)]',
          "checked:bg-[radial-gradient(circle,white_35%,transparent_36%)]",
          'focus-visible:shadow-[var(--shadow-focus)]',
        )}
        {...props}
      />
      {(label || description) && (
        <span className="min-w-0">
          {label && <span className="block text-sm text-[var(--text-primary)]">{label}</span>}
          {description && <span className="mt-0.5 block text-xs text-[var(--text-tertiary)]">{description}</span>}
        </span>
      )}
    </label>
  )
}

export function Switch({
  label,
  description,
  className,
  id,
  ...props
}: InputHTMLAttributes<HTMLInputElement> & { label?: ReactNode; description?: string; id?: string }) {
  const generated = typeof id === 'string' ? id : undefined
  return (
    <label
      htmlFor={generated}
      className={cn('group flex cursor-pointer items-center justify-between gap-4', className)}
    >
      {(label || description) && (
        <span className="min-w-0">
          {label && <span className="block text-sm text-[var(--text-primary)]">{label}</span>}
          {description && <span className="mt-0.5 block text-xs text-[var(--text-tertiary)]">{description}</span>}
        </span>
      )}
      <span className="relative inline-flex">
        <input
          id={generated}
          type="checkbox"
          role="switch"
          className={cn(
            'peer size-[22px] shrink-0 cursor-pointer appearance-none rounded-full bg-[var(--surface-tertiary)] transition-all duration-150',
            'before:absolute before:left-[2px] before:top-[2px] before:size-[18px] before:rounded-full before:bg-white before:shadow-sm before:transition-transform before:duration-150',
            'checked:bg-[var(--accent)] checked:before:translate-x-[14px]',
            'focus-visible:shadow-[var(--shadow-focus)]',
          )}
          {...props}
        />
      </span>
    </label>
  )
}