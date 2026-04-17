import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import request from 'supertest';
import { app } from '../index';
import { pool } from '../db';
import { signToken } from '../jwt';

let token: string;
let tripId: string;

beforeAll(async () => {
  await pool.query('DELETE FROM families WHERE name = $1', ['CheckTest']);
  const f = await pool.query(
    "INSERT INTO families (name, invite_code) VALUES ('CheckTest','CHKTST01') RETURNING id"
  );
  const u = await pool.query(
    "INSERT INTO users (family_id, email, password_hash, display_name, role) VALUES ($1,'chk@test.de','x','Chk','owner') RETURNING id",
    [f.rows[0].id]
  );
  token = signToken({ userId: u.rows[0].id, familyId: f.rows[0].id, email: 'chk@test.de', role: 'owner' });
  const t = await pool.query(
    "INSERT INTO trips (family_id, title, created_by) VALUES ($1,'ChkTrip',$2) RETURNING id",
    [f.rows[0].id, u.rows[0].id]
  );
  tripId = t.rows[0].id;
}, 30000);

afterAll(async () => {
  try {
    await pool.query('DELETE FROM families WHERE name = $1', ['CheckTest']);
  } catch (e) {
    // cleanup
  }
}, 30000);

describe('Checklist API', () => {
  let itemId: string;

  it('POST creates item', async () => {
    const r = await request(app)
      .post(`/api/v1/trips/${tripId}/checklist`)
      .set('Authorization', `Bearer ${token}`)
      .send({ category: 'Camping', text: 'Schlafsack' });
    expect(r.status).toBe(201);
    expect(r.body.item.text).toBe('Schlafsack');
    expect(r.body.item.is_checked).toBe(false);
    itemId = r.body.item.id;
  });

  it('GET returns items', async () => {
    const r = await request(app)
      .get(`/api/v1/trips/${tripId}/checklist`)
      .set('Authorization', `Bearer ${token}`);
    expect(r.status).toBe(200);
    expect(r.body.items.length).toBeGreaterThan(0);
  });

  it('PUT toggles checked', async () => {
    const r = await request(app)
      .put(`/api/v1/trips/${tripId}/checklist/${itemId}`)
      .set('Authorization', `Bearer ${token}`)
      .send({ is_checked: true });
    expect(r.status).toBe(200);
    expect(r.body.item.is_checked).toBe(true);
  });

  it('DELETE removes item', async () => {
    const r = await request(app)
      .delete(`/api/v1/trips/${tripId}/checklist/${itemId}`)
      .set('Authorization', `Bearer ${token}`);
    expect(r.status).toBe(204);
  });
});
