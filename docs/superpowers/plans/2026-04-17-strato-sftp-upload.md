# Strato SFTP Upload Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace local filesystem photo storage with direct SFTP upload to Strato, storing photos at `/_entwuerfe/{tripId}/{uuid}.jpg`.

**Architecture:** A new `backend/src/strato.ts` module wraps `ssh2-sftp-client` and exports `uploadToStrato()` / `deleteFromStrato()`. The journal router swaps its import from `drive.ts` to `strato.ts`. A DB migration renames two columns to generic names. The PWA types and API client update the field names accordingly.

**Tech Stack:** Node.js/TypeScript, `ssh2-sftp-client`, Express/multer, PostgreSQL, Vitest, React/TypeScript

---

## File Map

| Action | Path | Responsibility |
|--------|------|----------------|
| Create | `backend/src/strato.ts` | SFTP upload/delete logic |
| Delete | `backend/src/drive.ts` | Old local-filesystem storage (removed) |
| Modify | `backend/src/journal/router.ts` | Swap drive→strato imports + SQL column names |
| Modify | `backend/src/journal/journal.test.ts` | Mock strato instead of drive, update assertions |
| Create | `backend/migrations/004_media_strato.sql` | Rename DB columns |
| Modify | `pwa/src/types.ts` | Media type: drive fields → file_path/url |
| Modify | `pwa/src/api/journal.ts` | Return type: drive_view_url → url |
| Modify | `pwa/src/components/PhotoUpload.tsx` | Use media.url |
| Modify | `pwa/src/pages/JournalEntryPage.tsx` | Use media.url |
| Modify | `pwa/src/pages/JournalEntryViewPage.tsx` | Use media.url |
| Modify | `pwa/src/pages/TripPage.tsx` | Use media.url |

---

## Task 1: DB migration — rename media columns

**Files:**
- Create: `backend/migrations/004_media_strato.sql`

Context: The `media` table currently has `drive_file_id` and `drive_view_url` columns. We rename them to `file_path` and `url` so they're storage-agnostic. The migration runs manually on the server via `psql`.

- [ ] **Step 1: Create migration file**

```sql
-- backend/migrations/004_media_strato.sql
ALTER TABLE media RENAME COLUMN drive_file_id TO file_path;
ALTER TABLE media RENAME COLUMN drive_view_url TO url;
```

- [ ] **Step 2: Apply migration on the server**

SSH into LXC 111 (or run from dev machine with DB access) and execute:

```bash
psql "$DATABASE_URL" -f backend/migrations/004_media_strato.sql
```

Expected output:
```
ALTER TABLE
ALTER TABLE
```

- [ ] **Step 3: Verify columns renamed**

```bash
psql "$DATABASE_URL" -c "\d media"
```

Expected: columns named `file_path` and `url` (no `drive_file_id` or `drive_view_url`).

- [ ] **Step 4: Commit**

```bash
git add backend/migrations/004_media_strato.sql
git commit -m "feat: migration 004 — rename media columns to file_path/url"
```

---

## Task 2: Install ssh2-sftp-client

**Files:**
- Modify: `backend/package.json`

Context: `ssh2-sftp-client` is the SFTP library. `@types/ssh2-sftp-client` provides TypeScript types. We add them as a runtime dependency (not devDependency — needed in production).

- [ ] **Step 1: Install the package**

```bash
cd backend
npm install ssh2-sftp-client
npm install --save-dev @types/ssh2-sftp-client
```

Expected: `package.json` and `package-lock.json` updated, no errors.

- [ ] **Step 2: Verify TypeScript can import it**

```bash
cd backend
npx tsx -e "import Client from 'ssh2-sftp-client'; console.log(typeof Client);"
```

Expected output: `function`

- [ ] **Step 3: Commit**

```bash
git add backend/package.json backend/package-lock.json
git commit -m "chore: add ssh2-sftp-client dependency"
```

---

## Task 3: Create backend/src/strato.ts

**Files:**
- Create: `backend/src/strato.ts`

Context: This module opens an SFTP connection per call (no connection pool — low traffic), uploads the file to `/_entwuerfe/{tripId}/{uuid}.jpg`, and returns `{ filePath, url }`. The `filePath` is the remote path (used for deletion); the `url` is the public HTTPS URL. Config comes from env vars.

`deleteFromStrato` accepts the stored `file_path` (e.g. `/_entwuerfe/abc/uuid.jpg`) and removes it from Strato. A missing file is silently ignored (so compensation on upload failure stays simple).

- [ ] **Step 1: Write the failing test**

Create `backend/src/strato.test.ts`:

```typescript
import { describe, it, expect, vi, beforeEach } from 'vitest';

// Mock ssh2-sftp-client before importing strato
vi.mock('ssh2-sftp-client', () => {
  const MockClient = vi.fn(() => ({
    connect: vi.fn().mockResolvedValue(undefined),
    mkdir: vi.fn().mockResolvedValue(undefined),
    put: vi.fn().mockResolvedValue(undefined),
    delete: vi.fn().mockResolvedValue(undefined),
    end: vi.fn().mockResolvedValue(undefined),
  }));
  return { default: MockClient };
});

import { uploadToStrato, deleteFromStrato } from './strato';
import SftpClient from 'ssh2-sftp-client';

describe('uploadToStrato', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    process.env.STRATO_SFTP_HOST = 'test.host';
    process.env.STRATO_SFTP_USER = 'testuser';
    process.env.STRATO_SFTP_PASSWORD = 'testpass';
    process.env.STRATO_BASE_URL = 'https://example.com';
  });

  it('returns filePath and url with correct structure', async () => {
    const result = await uploadToStrato(
      'trip-123',
      'photo.jpg',
      Buffer.from('fake-image'),
      'image/jpeg'
    );

    expect(result.filePath).toMatch(/^\/_entwuerfe\/trip-123\/[a-f0-9-]+\.jpg$/);
    expect(result.url).toMatch(/^https:\/\/example\.com\/_entwuerfe\/trip-123\/[a-f0-9-]+\.jpg$/);
  });

  it('connects, mkdirs, puts, and ends the connection', async () => {
    await uploadToStrato('trip-123', 'photo.jpg', Buffer.from('data'), 'image/jpeg');

    const MockClient = vi.mocked(SftpClient);
    const instance = MockClient.mock.results[0].value;
    expect(instance.connect).toHaveBeenCalledWith({
      host: 'test.host',
      username: 'testuser',
      password: 'testpass',
    });
    expect(instance.mkdir).toHaveBeenCalledWith('/_entwuerfe/trip-123', true);
    expect(instance.put).toHaveBeenCalledOnce();
    expect(instance.end).toHaveBeenCalledOnce();
  });

  it('calls end even if put throws', async () => {
    const MockClient = vi.mocked(SftpClient);
    MockClient.mockImplementationOnce(() => ({
      connect: vi.fn().mockResolvedValue(undefined),
      mkdir: vi.fn().mockResolvedValue(undefined),
      put: vi.fn().mockRejectedValue(new Error('SFTP error')),
      delete: vi.fn().mockResolvedValue(undefined),
      end: vi.fn().mockResolvedValue(undefined),
    }) as any);

    await expect(
      uploadToStrato('trip-123', 'photo.jpg', Buffer.from('data'), 'image/jpeg')
    ).rejects.toThrow('SFTP error');

    const instance = MockClient.mock.results[0].value;
    expect(instance.end).toHaveBeenCalledOnce();
  });
});

describe('deleteFromStrato', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    process.env.STRATO_SFTP_HOST = 'test.host';
    process.env.STRATO_SFTP_USER = 'testuser';
    process.env.STRATO_SFTP_PASSWORD = 'testpass';
  });

  it('calls delete with the given filePath', async () => {
    await deleteFromStrato('/_entwuerfe/trip-123/abc.jpg');

    const MockClient = vi.mocked(SftpClient);
    const instance = MockClient.mock.results[0].value;
    expect(instance.delete).toHaveBeenCalledWith('/_entwuerfe/trip-123/abc.jpg', true);
    expect(instance.end).toHaveBeenCalledOnce();
  });

  it('calls end even if delete throws', async () => {
    const MockClient = vi.mocked(SftpClient);
    MockClient.mockImplementationOnce(() => ({
      connect: vi.fn().mockResolvedValue(undefined),
      delete: vi.fn().mockRejectedValue(new Error('delete error')),
      end: vi.fn().mockResolvedValue(undefined),
    }) as any);

    await expect(deleteFromStrato('/_entwuerfe/trip-123/abc.jpg')).resolves.toBeUndefined();
    const instance = MockClient.mock.results[0].value;
    expect(instance.end).toHaveBeenCalledOnce();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

```bash
cd backend
npm test -- strato
```

Expected: FAIL with `Cannot find module './strato'`

- [ ] **Step 3: Write strato.ts**

Create `backend/src/strato.ts`:

```typescript
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
```

- [ ] **Step 4: Run tests to verify they pass**

```bash
cd backend
npm test -- strato
```

Expected: all 5 tests PASS

- [ ] **Step 5: Commit**

```bash
git add backend/src/strato.ts backend/src/strato.test.ts
git commit -m "feat: add strato.ts — SFTP upload/delete module"
```

---

## Task 4: Update journal router — swap drive → strato

**Files:**
- Modify: `backend/src/journal/router.ts`
- Modify: `backend/src/journal/journal.test.ts`

Context: Three things change in the router:
1. Import `uploadToStrato`/`deleteFromStrato` from `strato` instead of `drive`
2. Call signature change: `uploadToStrato(tripId, filename, buffer, mimetype)` returns `{ filePath, url }` (not `{ fileId, viewUrl }`)
3. SQL queries use new column names `file_path` and `url` (not `drive_file_id`, `drive_view_url`)

The test file mocks `../strato` instead of `../drive` and asserts the new field names.

- [ ] **Step 1: Update the test mock and assertions**

Replace `backend/src/journal/journal.test.ts` entirely:

```typescript
import { describe, it, expect, beforeAll, afterAll, vi } from 'vitest';
import request from 'supertest';
import { app } from '../index';
import { pool } from '../db';

vi.mock('../strato', () => ({
  uploadToStrato: vi.fn().mockResolvedValue({
    filePath: '/_entwuerfe/test-trip/test-uuid.jpg',
    url: 'https://xn--tnhardt-90a.de/_entwuerfe/test-trip/test-uuid.jpg',
  }),
  deleteFromStrato: vi.fn().mockResolvedValue(undefined),
}));

let token: string;
let tripId: string;
let nightId: string;
let entryId: string;

beforeAll(async () => {
  await pool.query(`
    UPDATE journal_entries SET user_id = NULL
    WHERE user_id IN (SELECT id FROM users WHERE email = 'journaltest@test-reise.de')
  `);
  await pool.query("DELETE FROM families WHERE name = 'JournalTestFam'");

  const reg = await request(app).post('/api/v1/auth/register').send({
    email: 'journaltest@test-reise.de',
    password: 'pw',
    display_name: 'JournalTester',
    family_name: 'JournalTestFam',
  });
  token = reg.body.token;

  const t = await request(app)
    .post('/api/v1/trips')
    .set('Authorization', `Bearer ${token}`)
    .send({ title: 'Journal Test Trip' });
  tripId = t.body.trip.id;

  const n = await request(app)
    .post(`/api/v1/trips/${tripId}/nights`)
    .set('Authorization', `Bearer ${token}`)
    .send({ night_number: 1, date: '2026-06-06', lat_center: 54.1, lng_center: 22.5 });
  nightId = n.body.night.id;

  const e = await request(app)
    .post(`/api/v1/trips/${tripId}/journal`)
    .set('Authorization', `Bearer ${token}`)
    .send({ text: 'Toller Tag!', night_id: nightId });
  entryId = e.body.entry.id;
});

afterAll(async () => {
  await pool.query(`
    UPDATE journal_entries SET user_id = NULL
    WHERE user_id IN (SELECT id FROM users WHERE email = 'journaltest@test-reise.de')
  `);
  await pool.query("DELETE FROM families WHERE name = 'JournalTestFam'");
});

describe('Journal entries CRUD', () => {
  it('POST /api/v1/trips/:tripId/journal — creates entry, returns 201', async () => {
    expect(entryId).toBeTruthy();

    const res = await request(app)
      .post(`/api/v1/trips/${tripId}/journal`)
      .set('Authorization', `Bearer ${token}`)
      .send({ text: 'Zweiter Eintrag', night_id: nightId });
    expect(res.status).toBe(201);
    expect(res.body.entry.text).toBe('Zweiter Eintrag');
    expect(res.body.entry.trip_id).toBe(tripId);
  });

  it('GET /api/v1/trips/:tripId/journal — returns entries array with media[]', async () => {
    const res = await request(app)
      .get(`/api/v1/trips/${tripId}/journal`)
      .set('Authorization', `Bearer ${token}`);
    expect(res.status).toBe(200);
    expect(Array.isArray(res.body.entries)).toBe(true);
    expect(res.body.entries.length).toBeGreaterThanOrEqual(1);
    expect(Array.isArray(res.body.entries[0].media)).toBe(true);
  });

  it('POST /:entryId/media — uploads photo via strato mock, returns file_path + url', async () => {
    const res = await request(app)
      .post(`/api/v1/trips/${tripId}/journal/${entryId}/media`)
      .set('Authorization', `Bearer ${token}`)
      .attach('photo', Buffer.from('fake-image-data'), { filename: 'test.jpg', contentType: 'image/jpeg' });
    expect(res.status).toBe(201);
    expect(res.body.media.file_path).toBe('/_entwuerfe/test-trip/test-uuid.jpg');
    expect(res.body.media.url).toBe('https://xn--tnhardt-90a.de/_entwuerfe/test-trip/test-uuid.jpg');
    expect(res.body.media.filename).toBe('test.jpg');
  });

  it('POST /:entryId/media — returns 400 if no file', async () => {
    const res = await request(app)
      .post(`/api/v1/trips/${tripId}/journal/${entryId}/media`)
      .set('Authorization', `Bearer ${token}`);
    expect(res.status).toBe(400);
    expect(res.body.error).toBe('No file');
  });

  it('POST /:entryId/media — returns 400 for disallowed file type', async () => {
    const res = await request(app)
      .post(`/api/v1/trips/${tripId}/journal/${entryId}/media`)
      .set('Authorization', `Bearer ${token}`)
      .attach('photo', Buffer.from('fake-data'), { filename: 'test.txt', contentType: 'text/plain' });
    expect(res.status).toBe(400);
    expect(res.body.error).toBe('No file');
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

```bash
cd backend
npm test -- journal
```

Expected: FAIL — `uploadToStrato` import not found in router (still imports from `drive`)

- [ ] **Step 3: Update journal router**

Replace `backend/src/journal/router.ts` entirely:

```typescript
import { Router } from 'express';
import { withFamily } from '../db';
import { requireAuth } from '../middleware/requireAuth';
import { uploadToStrato, deleteFromStrato } from '../strato';
import multer from 'multer';

export const journalRouter = Router({ mergeParams: true });
journalRouter.use(requireAuth);

const ALLOWED_TYPES = ['image/jpeg', 'image/png', 'image/webp', 'image/heic', 'video/mp4'];

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 20 * 1024 * 1024 },
  fileFilter: (_req, file, cb) => {
    cb(null, ALLOWED_TYPES.includes(file.mimetype));
  },
});

journalRouter.get('/', async (req, res) => {
  const params = req.params as Record<string, string>;
  try {
    const r = await withFamily(req.user.familyId, async (c) => {
      const entries = await c.query(
        'SELECT * FROM journal_entries WHERE trip_id = $1 ORDER BY created_at',
        [params.tripId]
      );
      for (const e of entries.rows) {
        const m = await c.query('SELECT * FROM media WHERE journal_entry_id = $1', [e.id]);
        e.media = m.rows;
      }
      return entries;
    });
    res.json({ entries: r.rows });
  } catch (err) {
    res.status(500).json({ error: 'Internal server error' });
  }
});

journalRouter.post('/', async (req, res) => {
  const params = req.params as Record<string, string>;
  const { text, night_id, blocks } = req.body;
  try {
    const r = await withFamily(req.user.familyId, (c) =>
      c.query(
        'INSERT INTO journal_entries (trip_id, night_id, user_id, text, blocks) VALUES ($1,$2,$3,$4,$5) RETURNING *',
        [params.tripId, night_id ?? null, req.user.userId, text ?? null, blocks ?? null]
      )
    );
    res.status(201).json({ entry: r.rows[0] });
  } catch (err) {
    res.status(500).json({ error: 'Internal server error' });
  }
});

journalRouter.put('/:entryId', async (req, res) => {
  const params = req.params as Record<string, string>;
  const { text, blocks } = req.body;
  try {
    const r = await withFamily(req.user.familyId, (c) =>
      c.query(
        `UPDATE journal_entries
         SET text = COALESCE($1, text),
             blocks = COALESCE($2::jsonb, blocks),
             updated_at = now()
         WHERE id = $3 AND trip_id = $4
         RETURNING *`,
        [text ?? null, blocks ?? null, params.entryId, params.tripId]
      )
    );
    if (r.rows.length === 0) { res.status(404).json({ error: 'Not found' }); return; }
    res.json({ entry: r.rows[0] });
  } catch (err) {
    res.status(500).json({ error: 'Internal server error' });
  }
});

journalRouter.delete('/:entryId', async (req, res) => {
  const params = req.params as Record<string, string>;
  try {
    const r = await withFamily(req.user.familyId, (c) =>
      c.query(
        'DELETE FROM journal_entries WHERE id = $1 AND trip_id = $2 RETURNING id',
        [params.entryId, params.tripId]
      )
    );
    if (r.rowCount === 0) { res.status(404).json({ error: 'Not found' }); return; }
    res.status(204).send();
  } catch (err) {
    res.status(500).json({ error: 'Internal server error' });
  }
});

journalRouter.delete('/:entryId/media/:mediaId', async (req, res) => {
  const params = req.params as Record<string, string>;
  try {
    await withFamily(req.user.familyId, async (c) => {
      const m = await c.query(
        'DELETE FROM media WHERE id = $1 AND journal_entry_id = $2 RETURNING file_path',
        [params.mediaId, params.entryId]
      );
      if (m.rowCount === 0) return;
      await deleteFromStrato(m.rows[0].file_path).catch(() => {});
    });
    res.status(204).send();
  } catch (err) {
    res.status(500).json({ error: 'Internal server error' });
  }
});

journalRouter.post('/:entryId/media', upload.single('photo'), async (req, res) => {
  const params = req.params as Record<string, string>;
  if (!req.file) { res.status(400).json({ error: 'No file' }); return; }
  let filePath: string | undefined;
  try {
    const uploaded = await uploadToStrato(
      params.tripId,
      req.file.originalname,
      req.file.buffer,
      req.file.mimetype
    );
    filePath = uploaded.filePath;
    const r = await withFamily(req.user.familyId, (c) =>
      c.query(
        'INSERT INTO media (journal_entry_id, file_path, url, filename) VALUES ($1,$2,$3,$4) RETURNING *',
        [params.entryId, filePath, uploaded.url, req.file!.originalname]
      )
    );
    res.status(201).json({ media: r.rows[0] });
  } catch (err) {
    if (filePath) {
      try { await deleteFromStrato(filePath); } catch { /* best-effort */ }
    }
    res.status(500).json({ error: 'Internal server error' });
  }
});
```

- [ ] **Step 4: Run tests to verify they pass**

```bash
cd backend
npm test -- journal
```

Expected: all 5 tests PASS

- [ ] **Step 5: Run full test suite to catch regressions**

```bash
cd backend
npm test
```

Expected: all tests PASS

- [ ] **Step 6: Delete drive.ts**

```bash
rm backend/src/drive.ts
```

Also remove the `googleapis` and `node-fetch` packages if nothing else imports them:

```bash
cd backend
grep -r "googleapis\|node-fetch" src/ --include="*.ts"
```

If output is empty, remove them:

```bash
npm uninstall googleapis node-fetch
```

- [ ] **Step 7: Run tests again to confirm drive.ts removal doesn't break anything**

```bash
cd backend
npm test
```

Expected: all tests PASS

- [ ] **Step 8: Commit**

```bash
git add backend/src/journal/router.ts backend/src/journal/journal.test.ts
git rm backend/src/drive.ts
git add backend/package.json backend/package-lock.json
git commit -m "feat: swap drive → strato in journal router, update tests"
```

---

## Task 5: Update PWA types and API client

**Files:**
- Modify: `pwa/src/types.ts`
- Modify: `pwa/src/api/journal.ts`
- Modify: `pwa/src/components/PhotoUpload.tsx`
- Modify: `pwa/src/pages/JournalEntryPage.tsx`
- Modify: `pwa/src/pages/JournalEntryViewPage.tsx`
- Modify: `pwa/src/pages/TripPage.tsx`

Context: The backend now returns `file_path` and `url` in the `media` object. All PWA code that references `drive_file_id` or `drive_view_url` must be updated. The `uploadMedia` return type changes from `drive_view_url` to `url`.

- [ ] **Step 1: Update pwa/src/types.ts**

Change the `Media` interface (lines 17–23):

```typescript
export interface Media {
  id: string;
  journal_entry_id: string;
  file_path: string;
  url: string;
  filename: string;
}
```

- [ ] **Step 2: Update pwa/src/api/journal.ts**

Change the `uploadMedia` return type (line 36–37):

```typescript
export async function uploadMedia(
  tripId: string,
  entryId: string,
  file: File
): Promise<{ media: { id: string; url: string } }> {
  const form = new FormData();
  form.append('photo', file);
  return apiFetch(`/api/v1/trips/${tripId}/journal/${entryId}/media`, {
    method: 'POST',
    body: form,
  });
}
```

- [ ] **Step 3: Update pwa/src/components/PhotoUpload.tsx**

Find and replace `media.drive_view_url` → `media.url` (line 38).

Current line 38:
```typescript
        onUploaded(media.id, media.drive_view_url);
```

New:
```typescript
        onUploaded(media.id, media.url);
```

- [ ] **Step 4: Update pwa/src/pages/JournalEntryPage.tsx**

Find and replace `media.drive_view_url` → `media.url` (line 187).

Current:
```typescript
                            <img src={media.drive_view_url} alt=""
```

New:
```typescript
                            <img src={media.url} alt=""
```

- [ ] **Step 5: Update pwa/src/pages/JournalEntryViewPage.tsx**

Find and replace both occurrences of `drive_view_url` → `url` (lines 59 and 61).

Current:
```typescript
                src={media.drive_view_url}
```
```typescript
                onClick={() => setLightbox(media.drive_view_url)}
```

New:
```typescript
                src={media.url}
```
```typescript
                onClick={() => setLightbox(media.url)}
```

- [ ] **Step 6: Update pwa/src/pages/TripPage.tsx**

Find and replace both occurrences of `drive_view_url` → `url` (lines 31 and 33).

Current:
```typescript
      return media?.drive_view_url ?? null;
```
```typescript
    return entry.media[0]?.drive_view_url ?? null;
```

New:
```typescript
      return media?.url ?? null;
```
```typescript
    return entry.media[0]?.url ?? null;
```

- [ ] **Step 7: Verify TypeScript compiles without errors**

```bash
cd pwa
npx tsc --noEmit
```

Expected: no output (zero errors)

- [ ] **Step 8: Run PWA tests**

```bash
cd pwa
npm test
```

Expected: all tests PASS

- [ ] **Step 9: Commit**

```bash
git add pwa/src/types.ts pwa/src/api/journal.ts pwa/src/components/PhotoUpload.tsx \
        pwa/src/pages/JournalEntryPage.tsx pwa/src/pages/JournalEntryViewPage.tsx \
        pwa/src/pages/TripPage.tsx
git commit -m "feat: update PWA types and components — drive_view_url → url"
```

---

## Task 6: Add env vars + Strato .htaccess + deploy

**Files:**
- Modify: `.env` (on server, not committed)
- Create: `/_entwuerfe/.htaccess` on Strato (via SFTP, one-time)

Context: The backend needs four env vars. The `/_entwuerfe/` directory on Strato needs a `.htaccess` to disable directory listing. Both are one-time setup tasks.

- [ ] **Step 1: Add env vars to server .env**

SSH into LXC 111, then edit `/opt/reise-app/backend/.env` and add:

```
STRATO_SFTP_HOST=5397472.ssh.w1.strato.hosting
STRATO_SFTP_USER=stu935406240
STRATO_SFTP_PASSWORD=#Jan74berlin
STRATO_BASE_URL=https://xn--tnhardt-90a.de
```

- [ ] **Step 2: Create /_entwuerfe/.htaccess on Strato**

From any machine with SFTP access:

```bash
echo "Options -Indexes" > /tmp/htaccess_entwuerfe
sftp -o StrictHostKeyChecking=no stu935406240@5397472.ssh.w1.strato.hosting <<'EOF'
mkdir /_entwuerfe
put /tmp/htaccess_entwuerfe /_entwuerfe/.htaccess
bye
EOF
```

Or use `ssh2-sftp-client` via a one-time Node.js script. Verify by visiting `https://xn--tnhardt-90a.de/_entwuerfe/` — should return 403 Forbidden (not a directory listing).

- [ ] **Step 3: Pull latest code on server and restart**

```bash
ssh jan@192.168.2.111 "cd /opt/reise-app && git pull && cd backend && npm ci && pm2 restart reise-api"
```

Expected: `reise-api` restarted, no errors in `pm2 logs reise-api --lines 20`.

- [ ] **Step 4: Smoke test — upload a photo via PWA**

1. Open `https://tagebuch.jan-toenhardt.de` in browser
2. Log in, navigate to a trip → journal entry
3. Upload a photo
4. Verify the photo displays correctly (URL should be `https://xn--tnhardt-90a.de/_entwuerfe/{tripId}/...`)

- [ ] **Step 5: Commit env var template (without secrets)**

Add a `.env.example` to the repo so future developers know what's needed:

```bash
# Only if backend/.env.example doesn't already exist:
cat > backend/.env.example << 'EOF'
DATABASE_URL=postgres://...
JWT_SECRET=...
API_BASE_URL=https://api.example.com
STRATO_SFTP_HOST=5397472.ssh.w1.strato.hosting
STRATO_SFTP_USER=stu935406240
STRATO_SFTP_PASSWORD=
STRATO_BASE_URL=https://xn--tnhardt-90a.de
EOF
git add backend/.env.example
git commit -m "chore: add .env.example with Strato env var names"
```

---
