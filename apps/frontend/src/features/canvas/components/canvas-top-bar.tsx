import { ChevronLeft, ChevronRight, Plus, Settings, Sparkles } from 'lucide-react';
import { useEffect, useRef, useState, type RefObject } from 'react';
import { isTauri } from '@tauri-apps/api/core';

/** Height of the hover band that reveals the canvas chrome. Matches the
 *  app navbar (h-14) so the native caption buttons (window controls) align
 *  inside the same band on every screen. */
const CHROME_BAND_PX = 56;

/** Page-chapter actions at the top-right: page pager + settings (View mode
 *  moved into the ⋮ menu's Preferences submenu, Ctrl+Alt+V). */
interface PageControlsProps {
  index: number;
  count: number;
  onPrev: () => void;
  onNext: () => void;
  onAdd: () => void;
}

interface CanvasTopBarProps {
  chapterName: string;
  /** Slot where tldraw's native page menu (topic dropdown) is portaled into. */
  pageMenuSlotRef: RefObject<HTMLDivElement | null>;
  /** Slot where tldraw's native main menu (⋮) is portaled into. */
  mainMenuSlotRef: RefObject<HTMLDivElement | null>;
  /** PDF-viewer controls, only rendered for multi-page topics. */
  pageControls: PageControlsProps | null;
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
  pageControls,
  strip = true,
  onOpenSettings,
  onBack,
  onOpenAi,
}: CanvasTopBarProps) {
  /* Desktop: the whole canvas header — app buttons AND the native window
     caption panel — is one hover-revealed layer, navbar-style. Web builds
     keep it always visible. */
  const [revealed, setRevealed] = useState(!isTauri());
  const hideTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const reveal = () => {
    if (hideTimer.current !== null) clearTimeout(hideTimer.current);
    hideTimer.current = null;
    setRevealed(true);
  };
  // short delay so grazing the band edge doesn't flicker
  const scheduleHide = () => {
    if (hideTimer.current !== null) clearTimeout(hideTimer.current);
    hideTimer.current = setTimeout(() => {
      hideTimer.current = null;
      setRevealed(false);
    }, 350);
  };

  /* Geometry-based reveal (pointer inside the top band) instead of
     over/out listeners: the plugin's caption buttons overlay this band with
     their own hit targets, so :hover on the bar alone would flicker /
     never fire inside the button region. mousemove keeps the layer lit
     across the whole band, buttons included. */
  useEffect(() => {
    if (!isTauri()) return;
    const onMove = (e: MouseEvent) => {
      if (e.clientY <= CHROME_BAND_PX) reveal();
      else scheduleHide();
    };
    document.addEventListener('mousemove', onMove);
    return () => {
      document.removeEventListener('mousemove', onMove);
      if (hideTimer.current !== null) clearTimeout(hideTimer.current);
      document.body.classList.remove('canvas-chrome-hidden');
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  /* drive the plugin's caption buttons with the same fade (see index.css) */
  useEffect(() => {
    if (!isTauri()) return;
    document.body.classList.toggle('canvas-chrome-hidden', !revealed);
  }, [revealed]);

  /* Infinite canvases: no name strip — a hover-revealed bar with Back +
     AI + Settings; the native caption panel completes the band top-right
     (clearance below). Hidden ⇒ pointer-transparent, canvas untouched
     except the always-active drag strip underneath. */
  if (!strip) {
    return (
      <div className="pointer-events-none absolute inset-x-0 top-0 z-40 h-14">
        <div data-tauri-drag-region className="pointer-events-auto absolute inset-0" />
        <div
          data-tauri-drag-region
          onFocusCapture={reveal}
          className={`relative flex h-full items-center justify-between border-b border-line bg-surface pl-3 pr-[max(12px,var(--tauri-plugin-decoration-right-clearance,0px))] transition-opacity duration-200 ${
            revealed ? 'opacity-100' : 'pointer-events-none opacity-0'
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
                title="AI assistant (Ctrl+Alt+A)"
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
    /* page chapters: a solid header — chapter name, tldraw menu triggers,
       page pager, AI, Settings; the native window controls land in the
       same band (clearance reserved). Hover-only on desktop: the invisible
       strip underneath keeps window dragging while the header is hidden. */
    <div className="relative shrink-0" onFocusCapture={reveal}>
      <div data-tauri-drag-region className="absolute inset-0 top-0" />
      <header
        className={`relative z-40 flex h-14 shrink-0 items-center justify-between border-b border-line bg-surface pl-2 pr-[max(8px,var(--tauri-plugin-decoration-right-clearance,0px))] transition-opacity duration-200 ${
          revealed ? 'opacity-100' : 'pointer-events-none opacity-0'
        }`}
      >
        <div
          data-tauri-drag-region
          className="flex min-w-0 items-center gap-1.5 text-sm px-2"
        >
          <button
            title="Back to chapters"
            data-testid="topbar.back"
            onClick={onBack}
            className="-ml-1 rounded-md p-1.5 text-muted-foreground transition-colors hover:bg-raised hover:text-foreground"
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
            {pageControls && (
              <div className="flex items-center gap-0.5 rounded-lg border border-line bg-raised px-1 py-0.5">
                <button
                  title="Previous page"
                  onClick={pageControls.onPrev}
                  disabled={pageControls.index === 0}
                  className="rounded-md p-1.5 text-muted-foreground transition-colors hover:bg-raised hover:text-foreground disabled:opacity-30 disabled:hover:bg-transparent"
                >
                  <ChevronLeft className="h-3 w-3" />
                </button>
                <span className="min-w-10 text-center text-xs tabular-nums text-ink">
                  {pageControls.index + 1} / {pageControls.count}
                </span>
                <button
                  title="Next page"
                  onClick={pageControls.onNext}
                  disabled={pageControls.index >= pageControls.count - 1}
                  className="rounded-md p-1.5 text-muted-foreground transition-colors hover:bg-raised hover:text-foreground disabled:opacity-30 disabled:hover:bg-transparent"
                >
                  <ChevronRight className="h-3 w-3" />
                </button>
                <button
                  title="Add page"
                  onClick={pageControls.onAdd}
                  className="rounded-md p-1.5 text-muted-foreground transition-colors hover:bg-raised hover:text-foreground"
                >
                  <Plus className="h-4 w-4" />
                </button>
              </div>
            )}

            {onOpenAi && (
              <button
                title="AI assistant (Ctrl+Alt+A)"
                onClick={onOpenAi}
                className="rounded-md p-1.5 text-muted-foreground transition-colors hover:bg-raised hover:text-primary"
              >
                <Sparkles size={16} />
              </button>
            )}

            <button
              title="Settings"
              data-settings-toggle
              onClick={onOpenSettings}
              className="flex items-center rounded-md p-1.5 text-muted-foreground transition-colors hover:bg-raised hover:text-foreground"
            >
              <Settings size={16} />
            </button>
          </div>
        </div>
      </header>
    </div>
  );
}
