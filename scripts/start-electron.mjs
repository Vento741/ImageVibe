import { spawn } from 'child_process';

// Simple delay — Vite starts in ~200ms, 3s is plenty
console.log('Waiting 3s for Vite...');
await new Promise(r => setTimeout(r, 3000));
console.log('Starting Electron...');

const env = { ...process.env, VITE_DEV_SERVER_URL: 'http://localhost:5173' };
delete env.ELECTRON_RUN_AS_NODE;

const electron = spawn(
  process.platform === 'win32' ? 'node_modules\\.bin\\electron.cmd' : 'node_modules/.bin/electron',
  ['.'],
  { env, stdio: 'inherit', shell: true }
);

electron.on('close', (code) => {
  process.exit(code ?? 0);
});
