import { BookOpen, Plus, SearchX } from 'lucide-react';
import { Empty, EmptyContent, EmptyDescription, EmptyHeader, EmptyMedia, EmptyTitle } from '@/components/ui/empty';
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
      <Empty className="mx-auto my-16 max-w-sm">
        <EmptyHeader>
          <EmptyMedia variant="icon">
            <SearchX strokeWidth={1.5} />
          </EmptyMedia>
          <EmptyTitle>No notebooks match</EmptyTitle>
          <EmptyDescription>Nothing fits the current filter. Clear it to see everything.</EmptyDescription>
        </EmptyHeader>
        <EmptyContent>
          <button
            onClick={onClearFilters}
            className="inline-flex h-8 items-center rounded-lg px-2.5 text-sm text-fg-2 transition-colors duration-150 hover:bg-white/[0.04] hover:text-fg-1"
          >
            Clear filter
          </button>
        </EmptyContent>
      </Empty>
    );
  }

  return (
    <Empty className="mx-auto my-20 max-w-sm">
      <EmptyHeader>
        <EmptyMedia variant="icon">
          <BookOpen strokeWidth={1.5} />
        </EmptyMedia>
        <EmptyTitle>No notebooks yet</EmptyTitle>
        <EmptyDescription>Notebooks hold your chapters and every canvas you draw.</EmptyDescription>
      </EmptyHeader>
      <EmptyContent>
        <button
          onClick={onOpenCreate}
          className="inline-flex h-8 items-center gap-1.5 rounded-lg px-2.5 text-sm text-fg-2 transition-colors duration-150 hover:bg-white/[0.04] hover:text-fg-1"
        >
          <Plus className="h-3.5 w-3.5" strokeWidth={1.5} aria-hidden /> Create your first notebook
        </button>
      </EmptyContent>
    </Empty>
  );
}
