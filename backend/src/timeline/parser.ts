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
        distanceMeters: s.activity.distanceMeters,
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
        distanceMeters: a.distance,
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
