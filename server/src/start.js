console.log('[start] wrapper running');
import { spawn } from 'node:child_process';
import { execSync } from 'node:child_process';

console.log('[start] Ejecutando init-db...');
try {
  execSync('node server/src/db/init.js', { stdio: 'inherit' });
  console.log('[start] init-db OK');
} catch (e) {
  console.error('[start] init-db fallo, continuando:', e.message);
}

console.log('[start] Iniciando servidor...');
await import('./index.js');
