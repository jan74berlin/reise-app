import { Router } from 'express';
import { withFamily } from '../db';
import { requireAuth } from '../middleware/requireAuth';

export const checklistRouter = Router({ mergeParams: true });
checklistRouter.use(requireAuth);

checklistRouter.get('/', async (req, res) => {
  const { tripId } = req.params as Record<string, string>;
  const r = await withFamily(req.user.familyId, (c) =>
    c.query('SELECT * FROM checklist_items WHERE trip_id = $1 ORDER BY id', [tripId])
  );
  res.json({ items: r.rows });
});

checklistRouter.post('/', async (req, res) => {
  const { tripId } = req.params as Record<string, string>;
  const { category, text } = req.body;
  if (!text) { res.status(400).json({ error: 'text required' }); return; }
  const r = await withFamily(req.user.familyId, (c) =>
    c.query(
      'INSERT INTO checklist_items (trip_id, category, text) VALUES ($1,$2,$3) RETURNING *',
      [tripId, category ?? null, text]
    )
  );
  res.status(201).json({ item: r.rows[0] });
});

checklistRouter.put('/:itemId', async (req, res) => {
  const { is_checked, text, category } = req.body;
  const r = await withFamily(req.user.familyId, async (c) => {
    if (is_checked !== undefined) {
      return c.query(
        `UPDATE checklist_items SET
           is_checked = $2,
           checked_by = CASE WHEN $2 THEN $3 ELSE NULL END,
           checked_at = CASE WHEN $2 THEN now() ELSE NULL END
         WHERE id = $1 RETURNING *`,
        [req.params.itemId, is_checked, req.user.userId]
      );
    }
    return c.query(
      `UPDATE checklist_items SET
         text = COALESCE($2, text),
         category = COALESCE($3, category)
       WHERE id = $1 RETURNING *`,
      [req.params.itemId, text ?? null, category ?? null]
    );
  });
  if (!r.rows[0]) { res.status(404).json({ error: 'Not found' }); return; }
  res.json({ item: r.rows[0] });
});

checklistRouter.delete('/:itemId', async (req, res) => {
  await withFamily(req.user.familyId, (c) =>
    c.query('DELETE FROM checklist_items WHERE id = $1', [req.params.itemId])
  );
  res.status(204).send();
});
