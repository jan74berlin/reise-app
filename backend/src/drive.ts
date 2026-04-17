import fs from 'fs';
import path from 'path';
import { randomUUID } from 'crypto';

// Local filesystem storage (replaces Google Drive for personal self-hosted setup).
// Files are stored in UPLOADS_DIR and served via /uploads static route.
// UPLOADS_DIR defaults to <project-root>/uploads, override with UPLOADS_DIR env var.

function getUploadsDir(): string {
  const dir = process.env.UPLOADS_DIR ?? path.join(__dirname, '..', 'uploads');
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
  return dir;
}

function getBaseUrl(): string {
  return (process.env.API_BASE_URL ?? 'http://localhost:3000').replace(/\/$/, '');
}

export async function uploadToDrive(
  filename: string,
  mimeType: string,
  buffer: Buffer
): Promise<{ fileId: string; viewUrl: string }> {
  const ext = path.extname(filename) || mimeTypeToExt(mimeType);
  const fileId = `${randomUUID()}${ext}`;
  const dest = path.join(getUploadsDir(), fileId);
  fs.writeFileSync(dest, buffer);
  const viewUrl = `${getBaseUrl()}/uploads/${fileId}`;
  return { fileId, viewUrl };
}

export async function deleteDriveFile(fileId: string): Promise<void> {
  const dest = path.join(getUploadsDir(), fileId);
  if (fs.existsSync(dest)) {
    fs.unlinkSync(dest);
  }
}

function mimeTypeToExt(mimeType: string): string {
  const map: Record<string, string> = {
    'image/jpeg': '.jpg',
    'image/png': '.png',
    'image/webp': '.webp',
    'image/heic': '.heic',
    'video/mp4': '.mp4',
  };
  return map[mimeType] ?? '';
}
