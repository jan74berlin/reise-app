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
