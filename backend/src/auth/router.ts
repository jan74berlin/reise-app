import { Router } from 'express';
import bcrypt from 'bcrypt';
import { pool } from '../db';
import { signToken } from '../jwt';
import { requireAuth } from '../middleware/requireAuth';

export const authRouter = Router();

function randomInviteCode(): string {
  return Math.random().toString(36).slice(2, 10).toUpperCase();
}

authRouter.post('/register', async (req, res) => {
  const { email, password, display_name, family_name } = req.body;
  if (!email || !password || !display_name || !family_name) {
    res.status(400).json({ error: 'Missing fields' });
    return;
  }
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const existing = await client.query('SELECT id FROM users WHERE email = $1', [email]);
    if (existing.rows.length > 0) {
      await client.query('ROLLBACK');
      res.status(409).json({ error: 'Email already registered' });
      return;
    }
    const invite_code = randomInviteCode();
    const fam = await client.query(
      'INSERT INTO families (name, invite_code) VALUES ($1, $2) RETURNING *',
      [family_name, invite_code]
    );
    const family = fam.rows[0];
    const hash = await bcrypt.hash(password, 10);
    const u = await client.query(
      'INSERT INTO users (family_id, email, password_hash, display_name, role) VALUES ($1,$2,$3,$4,$5) RETURNING id, email, display_name, role',
      [family.id, email, hash, display_name, 'owner']
    );
    const user = u.rows[0];
    await client.query('COMMIT');
    const token = signToken({ userId: user.id, familyId: family.id, email: user.email, role: 'owner' });
    res.status(201).json({ token, user, family: { id: family.id, name: family.name, invite_code: family.invite_code } });
  } catch (err) {
    await client.query('ROLLBACK');
    console.error(err);
    res.status(500).json({ error: 'Internal error' });
  } finally {
    client.release();
  }
});

authRouter.post('/login', async (req, res) => {
  const { email, password } = req.body;
  const r = await pool.query(
    'SELECT u.*, f.invite_code FROM users u JOIN families f ON f.id = u.family_id WHERE u.email = $1',
    [email]
  );
  const user = r.rows[0];
  if (!user || !(await bcrypt.compare(password, user.password_hash))) {
    res.status(401).json({ error: 'Invalid credentials' });
    return;
  }
  const token = signToken({ userId: user.id, familyId: user.family_id, email: user.email, role: user.role });
  res.json({ token, user: { id: user.id, email: user.email, display_name: user.display_name, role: user.role } });
});

authRouter.post('/join', async (req, res) => {
  const { invite_code, email, password, display_name } = req.body;
  const fam = await pool.query('SELECT * FROM families WHERE invite_code = $1', [invite_code]);
  if (fam.rows.length === 0) {
    res.status(404).json({ error: 'Invalid invite code' });
    return;
  }
  const family = fam.rows[0];
  const existing = await pool.query('SELECT id FROM users WHERE email = $1', [email]);
  if (existing.rows.length > 0) {
    res.status(409).json({ error: 'Email already registered' });
    return;
  }
  const hash = await bcrypt.hash(password, 10);
  const u = await pool.query(
    'INSERT INTO users (family_id, email, password_hash, display_name, role) VALUES ($1,$2,$3,$4,$5) RETURNING id, email, display_name, role',
    [family.id, email, hash, display_name, 'member']
  );
  const token = signToken({ userId: u.rows[0].id, familyId: family.id, email: u.rows[0].email, role: 'member' });
  res.status(201).json({ token, user: u.rows[0] });
});

authRouter.get('/me', requireAuth, async (req, res) => {
  const r = await pool.query(
    'SELECT id, email, display_name, role, family_id FROM users WHERE id = $1',
    [req.user.userId]
  );
  res.json({ user: r.rows[0] });
});
