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
