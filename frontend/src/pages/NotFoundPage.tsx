import { ArrowLeft } from 'lucide-react'
import { Link } from 'react-router-dom'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'

export function NotFoundPage() {
  return (
    <div className="flex min-h-[60vh] items-center justify-center">
      <Card className="w-full max-w-md text-center">
        <CardContent className="flex flex-col items-center gap-4 py-12">
          <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-[var(--surface-secondary)]">
            <span className="text-lg font-semibold text-[var(--text-tertiary)]">404</span>
          </div>
          <div>
            <h1 className="text-xl font-semibold tracking-tight text-[var(--text-primary)]">
              Page not found
            </h1>
            <p className="mt-2 text-sm text-[var(--text-secondary)]">
              The page you're looking for doesn't exist or has been moved.
            </p>
          </div>
          <Link to="/dashboard">
            <Button>
              <ArrowLeft className="h-4 w-4" />
              Back to dashboard
            </Button>
          </Link>
        </CardContent>
      </Card>
    </div>
  )
}
