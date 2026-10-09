/** Test setup and utilities. */

import { config } from 'dotenv';
import { beforeAll, afterAll, vi } from 'vitest';
import { MongoMemoryServer } from 'mongodb-memory-server';

// Load test environment
config({ path: '.env', override: true });
process.env.NODE_ENV = 'test';
process.env.LOG_LEVEL = 'error';

// Reset config cache to pick up test env vars
import { resetConfigCache } from '../src/config/index.js';
resetConfigCache();

// Disable rate limiting for tests
import { setRateLimitingEnabled } from '../src/middleware/rateLimiter.js';
setRateLimitingEnabled(false);

let mongoServer: MongoMemoryServer;

// Mock logger to reduce noise in tests
vi.mock('../src/config/logger.js', () => ({
  logger: {
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    debug: vi.fn(),
    fatal: vi.fn(),
    child: vi.fn(() => ({
      info: vi.fn(),
      warn: vi.fn(),
      error: vi.fn(),
      debug: vi.fn(),
      fatal: vi.fn(),
    })),
  },
  createChildLogger: vi.fn(() => ({
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    debug: vi.fn(),
    fatal: vi.fn(),
  })),
}));

// Global test timeout
vi.setConfig({ testTimeout: 15000, hookTimeout: 15000 });

beforeAll(async () => {
  mongoServer = await MongoMemoryServer.create();
  const uri = mongoServer.getUri();
  process.env.MONGODB_URI = uri;
  process.env.MONGODB_DB = 'ai_job_application_agent_test';
  process.env.JWT_ACCESS_SECRET = 'test-access-secret-32-characters-minimum';
  process.env.JWT_REFRESH_SECRET = 'test-refresh-secret-32-characters-minimum';
  resetConfigCache();
});

afterAll(async () => {
  if (mongoServer) {
    await mongoServer.stop();
  }
});