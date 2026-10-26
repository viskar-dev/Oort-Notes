import { FONT_LABELS, type PresetConfig, type PresetFont } from '@/constants/presets/catalog';
import { FONT_CSS } from '@/constants/presets/font-css';

const FONTS: { id: PresetFont; sample: string }[] = [
  { id: 'draw', sample: 'The quick brown fox' },
  { id: 'sans', sample: 'The quick brown fox' },
  { id: 'serif', sample: 'The quick brown fox' },
  { id: 'mono', sample: 'The quick brown fox' },
];

/** Fonts tab: pick the default font for new text and labels. Flat rows —
 *  the active one gets the faint fill, no accent. */
export function PresetFontsTab({
  config,
  onChange,
}: {
  config: PresetConfig;
  onChange: (fonts: PresetConfig['fonts']) => void;
}) {
  return (
    <div>
      <h3 className="text-sm font-medium text-ink">Fonts</h3>
      <p className="mt-1 text-[13px] text-muted-foreground">Default font for new text and labels.</p>
      <div className="flex flex-col">
        {FONTS.map((f) => (
          <button
            key={f.id}
            onClick={() => onChange({ default: f.id })}
            className={`flex items-center justify-between rounded-md px-2 py-3 text-left transition-colors ${
              config.fonts.default === f.id
                ? 'bg-white/[0.04]'
                : 'hover:bg-white/[0.03]'
            }`}
          >
            <div>
              <div className="text-[13px] text-ink">{FONT_LABELS[f.id]}</div>
              <div className="mt-0.5 text-lg text-[#e8e8ea]" style={{ fontFamily: FONT_CSS[f.id] }}>
                {f.sample}
              </div>
            </div>
            {config.fonts.default === f.id && (
              <span className="text-xs text-muted-foreground">Default</span>
            )}
          </button>
        ))}
      </div>
    </div>
  );
}
