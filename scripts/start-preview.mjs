import { spawn } from 'node:child_process';
import { existsSync } from 'node:fs';
import { resolve } from 'node:path';

const distIndexPath = resolve(process.cwd(), 'dist', 'index.html');
if (!existsSync(distIndexPath)) {
  console.error('Florivu is missing a production build. Run `npm run build` before `npm run start`.');
  process.exit(1);
}

const viteBinPath = resolve(process.cwd(), 'node_modules', 'vite', 'bin', 'vite.js');
if (!existsSync(viteBinPath)) {
  console.error('Vite is not installed. Run `npm ci` before starting Florivu.');
  process.exit(1);
}

const requestedPort = Number.parseInt(process.env.PORT ?? '4173', 10);
const port = Number.isFinite(requestedPort) && requestedPort > 0 ? requestedPort : 4173;

const child = spawn(process.execPath, [viteBinPath, 'preview', '--host', '0.0.0.0', '--port', String(port)], {
  stdio: 'inherit',
  env: process.env,
});

child.on('exit', (code, signal) => {
  if (signal) {
    process.kill(process.pid, signal);
    return;
  }

  process.exit(code ?? 0);
});
