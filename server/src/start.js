import { execSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const here = path.dirname(fileURLToPath(import.meta.url));
const initPath = path.join(here, 'db', 'init.js');

console.log('[start] wrapper booting...');
try {
  console.log('[start] Ejecutando init-db:', initPath);
  execSync(`node ${JSON.stringify(initPath)}`, { stdio: 'inherit' });
  console.log('[start] init-db OK');
} catch (e) {
  console.error('[start] init-db fallo:', e.message);
}

console.log('[start] Cargando servidor...');
await import('./index.js');
