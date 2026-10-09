/** Job source adapter interface and base types. */

// import { IJob, IJobSource, ISkillRequirement } from "../models/Job.js";
// export { IJobSource };

/**
 * Normalized job data structure for ingestion.
 * This is the canonical format used internally after normalization.
 */
export interface NormalizedJob {
  title: string;
  companyName: string;
  companyWebsite?: string;
  location?: string;
  city?: string;
  state?: string;
  country?: string;
  remoteType: "remote" | "hybrid" | "onsite" | "flexible" | "unknown";
  employmentType:
    | "full_time"
    | "part_time"
    | "contract"
    | "internship"
    | "freelance"
    | "unknown";
  experienceLevel:
    | "internship"
    | "entry"
    | "junior"
    | "mid"
    | "senior"
    | "lead"
    | "unknown";
  description?: string;
  responsibilities?: string[];
  requirements?: string[];
  requiredSkills: Array<{
    name: string;
    required: boolean;
    confidence?: string;
    source?: string;
  }>;
  preferredSkills: Array<{
    name: string;
    required: boolean;
    confidence?: string;
    source?: string;
  }>;
  salaryMin?: number;
  salaryMax?: number;
  salaryCurrency: string;
  salaryPeriod: "hourly" | "monthly" | "yearly";
  applicationUrl?: string;
  sourceName: string;
  sourceJobId: string;
  sourceUrl?: string;
  /** Pre-built source entries (e.g. manual entries); services fall back to sourceName/sourceJobId. */
  sources?: Array<{
    name: string;
    sourceJobId?: string;
    sourceUrl?: string;
    discoveredAt?: Date;
  }>;
  postedAt?: Date;
  expiresAt?: Date;
}

/**
 * Search criteria for job search.
 */
export interface JobSearchCriteria {
  query?: string;
  company?: string;
  location?: string;
  remoteType?: "remote" | "hybrid" | "onsite" | "flexible";
  employmentType?:
    | "full_time"
    | "part_time"
    | "contract"
    | "internship"
    | "freelance";
  experienceLevel?:
    | "internship"
    | "entry"
    | "junior"
    | "mid"
    | "senior"
    | "lead";
  salaryMin?: number;
  salaryMax?: number;
  salaryCurrency?: string;
  salaryPeriod?: "hourly" | "monthly" | "yearly";
  skills?: string[];
  source?: string;
  postedAfter?: Date;
  postedBefore?: Date;
  page?: number;
  pageSize?: number;
  sortBy?: "relevance" | "postedAt" | "discoveredAt" | "salary";
  sortOrder?: "asc" | "desc";
}

/**
 * Search result with pagination.
 */
export interface JobSearchResult {
  jobs: NormalizedJob[];
  total: number;
  page: number;
  pageSize: number;
  totalPages: number;
}

/**
 * Job source adapter interface.
 * Implement this interface to add new job sources.
 */
export interface JobSourceAdapter {
  /** Unique identifier for this source (e.g., 'manual', 'mock', 'linkedin', 'indeed') */
  readonly sourceName: string;

  /** Human-readable name for display purposes */
  readonly displayName: string;

  /** Whether this source requires authentication */
  readonly requiresAuth: boolean;

  /** Validate the source configuration */
  validateConfiguration(): Promise<boolean>;

  /** Search for jobs matching the criteria */
  searchJobs(criteria: JobSearchCriteria): Promise<JobSearchResult>;

  /** Get a single job by its source-specific ID */
  getJob(sourceJobId: string): Promise<NormalizedJob | null>;

  /** Normalize raw job data from this source to canonical format */
  normalizeJob(rawJob: unknown): NormalizedJob;

  /** Check if a job already exists in our system */
  checkDuplicate(normalizedJob: NormalizedJob): Promise<boolean>;

  /** Generate a deduplication key for this job */
  generateDeduplicationKey(normalizedJob: NormalizedJob): string;
}

/**
 * Base class for job source adapters with common functionality.
 */
export abstract class BaseJobSourceAdapter implements JobSourceAdapter {
  abstract readonly sourceName: string;
  abstract readonly displayName: string;
  abstract readonly requiresAuth: boolean;

  abstract searchJobs(criteria: JobSearchCriteria): Promise<JobSearchResult>;
  abstract getJob(sourceJobId: string): Promise<NormalizedJob | null>;
  abstract normalizeJob(rawJob: unknown): NormalizedJob;

  async validateConfiguration(): Promise<boolean> {
    return true;
  }

  async checkDuplicate(normalizedJob: NormalizedJob): Promise<boolean> {
    const key = this.generateDeduplicationKey(normalizedJob);
    // This will be implemented by the JobService using the JobRepository
    return false;
  }

  generateDeduplicationKey(normalizedJob: NormalizedJob): string {
    if (normalizedJob.sourceJobId && normalizedJob.sourceName) {
      return `${normalizedJob.sourceName}:${normalizedJob.sourceJobId}`;
    }
    // Fallback to normalized comparison for manual entries
    const parts = [
      normalizedJob.companyName.toLowerCase().trim(),
      normalizedJob.title.toLowerCase().trim(),
      normalizedJob.location?.toLowerCase().trim() || "",
      normalizedJob.applicationUrl?.toLowerCase().trim() || "",
    ].filter(Boolean);
    return parts.join("|");
  }

  protected normalizeRemoteType(
    value: string,
  ): "remote" | "hybrid" | "onsite" | "flexible" | "unknown" {
    const normalized = value.toLowerCase().trim();
    if (["remote", "hybrid", "onsite", "flexible"].includes(normalized)) {
      return normalized as "remote" | "hybrid" | "onsite" | "flexible";
    }
    return "unknown";
  }

  protected normalizeEmploymentType(
    value: string,
  ):
    | "full_time"
    | "part_time"
    | "contract"
    | "internship"
    | "freelance"
    | "unknown" {
    const normalized = value.toLowerCase().trim();
    if (
      [
        "full_time",
        "part_time",
        "contract",
        "internship",
        "freelance",
      ].includes(normalized)
    ) {
      return normalized as
        | "full_time"
        | "part_time"
        | "contract"
        | "internship"
        | "freelance";
    }
    return "unknown";
  }

  protected normalizeExperienceLevel(
    value: string,
  ): "internship" | "entry" | "junior" | "mid" | "senior" | "lead" | "unknown" {
    const normalized = value.toLowerCase().trim();
    if (
      ["internship", "entry", "junior", "mid", "senior", "lead"].includes(
        normalized,
      )
    ) {
      return normalized as
        | "internship"
        | "entry"
        | "junior"
        | "mid"
        | "senior"
        | "lead";
    }
    return "unknown";
  }

  protected normalizeSalaryPeriod(
    value: string,
  ): "hourly" | "monthly" | "yearly" {
    const normalized = value.toLowerCase().trim();
    if (["hourly", "monthly", "yearly"].includes(normalized)) {
      return normalized as "hourly" | "monthly" | "yearly";
    }
    return "yearly";
  }

  protected normalizeSkills(skills: unknown[]): Array<{
    name: string;
    required: boolean;
    confidence: string;
    source: string;
  }> {
    if (!Array.isArray(skills)) return [];
    return skills
      .map((s) => {
        if (typeof s === "string") {
          return {
            name: s.trim(),
            required: false,
            confidence: "medium",
            source: "extracted",
          };
        }
        if (typeof s === "object" && s !== null && "name" in s) {
          return {
            name: String((s as Record<string, unknown>).name ?? "").trim(),
            required: Boolean((s as Record<string, unknown>).required),
            confidence: ((s as Record<string, unknown>).confidence ??
              "medium") as string,
            source: String(
              (s as Record<string, unknown>).source ?? "extracted",
            ),
          };
        }
        return null;
      })
      .filter(
        (
          s,
        ): s is {
          name: string;
          required: boolean;
          confidence: string;
          source: string;
        } => s !== null && s.name.length > 0,
      );
  }
}

/**
 * Adapter registry for managing multiple job sources.
 */
export class JobSourceRegistry {
  private adapters = new Map<string, JobSourceAdapter>();

  register(adapter: JobSourceAdapter): void {
    this.adapters.set(adapter.sourceName, adapter);
  }

  get(sourceName: string): JobSourceAdapter | undefined {
    return this.adapters.get(sourceName);
  }

  getAll(): JobSourceAdapter[] {
    return Array.from(this.adapters.values());
  }

  getEnabled(): JobSourceAdapter[] {
    return this.getAll().filter((a) => !a.requiresAuth || true); // In future, check auth status
  }

  async searchAll(criteria: JobSearchCriteria): Promise<NormalizedJob[]> {
    const enabledAdapters = this.getEnabled();
    const results = await Promise.all(
      enabledAdapters.map((adapter) => adapter.searchJobs(criteria)),
    );
    return results.flatMap((r) => r.jobs);
  }
}

// Global registry instance
export const jobSourceRegistry = new JobSourceRegistry();
