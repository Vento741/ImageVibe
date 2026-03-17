import { build } from 'esbuild';

await build({
  entryPoints: ['electron/main.ts', 'electron/preload.ts'],
  bundle: true,
  platform: 'node',
  target: 'node20',
  outdir: 'dist-electron',
  format: 'cjs',
  external: ['electron', 'better-sqlite3'],
  sourcemap: true,
});

console.log('Electron build complete');
