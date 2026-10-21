import { ChevronLeft, ChevronRight, Download, Eye, Plus, Settings, Sticker } from 'lucide-react';import type { RefObject } from 'react';

interface PageControlsProps {
  index: number;
  count: number;
  onPrev: () => void;
  onNext: () => void;
  onAdd: () => void;
}

/** Page-chapter actions at the top-right: PDF export + chrome-less view. */
export interface PageActionsProps {
  onExportPdf: () => void;
  exporting: boolean;
  onToggleView: () => void;
}

interface CanvasTopBarProps {
  chapterName: string;
  /** Slot where tldraw's native page menu (topic dropdown) is portaled into. */
  pageMenuSlotRef: RefObject<HTMLDivElement | null>;
  /** Slot where tldraw's native main menu (⋮) is portaled into. */
  mainMenuSlotRef: RefObject<HTMLDivElement | null>;
  /** PDF-viewer controls, only rendered for multi-page topics. */
  pageControls: PageControlsProps | null;
  /** Export/View actions, only rendered for page chapters with sheets. */
  pageActions: PageActionsProps | null;
  onOpenSettings: () => void;
  /** Leave the canvas, back to the chapter list in its notebook. */
  onBack: () => void;
  /** Open the icon finder (also via `Ctrl+Alt+I`). Defined unless view mode. */
  onOpenIcons?: () => void;
}

export function CanvasTopBar({
  chapterName,
  pageMenuSlotRef,
  mainMenuSlotRef,
  pageControls,
  pageActions,
  onOpenSettings,
  onBack,
  onOpenIcons,
}: CanvasTopBarProps) {
  return (
    <header className="flex h-12 shrink-0 items-center justify-between border-b border-line bg-surface px-4">
      <div className="flex min-w-0 items-center gap-1.5 text-sm">
        <button
          title="Back to chapters"
          data-testid="topbar.back"
          onClick={onBack}
          className="-ml-2 rounded-md p-1.5 text-muted-foreground transition-colors hover:bg-raised hover:text-foreground"
        >
          <ChevronLeft className="h-4 w-4" />
        </button>
        <span className="truncate text-ink">{chapterName}</span>
        <span className="text-faint">/</span>
        {/* tldraw's native page menu trigger (page list) lands here */}
        <div ref={pageMenuSlotRef} className="flex min-w-0 items-center" />
        {/* tldraw's native main menu trigger (⋮) lands here */}
        <div ref={mainMenuSlotRef} className="flex items-center" />
      </div>
      <div className="flex shrink-0 items-center gap-3">
        {pageActions && (
          <div className="flex items-center gap-1">
            <button
              title="Export this topic as PDF"
              data-testid="topbar.export-pdf"
              onClick={pageActions.onExportPdf}
              disabled={pageActions.exporting}
              className="flex items-center gap-1.5 rounded-lg border border-line px-2.5 py-1.5 text-sm text-muted-foreground transition-colors hover:bg-raised hover:text-foreground disabled:opacity-40"
            >
              <Download className="h-4 w-4" />
              {pageActions.exporting ? 'Exporting…' : 'Export PDF'}
            </button>
            <button
              title="View mode — just the notes, arrow keys to flip pages (Esc exits)"
              data-testid="topbar.view"
              onClick={pageActions.onToggleView}
              className="flex items-center gap-1.5 rounded-lg border border-line px-2.5 py-1.5 text-sm text-muted-foreground transition-colors hover:bg-raised hover:text-foreground"
            >
              <Eye className="h-4 w-4" />
              View
            </button>
          </div>
        )}
        {pageControls && (
          <div className="flex items-center gap-0.5 rounded-lg border border-line bg-surface px-1 py-0.5">
            <button
              title="Previous page"
              onClick={pageControls.onPrev}
              disabled={pageControls.index === 0}
              className="rounded-md p-1.5 text-muted-foreground transition-colors hover:bg-raised hover:text-foreground disabled:opacity-30 disabled:hover:bg-transparent"
            >
              <ChevronLeft className="h-4 w-4" />
            </button>
            <span className="min-w-10 text-center text-sm tabular-nums text-ink">
              {pageControls.index + 1} / {pageControls.count}
            </span>
            <button
              title="Next page"
              onClick={pageControls.onNext}
              disabled={pageControls.index >= pageControls.count - 1}
              className="rounded-md p-1.5 text-muted-foreground transition-colors hover:bg-raised hover:text-foreground disabled:opacity-30 disabled:hover:bg-transparent"
            >
              <ChevronRight className="h-4 w-4" />
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

        {onOpenIcons && (
          <button
            title="Icon finder (Ctrl+Alt+I)"
            data-testid="topbar.icons"
            onClick={onOpenIcons}
            className="text-muted-foreground transition-colors hover:text-foreground"
          >
            <Sticker />
          </button>
        )}

        <button
          title="Settings"
          data-settings-toggle
          onClick={onOpenSettings}
          className="text-muted-foreground transition-colors hover:text-foreground"
        >
          <Settings />
        </button>
      </div>
    </header>
  );
}
