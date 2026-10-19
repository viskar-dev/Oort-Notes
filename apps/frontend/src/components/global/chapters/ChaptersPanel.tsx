import { Plus } from 'lucide-react';
import { ChapterRow } from './ChapterRow';
import type { Chapter } from '@/lib/ipc';

/** The sidebar panel: the chapter list (with the selection bar), the count
 *  badge and the "New chapter" button. */
export function ChaptersPanel({
  items,
  selectedId,
  hasSearch,
  onSelect,
  onCreate,
  onRename,
  onDelete,
}: {
  items: Chapter[] | null;
  selectedId: string | null;
  hasSearch: boolean;
  onSelect: (chapterId: string) => void;
  onCreate: () => void;
  onRename: (chapter: Chapter) => void;
  onDelete: (chapter: Chapter) => void;
}) {
  return (
    <aside className="w-[280px] shrink-0 rounded-xl border border-[#24232c] bg-[#111016]">
      <div className="flex items-center justify-between px-4 py-3.5">
        <div className="flex items-center gap-2">
          <span className="text-sm font-semibold text-[#f4f4f6]">Chapters</span>
          {items && (
            <span className="flex h-5 min-w-5 items-center justify-center rounded-full bg-[#17161c] px-1.5 text-[11px] text-[#8b8a96]">
              {items.length}
            </span>
          )}
        </div>
        <button
          onClick={onCreate}
          className="flex h-8 items-center gap-1.5 rounded-lg border border-[#24232c] bg-[#17161c] px-2.5 text-[13px] text-[#f4f4f6] transition-colors hover:bg-[#1c1b22]"
        >
          <Plus className="h-3.5 w-3.5 text-[#a09fab]" /> New chapter
        </button>
      </div>

      <div className="px-2 pb-2">
        {items === null && <p className="px-3 py-6 text-sm text-[#8b8a96]">Loading…</p>}
        {items?.length === 0 && (
          <p className="px-3 py-6 text-sm text-[#8b8a96]">
            {hasSearch ? 'No matches' : 'No chapters yet'}
          </p>
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
