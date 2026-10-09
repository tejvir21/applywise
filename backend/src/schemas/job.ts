/** Job Zod validation schemas. */

import { z } from 'zod';

// Remote type
const remoteTypeSchema = z.enum(['remote', 'hybrid', 'onsite', 'flexible', 'unknown']);

// Employment type
const employmentTypeSchema = z.enum(['full_time', 'part_time', 'contract', 'internship', 'freelance', 'unknown']);

// Experience level
const experienceLevelSchema = z.enum(['internship', 'entry', 'junior', 'mid', 'senior', 'lead', 'unknown']);

// Salary period
const salaryPeriodSchema = z.enum(['hourly', 'monthly', 'yearly']);

// Job status
const jobStatusSchema = z.enum(['active', 'expired', 'closed', 'draft']);

// Skill requirement schema
export const skillRequirementSchema = z.object({
  name: z.string().min(1).max(100),
  required: z.boolean().default(false),
  confidence: z.enum(['high', 'medium', 'low']).optional(),
  source: z.string().max(50).optional(),
});

// Job source schema
export const jobSourceSchema = z.object({
  name: z.string().min(1).max(50),
  sourceJobId: z.string().max(100).optional(),
  sourceUrl: z.string().url().optional(),
  discoveredAt: z.string().datetime().optional(),
});

// Manual job creation schema
export const createManualJobSchema = z.object({
  body: z.object({
    title: z.string().min(1).max(200),
    companyName: z.string().min(1).max(200),
    companyWebsite: z.string().url().optional(),
    location: z.string().max(200).optional(),
    city: z.string().max(100).optional(),
    state: z.string().max(100).optional(),
    country: z.string().max(100).optional(),
    remoteType: z.enum(['remote', 'hybrid', 'onsite', 'flexible', 'unknown']).optional(),
    employmentType: z.enum(['full_time', 'part_time', 'contract', 'internship', 'freelance', 'unknown']).optional(),
    experienceLevel: z.enum(['internship', 'entry', 'junior', 'mid', 'senior', 'lead', 'unknown']).optional(),
    description: z.string().max(50000).optional(),
    responsibilities: z.array(z.string().max(500)).optional(),
    requirements: z.array(z.string().max(500)).optional(),
    requiredSkills: z.array(z.object({
      name: z.string().min(1).max(100),
      required: z.boolean().default(false),
      confidence: z.enum(['high', 'medium', 'low']).optional(),
      source: z.string().max(50).optional()
    })).optional(),
    preferredSkills: z.array(z.object({
      name: z.string().min(1).max(100),
      required: z.boolean().default(false),
      confidence: z.enum(['high', 'medium', 'low']).optional(),
      source: z.string().max(50).optional()
    })).optional(),
    salaryMin: z.number().int().min(0).optional(),
    salaryMax: z.number().int().min(0).optional(),
    salaryCurrency: z.string().length(3).optional(),
    salaryPeriod: z.enum(['hourly', 'monthly', 'yearly']).optional(),
    applicationUrl: z.string().url().optional(),
    postedAt: z.string().datetime().optional(),
    expiresAt: z.string().datetime().optional(),
  }).strict(),
});

// Update job schema (all fields optional)
export const updateJobSchema = z.object({
  body: z.object({
    title: z.string().min(1).max(200).optional(),
    companyName: z.string().min(1).max(200).optional(),
    companyWebsite: z.string().url().optional(),
    location: z.string().max(200).optional(),
    city: z.string().max(100).optional(),
    state: z.string().max(100).optional(),
    country: z.string().max(100).optional(),
    remoteType: z.enum(['remote', 'hybrid', 'onsite', 'flexible', 'unknown']).optional(),
    employmentType: z.enum(['full_time', 'part_time', 'contract', 'internship', 'freelance', 'unknown']).optional(),
    experienceLevel: z.enum(['internship', 'entry', 'junior', 'mid', 'senior', 'lead', 'unknown']).optional(),
    description: z.string().max(50000).optional(),
    responsibilities: z.array(z.string().max(500)).optional(),
    requirements: z.array(z.string().max(500)).optional(),
    requiredSkills: z.array(z.object({
      name: z.string().min(1).max(100),
      required: z.boolean().default(false),
      confidence: z.enum(['high', 'medium', 'low']).optional(),
      source: z.string().max(50).optional(),
    })).optional(),
    preferredSkills: z.array(z.object({
      name: z.string().min(1).max(100),
      required: z.boolean().default(false),
      confidence: z.enum(['high', 'medium', 'low']).optional(),
      source: z.string().max(50).optional(),
    })).optional(),
    salaryMin: z.number().int().min(0).optional(),
    salaryMax: z.number().int().min(0).optional(),
    salaryCurrency: z.string().length(3).optional(),
    salaryPeriod: z.enum(['hourly', 'monthly', 'yearly']).optional(),
    applicationUrl: z.string().url().optional(),
    status: z.enum(['active', 'expired', 'closed', 'draft']).optional(),
    postedAt: z.string().datetime().optional(),
    expiresAt: z.string().datetime().optional(),
  }).strict(),
});

// Job ID param schema
export const jobIdParamSchema = z.object({
  params: z.object({
    id: z.string().min(1),
  }),
});

// Saved job schema
export const saveJobSchema = z.object({
  body: z.object({
    notes: z.string().max(1000).optional(),
  }),
});

// Import mock jobs schema
export const importMockJobsSchema = z.object({
  body: z.object({
    count: z.number().int().min(1).max(50).default(10),
  }),
});

// Import from source schema
export const importFromSourceSchema = z.object({
  body: z.object({
    source: z.enum(['mock']),
    query: z.string().optional(),
    company: z.string().optional(),
    location: z.string().optional(),
    remoteType: z.enum(['remote', 'hybrid', 'onsite', 'flexible']).optional(),
    employmentType: z.enum(['full_time', 'part_time', 'contract', 'internship', 'freelance']).optional(),
    experienceLevel: z.enum(['internship', 'entry', 'junior', 'mid', 'senior', 'lead']).optional(),
    salaryMin: z.number().int().min(0).optional(),
    salaryMax: z.number().int().min(0).optional(),
    salaryCurrency: z.string().length(3).optional(),
    salaryPeriod: z.enum(['hourly', 'monthly', 'yearly']).optional(),
    skills: z.array(z.string().min(1).max(100)).optional(),
    postedAfter: z.string().datetime().optional(),
    postedBefore: z.string().datetime().optional(),
    page: z.number().int().min(1).default(1),
    pageSize: z.number().int().min(1).max(50).default(10),
    sortBy: z.enum(['relevance', 'postedAt', 'discoveredAt', 'salary']).optional(),
    sortOrder: z.enum(['asc', 'desc']).optional(),
  }),
});

// Saved job ID param (route is /:id/save, so the param is named `id`)
export const savedJobIdParamSchema = z.object({
  params: z.object({
    id: z.string().min(1),
  }),
});

// Ranked match-listing query (all query values arrive as strings)
export const matchListQuerySchema = z.object({
  query: z.object({
    minScore: z.coerce.number().min(0).max(100).default(0),
    page: z.coerce.number().int().min(1).default(1),
    pageSize: z.coerce.number().int().min(1).max(100).default(20),
  }),
});

// Type exports
export type CreateManualJobInput = z.infer<typeof createManualJobSchema.shape.body>;
export type UpdateJobInput = z.infer<typeof updateJobSchema.shape.body>;
export type JobIdParam = z.infer<typeof jobIdParamSchema.shape.params>;
export type SaveJobInput = z.infer<typeof saveJobSchema.shape.body>;
export type ImportMockJobsInput = z.infer<typeof importMockJobsSchema.shape.body>;
export type ImportFromSourceInput = z.infer<typeof importFromSourceSchema.shape.body>;
export type SavedJobIdParam = z.infer<typeof savedJobIdParamSchema.shape.params>;