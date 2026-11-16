/** In-memory rate limiter for authentication endpoints. */

import { Request, Response, NextFunction } from 'express';
import { getConfig } from '../config/index.js';
import { RateLimitError } from '../utils/errors.js';

interface Bucket {
  tokens: number;
  lastRefill: number;
}

const buckets = new Map<string, Bucket>();

let rateLimitingEnabled = true;

export function setRateLimitingEnabled(enabled: boolean): void {
  rateLimitingEnabled = enabled;
}

function consume(bucket: Bucket, rate: number, capacity: number, cost = 1): { allowed: boolean; retryAfter: number } {
  const now = Date.now();
  const elapsed = (now - bucket.lastRefill) / 1000;
  bucket.tokens = Math.min(capacity, bucket.tokens + elapsed * rate);
  bucket.lastRefill = now;

  if (bucket.tokens >= cost) {
    bucket.tokens -= cost;
    return { allowed: true, retryAfter: 0 };
  }

  const retryAfter = (cost - bucket.tokens) / rate;
  return { allowed: false, retryAfter };
}

export function createRateLimiter(
  prefix: string,
  requestsPerMinute: number,
  maxBurst: number = requestsPerMinute
) {
  const rate = requestsPerMinute / 60; // tokens per second
  const capacity = maxBurst;

  return (req: Request, _res: Response, next: NextFunction): void => {
    if (!rateLimitingEnabled) {
      next();
      return;
    }

    const ip = req.ip ?? req.socket.remoteAddress ?? 'unknown';
    const key = `${prefix}:${ip}`;

    let bucket = buckets.get(key);
    if (!bucket) {
      bucket = { tokens: capacity, lastRefill: Date.now() };
      buckets.set(key, bucket);
    }

    const { allowed, retryAfter } = consume(bucket, rate, capacity);

    if (!allowed) {
      const error = new RateLimitError(Math.ceil(retryAfter));
      // Set Retry-After header before throwing
      _res.setHeader('Retry-After', String(Math.ceil(retryAfter)));
      throw error;
    }

    next();
  };
}

/**
 * Create a per-user rate limiter for expensive endpoints.
 * Uses the authenticated user ID as the key (falls back to IP if unauthenticated).
 * This prevents a single user from exhausting shared resources.
 *
 * Limits are read from config at request time to allow runtime configuration.
 */
export function createUserRateLimiter(
  prefix: string,
  defaultRequestsPerMinute: number,
  configKey?: string,
) {
  return (req: Request, _res: Response, next: NextFunction): void => {
    if (!rateLimitingEnabled) {
      next();
      return;
    }

    // Read limit from config if available, fall back to default
    let requestsPerMinute = defaultRequestsPerMinute;
    if (configKey) {
      try {
        const config = getConfig();
        const value = (config as Record<string, unknown>)[configKey];
        if (typeof value === 'number') requestsPerMinute = value;
      } catch {
        // Config not available (e.g., in tests), use default
      }
    }

    const rate = requestsPerMinute / 60; // tokens per second
    const capacity = requestsPerMinute;

    // Use authenticated user ID if available, fall back to IP
    const authReq = req as { user?: { sub?: string } };
    const userId = authReq.user?.sub;
    const ip = req.ip ?? req.socket.remoteAddress ?? 'unknown';
    const key = userId ? `${prefix}:user:${userId}` : `${prefix}:ip:${ip}`;

    let bucket = buckets.get(key);
    if (!bucket) {
      bucket = { tokens: capacity, lastRefill: Date.now() };
      buckets.set(key, bucket);
    }

    const { allowed, retryAfter } = consume(bucket, rate, capacity);

    if (!allowed) {
      _res.setHeader('Retry-After', String(Math.ceil(retryAfter)));
      throw new RateLimitError(Math.ceil(retryAfter));
    }

    next();
  };
}

export const rateLimitRegister = createRateLimiter('register', 5, 5);
export const rateLimitLogin = createRateLimiter('login', 10, 10);
export const rateLimitRefresh = createRateLimiter('refresh', 20, 20);

export const rateLimitAiGeneration = createUserRateLimiter(
  'ai-gen',
  10,
  'RATE_LIMIT_AI_GENERATION_PER_MINUTE',
);

export const rateLimitResumeUpload = createUserRateLimiter(
  'resume-upload',
  5,
  'RATE_LIMIT_RESUME_UPLOAD_PER_MINUTE',
);

export const rateLimitResumeAnalysis = createUserRateLimiter(
  'resume-analysis',
  5,
  'RATE_LIMIT_RESUME_ANALYSIS_PER_MINUTE',
);

export const rateLimitJobIngestion = createUserRateLimiter(
  'job-ingestion',
  10,
  'RATE_LIMIT_JOB_INGESTION_PER_MINUTE',
);

// Cleanup old buckets periodically (every 10 minutes)
setInterval(() => {
  const now = Date.now();
  for (const [key, bucket] of buckets.entries()) {
    if (now - bucket.lastRefill > 10 * 60 * 1000) {
      buckets.delete(key);
    }
  }
}, 10 * 60 * 1000).unref();