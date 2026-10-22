import path from 'node:path';
import { defineConfig } from 'vitest/config';

/** Vitest defaults shared with the app build: same `@/` alias, node env.
 *  The AI feature's pure modules (layout math, tool-call routing) don't need
 *  a DOM. Run with `npm test`. */
export default defineConfig({
  resolve: {
    alias: { '@': path.resolve(import.meta.dirname, 'src') },
  },
  test: {
    include: ['src/**/*.test.ts'],
    environment: 'node',
  },
});
