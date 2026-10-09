/** Health endpoint tests. */

import { describe, it, expect } from 'vitest';
import request from 'supertest';
import { createApp } from '../src/app.js';

describe('Health Endpoints', () => {
  const app = createApp();

  it('GET /api returns API metadata', async () => {
    const res = await request(app).get('/api').expect(200);
    expect(res.body.success).toBe(true);
    expect(res.body.data.name).toBe('AI Job Application Agent API');
    expect(res.body.data.version).toBe('0.1.0');
  });

  it('GET /api/health returns structured response', async () => {
    const res = await request(app).get('/api/health').expect(200);

    expect(res.body.success).toBe(true);
    expect(res.body.data).toBeDefined();
    const health = res.body.data;

    expect(health.status).toBeOneOf(['ok', 'degraded']);
    expect(health.service).toBe('ai-job-application-agent');
    expect(health.version).toBe('0.1.0');
    expect(health.environment).toBe('test');
    expect(health.mongodb).toBeOneOf(['connected', 'disconnected', 'error']);
    expect(health.ai_provider).toBeDefined();
    expect(health.storage_provider).toBeDefined();
    expect(health.browser_automation_provider).toBeDefined();
  });

  it('GET /api/health/live returns ok', async () => {
    const res = await request(app).get('/api/health/live').expect(200);
    expect(res.body.success).toBe(true);
    expect(res.body.data.status).toBe('ok');
  });
});