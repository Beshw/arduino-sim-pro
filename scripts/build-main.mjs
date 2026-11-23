// Bundles the Electron main + preload processes with esbuild.
import { build } from 'esbuild';
const common = { bundle: true, platform: 'node', target: 'node22', sourcemap: true, external: ['electron', 'serialport', '@serialport/*'], logLevel: 'info' };
await build({ ...common, entryPoints: ['src/main/main.ts'], outfile: 'dist/main/main.cjs', format: 'cjs' });
await build({ ...common, entryPoints: ['src/preload/preload.ts'], outfile: 'dist/main/preload.cjs', format: 'cjs' });
