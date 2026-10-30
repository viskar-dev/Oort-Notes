import { PanelLeftClose, Plus } from 'lucide-react';
import { ChapterRow } from './ChapterRow';
import { Empty, EmptyDescription, EmptyHeader, EmptyTitle } from '@/components/ui/empty';
import type { Chapter } from '@/lib/ipc';

/** The left column of the notebook screen: hover-revealed "New chapter" and
 *  collapse actions in the header block, then the plain chapter rows (each
 *  h-11, packed without margins). Purely a skin — selection and dialogs stay
 *  with the page. */
export function ChaptersPanel({
  items,
  selectedId,
  onSelect,
  onCreate,
  onRename,
  onDelete,
  onCollapse,
}: {
  items: Chapter[] | null;
  selectedId: string | null;
  onSelect: (chapterId: string) => void;
  onCreate: () => void;
  onRename: (chapter: Chapter) => void;
  onDelete: (chapter: Chapter) => void;
  /** Collapses the chapters column (presentational toggle owned by the page). */
  onCollapse?: () => void;
}) {
  return (
    <aside className="group/panel w-full">
      {/* header block: both columns use the same h-20 so their first rows align */}
      <div className="flex h-20 items-center justify-between">
        <div className="flex items-baseline gap-2">
          <h2 className="text-sm font-medium text-fg-1">Chapters</h2>
          {items && <span className="text-xs text-fg-3 tabular-nums">{items.length}</span>}
        </div>
        <div className="flex items-center gap-1 opacity-0 pointer-events-none transition-opacity duration-100 group-hover/panel:pointer-events-auto group-hover/panel:opacity-100 group-focus-within:pointer-events-auto group-focus-within:opacity-100 pointer-coarse:pointer-events-auto pointer-coarse:opacity-100">
          <button
            onClick={onCreate}
            aria-label="New chapter"
            title="New chapter"
            className="flex h-7 w-7 items-center justify-center rounded-lg text-fg-3 transition-colors duration-150 hover:bg-white/[0.04] hover:text-fg-1"
          >
            <Plus className="h-3.5 w-3.5" strokeWidth={1.5} />
          </button>
          {onCollapse && (
            <button
              onClick={onCollapse}
              aria-label="Collapse sidebar"
              title="Collapse sidebar"
              className="flex h-7 w-7 items-center justify-center rounded-lg text-fg-3 transition-colors duration-150 hover:bg-white/[0.04] hover:text-fg-1"
            >
              <PanelLeftClose className="h-3.5 w-3.5" strokeWidth={1.5} />
            </button>
          )}
        </div>
      </div>

      {/* rows: packed without margins; the wrapper has no horizontal padding so
          the rows' -mx bleed keeps hover fills soft against the column edge */}
      <div className="flex flex-col pb-4 pt-4">
        {items === null && <p className="px-2.5 py-6 text-sm text-fg-3">Loading…</p>}
        {items?.length === 0 && (
          <Empty className="border-none bg-transparent p-2">
            <EmptyHeader>
              <EmptyTitle>No chapters yet</EmptyTitle>
              <EmptyDescription>Chapters are the canvases of this notebook.</EmptyDescription>
            </EmptyHeader>
          </Empty>
        )}
        {items?.map((chapter, i) => (
          <ChapterRow
            key={chapter.id}
            chapter={chapter}
            index={i}
            active={chapter.id === selectedId}
            onSelect={onSelect}
            onRename={onRename}
            onDelete={onDelete}
          />
        ))}
      </div>
    </aside>
  );
}
