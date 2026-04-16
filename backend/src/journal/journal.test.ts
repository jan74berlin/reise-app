import { describe, it, expect, beforeAll, afterAll, vi } from 'vitest';
import request from 'supertest';
import { app } from '../index';
import { pool } from '../db';

vi.mock('../drive', () => ({
  uploadToDrive: vi.fn().mockResolvedValue({
    fileId: 'test-file-id',
    viewUrl: 'https://drive.google.com/uc?id=test-file-id',
  }),
  deleteDriveFile: vi.fn().mockResolvedValue(undefined),
}));

let token: string;
let tripId: string;
let nightId: string;
let entryId: string;

beforeAll(async () => {
  // Null out user_id on journal_entries to allow user/family cascade delete,
  // then cascade delete via families → users/trips → journal_entries → media
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

  // Create the journal entry here so entryId is available for all tests
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
    // Entry already created in beforeAll; verify it exists
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

  it('POST /api/v1/trips/:tripId/journal/:entryId/media — uploads photo (mocked drive)', async () => {
    const res = await request(app)
      .post(`/api/v1/trips/${tripId}/journal/${entryId}/media`)
      .set('Authorization', `Bearer ${token}`)
      .attach('photo', Buffer.from('fake-image-data'), { filename: 'test.jpg', contentType: 'image/jpeg' });
    expect(res.status).toBe(201);
    expect(res.body.media.drive_file_id).toBe('test-file-id');
    expect(res.body.media.drive_view_url).toBe('https://drive.google.com/uc?id=test-file-id');
    expect(res.body.media.filename).toBe('test.jpg');
  });

  it('POST /api/v1/trips/:tripId/journal/:entryId/media — returns 400 if no file', async () => {
    const res = await request(app)
      .post(`/api/v1/trips/${tripId}/journal/${entryId}/media`)
      .set('Authorization', `Bearer ${token}`);
    expect(res.status).toBe(400);
    expect(res.body.error).toBe('No file');
  });

  it('POST /api/v1/trips/:tripId/journal/:entryId/media — returns 400 for disallowed file type', async () => {
    const res = await request(app)
      .post(`/api/v1/trips/${tripId}/journal/${entryId}/media`)
      .set('Authorization', `Bearer ${token}`)
      .attach('photo', Buffer.from('fake-data'), { filename: 'test.txt', contentType: 'text/plain' });
    expect(res.status).toBe(400);
    expect(res.body.error).toBe('No file');
  });
});
