/** Manual job source - allows users to manually add job postings. */

import { BaseJobSourceAdapter, NormalizedJob, JobSearchCriteria, JobSearchResult } from './JobSourceAdapter.js';

export class ManualJobSource extends BaseJobSourceAdapter {
  readonly sourceName = 'manual';
  readonly displayName = 'Manual Entry';
  readonly requiresAuth = false;

  /**
   * Manual source doesn't search - jobs are added manually.
   * Returns empty results for search.
   */
  async searchJobs(criteria: JobSearchCriteria): Promise<JobSearchResult> {
    return {
      jobs: [],
      total: 0,
      page: criteria.page ?? 1,
      pageSize: criteria.pageSize ?? 20,
      totalPages: 0,
    };
  }

  async getJob(sourceJobId: string): Promise<null> {
    // Manual source doesn't have source-specific IDs
    return null;
  }

  /**
   * Normalize a manually entered job to canonical format.
   * The input is expected to be a Partial<NormalizedJob> with user-provided data.
   */
  normalizeJob(rawJob: unknown): NormalizedJob {
    const job = rawJob as Partial<NormalizedJob> & { title?: string; companyName?: string };

    // Validate required fields
    if (!job.title?.trim()) {
      throw new Error('Job title is required');
    }
    if (!job.companyName?.trim()) {
      throw new Error('Company name is required');
    }

    const sourceJobId = crypto.randomUUID();
    return {
      title: job.title.trim(),
      companyName: job.companyName.trim(),
      companyWebsite: job.companyWebsite?.trim(),
      location: job.location?.trim(),
      city: job.city?.trim(),
      state: job.state?.trim(),
      country: job.country?.trim(),
      remoteType: job.remoteType ? this.normalizeRemoteType(job.remoteType) : 'unknown',
      employmentType: job.employmentType ? this.normalizeEmploymentType(job.employmentType) : 'unknown',
      experienceLevel: job.experienceLevel ? this.normalizeExperienceLevel(job.experienceLevel) : 'unknown',
      description: job.description?.trim(),
      responsibilities: job.responsibilities?.map((r) => r.trim()).filter(Boolean) ?? [],
      requirements: job.requirements?.map((r) => r.trim()).filter(Boolean) ?? [],
      requiredSkills: this.normalizeSkills(job.requiredSkills ?? []),
      preferredSkills: this.normalizeSkills(job.preferredSkills ?? []),
      salaryMin: job.salaryMin,
      salaryMax: job.salaryMax,
      salaryCurrency: job.salaryCurrency?.toUpperCase() ?? 'USD',
      salaryPeriod: job.salaryPeriod ? this.normalizeSalaryPeriod(job.salaryPeriod) : 'yearly',
      applicationUrl: job.applicationUrl?.trim(),
      sourceName: this.sourceName,
      sourceJobId,
      sourceUrl: undefined,
      sources: [{ name: this.sourceName, sourceJobId }],
      postedAt: job.postedAt ? new Date(job.postedAt) : new Date(),
      expiresAt: job.expiresAt ? new Date(job.expiresAt) : undefined,
    };
  }

  /**
   * Generate a deduplication key for a manually entered job.
   * Uses normalized company + title + location + application URL.
   */
  generateDeduplicationKey(normalizedJob: { companyName: string; title: string; location?: string; applicationUrl?: string }): string {
    const parts = [
      normalizedJob.companyName.toLowerCase().trim(),
      normalizedJob.title.toLowerCase().trim(),
      normalizedJob.location?.toLowerCase().trim() || '',
      normalizedJob.applicationUrl?.toLowerCase().trim() || '',
    ].filter(Boolean);
    return `manual:${parts.join('|')}`;
  }
}

// Export singleton instance
export const manualJobSource = new ManualJobSource();