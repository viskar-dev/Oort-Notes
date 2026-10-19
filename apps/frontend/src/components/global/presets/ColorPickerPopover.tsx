import { ALL_COLORS } from '@/constants/presets/catalog';
import { COLOR_HEX } from '@/constants/presets/color-hex';

/** Dark-theme color picker popover: default palette + hex input + native
 * dialog fallback. A native input dialog can't be themed, so it lives behind
 * a small trigger here. */
export function ColorPickerPopover({
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
