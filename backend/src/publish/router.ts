import { Router } from 'express';
import { withFamily } from '../db';
import { requireAuth } from '../middleware/requireAuth';
import { buildTagPageEntry } from './template';
import { slugify, ensureUniqueSlug } from './slug';
import { withTripLock } from './lock';

export const publishRouter = Router({ mergeParams: true });
publishRouter.use(requireAuth);

async function loadTrip(familyId: string, tripId: string) {
  return await withFamily(familyId, async (c) => {
    const t = await c.query('SELECT * FROM trips WHERE id = $1', [tripId]);
    return t.rows[0] ?? null;
  });
}

async function loadTripWithEntry(familyId: string, tripId: string, entryId: string) {
  return await withFamily(familyId, async (c) => {
    const t = await c.query('SELECT * FROM trips WHERE id = $1', [tripId]);
    if (!t.rows[0]) return { trip: null, entry: null };
    const e = await c.query('SELECT * FROM journal_entries WHERE id = $1 AND trip_id = $2', [entryId, tripId]);
    if (!e.rows[0]) return { trip: t.rows[0], entry: null };
    const m = await c.query('SELECT * FROM media WHERE journal_entry_id = $1', [entryId]);
    e.rows[0].media = m.rows;
    return { trip: t.rows[0], entry: e.rows[0] };
  });
}

publishRouter.get('/journal/:entryId/preview', async (req, res) => {
  const { tripId, entryId } = req.params as Record<string, string>;
  try {
    const { trip, entry } = await loadTripWithEntry(req.user.familyId, tripId, entryId);
    if (!trip || !entry) { res.status(404).json({ error: 'Not found' }); return; }
    // For preview, fabricate a slug + seq if not set, so that render works
    const previewTrip = { ...trip, slug: trip.slug ?? slugify(trip.title) };
    const previewEntry = { ...entry, publish_seq: entry.publish_seq ?? 1 };
    const { value } = buildTagPageEntry(previewTrip, previewEntry);
    res.json({ preview: value });
  } catch (err) {
    res.status(500).json({ error: 'Internal server error' });
  }
});

export { loadTrip, loadTripWithEntry };
