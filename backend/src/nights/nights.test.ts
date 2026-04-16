import { describe, it, expect, beforeAll } from 'vitest';
import request from 'supertest';
import { app } from '../index';
import { pool } from '../db';

let token: string;
let tripId: string;

beforeAll(async () => {
  await pool.query("DELETE FROM families WHERE name = 'NightTestFam'");
  const reg = await request(app).post('/api/v1/auth/register').send({
    email: 'nighttest@test-reise.de', password: 'pw', display_name: 'T', family_name: 'NightTestFam',
  });
  token = reg.body.token;
  const t = await request(app).post('/api/v1/trips').set('Authorization', `Bearer ${token}`)
    .send({ title: 'Test Trip' });
  tripId = t.body.trip.id;
});

describe('Nights CRUD', () => {
  it('POST /api/v1/trips/:id/nights — creates a night', async () => {
    const res = await request(app)
      .post(`/api/v1/trips/${tripId}/nights`)
      .set('Authorization', `Bearer ${token}`)
      .send({ night_number: 1, date: '2026-06-06', lat_center: 54.1, lng_center: 22.5 });
    expect(res.status).toBe(201);
    expect(res.body.night.night_number).toBe(1);
  });

  it('GET /api/v1/trips/:id/nights — lists nights', async () => {
    const res = await request(app).get(`/api/v1/trips/${tripId}/nights`).set('Authorization', `Bearer ${token}`);
    expect(res.status).toBe(200);
    expect(res.body.nights.length).toBe(1);
  });

  it('POST /api/v1/trips/:id/nights/:n/spots — adds a spot', async () => {
    const res = await request(app)
      .post(`/api/v1/trips/${tripId}/nights/1/spots`)
      .set('Authorization', `Bearer ${token}`)
      .send({ pn_id: 522608, lat: 54.35, lng: 18.65, title: 'Gdańsk', type_code: 'PN', role: 'primary' });
    expect(res.status).toBe(201);
    expect(res.body.night_spot.role).toBe('primary');
  });

  it('PUT night_spot — marks spot as selected', async () => {
    const nights = await request(app).get(`/api/v1/trips/${tripId}/nights`).set('Authorization', `Bearer ${token}`);
    const nightSpotId = nights.body.nights[0].spots[0]?.night_spot_id;
    const res = await request(app)
      .put(`/api/v1/trips/${tripId}/nights/1/spots/${nightSpotId}`)
      .set('Authorization', `Bearer ${token}`)
      .send({ is_selected: true });
    expect(res.status).toBe(200);
    expect(res.body.night_spot.is_selected).toBe(true);
  });
});
