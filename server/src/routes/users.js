import { Router } from 'express';
import bcrypt from 'bcryptjs';
import { query } from '../db/pool.js';
import { authRequired, requireRole } from '../middleware/auth.js';

const router = Router();

router.use(authRequired, requireRole('admin'));

router.get('/', async (_req, res) => {
  const { rows } = await query('SELECT id, username, role, created_at FROM users ORDER BY id ASC');
  res.json({ users: rows });
});

router.post('/', async (req, res) => {
  const { username, password, role } = req.body || {};
  if (!username || !password) return res.status(400).json({ error: 'username y password requeridos' });
  if (!['admin', 'editor', 'viewer'].includes(role)) return res.status(400).json({ error: 'role inválido' });

  const hash = await bcrypt.hash(password, 10);
  try {
    const { rows } = await query(
      'INSERT INTO users (username, password_hash, role) VALUES ($1,$2,$3) RETURNING id, username, role, created_at',
      [username, hash, role]
    );
    res.status(201).json({ user: rows[0] });
  } catch (e) {
    if (e.code === '23505') return res.status(409).json({ error: 'Usuario ya existe' });
    throw e;
  }
});

router.delete('/:id', async (req, res) => {
  const id = Number(req.params.id);
  if (id === req.user.sub) return res.status(400).json({ error: 'No puedes eliminarte a ti mismo' });
  const { rowCount } = await query('DELETE FROM users WHERE id=$1', [id]);
  if (!rowCount) return res.status(404).json({ error: 'No existe' });
  res.json({ ok: true });
});

export default router;
