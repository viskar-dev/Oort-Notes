import { ALL_COLORS, type PresetConfig } from '@/constants/presets/catalog';
import { COLOR_HEX } from '@/constants/presets/color-hex';
import { FONT_CSS } from '@/constants/presets/font-css';
import { TOOL_ICONS } from '@/constants/presets/tool-icons';

/** Right-hand canvas mock that renders the draft preset live. */
export function PresetLivePreview({ config }: { config: PresetConfig }) {
  const visible = config.toolbar.filter((t) => t.visible);
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
          <div style={{ fontFamily: config.fonts.default === 'draw' ? FONT_CSS.draw : undefined }}>
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
