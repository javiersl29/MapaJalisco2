import 'dotenv/config';
import express from 'express';
import cors from 'cors';
import path from 'node:path';
import fs from 'node:fs';
import multer from 'multer';
import { fileURLToPath } from 'node:url';
import { config } from './config.js';
import { pool } from './db/pool.js';
import authRoutes from './routes/auth.js';
import userRoutes from './routes/users.js';
import layerRoutes from './routes/layers.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
app.use(cors());
app.use(express.json({ limit: '10mb' }));

app.get('/api/health', async (_req, res) => {
  try {
    const { rows } = await pool.query('SELECT 1 AS ok');
    res.json({ ok: true, db: rows[0].ok === 1 });
  } catch (e) {
    res.status(500).json({ ok: false, error: e.message });
  }
});

app.get('/api/config', (_req, res) => {
  res.json({ mapbox_token: process.env.MAPBOX_TOKEN || '' });
});

const logoUpload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 5 * 1024 * 1024 } });
app.post('/api/logo', logoUpload.single('logo'), (req, res) => {
  if (!req.file) return res.status(400).json({ error: 'No se envio archivo' });
  const imgDir = path.join(__dirname, '..', '..', 'public', 'img');
  if (!fs.existsSync(imgDir)) fs.mkdirSync(imgDir, { recursive: true });
  fs.writeFileSync(path.join(imgDir, 'semadet-logo.png'), req.file.buffer);
  res.json({ ok: true, message: 'Logo actualizado' });
});

app.use('/api/auth', authRoutes);
app.use('/api/users', userRoutes);
app.use('/api/layers', layerRoutes);

app.use(express.static(path.join(__dirname, '..', '..', 'public')));
app.use('/uploads', express.static(path.resolve(config.uploadDir)));

app.get('/', (_req, res) => res.sendFile(path.join(__dirname, '..', '..', 'public', 'index.html')));
app.get('/admin', (_req, res) => res.sendFile(path.join(__dirname, '..', '..', 'public', 'admin.html')));
app.get('/login', (_req, res) => res.sendFile(path.join(__dirname, '..', '..', 'public', 'login.html')));

app.use((err, _req, res, _next) => {
  console.error(err);
  res.status(500).json({ error: err.message || 'Error interno' });
});

const server = app.listen(config.port, () => {
  console.log(`[server] http://localhost:${config.port}`);
});

process.on('SIGTERM', () => server.close(() => pool.end()));
process.on('SIGINT', () => server.close(() => process.exit(0)));
