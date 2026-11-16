/** Job-specific profile readiness card.
 *
 * Read-only: displays how ready the authenticated candidate's profile is for
 * a particular job, based on the backend assessment
 * (GET /api/profile/readiness/jobs/:jobId). Never submits anything and never
 * overrides the backend's readiness result.
 */

import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Card, CardContent } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { useJobProfileReadiness } from '@/hooks/useProfile'
import { AlertCircle, ArrowRight, CheckCircle2, Loader2 } from 'lucide-react'

const SECTION_LABELS: Record<string, string> = {
  personal: 'Personal information',
  professional: 'Professional summary',
  skills: 'Skills',
  experience: 'Work experience',
  education: 'Education',
  preferences: 'Job preferences',
}

const SECTION_ROUTES: Record<string, string> = {
  personal: '/profile',
  professional: '/profile',
  skills: '/profile',
  experience: '/profile',
  education: '/profile',
  preferences: '/profile/preferences',
}

function sectionLink(key: string): string | null {
  return SECTION_ROUTES[key] ?? null
}

interface JobProfileReadinessProps {
  jobId: string
}

export function JobProfileReadiness({ jobId }: JobProfileReadinessProps) {
  const { data, isPending, isError, refetch } = useJobProfileReadiness(jobId)
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
    const target = sectionLink(key)
    if (target) navigate(target)
  }

  if (isPending) {
    return (
      <Card className="border-[var(--border)] shadow-[var(--shadow-sm)]">
        <CardContent className="flex items-center gap-3 py-10 text-center text-sm text-[var(--text-secondary)]">
          <Loader2 className="h-4 w-4 animate-spin" /> Loading readiness…
        </CardContent>
      </Card>
    )
  }

  if (isError) {
    return (
      <Card className="border-[var(--border)] shadow-[var(--shadow-sm)]">
        <CardContent className="flex flex-col items-center gap-3 py-10 text-center">
          <AlertCircle className="h-6 w-6 text-[var(--text-tertiary)]" />
          <p className="text-sm font-medium text-[var(--text-primary)]">Could not load readiness</p>
          <Button variant="secondary" size="sm" onClick={() => void refetch()}>
            Retry
          </Button>
        </CardContent>
      </Card>
    )
  }

  const readiness = data
  if (!readiness) return null

  const missingRequired = readiness.missingRequiredProfileFields ?? []
  const missingRecommended = readiness.missingRecommendedProfileFields ?? []
  const matchedSkills = readiness.matchedSkills ?? []
  const missingSkills = readiness.missingSkills ?? []

  return (
    <div className="space-y-6">
      {/* A. Overall readiness — backend result shown as-is, never recalculated. */}
      <Card className="border-[var(--border)] shadow-[var(--shadow-sm)]">
        <CardContent className="p-5 sm:p-6">
          <div className="flex items-center justify-between">
            <div>
              <h2 className="text-lg font-semibold text-[var(--text-primary)]">
                Job profile readiness
              </h2>
              <p className="mt-1 text-sm text-[var(--text-secondary)]">
                {readiness.ready
                  ? 'You meet the readiness conditions for this job.'
                  : 'You are missing some items before applying to this job.'}
              </p>
            </div>
            <span
              className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-semibold ${
                readiness.ready
                  ? 'bg-emerald-100 text-emerald-800'
                  : 'bg-amber-100 text-amber-800'
              }`}
            >
              {readiness.ready ? 'Ready' : 'Not ready'}
            </span>
          </div>
          <p className="mt-2 text-xs text-[var(--text-tertiary)]">
            Readiness is based on your profile completeness and the job's required skills. It is separate from
            the job matching score — a complete profile does not guarantee eligibility for any particular job.
          </p>
          <Button
            type="button"
            variant="outline"
            size="sm"
            disabled={refreshing}
            onClick={handleRefresh}
          >
            {refreshing ? <Loader2 className="h-3.5 w-3.5 mr-2 animate-spin" /> : null} Refresh
          </Button>
        </CardContent>
      </Card>

      {/* B. Required profile information — hidden when empty. */}
      {missingRequired.length > 0 && (
        <Card className="border-[var(--border)] shadow-[var(--shadow-sm)]">
          <CardContent className="p-5 sm:p-6">
            <h3 className="text-sm font-semibold text-[var(--text-primary)]">Required profile information</h3>
            <p className="mt-1 text-sm text-[var(--text-secondary)]">
              Complete these sections to apply to this job:
            </p>
            <ul className="mt-3 space-y-2">
              {missingRequired.map((field) => (
                <li key={field} className="flex items-center gap-2 rounded-lg border border-[var(--border-destructive)] bg-[var(--destructive-soft)] px-3 py-2 text-sm text-[var(--text-destructive)]">
                  <AlertCircle className="h-3.5 w-3.5" />
                  <span>{SECTION_LABELS[field] ?? field}</span>
                  {sectionLink(field) && (
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      onClick={() => void goToSection(field)}
                      className="px-2 text-[var(--text-destructive)] underline underline-offset-2"
                    >
                      Go to section <ArrowRight className="ml-1 h-3 w-3" />
                    </Button>
                  )}
                </li>
              ))}
            </ul>
          </CardContent>
        </Card>
      )}

      {/* C. Recommended profile information — separate, not mandatory, hidden when empty. */}
      {missingRecommended.length > 0 && (
        <Card className="border-[var(--border)] shadow-[var(--shadow-sm)]">
          <CardContent className="p-5 sm:p-6">
            <h3 className="text-sm font-semibold text-[var(--text-primary)]">Recommended profile information</h3>
            <p className="mt-1 text-sm text-[var(--text-secondary)]">
              Adding these sections strengthens your application but is not mandatory:
            </p>
            <ul className="mt-3 space-y-2">
              {missingRecommended.map((field) => (
                <li key={field} className="flex items-center gap-2 rounded-lg border border-[var(--border)] bg-[var(--surface-secondary)] px-3 py-2 text-sm text-[var(--text-secondary)]">
                  <span>{SECTION_LABELS[field] ?? field}</span>
                  {sectionLink(field) && (
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      onClick={() => void goToSection(field)}
                      className="px-2 text-[var(--text-tertiary)] underline underline-offset-2"
                    >
                      Go to section <ArrowRight className="ml-1 h-3 w-3" />
                    </Button>
                  )}
                </li>
              ))}
            </ul>
          </CardContent>
        </Card>
      )}

      {/* D. Skills assessment — matched and missing shown with distinct styling. */}
      <Card className="border-[var(--border)] shadow-[var(--shadow-sm)]">
        <CardContent className="p-5 sm:p-6">
          <h3 className="text-sm font-semibold text-[var(--text-primary)]">Skills for this job</h3>
          <div className="mt-3 grid grid-cols-1 gap-4 sm:grid-cols-2">
            <div className="rounded-lg border border-[var(--border)] bg-[var(--surface)] p-4">
              <p className="text-xs font-semibold text-[var(--text-secondary)] uppercase tracking-wider">
                Matched skills
              </p>
              {matchedSkills.length > 0 ? (
                <div className="mt-2 flex flex-wrap gap-2">
                  {matchedSkills.map((skill) => (
                    <span
                      key={skill}
                      className="inline-flex items-center gap-1 rounded-full border border-emerald-200 bg-emerald-50 px-2.5 py-1 text-xs text-emerald-700"
                    >
                      <CheckCircle2 className="h-3 w-3" /> {skill}
                    </span>
                  ))}
                </div>
              ) : (
                <p className="mt-2 text-xs text-[var(--text-tertiary)]">No required job skills matched yet.</p>
              )}
            </div>
            <div className="rounded-lg border border-[var(--border)] bg-[var(--surface)] p-4">
              <p className="text-xs font-semibold text-[var(--text-secondary)] uppercase tracking-wider">
                Missing skills
              </p>
              {missingSkills.length > 0 ? (
                <div className="mt-2 flex flex-wrap gap-2">
                  {missingSkills.map((skill) => (
                    <span
                      key={skill}
                      className="inline-flex items-center gap-1 rounded-full border border-red-200 bg-red-50 px-2.5 py-1 text-xs text-red-700"
                    >
                      <AlertCircle className="h-3 w-3" /> {skill}
                    </span>
                  ))}
                </div>
              ) : (
                <p className="mt-2 text-xs text-[var(--text-tertiary)]">No missing required skills.</p>
              )}
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  )
}
