import { Router } from 'express';
import { withFamily } from '../db';
import { requireAuth } from '../middleware/requireAuth';
import { uploadToDrive, deleteDriveFile } from '../drive';
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
        [params.tripId, night_id ?? null, req.user.userId, text ?? null, blocks ? JSON.stringify(blocks) : null]
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
        [text ?? null, blocks ? JSON.stringify(blocks) : null, params.entryId, params.tripId]
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
    await withFamily(req.user.familyId, (c) =>
      c.query(
        'DELETE FROM journal_entries WHERE id = $1 AND trip_id = $2',
        [params.entryId, params.tripId]
      )
    );
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
        'SELECT drive_file_id FROM media WHERE id = $1 AND journal_entry_id = $2',
        [params.mediaId, params.entryId]
      );
      if (m.rows.length === 0) return;
      await deleteDriveFile(m.rows[0].drive_file_id);
      await c.query('DELETE FROM media WHERE id = $1', [params.mediaId]);
    });
    res.status(204).send();
  } catch (err) {
    res.status(500).json({ error: 'Internal server error' });
  }
});

journalRouter.post('/:entryId/media', upload.single('photo'), async (req, res) => {
  const params = req.params as Record<string, string>;
  if (!req.file) { res.status(400).json({ error: 'No file' }); return; }
  let fileId: string | undefined;
  try {
    const uploaded = await uploadToDrive(req.file.originalname, req.file.mimetype, req.file.buffer);
    fileId = uploaded.fileId;
    const viewUrl = uploaded.viewUrl;
    const r = await withFamily(req.user.familyId, (c) =>
      c.query(
        'INSERT INTO media (journal_entry_id, drive_file_id, drive_view_url, filename) VALUES ($1,$2,$3,$4) RETURNING *',
        [params.entryId, fileId, viewUrl, req.file!.originalname]
      )
    );
    res.status(201).json({ media: r.rows[0] });
  } catch (err) {
    if (fileId) {
      // compensate: delete orphaned Drive file
      try { await deleteDriveFile(fileId); } catch { /* best-effort */ }
    }
    res.status(500).json({ error: 'Internal server error' });
  }
});
