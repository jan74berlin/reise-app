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
