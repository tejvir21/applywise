import { z } from 'zod'

export const capabilityAssessmentSchema = z.object({
  status: z.enum(['supported', 'unsupported', 'unverified', 'unavailable']),
  evidence: z.string().optional(),
  authorization: z.string().optional(),
  notes: z.string().optional(),
})

const capabilityKeys = [
  'discovery',
  'detail',
  'questions',
  'prepare',
  'upload',
  'submit',
  'verify',
  'handoff',
] as const

export const platformDescriptorSchema = z.object({
  platform: z.string(),
  displayName: z.string(),
  website: z.string().optional(),
  capabilities: z.object({
    discovery: capabilityAssessmentSchema,
    detail: capabilityAssessmentSchema,
    questions: capabilityAssessmentSchema,
    prepare: capabilityAssessmentSchema,
    upload: capabilityAssessmentSchema,
    submit: capabilityAssessmentSchema,
    verify: capabilityAssessmentSchema,
    handoff: capabilityAssessmentSchema,
  }),
  lastReviewed: z.string(),
})

export const platformListSchema = z.object({
  platforms: z.array(platformDescriptorSchema),
})

export const policyEvaluationSchema = z.object({
  decision: z.enum(['auto_allowed', 'approval_required', 'manual_only', 'blocked']),
  reasons: z.array(z.string()),
  platform: z.string(),
})

export const handoffSchema = z.object({
  application: z.unknown(),
  handoff: z.object({
    applicationUrl: z.string(),
    instructions: z.array(z.string()),
    status: z.string(),
  }),
})

export type { capabilityKeys }
