import { describe, it, expect, beforeAll, afterAll, vi } from 'vitest';
import request from 'supertest';

vi.mock('../strato', () => ({
  uploadToStrato: vi.fn().mockResolvedValue({
    filePath: '/mocked.jpg', url: 'https://xn--tnhardt-90a.de/mocked.jpg',
  }),
  deleteFromStrato: vi.fn().mockResolvedValue(undefined),
  uploadPagesJson: vi.fn().mockResolvedValue(undefined),
}));

vi.mock('./toenhardt-repo', () => ({
  readPagesJson: vi.fn().mockResolvedValue({}),
  writePagesJson: vi.fn().mockResolvedValue(undefined),
  ensureRepoCloned: vi.fn().mockResolvedValue(undefined),
  pullRepo: vi.fn().mockResolvedValue(undefined),
  commitAndPush: vi.fn().mockResolvedValue(undefined),
  syncPagesJsonToStrato: vi.fn().mockResolvedValue(undefined),
}));

import { app } from '../index';
import { pool } from '../db';

let token: string;
let tripId: string;
let entryId: string;

beforeAll(async () => {
  await pool.query(`DELETE FROM families WHERE name = 'PublishTestFam'`);
  const reg = await request(app).post('/api/v1/auth/register').send({
    email: 'publishtest@test-reise.de', password: 'pw', display_name: 'PT', family_name: 'PublishTestFam',
  });
  token = reg.body.token;
  const t = await request(app).post('/api/v1/trips').set('Authorization', `Bearer ${token}`).send({ title: 'Publish Testreise', start_date: '2026-06-01' });
  tripId = t.body.trip.id;
  const e = await request(app).post(`/api/v1/trips/${tripId}/journal`).set('Authorization', `Bearer ${token}`).send({ text: 'Hallo', date: '2026-06-02', blocks: [{ type: 'text', content: 'Hallo' }] });
  entryId = e.body.entry.id;
});

afterAll(async () => {
  await pool.query(`DELETE FROM families WHERE name = 'PublishTestFam'`);
});

describe('POST /publish', () => {
  it('publishes an entry, assigns slug + publish_seq, sets is_published', async () => {
    const res = await request(app)
      .post(`/api/v1/trips/${tripId}/journal/${entryId}/publish`)
      .set('Authorization', `Bearer ${token}`);
    expect(res.status).toBe(200);
    expect(res.body.is_published).toBe(true);
    expect(res.body.url).toContain('publish-testreise/tag-1');

    const check = await request(app).get(`/api/v1/trips/${tripId}/journal`).set('Authorization', `Bearer ${token}`);
    const entry = check.body.entries.find((e: any) => e.id === entryId);
    expect(entry.is_published).toBe(true);
    expect(entry.publish_seq).toBe(1);
  });

  it('republish keeps same publish_seq', async () => {
    const res = await request(app)
      .post(`/api/v1/trips/${tripId}/journal/${entryId}/publish`)
      .set('Authorization', `Bearer ${token}`);
    expect(res.status).toBe(200);
    expect(res.body.url).toContain('tag-1');
  });

  it('second entry gets publish_seq=2', async () => {
    const e2 = await request(app).post(`/api/v1/trips/${tripId}/journal`).set('Authorization', `Bearer ${token}`).send({ date: '2026-06-03', blocks: [] });
    const res = await request(app)
      .post(`/api/v1/trips/${tripId}/journal/${e2.body.entry.id}/publish`)
      .set('Authorization', `Bearer ${token}`);
    expect(res.body.url).toContain('tag-2');
  });
});
