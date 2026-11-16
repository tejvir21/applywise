/** Application Preparation & Review Workflow page (Phase 8.3.13).
 *
 * Step-based workspace for preparing a job application package:
 *  1. Resume tailoring
 *  2. Cover letter
 *  3. Application questions
 *  4. Final review
 *
 * Read-only preparation: nothing here submits an application.
 */

import { useState } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { useQueryClient } from '@tanstack/react-query'
import { PageHeader } from '@/components/PageHeader'
import { Card, CardContent } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import {
  usePreparation,
  useStartPreparation,
  useGenerateTailoredResume,
  useGenerateCoverLetter,
  useGenerateAnswers,
  useUpdateAnswer,
  useReviewPreparation,
  useSavePreparation,
  useCancelPreparation,
} from '@/hooks/useApplicationPreparations'
import type { PreparedAnswer } from '@/services/application-preparations'
import { VerificationBadge } from '@/components/VerificationBadge'
import { Loader2, CheckCircle2, AlertCircle, Save } from 'lucide-react'

const STEP_LABELS: Record<string, string> = {
  resume: '1. Resume',
  coverLetter: '2. Cover letter',
  answers: '3. Questions',
  review: '4. Final review',
}

const STEP_ORDER: string[] = ['resume', 'coverLetter', 'answers', 'review']

interface PreparationPageProps {
  preparationId?: string
}

export function ApplicationPreparationPage({ preparationId }: PreparationPageProps) {
  const { id = '' } = useParams()
  const navigate = useNavigate()
  const queryClient = useQueryClient()
  const jobId = preparationId || id

  const startMutation = useStartPreparation()
  const prepQuery = usePreparation(jobId || undefined)
  const generateResume = useGenerateTailoredResume()
  const generateCoverLetter = useGenerateCoverLetter()
  const generateAnswers = useGenerateAnswers()
  const updateAnswer = useUpdateAnswer()
  const reviewPreparation = useReviewPreparation()
  const savePreparation = useSavePreparation()
  const cancelPreparation = useCancelPreparation()

  const [step] = useState<string>('resume')
  const [coverText, setCoverText] = useState('')
  const [questionInput, setQuestionInput] = useState('')
  const [busy, setBusy] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [notice, setNotice] = useState<string | null>(null)

  const prep = prepQuery.data
  const isPending = prepQuery.isPending
  const isError = prepQuery.isError

  async function handleStartPreparation() {
    if (!jobId) return
    setBusy('starting')
    try {
      const result = await startMutation.mutateAsync({ jobId, resumeId: undefined })
      setNotice('Preparation started.')
      queryClient.invalidateQueries({ queryKey: ['preparation', result.preparationId] })
      navigate(`/application-preparations/${result.preparationId}`)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to start preparation')
    } finally {
      setBusy(null)
    }
  }

  async function handleGenerateResume() {
    if (!jobId) return
    setBusy('resume')
    try {
      await generateResume.mutateAsync({ preparationId: jobId, replace: false })
      setNotice('Tailored resume draft generated. Review every line before use.')
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Resume generation failed')
    } finally {
      setBusy(null)
    }
  }

  async function handleGenerateCoverLetter() {
    if (!jobId) return
    setBusy('cover-letter')
    try {
      const res = await generateCoverLetter.mutateAsync({ preparationId: jobId, replace: false })
      setCoverText(res.coverLetter.body)
      setNotice('Cover letter draft generated. Review every line before use.')
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Cover letter generation failed')
    } finally {
      setBusy(null)
    }
  }

  async function handleGenerateAnswers() {
    if (!jobId || !questionInput.trim()) return
    setBusy('answers')
    try {
      await generateAnswers.mutateAsync({
        preparationId: jobId,
        questions: [questionInput.trim()],
      })
      setQuestionInput('')
      setNotice('Answer draft generated as unverified — confirm before submitting.')
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Answer generation failed')
    } finally {
      setBusy(null)
    }
  }

  async function handleReviewPreparation(body: {
    component?: 'tailoredResume' | 'coverLetter' | 'answers' | 'package'
    answerId?: string
    decision?: 'approve' | 'reject'
    note?: string
  }) {
    setBusy('review')
    try {
      await reviewPreparation.mutateAsync({ preparationId: jobId, body })
      setNotice('Review recorded.')
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Review failed')
    } finally {
      setBusy(null)
    }
  }

  async function handleSavePreparation() {
    if (!jobId) return
    setBusy('save')
    try {
      await savePreparation.mutateAsync({ preparationId: jobId, body: {} })
      setNotice('Draft saved.')
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Save failed')
    } finally {
      setBusy(null)
    }
  }

  async function handleCancelPreparation() {
    if (!jobId) return
    setBusy('cancel')
    try {
      await cancelPreparation.mutateAsync(jobId)
      setNotice('Preparation cancelled.')
      navigate('/applications')
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Cancel failed')
    } finally {
      setBusy(null)
    }
  }

  if (jobId && !prep && !isPending && !isError && !startMutation.isPending) {
    void handleStartPreparation()
  }

  if (isPending) {
    return (
      <div className="mx-auto max-w-6xl space-y-8">
        <PageHeader title="Preparation" description="Preparing your application package." eyebrow="PREPARATION" />
        <Card className="border-[var(--border)] shadow-[var(--shadow-sm)]">
          <CardContent className="flex items-center gap-3 py-10 text-center text-sm text-[var(--text-secondary)]">
            <Loader2 className="h-4 w-4 animate-spin" /> Loading preparation…
          </CardContent>
        </Card>
      </div>
    )
  }

  if (isError || !prep) {
    return (
      <div className="mx-auto max-w-6xl space-y-8">
        <PageHeader title="Preparation" description="Unable to load preparation." eyebrow="PREPARATION" />
        <Card className="border-[var(--border)] shadow-[var(--shadow-sm)]">
          <CardContent className="flex flex-col items-center gap-3 py-10 text-center">
            <AlertCircle className="h-6 w-6 text-[var(--text-tertiary)]" />
            <p className="text-sm font-medium text-[var(--text-primary)]">
              {error || 'Could not load preparation.'}
            </p>
            {jobId && (
              <Button variant="secondary" size="sm" onClick={handleStartPreparation}>
                Start preparation
              </Button>
            )}
          </CardContent>
        </Card>
      </div>
    )
  }

  const { tailoredResume, coverLetter, answers } = prep
  const allComponentsApproved =
    (!tailoredResume || tailoredResume.reviewStatus === 'APPROVED') &&
    (!coverLetter || coverLetter.reviewStatus === 'APPROVED') &&
    answers.every((a: PreparedAnswer) => a.reviewStatus === 'APPROVED') &&
    answers.length > 0

  return (
    <div className="mx-auto max-w-6xl space-y-8">
      <PageHeader
        title="Prepare application"
        description={prep.status === 'APPROVED' ? 'Approved preparation package — saved as draft, not submitted.' : 'Tailor your materials before applying.'}
        eyebrow="PREPARATION"
        actions={
          <Button variant="ghost" size="sm" onClick={() => navigate(`/jobs/${jobId}`)}>
            Back to job
          </Button>
        }
      />
      {error && (
        <p role="alert" className="rounded-md border border-red-300 bg-red-50 px-3 py-2 text-sm text-red-800">
          {error}
        </p>
      )}
      {notice && (
        <p role="status" className="rounded-md border border-emerald-300 bg-emerald-50 px-3 py-2 text-sm text-emerald-800">
          {notice}
        </p>
      )}
      <div className="flex items-center gap-4 px-4">
        {STEP_ORDER.map((s) => {
          const completed =
            (s === 'resume' && !!tailoredResume) ||
            (s === 'coverLetter' && !!coverLetter) ||
            (s === 'answers' && answers.length > 0) ||
            (s === 'review' && prep.status === 'APPROVED')
          const active = step === s
          return (
            <div key={s} className="flex items-center gap-2 px-3 py-1.5 rounded-lg text-sm font-medium transition-colors">
              {completed && <CheckCircle2 className="h-4 w-4" />}
              {!completed && active && <Loader2 className="h-4 w-4 animate-spin" />}
              <span>{STEP_LABELS[s]}</span>
            </div>
          )
        })}
      </div>
      {step === 'resume' && (
        <Card className="border-[var(--border)] shadow-[var(--shadow-sm)]">
          <CardContent className="p-5 sm:p-6">
            <h3 className="text-sm font-semibold text-[var(--text-primary)]">Tailored resume</h3>
            <p className="mt-1 text-sm text-[var(--text-secondary)]">
              Generate a tailored resume from your verified profile and the job requirements.
            </p>
            {tailoredResume ? (
              <div className="mt-4 rounded-md border border-[var(--border)] bg-[var(--surface)] p-4">
                <p className="text-sm text-[var(--text-primary)]">{tailoredResume.summary}</p>
                {tailoredResume.highlights.length > 0 && (
                  <ul className="mt-2 list-disc pl-5 text-sm text-[var(--text-secondary)]">
                    {tailoredResume.highlights.map((h: string) => (
                      <li key={h}>{h}</li>
                    ))}
                  </ul>
                )}
                {tailoredResume.skillsUsed.length > 0 && (
                  <p className="mt-2 text-xs text-[var(--text-tertiary)]">
                    Verified skills used: {tailoredResume.skillsUsed.join(', ')}
                  </p>
                )}
                <VerificationBadge verification={tailoredResume.verification} showDetails />
                {tailoredResume.flaggedGaps.length > 0 && (
                  <div className="mt-2 rounded-md border border-amber-300 bg-amber-50 px-3 py-2 text-xs text-amber-800">
                    <p className="font-semibold">Missing information:</p>
                    <ul className="list-disc pl-5">
                      {tailoredResume.flaggedGaps.map((g: string) => (
                        <li key={g}>{g}</li>
                      ))}
                    </ul>
                  </div>
                )}
                <p className="mt-2 text-xs text-[var(--text-tertiary)]">
                  The original resume file is unchanged.
                </p>
                <div className="mt-4 flex flex-wrap gap-2">
                  <Button
                    type="button"
                    disabled={busy === 'resume' || tailoredResume.reviewStatus === 'APPROVED'}
                    onClick={handleGenerateResume}
                  >
                    {busy === 'resume' ? 'Generating…' : 'Regenerate'}
                  </Button>
                  {tailoredResume.reviewStatus !== 'APPROVED' && tailoredResume.reviewStatus !== 'REJECTED' && (
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      onClick={() => void handleReviewPreparation({ component: 'tailoredResume', decision: 'approve' })}
                    >
                      Approve
                    </Button>
                  )}
                </div>
              </div>
            ) : (
              <div className="mt-4">
                <Button
                  type="button"
                  disabled={busy === 'resume'}
                  onClick={handleGenerateResume}
                >
                  {busy === 'resume' ? 'Generating…' : 'Generate tailored resume'}
                </Button>
                <p className="mt-2 text-xs text-[var(--text-tertiary)]">
                  Tailoring uses your verified skills and experience only. Missing required skills are flagged.
                </p>
              </div>
            )}
          </CardContent>
        </Card>
      )}
      {step === 'coverLetter' && (
        <Card className="border-[var(--border)] shadow-[var(--shadow-sm)]">
          <CardContent className="p-5 sm:p-6">
            <h3 className="text-sm font-semibold text-[var(--text-primary)]">Cover letter</h3>
            <p className="mt-1 text-sm text-[var(--text-secondary)]">
              Generate a cover letter specific to this job and company.
            </p>
            {(coverText || coverLetter?.body) && (
              <div className="mt-4 rounded-md border border-[var(--border)] bg-[var(--surface)] p-4">
                <textarea
                  aria-label="Cover letter draft"
                  value={coverText || coverLetter?.body || ''}
                  onChange={(e) => setCoverText(e.target.value)}
                  rows={8}
                  className="mt-1 block w-full rounded-md border border-slate-300 px-2 py-1.5 text-sm"
                />
                {coverLetter && coverLetter.flaggedGaps.length > 0 && (
                  <div className="mt-2 rounded-md border border-amber-300 bg-amber-50 px-3 py-2 text-xs text-amber-800">
                    <p className="font-semibold">Missing information:</p>
                    <ul className="list-disc pl-5">
                      {coverLetter.flaggedGaps.map((g: string) => (
                        <li key={g}>{g}</li>
                      ))}
                    </ul>
                  </div>
                )}
                {coverLetter && <VerificationBadge verification={coverLetter.verification} showDetails />}
                <div className="mt-4 flex flex-wrap gap-2">
                  <Button
                    type="button"
                    disabled={busy === 'cover-letter'}
                    onClick={handleGenerateCoverLetter}
                  >
                    {busy === 'cover-letter' ? 'Generating…' : coverText || coverLetter?.body ? 'Regenerate' : 'Generate cover letter'}
                  </Button>
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    disabled={!(coverText || coverLetter?.body)}
                    onClick={() => void savePreparation.mutateAsync({ preparationId: jobId, body: {} })}
                  >
                    Save
                  </Button>
                  {coverLetter?.reviewStatus !== 'APPROVED' && coverLetter?.reviewStatus !== 'REJECTED' && coverLetter?.body && (
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      onClick={() => void handleReviewPreparation({ component: 'coverLetter', decision: 'approve' })}
                    >
                      Approve
                    </Button>
                  )}
                </div>
              </div>
            )}
            {!coverText && !coverLetter?.body && (
              <div className="mt-4">
                <Button
                  type="button"
                  disabled={busy === 'cover-letter'}
                  onClick={handleGenerateCoverLetter}
                >
                  {busy === 'cover-letter' ? 'Generating…' : 'Generate cover letter'}
                </Button>
                <p className="mt-2 text-xs text-[var(--text-tertiary)]">
                  The letter uses your verified experience and skills only. Company facts are never invented.
                </p>
              </div>
            )}
          </CardContent>
        </Card>
      )}
      {step === 'answers' && (
        <Card className="border-[var(--border)] shadow-[var(--shadow-sm)]">
          <CardContent className="p-5 sm:p-6">
            <h3 className="text-sm font-semibold text-[var(--text-primary)]">Application questions</h3>
            <p className="mt-1 text-sm text-[var(--text-secondary)]">
              Prepare answers to application questions using your verified information.
            </p>
            <div className="mt-4 flex flex-wrap gap-2">
              <Input
                aria-label="Application question"
                placeholder="e.g. What is your notice period?"
                value={questionInput}
                onChange={(e) => setQuestionInput(e.target.value)}
                className="flex-1 h-9"
              />
              <Button
                type="button"
                disabled={busy === 'answers' || !questionInput.trim()}
                onClick={handleGenerateAnswers}
              >
                {busy === 'answers' ? 'Generating…' : 'Generate answer'}
              </Button>
            </div>
            {answers.length > 0 && (
              <div className="mt-4 space-y-3">
                {answers.map((answer: PreparedAnswer) => (
                  <div key={answer._id} className="rounded-md border border-[var(--border)] bg-[var(--surface)] p-3">
                    <p className="text-sm font-medium text-[var(--text-primary)]">{answer.question}</p>
                    <textarea
                      aria-label={'Answer to ' + answer.question}
                      value={answer.answer}
                      onChange={(e) => {
                        void updateAnswer.mutateAsync({
                          preparationId: jobId,
                          answerId: answer._id,
                          body: { answer: e.target.value },
                        })
                      }}
                      rows={3}
                      className="mt-1 block w-full rounded-md border border-slate-300 px-2 py-1.5 text-sm"
                    />
                    <div className="mt-2 flex items-center gap-2 text-xs text-[var(--text-tertiary)]">
                      <span>
                        {answer.reviewStatus === 'APPROVED' ? 'Approved' : answer.reviewStatus === 'REJECTED' ? 'Rejected' : 'Pending review'}
                      </span>
                      {answer.sensitive && <span className="text-red-600">· sensitive declaration</span>}
                      {answer.reviewStatus === 'NEEDS_CANDIDATE_INPUT' && (
                        <span className="text-amber-600">· needs your input</span>
                      )}
                      {answer.reviewStatus === 'NEEDS_REVIEW' && (
                        <span className="text-amber-600">· needs review</span>
                      )}
                    </div>
                    <VerificationBadge verification={answer.verification} />
                    <div className="mt-2 flex flex-wrap gap-2">
                      <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        onClick={() =>
                          void updateAnswer.mutateAsync({
                            preparationId: jobId,
                            answerId: answer._id,
                            body: { reviewStatus: 'APPROVED' },
                          })
                        }
                        disabled={answer.reviewStatus === 'APPROVED'}
                      >
                        Approve
                      </Button>
                      <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        onClick={() =>
                          void updateAnswer.mutateAsync({
                            preparationId: jobId,
                            answerId: answer._id,
                            body: { reviewStatus: 'REJECTED' },
                          })
                        }
                        disabled={answer.reviewStatus === 'REJECTED'}
                      >
                        Reject
                      </Button>
                    </div>
                  </div>
                ))}
              </div>
            )}
            {!answers.length && (
              <p className="mt-4 text-sm text-[var(--text-tertiary)]">
                No answers generated yet. Ask a question above to get started.
              </p>
            )}
          </CardContent>
        </Card>
      )}
      {step === 'review' && (
        <Card className="border-[var(--border)] shadow-[var(--shadow-sm)]">
          <CardContent className="p-5 sm:p-6">
            <h3 className="text-sm font-semibold text-[var(--text-primary)]">Final review</h3>
            <p className="mt-1 text-sm text-[var(--text-secondary)]">
              Review all components before approving the preparation package.
            </p>
            <div className="mt-4 space-y-4">
              <div className="flex items-center justify-between p-3 rounded-md border border-[var(--border)] bg-[var(--surface-secondary)]">
                <div>
                  <p className="text-sm font-medium text-[var(--text-primary)]">Tailored resume</p>
                  <p className="text-xs text-[var(--text-tertiary)]">
                    {tailoredResume ? tailoredResume.reviewStatus : 'Not generated'}
                  </p>
                </div>
                {tailoredResume && tailoredResume.reviewStatus !== 'APPROVED' && tailoredResume.reviewStatus !== 'REJECTED' && (
                  <Button type="button" variant="outline" size="sm" onClick={() => void handleReviewPreparation({ component: 'tailoredResume', decision: 'approve' })}>
                    Approve
                  </Button>
                )}
              </div>
              <div className="flex items-center justify-between p-3 rounded-md border border-[var(--border)] bg-[var(--surface-secondary)]">
                <div>
                  <p className="text-sm font-medium text-[var(--text-primary)]">Cover letter</p>
                  <p className="text-xs text-[var(--text-tertiary)]">
                    {coverLetter ? coverLetter.reviewStatus : 'Not generated'}
                  </p>
                </div>
                {coverLetter && coverLetter.reviewStatus !== 'APPROVED' && coverLetter.reviewStatus !== 'REJECTED' && (
                  <Button type="button" variant="outline" size="sm" onClick={() => void handleReviewPreparation({ component: 'coverLetter', decision: 'approve' })}>
                    Approve
                  </Button>
                )}
              </div>
              <div className="flex items-center justify-between p-3 rounded-md border border-[var(--border)] bg-[var(--surface-secondary)]">
                <div>
                  <p className="text-sm font-medium text-[var(--text-primary)]">Question answers</p>
                  <p className="text-xs text-[var(--text-tertiary)]">
                    {answers.filter((a: PreparedAnswer) => a.reviewStatus === 'APPROVED').length}/{answers.length} approved
                  </p>
                </div>
                {answers.some((a: PreparedAnswer) => a.reviewStatus !== 'APPROVED' && a.reviewStatus !== 'REJECTED') && (
                  <Button type="button" variant="outline" size="sm" onClick={() => void handleReviewPreparation({ component: 'answers', decision: 'approve' })}>
                    Approve all
                  </Button>
                )}
              </div>
              <div className="mt-4">
                <p className="text-sm font-medium text-[var(--text-primary)]">Missing information</p>
                {prep.missingInformation.length > 0 ? (
                  <ul className="mt-1 list-disc pl-5 text-sm text-[var(--text-tertiary)]">
                    {prep.missingInformation.map((m: string) => (
                      <li key={m}>{m}</li>
                    ))}
                  </ul>
                ) : (
                  <p className="text-xs text-[var(--text-tertiary)]">None identified.</p>
                )}
              </div>
              <div className="mt-6 flex flex-wrap gap-2">
                <Button
                  type="button"
                  disabled={busy === 'review' || !allComponentsApproved}
                  onClick={() => void handleReviewPreparation({ component: 'package', decision: 'approve' })}
                >
                  {busy === 'review' ? 'Approving…' : 'Approve package'}
                </Button>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  disabled={busy === 'review'}
                  onClick={handleSavePreparation}
                >
                  <><Save className="h-4 w-4 mr-2" />Save draft</>
                </Button>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={handleCancelPreparation}
                >
                  Cancel
                </Button>
              </div>
              <p className="mt-2 text-xs text-[var(--text-tertiary)]">
                Approval saves the package as a draft. Nothing is submitted to any platform.
              </p>
            </div>
          </CardContent>
        </Card>
      )}
      <p className="text-xs text-[var(--text-tertiary)] text-center">
        Preparation is for review only. No application is submitted through this workflow.
      </p>
    </div>
  )
}
