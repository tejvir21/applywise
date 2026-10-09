/** Authentication request/response schemas. */

import { z } from 'zod';

export const registerSchema = z.object({
  body: z.object({
    email: z.string().email(),
    password: z.string().min(8).max(128),
  }),
});

export const loginSchema = z.object({
  body: z.object({
    email: z.string().email(),
    password: z.string().min(1),
  }),
});

export const refreshSchema = z.object({
  body: z.object({
    // Optional: falls back to the HttpOnly refresh cookie when absent,
    // which is how the browser silently refreshes (no body token needed).
    refresh_token: z.string().min(1).optional(),
  }),
});

export type RegisterInput = z.infer<typeof registerSchema.shape.body>;
export type LoginInput = z.infer<typeof loginSchema.shape.body>;
export type RefreshInput = z.infer<typeof refreshSchema.shape.body>;

export const tokenResponseSchema = z.object({
  access_token: z.string(),
  refresh_token: z.string(),
  token_type: z.literal('bearer'),
  expires_in: z.number(),
});

export type TokenResponse = z.infer<typeof tokenResponseSchema>;

export const currentUserResponseSchema = z.object({
  id: z.string(),
  email: z.string().email(),
  created_at: z.string().datetime(),
  is_active: z.boolean(),
});

export type CurrentUserResponse = z.infer<typeof currentUserResponseSchema>;