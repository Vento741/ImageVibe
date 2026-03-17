import { spawn } from 'child_process';

// Wait for Vite dev server via HTTP
async function waitForVite(url, timeout = 30000) {
  const start = Date.now();
  while (Date.now() - start < timeout) {
    try {
      const res = await fetch(url);
      if (res.ok) return;
    } catch {
      // not ready yet
    }
    await new Promise(r => setTimeout(r, 500));
  }
  throw new Error(`Timeout waiting for ${url}`);
}

console.log('Waiting for Vite...');
await waitForVite('http://localhost:5173');
console.log('Vite ready, starting Electron...');

// Start Electron without ELECTRON_RUN_AS_NODE
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
