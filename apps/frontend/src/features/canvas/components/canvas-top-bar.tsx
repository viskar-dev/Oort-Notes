import { ChevronLeft, Settings, Sparkles } from 'lucide-react';
import { useEffect, useState, type RefObject } from 'react';
import { isTauri } from '@tauri-apps/api/core';
import { kbdHint } from '@/lib/platform';

/** Tooltip hint for the AI toggle, rendered per platform (⌥⌘A on macOS). */
const AI_ASSISTANT_HINT = kbdHint('cmd+alt+a');

/** Height of the hover band that reveals the canvas chrome (h-8). Keep the
 *  bar's class (h-8) and the runtime caption-strip height below in sync
 *  with this constant — the reveal trigger is geometry, so a taller/shorter
 *  bar without updating it makes the chrome open too early (or too late).
 *  App pages keep the taller 56px navbar band via the :root default. */
const CHROME_BAND_PX = 32;
/** Pointer must travel this far below the band before the chrome may hide —
 *  stops the in/out thrash when grazing the band edge (so no hide delay is
 *  needed: leaving the margin hides instantly). */
const HYSTERESIS_PX = 16;

/** Page-chapter settings at the top-right: settings + AI (View mode moved
 *  into the ⋮ menu's Preferences submenu, Ctrl+Alt+V). Page paging lives in
 *  the bottom-right floating pill (CanvasShell). */
interface CanvasTopBarProps {
  chapterName: string;
  /** Slot where tldraw's native page menu (topic dropdown) is portaled into. */
  pageMenuSlotRef: RefObject<HTMLDivElement | null>;
  /** Slot where tldraw's native main menu (⋮) is portaled into. */
  mainMenuSlotRef: RefObject<HTMLDivElement | null>;
  /** The floating header strip (name / topic / ⋮) lives on page chapters
   *  only; infinite canvases get a slim hover-only bar with Back + AI +
   *  Settings. */
  strip?: boolean;
  onOpenSettings: () => void;
  /** Leave the canvas, back to the chapter list in its notebook. */
  onBack: () => void;
  /** Toggle the AI chat panel (undefined in web builds ⇒ no button). */
  onOpenAi?: () => void;
}

export function CanvasTopBar({
  chapterName,
  pageMenuSlotRef,
  mainMenuSlotRef,
  strip = true,
  onOpenSettings,
  onBack,
  onOpenAi,
}: CanvasTopBarProps) {
  /* Desktop: the whole canvas header — app buttons AND the native window
     caption panel — is one hover-revealed layer floating OVER the canvas
     (the canvas takes the full window; the chrome owns nothing in flow).
     Web builds keep it always visible. */
  const [revealed, setRevealed] = useState(!isTauri());

  const reveal = () => setRevealed(true);

  /* Instant state flips at the band boundaries only: reveal when the
     pointer is inside the band, hide the moment it clears the hysteresis
     margin. Geometry-driven instead of over/out listeners so the plugin's
     caption buttons (own hit targets, over the band) can't flicker it. */
  useEffect(() => {
    if (!isTauri()) return;
    const onMove = (e: MouseEvent) => {
      if (e.clientY <= CHROME_BAND_PX) setRevealed(true);
      else if (e.clientY > CHROME_BAND_PX + HYSTERESIS_PX) setRevealed(false);
    };
    document.addEventListener('mousemove', onMove);
    return () => {
      document.removeEventListener('mousemove', onMove);
      document.body.classList.remove('canvas-chrome-hidden');
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  /* drive the plugin's caption buttons with the same fade (see index.css)
     and re-tune the caption strip's height for this page's slimmer band */
  useEffect(() => {
    if (!isTauri()) return;
    document.body.classList.toggle('canvas-chrome-hidden', !revealed);
  }, [revealed]);

  useEffect(() => {
    if (!isTauri()) return;
    const rootStyle = document.documentElement.style;
    // must equal the band above (32px): the native caption buttons are
    // fixed 32px tall, so the strip at 28px would let them overhang.
    rootStyle.setProperty('--tauri-plugin-decoration-titlebar-height', '32px');
    return () => {
      rootStyle.removeProperty('--tauri-plugin-decoration-titlebar-height');
    };
  }, []);

  /* Both chapters are overlays on the full-size canvas: an invisible
     always-active strip keeps window dragging while the chrome is hidden,
     and the revealed bar sits above it in DOM order (clickable). The strip
     must never catch clicks intended for the bar. */
  if (!strip) {
    return (
      <div
        className="pointer-events-none absolute inset-x-0 top-0 z-40 h-8"
        onFocusCapture={reveal}
      >
        <div data-tauri-drag-region className="pointer-events-auto absolute inset-0" />
        <div
          className={`relative flex h-full items-center justify-between  border-line bg-background pl-3 pr-[max(8px,var(--tauri-plugin-decoration-right-clearance,0px))] transition-opacity ${
            revealed ? 'pointer-events-auto opacity-100 duration-150' : 'pointer-events-none opacity-0 duration-100'
          }`}
        >
          <button
            title="Back to chapters"
            data-testid="topbar.back"
            onClick={onBack}
            className="rounded-md p-2 text-muted-foreground transition-colors hover:bg-raised hover:text-foreground"
          >
            <ChevronLeft className="h-4 w-4" />
          </button>
          <div className="flex items-center gap-1.5">
            {onOpenAi && (
              <button
                title={`AI assistant (${AI_ASSISTANT_HINT})`}
                onClick={onOpenAi}
                className="rounded-md p-2 text-muted-foreground transition-colors hover:bg-raised hover:text-primary"
              >
                <Sparkles size={16} />
              </button>
            )}
            <button
              title="Settings"
              data-settings-toggle
              onClick={onOpenSettings}
              className="rounded-md p-2 text-muted-foreground transition-colors hover:bg-raised hover:text-foreground"
            >
              <Settings size={16} />
            </button>
          </div>
        </div>
      </div>
    );
  }
  return (
    <div
      className="pointer-events-none absolute inset-x-0 top-0 z-40 h-8"
      onFocusCapture={reveal}
    >
      <div data-tauri-drag-region className="pointer-events-auto absolute inset-0" />
      <header
        className={`relative flex h-full items-center justify-between border-line bg-background pl-3 pr-[max(8px,var(--tauri-plugin-decoration-right-clearance,0px))] transition-opacity ${
          revealed ? 'pointer-events-auto opacity-100 duration-150' : 'pointer-events-none opacity-0 duration-100'
        }`}
      >
        <div
          className="flex min-w-0 items-center gap-1.5 text-sm px-2"
          data-tauri-drag-region
        >
          <button
            title="Back to chapters"
            data-testid="topbar.back"
            onClick={onBack}
            className="rounded-md p-2 text-muted-foreground transition-colors hover:bg-raised hover:text-foreground"
          >
            <ChevronLeft className="h-4 w-4" />
          </button>
          <span data-tauri-drag-region className="truncate text-sm font-bold text-ink">{chapterName}</span>
          <span data-tauri-drag-region className="text-faint">/</span>
          {/* tldraw's native page menu trigger (page list) lands here */}
          <div ref={pageMenuSlotRef} className="flex min-w-0 items-center" />
          {/* tldraw's native main menu trigger (⋮) lands here — keeps its own pill bg */}
          <div ref={mainMenuSlotRef} className="flex items-center" />
        </div>

        <div
          data-tauri-drag-region
          className="flex shrink-0 items-center gap-3"
        >
          <div className="flex shrink-0 items-center gap-1.5">
            {onOpenAi && (
              <button
                title={`AI assistant (${AI_ASSISTANT_HINT})`}
                onClick={onOpenAi}
                className="rounded-md p-2 text-muted-foreground transition-colors hover:bg-raised hover:text-primary"
              >
                <Sparkles size={16} />
              </button>
            )}

            <button
              title="Settings"
              data-settings-toggle
              onClick={onOpenSettings}
              className="flex items-center rounded-md p-2 text-muted-foreground transition-colors hover:bg-raised hover:text-foreground"
            >
              <Settings size={16} />
            </button>
          </div>
        </div>
      </header>
    </div>
  );
}
