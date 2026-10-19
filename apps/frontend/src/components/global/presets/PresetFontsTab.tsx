import { FONT_LABELS, type PresetConfig, type PresetFont } from '@/constants/presets/catalog';
import { FONT_CSS } from '@/constants/presets/font-css';

const FONTS: { id: PresetFont; sample: string }[] = [
  { id: 'draw', sample: 'The quick brown fox' },
  { id: 'sans', sample: 'The quick brown fox' },
  { id: 'serif', sample: 'The quick brown fox' },
  { id: 'mono', sample: 'The quick brown fox' },
];

/** Fonts tab: pick the default font for new text and labels. */
export function PresetFontsTab({
  config,
  onChange,
}: {
  config: PresetConfig;
  onChange: (fonts: PresetConfig['fonts']) => void;
}) {
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
