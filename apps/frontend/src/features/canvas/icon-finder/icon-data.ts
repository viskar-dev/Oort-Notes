import DOMPurify from 'dompurify';
import { isTauri, invoke } from '@tauri-apps/api/core';
import { BASE } from '@/ipc/http';

/**
 * Icon data access for the icon finder. Icon search + set bodies come from
 * the note-core iconify proxy: in the desktop app they arrive straight over
 * a Tauri invoke (`icon_search` / `icon_set_data`), so no note server has to
 * run; the web build falls back to the note server's `/api/icons/*` routes —
 * the same contract, also what e2e tests mock. The browser never fetches
 * api.iconify.design itself.
 */

/** one iconify set payload — the slice we need to render + wrap bodies */
export interface IconSetData {
  prefix: string;
  width?: number;
  height?: number;
  icons: Record<string, { body: string; width?: number; height?: number }>;
  aliases?: Record<string, { parent: string }>;
}

export interface IconSearchResult {
  icons: string[]; // 'prefix:name'
  total: number;
  limit: number;
  start: number;
  collections?: Record<string, { name?: string }>;
}

/** set-subset cache: icon bodies are immutable, so entries live for the page */
const setCache = new Map<string, IconSetData>();
const setPending = new Map<string, Promise<IconSetData>>();

async function getJson(path: string): Promise<unknown> {
  const res = await fetch(`${BASE}${path}`);
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return res.json();
}

/** Search iconify through the core courier (desktop invoke, web server route). */
async function iconSearch(q: string, limit: number): Promise<IconSearchResult> {
  if (isTauri()) return invoke<IconSearchResult>('icon_search', { q, limit });
  return getJson(`/api/icons/search?q=${encodeURIComponent(q)}&limit=${limit}`) as Promise<IconSearchResult>;
}

/** A set slice through the core courier (desktop invoke, web server route). */
async function iconSetData(prefix: string, names: string[]): Promise<IconSetData> {
  if (isTauri()) return invoke<IconSetData>('icon_set_data', { prefix, icons: names });
  const qs = names.length > 0 ? `?icons=${encodeURIComponent(names.join(','))}` : '';
  return getJson(`/api/icons/data/${prefix}${qs}`) as Promise<IconSetData>;
}

function sanitizeBody(body: string): string {
  // iconify bodies are bare svg fragments (`<path/>`, `<polygon/>`) — outside
  // an svg context they parse in the HTML namespace and the svg-only profile
  // drops them wholesale. Sanitize wrapped, then take the root's children out
  // (same sanitize → svg parser flow as the svg diagram blocks).
  const doc = new DOMParser().parseFromString(
    DOMPurify.sanitize(`<svg xmlns="http://www.w3.org/2000/svg">${body}</svg>`, { USE_PROFILES: { svg: true } }),
    'image/svg+xml',
  );
  const svg = doc.documentElement;
  if (!svg || svg.nodeName.toLowerCase() !== 'svg' || doc.querySelector('parsererror')) return '';
  return svg.innerHTML;
}

/**
 * Bombs out a set after a fetch happens twice for the same slice — every
 * concurrent open of the same dialog hits the same promise.
 */
export function loadIconSet(prefix: string, names: string[]): Promise<IconSetData> {
  const csv = [...new Set(names)].sort().join(',');
  const k = `${prefix}|${csv}`;
  const hit = setCache.get(k);
  if (hit) return Promise.resolve(hit);
  const inFlight = setPending.get(k);
  if (inFlight) return inFlight;
  const p = (async () => {
    const unique = [...new Set(names)].sort();
    const raw = (await iconSetData(prefix, unique)) as IconSetData;
    const data: IconSetData = {
      ...raw,
      icons: Object.fromEntries(
        Object.entries(raw.icons ?? {}).map(([name, icon]) => [name, { ...icon, body: sanitizeBody(icon.body) }]),
      ),
    };
    setCache.set(k, data);
    return data;
  })().finally(() => setPending.delete(k));
  setPending.set(k, p);
  return p;
}

/** sync lookup for drag-time shape creation: scans cached set slices */
export function findCachedIconData(prefix: string, name: string): IconSetData | null {
  for (const data of setCache.values()) {
    if (data.prefix === prefix && data.icons[name]) return data;
  }
  return null;
}

/** resolve aliases (an alias points at its parent icon) to a body */
function resolveBody(data: IconSetData, name: string): string | null {
  let cur = name;
  for (let hop = 0; hop < 5; hop++) {
    const icon = data.icons[cur];
    if (icon) return icon.body;
    const alias = data.aliases?.[cur];
    if (!alias) return null;
    cur = alias.parent;
  }
  return null;
}

/** one icon view: sanitized body + natural size (falling back to set size) */
export function iconView(
  data: IconSetData,
  name: string,
): { body: string; w: number; h: number } | null {
  const body = resolveBody(data, name);
  if (!body) return null;
  const one = data.icons[name];
  const w = one?.width ?? data.width ?? 16;
  const h = one?.height ?? data.height ?? data.width ?? w;
  return { body, w, h };
}

export function searchIcons(q: string, limit = 994): Promise<IconSearchResult> {
  return iconSearch(q, limit);
}

/** wraps an icon body as a standalone self-contained svg (canvas shapes embed this) */
export function buildIconSvg(data: IconSetData, name: string): { svg: string; ratio: number } | null {
  const view = iconView(data, name);
  if (!view || !(view.w > 0)) return null;
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${view.w} ${view.h}">${view.body}</svg>`;
  return { svg: DOMPurify.sanitize(svg, { USE_PROFILES: { svg: true } }), ratio: view.h / view.w };
}
