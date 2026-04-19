import { Router } from 'express';
import multer from 'multer';
import { withFamily } from '../db';
import { requireAuth } from '../middleware/requireAuth';
import { parseTimeline } from './parser';
import { splitByDay, type DaySegments } from './splitter';

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
