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
        'SELECT * FROM journal_entries WHERE trip_id = $1 ORDER BY date ASC NULLS LAST, created_at ASC',
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
  const { text, night_id, blocks, date } = req.body;
  try {
    const r = await withFamily(req.user.familyId, (c) =>
      c.query(
        'INSERT INTO journal_entries (trip_id, night_id, user_id, text, blocks, date) VALUES ($1,$2,$3,$4,$5,$6) RETURNING *',
        [params.tripId, night_id ?? null, req.user.userId, text ?? null, blocks ?? null, date ?? null]
      )
    );
    res.status(201).json({ entry: r.rows[0] });
  } catch (err) {
    res.status(500).json({ error: 'Internal server error' });
  }
});

journalRouter.put('/:entryId', async (req, res) => {
  const params = req.params as Record<string, string>;
  const { text, blocks, date } = req.body;
  try {
    const r = await withFamily(req.user.familyId, (c) =>
      c.query(
        `UPDATE journal_entries
         SET text = COALESCE($1, text),
             blocks = COALESCE($2::jsonb, blocks),
             date = COALESCE($3::date, date),
             updated_at = now()
         WHERE id = $4 AND trip_id = $5
         RETURNING *`,
        [text ?? null, blocks ?? null, date ?? null, params.entryId, params.tripId]
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
    const r = await withFamily(req.user.familyId, async (c) => {
      const media = await c.query(
        'SELECT file_path FROM media WHERE journal_entry_id = $1',
        [params.entryId]
      );
      const del = await c.query(
        'DELETE FROM journal_entries WHERE id = $1 AND trip_id = $2 RETURNING id',
        [params.entryId, params.tripId]
      );
      if (del.rowCount === 0) return null;
      for (const row of media.rows) {
        await deleteFromStrato(row.file_path).catch(() => {});
      }
      return del;
    });
    if (!r || r.rowCount === 0) { res.status(404).json({ error: 'Not found' }); return; }
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
