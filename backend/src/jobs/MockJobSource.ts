/** Mock job source - provides deterministic fictional job data for development and testing. */

import { BaseJobSourceAdapter, NormalizedJob, JobSearchCriteria, JobSearchResult } from './JobSourceAdapter.js';

/** Deterministic mock job fixtures */
const MOCK_JOBS: NormalizedJob[] = [
  {
    title: 'Senior Software Engineer',
    companyName: 'TechCorp Inc.',
    companyWebsite: 'https://techcorp.example.com',
    location: 'San Francisco, CA',
    city: 'San Francisco',
    state: 'CA',
    country: 'USA',
    remoteType: 'hybrid',
    employmentType: 'full_time',
    experienceLevel: 'senior',
    description: 'We are looking for a Senior Software Engineer to join our growing team. You will be responsible for designing and implementing scalable backend services.',
    responsibilities: [
      'Design and implement scalable backend APIs',
      'Mentor junior engineers',
      'Participate in code reviews',
      'Collaborate with product and design teams',
    ],
    requirements: [
      '5+ years of experience with Node.js or Python',
      'Experience with cloud platforms (AWS/GCP)',
      'Strong understanding of distributed systems',
      'Excellent communication skills',
    ],
    requiredSkills: [
      { name: 'TypeScript', required: true, confidence: 'high', source: 'extracted' },
      { name: 'Node.js', required: true, confidence: 'high', source: 'extracted' },
      { name: 'PostgreSQL', required: true, confidence: 'high', source: 'extracted' },
      { name: 'AWS', required: true, confidence: 'high', source: 'extracted' },
      { name: 'Docker', required: false, confidence: 'medium', source: 'extracted' },
    ],
    preferredSkills: [
      { name: 'GraphQL', required: false, confidence: 'medium', source: 'extracted' },
      { name: 'Kubernetes', required: false, confidence: 'medium', source: 'extracted' },
      { name: 'React', required: false, confidence: 'low', source: 'extracted' },
    ],
    salaryMin: 150000,
    salaryMax: 200000,
    salaryCurrency: 'USD',
    salaryPeriod: 'yearly',
    applicationUrl: 'https://techcorp.example.com/careers/senior-software-engineer',
    sourceName: 'mock',
    sourceJobId: 'mock-001',
    sourceUrl: 'https://mock.example.com/jobs/mock-001',
    postedAt: new Date('2024-01-15'),
    expiresAt: new Date('2024-07-15'),
  },
  {
    title: 'Frontend Engineer',
    companyName: 'DesignHub Co.',
    companyWebsite: 'https://designhub.example.com',
    location: 'Remote (US)',
    city: undefined,
    state: undefined,
    country: 'USA',
    remoteType: 'remote',
    employmentType: 'full_time',
    experienceLevel: 'mid',
    description: 'Join our design-focused team building beautiful, accessible user interfaces.',
    responsibilities: [
      'Build responsive React components',
      'Implement design systems',
      'Ensure WCAG accessibility compliance',
      'Collaborate with designers and backend engineers',
    ],
    requirements: [
      '3+ years of React experience',
      'Strong CSS/TypeScript skills',
      'Experience with design systems',
      'Accessibility best practices',
    ],
    requiredSkills: [
      { name: 'React', required: true, confidence: 'high', source: 'extracted' },
      { name: 'TypeScript', required: true, confidence: 'high', source: 'extracted' },
      { name: 'CSS/SCSS', required: true, confidence: 'high', source: 'extracted' },
      { name: 'Jest/Testing Library', required: true, confidence: 'medium', source: 'extracted' },
      { name: 'Storybook', required: false, confidence: 'medium', source: 'extracted' },
    ],
    preferredSkills: [
      { name: 'Next.js', required: false, confidence: 'medium', source: 'extracted' },
      { name: 'GraphQL', required: false, confidence: 'low', source: 'extracted' },
    ],
    salaryMin: 120000,
    salaryMax: 160000,
    salaryCurrency: 'USD',
    salaryPeriod: 'yearly',
    applicationUrl: 'https://designhub.example.com/careers/frontend-engineer',
    sourceName: 'mock',
    sourceJobId: 'mock-002',
    sourceUrl: 'https://mock.example.com/jobs/mock-002',
    postedAt: new Date('2024-01-20'),
    expiresAt: new Date('2024-07-20'),
  },
  {
    title: 'DevOps Engineer',
    companyName: 'CloudScale Systems',
    companyWebsite: 'https://cloudscale.example.com',
    location: 'Austin, TX',
    city: 'Austin',
    state: 'TX',
    country: 'USA',
    remoteType: 'hybrid',
    employmentType: 'full_time',
    experienceLevel: 'mid',
    description: 'Help us build and maintain our cloud infrastructure at scale.',
    responsibilities: [
      'Manage Kubernetes clusters',
      'Implement CI/CD pipelines',
      'Monitor system health and performance',
      'Automate infrastructure provisioning',
    ],
    requirements: [
      '3+ years of AWS/GCP experience',
      'Kubernetes and Terraform expertise',
      'Strong scripting skills (Python/Bash)',
      'Monitoring and observability tools',
    ],
    requiredSkills: [
      { name: 'AWS', required: true, confidence: 'high', source: 'extracted' },
      { name: 'Kubernetes', required: true, confidence: 'high', source: 'extracted' },
      { name: 'Terraform', required: true, confidence: 'high', source: 'extracted' },
      { name: 'Python', required: true, confidence: 'high', source: 'extracted' },
      { name: 'Prometheus/Grafana', required: true, confidence: 'high', source: 'extracted' },
    ],
    preferredSkills: [
      { name: 'Helm', required: false, confidence: 'medium', source: 'extracted' },
      { name: 'ArgoCD', required: false, confidence: 'medium', source: 'extracted' },
    ],
    salaryMin: 130000,
    salaryMax: 170000,
    salaryCurrency: 'USD',
    salaryPeriod: 'yearly',
    applicationUrl: 'https://cloudscale.example.com/careers/devops-engineer',
    sourceName: 'mock',
    sourceJobId: 'mock-003',
    sourceUrl: 'https://mock.example.com/jobs/mock-003',
    postedAt: new Date('2024-01-25'),
    expiresAt: new Date('2024-07-25'),
  },
  {
    title: 'Data Scientist',
    companyName: 'DataDriven Analytics',
    companyWebsite: 'https://datadriven.example.com',
    location: 'New York, NY',
    city: 'New York',
    state: 'NY',
    country: 'USA',
    remoteType: 'onsite',
    employmentType: 'full_time',
    experienceLevel: 'senior',
    description: 'Apply machine learning to solve complex business problems.',
    responsibilities: [
      'Build and deploy ML models',
      'Analyze large datasets',
      'Collaborate with product teams',
      'Present findings to stakeholders',
    ],
    requirements: [
      'Advanced degree in CS/Statistics/Math',
      '5+ years of ML experience',
      'Production ML deployment experience',
      'Strong Python/SQL skills',
    ],
    requiredSkills: [
      { name: 'Python', required: true, confidence: 'high', source: 'extracted' },
      { name: 'TensorFlow/PyTorch', required: true, confidence: 'high', source: 'extracted' },
      { name: 'SQL', required: true, confidence: 'high', source: 'extracted' },
      { name: 'MLOps', required: true, confidence: 'high', source: 'extracted' },
    ],
    preferredSkills: [
      { name: 'Spark', required: false, confidence: 'medium', source: 'extracted' },
      { name: 'Airflow', required: false, confidence: 'medium', source: 'extracted' },
    ],
    salaryMin: 160000,
    salaryMax: 220000,
    salaryCurrency: 'USD',
    salaryPeriod: 'yearly',
    applicationUrl: 'https://datadriven.example.com/careers/data-scientist',
    sourceName: 'mock',
    sourceJobId: 'mock-004',
    sourceUrl: 'https://mock.example.com/jobs/mock-004',
    postedAt: new Date('2024-02-01'),
    expiresAt: new Date('2024-08-01'),
  },
  {
    title: 'Backend Developer (Contract)',
    companyName: 'StartupXYZ',
    companyWebsite: 'https://startupxyz.example.com',
    location: 'Remote (US/Canada)',
    city: undefined,
    state: undefined,
    country: 'USA',
    remoteType: 'remote',
    employmentType: 'contract',
    experienceLevel: 'mid',
    description: 'Short-term contract to build API services for our MVP.',
    responsibilities: [
      'Build RESTful APIs',
      'Write unit and integration tests',
      'Deploy to cloud infrastructure',
    ],
    requirements: [
      '2+ years of Go or Python',
      'REST API design experience',
      'Docker and CI/CD familiarity',
    ],
    requiredSkills: [
      { name: 'Go', required: true, confidence: 'high', source: 'extracted' },
      { name: 'PostgreSQL', required: true, confidence: 'high', source: 'extracted' },
      { name: 'Docker', required: true, confidence: 'high', source: 'extracted' },
    ],
    preferredSkills: [
      { name: 'gRPC', required: false, confidence: 'medium', source: 'extracted' },
      { name: 'GraphQL', required: false, confidence: 'low', source: 'extracted' },
    ],
    salaryMin: 80,
    salaryMax: 120,
    salaryCurrency: 'USD',
    salaryPeriod: 'hourly',
    applicationUrl: 'https://startupxyz.example.com/careers/backend-contractor',
    sourceName: 'mock',
    sourceJobId: 'mock-005',
    sourceUrl: 'https://mock.example.com/jobs/mock-005',
    postedAt: new Date('2024-02-10'),
    expiresAt: new Date('2024-05-10'),
  },
];

export class MockJobSource extends BaseJobSourceAdapter {
  readonly sourceName = 'mock';
  readonly displayName = 'Mock Data (Development)';
  readonly requiresAuth = false;

  async searchJobs(criteria: JobSearchCriteria): Promise<JobSearchResult> {
    let jobs = [...MOCK_JOBS];

    // Filter by query (searches title, company, description)
    if (criteria.query) {
      const q = criteria.query.toLowerCase();
      jobs = jobs.filter(
        (j) =>
          j.title.toLowerCase().includes(q) ||
          j.companyName.toLowerCase().includes(q) ||
          j.description?.toLowerCase().includes(q) ||
          j.requirements?.some((r) => r.toLowerCase().includes(criteria.query!.toLowerCase()))
      );
    }

    // Filter by company
    if (criteria.company) {
      const c = criteria.company.toLowerCase();
      jobs = jobs.filter((j) => j.companyName.toLowerCase().includes(c));
    }

    // Filter by location
    if (criteria.location) {
      const loc = criteria.location.toLowerCase();
      jobs = jobs.filter(
        (j) =>
          j.location?.toLowerCase().includes(criteria.location!.toLowerCase()) ||
          j.city?.toLowerCase().includes(criteria.location!.toLowerCase()) ||
          j.state?.toLowerCase().includes(criteria.location!.toLowerCase()) ||
          j.country?.toLowerCase().includes(criteria.location!.toLowerCase())
      );
    }

    // Filter by remote type
    if (criteria.remoteType) {
      jobs = jobs.filter((j) => j.remoteType === criteria.remoteType);
    }

    // Filter by employment type
    if (criteria.employmentType) {
      jobs = jobs.filter((j) => j.employmentType === criteria.employmentType);
    }

    // Filter by experience level
    if (criteria.experienceLevel) {
      jobs = jobs.filter((j) => j.experienceLevel === criteria.experienceLevel);
    }

    // Filter by salary
    if (criteria.salaryMin != null) {
      jobs = jobs.filter((j) => (j.salaryMax ?? j.salaryMin ?? 0) >= criteria.salaryMin!);
    }
    if (criteria.salaryMax != null) {
      jobs = jobs.filter((j) => (j.salaryMin ?? j.salaryMax ?? Infinity) <= criteria.salaryMax!);
    }

    // Filter by skills
    if (criteria.skills && criteria.skills.length > 0) {
      const skills = criteria.skills.map((s) => s.toLowerCase());
      jobs = jobs.filter((j) =>
        j.requiredSkills.some((s) => skills.includes(s.name.toLowerCase())) ||
        j.preferredSkills.some((s) => skills.includes(s.name.toLowerCase()))
      );
    }

    // Filter by source
    if (criteria.source) {
      jobs = jobs.filter((j) => j.sourceName === criteria.source);
    }

    // Filter by posted date
    if (criteria.postedAfter) {
      jobs = jobs.filter((j) => j.postedAt && j.postedAt >= criteria.postedAfter!);
    }
    if (criteria.postedBefore) {
      jobs = jobs.filter((j) => j.postedAt && j.postedAt <= criteria.postedBefore!);
    }

    // Sort
    const sortBy = criteria.sortBy ?? 'discoveredAt';
    const sortOrder = criteria.sortOrder ?? 'desc';
    jobs.sort((a, b) => {
      switch (criteria.sortBy) {
        case 'postedAt':
          if (a.postedAt instanceof Date && b.postedAt instanceof Date) {
            return criteria.sortOrder === 'asc'
              ? a.postedAt.getTime() - b.postedAt.getTime()
              : b.postedAt.getTime() - a.postedAt.getTime();
          }
          return 0;
        case 'salary': {
          const aSalary = a.salaryMax ?? a.salaryMin ?? 0;
          const bSalary = b.salaryMax ?? b.salaryMin ?? 0;
          return criteria.sortOrder === 'asc' ? aSalary - bSalary : bSalary - aSalary;
        }
        case 'relevance':
        case 'discoveredAt':
        default:
          return 0;
      }
    });

    // Pagination
    const page = criteria.page ?? 1;
    const pageSize = criteria.pageSize ?? 20;
    const total = jobs.length;
    const totalPages = Math.ceil(total / pageSize);
    const start = (page - 1) * pageSize;
    const paginatedJobs = jobs.slice(start, start + pageSize);

    return {
      jobs: paginatedJobs,
      total,
      page,
      pageSize,
      totalPages,
    };
  }

  async getJob(sourceJobId: string): Promise<NormalizedJob | null> {
    const job = MOCK_JOBS.find((j) => j.sourceJobId === sourceJobId);
    return job ?? null;
  }

  /**
   * Normalize a raw mock-source job to canonical format.
   * Mock fixtures are already near-canonical; this validates the required
   * fields, trims strings, and normalizes enums/skills so the output is a
   * valid NormalizedJob. Throws on missing identity fields.
   */
  normalizeJob(rawJob: unknown): NormalizedJob {
    const job = rawJob as Partial<NormalizedJob>;

    if (!job.title?.trim()) {
      throw new Error('Job title is required');
    }
    if (!job.companyName?.trim()) {
      throw new Error('Company name is required');
    }
    if (!job.sourceName?.trim()) {
      throw new Error('Source name is required');
    }
    if (!job.sourceJobId?.trim()) {
      throw new Error('Source job ID is required');
    }

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
      sourceName: job.sourceName.trim(),
      sourceJobId: job.sourceJobId.trim(),
      sourceUrl: job.sourceUrl?.trim(),
      postedAt: job.postedAt ? new Date(job.postedAt) : new Date(),
      expiresAt: job.expiresAt ? new Date(job.expiresAt) : undefined,
    };
  }

  async validateConfiguration(): Promise<boolean> {
    return true;
  }

  generateDeduplicationKey(normalizedJob: NormalizedJob): string {
    // Use the base class implementation which uses sourceName:sourceJobId
    return `${normalizedJob.sourceName}:${normalizedJob.sourceJobId}`;
  }
}

// Export singleton instance
export const mockJobSource = new MockJobSource();