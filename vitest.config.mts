import { defineConfig } from 'vitest/config';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
export default defineConfig({ test: { root: path.dirname(fileURLToPath(import.meta.url)), include: ['tests/**/*.test.ts'], testTimeout: 60000 } });
