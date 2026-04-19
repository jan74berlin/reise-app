import { Router } from 'express';
import multer from 'multer';
import { withFamily } from '../db';
import { requireAuth } from '../middleware/requireAuth';
import { parseTimeline } from './parser';
import { splitByDay, type DaySegments } from './splitter';
import { renderRouteImage } from './map';
import { renderOverviewImage, type OverviewRoute } from './overview';
import { uploadRouteMap, uploadOverviewMap, deleteFromStrato } from '../strato';

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 50 * 1024 * 1024 }, // 50 MB
});

export const timelineRouter = Router({ mergeParams: true });
timelineRouter.use(requireAuth);

async function loadTrip(familyId: string, tripId: string) {
  return await withFamily(familyId, async (c) => {
    const t = await c.query('SELECT * FROM trips WHERE id = $1', [tripId]);
    return t.rows[0] ?? null;
  });
}

async function loadExistingRouteMaps(familyId: string, tripId: string): Promise<Map<string, string>> {
  return await withFamily(familyId, async (c) => {
    const r = await c.query(
      `SELECT date, route_image_url FROM journal_entries
       WHERE trip_id = $1 AND date IS NOT NULL AND route_image_url IS NOT NULL`,
      [tripId]
    );
    const m = new Map<string, string>();
    for (const row of r.rows) m.set(row.date, row.route_image_url);
    return m;
  });
}

function dayToPreview(day: DaySegments, hasExisting: boolean) {
  return {
    date: day.date,
    distance_km: Math.round(day.distanceMeters / 100) / 10,
    walking_km: Math.round(day.walkingMeters / 100) / 10,
    duration_minutes: day.durationMinutes,
    modes: [...day.modes],
    has_motorized: day.hasMotorized,
    segment_count: day.segmentCount,
    has_existing_route_image: hasExisting,
  };
}

async function findOrCreateEntryForDate(
  familyId: string, tripId: string, date: string, autoCreate: boolean,
): Promise<{ id: string; created: boolean } | null> {
  return await withFamily(familyId, async (c) => {
    const ex = await c.query(
      'SELECT id FROM journal_entries WHERE trip_id = $1 AND date = $2 ORDER BY created_at LIMIT 1',
      [tripId, date]
    );
    if (ex.rows[0]) return { id: ex.rows[0].id, created: false };
    if (!autoCreate) return null;
    const ins = await c.query(
      `INSERT INTO journal_entries (trip_id, date, blocks, source) VALUES ($1, $2, '[]'::jsonb, 'timeline-import') RETURNING id`,
      [tripId, date]
    );
    return { id: ins.rows[0].id, created: true };
  });
}

async function regenerateOverview(familyId: string, tripId: string, tripTitle: string) {
  const rows = await withFamily(familyId, (c) =>
    c.query(
      `SELECT date, route_meta FROM journal_entries
       WHERE trip_id = $1 AND route_image_url IS NOT NULL AND route_meta IS NOT NULL
       ORDER BY date`,
      [tripId]
    )
  );
  const routes: OverviewRoute[] = rows.rows
    .filter((r: any) => Array.isArray(r.route_meta?.points) && r.route_meta.points.length >= 2)
    .map((r: any) => ({
      date: r.date,
      points: r.route_meta.points,
      distanceKm: r.route_meta.distance_km ?? 0,
    }));
  if (!routes.length) return null;

  const buf = await renderOverviewImage(tripTitle, routes);
  const { url, filePath } = await uploadOverviewMap(tripId, buf);
  await withFamily(familyId, (c) =>
    c.query(
      'UPDATE trips SET route_overview_url = $1, route_overview_path = $2, route_overview_updated_at = now() WHERE id = $3',
      [url, filePath, tripId]
    )
  );
  return url;
}

timelineRouter.post('/preview', upload.single('file'), async (req, res) => {
  const { tripId } = req.params as Record<string, string>;
  if (!req.file) { res.status(400).json({ error: 'Datei fehlt (Feld: file)' }); return; }
  try {
    const trip = await loadTrip(req.user.familyId, tripId);
    if (!trip) { res.status(404).json({ error: 'Trip nicht gefunden' }); return; }
    if (!trip.start_date || !trip.end_date) {
      res.status(422).json({ error: 'Reise braucht Start- und Enddatum für Timeline-Import' });
      return;
    }

    let data: any;
    try { data = JSON.parse(req.file.buffer.toString('utf8')); }
    catch { res.status(400).json({ error: 'Datei ist kein gültiges JSON' }); return; }

    let segments;
    try { segments = parseTimeline(data); }
    catch (e) { res.status(400).json({ error: (e as Error).message }); return; }

    const days = splitByDay(segments, trip.start_date, trip.end_date);
    const existing = await loadExistingRouteMaps(req.user.familyId, tripId);
    const dayList = [...days.values()]
      .sort((a, b) => a.date.localeCompare(b.date))
      .map(d => dayToPreview(d, existing.has(d.date)));

    const allDates = new Set(segments.map(s => s.start.toISOString().slice(0, 10)));
    const skipped = [...allDates].filter(d => d < trip.start_date! || d > trip.end_date!).sort();

    res.json({
      trip_id: tripId,
      trip_start: trip.start_date,
      trip_end: trip.end_date,
      days: dayList,
      skipped_outside_range: skipped,
    });
  } catch (err) {
    console.error('[timeline/preview]', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

timelineRouter.post('/import', upload.single('file'), async (req, res) => {
  const { tripId } = req.params as Record<string, string>;
  if (!req.file) { res.status(400).json({ error: 'Datei fehlt (Feld: file)' }); return; }
  try {
    const trip = await loadTrip(req.user.familyId, tripId);
    if (!trip || !trip.start_date || !trip.end_date) { res.status(422).json({ error: 'Reise braucht Datumsbereich' }); return; }

    const data = JSON.parse(req.file.buffer.toString('utf8'));
    const segments = parseTimeline(data);
    const days = splitByDay(segments, trip.start_date, trip.end_date);

    const daysToProcess: string[] = JSON.parse(req.body.days_to_process ?? '[]');
    const overwrite: Record<string, boolean> = JSON.parse(req.body.overwrite ?? '{}');
    const autoCreate = req.body.auto_create !== 'false';
    const existing = await loadExistingRouteMaps(req.user.familyId, tripId);

    const processed: any[] = [];
    const skipped: any[] = [];
    const errors: any[] = [];

    for (const date of daysToProcess) {
      const day = days.get(date);
      if (!day) { skipped.push({ date, reason: 'no-data' }); continue; }
      if (!day.hasMotorized || day.points.length < 2) {
        skipped.push({ date, reason: 'standtag' }); continue;
      }
      if (existing.has(date) && !overwrite[date]) {
        skipped.push({ date, reason: 'exists' }); continue;
      }

      try {
        const entryRef = await findOrCreateEntryForDate(req.user.familyId, tripId, date, autoCreate);
        if (!entryRef) { skipped.push({ date, reason: 'no-entry-and-no-autocreate' }); continue; }

        const png = await renderRouteImage(day);
        const oldPath = await withFamily(req.user.familyId, async (c) => {
          const r = await c.query('SELECT route_image_path FROM journal_entries WHERE id = $1', [entryRef.id]);
          return r.rows[0]?.route_image_path ?? null;
        });
        if (oldPath) { try { await deleteFromStrato(oldPath); } catch {} }

        const { url, filePath } = await uploadRouteMap(tripId, date, png);
        const meta = {
          distance_km: Math.round(day.distanceMeters / 100) / 10,
          walking_km: Math.round(day.walkingMeters / 100) / 10,
          duration_minutes: day.durationMinutes,
          modes: [...day.modes],
          segment_count: day.segmentCount,
          source: 'google-timeline',
          imported_at: new Date().toISOString(),
          points: day.points,
        };
        await withFamily(req.user.familyId, (c) =>
          c.query(
            'UPDATE journal_entries SET route_image_url = $1, route_image_path = $2, route_meta = $3 WHERE id = $4',
            [url, filePath, JSON.stringify(meta), entryRef.id]
          )
        );

        processed.push({ date, journal_entry_id: entryRef.id, route_image_url: url, created: entryRef.created, meta });
      } catch (e) {
        errors.push({ date, error: (e as Error).message });
      }
    }

    let overviewUrl: string | null = null;
    if (processed.length) {
      try { overviewUrl = await regenerateOverview(req.user.familyId, tripId, trip.title); }
      catch (e) { errors.push({ overview: (e as Error).message }); }
    }

    res.json({ processed, skipped, errors, overview_url: overviewUrl });
  } catch (err) {
    console.error('[timeline/import]', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});
