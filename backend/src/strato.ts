import SftpClient from 'ssh2-sftp-client';
import { randomUUID } from 'crypto';
import path from 'path';

function getConfig() {
  return {
    host: process.env.STRATO_SFTP_HOST ?? '5397472.ssh.w1.strato.hosting',
    username: process.env.STRATO_SFTP_USER ?? 'stu935406240',
    password: process.env.STRATO_SFTP_PASSWORD ?? '',
  };
}

function getBaseUrl(): string {
  return (process.env.STRATO_BASE_URL ?? 'https://xn--tnhardt-90a.de').replace(/\/$/, '');
}

function mimeTypeToExt(mimetype: string): string {
  const map: Record<string, string> = {
    'image/jpeg': '.jpg',
    'image/png': '.png',
    'image/webp': '.webp',
    'image/heic': '.heic',
    'video/mp4': '.mp4',
  };
  return map[mimetype] ?? '.jpg';
}

export async function uploadToStrato(
  tripId: string,
  filename: string,
  buffer: Buffer,
  mimetype: string
): Promise<{ filePath: string; url: string }> {
  const ext = path.extname(filename) || mimeTypeToExt(mimetype);
  const uuid = randomUUID();
  const remoteDir = `/_entwuerfe/${tripId}`;
  const remoteFile = `${remoteDir}/${uuid}${ext}`;

  const client = new SftpClient();
  try {
    await client.connect(getConfig());
    await client.mkdir(remoteDir, true);
    await client.put(buffer, remoteFile);
  } finally {
    await client.end();
  }

  return {
    filePath: remoteFile,
    url: `${getBaseUrl()}${remoteFile}`,
  };
}

export async function deleteFromStrato(filePath: string): Promise<void> {
  const client = new SftpClient();
  try {
    await client.connect(getConfig());
    await client.delete(filePath, true);
  } catch {
    // best-effort: missing file is not an error
  } finally {
    await client.end();
  }
}

export async function uploadRouteMap(
  tripId: string,
  date: string,
  buffer: Buffer,
): Promise<{ filePath: string; url: string }> {
  const remoteDir = `/_entwuerfe/${tripId}`;
  const remoteFile = `${remoteDir}/route_${date}.png`;
  const client = new SftpClient();
  try {
    await client.connect(getConfig());
    await client.mkdir(remoteDir, true);
    await client.put(buffer, remoteFile);
  } finally {
    await client.end();
  }
  return { filePath: remoteFile, url: `${getBaseUrl()}${remoteFile}` };
}

export async function uploadOverviewMap(
  tripId: string,
  buffer: Buffer,
): Promise<{ filePath: string; url: string }> {
  const remoteDir = `/_entwuerfe/${tripId}`;
  const remoteFile = `${remoteDir}/trip-overview.png`;
  const client = new SftpClient();
  try {
    await client.connect(getConfig());
    await client.mkdir(remoteDir, true);
    await client.put(buffer, remoteFile);
  } finally {
    await client.end();
  }
  return { filePath: remoteFile, url: `${getBaseUrl()}${remoteFile}` };
}
