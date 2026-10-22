import { ChevronLeft, ChevronRight, Plus, Settings } from 'lucide-react';
import type { RefObject } from 'react';

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
   *  only; infinite canvases get just Back + Settings chips top-right. */
  strip?: boolean;
  onOpenSettings: () => void;
  /** Leave the canvas, back to the chapter list in its notebook. */
  onBack: () => void;
}

export function CanvasTopBar({
  chapterName,
  pageMenuSlotRef,
  mainMenuSlotRef,
  pageControls,
  strip = true,
  onOpenSettings,
  onBack,
}: CanvasTopBarProps) {
  /* Infinite canvases: no header at all — just floating Back + Settings
     chips so navigation and the settings card stay reachable. */
  if (!strip) {
    return (
      <div className="pointer-events-none absolute inset-0 top-0 z-40 flex h-10 items-center justify-between p-2">
        <button
          title="Back to chapters"
          data-testid="topbar.back"
          onClick={onBack}
          className="pointer-events-auto rounded-md bg-surface p-1.5 text-muted-foreground transition-colors hover:bg-raised hover:text-foreground"
        >
          <ChevronLeft className="h-4 w-4" />
        </button>
        <button
          title="Settings"
          data-settings-toggle
          onClick={onOpenSettings}
          className="pointer-events-auto rounded-md bg-surface p-1.5 text-muted-foreground transition-colors hover:bg-raised hover:text-foreground"
        >
          <Settings size={16} />
        </button>
      </div>
    );
  }
  return (
    /* page chapters: a real header bar — solid background, own row in the
       flex column so the canvas starts below it */
    <header className="z-40 flex h-10 shrink-0 items-center justify-between border-b border-line bg-surface p-2">
      <div className="flex min-w-0 items-center gap-1.5 text-sm px-2">
        <button
          title="Back to chapters"
          data-testid="topbar.back"
          onClick={onBack}
          className="-ml-2 rounded-md p-1.5 text-muted-foreground transition-colors hover:bg-raised hover:text-foreground"
        >
          <ChevronLeft className="h-4 w-4" />
        </button>
        <span className="truncate text-sm font-bold text-ink">{chapterName}</span>
        <span className="text-faint">/</span>
        {/* tldraw's native page menu trigger (page list) lands here */}
        <div ref={pageMenuSlotRef} className="flex min-w-0 items-center" />
        {/* tldraw's native main menu trigger (⋮) lands here — keeps its own pill bg */}
        <div ref={mainMenuSlotRef} className="flex items-center" />
      </div>

      <div className="flex shrink-0 items-center gap-3">
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

        <button
          title="Settings"
          data-settings-toggle
          onClick={onOpenSettings}
          className="flex items-center rounded-md p-1.5 text-muted-foreground transition-colors hover:bg-raised hover:text-foreground"
        >
          <Settings size={16} />
        </button>
      </div>
    </header>
  );
}
