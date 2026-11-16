import { type ButtonHTMLAttributes, forwardRef } from 'react'
import { cva, type VariantProps } from 'class-variance-authority'
import { cn } from '@/lib/utils'
import { Loader2 } from 'lucide-react'

const buttonVariants = cva(
  'group relative inline-flex items-center justify-center gap-2 whitespace-nowrap text-sm font-medium transition-all duration-150 disabled:pointer-events-none disabled:opacity-40 focus-visible:outline-none focus-visible:shadow-[var(--shadow-focus)]',
  {
    variants: {
      variant: {
        primary:
          'bg-[var(--accent)] text-[var(--accent-foreground)] hover:bg-[var(--accent-hover)] active:translate-y-[0.5px]',
        default:
          'bg-[var(--accent)] text-[var(--accent-foreground)] hover:bg-[var(--accent-hover)] active:translate-y-[0.5px]',
        secondary:
          'bg-[var(--surface)] text-[var(--text-primary)] border border-[var(--border-strong)] hover:bg-[var(--surface-secondary)] active:translate-y-[0.5px]',
        outline:
          'border border-[var(--border-strong)] bg-transparent text-[var(--text-primary)] hover:bg-[var(--surface-secondary)] active:translate-y-[0.5px]',
        ghost:
          'text-[var(--text-secondary)] hover:bg-[var(--surface-secondary)] hover:text-[var(--text-primary)] active:translate-y-[0.5px]',
        subtle:
          'bg-[var(--accent-subtle)] text-[var(--text-primary)] hover:bg-[rgba(29,29,31,0.08)] dark:hover:bg-[rgba(139,92,246,0.16)] active:translate-y-[0.5px]',
        destructive:
          'border border-[var(--border-strong)] bg-transparent text-[var(--text-primary)] hover:bg-[var(--danger-subtle)] active:translate-y-[0.5px]',
        link: 'text-[var(--text-primary)] underline-offset-4 hover:underline',
      },
      size: {
        xs: 'h-[var(--control-height-sm)] px-2.5 text-xs rounded-md',
        sm: 'h-[var(--control-height-sm)] px-3 text-xs rounded-md',
        default: 'h-[var(--control-height-md)] px-3.5 text-sm rounded-lg',
        md: 'h-[var(--control-height-md)] px-3.5 text-sm rounded-lg',
        lg: 'h-[var(--control-height-lg)] px-4 text-sm rounded-lg',
        xl: 'h-[var(--control-height-xl)] px-5 text-sm rounded-lg',
        icon: 'h-[var(--control-height-md)] w-[var(--control-height-md)] p-0 rounded-lg',
        'icon-sm': 'h-[var(--control-height-sm)] w-[var(--control-height-sm)] p-0 rounded-md',
        'icon-lg': 'h-[var(--control-height-lg)] w-[var(--control-height-lg)] p-0 rounded-lg',
      },
    },
    defaultVariants: {
      variant: 'primary',
      size: 'default',
    },
  },
)

type ButtonProps = ButtonHTMLAttributes<HTMLButtonElement> &
  VariantProps<typeof buttonVariants> & {
    loading?: boolean
    asChild?: boolean
  }

export const Button = forwardRef<HTMLButtonElement, ButtonProps>(
  ({ className, variant, size, type = 'button', loading = false, disabled, children, asChild, ...props }, ref) => {
    if (asChild) {
      return (
        <span
          className={cn(buttonVariants({ variant, size }), className)}
          {...(props as any)}
        >
          {loading && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
          {children}
        </span>
      )
    }
    return (
      <button
        ref={ref}
        type={type}
        className={cn(buttonVariants({ variant, size }), className)}
        disabled={disabled || loading}
        {...props}
      >
        {loading && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
        {children}
      </button>
    )
  },
)
Button.displayName = 'Button'
