import { spawn } from 'child_process';
import { createConnection } from 'net';

// Wait for Vite dev server to be ready
function waitForPort(port, timeout = 30000) {
  return new Promise((resolve, reject) => {
    const start = Date.now();
    const check = () => {
      const socket = createConnection({ port }, () => {
        socket.destroy();
        resolve();
      });
      socket.on('error', () => {
        if (Date.now() - start > timeout) {
          reject(new Error(`Timeout waiting for port ${port}`));
        } else {
          setTimeout(check, 300);
        }
      });
    };
    check();
  });
}

console.log('Waiting for Vite on port 5173...');
await waitForPort(5173);
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
