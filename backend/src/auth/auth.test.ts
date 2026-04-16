import { describe, it, expect, beforeAll } from 'vitest';
import request from 'supertest';
import { app } from '../index';
import { pool } from '../db';

beforeAll(async () => {
  // Delete trips first (created_by FK blocks user deletion), then families cascade users
  await pool.query("DELETE FROM trips WHERE created_by IN (SELECT id FROM users WHERE email LIKE '%@test-reise.de')");
  await pool.query("DELETE FROM families WHERE name IN ('Testfamilie','Testfamilie2','Familie2','TripTestFam','NightTestFam')");
  await pool.query("DELETE FROM users WHERE email LIKE '%@test-reise.de'");
});

describe('POST /api/v1/auth/register', () => {
  it('creates a family and owner user, returns token', async () => {
    const res = await request(app)
      .post('/api/v1/auth/register')
      .send({ email: 'jan@test-reise.de', password: 'sicher123', display_name: 'Jan', family_name: 'Testfamilie' });
    expect(res.status).toBe(201);
    expect(res.body.token).toBeDefined();
    expect(res.body.family.invite_code).toHaveLength(8);
  });

  it('rejects duplicate email', async () => {
    const res = await request(app)
      .post('/api/v1/auth/register')
      .send({ email: 'jan@test-reise.de', password: 'sicher123', display_name: 'Jan', family_name: 'Testfamilie2' });
    expect(res.status).toBe(409);
  });
});

describe('POST /api/v1/auth/login', () => {
  it('returns token for valid credentials', async () => {
    const res = await request(app)
      .post('/api/v1/auth/login')
      .send({ email: 'jan@test-reise.de', password: 'sicher123' });
    expect(res.status).toBe(200);
    expect(res.body.token).toBeDefined();
  });

  it('rejects wrong password', async () => {
    const res = await request(app)
      .post('/api/v1/auth/login')
      .send({ email: 'jan@test-reise.de', password: 'falsch' });
    expect(res.status).toBe(401);
  });
});

describe('POST /api/v1/auth/join', () => {
  it('joins a family via invite code', async () => {
    const reg = await request(app)
      .post('/api/v1/auth/register')
      .send({ email: 'owner2@test-reise.de', password: 'pw', display_name: 'Owner', family_name: 'Familie2' });
    const { invite_code } = reg.body.family;
    const res = await request(app)
      .post('/api/v1/auth/join')
      .send({ invite_code, email: 'member@test-reise.de', password: 'pw', display_name: 'Alicja' });
    expect(res.status).toBe(201);
    expect(res.body.token).toBeDefined();
  });
});

describe('GET /api/v1/auth/me', () => {
  it('returns user data for valid token', async () => {
    const login = await request(app)
      .post('/api/v1/auth/login')
      .send({ email: 'jan@test-reise.de', password: 'sicher123' });
    const res = await request(app)
      .get('/api/v1/auth/me')
      .set('Authorization', `Bearer ${login.body.token}`);
    expect(res.status).toBe(200);
    expect(res.body.user.email).toBe('jan@test-reise.de');
  });
});
