import { Router } from 'express';
import multer from 'multer';
import path from 'node:path';
import fs from 'node:fs/promises';
import * as shapefile from 'shapefile';
import { query } from '../db/pool.js';
import { authRequired, requireRole } from '../middleware/auth.js';
import { config } from '../config.js';

const router = Router();

await fs.mkdir(config.uploadDir, { recursive: true });

const storage = multer.diskStorage({
  destination: (_req, _file, cb) => cb(null, config.uploadDir),
  filename: (_req, file, cb) => {
    const ts = Date.now();
    const safe = file.originalname.replace(/[^a-zA-Z0-9._-]/g, '_');
    cb(null, `${ts}_${safe}`);
  },
});
const upload = multer({ storage, limits: { fileSize: 200 * 1024 * 1024 } });

function slugify(name) {
  return String(name).toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_+|_+$/g, '').slice(0, 64) || `layer_${Date.now()}`;
}

function parseStyleForGeoJSON(style) {
  const s = style || {};
  return {
    type: 'line',
    paint: {
      'line-color': s.line_color || '#3388ff',
      'line-width': Number(s.line_width ?? 2),
      'line-opacity': Number(s.opacity ?? 1),
    },
  };
}

router.get('/', async (_req, res) => {
  const { rows } = await query(
    `SELECT id, name, title, type, format, srid, bbox_minx, bbox_miny, bbox_maxx, bbox_maxy,
            style, visible, opacity, z_index, description, original_name, size_bytes, created_at, updated_at
       FROM layers ORDER BY z_index ASC, id ASC`
  );
  res.json({ layers: rows });
});

router.get('/:id', async (req, res) => {
  const { rows } = await query('SELECT * FROM layers WHERE id=$1', [req.params.id]);
  if (!rows[0]) return res.status(404).json({ error: 'No existe' });
  res.json({ layer: rows[0] });
});

router.put('/:id', authRequired, requireRole('admin', 'editor'), async (req, res) => {
  const fields = ['title', 'description', 'visible', 'opacity', 'z_index', 'style'];
  const sets = [];
  const values = [];
  let i = 1;
  for (const f of fields) {
    if (req.body[f] !== undefined) {
      sets.push(`${f} = $${i++}`);
      values.push(typeof req.body[f] === 'object' ? JSON.stringify(req.body[f]) : req.body[f]);
    }
  }
  if (!sets.length) return res.status(400).json({ error: 'Nada que actualizar' });
  sets.push(`updated_at = now()`);
  values.push(req.params.id);
  const { rows } = await query(
    `UPDATE layers SET ${sets.join(', ')} WHERE id=$${i} RETURNING *`,
    values
  );
  if (!rows[0]) return res.status(404).json({ error: 'No existe' });
  res.json({ layer: rows[0] });
});

router.delete('/:id', authRequired, requireRole('admin', 'editor'), async (req, res) => {
  const { rows } = await query('SELECT file_path FROM layers WHERE id=$1', [req.params.id]);
  if (!rows[0]) return res.status(404).json({ error: 'No existe' });
  if (rows[0].file_path) await fs.unlink(rows[0].file_path).catch(() => {});
  await query('DELETE FROM layers WHERE id=$1', [req.params.id]);
  res.json({ ok: true });
});

router.post(
  '/upload/vector',
  authRequired,
  requireRole('admin', 'editor'),
  upload.single('file'),
  async (req, res) => {
    if (!req.file) return res.status(400).json({ error: 'Archivo requerido (file)' });
    const title = req.body.title || path.parse(req.file.originalname).name;
    const name = slugify(req.body.name || title);
    const format = (path.extname(req.file.originalname).slice(1) || 'geojson').toLowerCase();

    let geojson = null;
    let bbox = null;
    let srid = 4326;

    if (format === 'geojson' || format === 'json') {
      const text = await fs.readFile(req.file.path, 'utf8');
      geojson = JSON.parse(text);
    } else if (format === 'zip' || format === 'shp') {
      const base = req.file.path.replace(/\.zip$/i, '');
      try {
        const features = [];
        const shpPath = await findShpInsideZip(req.file.path, base);
        if (!shpPath) throw new Error('No se encontró .shp dentro del zip');
        const dbfPath = shpPath.replace(/\.shp$/i, '.dbf');
        const source = await shapefile.open(shpPath, dbfPath);
        while (true) {
          const r = await source.read();
          if (r.done) break;
          features.push(r.value);
        }
        geojson = { type: 'FeatureCollection', features };
      } catch (e) {
        await fs.unlink(req.file.path).catch(() => {});
        return res.status(400).json({ error: 'Shapefile inválido: ' + e.message });
      }
    } else {
      await fs.unlink(req.file.path).catch(() => {});
      return res.status(400).json({ error: `Formato vectorial no soportado: ${format}` });
    }

    bbox = computeBbox(geojson);

    try {
      const { rows } = await query(
        `INSERT INTO layers (name, title, type, format, srid, bbox_minx, bbox_miny, bbox_maxx, bbox_maxy,
                              file_path, original_name, size_bytes, created_by)
         VALUES ($1,$2,'vector',$3,$4,$5,$6,$7,$8,$9,$10,$11,$12)
         RETURNING *`,
        [
          name, title, format, srid,
          bbox?.minx ?? null, bbox?.miny ?? null, bbox?.maxx ?? null, bbox?.maxy ?? null,
          req.file.path, req.file.originalname, req.file.size, req.user.sub,
        ]
      );
      const layer = rows[0];
      const dataPath = path.join(path.dirname(layer.file_path), `${layer.id}.geojson`);
      await fs.writeFile(dataPath, JSON.stringify(geojson));
      await query('UPDATE layers SET file_path=$1 WHERE id=$2', [dataPath, layer.id]);
      res.status(201).json({ layer: { ...layer, file_path: dataPath } });
    } catch (e) {
      if (e.code === '23505') {
        await fs.unlink(req.file.path).catch(() => {});
        return res.status(409).json({ error: `Ya existe una capa con nombre "${name}"` });
      }
      throw e;
    }
  }
);

router.post(
  '/upload/raster',
  authRequired,
  requireRole('admin', 'editor'),
  upload.single('file'),
  async (req, res) => {
    if (!req.file) return res.status(400).json({ error: 'Archivo requerido (file)' });
    const title = req.body.title || path.parse(req.file.originalname).name;
    const name = slugify(req.body.name || title);
    const format = (path.extname(req.file.originalname).slice(1) || 'tiff').toLowerCase();
    if (!['tif', 'tiff', 'png', 'jpg', 'jpeg', 'webp'].includes(format)) {
      await fs.unlink(req.file.path).catch(() => {});
      return res.status(400).json({ error: `Formato raster no soportado: ${format}` });
    }

    try {
      const { rows } = await query(
        `INSERT INTO layers (name, title, type, format, srid, file_path, original_name, size_bytes, created_by)
         VALUES ($1,$2,'raster',$3,4326,$4,$5,$6,$7)
         RETURNING *`,
        [name, title, format, req.file.path, req.file.originalname, req.file.size, req.user.sub]
      );
      res.status(201).json({ layer: rows[0] });
    } catch (e) {
      if (e.code === '23505') {
        await fs.unlink(req.file.path).catch(() => {});
        return res.status(409).json({ error: `Ya existe una capa con nombre "${name}"` });
      }
      throw e;
    }
  }
);

router.get('/:id/data', async (req, res) => {
  const { rows } = await query('SELECT * FROM layers WHERE id=$1', [req.params.id]);
  const layer = rows[0];
  if (!layer) return res.status(404).json({ error: 'No existe' });
  if (layer.type !== 'vector') return res.status(400).json({ error: 'Solo capas vectoriales' });
  try {
    const text = await fs.readFile(layer.file_path, 'utf8');
    res.type('application/geo+json').send(text);
  } catch {
    res.status(500).json({ error: 'Archivo no disponible' });
  }
});

router.get('/:id/tile/:z/:x/:y.png', async (req, res) => {
  const { rows } = await query('SELECT * FROM layers WHERE id=$1', [req.params.id]);
  const layer = rows[0];
  if (!layer) return res.status(404).send('Not found');
  if (layer.type !== 'raster') return res.status(400).send('Solo raster');
  res.sendFile(path.resolve(layer.file_path));
});

function computeBbox(gj) {
  let minx = Infinity, miny = Infinity, maxx = -Infinity, maxy = -Infinity;
  const visit = (coords) => {
    if (typeof coords[0] === 'number') {
      const [x, y] = coords;
      if (x < minx) minx = x; if (y < miny) miny = y;
      if (x > maxx) maxx = x; if (y > maxy) maxy = y;
    } else {
      for (const c of coords) visit(c);
    }
  };
  const features = gj.features || (gj.type === 'Feature' ? [gj] : []);
  for (const f of features) {
    if (f.geometry) visit(f.geometry.coordinates);
  }
  if (!isFinite(minx)) return null;
  return { minx, miny, maxx, maxy };
}

async function findShpInsideZip(zipPath, extractTo) {
  const { execSync } = await import('node:child_process');
  execSync(`powershell -NoProfile -Command "Expand-Archive -LiteralPath '${zipPath}' -DestinationPath '${extractTo}' -Force"`);
  const entries = await fs.readdir(extractTo);
  const shp = entries.find((e) => e.toLowerCase().endsWith('.shp'));
  if (!shp) return null;
  return path.join(extractTo, shp);
}

export default router;
