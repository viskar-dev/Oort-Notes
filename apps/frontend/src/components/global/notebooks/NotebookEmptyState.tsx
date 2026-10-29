import { BookOpen, Plus } from 'lucide-react';
import type { NotebookFilter } from '@/lib/ipc';

/** The two "nothing here" states: no match for the current search/filter
 *  (with a reset) or an empty workspace (with a first-create prompt). */
export function NotebookEmptyState({
  filter,
  hasQuery,
  onClearFilters,
  onOpenCreate,
}: {
  filter: NotebookFilter;
  hasQuery: boolean;
  onClearFilters: () => void;
  onOpenCreate: () => void;
}) {
  if (hasQuery || filter !== 'all') {
    return (
      <div className="flex flex-col items-center py-16 text-center">
        <p className="text-sm text-fg-2">No notebooks match</p>
        <button
          onClick={onClearFilters}
          className="mt-3 inline-flex h-8 items-center rounded-lg px-2.5 text-sm text-fg-2 transition-colors duration-150 hover:bg-white/[0.04] hover:text-iris"
        >
          Clear
        </button>
      </div>
    );
  }

  return (
    <div className="flex flex-col items-center py-20 text-center">
      <BookOpen className="h-8 w-8 text-fg-3" strokeWidth={1.5} aria-hidden />
      <p className="mt-4 text-sm text-fg-2">No notebooks yet</p>
      <button
        onClick={onOpenCreate}
        className="mt-3 inline-flex h-8 items-center gap-1.5 rounded-lg px-2.5 text-sm text-fg-2 transition-colors duration-150 hover:bg-white/[0.04] hover:text-iris"
      >
        <Plus className="h-3.5 w-3.5" strokeWidth={1.5} aria-hidden /> Create your first notebook
      </button>
    </div>
  );
}
