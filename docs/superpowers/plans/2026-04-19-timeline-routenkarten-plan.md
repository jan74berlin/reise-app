# Sub-Projekt 4 Implementation Plan: Google-Maps-Timeline-Import → Tagesrouten

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Timeline-JSON-Upload pro Reise → Backend splittet nach Tagen, generiert OpenTopoMap-Routen-PNG pro Tag + inkrementelle Trip-Übersichtskarte, integriert in PWA + Publish-Pipeline.

**Architecture:** Backend-Modul `timeline/` (parser/splitter/tile-cache/map/overview/router) rendert PNGs via npm `staticmaps` + lokaler OpenTopoMap-Tile-Cache. DB Migration 007 ergänzt `journal_entries.route_image_url/route_meta` + `trips.route_overview_url`. PWA bekommt `TimelineImportModal` mit File-Upload + Vorschau + Import-Flow. Publish-Pipeline (Sub-Projekt 3) regeneriert Übersichtskarte bei jedem publish/unpublish.

**Tech Stack:** Node.js/TypeScript, Express, PostgreSQL, npm `staticmaps`, npm `sharp` (bereits via staticmaps transitiv), npm `multer` (für File-Upload, bereits Dep), React/TypeScript (PWA), Vitest (Tests).

**Spec:** `docs/superpowers/specs/2026-04-19-timeline-routenkarten-design.md` (Commits `ae1ff7c`, `e68b022`)

---

## Datei-Struktur

**Neu (Backend):**
- `backend/migrations/007_route_metadata.sql`
- `backend/src/timeline/parser.ts` + `parser.test.ts`
- `backend/src/timeline/splitter.ts` + `splitter.test.ts`
- `backend/src/timeline/tile-cache.ts` + `tile-cache.test.ts`
- `backend/src/timeline/map.ts` + `map.test.ts`
- `backend/src/timeline/overview.ts` + `overview.test.ts`
- `backend/src/timeline/router.ts` + `router.test.ts`
- `backend/src/timeline/__fixtures__/timeline-new.json`
- `backend/src/timeline/__fixtures__/timeline-legacy.json`

**Modifiziert (Backend):**
- `backend/package.json` — Dep `staticmaps@^1.13`
- `backend/src/index.ts` — mount timelineRouter
- `backend/src/strato.ts` — neue Helper `uploadRouteMap` + `uploadOverviewMap`
- `backend/src/publish/template.ts` — `buildTagPageEntry` injiziert routeMap als i0; `buildOverviewPageEntry` setzt `routeGif` aus `trip.route_overview_url`
- `backend/src/publish/router.ts` — nach Publish/Unpublish: Übersichtskarte neu rendern + uploaden + DB-Update
- `backend/src/publish/template.test.ts` — neue Tests
- `backend/.env.example` — OPENTOPOMAP_TILE_CACHE, _TTL_DAYS

**Neu (PWA):**
- `pwa/src/api/timeline.ts`
- `pwa/src/components/TimelineImportModal.tsx`

**Modifiziert (PWA):**
- `pwa/src/types.ts` — JournalEntry.route_image_url + route_meta, Trip.route_overview_url
- `pwa/src/pages/TripPage.tsx` — Button + Modal-Trigger
- `pwa/src/pages/JournalEntryPage.tsx` — Routen-Header oben

---

## Task 1: Migration 007 — DB Schema

**Files:**
- Create: `backend/migrations/007_route_metadata.sql`

- [ ] **Step 1: Migration anlegen**

```sql
ALTER TABLE journal_entries ADD COLUMN route_image_url TEXT;
ALTER TABLE journal_entries ADD COLUMN route_image_path TEXT;
ALTER TABLE journal_entries ADD COLUMN route_meta JSONB;

ALTER TABLE trips ADD COLUMN route_overview_url TEXT;
ALTER TABLE trips ADD COLUMN route_overview_path TEXT;
ALTER TABLE trips ADD COLUMN route_overview_updated_at TIMESTAMPTZ;
```

- [ ] **Step 2: Lokal anwenden + verifizieren**

Run: `psql -U reise -d reise -f backend/migrations/007_route_metadata.sql`

Run: `psql -U reise -d reise -c "\d journal_entries" | grep route_`

Expected: 3 Zeilen `route_image_url`, `route_image_path`, `route_meta`

Run: `psql -U reise -d reise -c "\d trips" | grep route_`

Expected: 3 Zeilen `route_overview_url`, `route_overview_path`, `route_overview_updated_at`

- [ ] **Step 3: Commit**

```bash
git add backend/migrations/007_route_metadata.sql
git commit -m "feat(db): migration 007 route metadata for timeline import"
```

---

## Task 2: Backend Dependencies

**Files:**
- Modify: `backend/package.json`

- [ ] **Step 1: Dependency installieren**

Run: `cd backend && npm install staticmaps@^1.13`

Erwartet: `staticmaps` als Dep, `sharp` als transitive Dep (bereits via staticmaps).

- [ ] **Step 2: Verifizieren dass Build noch grün ist**

Run: `cd backend && npm run build`

Expected: keine Fehler.

- [ ] **Step 3: Commit**

```bash
git add backend/package.json backend/package-lock.json
git commit -m "feat(backend): add staticmaps dep for timeline route rendering"
```

---

## Task 3: Timeline-Fixtures anlegen

**Files:**
- Create: `backend/src/timeline/__fixtures__/timeline-new.json`
- Create: `backend/src/timeline/__fixtures__/timeline-legacy.json`

- [ ] **Step 1: Neues Format Fixture (semanticSegments)**

```json
{
  "semanticSegments": [
    {
      "startTime": "2025-07-19T08:00:00.000+02:00",
      "endTime": "2025-07-19T11:00:00.000+02:00",
      "startTimeTimezoneUtcOffsetMinutes": 120,
      "endTimeTimezoneUtcOffsetMinutes": 120,
      "timelinePath": [
        { "point": "52.6803°, 13.2900°", "time": "2025-07-19T08:13:00.000+02:00" },
        { "point": "52.5200°, 13.4050°", "time": "2025-07-19T09:00:00.000+02:00" },
        { "point": "52.2200°, 11.6300°", "time": "2025-07-19T10:00:00.000+02:00" },
        { "point": "52.0000±, 8.5000°", "time": "2025-07-19T11:00:00.000+02:00" }
      ]
    },
    {
      "startTime": "2025-07-19T08:00:00.000+02:00",
      "endTime": "2025-07-19T11:30:00.000+02:00",
      "activity": {
        "topCandidate": { "type": "IN_PASSENGER_VEHICLE" },
        "distanceMeters": 350000
      }
    },
    {
      "startTime": "2025-07-19T18:00:00.000+02:00",
      "endTime": "2025-07-19T19:00:00.000+02:00",
      "activity": {
        "topCandidate": { "type": "WALKING" },
        "distanceMeters": 4500
      }
    },
    {
      "startTime": "2025-07-20T09:00:00.000+02:00",
      "endTime": "2025-07-20T12:00:00.000+02:00",
      "timelinePath": [
        { "point": "52.0000°, 8.5000°", "time": "2025-07-20T09:00:00.000+02:00" },
        { "point": "51.5000°, 7.5000°", "time": "2025-07-20T10:00:00.000+02:00" },
        { "point": "51.4000°, 6.6000°", "time": "2025-07-20T11:30:00.000+02:00" }
      ]
    },
    {
      "startTime": "2025-07-20T09:00:00.000+02:00",
      "endTime": "2025-07-20T12:00:00.000+02:00",
      "activity": {
        "topCandidate": { "type": "IN_PASSENGER_VEHICLE" },
        "distanceMeters": 245000
      }
    },
    {
      "startTime": "2025-06-15T10:00:00.000+02:00",
      "endTime": "2025-06-15T11:00:00.000+02:00",
      "activity": {
        "topCandidate": { "type": "IN_PASSENGER_VEHICLE" },
        "distanceMeters": 50000
      }
    }
  ]
}
```

(Letzter Eintrag liegt bewusst _vor_ dem Trip-Range, um Filter-Verhalten zu testen. Punkt-Zeichen-Tippfehler `±` ist beabsichtigt — Parser muss tolerant sein UND/oder ungültige Punkte überspringen.)

- [ ] **Step 2: Legacy-Format Fixture (timelineObjects)**

```json
{
  "timelineObjects": [
    {
      "activitySegment": {
        "startLocation": { "latitudeE7": 526803000, "longitudeE7": 132900000 },
        "endLocation": { "latitudeE7": 520000000, "longitudeE7": 85000000 },
        "duration": {
          "startTimestamp": "2025-07-19T08:00:00.000Z",
          "endTimestamp": "2025-07-19T11:30:00.000Z"
        },
        "distance": 350000,
        "activityType": "IN_PASSENGER_VEHICLE",
        "waypointPath": {
          "waypoints": [
            { "latE7": 526803000, "lngE7": 132900000 },
            { "latE7": 525200000, "lngE7": 134050000 },
            { "latE7": 522200000, "lngE7": 116300000 },
            { "latE7": 520000000, "lngE7": 85000000 }
          ]
        }
      }
    },
    {
      "placeVisit": {
        "location": { "latitudeE7": 520000000, "longitudeE7": 85000000 },
        "duration": {
          "startTimestamp": "2025-07-19T11:30:00.000Z",
          "endTimestamp": "2025-07-19T18:00:00.000Z"
        }
      }
    }
  ]
}
```

- [ ] **Step 3: Commit**

```bash
git add backend/src/timeline/__fixtures__/
git commit -m "test(timeline): add fixtures for new + legacy timeline format"
```

---

## Task 4: Parser Module + Tests

**Files:**
- Create: `backend/src/timeline/parser.ts`
- Create: `backend/src/timeline/parser.test.ts`

- [ ] **Step 1: Test schreiben — neues Format**

```typescript
// backend/src/timeline/parser.test.ts
import { describe, it, expect } from 'vitest';
import fs from 'fs';
import path from 'path';
import { parseTimeline, type ParsedSegment } from './parser';

const NEW = JSON.parse(fs.readFileSync(path.join(__dirname, '__fixtures__/timeline-new.json'), 'utf8'));
const LEGACY = JSON.parse(fs.readFileSync(path.join(__dirname, '__fixtures__/timeline-legacy.json'), 'utf8'));

describe('parseTimeline', () => {
  it('parses new semanticSegments format', () => {
    const segs = parseTimeline(NEW);
    expect(segs.length).toBeGreaterThan(0);
    const path1 = segs.find(s => s.kind === 'path' && s.start.toISOString().startsWith('2025-07-19T06:00'));
    expect(path1?.points.length).toBe(3); // ± wurde übersprungen
    expect(path1?.points[0].lat).toBeCloseTo(52.68, 1);

    const act = segs.find(s => s.kind === 'activity' && s.mode === 'driving');
    expect(act?.distanceMeters).toBe(350000);

    const walk = segs.find(s => s.mode === 'walking');
    expect(walk).toBeDefined();
  });

  it('parses legacy timelineObjects format', () => {
    const segs = parseTimeline(LEGACY);
    const act = segs.find(s => s.kind === 'activity');
    expect(act?.mode).toBe('driving');
    expect(act?.distanceMeters).toBe(350000);
    expect(act?.points?.length).toBe(4);
  });

  it('rejects unknown format', () => {
    expect(() => parseTimeline({ random: 'data' })).toThrow(/format/i);
  });

  it('skips malformed point strings without throwing', () => {
    const data = {
      semanticSegments: [{
        startTime: '2025-07-19T08:00:00.000Z',
        endTime: '2025-07-19T11:00:00.000Z',
        timelinePath: [
          { point: '52.5°, 13.4°', time: '2025-07-19T08:00:00.000Z' },
          { point: 'broken', time: '2025-07-19T08:30:00.000Z' },
          { point: '52.0°, 8.5°', time: '2025-07-19T09:00:00.000Z' },
        ],
      }],
    };
    const segs = parseTimeline(data);
    expect(segs[0].points?.length).toBe(2);
  });
});
```

- [ ] **Step 2: Test ausführen — fail erwartet**

Run: `cd backend && npx vitest run src/timeline/parser.test.ts`

Expected: 4 fails (`parser.ts` existiert nicht).

- [ ] **Step 3: Parser implementieren**

```typescript
// backend/src/timeline/parser.ts
export type Mode = 'driving' | 'walking' | 'cycling' | 'bus' | 'train' | 'ferry' | 'motorcycle' | 'unknown';

export interface ParsedSegment {
  kind: 'path' | 'activity' | 'visit';
  start: Date;
  end: Date;
  mode?: Mode;
  points?: { lat: number; lng: number }[];
  distanceMeters?: number;
}

const MODE_MAP: Record<string, Mode> = {
  IN_PASSENGER_VEHICLE: 'driving',
  DRIVING: 'driving',
  IN_VEHICLE: 'driving',
  WALKING: 'walking',
  ON_FOOT: 'walking',
  CYCLING: 'cycling',
  IN_BUS: 'bus',
  IN_TRAIN: 'train',
  IN_TRAM: 'train',
  IN_FERRY: 'ferry',
  IN_BOAT: 'ferry',
  MOTORCYCLING: 'motorcycle',
};

const POINT_RE = /(-?\d+\.?\d*)°,\s*(-?\d+\.?\d*)°/;

function mapMode(raw?: string): Mode {
  if (!raw) return 'unknown';
  return MODE_MAP[raw.toUpperCase()] ?? 'unknown';
}

function parsePointString(s: string): { lat: number; lng: number } | null {
  const m = s.match(POINT_RE);
  if (!m) return null;
  return { lat: parseFloat(m[1]), lng: parseFloat(m[2]) };
}

function fromE7(v: number): number {
  return v / 1e7;
}

function parseSemanticSegments(data: any): ParsedSegment[] {
  const out: ParsedSegment[] = [];
  for (const s of data.semanticSegments ?? []) {
    const start = new Date(s.startTime);
    const end = new Date(s.endTime);
    if (isNaN(start.getTime()) || isNaN(end.getTime())) continue;

    if (s.timelinePath) {
      const pts: { lat: number; lng: number }[] = [];
      for (const p of s.timelinePath) {
        const xy = parsePointString(p.point ?? '');
        if (xy) pts.push(xy);
      }
      if (pts.length) out.push({ kind: 'path', start, end, points: pts });
    }
    if (s.activity?.topCandidate?.type) {
      out.push({
        kind: 'activity',
        start,
        end,
        mode: mapMode(s.activity.topCandidate.type),
        distanceMeters: s.activity.distanceMeters ?? 0,
      });
    }
    if (s.visit) {
      out.push({ kind: 'visit', start, end });
    }
  }
  return out;
}

function parseTimelineObjects(data: any): ParsedSegment[] {
  const out: ParsedSegment[] = [];
  for (const obj of data.timelineObjects ?? []) {
    if (obj.activitySegment) {
      const a = obj.activitySegment;
      const start = new Date(a.duration?.startTimestamp);
      const end = new Date(a.duration?.endTimestamp);
      if (isNaN(start.getTime()) || isNaN(end.getTime())) continue;
      const pts: { lat: number; lng: number }[] = [];
      for (const w of a.waypointPath?.waypoints ?? []) {
        if (typeof w.latE7 === 'number' && typeof w.lngE7 === 'number') {
          pts.push({ lat: fromE7(w.latE7), lng: fromE7(w.lngE7) });
        }
      }
      out.push({
        kind: 'activity',
        start, end,
        mode: mapMode(a.activityType),
        distanceMeters: a.distance ?? 0,
        points: pts.length ? pts : undefined,
      });
    } else if (obj.placeVisit) {
      const v = obj.placeVisit;
      const start = new Date(v.duration?.startTimestamp);
      const end = new Date(v.duration?.endTimestamp);
      if (!isNaN(start.getTime()) && !isNaN(end.getTime())) {
        out.push({ kind: 'visit', start, end });
      }
    }
  }
  return out;
}

export function parseTimeline(data: any): ParsedSegment[] {
  if (data?.semanticSegments && Array.isArray(data.semanticSegments)) {
    return parseSemanticSegments(data);
  }
  if (data?.timelineObjects && Array.isArray(data.timelineObjects)) {
    return parseTimelineObjects(data);
  }
  throw new Error('Unbekanntes Timeline-Format (weder semanticSegments noch timelineObjects)');
}
```

- [ ] **Step 4: Test ausführen — pass erwartet**

Run: `cd backend && npx vitest run src/timeline/parser.test.ts`

Expected: 4 passes.

- [ ] **Step 5: Commit**

```bash
git add backend/src/timeline/parser.ts backend/src/timeline/parser.test.ts
git commit -m "feat(timeline): parser for new + legacy Google Timeline JSON"
```

---

## Task 5: Splitter Module + Tests

**Files:**
- Create: `backend/src/timeline/splitter.ts`
- Create: `backend/src/timeline/splitter.test.ts`

- [ ] **Step 1: Test schreiben**

```typescript
// backend/src/timeline/splitter.test.ts
import { describe, it, expect } from 'vitest';
import { splitByDay, type DaySegments } from './splitter';
import type { ParsedSegment } from './parser';

function seg(start: string, end: string, opts: Partial<ParsedSegment> = {}): ParsedSegment {
  return { kind: 'path', start: new Date(start), end: new Date(end), ...opts };
}

describe('splitByDay', () => {
  it('groups segments by start date string', () => {
    const segs: ParsedSegment[] = [
      seg('2025-07-19T08:00:00Z', '2025-07-19T10:00:00Z', { points: [{lat:52,lng:13},{lat:51,lng:8}] }),
      seg('2025-07-19T18:00:00Z', '2025-07-19T19:00:00Z', { kind: 'activity', mode: 'driving', distanceMeters: 100000 }),
      seg('2025-07-20T09:00:00Z', '2025-07-20T11:00:00Z', { points: [{lat:51,lng:8},{lat:51.4,lng:6.6}] }),
    ];
    const days = splitByDay(segs, '2025-07-19', '2025-07-21');
    expect(days.size).toBe(2);
    const d19 = days.get('2025-07-19')!;
    expect(d19.points.length).toBe(2);
    expect(d19.distanceMeters).toBe(100000);
  });

  it('filters segments outside trip range', () => {
    const segs: ParsedSegment[] = [
      seg('2025-06-15T08:00:00Z', '2025-06-15T10:00:00Z', { kind: 'activity', mode: 'driving', distanceMeters: 50000 }),
      seg('2025-07-19T08:00:00Z', '2025-07-19T10:00:00Z', { kind: 'activity', mode: 'driving', distanceMeters: 100000 }),
    ];
    const days = splitByDay(segs, '2025-07-19', '2025-07-21');
    expect(days.size).toBe(1);
    expect(days.has('2025-06-15')).toBe(false);
  });

  it('marks day as having no motorized movement (Standtag)', () => {
    const segs: ParsedSegment[] = [
      seg('2025-07-19T10:00:00Z', '2025-07-19T11:00:00Z', { kind: 'activity', mode: 'walking', distanceMeters: 5000 }),
    ];
    const days = splitByDay(segs, '2025-07-19', '2025-07-19');
    const d = days.get('2025-07-19')!;
    expect(d.hasMotorized).toBe(false);
    expect(d.walkingMeters).toBe(5000);
    expect(d.distanceMeters).toBe(0);
  });

  it('aggregates modes into a Set', () => {
    const segs: ParsedSegment[] = [
      seg('2025-07-19T08:00:00Z', '2025-07-19T10:00:00Z', { kind: 'activity', mode: 'driving', distanceMeters: 100000 }),
      seg('2025-07-19T11:00:00Z', '2025-07-19T12:00:00Z', { kind: 'activity', mode: 'ferry', distanceMeters: 50000 }),
      seg('2025-07-19T18:00:00Z', '2025-07-19T19:00:00Z', { kind: 'activity', mode: 'walking', distanceMeters: 4000 }),
    ];
    const days = splitByDay(segs, '2025-07-19', '2025-07-19');
    const d = days.get('2025-07-19')!;
    expect([...d.modes].sort()).toEqual(['driving','ferry','walking']);
    expect(d.hasMotorized).toBe(true);
  });
});
```

- [ ] **Step 2: Test ausführen — fail erwartet**

Run: `cd backend && npx vitest run src/timeline/splitter.test.ts`

Expected: 4 fails.

- [ ] **Step 3: Splitter implementieren**

```typescript
// backend/src/timeline/splitter.ts
import type { ParsedSegment, Mode } from './parser';

export interface DaySegments {
  date: string;
  points: { lat: number; lng: number }[];
  distanceMeters: number;
  walkingMeters: number;
  durationMinutes: number;
  modes: Set<Mode>;
  hasMotorized: boolean;
  segmentCount: number;
}

const MOTORIZED: Set<Mode> = new Set(['driving','bus','train','ferry','motorcycle']);

function isoDate(d: Date): string {
  return d.toISOString().slice(0, 10);
}

export function splitByDay(
  segments: ParsedSegment[],
  tripStart: string,
  tripEnd: string,
): Map<string, DaySegments> {
  const out = new Map<string, DaySegments>();
  for (const s of segments) {
    const date = isoDate(s.start);
    if (date < tripStart || date > tripEnd) continue;

    let day = out.get(date);
    if (!day) {
      day = {
        date,
        points: [],
        distanceMeters: 0,
        walkingMeters: 0,
        durationMinutes: 0,
        modes: new Set(),
        hasMotorized: false,
        segmentCount: 0,
      };
      out.set(date, day);
    }
    day.segmentCount++;

    if (s.kind === 'path' && s.points) {
      day.points.push(...s.points);
    }
    if (s.kind === 'activity' && s.mode) {
      day.modes.add(s.mode);
      if (s.mode === 'walking') {
        day.walkingMeters += s.distanceMeters ?? 0;
      } else if (MOTORIZED.has(s.mode)) {
        day.distanceMeters += s.distanceMeters ?? 0;
        day.hasMotorized = true;
      }
      day.durationMinutes += Math.round((s.end.getTime() - s.start.getTime()) / 60000);
      // Optional path data from activity segments (legacy format)
      if (s.points) day.points.push(...s.points);
    }
  }
  return out;
}
```

- [ ] **Step 4: Test ausführen — pass erwartet**

Run: `cd backend && npx vitest run src/timeline/splitter.test.ts`

Expected: 4 passes.

- [ ] **Step 5: Commit**

```bash
git add backend/src/timeline/splitter.ts backend/src/timeline/splitter.test.ts
git commit -m "feat(timeline): splitByDay groups + filters segments by trip range"
```

---

## Task 6: Tile-Cache Module + Tests

**Files:**
- Create: `backend/src/timeline/tile-cache.ts`
- Create: `backend/src/timeline/tile-cache.test.ts`

- [ ] **Step 1: Test schreiben**

```typescript
// backend/src/timeline/tile-cache.test.ts
import { describe, it, expect, beforeEach, vi } from 'vitest';
import fs from 'fs';
import path from 'path';
import os from 'os';
import { fetchTile, clearTileCache } from './tile-cache';

const TMP = path.join(os.tmpdir(), 'tile-cache-test-' + Date.now());

beforeEach(() => {
  process.env.OPENTOPOMAP_TILE_CACHE = TMP;
  process.env.OPENTOPOMAP_TILE_TTL_DAYS = '1';
  if (fs.existsSync(TMP)) fs.rmSync(TMP, { recursive: true });
});

describe('tile-cache', () => {
  it('downloads and caches a tile on first request', async () => {
    const mockFetch = vi.fn().mockResolvedValue({
      ok: true,
      arrayBuffer: async () => new Uint8Array([1,2,3,4]).buffer,
    });
    const buf = await fetchTile(8, 130, 80, mockFetch);
    expect(buf).toBeInstanceOf(Buffer);
    expect(buf.length).toBe(4);
    expect(mockFetch).toHaveBeenCalledWith(
      'https://a.tile.opentopomap.org/8/130/80.png',
      expect.objectContaining({ headers: expect.objectContaining({ 'User-Agent': expect.stringContaining('reise-app') }) })
    );
    expect(fs.existsSync(path.join(TMP, '8/130/80.png'))).toBe(true);
  });

  it('returns cached tile without fetching on second request', async () => {
    const mockFetch = vi.fn().mockResolvedValue({
      ok: true,
      arrayBuffer: async () => new Uint8Array([1,2,3,4]).buffer,
    });
    await fetchTile(8, 130, 80, mockFetch);
    await fetchTile(8, 130, 80, mockFetch);
    expect(mockFetch).toHaveBeenCalledTimes(1);
  });

  it('throws on non-OK response', async () => {
    const mockFetch = vi.fn().mockResolvedValue({ ok: false, status: 429, statusText: 'Too Many Requests' });
    await expect(fetchTile(8, 130, 80, mockFetch)).rejects.toThrow(/429/);
  });
});
```

- [ ] **Step 2: Test ausführen — fail erwartet**

Run: `cd backend && npx vitest run src/timeline/tile-cache.test.ts`

Expected: 3 fails.

- [ ] **Step 3: Tile-Cache implementieren**

```typescript
// backend/src/timeline/tile-cache.ts
import fs from 'fs';
import path from 'path';

type FetchFn = (url: string, init?: any) => Promise<{
  ok: boolean;
  status?: number;
  statusText?: string;
  arrayBuffer: () => Promise<ArrayBuffer>;
}>;

function cacheRoot(): string {
  return process.env.OPENTOPOMAP_TILE_CACHE ?? '/var/cache/opentopomap-tiles';
}

function ttlMs(): number {
  const days = parseInt(process.env.OPENTOPOMAP_TILE_TTL_DAYS ?? '30', 10);
  return days * 24 * 3600 * 1000;
}

function tilePath(z: number, x: number, y: number): string {
  return path.join(cacheRoot(), String(z), String(x), `${y}.png`);
}

const SUBDOMAINS = ['a','b','c'];

export async function fetchTile(
  z: number, x: number, y: number,
  fetchImpl: FetchFn = (globalThis as any).fetch,
): Promise<Buffer> {
  const local = tilePath(z, x, y);
  if (fs.existsSync(local)) {
    const stat = fs.statSync(local);
    if (Date.now() - stat.mtimeMs < ttlMs()) {
      return fs.readFileSync(local);
    }
  }
  const sub = SUBDOMAINS[(x + y) % SUBDOMAINS.length];
  const url = `https://${sub}.tile.opentopomap.org/${z}/${x}/${y}.png`;
  const res = await fetchImpl(url, {
    headers: {
      'User-Agent': 'reise-app/1.0 (https://api.toenhardt.de)',
    },
  });
  if (!res.ok) {
    throw new Error(`Tile fetch failed: ${res.status} ${res.statusText} (${url})`);
  }
  const buf = Buffer.from(await res.arrayBuffer());
  fs.mkdirSync(path.dirname(local), { recursive: true });
  fs.writeFileSync(local, buf);
  return buf;
}

export function clearTileCache(): void {
  const root = cacheRoot();
  if (fs.existsSync(root)) fs.rmSync(root, { recursive: true });
}
```

- [ ] **Step 4: Test ausführen — pass erwartet**

Run: `cd backend && npx vitest run src/timeline/tile-cache.test.ts`

Expected: 3 passes.

- [ ] **Step 5: Commit**

```bash
git add backend/src/timeline/tile-cache.ts backend/src/timeline/tile-cache.test.ts
git commit -m "feat(timeline): OpenTopoMap tile-cache with TTL + custom User-Agent"
```

---

## Task 7: Map Renderer (Tagesroute) + Tests

**Files:**
- Create: `backend/src/timeline/map.ts`
- Create: `backend/src/timeline/map.test.ts`

- [ ] **Step 1: Test schreiben**

```typescript
// backend/src/timeline/map.test.ts
import { describe, it, expect, vi } from 'vitest';
import { renderRouteImage } from './map';

describe('renderRouteImage', () => {
  it('returns a PNG Buffer for valid route data', async () => {
    const day = {
      date: '2025-07-19',
      points: [
        { lat: 52.68, lng: 13.29 },
        { lat: 52.52, lng: 13.40 },
        { lat: 52.22, lng: 11.63 },
        { lat: 52.00, lng: 8.50 },
      ],
      distanceMeters: 350000,
      walkingMeters: 0,
      durationMinutes: 210,
      modes: new Set(['driving' as const]),
      hasMotorized: true,
      segmentCount: 4,
    };
    const buf = await renderRouteImage(day);
    expect(Buffer.isBuffer(buf)).toBe(true);
    expect(buf.slice(0, 8).equals(Buffer.from([0x89,0x50,0x4E,0x47,0x0D,0x0A,0x1A,0x0A]))).toBe(true);
  }, 60000);

  it('throws when fewer than 2 points', async () => {
    const day = {
      date: '2025-07-19', points: [{ lat: 52, lng: 13 }],
      distanceMeters: 0, walkingMeters: 0, durationMinutes: 0,
      modes: new Set<any>(), hasMotorized: false, segmentCount: 0,
    };
    await expect(renderRouteImage(day)).rejects.toThrow(/points/i);
  });
});
```

- [ ] **Step 2: Test ausführen — fail erwartet**

Run: `cd backend && npx vitest run src/timeline/map.test.ts`

Expected: 2 fails.

- [ ] **Step 3: Renderer implementieren**

```typescript
// backend/src/timeline/map.ts
import StaticMaps from 'staticmaps';
import sharp from 'sharp';
import fs from 'fs';
import path from 'path';
import type { DaySegments } from './splitter';

const WIDTH = 2400;
const HEIGHT = 1200;
const BANNER_H = 110;

const ICON_PATH = process.env.WOHNMOBIL_ICON_PATH
  ?? path.join(__dirname, '..', '..', 'assets', 'wohnmobil-icon.png');

let cachedIconBuffer: Buffer | null = null;
let cachedIconMeta: { width: number; height: number } | null = null;

async function getIcon(): Promise<{ buf: Buffer; w: number; h: number }> {
  if (cachedIconBuffer && cachedIconMeta) {
    return { buf: cachedIconBuffer, w: cachedIconMeta.width, h: cachedIconMeta.height };
  }
  const raw = fs.readFileSync(ICON_PATH);
  const buf = await sharp(raw).resize({ height: 64 }).png().toBuffer();
  const meta = await sharp(buf).metadata();
  cachedIconBuffer = buf;
  cachedIconMeta = { width: meta.width!, height: meta.height! };
  return { buf, w: meta.width!, h: meta.height! };
}

function buildBannerSvg(km: number, iconWidth: number): string {
  const text = `${km.toLocaleString('de-DE', { minimumFractionDigits: 1, maximumFractionDigits: 1 })} km`;
  const textX = 30 + iconWidth + 20;
  return `<svg width="${WIDTH}" height="${BANNER_H}" xmlns="http://www.w3.org/2000/svg">
    <rect width="100%" height="100%" fill="rgba(255,255,255,0.94)" />
    <rect x="0" y="0" width="100%" height="4" fill="#c0392b" />
    <text x="${textX}" y="${Math.round(BANNER_H * 0.62)}" font-family="Verdana, Arial, sans-serif" font-size="40" fill="#1a1a1a" font-weight="600">${text}</text>
  </svg>`;
}

export async function renderRouteImage(day: DaySegments): Promise<Buffer> {
  const points = day.points;
  if (!points || points.length < 2) {
    throw new Error(`renderRouteImage: needs >= 2 points (got ${points?.length ?? 0})`);
  }

  const map = new StaticMaps({
    width: WIDTH,
    height: HEIGHT,
    paddingX: 120,
    paddingY: 120,
    tileUrl: 'https://a.tile.opentopomap.org/{z}/{x}/{y}.png',
    tileRequestHeader: { 'User-Agent': 'reise-app/1.0 (https://api.toenhardt.de)' },
    tileRequestTimeout: 10000,
  });

  map.addLine({
    coords: points.map(p => [p.lng, p.lat]),
    color: '#c0392b',
    width: 9,
  });
  map.addCircle({
    coord: [points[0].lng, points[0].lat],
    radius: 1500, fill: '#27ae60', color: '#ffffff', width: 6,
  });
  const last = points[points.length - 1];
  map.addCircle({
    coord: [last.lng, last.lat],
    radius: 1500, fill: '#c0392b', color: '#ffffff', width: 6,
  });

  await map.render();
  const baseBuffer = await map.image.buffer('image/png');

  const km = day.distanceMeters / 1000;
  const icon = await getIcon();
  const banner = buildBannerSvg(km, icon.w);

  return await sharp(baseBuffer).composite([
    { input: Buffer.from(banner), top: HEIGHT - BANNER_H, left: 0 },
    { input: icon.buf, top: HEIGHT - BANNER_H + Math.round((BANNER_H - icon.h) / 2), left: 30 },
  ]).png().toBuffer();
}
```

- [ ] **Step 4: Wohnmobil-Icon ins Backend kopieren**

```bash
mkdir -p backend/assets
cp ../toenhardt/wohnmobil-icon.png backend/assets/
```

- [ ] **Step 5: Test ausführen — pass erwartet (kann ~30s dauern wegen Tile-Downloads)**

Run: `cd backend && npx vitest run src/timeline/map.test.ts --testTimeout 90000`

Expected: 2 passes. PNG-Magic-Bytes verifiziert.

- [ ] **Step 6: Commit**

```bash
git add backend/src/timeline/map.ts backend/src/timeline/map.test.ts backend/assets/wohnmobil-icon.png
git commit -m "feat(timeline): renderRouteImage 2400x1200 with km-banner + Wohnmobil icon"
```

---

## Task 8: Overview Renderer + Tests

**Files:**
- Create: `backend/src/timeline/overview.ts`
- Create: `backend/src/timeline/overview.test.ts`

- [ ] **Step 1: Test schreiben**

```typescript
// backend/src/timeline/overview.test.ts
import { describe, it, expect } from 'vitest';
import { renderOverviewImage, type OverviewRoute } from './overview';

describe('renderOverviewImage', () => {
  it('returns PNG Buffer for multiple routes', async () => {
    const routes: OverviewRoute[] = [
      { date: '2025-07-19', points: [{lat:52.68,lng:13.29},{lat:52.52,lng:13.40},{lat:52.0,lng:8.5}], distanceKm: 350 },
      { date: '2025-07-20', points: [{lat:52.0,lng:8.5},{lat:51.5,lng:7.5},{lat:51.4,lng:6.6}], distanceKm: 245 },
    ];
    const buf = await renderOverviewImage('Sommer-Reise 2025', routes);
    expect(Buffer.isBuffer(buf)).toBe(true);
    expect(buf.slice(0,8).equals(Buffer.from([0x89,0x50,0x4E,0x47,0x0D,0x0A,0x1A,0x0A]))).toBe(true);
  }, 90000);

  it('throws when no routes given', async () => {
    await expect(renderOverviewImage('X', [])).rejects.toThrow(/at least one/i);
  });
});
```

- [ ] **Step 2: Test ausführen — fail erwartet**

Run: `cd backend && npx vitest run src/timeline/overview.test.ts`

Expected: 2 fails.

- [ ] **Step 3: Overview-Renderer implementieren**

```typescript
// backend/src/timeline/overview.ts
import StaticMaps from 'staticmaps';
import sharp from 'sharp';
import fs from 'fs';
import path from 'path';

const W = 2400;
const H = 1400;
const BANNER_H = 110;

export interface OverviewRoute {
  date: string;
  points: { lat: number; lng: number }[];
  distanceKm: number;
}

// Kontrastreiche dunkle Palette — siehe feedback_karten_topo Memory
const PALETTE = [
  '#b91c1c','#1e3a8a','#7e22ce','#c2185b','#ea580c',
  '#0c4a6e','#581c87','#be185d','#9a3412','#312e81',
  '#831843','#1e40af','#a21caf','#b45309','#4c1d95',
  '#dc2626','#0e7490','#7c2d12','#6b21a8','#dd2c87','#0f172a',
];

const ICON_PATH = process.env.WOHNMOBIL_ICON_PATH
  ?? path.join(__dirname, '..', '..', 'assets', 'wohnmobil-icon.png');

export async function renderOverviewImage(title: string, routes: OverviewRoute[]): Promise<Buffer> {
  if (!routes.length) throw new Error('renderOverviewImage: at least one route required');

  const map = new StaticMaps({
    width: W, height: H,
    paddingX: 150, paddingY: 150,
    tileUrl: 'https://a.tile.opentopomap.org/{z}/{x}/{y}.png',
    tileRequestHeader: { 'User-Agent': 'reise-app/1.0 (https://api.toenhardt.de)' },
    tileRequestTimeout: 10000,
  });

  let totalKm = 0;
  routes.forEach((r, i) => {
    if (r.points.length < 2) return;
    totalKm += r.distanceKm;
    map.addLine({
      coords: r.points.map(p => [p.lng, p.lat]),
      color: PALETTE[i % PALETTE.length],
      width: 7,
    });
  });

  const firstPts = routes[0].points;
  const lastPts = routes[routes.length - 1].points;
  if (firstPts.length) {
    map.addCircle({ coord: [firstPts[0].lng, firstPts[0].lat], radius: 3000, fill: '#27ae60', color: '#fff', width: 8 });
  }
  if (lastPts.length) {
    const last = lastPts[lastPts.length - 1];
    map.addCircle({ coord: [last.lng, last.lat], radius: 3000, fill: '#c0392b', color: '#fff', width: 8 });
  }

  await map.render();
  const baseBuffer = await map.image.buffer('image/png');

  const iconBuf = await sharp(fs.readFileSync(ICON_PATH)).resize({ height: 64 }).png().toBuffer();
  const iconMeta = await sharp(iconBuf).metadata();
  const text = `${title}  ·  ${routes.length} Tage  ·  ${Math.round(totalKm).toLocaleString('de-DE')} km`;
  const textX = 30 + iconMeta.width! + 20;
  const banner = `<svg width="${W}" height="${BANNER_H}" xmlns="http://www.w3.org/2000/svg">
    <rect width="100%" height="100%" fill="rgba(255,255,255,0.94)"/>
    <rect x="0" y="0" width="100%" height="4" fill="#c0392b"/>
    <text x="${textX}" y="${Math.round(BANNER_H*0.62)}" font-family="Verdana, Arial, sans-serif" font-size="44" fill="#1a1a1a" font-weight="700">${text}</text>
  </svg>`;

  return await sharp(baseBuffer).composite([
    { input: Buffer.from(banner), top: H - BANNER_H, left: 0 },
    { input: iconBuf, top: H - BANNER_H + Math.round((BANNER_H - iconMeta.height!)/2), left: 30 },
  ]).png().toBuffer();
}
```

- [ ] **Step 4: Test ausführen — pass erwartet**

Run: `cd backend && npx vitest run src/timeline/overview.test.ts --testTimeout 120000`

Expected: 2 passes.

- [ ] **Step 5: Commit**

```bash
git add backend/src/timeline/overview.ts backend/src/timeline/overview.test.ts
git commit -m "feat(timeline): renderOverviewImage with multi-color palette"
```

---

## Task 9: Strato-Helper für Karten + Test-Anpassung

**Files:**
- Modify: `backend/src/strato.ts`
- Modify: `backend/src/strato.test.ts`

- [ ] **Step 1: Test schreiben (in vorhandener Testdatei ergänzen)**

```typescript
// In backend/src/strato.test.ts hinzufügen:
describe('uploadRouteMap', () => {
  it('exports a function with predictable filename', () => {
    const { uploadRouteMap } = require('./strato');
    expect(typeof uploadRouteMap).toBe('function');
  });
});
```

- [ ] **Step 2: Helper implementieren — ans Ende `strato.ts` anhängen**

```typescript
// backend/src/strato.ts (am Ende ergänzen)

export async function uploadRouteMap(
  tripId: string,
  date: string,
  buffer: Buffer,
): Promise<{ filePath: string; url: string }> {
  const remoteDir = `/_entwuerfe/${tripId}`;
  const remoteFile = `${remoteDir}/route_${date}.png`;
  const client = new SftpClient();
  try {
    await client.connect(getConfig());
    await client.mkdir(remoteDir, true);
    await client.put(buffer, remoteFile);
  } finally {
    await client.end();
  }
  return { filePath: remoteFile, url: `${getBaseUrl()}${remoteFile}` };
}

export async function uploadOverviewMap(
  tripId: string,
  buffer: Buffer,
): Promise<{ filePath: string; url: string }> {
  const remoteDir = `/_entwuerfe/${tripId}`;
  const remoteFile = `${remoteDir}/trip-overview.png`;
  const client = new SftpClient();
  try {
    await client.connect(getConfig());
    await client.mkdir(remoteDir, true);
    await client.put(buffer, remoteFile);
  } finally {
    await client.end();
  }
  return { filePath: remoteFile, url: `${getBaseUrl()}${remoteFile}` };
}
```

- [ ] **Step 3: Run tests, expect pass**

Run: `cd backend && npx vitest run src/strato.test.ts`

Expected: pass.

- [ ] **Step 4: Commit**

```bash
git add backend/src/strato.ts backend/src/strato.test.ts
git commit -m "feat(strato): uploadRouteMap + uploadOverviewMap helpers"
```

---

## Task 10: Timeline Router POST /preview + Tests

**Files:**
- Create: `backend/src/timeline/router.ts`
- Create: `backend/src/timeline/router.test.ts`

- [ ] **Step 1: Test schreiben**

```typescript
// backend/src/timeline/router.test.ts
import { describe, it, expect, beforeAll } from 'vitest';
import request from 'supertest';
import fs from 'fs';
import path from 'path';
import { app } from '../index';
import { withFamily } from '../db';

const fixture = fs.readFileSync(path.join(__dirname, '__fixtures__/timeline-new.json'));

let token: string;
let tripId: string;

beforeAll(async () => {
  // Login + Trip mit start_date/end_date 2025-07-19..2025-07-21
  const reg = await request(app).post('/api/v1/auth/register').send({
    email: 'tl@test.de', password: 'pw12345678', display_name: 'TL', family_name: 'TLF',
  });
  token = reg.body.token;
  const trip = await request(app).post('/api/v1/trips').set('Authorization', `Bearer ${token}`).send({
    title: 'TL-Test', start_date: '2025-07-19', end_date: '2025-07-21',
  });
  tripId = trip.body.trip.id;
});

describe('POST /api/v1/trips/:tripId/timeline/preview', () => {
  it('returns days-list with distance + modes', async () => {
    const res = await request(app)
      .post(`/api/v1/trips/${tripId}/timeline/preview`)
      .set('Authorization', `Bearer ${token}`)
      .attach('file', fixture, 'Timeline.json');
    expect(res.status).toBe(200);
    expect(res.body.days).toBeInstanceOf(Array);
    const d19 = res.body.days.find((d: any) => d.date === '2025-07-19');
    expect(d19).toBeDefined();
    expect(d19.distance_km).toBeGreaterThan(300);
    expect(d19.modes).toContain('driving');
    expect(res.body.skipped_outside_range).toContain('2025-06-15');
  });

  it('returns 422 for trip without dates', async () => {
    const t2 = await request(app).post('/api/v1/trips').set('Authorization', `Bearer ${token}`).send({ title: 'NoDate' });
    const res = await request(app)
      .post(`/api/v1/trips/${t2.body.trip.id}/timeline/preview`)
      .set('Authorization', `Bearer ${token}`)
      .attach('file', fixture, 'Timeline.json');
    expect(res.status).toBe(422);
  });

  it('returns 400 for invalid JSON format', async () => {
    const res = await request(app)
      .post(`/api/v1/trips/${tripId}/timeline/preview`)
      .set('Authorization', `Bearer ${token}`)
      .attach('file', Buffer.from('{"random":1}'), 'Timeline.json');
    expect(res.status).toBe(400);
  });
});
```

- [ ] **Step 2: Router implementieren**

```typescript
// backend/src/timeline/router.ts
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
```

- [ ] **Step 3: Mount in `backend/src/index.ts`**

```typescript
// nach den anderen Router-Imports:
import { timelineRouter } from './timeline/router';
// ...
// nach app.use('/api/v1/trips/:tripId', publishRouter):
app.use('/api/v1/trips/:tripId/timeline', timelineRouter);
```

- [ ] **Step 4: Tests laufen**

Run: `cd backend && npx vitest run src/timeline/router.test.ts`

Expected: 3 passes.

- [ ] **Step 5: Commit**

```bash
git add backend/src/timeline/router.ts backend/src/timeline/router.test.ts backend/src/index.ts
git commit -m "feat(timeline): POST /preview parses + groups timeline by day"
```

---

## Task 11: Timeline Router POST /import + Tests

**Files:**
- Modify: `backend/src/timeline/router.ts`
- Modify: `backend/src/timeline/router.test.ts`

- [ ] **Step 1: Tests ergänzen**

```typescript
// In router.test.ts ergänzen:
import { vi } from 'vitest';
vi.mock('../strato', () => ({
  uploadRouteMap: vi.fn(async (tid: string, date: string) => ({
    filePath: `/_entwuerfe/${tid}/route_${date}.png`,
    url: `https://example.com/_entwuerfe/${tid}/route_${date}.png`,
  })),
  uploadOverviewMap: vi.fn(async (tid: string) => ({
    filePath: `/_entwuerfe/${tid}/trip-overview.png`,
    url: `https://example.com/_entwuerfe/${tid}/trip-overview.png`,
  })),
  uploadToStrato: vi.fn(),
  deleteFromStrato: vi.fn(),
}));
vi.mock('./map', () => ({
  renderRouteImage: vi.fn(async () => Buffer.from([0x89,0x50,0x4E,0x47])),
}));
vi.mock('./overview', () => ({
  renderOverviewImage: vi.fn(async () => Buffer.from([0x89,0x50,0x4E,0x47])),
}));

describe('POST /api/v1/trips/:tripId/timeline/import', () => {
  it('imports selected days, auto-creates missing entries, sets route_image_url', async () => {
    const res = await request(app)
      .post(`/api/v1/trips/${tripId}/timeline/import`)
      .set('Authorization', `Bearer ${token}`)
      .field('days_to_process', JSON.stringify(['2025-07-19', '2025-07-20']))
      .field('overwrite', JSON.stringify({}))
      .field('auto_create', 'true')
      .attach('file', fixture, 'Timeline.json');
    expect(res.status).toBe(200);
    expect(res.body.processed).toHaveLength(2);
    const d19 = res.body.processed.find((p: any) => p.date === '2025-07-19');
    expect(d19.route_image_url).toContain('route_2025-07-19.png');
    expect(d19.journal_entry_id).toBeDefined();
    expect(d19.created).toBe(true);

    const dbCheck = await withFamily('placeholder', () => Promise.resolve()); // sentinel
    // Verify DB state
    const r = await request(app).get(`/api/v1/trips/${tripId}/journal`).set('Authorization', `Bearer ${token}`);
    const e19 = r.body.entries.find((e: any) => e.date === '2025-07-19');
    expect(e19.route_image_url).toContain('route_2025-07-19.png');
    expect(e19.route_meta.distance_km).toBeGreaterThan(300);
  });

  it('skips days when overwrite=false and existing image present', async () => {
    // First import as setup
    await request(app)
      .post(`/api/v1/trips/${tripId}/timeline/import`)
      .set('Authorization', `Bearer ${token}`)
      .field('days_to_process', JSON.stringify(['2025-07-19']))
      .field('overwrite', JSON.stringify({}))
      .field('auto_create', 'true')
      .attach('file', fixture, 'Timeline.json');
    // Second import without overwrite → should skip
    const res = await request(app)
      .post(`/api/v1/trips/${tripId}/timeline/import`)
      .set('Authorization', `Bearer ${token}`)
      .field('days_to_process', JSON.stringify(['2025-07-19']))
      .field('overwrite', JSON.stringify({ '2025-07-19': false }))
      .field('auto_create', 'true')
      .attach('file', fixture, 'Timeline.json');
    expect(res.body.skipped).toContainEqual(expect.objectContaining({ date: '2025-07-19', reason: 'exists' }));
  });

  it('triggers overview re-render (uploadOverviewMap called)', async () => {
    const { uploadOverviewMap } = await import('../strato');
    (uploadOverviewMap as any).mockClear();
    await request(app)
      .post(`/api/v1/trips/${tripId}/timeline/import`)
      .set('Authorization', `Bearer ${token}`)
      .field('days_to_process', JSON.stringify(['2025-07-19']))
      .field('overwrite', JSON.stringify({ '2025-07-19': true }))
      .field('auto_create', 'true')
      .attach('file', fixture, 'Timeline.json');
    expect(uploadOverviewMap).toHaveBeenCalledWith(tripId, expect.any(Buffer));
  });
});
```

- [ ] **Step 2: Import-Route + Helper implementieren — anhängen an `router.ts`**

```typescript
// backend/src/timeline/router.ts (anhängen)
import { renderRouteImage } from './map';
import { renderOverviewImage, type OverviewRoute } from './overview';
import { uploadRouteMap, uploadOverviewMap, deleteFromStrato } from '../strato';

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
  // Sammle Punkte aus route_meta.points (gespeichert beim Import)
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
        // Best-effort delete previous file
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
```

- [ ] **Step 3: Tests laufen**

Run: `cd backend && npx vitest run src/timeline/router.test.ts`

Expected: alle 6 Tests grün (3 preview + 3 import).

- [ ] **Step 4: Commit**

```bash
git add backend/src/timeline/router.ts backend/src/timeline/router.test.ts
git commit -m "feat(timeline): POST /import renders + uploads + auto-creates entries + regenerates overview"
```

---

## Task 12: Publish-Template Erweiterung

**Files:**
- Modify: `backend/src/publish/template.ts`
- Modify: `backend/src/publish/template.test.ts`

- [ ] **Step 1: Tests schreiben**

```typescript
// In template.test.ts ergänzen:
describe('buildTagPageEntry with route_image_url', () => {
  it('prepends routeMap as i0 when entry has route_image_url', () => {
    const trip = { id: 't1', title: 'T', slug: 'urlaub-x' };
    const entry = {
      id: 'e1', trip_id: 't1', date: '2025-07-19', publish_seq: 1,
      blocks: [
        { type: 'text', content: 'Erster Text' },
        { type: 'images', media_ids: ['m1'] },
      ],
      media: [{ id: 'm1', url: 'https://example.com/photo.jpg' }],
      route_image_url: 'https://example.com/route.png',
    };
    const { value } = buildTagPageEntry(trip as any, entry as any);
    expect(value.images[0]).toBe('https://example.com/route.png');
    expect(value.order[0]).toBe('i0');
    expect(value.images).toContain('https://example.com/photo.jpg');
  });

  it('does not add routeMap when route_image_url is null', () => {
    const trip = { id: 't1', title: 'T', slug: 'urlaub-x' };
    const entry = {
      id: 'e1', trip_id: 't1', date: '2025-07-19', publish_seq: 1,
      blocks: [{ type: 'images', media_ids: ['m1'] }],
      media: [{ id: 'm1', url: 'https://example.com/photo.jpg' }],
      route_image_url: null,
    };
    const { value } = buildTagPageEntry(trip as any, entry as any);
    expect(value.images[0]).toBe('https://example.com/photo.jpg');
  });
});

describe('buildOverviewPageEntry with route_overview_url', () => {
  it('sets routeGif from trip.route_overview_url', () => {
    const trip = { id: 't1', title: 'T', slug: 'urlaub-x', route_overview_url: 'https://example.com/overview.png' };
    const { value } = buildOverviewPageEntry(trip as any, []);
    expect((value as any).routeGif).toBe('https://example.com/overview.png');
  });

  it('omits routeGif when no overview', () => {
    const trip = { id: 't1', title: 'T', slug: 'urlaub-x' };
    const { value } = buildOverviewPageEntry(trip as any, []);
    expect((value as any).routeGif).toBeUndefined();
  });
});
```

- [ ] **Step 2: Template anpassen**

```typescript
// backend/src/publish/template.ts — Trip + JournalEntry Interface erweitern, Logik anpassen

interface Trip {
  id: string;
  title: string;
  slug: string | null;
  description?: string | null;
  start_date?: string | null;
  end_date?: string | null;
  route_overview_url?: string | null;
}

interface JournalEntry {
  id: string;
  trip_id: string;
  date: string | null;
  publish_seq: number | null;
  blocks: Block[] | null;
  media: Media[];
  route_image_url?: string | null;
}

export interface OverviewPageEntry {
  key: string;
  value: {
    title: string;
    paragraphs: string[];
    images: string[];
    isTripOverview: true;
    start_date: string | null;
    end_date: string | null;
    routeGif?: string;
  };
}

export function buildTagPageEntry(trip: Trip, entry: JournalEntry): TagPageEntry {
  if (!trip.slug) throw new Error('trip.slug required');
  if (entry.publish_seq == null) throw new Error('entry.publish_seq required');

  const blocks = Array.isArray(entry.blocks) ? entry.blocks : [];
  const paragraphs: string[] = [];
  const images: string[] = [];
  const order: string[] = [];

  // Routenkarte als i0, falls vorhanden
  if (entry.route_image_url) {
    images.push(entry.route_image_url);
    order.push(`i${images.length - 1}`);
  }

  for (const b of blocks) {
    if (b.type === 'text' && b.content) {
      order.push(`p${paragraphs.length}`);
      paragraphs.push(b.content);
    } else if (b.type === 'images' && b.media_ids) {
      for (const mid of b.media_ids) {
        const m = entry.media.find((x) => x.id === mid);
        if (m) {
          order.push(`i${images.length}`);
          images.push(m.url);
        }
      }
    }
  }

  return {
    key: `${trip.slug}/tag-${entry.publish_seq}`,
    value: {
      title: `Tag ${entry.publish_seq}`,
      date: entry.date,
      paragraphs, images, order,
      tripSlug: trip.slug,
      publishSeq: entry.publish_seq,
    },
  };
}

export function buildOverviewPageEntry(trip: Trip, _published: JournalEntry[]): OverviewPageEntry {
  if (!trip.slug) throw new Error('trip.slug required');
  const paragraphs = trip.description ? [trip.description] : [];
  const value: OverviewPageEntry['value'] = {
    title: trip.title,
    paragraphs,
    images: [],
    isTripOverview: true,
    start_date: trip.start_date ?? null,
    end_date: trip.end_date ?? null,
  };
  if (trip.route_overview_url) value.routeGif = trip.route_overview_url;
  return { key: trip.slug, value };
}
```

- [ ] **Step 3: Tests laufen**

Run: `cd backend && npx vitest run src/publish/template.test.ts`

Expected: alle Tests grün (alte + 4 neue).

- [ ] **Step 4: Commit**

```bash
git add backend/src/publish/template.ts backend/src/publish/template.test.ts
git commit -m "feat(publish): inject route_image_url + route_overview_url into pages.json templates"
```

---

## Task 13: Publish-Router regeneriert Overview-Karte bei publish/unpublish

**Files:**
- Modify: `backend/src/publish/router.ts`

- [ ] **Step 1: Helper-Funktion in router.ts ergänzen (vor den Routen)**

```typescript
import { renderOverviewImage, type OverviewRoute } from '../timeline/overview';
import { uploadOverviewMap } from '../strato';

async function regenerateOverviewMap(familyId: string, trip: any) {
  const rows = await withFamily(familyId, (c) =>
    c.query(
      `SELECT date, route_meta FROM journal_entries
       WHERE trip_id = $1 AND is_published = true
         AND route_image_url IS NOT NULL AND route_meta IS NOT NULL
       ORDER BY date`,
      [trip.id]
    )
  );
  const routes: OverviewRoute[] = rows.rows
    .filter((r: any) => Array.isArray(r.route_meta?.points) && r.route_meta.points.length >= 2)
    .map((r: any) => ({ date: r.date, points: r.route_meta.points, distanceKm: r.route_meta.distance_km ?? 0 }));
  if (!routes.length) return null;
  try {
    const buf = await renderOverviewImage(trip.title, routes);
    const { url, filePath } = await uploadOverviewMap(trip.id, buf);
    await withFamily(familyId, (c) =>
      c.query(
        'UPDATE trips SET route_overview_url = $1, route_overview_path = $2, route_overview_updated_at = now() WHERE id = $3',
        [url, filePath, trip.id]
      )
    );
    return url;
  } catch (e) {
    console.warn('[regenerateOverviewMap] failed:', (e as Error).message);
    return null;
  }
}
```

- [ ] **Step 2: In `publish` und `unpublish` routes vor dem `buildOverviewPageEntry`-Aufruf**

```typescript
// Vor: const overview = buildOverviewPageEntry(trip, published);
await regenerateOverviewMap(req.user.familyId, trip);
// Trip neu laden um aktuellen route_overview_url zu bekommen
const refreshed = await loadTrip(req.user.familyId, tripId);
const overview = buildOverviewPageEntry(refreshed ?? trip, published);
```

Gleiches in `publish-all`.

- [ ] **Step 3: Existierende publish-Tests laufen — sollen weiter grün sein**

Run: `cd backend && npx vitest run src/publish/`

Expected: pass (Renderer wird `catch`-blocked, also keine Fehler bei Tests ohne Map-Daten).

- [ ] **Step 4: Commit**

```bash
git add backend/src/publish/router.ts
git commit -m "feat(publish): regenerate trip overview map on publish/unpublish/publish-all"
```

---

## Task 14: PWA Types + API Client

**Files:**
- Modify: `pwa/src/types.ts`
- Create: `pwa/src/api/timeline.ts`

- [ ] **Step 1: Types ergänzen**

```typescript
// pwa/src/types.ts — JournalEntry erweitern
export interface JournalEntry {
  // ... existing fields
  route_image_url?: string | null;
  route_meta?: {
    distance_km: number;
    walking_km?: number;
    duration_minutes: number;
    modes: string[];
    segment_count?: number;
    source: string;
    imported_at: string;
  } | null;
}

// Trip erweitern
export interface Trip {
  // ... existing fields
  route_overview_url?: string | null;
  route_overview_updated_at?: string | null;
}

export interface TimelinePreviewDay {
  date: string;
  distance_km: number;
  walking_km: number;
  duration_minutes: number;
  modes: string[];
  has_motorized: boolean;
  segment_count: number;
  has_existing_route_image: boolean;
}

export interface TimelinePreviewResponse {
  trip_id: string;
  trip_start: string;
  trip_end: string;
  days: TimelinePreviewDay[];
  skipped_outside_range: string[];
}

export interface TimelineImportResult {
  processed: { date: string; journal_entry_id: string; route_image_url: string; created: boolean; meta: any }[];
  skipped: { date: string; reason: string }[];
  errors: { date?: string; error?: string; overview?: string }[];
  overview_url: string | null;
}
```

- [ ] **Step 2: API client**

```typescript
// pwa/src/api/timeline.ts
import type { TimelinePreviewResponse, TimelineImportResult } from '../types';
import { authFetch } from './auth';

export async function previewTimeline(tripId: string, file: File): Promise<TimelinePreviewResponse> {
  const fd = new FormData();
  fd.append('file', file);
  const res = await authFetch(`/api/v1/trips/${tripId}/timeline/preview`, { method: 'POST', body: fd });
  if (!res.ok) throw new Error((await res.json()).error ?? 'Preview fehlgeschlagen');
  return await res.json();
}

export async function importTimeline(
  tripId: string,
  file: File,
  daysToProcess: string[],
  overwrite: Record<string, boolean>,
  autoCreate: boolean,
): Promise<TimelineImportResult> {
  const fd = new FormData();
  fd.append('file', file);
  fd.append('days_to_process', JSON.stringify(daysToProcess));
  fd.append('overwrite', JSON.stringify(overwrite));
  fd.append('auto_create', autoCreate ? 'true' : 'false');
  const res = await authFetch(`/api/v1/trips/${tripId}/timeline/import`, { method: 'POST', body: fd });
  if (!res.ok) throw new Error((await res.json()).error ?? 'Import fehlgeschlagen');
  return await res.json();
}
```

- [ ] **Step 3: Build verifizieren**

Run: `cd pwa && npm run build`

Expected: keine TS-Fehler.

- [ ] **Step 4: Commit**

```bash
git add pwa/src/types.ts pwa/src/api/timeline.ts
git commit -m "feat(pwa): types + API client for timeline import"
```

---

## Task 15: PWA TimelineImportModal

**Files:**
- Create: `pwa/src/components/TimelineImportModal.tsx`

- [ ] **Step 1: Modal komplett implementieren**

```tsx
// pwa/src/components/TimelineImportModal.tsx
import { useState } from 'react';
import { previewTimeline, importTimeline } from '../api/timeline';
import type { TimelinePreviewResponse, TimelinePreviewDay, TimelineImportResult } from '../types';

interface Props {
  tripId: string;
  onClose(): void;
  onDone(result: TimelineImportResult): void;
}

type Stage = 'pick' | 'preview' | 'importing' | 'result';

export default function TimelineImportModal({ tripId, onClose, onDone }: Props) {
  const [stage, setStage] = useState<Stage>('pick');
  const [file, setFile] = useState<File | null>(null);
  const [preview, setPreview] = useState<TimelinePreviewResponse | null>(null);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [overwrite, setOverwrite] = useState<Record<string, boolean>>({});
  const [autoCreate, setAutoCreate] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<TimelineImportResult | null>(null);

  async function handlePick(f: File) {
    setFile(f); setError(null);
    try {
      const p = await previewTimeline(tripId, f);
      setPreview(p);
      const sel = new Set(p.days.filter(d => d.has_motorized).map(d => d.date));
      setSelected(sel);
      setStage('preview');
    } catch (e) { setError((e as Error).message); }
  }

  async function handleImport() {
    if (!file || !preview) return;
    setStage('importing'); setError(null);
    try {
      const r = await importTimeline(tripId, file, [...selected], overwrite, autoCreate);
      setResult(r);
      setStage('result');
      onDone(r);
    } catch (e) { setError((e as Error).message); setStage('preview'); }
  }

  return (
    <div style={overlay}>
      <div style={modal}>
        <button onClick={onClose} style={closeBtn} aria-label="Schließen">×</button>
        <h2 style={{ marginTop: 0 }}>🗺 Timeline importieren</h2>

        {stage === 'pick' && (
          <div>
            <p style={{ color: '#555', fontSize: 14 }}>
              Lade die <code>Timeline.json</code> aus Google Maps hoch
              (Handy: Google Maps → Profilbild → Einstellungen → Persönliche Inhalte → „Zeitachsen-Daten exportieren").
              Auf dem Handy kannst du die Datei direkt aus dem Download-Ordner picken.
            </p>
            <input type="file" accept="application/json,.json" onChange={e => {
              const f = e.target.files?.[0]; if (f) handlePick(f);
            }} style={{ padding: 10, border: '2px dashed #aaa', borderRadius: 8, width: '100%', cursor: 'pointer' }} />
            {error && <div style={errStyle}>{error}</div>}
          </div>
        )}

        {stage === 'preview' && preview && (
          <div>
            <p style={{ color: '#555', fontSize: 13 }}>
              Trip-Zeitraum: {preview.trip_start} bis {preview.trip_end}.
              Gefunden: {preview.days.length} Tage mit Bewegungsdaten.
              {preview.skipped_outside_range.length > 0 && ` (${preview.skipped_outside_range.length} Tage außerhalb übersprungen.)`}
            </p>
            <label style={{ display: 'block', margin: '10px 0', fontSize: 13 }}>
              <input type="checkbox" checked={autoCreate} onChange={e => setAutoCreate(e.target.checked)} />
              {' '}Auto-Create für fehlende Tage (empfohlen)
            </label>
            <div style={{ maxHeight: 360, overflowY: 'auto', border: '1px solid #eee', borderRadius: 6, padding: 8 }}>
              {preview.days.map(d => <DayRow key={d.date} d={d} selected={selected} setSelected={setSelected} overwrite={overwrite} setOverwrite={setOverwrite} />)}
            </div>
            <div style={{ display: 'flex', gap: 10, marginTop: 14 }}>
              <button onClick={() => setStage('pick')} style={btnSecondary}>Zurück</button>
              <button onClick={handleImport} disabled={selected.size === 0} style={btnPrimary}>
                {selected.size} Tage importieren
              </button>
            </div>
            {error && <div style={errStyle}>{error}</div>}
          </div>
        )}

        {stage === 'importing' && (
          <div style={{ padding: 30, textAlign: 'center' }}>
            <p>Importiere {selected.size} Tage … das kann eine Weile dauern (Karten werden gerendert).</p>
            <div className="spinner" />
          </div>
        )}

        {stage === 'result' && result && (
          <div>
            <h3>Ergebnis</h3>
            <p>✅ {result.processed.length} Tage importiert · ⏭ {result.skipped.length} übersprungen · ⚠ {result.errors.length} Fehler</p>
            {result.overview_url && <p>🗺 Trip-Übersichtskarte aktualisiert</p>}
            {result.processed.slice(0, 5).map(p => (
              <div key={p.date} style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 6 }}>
                <img src={p.route_image_url} style={{ width: 100, height: 50, objectFit: 'cover', borderRadius: 4 }} />
                <span style={{ fontSize: 13 }}>{p.date}: {p.meta.distance_km} km{p.created ? ' (neu erstellt)' : ''}</span>
              </div>
            ))}
            <button onClick={onClose} style={{ ...btnPrimary, marginTop: 14 }}>Fertig</button>
          </div>
        )}
      </div>
    </div>
  );
}

function DayRow({ d, selected, setSelected, overwrite, setOverwrite }: {
  d: TimelinePreviewDay;
  selected: Set<string>;
  setSelected: (s: Set<string>) => void;
  overwrite: Record<string, boolean>;
  setOverwrite: (o: Record<string, boolean>) => void;
}) {
  const isSelected = selected.has(d.date);
  const isStandtag = !d.has_motorized;
  return (
    <div style={{ display: 'flex', alignItems: 'center', padding: '6px 0', borderBottom: '1px solid #f0f0f0', fontSize: 13 }}>
      <input
        type="checkbox"
        checked={isSelected}
        disabled={isStandtag}
        onChange={() => {
          const ns = new Set(selected);
          if (ns.has(d.date)) ns.delete(d.date); else ns.add(d.date);
          setSelected(ns);
        }}
        style={{ marginRight: 10 }}
      />
      <div style={{ flex: 1 }}>
        <strong>{d.date}</strong>
        {isStandtag ? <span style={{ color: '#999', marginLeft: 8 }}>Standtag (kein Womo)</span>
          : <span style={{ marginLeft: 8 }}>{d.distance_km} km · {d.modes.join(', ')}</span>}
      </div>
      {d.has_existing_route_image && (
        <label style={{ fontSize: 12, color: '#c0392b' }}>
          <input type="checkbox" checked={!!overwrite[d.date]} onChange={e => {
            const o = { ...overwrite }; o[d.date] = e.target.checked; setOverwrite(o);
          }} /> Überschreiben
        </label>
      )}
    </div>
  );
}

const overlay: React.CSSProperties = { position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000 };
const modal: React.CSSProperties = { background: '#fff', borderRadius: 8, padding: 24, maxWidth: 720, width: '90vw', maxHeight: '90vh', overflowY: 'auto', position: 'relative' };
const closeBtn: React.CSSProperties = { position: 'absolute', top: 12, right: 12, background: 'none', border: 'none', fontSize: 24, cursor: 'pointer', color: '#666' };
const btnPrimary: React.CSSProperties = { padding: '10px 18px', background: '#1976d2', color: '#fff', border: 'none', borderRadius: 6, cursor: 'pointer', fontSize: 14 };
const btnSecondary: React.CSSProperties = { padding: '10px 18px', background: '#eee', color: '#333', border: 'none', borderRadius: 6, cursor: 'pointer', fontSize: 14 };
const errStyle: React.CSSProperties = { color: '#c00', marginTop: 10, padding: 10, background: '#fee', borderRadius: 6, fontSize: 13 };
```

- [ ] **Step 2: Build verifizieren**

Run: `cd pwa && npm run build`

Expected: kein TS-Fehler.

- [ ] **Step 3: Commit**

```bash
git add pwa/src/components/TimelineImportModal.tsx
git commit -m "feat(pwa): TimelineImportModal with file-picker, preview, import flow"
```

---

## Task 16: TripPage Button + Modal-Integration

**Files:**
- Modify: `pwa/src/pages/TripPage.tsx`

- [ ] **Step 1: Modal-State + Button + Render anschließen**

```tsx
// pwa/src/pages/TripPage.tsx — am Anfang ergänzen:
import TimelineImportModal from '../components/TimelineImportModal';
// im State:
const [showImport, setShowImport] = useState(false);

// Button im Header-Bereich (Desktop-Modus, neben "Veröffentlichen"-Button):
{!isMobile && trip?.start_date && trip?.end_date && (
  <button onClick={() => setShowImport(true)} style={{ marginLeft: 8 }}>
    🗺 Timeline importieren
  </button>
)}

// Am Ende des JSX (vor closing </>):
{showImport && (
  <TimelineImportModal
    tripId={tripId!}
    onClose={() => setShowImport(false)}
    onDone={() => {
      setShowImport(false);
      // Reload entries to show new route_image_url + auto-created entries
      getEntries(tripId!).then(({ entries }) => setEntries(entries));
    }}
  />
)}
```

- [ ] **Step 2: Build verifizieren**

Run: `cd pwa && npm run build`

Expected: pass.

- [ ] **Step 3: Commit**

```bash
git add pwa/src/pages/TripPage.tsx
git commit -m "feat(pwa): TripPage opens TimelineImportModal, reloads entries on done"
```

---

## Task 17: JournalEntryPage Routen-Header

**Files:**
- Modify: `pwa/src/pages/JournalEntryPage.tsx`

- [ ] **Step 1: Routen-Header oberhalb der Blocks rendern**

```tsx
// JournalEntryPage.tsx — im Render-Bereich, vor den Blocks:
{entry.route_image_url && (
  <div style={{ margin: '16px 0', borderRadius: 8, overflow: 'hidden', boxShadow: '0 2px 8px rgba(0,0,0,0.1)' }}>
    <img src={entry.route_image_url} alt="Tagesroute" style={{ width: '100%', height: 'auto', display: 'block' }} />
    {entry.route_meta && (
      <div style={{ padding: '8px 12px', background: '#fafafa', fontSize: 13, color: '#555' }}>
        Importiert {new Date(entry.route_meta.imported_at).toLocaleDateString('de-DE')} aus Google Timeline
      </div>
    )}
  </div>
)}
```

- [ ] **Step 2: Build verifizieren**

Run: `cd pwa && npm run build`

Expected: pass.

- [ ] **Step 3: Commit**

```bash
git add pwa/src/pages/JournalEntryPage.tsx
git commit -m "feat(pwa): JournalEntryPage shows route map header above blocks"
```

---

## Task 18: .env.example + README

**Files:**
- Modify: `backend/.env.example`
- Modify: `backend/README.md` (falls vorhanden)

- [ ] **Step 1: .env.example ergänzen**

```bash
# Anhängen:
# OpenTopoMap tile cache (Sub-Projekt 4 Routenkarten)
OPENTOPOMAP_TILE_CACHE=/var/cache/opentopomap-tiles
OPENTOPOMAP_TILE_TTL_DAYS=30
WOHNMOBIL_ICON_PATH=/var/www/reise/backend/assets/wohnmobil-icon.png
```

- [ ] **Step 2: Commit**

```bash
git add backend/.env.example
git commit -m "docs: env vars for timeline route map rendering"
```

---

## Task 19: Manueller Live-Test

- [ ] **Step 1: Backend bauen + deployen**

Run:
```bash
ssh root@192.168.2.111 "cd /var/www/reise && git pull && cd backend && npm ci && npm run build && psql -U reise -d reise -f migrations/007_route_metadata.sql && mkdir -p /var/cache/opentopomap-tiles && pm2 restart reise-api --update-env"
```

- [ ] **Step 2: Wohnmobil-Icon auf Server**

Run:
```bash
ssh root@192.168.2.111 "cd /var/www/reise/backend && mkdir -p assets && wget -O assets/wohnmobil-icon.png https://xn--tnhardt-90a.de/wohnmobil-icon.png"
```

(Alternativ: `scp` aus lokalem Repo.)

- [ ] **Step 3: PWA bauen + deployen**

Run: `ssh root@192.168.2.111 "cd /var/www/reise/pwa && npm ci && npm run build && cp -r dist/* /var/www/tagebuch/"`

- [ ] **Step 4: Live-Test mit echter Zeitachse.json**

- Öffne https://tagebuch.jan-toenhardt.de
- Lege einen neuen Test-Trip an mit `start_date: 2025-07-19, end_date: 2025-08-08, title: "Sub4 Test"` (oder nutze einen existierenden Trip mit gepflegtem Datumsbereich)
- Klick „🗺 Timeline importieren" → Datei `C:\Users\jan74berlin\Downloads\Zeitachse.json` hochladen
- Vorschau zeigt 21 Tage → alle ausgewählt lassen, „Importieren"
- Erwartung: nach ~3-5 Min alle 21 Tage erstellt mit Karte + Übersichtskarte aktualisiert
- Auf Tag 1 navigieren → Karte oben sichtbar
- „Veröffentlichen" klicken → toenhardt.de Tag 1 hat Karte + Trip-Übersicht zeigt aggregierte Karte

- [ ] **Step 5: Re-Import + Re-Publish testen**

- Erneut „Timeline importieren" → Tag 5 mit „Überschreiben" wählen → prüfen, dass nur Tag 5 PNG neu, Übersicht neu, andere Tage unverändert
- Test-Trip löschen oder behalten, je nach Wunsch

- [ ] **Step 6: Commit + Push**

```bash
cd ~/Git/reise-app && git push origin main
```

---

## Self-Review Notes

Diese Punkte aus der Spec haben Tasks:
- ✅ Migration 007 → Task 1 (+ Trip-Felder aus Finalisierungen)
- ✅ Parser (beide Formate) → Task 4
- ✅ Splitter → Task 5
- ✅ OpenTopoMap-Renderer mit Cache → Tasks 6+7
- ✅ Übersichts-Renderer mit Multi-Color → Task 8
- ✅ Strato-Helper → Task 9
- ✅ POST /preview → Task 10
- ✅ POST /import mit Auto-Create + Overwrite-Logik + Overview-Regen → Task 11
- ✅ Publish-Template-Erweiterung (routeMap als i0, routeGif für Overview) → Task 12
- ✅ Publish-Pipeline regeneriert Overview bei publish/unpublish/publish-all → Task 13
- ✅ PWA Modal mit File-Picker (Desktop + Handy) → Tasks 14-16
- ✅ JournalEntryPage Routen-Header → Task 17
- ✅ .env.example → Task 18
- ✅ Manueller Live-Test → Task 19

Fehlerfälle aus Spec abgedeckt:
- 50 MB Limit → multer config in Task 10
- Trip ohne Daten → 422 in Task 10
- Unbekanntes Format → 400 in Task 4 + Task 10
- Tile-Server Fehler → durchgereicht in Task 11 (per-day errors[])
- Re-Import löscht alte PNG → Task 11 deleteFromStrato

Tasks bauen aufeinander auf in vernünftiger TDD-Reihenfolge: Datenstrukturen → Renderer → Routen → UI → Live-Test.
