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
    expect(path1).toBeDefined();
    expect(path1!.points?.length).toBe(3);
    expect(path1!.points?.[0].lat).toBeCloseTo(52.68, 1);

    const act = segs.find(s => s.kind === 'activity' && s.mode === 'driving');
    expect(act).toBeDefined();
    expect(act!.distanceMeters).toBe(350000);

    const walk = segs.find(s => s.mode === 'walking');
    expect(walk).toBeDefined();
  });

  it('parses legacy timelineObjects format', () => {
    const segs = parseTimeline(LEGACY);
    const act = segs.find(s => s.kind === 'activity');
    expect(act).toBeDefined();
    expect(act!.mode).toBe('driving');
    expect(act!.distanceMeters).toBe(350000);
    expect(act!.points?.length).toBe(4);
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
