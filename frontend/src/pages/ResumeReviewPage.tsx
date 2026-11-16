import { useState } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { Link, useParams } from 'react-router-dom'
import { ArrowLeft, Download, Eye } from 'lucide-react'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { CandidateRow } from '@/components/review/CandidateRow'
import { CategoryTabs, type ReviewTab } from '@/components/review/CategoryTabs'
import { ImportPanelBody } from '@/components/review/ImportPanel'
import {
  EducationPreview,
  ExperiencePreview,
  LinksPreview,
  PersonalPreview,
  type EducationView,
  type ExperienceView,
} from '@/components/review/Previews'
import { ReviewSummaryCards } from '@/components/review/ReviewSummaryCards'
import { SkillRow } from '@/components/review/SkillRow'
import { PageHeader } from '@/components/PageHeader'
import { useHealth } from '@/hooks/useHealth'
import { useProfile } from '@/hooks/useProfile'
import { useReviewDecisions } from '@/hooks/useReviewDecisions'
import { resumeErrorMessage } from '@/services/resume-errors'
import {
  buildScalarRows,
  runResumeImport,
  structuredView,
} from '@/services/review-model'
import {
  analyzeResume,
  downloadResumeFile,
  getResume,
  getResumeAnalysis,
  retryResumeAnalysis,
} from '@/services/resumes'

type TabId = 'overview' | 'skills' | 'personal' | 'experience' | 'education' | 'links'

export function ResumeReviewPage() {
  const { id } = useParams<{ id: string }>()
  const resumeId = id ?? ''
  const queryClient = useQueryClient()
  const decisions = useReviewDecisions()
  const [tab, setTab] = useState<TabId>('overview')
  const [checks, setChecks] = useState<string[] | null>(null)
  const [busyAction, setBusyAction] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [notice, setNotice] = useState<string | null>(null)
  const [importResult, setImportResult] = useState<string | null>(null)

  const resumeQuery = useQuery({
    queryKey: ['resume', resumeId],
    queryFn: () => getResume(resumeId),
    enabled: resumeId.length > 0,
    retry: 1,
  })
  const analysisQuery = useQuery({
    queryKey: ['resume-analysis', resumeId],
    queryFn: () => getResumeAnalysis(resumeId),
    enabled: resumeId.length > 0,
    retry: 1,
  })
  const profileQuery = useProfile()
  const { data: health } = useHealth()

  const resume = resumeQuery.data ?? null
  const analysis = analysisQuery.data ?? null
  const profile = profileQuery.data ?? null
  const rejected = decisions.rejected[resumeId] ?? []
  const approved = decisions.approved[resumeId] ?? []

  async function refreshAll() {
    await queryClient.invalidateQueries({ queryKey: ['resume', resumeId] })
    await queryClient.invalidateQueries({ queryKey: ['resume-analysis', resumeId] })
    await queryClient.invalidateQueries({ queryKey: ['resumes'] })
    await queryClient.invalidateQueries({ queryKey: ['profile'] })
  }

  async function guardAction(label: string, fn: () => Promise<void>) {
    if (busyAction) return
    setError(null)
    setNotice(null)
    setBusyAction(label)
    try {
      await fn()
      await refreshAll()
    } catch (err) {
      setError(`${label} failed: ${resumeErrorMessage(err, label)}`)
    } finally {
      setBusyAction(null)
    }
  }

  async function onAnalyze() {
    await guardAction('Analysis', async () => {
      await analyzeResume(resumeId)
      setNotice('Analysis completed.')
    })
  }

  async function onRetry() {
    await guardAction('Retry', async () => {
      await retryResumeAnalysis(resumeId)
      setNotice('Analysis completed.')
    })
  }

  async function onDownload() {
    await guardAction('Download', async () => {
      const { blob, filename } = await downloadResumeFile(resumeId)
      const url = URL.createObjectURL(blob)
      const anchor = document.createElement('a')
      anchor.href = url
      anchor.download = filename || resume?.originalFilename || 'resume'
      document.body.appendChild(anchor)
      anchor.click()
      anchor.remove()
      window.setTimeout(() => URL.revokeObjectURL(url), 1000)
      setNotice(`Downloaded ${filename || resume?.originalFilename || 'resume'}.`)
    })
  }

  // ---- Derived review state (all counts from live state) ----
  const view = analysis ? structuredView(analysis) : null
  const verified = (view?.skills ?? []).filter((s) => (s.reviewStatus ?? 'verified') === 'verified')
  const lower = (s: string) => s.toLowerCase()
  const isRejectedSkill = (name: string) => rejected.some((n) => lower(n) === lower(name))
  const isApproved = (text: string) => approved.some((n) => lower(n) === lower(text))
  const pendingCandidates = (view?.reviewCandidates ?? []).filter(
    (c) => !isRejectedSkill(c.text) && !isApproved(c.text),
  )
  const approvedCandidates = (view?.reviewCandidates ?? []).filter(
    (c) => isApproved(c.text) && !isRejectedSkill(c.text),
  )
  const rejectedVerified = verified.filter((s) => isRejectedSkill(s.name))
  const rejectedCandidates = (view?.reviewCandidates ?? []).filter((c) => isRejectedSkill(c.text))
  const scalarRows = buildScalarRows(analysis, profile)
  const readyToImport = scalarRows.filter((r) => r.change === 'new' || r.change === 'update').length
  const experiences: ExperienceView[] =
    (analysis?.structuredData as { experience?: ExperienceView[] } | undefined)?.experience ?? []
  const educations: EducationView[] =
    (analysis?.structuredData as { education?: EducationView[] } | undefined)?.education ?? []
  const personal = view?.personal ?? {}
  const hasPersonal = Boolean(personal.name || personal.email || personal.phone || personal.location || personal.city)
  const hasLinks = view ? (typeof view.links.github === 'string' || typeof view.links.linkedin === 'string' || typeof view.links.portfolio === 'string' || typeof view.links.website === 'string' || (Array.isArray(view.links.other) && view.links.other.length > 0)) : false

  const tabs: Array<ReviewTab & { id: TabId }> = [
    { id: 'overview', label: 'Overview' },
    { id: 'skills', label: 'Skills', count: verified.length + (view?.reviewCandidates.length ?? 0) },
    ...(hasPersonal ? [{ id: 'personal' as TabId, label: 'Personal details' }] : []),
    ...(experiences.length > 0 ? [{ id: 'experience' as TabId, label: 'Experience', count: experiences.length }] : []),
    ...(educations.length > 0 ? [{ id: 'education' as TabId, label: 'Education', count: educations.length }] : []),
    ...(hasLinks ? [{ id: 'links' as TabId, label: 'Links' }] : []),
  ]
  const activeTab = tabs.some((t) => t.id === tab) ? tab : 'overview'

  const busy = busyAction !== null
  const storage = health?.storage

  return (
    <div className="mx-auto w-full max-w-5xl">
      <Link
        to="/resumes"
        className="inline-flex items-center gap-1.5 rounded-md text-sm font-medium text-ink-600 underline-offset-2 hover:text-ink-900 hover:underline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-600"
      >
        <ArrowLeft className="h-4 w-4" aria-hidden="true" />
        Back to resumes
      </Link>

      <div className="mt-2">
        <PageHeader
          title="Resume Review"
          description="Review extracted information before importing it into your profile."
        />
      </div>

      {resumeQuery.isPending || analysisQuery.isPending ? (
        <p role="status" className="text-[13px] text-ink-600">Loading resume review…</p>
      ) : resumeQuery.isError || !resume ? (
        <div role="alert" className="rounded-[14px] border border-red-200 bg-red-50 px-6 py-12 text-center">
          <h2 className="text-[15px] font-semibold text-red-900">Could not load this resume</h2>
          <p className="mx-auto mt-1 max-w-md text-sm text-red-700">
            It may have been deleted, or you may not have access to it.
          </p>
          <button
            type="button"
            onClick={() => {
              void resumeQuery.refetch()
              void analysisQuery.refetch()
            }}
            className="mt-4 "
          >
            Retry
          </button>
        </div>
      ) : (
        <>
          <section aria-label="Selected resume" className="rounded-[14px] border border-line bg-surface px-4 py-3 shadow-[0_1px_2px_rgba(15,23,42,0.04)]">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div className="min-w-0">
                <h2 className="truncate text-base font-semibold text-ink-900">{resume.originalFilename}</h2>
                <p className="mt-0.5 flex flex-wrap items-center gap-2 text-[12px] text-ink-500">
                  <span>Analysis: {analysis?.status ?? 'not run yet'}</span>
                  {analysis?.confidence && (
                    <Badge variant={analysis.status === 'completed' ? 'success' : 'warning'}>
                      {analysis.status === 'completed' ? `confidence ${analysis.confidence}` : analysis.status}
                    </Badge>
                  )}
                </p>
                {storage && (
                  <p className="mt-0.5 text-[11px] text-ink-400">
                    Storage: {storage.active} · status snapshot only — it does not verify this file&apos;s location.
                  </p>
                )}
              </div>
              <div className="flex flex-wrap gap-2">
                {(!analysis || analysis.status === 'failed') && (
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    disabled={busy}
                    onClick={() => void (analysis?.status === 'failed' ? onRetry() : onAnalyze())}
                  >
                    <Eye className="h-3.5 w-3.5" aria-hidden="true" />
                    {analysis?.status === 'failed' ? 'Retry analysis' : 'Analyze'}
                  </Button>
                )}
                <Button type="button" variant="outline" size="sm" disabled={busy} onClick={() => void onDownload()}>
                  <Download className="h-3.5 w-3.5" aria-hidden="true" />
                  {busyAction === 'Download' ? 'Preparing…' : 'Download'}
                </Button>
              </div>
            </div>
          </section>

          {error && (
            <p role="alert" className="mt-3 ">
              {error}
            </p>
          )}
          {decisions.saveError && (
            <div role="alert" className="mb-3 mt-3 flex flex-wrap items-center justify-between gap-2 ">
              <span>{decisions.saveError}</span>
              <button
                type="button"
                onClick={decisions.clearSaveError}
                className="rounded-md border border-red-300 px-2 py-0.5 text-xs font-medium"
              >
                Dismiss
              </button>
            </div>
          )}
          {notice && (
            <p role="status" className="mt-3 ">
              {notice}
            </p>
          )}

          {analysis?.status === 'completed' && (
            <section aria-label="Review summary" className="mt-4">
              <ReviewSummaryCards
                counts={{
                  verified: verified.filter((s) => !isRejectedSkill(s.name)).length,
                  needsReview: pendingCandidates.length,
                  approved: approvedCandidates.length,
                  rejected: rejectedVerified.length + rejectedCandidates.length,
                  readyToImport,
                }}
              />
            </section>
          )}

          <div className="mt-4">
            <CategoryTabs tabs={tabs} active={activeTab} onChange={(id) => setTab(id as TabId)} />
          </div>

          <section
            id={`review-panel-${activeTab}`}
            role="tabpanel"
            aria-label={`${tabs.find((t) => t.id === activeTab)?.label ?? ''} review`}
            className="mt-3"
          >
            {activeTab === 'overview' && (
              <div className="space-y-3">
                <div className="rounded-[14px] border border-line bg-surface px-4 py-3">
                  <h3 className="text-[15px] font-semibold text-ink-900">How review works</h3>
                  <ol className="mt-1 list-decimal space-y-1 pl-5 text-[13px] text-ink-600">
                    <li>Approve or reject uncertain candidates in the Skills tab.</li>
                    <li>Select the profile fields to import below.</li>
                    <li>Confirm any replacements, then import and check the result.</li>
                  </ol>
                </div>
                {analysis?.status === 'completed' ? (
                  <div className="rounded-[14px] border border-line bg-surface px-4 py-3">
                    <h3 className="text-[15px] font-semibold text-ink-900">Parsing warnings</h3>
                    {analysis.warnings.length > 0 ? (
                      <ul aria-label="Parsing warnings" className="mt-1 space-y-1">
                        {analysis.warnings.map((warning, index) => (
                          <li key={`${warning.field}-${index}`} className="text-xs text-amber-800">
                            {warning.field}: {warning.message}
                          </li>
                        ))}
                      </ul>
                    ) : (
                      <p className="mt-1 text-[12px] text-ink-500">No warnings — extraction completed cleanly.</p>
                    )}
                  </div>
                ) : (
                  <div className="rounded-xl border border-dashed border-line bg-surface px-4 py-6 text-center">
                    <p className="text-[13px] text-ink-600">
                      {analysis ? 'Analysis did not complete. Retry to generate reviewable data.' : 'No analysis yet. Run analysis to generate reviewable data.'}
                    </p>
                  </div>
                )}
              </div>
            )}

            {activeTab === 'skills' && (
              <div className="space-y-4">
                <section aria-label="Verified skills">
                  <h3 className="mb-1.5 text-[15px] font-semibold text-ink-900">
                    Verified skills ({verified.filter((s) => !isRejectedSkill(s.name)).length})
                  </h3>
                  {verified.filter((s) => !isRejectedSkill(s.name)).length > 0 ? (
                    <ul className="space-y-2">
                      {verified.filter((s) => !isRejectedSkill(s.name)).map((skill) => (
                        <SkillRow
                          key={skill.name}
                          skill={{
                            name: skill.name,
                            category: skill.category,
                            context: skill.context,
                            originalText: skill.evidence && skill.evidence !== skill.name ? skill.evidence : undefined,
                            section: skill.section,
                            method: skill.method,
                            evidence: skill.evidence,
                            rating: skill.rating,
                            proficiency: skill.proficiency,
                          }}
                          rejected={false}
                          disabled={busy}
                          onReject={() => decisions.toggleRejected(resumeId, skill.name)}
                          onRestore={() => decisions.toggleRejected(resumeId, skill.name)}
                        />
                      ))}
                    </ul>
                  ) : (
                    <p className="rounded-xl border border-dashed border-line bg-surface px-4 py-4 text-center text-sm text-ink-500">
                      No verified skills. Uncertain terms wait in “Needs review” below.
                    </p>
                  )}
                </section>

                <section aria-label="Skills needing review">
                  <h3 className="mb-1.5 text-[15px] font-semibold text-ink-900">
                    Needs review ({pendingCandidates.length + approvedCandidates.length})
                  </h3>
                  {pendingCandidates.length + approvedCandidates.length > 0 ? (
                    <ul className="space-y-2">
                      {[...approvedCandidates, ...pendingCandidates].map((candidate) => (
                        <CandidateRow
                          key={candidate.text}
                          text={candidate.text}
                          reason={candidate.reason}
                          section={candidate.section}
                          approved={isApproved(candidate.text)}
                          rejected={false}
                          disabled={busy}
                          onApprove={() => decisions.toggleApproved(resumeId, candidate.text)}
                          onReject={() => decisions.toggleRejected(resumeId, candidate.text)}
                          onRestore={() => decisions.toggleRejected(resumeId, candidate.text)}
                        />
                      ))}
                    </ul>
                  ) : (
                    <p className="rounded-xl border border-dashed border-line bg-surface px-4 py-4 text-center text-sm text-ink-500">
                      Nothing waiting for review. Every extracted term is verified or decided.
                    </p>
                  )}
                </section>

                {(rejectedVerified.length > 0 || rejectedCandidates.length > 0) && (
                  <section aria-label="Rejected suggestions">
                    <h3 className="mb-1.5 text-[15px] font-semibold text-ink-900">
                      Rejected ({rejectedVerified.length + rejectedCandidates.length})
                    </h3>
                    <ul className="space-y-2">
                      {rejectedVerified.map((skill) => (
                        <SkillRow
                          key={skill.name}
                          skill={{ name: skill.name, category: skill.category, evidence: skill.evidence }}
                          rejected
                          disabled={busy}
                          onReject={() => decisions.toggleRejected(resumeId, skill.name)}
                          onRestore={() => decisions.toggleRejected(resumeId, skill.name)}
                        />
                      ))}
                      {rejectedCandidates.map((candidate) => (
                        <CandidateRow
                          key={candidate.text}
                          text={candidate.text}
                          reason={candidate.reason}
                          section={candidate.section}
                          approved={false}
                          rejected
                          disabled={busy}
                          onApprove={() => decisions.toggleApproved(resumeId, candidate.text)}
                          onReject={() => decisions.toggleRejected(resumeId, candidate.text)}
                          onRestore={() => decisions.toggleRejected(resumeId, candidate.text)}
                        />
                      ))}
                    </ul>
                  </section>
                )}
              </div>
            )}

            {activeTab === 'personal' && (
              <div className="rounded-[14px] border border-line bg-surface px-4 py-3">
                <PersonalPreview personal={personal} />
              </div>
            )}

            {activeTab === 'experience' && (
              <ExperiencePreview entries={experiences} />
            )}

            {activeTab === 'education' && (
              <EducationPreview entries={educations} />
            )}

            {activeTab === 'links' && (
              <div className="rounded-[14px] border border-line bg-surface px-4 py-3">
                <LinksPreview links={view?.links ?? {}} />
              </div>
            )}
          </section>

          <section aria-label="Import into profile" className="mt-4">
            <h3 className="mb-1.5 text-[15px] font-semibold text-ink-900">Import into profile</h3>
            <ImportPanelBody
              analysis={analysis}
              profile={profile}
              profileUnknown={profileQuery.isPending || profileQuery.isError}
              prefs={decisions.prefsFor(resumeId)}
              onPrefs={(patch) => decisions.patchPrefs(resumeId, patch)}
              scalarRows={buildScalarRows(analysis, profile)}
              checks={checks ?? buildScalarRows(analysis, profile).filter((r) => r.change === 'new' || r.change === 'update').map((r) => r.path)}
              onToggleReviewCheck={(path, base) =>
                setChecks((prev) => {
                  const current = prev ?? base
                  return current.includes(path) ? current.filter((p) => p !== path) : [...current, path]
                })
              }
              rejected={rejected}
              approved={approved}
              onToggleReject={(name) => decisions.toggleRejected(resumeId, name)}
              removeSkills={decisions.prefsFor(resumeId).removeSkills}
              onToggleRemoveSkill={(name) => {
                const prefs = decisions.prefsFor(resumeId)
                const lower = name.toLowerCase()
                decisions.patchPrefs(resumeId, {
                  removeSkills: prefs.removeSkills.some((n) => n.toLowerCase() === lower)
                    ? prefs.removeSkills.filter((n) => n.toLowerCase() !== lower)
                    : [...prefs.removeSkills, name],
                })
              }}
              busy={busy}
              onImport={() => void onImport()}
              onCancel={() => setImportResult(null)}
              importResult={importResult}
            />
          </section>
        </>
      )}
    </div>
  )

  async function onImport() {
    if (busy) return
    const prefs = decisions.prefsFor(resumeId)
    setError(null)
    setNotice(null)
    setImportResult(null)
    setBusyAction('Importing')
    try {
      const outcome = await runResumeImport({
        resumeId,
        mode: prefs.mode,
        fields: prefs.fields,
        checks: checks ?? undefined,
        prefs,
        analysis,
        profile,
        rejected,
        approved,
        confirmFn: (lines) =>
          window.confirm(`This will overwrite profile data:\n\n${lines.join('\n')}\n\nProceed?`),
      })
      if (outcome.kind === 'noop') {
        setError(outcome.message)
      } else if (outcome.kind === 'done') {
        setImportResult(outcome.resultText)
        await refreshAll()
      }
    } catch (err) {
      setError(`Import failed: ${resumeErrorMessage(err, 'Import')}`)
    } finally {
      setBusyAction(null)
    }
  }
}
