import { Router } from 'express';
import { withFamily } from '../db';
import { requireAuth } from '../middleware/requireAuth';

export const nightsRouter = Router({ mergeParams: true });
nightsRouter.use(requireAuth);

nightsRouter.get('/', async (req, res) => {
  const params = req.params as Record<string, string>;
  const r = await withFamily(req.user.familyId, async (c) => {
    const nights = await c.query(
      'SELECT * FROM nights WHERE trip_id = $1 ORDER BY night_number',
      [params.tripId]
    );
    for (const night of nights.rows) {
      const spots = await c.query(
        `SELECT ns.id as night_spot_id, ns.role, ns.is_selected, ns.notes,
                s.pn_id, s.lat, s.lng, s.title, s.type_code, s.rating, s.reviews
         FROM night_spots ns JOIN spots s ON s.id = ns.spot_id
         WHERE ns.night_id = $1 ORDER BY ns.role`,
        [night.id]
      );
      night.spots = spots.rows;
    }
    return nights;
  });
  res.json({ nights: r.rows });
});

nightsRouter.post('/', async (req, res) => {
  const params = req.params as Record<string, string>;
  const { night_number, date, lat_center, lng_center, notes } = req.body;
  const r = await withFamily(req.user.familyId, (c) =>
    c.query(
      'INSERT INTO nights (trip_id, night_number, date, lat_center, lng_center, notes) VALUES ($1,$2,$3,$4,$5,$6) RETURNING *',
      [params.tripId, night_number, date, lat_center, lng_center, notes]
    )
  );
  res.status(201).json({ night: r.rows[0] });
});

nightsRouter.post('/:nightNumber/spots', async (req, res) => {
  const params = req.params as Record<string, string>;
  const { pn_id, lat, lng, title, type_code, rating, reviews, description, role } = req.body;
  const r = await withFamily(req.user.familyId, async (c) => {
    const spotResult = await c.query(
      `INSERT INTO spots (pn_id, lat, lng, title, type_code, rating, reviews, description, cached_at)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8, now())
       ON CONFLICT (pn_id) DO UPDATE SET lat=$2, lng=$3, title=$4, rating=$6, cached_at=now()
       RETURNING *`,
      [pn_id ?? null, lat, lng, title, type_code, rating ?? null, reviews ?? null, description ?? null]
    );
    const spot = spotResult.rows[0];
    const night = await c.query(
      'SELECT id FROM nights WHERE trip_id=$1 AND night_number=$2',
      [params.tripId, params.nightNumber]
    );
    if (!night.rows[0]) throw Object.assign(new Error('Night not found'), { status: 404 });
    const ns = await c.query(
      'INSERT INTO night_spots (night_id, spot_id, role) VALUES ($1,$2,$3) RETURNING *',
      [night.rows[0].id, spot.id, role]
    );
    return ns;
  });
  res.status(201).json({ night_spot: r.rows[0] });
});

nightsRouter.put('/:nightNumber/spots/:nightSpotId', async (req, res) => {
  const { is_selected, notes, role } = req.body;
  const r = await withFamily(req.user.familyId, (c) =>
    c.query(
      `UPDATE night_spots SET
        is_selected = COALESCE($2, is_selected),
        notes = COALESCE($3, notes),
        role = COALESCE($4, role)
       WHERE id = $1 RETURNING *`,
      [req.params.nightSpotId, is_selected ?? null, notes ?? null, role ?? null]
    )
  );
  res.json({ night_spot: r.rows[0] });
});
