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

// Kontrastreiche dunkle Palette — vermeidet Grün/Gelb/Hellbraun
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
