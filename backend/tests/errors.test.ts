/** Error handling tests. */

import { describe, it, expect } from 'vitest';
import request from 'supertest';
import { createApp } from '../src/app.js';

describe('Error Handling', () => {
  const app = createApp();

  it('returns structured error for 404', async () => {
    const res = await request(app).get('/api/nonexistent').expect(404);

    expect(res.body.success).toBe(false);
    expect(res.body.error).toBeDefined();
    expect(res.body.error.code).toBe('NOT_FOUND');
    expect(res.body.error.message).toBeDefined();
    expect(res.body.error.details).toBeDefined();
  });

  it('returns structured validation error', async () => {
    // POST to /api/auth/register with invalid body to trigger validation
    const res = await request(app)
      .post('/api/auth/register')
      .send({ email: 'invalid', password: 'short' })
      .expect(422);

    expect(res.body.success).toBe(false);
    expect(res.body.error.code).toBe('VALIDATION_ERROR');
    expect(res.body.error.details).toBeDefined();
  });
});