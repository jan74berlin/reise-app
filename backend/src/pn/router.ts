import { Router } from 'express';
import { pool } from '../db';

export const pnRouter = Router();

const CACHE_TTL_HOURS = parseInt(process.env.PN_CACHE_TTL_HOURS ?? '168');
const PN_BASE = 'https://park4night.com';
const DEFAULT_FILTER = JSON.stringify({
  type: ['PN', 'APN', 'ACC_G'],
  services: [], activities: [],
  maxHeight: '0', all_year: '0',
  booking_filter: '0', custom_type: [],
});

async function fetchPN(url: string): Promise<unknown> {
  const res = await fetch(url, {
    headers: {
      'Accept': 'application/json',
      'User-Agent': 'Mozilla/5.0 (compatible; reise-app/1.0)',
      'Referer': 'https://park4night.com/',
    },
  });
  if (!res.ok) throw new Error(`park4night HTTP ${res.status}`);
  const text = await res.text();
  // Try plain JSON first, fall back to base64
  try {
    return JSON.parse(text);
  } catch {
    return JSON.parse(Buffer.from(text, 'base64').toString('utf-8'));
  }
}

pnRouter.get('/around', async (req, res) => {
  const { lat, lng, radius = '50', filter } = req.query as Record<string, string>;
  if (!lat || !lng) { res.status(400).json({ error: 'lat and lng required' }); return; }

  const filterParam = filter ?? DEFAULT_FILTER;
  const url = `${PN_BASE}/api/places/around?lat=${lat}&lng=${lng}&radius=${radius}&filter=${encodeURIComponent(filterParam)}&lang=en`;

  try {
    const data = await fetchPN(url) as Array<Record<string, unknown>>;
    // Cache im Hintergrund (fire & forget)
    const cacheExpiry = new Date(Date.now() - CACHE_TTL_HOURS * 3600000);
    for (const place of data) {
      const pnId = place['id'] as number;
      if (!pnId) continue;
      const existing = await pool.query('SELECT cached_at FROM spots WHERE pn_id = $1', [pnId]);
      if (!existing.rows[0] || existing.rows[0].cached_at < cacheExpiry) {
        await pool.query(
          `INSERT INTO spots (pn_id, lat, lng, title, type_code, rating, reviews, cached_at)
           VALUES ($1,$2,$3,$4,$5,$6,$7, now())
           ON CONFLICT (pn_id) DO UPDATE SET lat=$2, lng=$3, title=$4, rating=$6, reviews=$7, cached_at=now()`,
          [pnId, place['lat'], place['lng'], place['title_short'],
           (place['type'] as Record<string,string>)?.['code'],
           place['rating'], place['review']]
        );
      }
    }
    res.json({ spots: data });
  } catch (err) {
    console.error('park4night error:', err);
    res.status(502).json({ error: 'park4night unavailable' });
  }
});

pnRouter.get('/:id', async (req, res) => {
  const pnId = parseInt(req.params.id);
  const cacheExpiry = new Date(Date.now() - CACHE_TTL_HOURS * 3600000);
  const cached = await pool.query('SELECT * FROM spots WHERE pn_id = $1', [pnId]);

  if (cached.rows[0] && cached.rows[0].cached_at > cacheExpiry) {
    res.json({ spot: cached.rows[0], source: 'cache' });
    return;
  }

  try {
    const data = await fetchPN(`${PN_BASE}/api/places/${pnId}`) as Record<string, unknown>;
    res.json({ spot: data, source: 'live' });
  } catch {
    if (cached.rows[0]) {
      res.json({ spot: cached.rows[0], source: 'stale_cache' });
    } else {
      res.status(404).json({ error: 'Spot not found' });
    }
  }
});
