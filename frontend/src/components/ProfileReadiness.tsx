/** Profile readiness card: completeness percentage, missing sections,
 *  resume availability, and actionable recommendations. */

import { useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { PageHeader } from '@/components/PageHeader'
import { Card, CardContent } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { useProfileReadiness } from '@/hooks/useProfile'
import { Loader2, FileText, AlertCircle, ArrowRight } from 'lucide-react'

const STATUS_LABELS: Record<string, { label: string; variant: 'default' | 'secondary' | 'destructive' }> = {
  no_profile: { label: 'Not started', variant: 'secondary' },
  incomplete: { label: 'Incomplete', variant: 'destructive' },
  needs_work: { label: 'Needs work', variant: 'secondary' },
  ready: { label: 'Ready', variant: 'default' },
}

const SECTION_LABELS: Record<string, string> = {
  personal: 'Personal information',
  professional: 'Professional summary',
  skills: 'Skills',
  experience: 'Work experience',
  education: 'Education',
  preferences: 'Job preferences',
  certifications: 'Certifications',
  projects: 'Projects',
  socialLinks: 'Social links',
}

export function ProfileReadiness() {
  const { data, isPending, isError, refetch } = useProfileReadiness()
  const navigate = useNavigate()
  const [refreshing, setRefreshing] = useState(false)

  async function handleRefresh() {
    setRefreshing(true)
    try {
      await refetch()
    } finally {
      setRefreshing(false)
    }
  }

  function goToSection(key: string) {
    const map: Record<string, string> = {
      personal: '/profile',
      professional: '/profile',
      skills: '/profile',
      experience: '/profile',
      education: '/profile',
      preferences: '/profile/preferences',
    }
    const target = map[key]
    if (target) navigate(target)
  }

  if (isPending) {
    return (
      <div className="mx-auto max-w-6xl space-y-8">
        <PageHeader title="Profile readiness" description="Assessing your profile completeness." eyebrow="PROFILE" />
        <Card className="border-[var(--border)] shadow-[var(--shadow-sm)]">
          <CardContent className="flex items-center gap-3 py-10 text-center text-sm text-[var(--text-secondary)]">
            <Loader2 className="h-4 w-4 animate-spin" /> Loading readiness…
          </CardContent>
        </Card>
      </div>
    )
  }

  if (isError) {
    return (
      <div className="mx-auto max-w-6xl space-y-8">
        <PageHeader title="Profile readiness" description="Unable to load readiness information." eyebrow="PROFILE" />
        <Card className="border-[var(--border)] shadow-[var(--shadow-sm)]">
          <CardContent className="flex flex-col items-center gap-3 py-10 text-center">
            <AlertCircle className="h-6 w-6 text-[var(--text-tertiary)]" />
            <p className="text-sm font-medium text-[var(--text-primary)]">Could not load readiness</p>
            <Button variant="secondary" size="sm" onClick={() => void refetch()}>
              Retry
            </Button>
          </CardContent>
        </Card>
      </div>
    )
  }

  const readiness = data
  if (!readiness) return null

  const missingRequired = readiness.missingRequired ?? []
  const missingRecommended = readiness.missingRecommended ?? []
  const recommendations = readiness.recommendations ?? []

  return (
    <div className="mx-auto max-w-6xl space-y-8">
      <PageHeader
        title="Profile readiness"
        description={
          readiness.status === 'no_profile'
            ? "Create your profile to get started."
            : readiness.status === 'incomplete'
              ? "Complete your profile to apply with confidence."
              : readiness.status === 'needs_work'
                ? "Almost there — finish a few remaining items."
                : "Your profile is complete and ready for applications."
        }
        eyebrow="PROFILE"
      />

      <Card className="border-[var(--border)] shadow-[var(--shadow-sm)]">
        <CardContent className="p-5 sm:p-6">
          <div className="flex items-center justify-between">
            <div>
              <h2 className="text-lg font-semibold text-[var(--text-primary)]">Profile readiness</h2>
              <p className="mt-1 text-sm text-[var(--text-secondary)]">
                {readiness.percentage}% complete — {STATUS_LABELS[readiness.status]?.label ?? readiness.status}
              </p>
            </div>
            <Button
              type="button"
              variant="outline"
              size="sm"
              disabled={refreshing}
              onClick={handleRefresh}
            >
              {refreshing ? <Loader2 className="h-3.5 w-3.5 mr-2 animate-spin" /> : null} Refresh
            </Button>
          </div>
          <div className="mt-4">
            <div className="flex items-center justify-between text-sm text-[var(--text-secondary)] mb-1">
              <span>Completion</span>
              <span>{readiness.percentage}%</span>
            </div>
            <div className="w-full rounded-full border border-[var(--border)] bg-[var(--surface-secondary)] h-2.5">
              <div
                className="h-2.5 rounded-full bg-[var(--accent)]"
                style={{ width: `${Math.max(0, Math.min(100, readiness.percentage))}%` }}
              />
            </div>
          </div>

          {readiness.status !== 'no_profile' && readiness.resumeAvailable !== undefined && (
            <div className="mt-5 flex items-center gap-3 rounded-lg border border-[var(--border)] bg-[var(--surface)] px-4 py-3 text-sm">
              <FileText className="h-4 w-4 text-[var(--text-tertiary)]" />
              <div>
                <p className="text-sm font-medium text-[var(--text-primary)]">Resume</p>
                <p className="text-xs text-[var(--text-tertiary)]">
                  {readiness.resumeAvailable ? 'A resume is available.' : 'No resume on file.'}
                </p>
              </div>
              {readiness.resumeAvailable ? null : (
                <Button variant="secondary" size="sm" asChild>
                  <Link to="/resumes">Upload resume</Link>
                </Button>
              )}
            </div>
          )}

          {(missingRequired.length > 0 || missingRecommended.length > 0) && (
            <div className="mt-5 space-y-3">
              <h3 className="text-sm font-semibold text-[var(--text-primary)]">Missing fields</h3>
              {missingRequired.map((field) => (
                <div key={field} className="flex items-center gap-2 rounded-lg border border-[var(--border-destructive)] bg-[var(--destructive-soft)] px-3 py-2 text-xs text-[var(--text-destructive)]">
                  <AlertCircle className="h-3.5 w-3.5" />
                  <span>{SECTION_LABELS[field] ?? field}</span>
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    onClick={() => void goToSection(field)}
                    className="px-2 text-[var(--text-destructive)] underline underline-offset-2"
                  >
                    Go to section <ArrowRight className="ml-1 h-3 w-3" />
                  </Button>
                </div>
              ))}
              {missingRecommended.map((field) => (
                <div key={field} className="flex items-center gap-2 rounded-lg border border-[var(--border)] bg-[var(--surface-secondary)] px-3 py-2 text-xs text-[var(--text-secondary)]">
                  <span>{SECTION_LABELS[field] ?? field}</span>
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    onClick={() => void goToSection(field)}
                    className="px-2 text-[var(--text-tertiary)] underline underline-offset-2"
                  >
                    Go to section <ArrowRight className="ml-1 h-3 w-3" />
                  </Button>
                </div>
              ))}
            </div>
          )}

          {recommendations.length > 0 && (
            <div className="mt-5 rounded-lg border border-[var(--border)] bg-[var(--surface)] px-4 py-3">
              <h3 className="text-sm font-semibold text-[var(--text-primary)]">Recommendations</h3>
              <ul className="mt-2 space-y-1 text-sm text-[var(--text-secondary)] list-disc pl-5">
                {recommendations.map((rec) => (
                  <li key={rec}>{rec}</li>
                ))}
              </ul>
            </div>
          )}
        </CardContent>
      </Card>

      <div className="text-xs text-[var(--text-tertiary)] text-center">
        Profile completeness is separate from job eligibility. A complete profile
        does not guarantee a match for any particular job.
      </div>
    </div>
  )
}
