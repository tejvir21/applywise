/** Submission settings Zod schemas (Phase 8). */

import { z } from 'zod';

export const platformSettingSchema = z.object({
  platform: z.string().min(1).max(50),
  mode: z.enum(['auto', 'permission', 'disabled']),
  authorized: z.boolean(),
});

export const updateSubmissionSettingsSchema = z.object({
  body: z.object({
    globalPaused: z.boolean().optional(),
    dailyLimit: z.number().int().min(1).max(100).optional(),
    minMatchScore: z.number().int().min(0).max(100).optional(),
    platforms: z.array(platformSettingSchema).max(50).optional(),
  }).strict(),
});

export const platformParamSchema = z.object({
  params: z.object({
    platform: z.string().min(1).max(50),
  }),
});
