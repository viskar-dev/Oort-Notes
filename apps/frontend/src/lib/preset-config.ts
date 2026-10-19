import {
  ALL_COLORS,
  FONT_LABELS,
  TOOL_CATALOG,
  type PresetConfig,
  type ToolbarItemConfig,
} from '@/constants/presets/catalog';

/** A fresh preset config: every non-sample tool visible, nothing hidden. */
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
