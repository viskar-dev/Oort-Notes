import { ChevronDown } from 'lucide-react';
import { NOTEBOOK_TABS, NOTEBOOK_SORTS } from '@/constants/notebooks/filters';
import type { NotebookFilter, NotebookSort } from '@/lib/ipc';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { APP_CONTAINER } from '@/components/layout/workspace-layout';

/** Sticky filter row: the notebook tabs plus the sort menu. The sort menu is
 *  the shared dropdown (Escape/outside click handled there), so this is a
 *  leaf that owns no effects. */
export function NotebookFilterRow({
  filter,
  sort,
  onFilterChange,
  onSortChange,
}: {
  filter: NotebookFilter;
  sort: NotebookSort;
  onFilterChange: (filter: NotebookFilter) => void;
  onSortChange: (sort: NotebookSort) => void;
}) {
  return (
    <div className="sticky top-14 z-20 mt-8 bg-[#060608]">
      <div className={APP_CONTAINER}>
        <div className="flex h-12 items-center justify-between border-b border-[#24232c]">
          <div className="flex items-center gap-1">
            {NOTEBOOK_TABS.map((t) => (
              <button
                key={t}
                onClick={() => onFilterChange(t)}
                className={
                  filter === t
                    ? 'h-8 rounded-lg border border-[#24232c] bg-[#1c1b22] px-3 text-[13px] text-[#f4f4f6]'
                    : 'h-8 rounded-lg border border-transparent px-3 text-[13px] text-[#a09fab] transition-colors hover:bg-[#17161c]'
                }
              >
                {t[0].toUpperCase() + t.slice(1)}
              </button>
            ))}
          </div>

          <DropdownMenu>
            <DropdownMenuTrigger
              render={
                <button
                  className="inline-flex h-8 items-center gap-1 rounded-lg px-2 text-[13px] text-[#a09fab] transition-colors hover:bg-[#17161c] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#7c6ee6] focus-visible:ring-offset-2 focus-visible:ring-offset-[#060608]"
                  aria-label="Sort notebooks"
                >
                  {NOTEBOOK_SORTS.find((sortOption) => sortOption.id === sort)?.label}
                  <ChevronDown className="h-3.5 w-3.5" />
                </button>
              }
            />
            <DropdownMenuContent align="end" className="w-44">
              {NOTEBOOK_SORTS.map((sortOption) => (
                <DropdownMenuItem
                  key={sortOption.id}
                  onClick={() => onSortChange(sortOption.id)}
                  className="flex w-full items-center justify-between rounded-md px-3 py-2 text-left text-[13px]"
                  style={sort === sortOption.id ? { color: '#f4f4f6' } : undefined}
                >
                  {sortOption.label}
                  {sort === sortOption.id && <span className="text-[#7c6ee6]">✓</span>}
                </DropdownMenuItem>
              ))}
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </div>
    </div>
  );
}
