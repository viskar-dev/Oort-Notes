import { ChevronLeft, Settings, Sparkles } from 'lucide-react';
import { useEffect, useState, type RefObject } from 'react';
import { isTauri } from '@tauri-apps/api/core';
import { kbdHint } from '@/lib/platform';

/** Tooltip hint for the AI toggle, rendered per platform (⌥⌘A on macOS). */
const AI_ASSISTANT_HINT = kbdHint('cmd+alt+a');

/** Height of the hover band that reveals the canvas chrome (h-8). Keep the
 *  bar's class (h-8) and the runtime caption-strip height below in sync
 *  with this constant. */
const CHROME_BAND_PX = 32;
/** Pointer must travel this far below the band before the chrome may hide. */
const HYSTERESIS_PX = 16;

interface CanvasTopBarProps {
  chapterName: string;
  /** Slot where tldraw's native page menu (topic dropdown) is portaled into. */
  pageMenuSlotRef: RefObject<HTMLDivElement | null>;
  /** Slot where tldraw's native main menu (⋮) is portaled into. */
  mainMenuSlotRef: RefObject<HTMLDivElement | null>;
  /** Floating header strip (name / topic / ⋮) for page chapters only;
   *  infinite canvases get a slim hover-only bar with Back + AI + Settings. */
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
  const [revealed, setRevealed] = useState(!isTauri());

  const reveal = () => setRevealed(true);

  /* Geometry-driven reveal/hide. Skipped while a mouse button is held so
     canvas drags (shapes, selection, panning) never toggle the chrome. */
  useEffect(() => {
    if (!isTauri()) return;
    const onMove = (e: MouseEvent) => {
      if (e.buttons !== 0) return;
      if (e.clientY <= CHROME_BAND_PX) setRevealed(true);
      else if (e.clientY > CHROME_BAND_PX + HYSTERESIS_PX) setRevealed(false);
    };
    document.addEventListener('mousemove', onMove);
    return () => {
      document.removeEventListener('mousemove', onMove);
      document.body.classList.remove('canvas-chrome-hidden');
    };
  }, []);

  /* Drive the plugin's caption buttons with the same fade (see index.css). */
  useEffect(() => {
    if (!isTauri()) return;
    document.body.classList.toggle('canvas-chrome-hidden', !revealed);
  }, [revealed]);

  /* Match the caption strip height to this page's band. */
  useEffect(() => {
    if (!isTauri()) return;
    const rootStyle = document.documentElement.style;
    rootStyle.setProperty('--tauri-plugin-decoration-titlebar-height', '32px');
    return () => {
      rootStyle.removeProperty('--tauri-plugin-decoration-titlebar-height');
    };
  }, []);

  const visibilityClass = revealed
    ? 'pointer-events-auto opacity-100 duration-150'
    : 'pointer-events-none opacity-0 duration-100';

  const barBase =
    'relative flex h-full items-center justify-between border-line bg-background pl-3 pr-[max(8px,var(--tauri-plugin-decoration-right-clearance,0px))] transition-opacity';

  const backButton = (
    <button
      title="Back to chapters"
      data-testid="topbar.back"
      onClick={onBack}
      className="shrink-0 rounded-md p-2 text-muted-foreground transition-colors hover:bg-raised hover:text-foreground"
    >
      <ChevronLeft className="h-4 w-4" />
    </button>
  );

  const rightButtons = (
    <div data-tauri-drag-region className="flex shrink-0 items-center gap-1.5">
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
  );

  /* The outer wrapper never catches pointer events. When hidden, the bar is
     pointer-events-none too, so the canvas gets every click. When revealed,
     the bar is the drag surface. data-tauri-drag-region is NOT inherited:
     every element that can receive the mousedown needs it. */
  if (!strip) {
    return (
      <div
        className="pointer-events-none absolute inset-x-0 top-0 z-40 h-8"
        onFocusCapture={reveal}
      >
        <div data-tauri-drag-region className={`${barBase} ${visibilityClass}`}>
          <div data-tauri-drag-region className="flex shrink-0 items-center gap-1.5">
            {backButton}
            {/* tldraw's native main menu (⋮) lands here on infinite canvases too */}
            <div
              ref={mainMenuSlotRef}
              data-tauri-drag-region
              className="flex shrink-0 items-center"
            />
          </div>
          <div data-tauri-drag-region className="h-full min-w-8 flex-1" />
          {rightButtons}
        </div>
      </div>
    );
  }

  return (
    <div
      className="pointer-events-none absolute inset-x-0 top-0 z-40 h-8"
      onFocusCapture={reveal}
    >
      <header
        data-tauri-drag-region
        className={`${barBase} ${visibilityClass}`}
      >
        <div
          data-tauri-drag-region
          className="flex min-w-0 items-center gap-1.5 px-2 text-sm"
        >
          {backButton}
          <span
            data-tauri-drag-region
            className="hidden max-w-[40vw] truncate text-sm font-bold text-ink sm:inline"
          >
            {chapterName}
          </span>
          <span data-tauri-drag-region className="hidden text-faint sm:inline">
            /
          </span>
          {/* tldraw's native page menu trigger (page list) lands here */}
          <div
            ref={pageMenuSlotRef}
            data-tauri-drag-region
            className="flex min-w-0 max-w-[30vw] items-center"
          />
          {/* tldraw's native main menu trigger (⋮) lands here */}
          <div
            ref={mainMenuSlotRef}
            data-tauri-drag-region
            className="flex shrink-0 items-center"
          />
        </div>

        {/* Guaranteed drag area between the left and right groups */}
        <div data-tauri-drag-region className="h-full min-w-8 flex-1" />

        <div data-tauri-drag-region className="flex shrink-0 items-center gap-3">
          {rightButtons}
        </div>
      </header>
    </div>
  );
}
