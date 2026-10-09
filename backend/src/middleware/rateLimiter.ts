/** In-memory rate limiter for authentication endpoints. */

import { Request, Response, NextFunction } from 'express';
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
      throw new RateLimitError(Math.ceil(retryAfter));
    }

    next();
  };
}

export const rateLimitRegister = createRateLimiter('register', 5, 5);
export const rateLimitLogin = createRateLimiter('login', 10, 10);
export const rateLimitRefresh = createRateLimiter('refresh', 20, 20);

// Cleanup old buckets periodically (every 10 minutes)
setInterval(() => {
  const now = Date.now();
  for (const [key, bucket] of buckets.entries()) {
    if (now - bucket.lastRefill > 10 * 60 * 1000) {
      buckets.delete(key);
    }
  }
}, 10 * 60 * 1000).unref();