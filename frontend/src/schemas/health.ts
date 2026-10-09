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
})
