import { type HTMLAttributes } from 'react'
import { cva, type VariantProps } from 'class-variance-authority'
import { cn } from '@/lib/utils'

const badgeVariants = cva(
  'inline-flex items-center gap-1 rounded-md border text-xs font-medium transition-colors',
  {
    variants: {
      variant: {
        default: 'border-[var(--border-strong)] bg-[var(--surface-secondary)] text-[var(--text-secondary)]',
        subtle: 'border-transparent bg-[var(--surface-tertiary)] text-[var(--text-secondary)]',
        accent: 'border-[var(--border-strong)] bg-transparent text-[var(--text-primary)]',
        success: 'border-[var(--border-strong)] bg-transparent text-[var(--text-primary)]',
        warning: 'border-[var(--border-strong)] bg-transparent text-[var(--text-secondary)]',
        danger: 'border-[var(--border-strong)] bg-transparent text-[var(--text-primary)]',
        info: 'border-[var(--border-strong)] bg-transparent text-[var(--text-primary)]',
        outline: 'border-[var(--border-strong)] bg-transparent text-[var(--text-secondary)]',
        solid: 'border-transparent bg-[var(--accent)] text-[var(--accent-foreground)]',
      },
      size: {
        sm: 'px-1.5 py-0.5 text-[11px]',
        default: 'px-2 py-0.5 text-xs',
        md: 'px-2 py-0.5 text-xs',
        lg: 'px-2.5 py-1 text-xs',
      },
    },
    defaultVariants: {
      variant: 'default',
      size: 'default',
    },
  },
)

type BadgeProps = HTMLAttributes<HTMLSpanElement> & VariantProps<typeof badgeVariants>

export function Badge({ className, variant, size, ...props }: BadgeProps) {
  return <span className={cn(badgeVariants({ variant, size }), className)} {...props} />
}
