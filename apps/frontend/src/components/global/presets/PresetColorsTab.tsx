import { useState } from 'react';
import { ALL_COLORS, type PresetConfig } from '@/constants/presets/catalog';
import { COLOR_HEX } from '@/constants/presets/color-hex';
import { ColorPickerPopover } from './ColorPickerPopover';

/** Colors tab: the swatch palette; a swatch opens the picker, the label
 *  toggles it in/out of the visible palette. */
export function PresetColorsTab({
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
      <h3 className="text-sm font-medium text-ink">Colors</h3>
      <p className="mt-1 text-[13px] text-muted-foreground">
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
              className={`relative flex flex-col items-center gap-1.5 rounded-lg p-3 transition-opacity ${
                hidden ? 'opacity-35' : 'hover:bg-white/[0.04]'
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
