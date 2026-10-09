/** Structured logging with secret redaction. */

import pino from 'pino';
import { getConfig } from './index.js';

const SENSITIVE_KEYS = [
  'password',
  'token',
  'secret',
  'api_key',
  'apikey',
  'access_token',
  'refresh_token',
  'authorization',
  'cookie',
  'session',
  'jwt',
  'key',
];

function redact(obj: unknown): unknown {
  if (obj === null || typeof obj !== 'object') return obj;
  if (Array.isArray(obj)) return obj.map(redact);
  const out: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(obj)) {
    const lowerKey = key.toLowerCase();
    if (SENSITIVE_KEYS.some(s => lowerKey.includes(s))) {
      out[key] = '***REDACTED***';
    } else {
      out[key] = redact(value);
    }
  }
  return out;
}

const config = getConfig();
const isProd = config.NODE_ENV === 'production';

export const logger = pino({
  level: config.LOG_LEVEL,
  redact: {
    paths: ['*.password', '*.token', '*.secret', '*.api_key', '*.authorization', '*.cookie', '*.jwt', '*.key'],
    censor: '***REDACTED***',
  },
  transport: isProd ? undefined : {
    target: 'pino-pretty',
    options: { colorize: true, translateTime: 'HH:MM:ss Z', ignore: 'pid,hostname' },
  },
  base: {
    service: 'ai-job-application-agent',
    version: '0.1.0',
    environment: config.NODE_ENV,
  },
});

export function createChildLogger(bindings: Record<string, unknown>): pino.Logger {
  return logger.child(redact(bindings) as Record<string, unknown>);
}