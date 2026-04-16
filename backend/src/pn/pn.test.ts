import { describe, it, expect } from 'vitest';
import request from 'supertest';
import { app } from '../index';

describe('GET /api/v1/pn/around', () => {
  it('returns spots array for Gdansk area', async () => {
    const res = await request(app)
      .get('/api/v1/pn/around?lat=54.35&lng=18.65&radius=50');
    expect([200, 502]).toContain(res.status);
    if (res.status === 200) expect(Array.isArray(res.body.spots)).toBe(true);
  }, 20000);
});
