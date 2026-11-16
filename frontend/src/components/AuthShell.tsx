import type { ReactNode } from 'react'
import { Card, CardContent } from '@/components/ui/card'

/**
 * Centered shell shared by the sign-in and registration screens.
 *
 * Keeps the marketing surface minimal and the form itself the only focus, with
 * the brand and a one-line explanation above it.
 */
export function AuthShell({
  title,
  subtitle,
  children,
}: {
  title: string
  subtitle: string
  children: ReactNode
}) {
  return (
    <div className="flex min-h-screen items-center justify-center bg-canvas px-4 py-12">
      <div className="w-full max-w-[400px]">
        <div className="mb-7 text-center">
          <p className="text-[13px] font-semibold tracking-[0.08em] text-ink-400 uppercase">
            ApplyWise
          </p>
          <h1 className="mt-2 text-[26px] leading-tight font-semibold tracking-[-0.02em] text-balance text-ink-900">
            {title}
          </h1>
          <p className="mt-2 text-[13.5px] leading-relaxed text-pretty text-ink-500">{subtitle}</p>
        </div>

        <Card className="p-5 sm:p-6">
          <CardContent className="p-0">{children}</CardContent>
        </Card>
      </div>
    </div>
  )
}
