import { useState } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import { EmptyState } from '@/components/EmptyState'
import { PageHeader } from '@/components/PageHeader'
import { useResumes } from '@/hooks/useResumes'
import { analyzeResume, deleteResume, setDefaultResume, uploadResume } from '@/services/resumes'

export function ResumePage() {
  const queryClient = useQueryClient()
  const resumesQuery = useResumes()
  const [file, setFile] = useState<File | null>(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [notice, setNotice] = useState<string | null>(null)

  async function refresh() {
    await queryClient.invalidateQueries({ queryKey: ['resumes'] })
  }

  async function onUpload(event: React.FormEvent) {
    event.preventDefault()
    if (!file) {
      setError('Choose a PDF or DOCX file first.')
      return
    }
    setError(null)
    setNotice(null)
    setBusy(true)
    try {
      const result = await uploadResume(file)
      setFile(null)
      setNotice(`Uploaded ${result.resume.originalFilename}. Analysis queued.`)
      await refresh()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Upload failed')
    } finally {
      setBusy(false)
    }
  }

  async function run(label: string, fn: () => Promise<unknown>) {
    setError(null)
    setNotice(null)
    setBusy(true)
    try {
      await fn()
      setNotice(`${label} done.`)
      await refresh()
    } catch (err) {
      setError(err instanceof Error ? err.message : `${label} failed`)
    } finally {
      setBusy(false)
    }
  }

  const resumes = resumesQuery.data ?? []

  return (
    <div>
      <PageHeader
        title="Resumes"
        description="Upload PDF or DOCX files (up to 10 MB). Files are private to your account and parsed locally into structured data."
      />

      <form onSubmit={(e) => void onUpload(e)} className="mb-4 flex flex-wrap items-center gap-2">
        <input
          aria-label="Resume file"
          type="file"
          accept=".pdf,.docx,application/pdf,application/vnd.openxmlformats-officedocument.wordprocessingml.document"
          onChange={(e) => setFile(e.target.files?.[0] ?? null)}
          className="text-sm"
        />
        <button
          type="submit"
          disabled={busy || !file}
          className="rounded-md bg-slate-900 px-3 py-1.5 text-sm font-medium text-white disabled:opacity-50"
        >
          {busy ? 'Uploading…' : 'Upload resume'}
        </button>
      </form>

      {error && (
        <p role="alert" className="mb-3 rounded-md border border-red-300 bg-red-50 px-3 py-2 text-sm text-red-800">
          {error}
        </p>
      )}
      {notice && (
        <p role="status" className="mb-3 rounded-md border border-emerald-300 bg-emerald-50 px-3 py-2 text-sm text-emerald-800">
          {notice}
        </p>
      )}

      {resumesQuery.isPending && <p className="text-sm text-slate-600">Loading resumes…</p>}
      {resumesQuery.isError && (
        <div role="alert" className="rounded-xl border border-red-300 bg-red-50 px-6 py-8 text-center">
          <h2 className="text-sm font-semibold text-red-900">Could not load resumes</h2>
          <button
            type="button"
            onClick={() => resumesQuery.refetch()}
            className="mt-4 rounded-md bg-slate-900 px-3 py-1.5 text-sm font-medium text-white"
          >
            Retry
          </button>
        </div>
      )}

      {!resumesQuery.isPending && !resumesQuery.isError && resumes.length === 0 && (
        <EmptyState title="No resumes uploaded" description="Upload a PDF or DOCX resume to get started." />
      )}

      {resumes.length > 0 && (
        <ul className="space-y-3">
          {resumes.map((resume) => (
            <li key={resume.id} className="rounded-xl border border-slate-200 bg-white px-4 py-3">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div>
                  <p className="font-medium text-slate-900">{resume.originalFilename}</p>
                  <p className="text-sm text-slate-600">
                    {(resume.fileSize / 1024).toFixed(1)} KB · {resume.status}
                    {resume.isDefault ? ' · default' : ''}
                  </p>
                </div>
                <div className="flex flex-wrap gap-2">
                  {!resume.isDefault && (
                    <button
                      type="button"
                      disabled={busy}
                      onClick={() => void run('Default set', () => setDefaultResume(resume.id))}
                      className="rounded-md border border-slate-300 px-2.5 py-1 text-xs font-medium text-slate-700 disabled:opacity-50"
                    >
                      Set default
                    </button>
                  )}
                  <button
                    type="button"
                    disabled={busy}
                    onClick={() => void run('Analysis started', () => analyzeResume(resume.id))}
                    className="rounded-md border border-slate-300 px-2.5 py-1 text-xs font-medium text-slate-700 disabled:opacity-50"
                  >
                    Analyze
                  </button>
                  <button
                    type="button"
                    disabled={busy}
                    onClick={() => void run('Deletion', () => deleteResume(resume.id))}
                    className="rounded-md border border-red-300 px-2.5 py-1 text-xs font-medium text-red-700 disabled:opacity-50"
                  >
                    Delete
                  </button>
                </div>
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}
