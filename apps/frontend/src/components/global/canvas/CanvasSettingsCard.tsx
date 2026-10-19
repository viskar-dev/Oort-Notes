import { useEffect, useRef } from 'react';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import type { UiPreset } from '@/lib/ipc';

/** The canvas settings popover (opened from the top bar): page padding and
 *  content boundary for page chapters, and the chapter's UI preset. It
 *  closes on outside clicks, excluding the top bar's settings button which
 *  toggles it itself. */
export function CanvasSettingsCard({
  open,
  onClose,
  isPageChapter,
  pagePadding,
  contentInset,
  onPaddingChange,
  onInsetChange,
  chapterPresetId,
  uiPresets,
  onApplyPreset,
}: {
  open: boolean;
  onClose: () => void;
  isPageChapter: boolean;
  pagePadding: number;
  contentInset: number;
  onPaddingChange: (value: number) => void;
  onInsetChange: (value: number) => void;
  chapterPresetId: string;
  uiPresets: UiPreset[];
  onApplyPreset: (id: string) => void;
}) {
  const cardRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (!open) return;
    const onPointerDown = (e: PointerEvent) => {
      const target = e.target as Element | null;
      if (!target) return;
      if (cardRef.current?.contains(target)) return;
      // the toolbar's settings button toggles the card itself
      if (target.closest?.('[data-settings-toggle]')) return;
      onClose();
    };
    document.addEventListener('pointerdown', onPointerDown, true);
    return () => document.removeEventListener('pointerdown', onPointerDown, true);
  }, [open, onClose]);

  if (!open) return null;

  return (
    <div
      ref={cardRef}
      className="absolute right-4 top-14 z-30 w-64 rounded-xl border border-line bg-surface p-4 shadow-xl"
    >
      <div className="mb-3 text-sm font-semibold">Settings</div>
      {isPageChapter && (
        <>
          <label className="mb-1.5 block text-[13px] font-medium text-muted-foreground">
            Page padding (px)
          </label>
          <Input
            type="number"
            min={0}
            max={200}
            value={pagePadding}
            onChange={(e) => onPaddingChange(Number(e.target.value))}
          />
          <p className="mt-2 text-xs text-muted-foreground">
            Gap between the sheet and the viewport edges. Sheets always stay
            centered in the available area.
          </p>
          <label className="mb-1.5 mt-4 block text-[13px] font-medium text-muted-foreground">
            Content boundary (px)
          </label>
          <Input
            type="number"
            min={0}
            max={200}
            value={contentInset}
            onChange={(e) => onInsetChange(Number(e.target.value))}
          />
          <p className="mt-2 text-xs text-muted-foreground">
            Inner margin of the sheet: how close shapes and text may come
            to the page edge before they clamp and wrap.
          </p>
        </>
      )}
      <label className="mb-1.5 mt-4 block text-[13px] font-medium text-muted-foreground">
        UI preset
      </label>
      <Select
        value={chapterPresetId || 'none'}
        onValueChange={(v) => {
          if (v === null) return;
          onApplyPreset(v === 'none' ? '' : v);
        }}
      >
        <SelectTrigger className="w-full">
          <SelectValue placeholder="tldraw defaults" />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="none">tldraw defaults</SelectItem>
          {uiPresets.map((p) => (
            <SelectItem key={p.id} value={p.id}>
              {p.name}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
      <p className="mt-2 text-xs text-muted-foreground">
        Applies this preset to the chapter immediately and keeps it for
        future sessions. Manage presets in Settings → Presets.
      </p>
    </div>
  );
}
