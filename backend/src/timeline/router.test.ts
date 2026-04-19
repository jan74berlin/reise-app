import { vi } from 'vitest';
vi.mock('../strato', () => ({
  uploadRouteMap: vi.fn(async (tid: string, date: string) => ({
    filePath: `/_entwuerfe/${tid}/route_${date}.png`,
    url: `https://example.com/_entwuerfe/${tid}/route_${date}.png`,
  })),
  uploadOverviewMap: vi.fn(async (tid: string) => ({
    filePath: `/_entwuerfe/${tid}/trip-overview.png`,
    url: `https://example.com/_entwuerfe/${tid}/trip-overview.png`,
  })),
  uploadToStrato: vi.fn(),
  deleteFromStrato: vi.fn(),
}));
vi.mock('./map', () => ({
  renderRouteImage: vi.fn(async () => Buffer.from([0x89,0x50,0x4E,0x47])),
}));
vi.mock('./overview', () => ({
  renderOverviewImage: vi.fn(async () => Buffer.from([0x89,0x50,0x4E,0x47])),
}));

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

describe('POST /api/v1/trips/:tripId/timeline/import', () => {
  it('imports selected days, auto-creates missing entries, sets route_image_url', async () => {
    const res = await request(app)
      .post(`/api/v1/trips/${tripId}/timeline/import`)
      .set('Authorization', `Bearer ${token}`)
      .field('days_to_process', JSON.stringify(['2025-07-19', '2025-07-20']))
      .field('overwrite', JSON.stringify({}))
      .field('auto_create', 'true')
      .attach('file', fixture, 'Timeline.json');
    expect(res.status).toBe(200);
    expect(res.body.processed).toHaveLength(2);
    const d19 = res.body.processed.find((p: any) => p.date === '2025-07-19');
    expect(d19.route_image_url).toContain('route_2025-07-19.png');
    expect(d19.journal_entry_id).toBeDefined();
    expect(d19.created).toBe(true);

    // Verify DB state via journal endpoint
    const r = await request(app).get(`/api/v1/trips/${tripId}/journal`).set('Authorization', `Bearer ${token}`);
    const e19 = r.body.entries.find((e: any) => e.date === '2025-07-19');
    expect(e19.route_image_url).toContain('route_2025-07-19.png');
    expect(e19.route_meta.distance_km).toBeGreaterThan(300);
  });

  it('skips days when overwrite=false and existing image present', async () => {
    // First import as setup (overwrite to ensure fresh state)
    await request(app)
      .post(`/api/v1/trips/${tripId}/timeline/import`)
      .set('Authorization', `Bearer ${token}`)
      .field('days_to_process', JSON.stringify(['2025-07-19']))
      .field('overwrite', JSON.stringify({ '2025-07-19': true }))
      .field('auto_create', 'true')
      .attach('file', fixture, 'Timeline.json');
    // Second import without overwrite → should skip
    const res = await request(app)
      .post(`/api/v1/trips/${tripId}/timeline/import`)
      .set('Authorization', `Bearer ${token}`)
      .field('days_to_process', JSON.stringify(['2025-07-19']))
      .field('overwrite', JSON.stringify({ '2025-07-19': false }))
      .field('auto_create', 'true')
      .attach('file', fixture, 'Timeline.json');
    expect(res.body.skipped).toContainEqual(expect.objectContaining({ date: '2025-07-19', reason: 'exists' }));
  });

  it('triggers overview re-render (uploadOverviewMap called)', async () => {
    const { uploadOverviewMap } = await import('../strato');
    (uploadOverviewMap as any).mockClear();
    await request(app)
      .post(`/api/v1/trips/${tripId}/timeline/import`)
      .set('Authorization', `Bearer ${token}`)
      .field('days_to_process', JSON.stringify(['2025-07-19']))
      .field('overwrite', JSON.stringify({ '2025-07-19': true }))
      .field('auto_create', 'true')
      .attach('file', fixture, 'Timeline.json');
    expect(uploadOverviewMap).toHaveBeenCalledWith(tripId, expect.any(Buffer));
  });
});
