import { create } from 'zustand';

/** The JSON document stored in ui_presets.config. */
export interface ToolbarItemConfig {
  id: ToolId;
  visible: boolean;
}

export type ToolId =
  | 'select'
  | 'hand'
  | 'draw'
  | 'eraser'
  | 'arrow'
  | 'text'
  | 'note'
  | 'image'
  | 'shape'
  | 'line'
  | 'highlight'
  | 'frame'
  | 'components';

export type PresetFont = 'draw' | 'sans' | 'serif' | 'mono';

export interface PresetConfig {
  toolbar: ToolbarItemConfig[];
  colors: { hidden: string[]; overrides: Record<string, string> };
  fonts: { default: PresetFont };
  /** px meanings of the text styles; the base paragraph is 24px at scale 1 */
  sizes: { h1: number; h2: number; h3: number; p: number };
  [key: string]: unknown;
}

/** The tool catalog, in default order. Ids map to tldraw tool ids. */
export const TOOL_CATALOG: { id: ToolId; label: string }[] = [
  { id: 'select', label: 'Select' },
  { id: 'hand', label: 'Hand' },
  { id: 'draw', label: 'Draw' },
  { id: 'eraser', label: 'Eraser' },
  { id: 'arrow', label: 'Arrow' },
  { id: 'text', label: 'Text' },
  { id: 'note', label: 'Sticky note' },
  { id: 'image', label: 'Image' },
  { id: 'shape', label: 'Shape' },
  { id: 'line', label: 'Line' },
  { id: 'highlight', label: 'Highlighter' },
  { id: 'frame', label: 'Frame' },
  { id: 'components', label: 'Components' },
];

/** All default palette color ids (tldraw's DefaultColorStyle values). */
export const ALL_COLORS = [
  'black',
  'grey',
  'light-violet',
  'violet',
  'blue',
  'light-blue',
  'yellow',
  'orange',
  'green',
  'light-green',
  'red',
  'light-red',
] as const;

export const FONT_LABELS: Record<PresetFont, string> = {
  draw: 'Draw (handwritten)',
  sans: 'Sans (clean)',
  serif: 'Serif (classic)',
  mono: 'Mono (code)',
};

/** tldraw's text base font is 24px at scale 1; sizes are px meanings for
 * S/M/L, mapped onto the text shape's scale prop. */
export const TEXT_BASE_PX = 24;

export function defaultConfig(): PresetConfig {
  return {
    toolbar: TOOL_CATALOG.map((t) => ({
      id: t.id,
      visible: !['line', 'highlight', 'frame'].includes(t.id),
    })),
    colors: { hidden: [], overrides: {} },
    fonts: { default: 'draw' },
    sizes: { h1: 48, h2: 36, h3: 29, p: 24 },
  };
}

/** Accepts anything from the DB and repairs it into a full PresetConfig. */
export function normalizeConfig(raw: unknown): PresetConfig {
  const base = defaultConfig();
  if (!raw || typeof raw !== 'object') return base;
  const r = raw as Partial<PresetConfig>;

  if (Array.isArray(r.toolbar)) {
    const known = new Map(base.toolbar.map((t) => [t.id, t]));
    const seen: ToolbarItemConfig[] = [];
    for (const item of r.toolbar) {
      if (item && known.has(item.id)) {
        seen.push({ id: item.id, visible: item.visible !== false });
        known.delete(item.id);
      }
    }
    base.toolbar = [...seen, ...known.values()];
  }
  if (r.colors && Array.isArray(r.colors.hidden)) {
    base.colors.hidden = r.colors.hidden.filter((c) => (ALL_COLORS as readonly string[]).includes(c));
  }
  if (r.colors && r.colors.overrides && typeof r.colors.overrides === 'object') {
    for (const [color, hex] of Object.entries(r.colors.overrides as Record<string, unknown>)) {
      if ((ALL_COLORS as readonly string[]).includes(color) && typeof hex === 'string' && /^#[0-9a-f]{6}$/i.test(hex)) {
        base.colors.overrides[color] = hex;
      }
    }
  }
  if (r.fonts && (FONT_LABELS as Record<string, string>)[r.fonts.default as string]) {
    base.fonts.default = r.fonts.default;
  }
  if (r.sizes && typeof r.sizes === 'object') {
    const sz = r.sizes as Record<string, unknown>;
    const read = (k: string): number | null => {
      const n = Number(sz[k]);
      return Number.isFinite(n) && n >= 8 && n <= 96 ? Math.round(n) : null;
    };
    // migrate the old S/M/L px meaning (m = paragraph default)
    const legacyM = read('m');
    base.sizes = {
      h1: read('h1') ?? (legacyM ? Math.round(legacyM * 2) : 48),
      h2: read('h2') ?? (legacyM ? Math.round(legacyM * 1.5) : 36),
      h3: read('h3') ?? (legacyM ? Math.round(legacyM * 1.2) : 29),
      p: read('p') ?? legacyM ?? 24,
    };
  }
  return base;
}

/** Canvas-scoped preset store: CanvasPage loads the chapter's preset into it;
 * toolbar/panel components read it inside the editor context. `null` config
 * means "no preset" — everything falls back to tldraw defaults. */
interface UiPresetState {
  config: PresetConfig | null;
  setConfig: (config: PresetConfig | null) => void;
}

export const useUiPresetStore = create<UiPresetState>((set) => ({
  config: null,
  setConfig: (config) => set({ config }),
}));
