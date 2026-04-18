import { describe, it, expect, beforeAll, afterAll, vi } from 'vitest';
import request from 'supertest';
import { app } from '../index';
import { pool } from '../db';

vi.mock('../strato', () => ({
  uploadToStrato: vi.fn().mockResolvedValue({
    filePath: '/_entwuerfe/test-trip/test-uuid.jpg',
    url: 'https://xn--tnhardt-90a.de/_entwuerfe/test-trip/test-uuid.jpg',
  }),
  deleteFromStrato: vi.fn().mockResolvedValue(undefined),
}));

let token: string;
let tripId: string;
let nightId: string;
let entryId: string;

beforeAll(async () => {
  await pool.query(`
    UPDATE journal_entries SET user_id = NULL
    WHERE user_id IN (SELECT id FROM users WHERE email = 'journaltest@test-reise.de')
  `);
  await pool.query("DELETE FROM families WHERE name = 'JournalTestFam'");

  const reg = await request(app).post('/api/v1/auth/register').send({
    email: 'journaltest@test-reise.de',
    password: 'pw',
    display_name: 'JournalTester',
    family_name: 'JournalTestFam',
  });
  token = reg.body.token;

  const t = await request(app)
    .post('/api/v1/trips')
    .set('Authorization', `Bearer ${token}`)
    .send({ title: 'Journal Test Trip' });
  tripId = t.body.trip.id;

  const n = await request(app)
    .post(`/api/v1/trips/${tripId}/nights`)
    .set('Authorization', `Bearer ${token}`)
    .send({ night_number: 1, date: '2026-06-06', lat_center: 54.1, lng_center: 22.5 });
  nightId = n.body.night.id;

  const e = await request(app)
    .post(`/api/v1/trips/${tripId}/journal`)
    .set('Authorization', `Bearer ${token}`)
    .send({ text: 'Toller Tag!', night_id: nightId });
  entryId = e.body.entry.id;
});

afterAll(async () => {
  await pool.query(`
    UPDATE journal_entries SET user_id = NULL
    WHERE user_id IN (SELECT id FROM users WHERE email = 'journaltest@test-reise.de')
  `);
  await pool.query("DELETE FROM families WHERE name = 'JournalTestFam'");
});

describe('Journal entries CRUD', () => {
  it('POST /api/v1/trips/:tripId/journal — creates entry, returns 201', async () => {
    expect(entryId).toBeTruthy();

    const res = await request(app)
      .post(`/api/v1/trips/${tripId}/journal`)
      .set('Authorization', `Bearer ${token}`)
      .send({ text: 'Zweiter Eintrag', night_id: nightId });
    expect(res.status).toBe(201);
    expect(res.body.entry.text).toBe('Zweiter Eintrag');
    expect(res.body.entry.trip_id).toBe(tripId);
  });

  it('GET /api/v1/trips/:tripId/journal — returns entries array with media[]', async () => {
    const res = await request(app)
      .get(`/api/v1/trips/${tripId}/journal`)
      .set('Authorization', `Bearer ${token}`);
    expect(res.status).toBe(200);
    expect(Array.isArray(res.body.entries)).toBe(true);
    expect(res.body.entries.length).toBeGreaterThanOrEqual(1);
    expect(Array.isArray(res.body.entries[0].media)).toBe(true);
  });

  it('POST /:entryId/media — uploads photo via strato mock, returns file_path + url', async () => {
    const res = await request(app)
      .post(`/api/v1/trips/${tripId}/journal/${entryId}/media`)
      .set('Authorization', `Bearer ${token}`)
      .attach('photo', Buffer.from('fake-image-data'), { filename: 'test.jpg', contentType: 'image/jpeg' });
    expect(res.status).toBe(201);
    expect(res.body.media.file_path).toBe('/_entwuerfe/test-trip/test-uuid.jpg');
    expect(res.body.media.url).toBe('https://xn--tnhardt-90a.de/_entwuerfe/test-trip/test-uuid.jpg');
    expect(res.body.media.filename).toBe('test.jpg');
  });

  it('POST /:entryId/media — returns 400 if no file', async () => {
    const res = await request(app)
      .post(`/api/v1/trips/${tripId}/journal/${entryId}/media`)
      .set('Authorization', `Bearer ${token}`);
    expect(res.status).toBe(400);
    expect(res.body.error).toBe('No file');
  });

  it('POST /:entryId/media — returns 400 for disallowed file type', async () => {
    const res = await request(app)
      .post(`/api/v1/trips/${tripId}/journal/${entryId}/media`)
      .set('Authorization', `Bearer ${token}`)
      .attach('photo', Buffer.from('fake-data'), { filename: 'test.txt', contentType: 'text/plain' });
    expect(res.status).toBe(400);
    expect(res.body.error).toBe('No file');
  });

  it('POST /journal — persists date field', async () => {
    const res = await request(app)
      .post(`/api/v1/trips/${tripId}/journal`)
      .set('Authorization', `Bearer ${token}`)
      .send({ text: 'Mit Datum', date: '2026-06-10' });
    expect(res.status).toBe(201);
    expect(res.body.entry.date).toBe('2026-06-10');
  });

  it('POST /journal — date can be omitted (null)', async () => {
    const res = await request(app)
      .post(`/api/v1/trips/${tripId}/journal`)
      .set('Authorization', `Bearer ${token}`)
      .send({ text: 'Ohne Datum' });
    expect(res.status).toBe(201);
    expect(res.body.entry.date).toBeNull();
  });

  it('PUT /journal/:id — updates date', async () => {
    const create = await request(app)
      .post(`/api/v1/trips/${tripId}/journal`)
      .set('Authorization', `Bearer ${token}`)
      .send({ text: 'Startdatum', date: '2026-06-01' });
    const id = create.body.entry.id;

    const upd = await request(app)
      .put(`/api/v1/trips/${tripId}/journal/${id}`)
      .set('Authorization', `Bearer ${token}`)
      .send({ date: '2026-06-15' });
    expect(upd.status).toBe(200);
    expect(upd.body.entry.date).toBe('2026-06-15');
  });

  it('GET /journal — sorts by date ASC NULLS LAST, then created_at', async () => {
    const tRes = await request(app)
      .post('/api/v1/trips')
      .set('Authorization', `Bearer ${token}`)
      .send({ title: 'Sort Trip' });
    const sortTripId = tRes.body.trip.id;

    async function mk(text: string, date: string | null) {
      const r = await request(app)
        .post(`/api/v1/trips/${sortTripId}/journal`)
        .set('Authorization', `Bearer ${token}`)
        .send({ text, date });
      return r.body.entry.id;
    }
    const idB = await mk('B', '2026-06-10');
    const idA = await mk('A', '2026-06-05');
    const idNull = await mk('NULL', null);
    const idC = await mk('C', '2026-06-15');

    const res = await request(app)
      .get(`/api/v1/trips/${sortTripId}/journal`)
      .set('Authorization', `Bearer ${token}`);
    const ids = res.body.entries.map((e: { id: string }) => e.id);
    expect(ids).toEqual([idA, idB, idC, idNull]);
  });
});
