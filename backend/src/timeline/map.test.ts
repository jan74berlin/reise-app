import { describe, it, expect } from 'vitest';
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
