import { Router } from 'express';
import { withFamily } from '../db';
import { requireAuth } from '../middleware/requireAuth';
import { uploadToDrive } from '../drive';
import multer from 'multer';

export const journalRouter = Router({ mergeParams: true });
journalRouter.use(requireAuth);

const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 20 * 1024 * 1024 } });

journalRouter.get('/', async (req, res) => {
  const params = req.params as Record<string, string>;
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
});

journalRouter.post('/', async (req, res) => {
  const params = req.params as Record<string, string>;
  const { text, night_id } = req.body;
  const r = await withFamily(req.user.familyId, (c) =>
    c.query(
      'INSERT INTO journal_entries (trip_id, night_id, user_id, text) VALUES ($1,$2,$3,$4) RETURNING *',
      [params.tripId, night_id ?? null, req.user.userId, text]
    )
  );
  res.status(201).json({ entry: r.rows[0] });
});

journalRouter.post('/:entryId/media', upload.single('photo'), async (req, res) => {
  const params = req.params as Record<string, string>;
  if (!req.file) { res.status(400).json({ error: 'No file' }); return; }
  const { fileId, viewUrl } = await uploadToDrive(
    req.file.originalname,
    req.file.mimetype,
    req.file.buffer
  );
  const r = await withFamily(req.user.familyId, (c) =>
    c.query(
      'INSERT INTO media (journal_entry_id, drive_file_id, drive_view_url, filename) VALUES ($1,$2,$3,$4) RETURNING *',
      [params.entryId, fileId, viewUrl, req.file!.originalname]
    )
  );
  res.status(201).json({ media: r.rows[0] });
});
