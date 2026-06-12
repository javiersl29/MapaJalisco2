import { Router } from 'express';
import bcrypt from 'bcryptjs';
import { query } from '../db/pool.js';
import { signToken, authRequired } from '../middleware/auth.js';

const router = Router();

router.post('/login', async (req, res) => {
  const { username, password } = req.body || {};
  if (!username || !password) return res.status(400).json({ error: 'Usuario y contraseña requeridos' });

  const { rows } = await query('SELECT id, username, password_hash, role FROM users WHERE username=$1', [username]);
  if (rows.length === 0) return res.status(401).json({ error: 'Credenciales inválidas' });

  const ok = await bcrypt.compare(password, rows[0].password_hash);
  if (!ok) return res.status(401).json({ error: 'Credenciales inválidas' });

  const user = { id: rows[0].id, username: rows[0].username, role: rows[0].role };
  const token = signToken(user);
  res.json({ token, user });
});

router.get('/me', authRequired, (req, res) => {
  res.json({ user: req.user });
});

export default router;
