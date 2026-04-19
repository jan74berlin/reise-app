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

const SUBDOMAINS = ['a', 'b', 'c'];

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
