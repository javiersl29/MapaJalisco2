import { spawn } from 'node:child_process';

function run(cmd, args) {
  return new Promise((resolve, reject) => {
    const p = spawn(cmd, args, { stdio: 'inherit' });
    p.on('exit', (code) => (code === 0 ? resolve() : reject(new Error(`${cmd} exited ${code}`))));
    p.on('error', reject);
  });
}

try {
  await run('node', ['server/src/db/init.js']);
} catch (e) {
  console.error('[start] init-db fallo, continuando:', e.message);
}

await run('node', ['server/src/index.js']);
