#!/usr/bin/env node
/**
 * Copy tldraw's static assets (icons sprite, embed icons, shape fonts,
 * translations) from the pinned @tldraw/assets package into public/, where
 * Vite serves them verbatim in dev and copies them into dist/ at build.
 *
 * Rationale: the `@tldraw/assets/imports.vite` route (?url imports) breaks
 * the dev server on Windows (rolldown's optimizer chokes on json?url files
 * under node_modules, os error 123), and tldraw's CDN default breaks the
 * desktop exe offline. Serving the files from public/ needs zero bundler
 * participation — the only failure-proof arrangement on every OS.
 *
 * Run after bumping the tldraw SDK version: `bun run assets:sync`.
 * The pinned @tldraw/assets version must match the `tldraw` package's.
 */
import { cpSync, existsSync, mkdirSync } from 'node:fs';
import { createRequire } from 'node:module';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const assetsPackage = dirname(createRequire(join(here, '_', '.')).resolve('@tldraw/assets/package.json'));

const target = join(here, '..', 'public', 'tldraw-assets');
mkdirSync(target, { recursive: true });
for (const dir of ['embed-icons', 'fonts', 'icons', 'translations']) {
  const src = join(assetsPackage, dir);
  if (!existsSync(src)) throw new Error(`missing in @tldraw/assets: ${dir}`);
  cpSync(src, join(target, dir), { recursive: true });
  console.log('synced', dir);
}
