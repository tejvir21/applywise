/** Naukri Job Import Page.
 *
 * Candidate enters a job URL (e.g. Naukri posting). The backend validates
 * the URL, checks platform capabilities, and since Naukri scraping is not
 * authorized, the candidate manually supplies job details. The imported
 * job is then used to start the application workflow.
 */

import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { PageHeader } from '@/components/PageHeader'
import { Card, CardContent } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { importJobFromUrl } from '@/services/jobs'

export function JobImportPage() {
  const navigate = useNavigate()
  const [url, setUrl] = useState('')
  const [title, setTitle] = useState('')
  const [companyName, setCompanyName] = useState('')
  const [location, setLocation] = useState('')
  const [description, setDescription] = useState('')
  const [applicationUrl, setApplicationUrl] = useState('')
  const [remoteType, setRemoteType] = useState('')
  const [employmentType, setEmploymentType] = useState('')
  const [experienceLevel, setExperienceLevel] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [imported, setImported] = useState<{
    jobId: string
    platform: string
    scrapingAvailable: boolean
    capabilities: any
  } | null>(null)

  async function handleImport() {
    setError(null)
    setLoading(true)
    try {
      const result = await importJobFromUrl({
        url,
        title: title || undefined,
        companyName: companyName || undefined,
        location: location || undefined,
        description: description || undefined,
        applicationUrl: applicationUrl || undefined,
        remoteType: remoteType || undefined,
        employmentType: employmentType || undefined,
        experienceLevel: experienceLevel || undefined,
      })
      setImported({
        jobId: result.job.id,
        platform: result.job.platform ?? 'unknown',
        scrapingAvailable: result.job.scrapingAvailable,
        capabilities: result.job.capabilities,
      })
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to import job')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="mx-auto max-w-2xl space-y-6">
      <PageHeader
        title="Import Job"
        description="Enter a job URL (e.g. Naukri) to begin the application workflow."
        eyebrow="NAUKRI WORKFLOW"
      />

      {!imported && (
        <Card className="border-[var(--border)] shadow-[var(--shadow-sm)]">
          <CardContent>
            {error && (
              <div role="alert" className="mb-4 rounded-md border border-red-300 bg-red-50 px-4 py-3 text-sm text-red-800">
                {error}
              </div>
            )}
            <form onSubmit={(e) => { e.preventDefault(); handleImport() }} className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="job-url">Job URL</Label>
                <Input
                  id="job-url"
                  type="url"
                  placeholder="https://www.naukri.com/job-listings-..."
                  value={url}
                  onChange={(e) => setUrl(e.target.value)}
                  required
                />
                <p className="text-xs text-[var(--text-secondary)]">
                  Paste the job posting URL. Platform capabilities will be checked automatically.
                </p>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="job-title">Job Title</Label>
                  <Input
                    id="job-title"
                    placeholder="e.g. Software Engineer"
                    value={title}
                    onChange={(e) => setTitle(e.target.value)}
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="job-company">Company</Label>
                  <Input
                    id="job-company"
                    placeholder="e.g. Tech Corp"
                    value={companyName}
                    onChange={(e) => setCompanyName(e.target.value)}
                  />
                </div>
              </div>

              <div className="space-y-2">
                <Label htmlFor="job-location">Location</Label>
                <Input
                  id="job-location"
                  placeholder="e.g. Bengaluru, India"
                  value={location}
                  onChange={(e) => setLocation(e.target.value)}
                />
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="job-remote">Work Mode</Label>
                  <Input
                    id="job-remote"
                    placeholder="remote / hybrid / onsite"
                    value={remoteType}
                    onChange={(e) => setRemoteType(e.target.value)}
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="job-employment">Employment Type</Label>
                  <Input
                    id="job-employment"
                    placeholder="full_time / contract / internship"
                    value={employmentType}
                    onChange={(e) => setEmploymentType(e.target.value)}
                  />
                </div>
              </div>

              <div className="space-y-2">
                <Label htmlFor="job-experience">Experience Level</Label>
                <Input
                  id="job-experience"
                  placeholder="entry / mid / senior / lead"
                  value={experienceLevel}
                  onChange={(e) => setExperienceLevel(e.target.value)}
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="job-description">Description</Label>
                <Input
                  id="job-description"
                  type="textarea"
                  placeholder="Brief job description (optional)"
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="job-application-url">Application URL</Label>
                <Input
                  id="job-application-url"
                  type="url"
                  placeholder="Direct application link (defaults to job URL)"
                  value={applicationUrl}
                  onChange={(e) => setApplicationUrl(e.target.value)}
                />
              </div>

              <Button type="submit" disabled={loading || !url} className="w-full">
                {loading ? 'Importing…' : 'Import Job'}
              </Button>
            </form>
          </CardContent>
        </Card>
      )}

      {imported && (
        <Card className="border-[var(--border)] shadow-[var(--shadow-sm)] bg-green-50 border-green-100">
          <CardContent>
            <h3 className="text-sm font-semibold text-green-900">Job Imported</h3>
            <p className="text-sm text-green-800 mt-1">
              <strong>{imported.jobId}</strong> — {imported.platform}
            </p>
            {!imported.scrapingAvailable && (
              <p className="text-sm text-amber-800 mt-2">
                ⚠️ Platform scraping is not available for {imported.platform}. Job details were entered manually.
              </p>
            )}
            <div className="mt-4 space-y-2 text-xs text-[var(--text-secondary)]">
              <div className="flex justify-between">
                <span>Detail:</span> <span>{imported.capabilities.detail}</span>
              </div>
              <div className="flex justify-between">
                <span>Submission:</span> <span>{imported.capabilities.submission}</span>
              </div>
              <div className="flex justify-between">
                <span>Upload:</span> <span>{imported.capabilities.upload}</span>
              </div>
              <div className="flex justify-between">
                <span>Handoff:</span> <span>{imported.capabilities.handoff}</span>
              </div>
            </div>
            <div className="mt-6 flex gap-3">
              <Button
                onClick={() => navigate(`/naukri/workflow/${imported.jobId}`)}
                className="flex-1 bg-green-900 text-white"
              >
                Start Application
              </Button>
              <Button variant="outline" onClick={() => navigate('/jobs')}>
                View All Jobs
              </Button>
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  )
}

// Fallback Label component if not exported from ui/button
const Label = ({ htmlFor, children }: { htmlFor: string; children: React.ReactNode }) => (
  <label htmlFor={htmlFor} className="text-sm font-medium text-[var(--text-secondary)] block mb-1">
    {children}
  </label>
)
