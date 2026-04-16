import { Router } from 'express';
import { withFamily } from '../db';
import { requireAuth } from '../middleware/requireAuth';

export const tripsRouter = Router();
tripsRouter.use(requireAuth);

tripsRouter.get('/', async (req, res) => {
  const trips = await withFamily(req.user.familyId, (c) =>
    c.query('SELECT * FROM trips ORDER BY start_date NULLS LAST')
  );
  res.json({ trips: trips.rows });
});

tripsRouter.post('/', async (req, res) => {
  const { title, description, start_date, end_date, vehicle_height, vehicle_length, vehicle_weight, vehicle_fuel } = req.body;
  if (!title) { res.status(400).json({ error: 'title required' }); return; }
  const r = await withFamily(req.user.familyId, (c) =>
    c.query(
      `INSERT INTO trips (family_id, title, description, start_date, end_date, vehicle_height, vehicle_length, vehicle_weight, vehicle_fuel, created_by)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10) RETURNING *`,
      [req.user.familyId, title, description, start_date, end_date, vehicle_height, vehicle_length, vehicle_weight, vehicle_fuel, req.user.userId]
    )
  );
  res.status(201).json({ trip: r.rows[0] });
});

tripsRouter.get('/:id', async (req, res) => {
  const r = await withFamily(req.user.familyId, (c) =>
    c.query('SELECT * FROM trips WHERE id = $1', [req.params.id])
  );
  if (!r.rows[0]) { res.status(404).json({ error: 'Not found' }); return; }
  res.json({ trip: r.rows[0] });
});

tripsRouter.put('/:id', async (req, res) => {
  const { title, description, start_date, end_date } = req.body;
  const r = await withFamily(req.user.familyId, (c) =>
    c.query(
      `UPDATE trips SET
        title = COALESCE($2, title),
        description = COALESCE($3, description),
        start_date = COALESCE($4::date, start_date),
        end_date = COALESCE($5::date, end_date)
       WHERE id = $1 RETURNING *`,
      [req.params.id, title, description, start_date, end_date]
    )
  );
  if (!r.rows[0]) { res.status(404).json({ error: 'Not found' }); return; }
  res.json({ trip: r.rows[0] });
});

tripsRouter.delete('/:id', async (req, res) => {
  await withFamily(req.user.familyId, (c) =>
    c.query('DELETE FROM trips WHERE id = $1', [req.params.id])
  );
  res.status(204).send();
});
