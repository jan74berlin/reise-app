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
