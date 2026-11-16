/** Naukri Application Workflow Page.
 *
 * End-to-end candidate journey for applying to a Naukri job.
 * Steps:
 *  1. Job selection (imported job details)
 *  2. Mode selection (AUTO or APPROVAL)
 *  3. Create execution + inspect form
 *  4. Field mapping review (edit mappings)
 *  5. Missing information input
 *  6. Approval (APPROVAL mode requires explicit approval; AUTO skips to fill)
 *  7. Form filling
 *  8. Final review
 *  9. Manual submission handoff
 *
 * Never submits automatically — final submission is always manual.
 */

import { useState, useEffect, useCallback } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { PageHeader } from '@/components/PageHeader'
import { Card, CardContent } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import {
  createAutomationExecution,
  fillAutomationExecution,
  getAutomationExecution,
  inspectAutomationExecution,
  updateAutomationAnswers,
  reviewAutomationExecution,
  pauseAutomationExecution,
  cancelAutomationExecution,
  type AutomationExecution,
} from '@/services/automation'
import { getJob } from '@/services/jobs'
import type { JobDetail } from '@/services/jobs'
import { Loader2, CheckCircle2, User, Scroll } from 'lucide-react'

type WorkflowStep =
  | 'job'
  | 'mode'
  | 'inspect'
  | 'mapping'
  | 'missing-info'
  | 'approval'
  | 'filling'
  | 'review'
  | 'handoff'
  | 'complete'

export function NaukriWorkflowPage() {
  const { id: jobId } = useParams()
  const navigate = useNavigate()

  const [step, setStep] = useState<WorkflowStep>('job')
  const [job, setJob] = useState<JobDetail | null>(null)
  const [execution, setExecution] = useState<AutomationExecution | null>(null)
  const [mode, setMode] = useState<'auto' | 'approval'>('approval')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [notice, setNotice] = useState<string | null>(null)

  // Load job details
  useEffect(() => {
    if (!jobId) return
    setLoading(true)
    getJob(jobId)
      .then((j) => {
        setJob(j)
        setStep('mode')
      })
      .catch((err) => {
        setError(err instanceof Error ? err.message : 'Failed to load job')
        setLoading(false)
      })
  }, [jobId])

  // Load execution if we have one
  useEffect(() => {
    if (execution?.id) {
      // Already loaded
    }
  }, [execution])

  const startExecution = useCallback(async () => {
    if (!job) return
    setLoading(true)
    setError(null)
    try {
      const appUrl = job.applicationUrl || `https://www.naukri.com/job-listings-${jobId}`
      const result = await createAutomationExecution({
        applicationUrl: appUrl,
        jobId: job.id,
        platform: 'naukri',
      })
      setExecution(result)
      setStep('inspect')
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to start application')
      setLoading(false)
    } finally {
      setLoading(false)
    }
  }, [job])

  const inspectForm = useCallback(async () => {
    if (!execution?.id) return
    setLoading(true)
    setError(null)
    try {
      const updated = await inspectAutomationExecution(execution.id, execution.applicationUrl)
      setExecution(updated)
      setStep('mapping')
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to inspect form')
      setLoading(false)
    } finally {
      setLoading(false)
    }
  }, [execution?.id])

  const updateAnswers = useCallback(async (answers: Array<{ fieldId: string; value: string }>) => {
    if (!execution?.id) return
    setLoading(true)
    setError(null)
    try {
      const updated = await updateAutomationAnswers(execution.id, answers)
      setExecution(updated)
      setStep('approval')
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to update answers')
      setLoading(false)
    } finally {
      setLoading(false)
    }
  }, [execution?.id])

  const approveExecution = useCallback(async (approved: boolean) => {
    if (!execution?.id) return
    setLoading(true)
    setError(null)
    try {
      const updated = await reviewAutomationExecution(execution.id, approved)
      setExecution(updated)
      if (approved) {
        setStep('filling')
      } else {
        setStep('mapping')
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to review application')
      setLoading(false)
    } finally {
      setLoading(false)
    }
  }, [execution?.id])

  const fillForm = useCallback(async () => {
    if (!execution?.id) return
    setLoading(true)
    setError(null)
    try {
      const updated = await fillAutomationExecution(execution.id)
      setExecution(updated)
      setStep('review')
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to fill form')
      setLoading(false)
    } finally {
      setLoading(false)
    }
  }, [execution?.id])

  const handlePause = useCallback(async () => {
    if (!execution?.id) return
    try {
      await pauseAutomationExecution(execution.id, 'Challenge detected — manual intervention required')
      const updated = await getAutomationExecution(execution.id)
      setExecution(updated)
      setNotice('Paused. A challenge requires your attention.')
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to pause')
    }
  }, [execution?.id])

  const handleCancel = useCallback(async () => {
    if (!execution?.id) return
    try {
      await cancelAutomationExecution(execution.id)
      navigate('/jobs')
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to cancel')
    }
  }, [execution?.id, navigate])

  const getMappings = () => execution?.fieldMappings || []
  const getNeedsInput = () => execution?.candidateInputRequired || []
  const getFilled = () => execution?.filledFields || []
  const getSkipped = () => execution?.skippedFields || []
  const getFailed = () => execution?.failedFields || []

  // Header
  return (
    <div className="mx-auto max-w-4xl space-y-6">
      <PageHeader
        title={step === 'job' ? 'Import Job' : step === 'mode' ? 'Select Mode' : step === 'inspect' ? 'Inspecting Form' : step === 'mapping' ? 'Review Field Mappings' : step === 'missing-info' ? 'Provide Missing Information' : step === 'approval' ? 'Approve Application' : step === 'filling' ? 'Filling Form' : step === 'review' ? 'Final Review' : step === 'handoff' ? 'Manual Submission' : 'Complete'}
        description={step === 'job'
          ? 'Enter a Naukri job URL to begin.'
          : step === 'mode'
            ? 'Choose how much control you want over the application process.'
            : step === 'inspect'
              ? 'Inspecting the application form…'
              : step === 'mapping'
                ? 'Review how candidate data maps to form fields.'
                : step === 'missing-info'
                  ? 'Some fields need your input before we can proceed.'
                  : step === 'approval'
                    ? 'Review and approve the prepared application.'
                    : step === 'filling'
                      ? 'Filling supported fields on the application form.'
                      : step === 'review'
                        ? 'Review filled fields before manual submission.'
                        : step === 'handoff'
                          ? 'Complete the application on the platform website.'
                          : 'Workflow complete.'}
        eyebrow="NAUKRI WORKFLOW"
        actions={
          execution && (
            <Button variant="ghost" size="sm" onClick={() => navigate(`/jobs/${jobId}`)}>
              Back to job
            </Button>
          )
        }
      />

      {error && (
        <div role="alert" className="rounded-md border border-red-300 bg-red-50 px-4 py-3 text-sm text-red-800">
          {error}
          <Button variant="outline" size="sm" onClick={() => setError(null)} className="ml-2">
            Dismiss
          </Button>
        </div>
      )}

      {notice && (
        <div className="rounded-md border border-amber-300 bg-amber-50 px-4 py-3 text-sm text-amber-800 mb-4">
          {notice}
          <Button variant="outline" size="sm" onClick={() => setNotice(null)} className="ml-2">
            Dismiss
          </Button>
        </div>
      )}

      {/* Step: Job Selection */}
      {step === 'job' && (
        <Card className="border-[var(--border)] shadow-[var(--shadow-sm)]">
          <CardContent>
            <h3 className="text-sm font-semibold">Import a Naukri Job</h3>
            <p className="text-sm text-[var(--text-secondary)] mt-1">
              Enter the job posting URL. Platform capabilities will be checked automatically.
            </p>
            <Input
              placeholder="https://www.naukri.com/job-listings-..."
              className="mt-2"
            />
            <Button onClick={() => navigate('/jobs/import')} className="mt-4">
              Go to Job Import
            </Button>
          </CardContent>
        </Card>
      )}

      {/* Step: Mode Selection */}
      {step === 'mode' && job && (
        <Card className="border-[var(--border)] shadow-[var(--shadow-sm)]">
          <CardContent>
            <h3 className="text-sm font-semibold">Application Mode</h3>
            <p className="text-sm text-[var(--text-secondary)] mt-1">
              Choose how much control you want over field mapping and approval.
            </p>

            <div className="mt-6 space-y-4">
              <button
                onClick={() => { setMode('auto'); setStep('inspect') }}
                className={`w-full py-3 px-4 rounded-lg border transition-colors ${
                  mode === 'auto'
                    ? 'bg-brand-900 text-white border-brand-900'
                    : 'bg-white border-[var(--border)] text-[var(--text-primary)] hover:bg-[var(--muted)]'
                }`}
              >
                <div className="flex items-center justify-between">
                  <span className="font-medium">AUTO Mode</span>
                  <CheckCircle2 className={mode === 'auto' ? 'text-white' : 'text-[var(--text-tertiary)]'} />
                </div>
                <p className="text-xs text-[var(--text-secondary)] mt-1">
                  Automatically prepare and fill supported fields. Unknown or sensitive
                  fields still require your input.
                </p>
              </button>

              <button
                onClick={() => { setMode('approval'); startExecution() }}
                className={`w-full py-3 px-4 rounded-lg border transition-colors ${
                  mode === 'approval'
                    ? 'bg-brand-900 text-white border-brand-900'
                    : 'bg-white border-[var(--border)] text-[var(--text-primary)] hover:bg-[var(--muted)]'
                }`}
              >
                <div className="flex items-center justify-between">
                  <span className="font-medium">APPROVAL Mode</span>
                  <User className={mode === 'approval' ? 'text-white' : 'text-[var(--text-tertiary)]'} />
                </div>
                <p className="text-xs text-[var(--text-secondary)] mt-1">
                  Review every proposed mapping before anything is filled. Explicit
                  approval is required before form filling.
                </p>
              </button>
            </div>

            <div className="mt-6 flex gap-2">
              <Button variant="outline" onClick={() => navigate('/jobs')}>
                Back to Jobs
              </Button>
              <Button
                onClick={() => { setMode('auto'); startExecution() }}
                disabled={loading}
                className="flex-1 bg-brand-900 text-white"
              >
                {loading ? 'Starting…' : 'Start in AUTO Mode'}
              </Button>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Step: Inspect */}
      {step === 'inspect' && execution && (
        <Card className="border-[var(--border)] shadow-[var(--shadow-sm)]">
          <CardContent>
            <h3 className="text-sm font-semibold">Inspecting Application Form</h3>
            <p className="text-sm text-[var(--text-secondary)] mt-1">
              Inspect the application form at {execution.applicationUrl} to extract fields.
            </p>
            <div className="mt-4 flex gap-3">
              <Button onClick={inspectForm} disabled={loading} className="flex-1">
                {loading ? 'Inspecting…' : 'Inspect Form'}
              </Button>
              <Button variant="outline" onClick={() => setStep('mapping')}>
                Skip Inspection
              </Button>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Step: Field Mapping Review */}
      {step === 'mapping' && execution && (
        <Card className="border-[var(--border)] shadow-[var(--shadow-sm)]">
          <CardContent>
            <h3 className="text-sm font-semibold">Field Mapping Review</h3>
            <p className="text-sm text-[var(--text-secondary)] mt-1">
              Review how your verified profile data maps to each form field.
            </p>

            <div className="mt-4 space-y-3">
              {getMappings().length > 0 ? (
                getMappings().map((m) => (
                  <div key={m.fieldId} className="border rounded-lg p-3">
                    <div className="flex justify-between items-start mb-2">
                      <span className="font-medium text-[var(--text-primary)]">{m.fieldLabel}</span>
                      <span className={`text-xs px-2 py-1 rounded ${
                        m.result === 'MAPPED' ? 'bg-green-100 text-green-800' :
                        m.result === 'NEEDS_CANDIDATE_INPUT' ? 'bg-amber-100 text-amber-800' :
                        m.result === 'UNSUPPORTED' ? 'bg-red-100 text-red-800' :
                        'bg-[var(--muted)] text-[var(--text-tertiary)]'
                      }`}>
                        {m.result}
                      </span>
                    </div>
                    <div className="text-xs text-[var(--text-secondary)] mb-2">
                      Type: {m.fieldType} · Source: {m.source || 'none'}
                    </div>
                    {m.value && (
                      <div className="mb-2">
                        <label className="text-xs text-[var(--text-secondary)] block">Proposed value:</label>
                        <input
                          type="text"
                          value={m.value}
                          readOnly
                          className="w-full border rounded px-2 py-1 text-xs bg-[var(--background)]"
                        />
                      </div>
                    )}
                    {m.reason && (
                      <p className="text-xs text-[var(--text-tertiary)]">{m.reason}</p>
                    )}
                  </div>
                ))
              ) : (
                <p className="text-sm text-[var(--text-secondary)]">No fields detected yet.</p>
              )}
            </div>

            <div className="mt-6 flex gap-3">
              <Button variant="outline" onClick={() => setStep('mode')}>
                Change Mode
              </Button>
              {getNeedsInput().length > 0 ? (
                <Button onClick={() => setStep('missing-info')}>
                  Provide Missing Info
                </Button>
              ) : (
                <Button onClick={() => approveExecution(true)}>
                  Approve All Mappings
                </Button>
              )}
            </div>
          </CardContent>
        </Card>
      )}

      {/* Step: Missing Information */}
      {step === 'missing-info' && execution && (
        <Card className="border-[var(--border)] shadow-[var(--shadow-sm)]">
          <CardContent>
            <h3 className="text-sm font-semibold">Provide Missing Information</h3>
            <p className="text-sm text-[var(--text-secondary)] mt-1">
              Some fields cannot be mapped from your verified profile. Please provide values.
            </p>

            <form onSubmit={(e) => {
              e.preventDefault()
              const formData = new FormData(e.target as HTMLFormElement)
              const answers: Array<{ fieldId: string; value: string }> = []
              getNeedsInput().forEach((m) => {
                const value = formData.get(`field-${m.fieldId}`)
                if (value) answers.push({ fieldId: m.fieldId, value: String(value) })
              })
              updateAnswers(answers)
            }} className="space-y-3">
              {getNeedsInput().map((m) => (
                <div key={m.fieldId} className="border rounded-lg p-3">
                  <label className="block text-sm font-medium mb-1">{m.fieldLabel}</label>
                  <p className="text-xs text-[var(--text-secondary)] mb-2">{m.reason || 'Required'}</p>
                  <input
                    name={`field-${m.fieldId}`}
                    type="text"
                    required
                    className="w-full border rounded px-2 py-1"
                    placeholder={`Enter ${m.fieldLabel.toLowerCase()}`}
                  />
                </div>
              ))}
              <Button type="submit" className="w-full">
                Save & Continue to Approval
              </Button>
            </form>
          </CardContent>
        </Card>
      )}

      {/* Step: Approval */}
      {step === 'approval' && execution && (
        <Card className="border-[var(--border)] shadow-[var(--shadow-sm)]">
          <CardContent>
            <h3 className="text-sm font-semibold">Approve Application</h3>
            <p className="text-sm text-[var(--text-secondary)] mt-1">
              Review the prepared application before filling. Approval is required
              before supported fields are filled on the form.
            </p>

            <div className="mt-4 space-y-3">
              <div className="flex items-start gap-3">
                <div className="flex-1 border rounded-lg p-3">
                  <h4 className="text-xs font-semibold text-[var(--text-secondary)] uppercase">Mapped Fields</h4>
                  <ul className="text-xs space-y-1 mt-2">
                    {getMappings().filter((m) => m.result === 'MAPPED').map((m) => (
                      <li key={m.fieldId} className="flex justify-between">
                        <span>{m.fieldLabel}</span>
                        <span className="text-[var(--text-tertiary)]">{m.value}</span>
                      </li>
                    ))}
                  </ul>
                </div>
                <div className="flex-1 border rounded-lg p-3">
                  <h4 className="text-xs font-semibold text-[var(--text-secondary)] uppercase">Needs Input</h4>
                  <ul className="text-xs space-y-1 mt-2">
                    {getNeedsInput().map((m) => (
                      <li key={m.fieldId} className="flex justify-between">
                        <span className="text-amber-800">{m.fieldLabel}</span>
                        <span className="text-[var(--text-tertiary)]">pending</span>
                      </li>
                    ))}
                  </ul>
                </div>
              </div>

              <div className="bg-amber-50 border border-amber-200 rounded-lg p-3 mt-4">
                <h4 className="text-xs font-semibold text-amber-900 uppercase mb-2">Important</h4>
                <p className="text-xs text-amber-800">
                  Approval means you consent to filling the mapped fields on the
                  application form. Final submission remains entirely manual — you
                  will complete the submission on the platform website.
                </p>
              </div>
            </div>

            <div className="mt-6 flex gap-3">
              <Button variant="outline" onClick={() => setStep('mapping')}>
                Edit Mappings
              </Button>
              <Button onClick={() => approveExecution(true)} className="bg-brand-900 text-white">
                Approve & Fill Form
              </Button>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Step: Filling */}
      {step === 'filling' && execution && (
        <Card className="border-[var(--border)] shadow-[var(--shadow-sm)]">
          <CardContent>
            <h3 className="text-sm font-semibold">Filling Form</h3>
            <p className="text-sm text-[var(--text-secondary)] mt-1">
              Supported fields are being filled with your verified data.
            </p>

            <div className="mt-4 space-y-2">
              <div className="flex justify-between text-sm">
                <span>Filled:</span>
                <span className="text-green-800 font-medium">{getFilled().length}</span>
              </div>
              <div className="flex justify-between text-sm">
                <span>Skipped:</span>
                <span className="text-[var(--text-tertiary)]">{getSkipped().length}</span>
              </div>
              <div className="flex justify-between text-sm">
                <span>Failed:</span>
                <span className="text-red-800 font-medium">{getFailed().length}</span>
              </div>
            </div>

            {getFailed().length > 0 && (
              <div className="mt-4 border rounded-lg p-3 bg-red-50 border-red-100">
                <h4 className="text-xs font-semibold text-red-900 uppercase">Failed Fields</h4>
                <ul className="text-xs space-y-1 mt-2">
                  {getFailed().map((f) => (
                    <li key={f.fieldId} className="flex justify-between">
                      <span>{f.fieldLabel}</span>
                      <span className="text-[var(--text-tertiary)]">{f.error || 'failed'}</span>
                    </li>
                  ))}
                </ul>
              </div>
            )}

            <div className="mt-6 flex gap-3">
              <Button variant="outline" onClick={handlePause}>
                Pause
              </Button>
              <Button onClick={fillForm} disabled={loading} className="flex-1 bg-brand-900 text-white">
                {loading ? 'Filling…' : 'Fill Supported Fields'}
              </Button>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Step: Final Review */}
      {step === 'review' && execution && (
        <Card className="border-[var(--border)] shadow-[var(--shadow-sm)]">
          <CardContent>
            <h3 className="text-sm font-semibold">Final Review</h3>
            <p className="text-sm text-[var(--text-secondary)] mt-1">
              Fields were filled and verified in a server-side browser session.
               Review the values below, then proceed to manual submission in your browser.
            </p>

            <div className="mt-4 space-y-3">
              <div className="border rounded-lg p-3">
                <h4 className="text-xs font-semibold text-[var(--text-secondary)] uppercase mb-3">Filled & Verified Fields</h4>
                <ul className="text-xs space-y-1">
                  {getFilled().map((f) => (
                    <li key={f.fieldId} className="flex justify-between items-start">
                      <div>
                        <span className="font-medium">{f.fieldLabel}</span>
                        <p className="text-[var(--text-tertiary)]">{f.value}</p>
                      </div>
                      <span className="text-green-700 text-xs">✓ Verified</span>
                    </li>
                  ))}
                </ul>
              </div>

              {getSkipped().length > 0 && (
                <div className="border rounded-lg p-3 bg-[var(--muted)]">
                  <h4 className="text-xs font-semibold text-[var(--text-secondary)] uppercase mb-3">Skipped Fields</h4>
                  <ul className="text-xs space-y-1">
                    {getSkipped().map((s) => (
                      <li key={s.fieldId} className="flex justify-between">
                        <span>{s.fieldLabel}</span>
                        <span className="text-[var(--text-tertiary)]">{s.error || 'skipped'}</span>
                      </li>
                    ))}
                  </ul>
                </div>
              )}
            </div>

            <div className="bg-green-50 border border-green-100 rounded-lg p-3 mt-4">
              <h4 className="text-xs font-semibold text-green-900 uppercase mb-2">Next Step</h4>
              <p className="text-xs text-green-800">
                Fields are filled and verified. Final submission is manual — you will
                complete it on the platform website.
              </p>
            </div>

            <div className="mt-6 flex gap-3">
              <Button variant="outline" onClick={() => setStep('mode')}>
                Start Over
              </Button>
              <Button onClick={() => setStep('handoff')} className="flex-1 bg-brand-900 text-white">
                Open Application Page
              </Button>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Step: Manual Handoff */}
      {step === 'handoff' && execution && job && (
        <Card className="border-[var(--border)] shadow-[var(--shadow-sm)] bg-amber-50 border-amber-100">
          <CardContent>
            <h3 className="text-sm font-semibold text-amber-900">Manual Submission Handoff</h3>
            <p className="text-sm text-amber-800 mt-1">
              Open the application page on {job.companyName}'s website to complete
              submission manually.
            </p>

            <div className="mt-4">
              <div className="flex items-center gap-3 mb-3">
                <Scroll className="h-5 w-5 text-amber-600" />
                <span className="font-medium text-amber-900">Application URL:</span>
              </div>
              <div className="bg-white border rounded-lg p-3 mb-4">
                <a
                  href={job.applicationUrl || execution.applicationUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-brand-700 underline text-sm break-all"
                >
                  {job.applicationUrl || execution.applicationUrl}
                </a>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => {
                    window.open(job.applicationUrl || execution.applicationUrl, '_blank')
                  }}
                  className="ml-2"
                >
                  Open in New Tab
                </Button>
              </div>

              <p className="text-xs text-[var(--text-secondary)] mb-4">
                The fields were filled and verified in a server-side browser session.
                They are NOT transferred to your browser. Please copy the values below
                and enter them on the platform website, then complete submission.
              </p>

              {getFilled().length > 0 && (
                <div className="bg-white border rounded-lg p-3 mb-4">
                  <h4 className="text-xs font-semibold text-[var(--text-secondary)] uppercase mb-2">
                    Filled Values (copy these to the form)
                  </h4>
                  <ul className="text-xs space-y-2">
                    {getFilled().map((f) => (
                      <li key={f.fieldId} className="flex items-start gap-2">
                        <span className="font-medium min-w-[120px]">{f.fieldLabel}:</span>
                        <span className="text-[var(--text-secondary)] break-all">{f.value}</span>
                      </li>
                    ))}
                  </ul>
                </div>
              )}

              <p className="text-xs text-[var(--text-secondary)] mb-4">
                After completing the submission on the platform website, record the
                outcome below.
              </p>

              <div className="flex gap-3">
                <Button
                  onClick={() => {
                    setStep('complete')
                    setNotice('Application marked as manually submitted. This is user-reported, not platform-verified.')
                  }}
                  className="flex-1 bg-brand-900 text-white"
                >
                  Mark as Submitted
                </Button>
                <Button variant="outline" onClick={handleCancel}>
                  Cancel
                </Button>
              </div>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Step: Complete */}
      {step === 'complete' && (
        <Card className="border-[var(--border)] shadow-[var(--shadow-sm)] bg-green-50 border-green-100">
          <CardContent className="text-center py-10">
            <CheckCircle2 className="h-12 w-12 text-green-600 mx-auto mb-4" />
            <h3 className="text-sm font-semibold text-green-900">Workflow Complete</h3>
            <p className="text-sm text-green-800 mt-1">
              Your application has been prepared and submitted manually on the platform.
            </p>
            <Button onClick={() => navigate('/applications')} className="mt-6">
              View Applications
            </Button>
          </CardContent>
        </Card>
      )}

      {/* Loading state */}
      {loading && !execution && !error && (
        <div className="flex flex-col items-center justify-center py-20">
          <Loader2 className="h-6 w-6 animate-spin mb-2" />
          <p className="text-sm text-[var(--text-secondary)]">Loading…</p>
        </div>
      )}
    </div>
  )
}
