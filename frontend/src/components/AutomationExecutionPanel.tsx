/** Browser automation execution panel (Phase 9.1).
 *
 * Displays automation execution status, detected fields, and candidate review.
 * Does NOT submit applications — final submission remains disabled.
 */

import { useState } from 'react'
import { Card, CardContent } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Pause, Play, X } from 'lucide-react'
import type { AutomationExecution } from '@/services/automation'

const stateLabels: Record<string, string> = {
  CREATED: 'Created',
  INSPECTING: 'Inspecting',
  FORM_DETECTED: 'Form detected',
  AWAITING_CANDIDATE_INPUT: 'Needs your input',
  READY_FOR_REVIEW: 'Ready for review',
  APPROVED_FOR_EXECUTION: 'Approved',
  FILLING: 'Filling',
  FILLED: 'Filled — review required',
  PAUSED: 'Paused',
  FAILED: 'Failed',
  CANCELLED: 'Cancelled',
  REQUIRES_MANUAL_ACTION: 'Manual action required',
}

const stateColors: Record<string, string> = {
  CREATED: 'bg-slate-100 text-slate-800',
  INSPECTING: 'bg-blue-100 text-blue-800',
  FORM_DETECTED: 'bg-blue-100 text-blue-800',
  AWAITING_CANDIDATE_INPUT: 'bg-amber-100 text-amber-800',
  READY_FOR_REVIEW: 'bg-amber-100 text-amber-800',
  APPROVED_FOR_EXECUTION: 'bg-emerald-100 text-emerald-800',
  FILLING: 'bg-blue-100 text-blue-800',
  FILLED: 'bg-emerald-100 text-emerald-800',
  PAUSED: 'bg-orange-100 text-orange-800',
  FAILED: 'bg-rose-100 text-rose-800',
  CANCELLED: 'bg-slate-100 text-slate-800',
  REQUIRES_MANUAL_ACTION: 'bg-rose-100 text-rose-800',
}

interface AutomationExecutionPanelProps {
  execution: AutomationExecution
  onPause?: () => void
  onResume?: () => void
  onCancel?: () => void
  onReview?: (approved: boolean) => void
  onFill?: () => void
}

export function AutomationExecutionPanel({
  execution,
  onPause,
  onResume,
  onCancel,
  onReview,
  onFill,
}: AutomationExecutionPanelProps) {
  const [showFields, setShowFields] = useState(false)

  const mappings = execution.fieldMappings ?? []
  const filled = execution.filledFields ?? []
  const failed = execution.failedFields ?? []

  return (
    <Card className="border-[var(--border)] shadow-[var(--shadow-sm)]">
      <CardContent className="p-5 sm:p-6 space-y-4">
        <div className="flex items-center justify-between">
          <div>
            <h3 className="text-sm font-semibold text-[var(--text-primary)]">Automation Execution</h3>
            <p className="text-xs text-[var(--text-tertiary)] mt-1">
              {execution.applicationUrl}
            </p>
          </div>
          <span className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-semibold ${stateColors[execution.state] ?? 'bg-slate-100 text-slate-800'}`}>
            {stateLabels[execution.state] ?? execution.state}
          </span>
        </div>

        {execution.pauseReason && (
          <div className="rounded-md border border-amber-300 bg-amber-50 px-3 py-2 text-xs text-amber-800">
            <p className="font-semibold">Paused:</p>
            <p>{execution.pauseReason}</p>
          </div>
        )}

        {execution.errorDetails && (
          <div className="rounded-md border border-red-300 bg-red-50 px-3 py-2 text-xs text-red-800">
            <p className="font-semibold">Error:</p>
            <p>{execution.errorDetails}</p>
          </div>
        )}

        {mappings.length > 0 && (
          <div>
            <button
              type="button"
              className="text-xs font-medium text-[var(--accent)] underline"
              onClick={() => setShowFields(!showFields)}
            >
              {showFields ? 'Hide' : 'Show'} detected fields ({mappings.length})
            </button>
            {showFields && (
              <div className="mt-2 space-y-2">
                {mappings.map((m) => (
                  <div key={m.fieldId} className="flex items-center justify-between p-2 rounded-md border border-[var(--border)] bg-[var(--surface)]">
                    <div>
                      <p className="text-sm font-medium text-[var(--text-primary)]">{m.fieldLabel}</p>
                      <p className="text-xs text-[var(--text-tertiary)]">
                        {m.value ? `Value: ${m.value}` : 'No value'}
                        {m.source && ` · Source: ${m.source}`}
                      </p>
                    </div>
                    <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-semibold ${
                      m.result === 'MAPPED' ? 'bg-emerald-100 text-emerald-800' :
                      m.result === 'NEEDS_CANDIDATE_INPUT' ? 'bg-amber-100 text-amber-800' :
                      m.result === 'UNSUPPORTED' ? 'bg-rose-100 text-rose-800' :
                      'bg-slate-100 text-slate-800'
                    }`}>
                      {m.result.replace(/_/g, ' ')}
                    </span>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {filled.length > 0 && (
          <div className="text-xs text-[var(--text-secondary)]">
            <p className="font-medium">Filled: {filled.length} fields</p>
          </div>
        )}

        {failed.length > 0 && (
          <div className="text-xs text-rose-700">
            <p className="font-medium">Failed: {failed.length} fields</p>
            {failed.map((f) => (
              <p key={f.fieldId}>{f.fieldLabel}: {f.error}</p>
            ))}
          </div>
        )}

        <div className="flex flex-wrap gap-2 pt-2">
          {execution.state === 'READY_FOR_REVIEW' && onReview && (
            <Button type="button" size="sm" onClick={() => onReview?.(true)}>
              Approve for filling
            </Button>
          )}
          {execution.state === 'APPROVED_FOR_EXECUTION' && onFill && (
            <Button type="button" size="sm" onClick={onFill}>
              Fill form
            </Button>
          )}
          {(execution.state === 'FILLING' || execution.state === 'INSPECTING') && onPause && (
            <Button type="button" variant="outline" size="sm" onClick={onPause}>
              <Pause className="h-3.5 w-3.5 mr-1" /> Pause
            </Button>
          )}
          {execution.state === 'PAUSED' && onResume && (
            <Button type="button" variant="outline" size="sm" onClick={onResume}>
              <Play className="h-3.5 w-3.5 mr-1" /> Resume
            </Button>
          )}
          {!['CANCELLED', 'FILLED', 'FAILED'].includes(execution.state) && onCancel && (
            <Button type="button" variant="outline" size="sm" onClick={onCancel}>
              <X className="h-3.5 w-3.5 mr-1" /> Cancel
            </Button>
          )}
        </div>

        {execution.state === 'FILLED' && (
          <p className="text-xs text-[var(--text-tertiary)] mt-2">
            Application form filled successfully. Review the form and complete the application manually.
          </p>
        )}
      </CardContent>
    </Card>
  )
}