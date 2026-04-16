import 'dotenv/config';
import express from 'express';
import http from 'http';
import { authRouter } from './auth/router';

export const app = express();
app.use(express.json());

app.get('/health', (_req, res) => {
  res.json({ status: 'ok' });
});

app.use('/api/v1/auth', authRouter);

export const server = http.createServer(app);

if (require.main === module) {
  const port = process.env.PORT ?? 3000;
  server.listen(port, () => console.log(`reise-api listening on :${port}`));
}
