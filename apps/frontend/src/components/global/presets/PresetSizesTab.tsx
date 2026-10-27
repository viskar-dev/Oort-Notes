import type { PresetConfig } from '@/constants/presets/catalog';

const ENTRIES: { key: 'h1' | 'h2' | 'h3' | 'p'; label: string }[] = [
  { key: 'h1', label: 'H1' },
  { key: 'h2', label: 'H2' },
  { key: 'h3', label: 'H3' },
  { key: 'p', label: 'P' },
];

/** Sizes tab: the px meaning of each text style. */
export function PresetSizesTab({
  config,
  onChange,
}: {
  config: PresetConfig;
  onChange: (sizes: PresetConfig['sizes']) => void;
}) {
  return (
    <div>
      <h3 className="mb-1 text-base font-semibold">Sizes</h3>
      <p className="mb-4 text-sm text-muted-foreground">
        The px size of each text style. P is the default text size the H1–H3
        headings are measured against.
      </p>
      <div className="flex flex-col gap-3">
        {ENTRIES.map(({ key, label }) => (
          <div key={key} className="flex items-center gap-4 rounded-xl border border-line bg-surface px-5 py-4">
            <span
              className="flex h-11 w-11 shrink-0 items-center justify-center rounded-lg bg-raised text-white/80 font-bold"
              style={{ fontSize: Math.min(config.sizes[key], 16) }}
            >
              {label}
            </span>
            <label className="flex-1 text-sm text-muted-foreground">
              {label === 'p' ? 'Paragraph (default text)' : `Heading ${label[1]}  level ${label[1]}`} in px
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
