import { describe, it, expect, beforeAll } from 'vitest';
import request from 'supertest';
import fs from 'fs';
import path from 'path';
import { app } from '../index';

const fixture = fs.readFileSync(path.join(__dirname, '__fixtures__/timeline-new.json'));

let token: string;
let tripId: string;

beforeAll(async () => {
  // Use unique email per test-run to avoid collisions when re-running
  const email = `tl-${Date.now()}@test.de`;
  const reg = await request(app).post('/api/v1/auth/register').send({
    email, password: 'pw12345678', display_name: 'TL', family_name: 'TLF',
  });
  token = reg.body.token;
  const trip = await request(app).post('/api/v1/trips').set('Authorization', `Bearer ${token}`).send({
    title: 'TL-Test', start_date: '2025-07-19', end_date: '2025-07-21',
  });
  tripId = trip.body.trip.id;
});

describe('POST /api/v1/trips/:tripId/timeline/preview', () => {
  it('returns days-list with distance + modes', async () => {
    const res = await request(app)
      .post(`/api/v1/trips/${tripId}/timeline/preview`)
      .set('Authorization', `Bearer ${token}`)
      .attach('file', fixture, 'Timeline.json');
    expect(res.status).toBe(200);
    expect(res.body.days).toBeInstanceOf(Array);
    const d19 = res.body.days.find((d: any) => d.date === '2025-07-19');
    expect(d19).toBeDefined();
    expect(d19.distance_km).toBeGreaterThan(300);
    expect(d19.modes).toContain('driving');
    expect(res.body.skipped_outside_range).toContain('2025-06-15');
  });

  it('returns 422 for trip without dates', async () => {
    const t2 = await request(app).post('/api/v1/trips').set('Authorization', `Bearer ${token}`).send({ title: 'NoDate' });
    const res = await request(app)
      .post(`/api/v1/trips/${t2.body.trip.id}/timeline/preview`)
      .set('Authorization', `Bearer ${token}`)
      .attach('file', fixture, 'Timeline.json');
    expect(res.status).toBe(422);
  });

  it('returns 400 for invalid JSON format', async () => {
    const res = await request(app)
      .post(`/api/v1/trips/${tripId}/timeline/preview`)
      .set('Authorization', `Bearer ${token}`)
      .attach('file', Buffer.from('{"random":1}'), 'Timeline.json');
    expect(res.status).toBe(400);
  });
});
