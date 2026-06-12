import bcrypt from 'bcryptjs';
import { pool, query } from './pool.js';
import { config } from '../config.js';

console.log('[init-db] Iniciando bootstrap de base de datos...');

const SQL = `
CREATE EXTENSION IF NOT EXISTS postgis;

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

async function bootstrap() {
  await query(SQL);
  console.log('[init-db] Tablas y extension postgis listas');

  const { rows } = await query('SELECT COUNT(*)::int AS c FROM users');
  if (rows[0].c === 0) {
    const hash = await bcrypt.hash(config.bootstrapAdmin.password, 10);
    await query(
      'INSERT INTO users (username, password_hash, role) VALUES ($1,$2,$3)',
      [config.bootstrapAdmin.username, hash, 'admin']
    );
    console.log(`[init-db] Admin creado: ${config.bootstrapAdmin.username} / ${config.bootstrapAdmin.password}`);
  } else {
    console.log('[init-db] Usuarios existentes, no se crea admin.');
  }

  await pool.end();
  console.log('[init-db] Listo.');
}

bootstrap().catch((err) => {
  console.error('[init-db] Error:', err);
  process.exit(1);
});
