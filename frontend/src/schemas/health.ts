import { z } from 'zod'

export const healthDataSchema = z.object({
  status: z.enum(['ok', 'degraded']),
  service: z.string(),
  version: z.string(),
  environment: z.string(),
  mongodb: z.enum(['connected', 'disconnected', 'error']),
  ai_provider: z.string(),
  storage_provider: z.string(),
  browser_automation_provider: z.string(),
  storage: z
    .object({
      active: z.string(),
      primary: z.string(),
      fallback: z.string(),
      healthy: z.boolean(),
      durable: z.boolean(),
      degraded: z.boolean(),
      reason: z.string().optional(),
    })
    .optional(),
})
