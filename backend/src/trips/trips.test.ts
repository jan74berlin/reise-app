import { describe, it, expect, beforeAll } from 'vitest';
import request from 'supertest';
import { app } from '../index';
import { pool } from '../db';

let token: string;
let tripId: string;

beforeAll(async () => {
  await pool.query("DELETE FROM families WHERE name = 'TripTestFam'");
  const res = await request(app).post('/api/v1/auth/register').send({
    email: 'triptest@test-reise.de', password: 'pw', display_name: 'Tester', family_name: 'TripTestFam',
  });
  token = res.body.token;
});

describe('Trips CRUD', () => {
  it('POST /api/v1/trips — creates a trip', async () => {
    const res = await request(app)
      .post('/api/v1/trips')
      .set('Authorization', `Bearer ${token}`)
      .send({ title: 'Baltikum 2026', start_date: '2026-06-06', end_date: '2026-06-27', vehicle_height: 3.1, vehicle_length: 6.0, vehicle_weight: 3500, vehicle_fuel: 'diesel' });
    expect(res.status).toBe(201);
    expect(res.body.trip.title).toBe('Baltikum 2026');
    tripId = res.body.trip.id;
  });

  it('GET /api/v1/trips — lists trips', async () => {
    const res = await request(app).get('/api/v1/trips').set('Authorization', `Bearer ${token}`);
    expect(res.status).toBe(200);
    expect(res.body.trips.length).toBeGreaterThanOrEqual(1);
  });

  it('GET /api/v1/trips/:id — returns single trip', async () => {
    const res = await request(app).get(`/api/v1/trips/${tripId}`).set('Authorization', `Bearer ${token}`);
    expect(res.status).toBe(200);
    expect(res.body.trip.id).toBe(tripId);
  });

  it('PUT /api/v1/trips/:id — updates trip', async () => {
    const res = await request(app)
      .put(`/api/v1/trips/${tripId}`)
      .set('Authorization', `Bearer ${token}`)
      .send({ description: 'Wohnmobiltour' });
    expect(res.status).toBe(200);
    expect(res.body.trip.description).toBe('Wohnmobiltour');
  });

  it('DELETE /api/v1/trips/:id — deletes trip', async () => {
    const res = await request(app).delete(`/api/v1/trips/${tripId}`).set('Authorization', `Bearer ${token}`);
    expect(res.status).toBe(204);
  });
});
