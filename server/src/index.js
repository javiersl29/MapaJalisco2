import 'dotenv/config';
import express from 'express';
import cors from 'cors';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { config } from './config.js';
import { pool, query } from './db/pool.js';
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

async function bootstrapDb() {
  if (process.env.INIT_DB_ON_BOOT !== 'true') return;
  try {
    await query('CREATE EXTENSION IF NOT EXISTS postgis');
    const SQL_LAYERS = `
      CREATE TABLE IF NOT EXISTS users (
        id SERIAL PRIMARY KEY,
        username VARCHAR(64) UNIQUE NOT NULL,
        password_hash TEXT NOT NULL,
        role VARCHAR(16) NOT NULL CHECK (role IN ('admin','editor','viewer')),
        created_at TIMESTAMPTZ NOT NULL DEFAULT now()
      );
      CREATE TABLE IF NOT EXISTS layers (
        id SERIAL PRIMARY KEY,
        name VARCHAR(128) UNIQUE NOT NULL,
        title VARCHAR(255) NOT NULL,
        type VARCHAR(16) NOT NULL CHECK (type IN ('vector','raster')),
        format VARCHAR(32) NOT NULL,
        srid INTEGER NOT NULL DEFAULT 4326,
        bbox_minx DOUBLE PRECISION,
        bbox_miny DOUBLE PRECISION,
        bbox_maxx DOUBLE PRECISION,
        bbox_maxy DOUBLE PRECISION,
        style JSONB NOT NULL DEFAULT '{}'::jsonb,
        visible BOOLEAN NOT NULL DEFAULT true,
        opacity DOUBLE PRECISION NOT NULL DEFAULT 1.0,
        z_index INTEGER NOT NULL DEFAULT 0,
        description TEXT,
        file_path TEXT,
        original_name TEXT,
        size_bytes BIGINT,
        created_by INTEGER REFERENCES users(id) ON DELETE SET NULL,
        created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
        updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
      );
      CREATE INDEX IF NOT EXISTS idx_layers_visible ON layers(visible);
    `;
    await query(SQL_LAYERS);

    const { rows } = await query('SELECT COUNT(*)::int AS c FROM users');
    if (rows[0].c === 0) {
      const bcrypt = await import('bcryptjs');
      const hash = await bcrypt.default.hash(config.bootstrapAdmin.password, 10);
      await query(
        'INSERT INTO users (username, password_hash, role) VALUES ($1,$2,$3)',
        [config.bootstrapAdmin.username, hash, 'admin']
      );
      console.log(`[bootstrap] Admin creado: ${config.bootstrapAdmin.username}`);
    } else {
      console.log('[bootstrap] DB ya inicializada');
    }
  } catch (e) {
    console.error('[bootstrap] Error inicializando DB:', e.message);
    throw e;
  }
}

await bootstrapDb();

const server = app.listen(config.port, () => {
  console.log(`[server] http://localhost:${config.port}`);
});

process.on('SIGTERM', () => server.close(() => pool.end()));
process.on('SIGINT', () => server.close(() => process.exit(0)));
