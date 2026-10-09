import { Link, useParams } from 'react-router-dom'
import { PageHeader } from '@/components/PageHeader'
import { useJob } from '@/hooks/useResumes'

export function JobDetailPage() {
  const { id = '' } = useParams()
  const jobQuery = useJob(id)
  const job = jobQuery.data

  if (jobQuery.isPending) return <p className="text-sm text-slate-600">Loading job…</p>

  if (jobQuery.isError || !job) {
    return (
      <div>
        <PageHeader title="Job" description="Job detail." />
        <div role="alert" className="rounded-xl border border-red-300 bg-red-50 px-6 py-8 text-center">
          <h2 className="text-sm font-semibold text-red-900">Could not load job</h2>
          <p className="mx-auto mt-2 max-w-md text-sm text-red-700">
            {jobQuery.error instanceof Error ? jobQuery.error.message : 'Unknown error'}
          </p>
          <button
            type="button"
            onClick={() => jobQuery.refetch()}
            className="mt-4 rounded-md bg-slate-900 px-3 py-1.5 text-sm font-medium text-white"
          >
            Retry
          </button>
        </div>
      </div>
    )
  }

  return (
    <div>
      <PageHeader title={job.title} description={`${job.companyName}${job.location ? ` · ${job.location}` : ''}`} />
      <div className="rounded-xl border border-slate-200 bg-white px-4 py-3 text-sm">
        <dl className="grid grid-cols-1 gap-2 sm:grid-cols-2">
          <div>
            <dt className="text-slate-500">Work mode</dt>
            <dd className="text-slate-900">{job.remoteType ?? 'unknown'}</dd>
          </div>
          <div>
            <dt className="text-slate-500">Employment</dt>
            <dd className="text-slate-900">{job.employmentType ?? 'unknown'}</dd>
          </div>
          <div>
            <dt className="text-slate-500">Experience</dt>
            <dd className="text-slate-900">{job.experienceLevel ?? 'unknown'}</dd>
          </div>
          <div>
            <dt className="text-slate-500">Source</dt>
            <dd className="text-slate-900">{job.source ?? job.sources.map((s) => s.name).join(', ')}</dd>
          </div>
        </dl>
        {job.description && <p className="mt-3 text-slate-700">{job.description}</p>}
        {job.requiredSkills.length > 0 && (
          <p className="mt-2 text-slate-700">
            Required: {job.requiredSkills.map((s) => s.name).join(', ')}
          </p>
        )}
        {job.applicationUrl && (
          <p className="mt-2">
            <a href={job.applicationUrl} target="_blank" rel="noreferrer" className="text-brand-700 underline">
              Open application page
            </a>
          </p>
        )}
        <p className="mt-3">
          <Link to="/jobs" className="text-brand-700 underline">
            Back to jobs
          </Link>
        </p>
      </div>
    </div>
  )
}
