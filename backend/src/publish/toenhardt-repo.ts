import * as fs from 'fs/promises';
import * as path from 'path';
import { execFile } from 'child_process';
import { promisify } from 'util';

const execFileP = promisify(execFile);

const REPO_PATH = process.env.TOENHARDT_REPO_PATH ?? '/var/www/toenhardt-repo';
const REMOTE_URL = process.env.TOENHARDT_REMOTE_URL ?? 'git@github-toenhardt:jan74berlin/toenhardt.git';

export type PagesJson = Record<string, Record<string, unknown>>;

export async function readPagesJson(repoPath: string = REPO_PATH): Promise<PagesJson> {
  try {
    const content = await fs.readFile(path.join(repoPath, 'pages.json'), 'utf-8');
    return JSON.parse(content);
  } catch (err: unknown) {
    const e = err as NodeJS.ErrnoException;
    if (e.code === 'ENOENT') return {};
    throw err;
  }
}

export async function writePagesJson(repoPath: string = REPO_PATH, pages: PagesJson): Promise<void> {
  const fp = path.join(repoPath, 'pages.json');
  await fs.writeFile(fp, JSON.stringify(pages, null, 2), 'utf-8');
}

export async function ensureRepoCloned(): Promise<void> {
  try {
    await fs.access(path.join(REPO_PATH, '.git'));
  } catch {
    await execFileP('git', ['clone', REMOTE_URL, REPO_PATH]);
  }
}

export async function pullRepo(): Promise<void> {
  await execFileP('git', ['-C', REPO_PATH, 'pull', '--rebase']);
}

export async function commitAndPush(message: string): Promise<void> {
  await execFileP('git', ['-C', REPO_PATH, 'add', 'pages.json']);
  const status = await execFileP('git', ['-C', REPO_PATH, 'status', '--porcelain']);
  if (!status.stdout.trim()) return;
  await execFileP('git', ['-C', REPO_PATH, '-c', 'user.email=lxc111@toenhardt.de', '-c', 'user.name=LXC Publish Bot', 'commit', '-m', message]);
  try {
    await execFileP('git', ['-C', REPO_PATH, 'push']);
  } catch (err) {
    await execFileP('git', ['-C', REPO_PATH, 'pull', '--rebase']);
    await execFileP('git', ['-C', REPO_PATH, 'push']);
  }
}

export async function syncPagesJsonToStrato(): Promise<void> {
  const Client = (await import('ssh2-sftp-client')).default;
  const sftp = new Client();
  try {
    await sftp.connect({
      host: process.env.STRATO_SFTP_HOST!,
      username: process.env.STRATO_SFTP_USER!,
      password: process.env.STRATO_SFTP_PASSWORD!,
    });
    const localPath = path.join(REPO_PATH, 'pages.json');
    await sftp.put(localPath, '/pages.json');
  } finally {
    await sftp.end();
  }
}
