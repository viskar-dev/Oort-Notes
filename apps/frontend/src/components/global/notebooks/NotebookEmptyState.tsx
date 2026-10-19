import { Plus } from 'lucide-react';
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
      <div className="py-10 text-center">
        <p className="text-sm text-[#a09fab]">No notebooks match</p>
        <button
          onClick={onClearFilters}
          className="mt-4 h-9 rounded-[10px] border border-[#24232c] px-4 text-[13px] text-[#a09fab] transition-colors hover:bg-[#17161c]"
        >
          Clear filter
        </button>
      </div>
    );
  }

  return (
    <div className="py-10 text-center">
      <div className="mx-auto max-w-[280px]">
        <button
          type="button"
          onClick={onOpenCreate}
          title="Create a notebook"
          className="nb-cover mb-8 flex w-full cursor-pointer items-center justify-center"
          style={{ borderStyle: 'dashed' }}
        >
          <span className="text-[#a09fab]">
            <Plus className="h-8 w-8" />
          </span>
        </button>
        <p className="text-sm text-[#a09fab]">Create your first notebook</p>
        <button
          onClick={onOpenCreate}
          className="mt-4 inline-flex h-10 items-center gap-2 rounded-[10px] bg-[#7c6ee6] px-4 text-sm font-medium text-white transition-colors hover:bg-[#8b7ff0] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#7c6ee6]"
        >
          <Plus className="h-4 w-4" /> New notebook
        </button>
      </div>
    </div>
  );
}
