import { Router } from 'express';
import { withFamily } from '../db';
import { requireAuth } from '../middleware/requireAuth';
import { buildTagPageEntry, buildOverviewPageEntry } from './template';
import { slugify, ensureUniqueSlug } from './slug';
import { withTripLock } from './lock';
import { readPagesJson, writePagesJson, ensureRepoCloned, pullRepo, commitAndPush, syncPagesJsonToStrato } from './toenhardt-repo';

const LIVE_BASE = process.env.TOENHARDT_LIVE_BASE ?? 'https://xn--tnhardt-90a.de';

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

async function allPublishedForTrip(familyId: string, tripId: string) {
  return await withFamily(familyId, async (c) => {
    const e = await c.query(
      `SELECT * FROM journal_entries WHERE trip_id = $1 AND is_published = true ORDER BY publish_seq`,
      [tripId]
    );
    for (const ent of e.rows) {
      const m = await c.query('SELECT * FROM media WHERE journal_entry_id = $1', [ent.id]);
      ent.media = m.rows;
    }
    return e.rows;
  });
}

async function assignSlugIfMissing(familyId: string, trip: any): Promise<string> {
  if (trip.slug) return trip.slug;
  return await withFamily(familyId, async (c) => {
    const all = await c.query('SELECT slug FROM trips WHERE slug IS NOT NULL');
    const existing = new Set<string>(all.rows.map((r: { slug: string }) => r.slug));
    const base = slugify(trip.title);
    const unique = await ensureUniqueSlug(base, existing);
    await c.query('UPDATE trips SET slug = $1 WHERE id = $2', [unique, trip.id]);
    return unique;
  });
}

async function assignPublishSeqIfMissing(familyId: string, tripId: string, entry: any): Promise<number> {
  if (entry.publish_seq) return entry.publish_seq;
  return await withFamily(familyId, async (c) => {
    const maxRes = await c.query(
      'SELECT COALESCE(MAX(publish_seq), 0) + 1 AS next FROM journal_entries WHERE trip_id = $1',
      [tripId]
    );
    const next = maxRes.rows[0].next;
    await c.query('UPDATE journal_entries SET publish_seq = $1 WHERE id = $2', [next, entry.id]);
    return next;
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

publishRouter.post('/journal/:entryId/publish', async (req, res) => {
  const { tripId, entryId } = req.params as Record<string, string>;
  try {
    await withTripLock(tripId, async () => {
      const { trip, entry } = await loadTripWithEntry(req.user.familyId, tripId, entryId);
      if (!trip || !entry) { res.status(404).json({ error: 'Not found' }); return; }

      const slug = await assignSlugIfMissing(req.user.familyId, trip);
      trip.slug = slug;
      const seq = await assignPublishSeqIfMissing(req.user.familyId, tripId, entry);
      entry.publish_seq = seq;

      await ensureRepoCloned();
      await pullRepo();
      const pages = await readPagesJson();

      const tagEntry = buildTagPageEntry(trip, entry);
      pages[tagEntry.key] = tagEntry.value as any;

      await withFamily(req.user.familyId, (c) =>
        c.query(
          'UPDATE journal_entries SET is_published = true, first_published_at = COALESCE(first_published_at, now()) WHERE id = $1',
          [entryId]
        )
      );

      const published = await allPublishedForTrip(req.user.familyId, tripId);
      const overview = buildOverviewPageEntry(trip, published);
      pages[overview.key] = overview.value as any;

      await writePagesJson(undefined, pages);
      await syncPagesJsonToStrato();
      await commitAndPush(`publish: ${tagEntry.key}`);

      const updated = await withFamily(req.user.familyId, (c) =>
        c.query('SELECT * FROM journal_entries WHERE id = $1', [entryId])
      );
      res.json({
        is_published: true,
        publish_seq: seq,
        first_published_at: updated.rows[0].first_published_at,
        url: `${LIVE_BASE}/#${tagEntry.key}`,
      });
    });
  } catch (err) {
    res.status(500).json({ error: 'Internal server error' });
  }
});

publishRouter.post('/journal/:entryId/unpublish', async (req, res) => {
  const { tripId, entryId } = req.params as Record<string, string>;
  try {
    await withTripLock(tripId, async () => {
      const { trip, entry } = await loadTripWithEntry(req.user.familyId, tripId, entryId);
      if (!trip || !entry) { res.status(404).json({ error: 'Not found' }); return; }
      if (!entry.is_published) {
        res.json({ is_published: false });
        return;
      }

      await ensureRepoCloned();
      await pullRepo();
      const pages = await readPagesJson();

      const key = `${trip.slug}/tag-${entry.publish_seq}`;
      delete pages[key];

      await withFamily(req.user.familyId, (c) =>
        c.query('UPDATE journal_entries SET is_published = false WHERE id = $1', [entryId])
      );

      const published = await allPublishedForTrip(req.user.familyId, tripId);
      const overview = buildOverviewPageEntry(trip, published);
      pages[overview.key] = overview.value as any;

      await writePagesJson(undefined, pages);
      await syncPagesJsonToStrato();
      await commitAndPush(`unpublish: ${key}`);

      res.json({ is_published: false });
    });
  } catch (err) {
    res.status(500).json({ error: 'Internal server error' });
  }
});

publishRouter.post('/publish-all', async (req, res) => {
  const { tripId } = req.params as Record<string, string>;
  try {
    await withTripLock(tripId, async () => {
      const trip = await loadTrip(req.user.familyId, tripId);
      if (!trip) { res.status(404).json({ error: 'Not found' }); return; }

      const slug = await assignSlugIfMissing(req.user.familyId, trip);
      trip.slug = slug;

      await ensureRepoCloned();
      await pullRepo();
      const pages = await readPagesJson();

      const published = await allPublishedForTrip(req.user.familyId, tripId);
      for (const e of published) {
        const te = buildTagPageEntry(trip, e);
        pages[te.key] = te.value as any;
      }
      const overview = buildOverviewPageEntry(trip, published);
      pages[overview.key] = overview.value as any;

      await writePagesJson(undefined, pages);
      await syncPagesJsonToStrato();
      await commitAndPush(`publish-all: ${trip.slug} (${published.length} tags)`);
      res.json({ republished: published.length, slug: trip.slug });
    });
  } catch (err) {
    console.error('[publish-all]', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

export { loadTrip, loadTripWithEntry };
