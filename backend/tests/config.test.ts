/** Configuration tests. */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { getConfig, assertSecretsConfigured, getCorsOrigins, resetConfigCache } from '../src/config/index.js';

describe('Configuration', () => {
  beforeEach(() => {
    resetConfigCache();
  });

  it('loads defaults correctly', () => {
    const cfg = getConfig();

    expect(cfg.NODE_ENV).toBe('test');
    expect(cfg.MONGODB_URI).toContain('mongodb://');
    expect(cfg.MONGODB_DB).toBe('ai_job_application_agent_test');
    expect(cfg.AI_PROVIDER).toBe('mock');
    expect(cfg.STORAGE_PROVIDER).toBe('local');
    expect(cfg.BROWSER_AUTOMATION_PROVIDER).toBe('mock');
  });

  it('parses CORS origins from comma-separated string', () => {
    vi.stubEnv('CLIENT_URL', 'http://127.0.0.1:5173,http://127.0.0.1:3000');
    resetConfigCache();
    const cfg = getConfig();
    expect(cfg.CLIENT_URL).toBe('http://127.0.0.1:5173,http://127.0.0.1:3000');
    expect(getCorsOrigins()).toEqual(['http://127.0.0.1:5173', 'http://127.0.0.1:3000']);
  });

  it('handles single CORS origin', () => {
    vi.stubEnv('CLIENT_URL', 'http://127.0.0.1:5173');
    resetConfigCache();
    const cfg = getConfig();
    expect(getCorsOrigins()).toEqual(['http://127.0.0.1:5173']);
  });

  it('detects production environment', () => {
    vi.stubEnv('NODE_ENV', 'production');
    resetConfigCache();
    const cfg = getConfig();
    expect(cfg.NODE_ENV).toBe('production');
  });

  it('passes secret validation in development with placeholders', () => {
    vi.stubEnv('NODE_ENV', 'development');
    vi.stubEnv('JWT_ACCESS_SECRET', 'change-me-access-secret-32-characters-minimum');
    vi.stubEnv('JWT_REFRESH_SECRET', 'change-me-refresh-secret-32-characters-minimum');
    resetConfigCache();
    expect(() => assertSecretsConfigured()).not.toThrow();
  });

  it('fails secret validation in production with placeholders', () => {
    vi.stubEnv('NODE_ENV', 'production');
    vi.stubEnv('JWT_ACCESS_SECRET', 'change-me-access-secret-32-characters-minimum');
    vi.stubEnv('JWT_REFRESH_SECRET', 'change-me-refresh-secret-32-characters-minimum');
    resetConfigCache();
    expect(() => assertSecretsConfigured()).toThrow('JWT_ACCESS_SECRET must be set');
  });

  it('passes secret validation in production with real secrets', () => {
    vi.stubEnv('NODE_ENV', 'production');
    vi.stubEnv('JWT_ACCESS_SECRET', 'real-secure-access-secret-32-chars-min');
    vi.stubEnv('JWT_REFRESH_SECRET', 'real-secure-refresh-secret-32-chars-min');
    resetConfigCache();
    expect(() => assertSecretsConfigured()).not.toThrow();
  });
});