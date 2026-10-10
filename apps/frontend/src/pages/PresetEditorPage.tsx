import { useEffect, useMemo, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import {
  ArrowLeft,
  Blocks,
  ArrowUpRight,
  Eraser,
  Eye,
  EyeOff,
  Frame,
  GripVertical,
  Hand,
  Highlighter,
  Image as ImageIcon,
  Minus,
  MousePointer2,
  Pencil,
  Square,
  StickyNote,
  Type,
  type LucideIcon,
} from 'lucide-react';
import { api, type UiPreset } from '@/lib/ipc';
import {
  ALL_COLORS,
  FONT_LABELS,
  TOOL_CATALOG,
  defaultConfig,
  normalizeConfig,
  type PresetConfig,
  type PresetFont,
  type ToolId,
} from '@/features/presets/preset-config';

const TOOL_ICONS: Record<ToolId, LucideIcon> = {
  select: MousePointer2,
  hand: Hand,
  draw: Pencil,
  eraser: Eraser,
  arrow: ArrowUpRight,
  text: Type,
  note: StickyNote,
  image: ImageIcon,
  shape: Square,
  line: Minus,
  highlight: Highlighter,
  frame: Frame,
  components: Blocks,
};

const COLOR_HEX: Record<string, string> = {
  black: '#1d1d21',
  grey: '#84848e',
  'light-violet': '#e2d3ff',
  violet: '#9b63f6',
  blue: '#4b7be5',
  'light-blue': '#cfe6ff',
  yellow: '#fdd935',
  orange: '#fb7831',
  green: '#37ba7c',
  'light-green': '#d7ffdd',
  red: '#f24545',
  'light-red': '#ffb3b3',
};

type Tab = 'toolbar' | 'colors' | 'fonts' | 'sizes';

/** Route: '/settings/presets/:presetId' — 'new' creates a preset. */
export function PresetEditorPage() {
  const { presetId } = useParams();
  const navigate = useNavigate();
  const isNew = presetId === 'new';

  const [name, setName] = useState('');
  const [config, setConfig] = useState<PresetConfig>(defaultConfig);
  const [tab, setTab] = useState<Tab>('toolbar');
  const [loading, setLoading] = useState(!isNew);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (isNew) return;
    let cancelled = false;
    api
      .loadUiPreset(presetId!)
      .then((p: UiPreset) => {
        if (cancelled) return;
        setName(p.name);
        setConfig(normalizeConfig(p.config));
        setLoading(false);
      })
      .catch((e) => {
        if (!cancelled) {
          setError(e instanceof Error ? e.message : String(e));
          setLoading(false);
        }
      });
    return () => {
      cancelled = true;
    };
  }, [presetId, isNew]);

  function discard() {
    if (isNew) {
      setName('');
      setConfig(defaultConfig());
    } else {
      setLoading(true);
      api
        .loadUiPreset(presetId!)
        .then((p: UiPreset) => {
          setName(p.name);
          setConfig(normalizeConfig(p.config));
          setLoading(false);
        })
        .catch(() => setLoading(false));
    }
  }

  async function save() {
    if (!name.trim() || saving) return;
    setSaving(true);
    setError(null);
    try {
      if (isNew) {
        const created = await api.createUiPreset(name.trim(), config as unknown as Record<string, unknown>);
        navigate(`/settings/presets/${created.id}`, { replace: true });
      } else {
        await api.updateUiPreset(presetId!, { name: name.trim(), config });
      }
      navigate('/settings');
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
      setSaving(false);
    }
  }

  if (loading) {
    return <div className="flex min-h-screen items-center justify-center bg-background text-muted-foreground">Loading…</div>;
  }

  return (
    <div className="min-h-screen bg-background text-ink">
      <div className="mx-auto max-w-[1100px] px-10 py-8">
        {/* breadcrumb */}
        <div className="mb-4 flex items-center gap-1.5 text-sm text-muted-foreground">
          <Link to="/settings" className="transition-colors hover:text-ink">
            Settings
          </Link>
          <span>/</span>
          <Link to="/settings" className="transition-colors hover:text-ink">
            Presets
          </Link>
          <span>/</span>
          <span className="font-medium text-ink">{name || 'Untitled'}</span>
        </div>

        <header className="mb-6 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <button
              onClick={() => navigate('/settings')}
              title="Back to presets"
              className="rounded-lg border border-line bg-surface p-2 transition-colors hover:bg-raised"
            >
              <ArrowLeft className="h-4 w-4" />
            </button>
            <input
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Preset name"
              className="w-64 rounded-lg border border-transparent bg-transparent px-2 py-1.5 text-xl font-semibold tracking-tight outline-none transition-colors hover:border-line focus:border-primary"
            />
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={discard}
              className="rounded-lg px-3.5 py-2 text-sm font-medium text-muted-foreground transition-colors hover:bg-raised hover:text-ink"
            >
              Discard
            </button>
            <button
              onClick={save}
              disabled={!name.trim() || saving}
              className="rounded-lg bg-primary px-4 py-2 text-sm font-medium text-primary-foreground transition-opacity hover:opacity-90 disabled:opacity-40"
            >
              {saving ? 'Saving…' : isNew ? 'Create preset' : 'Save preset'}
            </button>
          </div>
        </header>

        {error && (
          <div className="mb-4 rounded-lg bg-red-950/60 px-4 py-3 text-sm text-red-300">{error}</div>
        )}

        <div className="flex gap-8">
          {/* left: tabs + content */}
          <div className="min-w-0 flex-1">
            <div className="mb-5 flex gap-1 rounded-full border border-line bg-surface p-1">
              {(['toolbar', 'colors', 'fonts', 'sizes'] as const).map((t) => (
                <button
                  key={t}
                  onClick={() => setTab(t)}
                  className={`flex-1 rounded-full px-4 py-1.5 text-sm font-medium capitalize transition-colors ${
                    tab === t ? 'bg-raised text-ink' : 'text-muted-foreground hover:text-ink'
                  }`}
                >
                  {t}
                </button>
              ))}
            </div>

            {tab === 'toolbar' && (
              <ToolbarTab config={config} onChange={(toolbar) => setConfig({ ...config, toolbar })} />
            )}
            {tab === 'colors' && (
              <ColorsTab config={config} onChange={(colors) => setConfig({ ...config, colors })} />
            )}
            {tab === 'fonts' && (
              <FontsTab config={config} onChange={(fonts) => setConfig({ ...config, fonts })} />
            )}
            {tab === 'sizes' && (
              <SizesTab config={config} onChange={(sizes) => setConfig({ ...config, sizes })} />
            )}
          </div>

          {/* right: live preview */}
          <LivePreview config={config} />
        </div>
      </div>
    </div>
  );
}

/* ---------------- Toolbar tab ---------------- */

function ToolbarTab({
  config,
  onChange,
}: {
  config: PresetConfig;
  onChange: (toolbar: PresetConfig['toolbar']) => void;
}) {
  const [dragId, setDragId] = useState<ToolId | null>(null);

  function move(id: ToolId, dir: -1 | 1) {
    const idx = config.toolbar.findIndex((t) => t.id === id);
    const next = [...config.toolbar];
    const target = idx + dir;
    if (target < 0 || target >= next.length) return;
    [next[idx], next[target]] = [next[target], next[idx]];
    onChange(next);
  }

  function dropOn(id: ToolId) {
    if (!dragId || dragId === id) return;
    const next = [...config.toolbar];
    const from = next.findIndex((t) => t.id === dragId);
    const to = next.findIndex((t) => t.id === id);
    next.splice(to, 0, next.splice(from, 1)[0]);
    onChange(next);
    setDragId(null);
  }

  const visible = config.toolbar.filter((t) => t.visible);
  const hidden = config.toolbar.filter((t) => !t.visible);

  const row = (item: PresetConfig['toolbar'][number], dim: boolean) => {
    const Icon = TOOL_ICONS[item.id];
    const label = TOOL_CATALOG.find((t) => t.id === item.id)?.label ?? item.id;
    const idx = config.toolbar.findIndex((t) => t.id === item.id);
    return (
      <div
        key={item.id}
        draggable
        onDragStart={() => setDragId(item.id)}
        onDragOver={(e) => e.preventDefault()}
        onDrop={() => dropOn(item.id)}
        className={`flex cursor-grab items-center gap-3 rounded-xl border px-3.5 py-2.5 transition-colors ${
          dim
            ? 'border-line/60 bg-surface/50 text-muted-foreground'
            : 'border-line bg-surface text-ink'
        } ${dragId === item.id ? 'opacity-40' : ''}`}
      >
        <GripVertical className="h-4 w-4 shrink-0 text-faint" />
        <Icon className="h-4 w-4 shrink-0" />
        <span className="flex-1 text-sm">{label}</span>
        <button
          onClick={() => move(item.id, -1)}
          disabled={idx === 0}
          title="Move up"
          className="rounded-md p-1 text-xs text-muted-foreground hover:bg-raised disabled:opacity-30"
        >
          ↑
        </button>
        <button
          onClick={() => move(item.id, 1)}
          disabled={idx === config.toolbar.length - 1}
          title="Move down"
          className="rounded-md p-1 text-xs text-muted-foreground hover:bg-raised disabled:opacity-30"
        >
          ↓
        </button>
        <button
          onClick={() =>
            onChange(config.toolbar.map((t) => (t.id === item.id ? { ...t, visible: !t.visible } : t)))
          }
          title={item.visible ? 'Hide tool' : 'Show tool'}
          className="rounded-md p-1.5 text-muted-foreground transition-colors hover:bg-raised hover:text-ink"
        >
          {item.visible ? <Eye className="h-4 w-4" /> : <EyeOff className="h-4 w-4" />}
        </button>
      </div>
    );
  };

  return (
    <div>
      <h3 className="mb-1 text-base font-semibold">Toolbar</h3>
      <p className="mb-4 text-sm text-muted-foreground">
        Drag to reorder. Hide tools you don't use.
      </p>
      <div className="mb-2 flex items-center justify-between text-[11px] font-semibold tracking-widest text-muted-foreground">
        <span>VISIBLE</span>
        <span>{visible.length} tools</span>
      </div>
      <div className="mb-6 flex flex-col gap-1.5">{visible.map((t) => row(t, false))}</div>
      <div className="mb-2 flex items-center justify-between text-[11px] font-semibold tracking-widest text-muted-foreground">
        <span>HIDDEN</span>
        <span>{hidden.length} hidden</span>
      </div>
      <div className="flex flex-col gap-1.5">{hidden.map((t) => row(t, true))}</div>
    </div>
  );
}

/* ---------------- Colors tab ---------------- */

function ColorsTab({
  config,
  onChange,
}: {
  config: PresetConfig;
  onChange: (colors: PresetConfig['colors']) => void;
}) {
  const [pickerColor, setPickerColor] = useState<string | null>(null);

  function toggle(color: string) {
    const hidden = config.colors.hidden.includes(color)
      ? config.colors.hidden.filter((c) => c !== color)
      : [...config.colors.hidden, color];
    onChange({ ...config.colors, hidden });
  }

  function recolor(color: string, hex: string) {
    onChange({
      ...config.colors,
      overrides: { ...config.colors.overrides, [color]: hex.toLowerCase() },
    });
  }

  function resetColor(color: string) {
    const overrides = { ...config.colors.overrides };
    delete overrides[color];
    onChange({ ...config.colors, overrides });
  }

  return (
    <div>
      <h3 className="mb-1 text-base font-semibold">Colors</h3>
      <p className="mb-4 text-sm text-muted-foreground">
        Click a swatch to pick a color; click the name to include or exclude it
        from the palette.
      </p>
      <div className="relative grid grid-cols-6 gap-2.5">
        {ALL_COLORS.map((c) => {
          const hidden = config.colors.hidden.includes(c);
          const hex = config.colors.overrides[c] ?? COLOR_HEX[c];
          const customized = Boolean(config.colors.overrides[c]);
          return (
            <div
              key={c}
              className={`relative flex flex-col items-center gap-1.5 rounded-xl border p-3 transition-all ${
                hidden ? 'border-line/50 opacity-35' : 'border-line hover:border-primary/60'
              }`}
            >
              {/* the swatch opens the dark theme picker popover */}
              <button
                onClick={() => setPickerColor(pickerColor === c ? null : c)}
                title="Pick a color"
                className="block h-9 w-9 rounded-full border border-white/10 transition-transform hover:scale-105"
                style={{ backgroundColor: hex }}
              />
              <button
                onClick={() => toggle(c)}
                title={hidden ? 'Excluded — click to include' : 'Included — click to exclude'}
                className="font-mono text-[10px] uppercase text-muted-foreground transition-colors hover:text-ink"
              >
                {hex}
              </button>
              {customized && (
                <button
                  onClick={() => resetColor(c)}
                  title="Reset to the default color"
                  className="absolute left-1.5 top-1.5 text-[10px] text-muted-foreground hover:text-ink"
                >
                  ↺
                </button>
              )}
              {pickerColor === c && (
                <ColorPickerPopover
                  hex={hex}
                  onChange={(next) => recolor(c, next)}
                  onClose={() => setPickerColor(null)}
                />
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}

/** Dark-theme color picker popover: default palette + hex input + native
 * dialog fallback. A native input dialog can't be themed, so it lives behind
 * a small trigger here. */
function ColorPickerPopover({
  hex,
  onChange,
  onClose,
}: {
  hex: string;
  onChange: (hex: string) => void;
  onClose: () => void;
}) {
  return (
    <>
      {/* click-away layer */}
      <div className="fixed inset-0 z-40" onClick={onClose} />
      <div
        className="absolute left-1/2 top-full z-50 mt-2 w-56 -translate-x-1/2 rounded-xl border border-line bg-surface p-3 shadow-xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="mb-2.5 grid grid-cols-6 gap-1.5">
          {ALL_COLORS.map((c) => (
            <button
              key={c}
              onClick={() => onChange(COLOR_HEX[c])}
              title={`Use default ${c.replace('-', ' ')}`}
              className="h-6 w-6 rounded-md border border-white/10 transition-transform hover:scale-110"
              style={{ backgroundColor: COLOR_HEX[c] }}
            />
          ))}
        </div>
        <div className="flex items-center gap-2">
          <label
            title="Open the system color dialog"
            className="relative h-8 w-8 shrink-0 cursor-pointer rounded-lg border border-line"
            style={{ backgroundColor: hex }}
          >
            <input
              type="color"
              value={hex}
              onChange={(e) => onChange(e.target.value)}
              className="absolute inset-0 h-full w-full cursor-pointer opacity-0"
            />
          </label>
          <input
            value={hex}
            onChange={(e) => {
              const v = e.target.value.trim();
              if (/^#[0-9a-f]{6}$/i.test(v)) onChange(v);
            }}
            spellCheck={false}
            className="w-full rounded-lg border border-line bg-background px-2.5 py-1.5 font-mono text-xs uppercase outline-none focus:border-primary"
          />
        </div>
      </div>
    </>
  );
}

/* ---------------- Fonts tab ---------------- */

function FontsTab({
  config,
  onChange,
}: {
  config: PresetConfig;
  onChange: (fonts: PresetConfig['fonts']) => void;
}) {
  const FONTS: { id: PresetFont; sample: string }[] = [
    { id: 'draw', sample: 'The quick brown fox' },
    { id: 'sans', sample: 'The quick brown fox' },
    { id: 'serif', sample: 'The quick brown fox' },
    { id: 'mono', sample: 'The quick brown fox' },
  ];
  const FONT_CSS: Record<PresetFont, string> = {
    draw: "'Caveat', 'Segoe Print', cursive",
    sans: "system-ui, sans-serif",
    serif: 'Georgia, serif',
    mono: 'ui-monospace, monospace',
  };
  return (
    <div>
      <h3 className="mb-1 text-base font-semibold">Fonts</h3>
      <p className="mb-4 text-sm text-muted-foreground">Default font for new text and labels.</p>
      <div className="flex flex-col gap-2">
        {FONTS.map((f) => (
          <button
            key={f.id}
            onClick={() => onChange({ default: f.id })}
            className={`flex items-center justify-between rounded-xl border px-5 py-4 text-left transition-colors ${
              config.fonts.default === f.id
                ? 'border-primary bg-primary/10'
                : 'border-line bg-surface hover:border-primary/50'
            }`}
          >
            <div>
              <div className="text-sm font-semibold">{FONT_LABELS[f.id]}</div>
              <div className="mt-0.5 text-lg" style={{ fontFamily: FONT_CSS[f.id] }}>
                {f.sample}
              </div>
            </div>
            {config.fonts.default === f.id && (
              <span className="rounded-full bg-primary px-2.5 py-0.5 text-[11px] font-semibold text-primary-foreground">
                Default
              </span>
            )}
          </button>
        ))}
      </div>
    </div>
  );
}

/* ---------------- Sizes tab ---------------- */

function SizesTab({
  config,
  onChange,
}: {
  config: PresetConfig;
  onChange: (sizes: PresetConfig['sizes']) => void;
}) {
  const entries: { key: 'h1' | 'h2' | 'h3' | 'p'; label: string }[] = [
    { key: 'h1', label: 'H1' },
    { key: 'h2', label: 'H2' },
    { key: 'h3', label: 'H3' },
    { key: 'p', label: 'P' },
  ];
  return (
    <div>
      <h3 className="mb-1 text-base font-semibold">Sizes</h3>
      <p className="mb-4 text-sm text-muted-foreground">
        The px size of each text style. P is the default text size the H1–H3
        headings are measured against.
      </p>
      <div className="flex flex-col gap-3">
        {entries.map(({ key, label }) => (
          <div key={key} className="flex items-center gap-4 rounded-xl border border-line bg-surface px-5 py-4">
            <span
              className="flex h-11 w-11 shrink-0 items-center justify-center rounded-lg bg-raised font-bold"
              style={{ fontSize: Math.min(config.sizes[key], 26) }}
            >
              {label}
            </span>
            <label className="flex-1 text-sm text-muted-foreground">
              {label === 'p' ? 'Paragraph (default text)' : `Heading ${label[1]} — level ${label[1]}`} in px
            </label>
            <input
              type="number"
              min={8}
              max={96}
              value={config.sizes[key]}
              onChange={(e) => {
                const n = Math.min(Math.max(Math.round(Number(e.target.value)) || 0, 8), 96);
                onChange({ ...config.sizes, [key]: n });
              }}
              className="w-24 rounded-lg border border-line bg-background px-3 py-2 text-sm outline-none focus:border-primary"
            />
            <span className="w-28 text-right text-sm tabular-nums text-muted-foreground">
              {Math.round(config.sizes[key])} px
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}

/* ---------------- Live preview ---------------- */

function LivePreview({ config }: { config: PresetConfig }) {
  const visible = useMemo(() => config.toolbar.filter((t) => t.visible), [config.toolbar]);
  const colors = ALL_COLORS.filter((c) => !config.colors.hidden.includes(c));

  return (
    <div className="w-80 shrink-0">
      <div className="mb-3 flex items-center justify-between">
        <h3 className="text-sm font-semibold">Live Canvas Preview</h3>
        <span className="rounded-full bg-primary/20 px-2 py-0.5 text-[10px] font-semibold tracking-wider text-primary">
          PREVIEW
        </span>
      </div>
      <div className="relative flex h-[440px] flex-col overflow-hidden rounded-2xl border border-line bg-canvas">
        {/* color palette card */}
        <div className="absolute right-4 top-4 z-10 w-40 rounded-xl border border-line bg-surface p-2 shadow-lg">
          <div className="grid grid-cols-4 gap-1.5">
            {colors.map((c) => (
              <span
                key={c}
                className="h-6 w-6 rounded-md border border-white/10"
                style={{ backgroundColor: config.colors.overrides[c] ?? COLOR_HEX[c] }}
              />
            ))}
          </div>
          <div className="mt-2 h-1.5 rounded-full bg-gradient-to-r from-blue-500 via-green-500 to-red-500" />
        </div>
        {/* sample text */}
        <div className="px-6 pt-28 text-center" style={{ color: '#e8e8ea' }}>
          <div style={{ fontFamily: config.fonts.default === 'draw' ? "'Caveat', 'Segoe Print', cursive" : undefined }}>
            <div style={{ fontSize: config.sizes.p, lineHeight: 1.4 }}>Aa Bb Cc 123</div>
            <div style={{ fontSize: config.sizes.p, opacity: 0.7, marginTop: 6 }}>
              H1 {config.sizes.h1} · H2 {config.sizes.h2} · H3 {config.sizes.h3} · P {config.sizes.p} px
            </div>
          </div>
        </div>
        {/* toolbar preview */}
        <div className="mt-auto flex justify-center pb-4">
          <div className="flex items-center gap-0.5 rounded-full border border-line bg-surface px-1.5 py-1.5">
            {visible.map((t) => {
              const Icon = TOOL_ICONS[t.id];
              return (
                <span key={t.id} className="flex h-8 w-8 items-center justify-center rounded-full text-muted-foreground" title={t.id}>
                  <Icon className="h-4 w-4" />
                </span>
              );
            })}
          </div>
        </div>
      </div>
      <p className="mt-3 text-xs text-muted-foreground">
        Changes apply to every chapter using this preset.
      </p>
    </div>
  );
}
