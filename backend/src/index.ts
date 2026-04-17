import 'dotenv/config';
import express from 'express';
import http from 'http';
import path from 'path';
import fs from 'fs';
import { authRouter } from './auth/router';
import { tripsRouter } from './trips/router';
import { nightsRouter } from './nights/router';
import { pnRouter } from './pn/router';
import { journalRouter } from './journal/router';

export const app = express();
app.use(express.json());

// Serve uploaded media files
const uploadsDir = process.env.UPLOADS_DIR ?? path.join(__dirname, '..', 'uploads');
if (!fs.existsSync(uploadsDir)) fs.mkdirSync(uploadsDir, { recursive: true });
app.use('/uploads', express.static(uploadsDir));

app.get('/health', (_req, res) => {
  res.json({ status: 'ok' });
});

app.use('/api/v1/auth', authRouter);
app.use('/api/v1/trips', tripsRouter);
app.use('/api/v1/trips/:tripId/nights', nightsRouter);
app.use('/api/v1/pn', pnRouter);
app.use('/api/v1/trips/:tripId/journal', journalRouter);

export const server = http.createServer(app);

if (require.main === module) {
  const port = process.env.PORT ?? 3000;
  server.listen(port, () => console.log(`reise-api listening on :${port}`));
}
