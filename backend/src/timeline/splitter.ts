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

const MOTORIZED: Set<Mode> = new Set(['driving', 'bus', 'train', 'ferry', 'motorcycle']);

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
      if (s.points) day.points.push(...s.points);
    }
  }
  return out;
}
