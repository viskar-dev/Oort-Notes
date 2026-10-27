import { useEffect, useRef, useState } from 'react';
import { LayoutGrid, List, Search } from 'lucide-react';
import { NOTEBOOK_TABS } from '@/constants/notebooks/filters';
import type { NotebookFilter, NotebookSort } from '@/lib/ipc';
import {
  HOME_CONTAINER,
  SEARCH_FOCUS_EVENT,
  type LayoutSearch,
} from '@/components/layout/workspace-layout';

/** Controls row for the notebooks home: the four filter tabs with a sliding
 *  accent underline, the search filter field (⌘K targets it), the sort menu
 *  and the list/grid view toggle. The underline position is purely visual
 *  state; the tab active styles carry the real selection. */
export function NotebookFilterRow({
  filter,
  search,
  view,
  onViewChange,
  onFilterChange,
  count,
}: {
  filter: NotebookFilter;
  /** Sort props remain in the contract because the page still passes them;
   *  the sort menu itself is parked for now (experiment). */
  sort?: NotebookSort;
  /** Same home search state as before, re-housed into the controls row;
   *  omitting it keeps the row search-less (no other page uses this row). */
  search?: LayoutSearch;
  /** List/grid view state; omitted hides the toggle. */
  view?: 'list' | 'grid';
  onViewChange?: (view: 'list' | 'grid') => void;
  /** Result count of the active tab (the only one the data can answer). */
  count?: number;
  onFilterChange: (filter: NotebookFilter) => void;
  onSortChange?: (sort: NotebookSort) => void;
}) {
  const tabRefs = useRef<Record<string, HTMLButtonElement | null>>({});
  const searchRef = useRef<HTMLInputElement>(null);
  const [underline, setUnderline] = useState({ left: 0, width: 0 });

  // keep the sliding underline pinned to the active tab's geometry;
  // font loading can shift tab widths, so re-measure once fonts settle.
  const measure = useRef((current: NotebookFilter) => {
    const el = tabRefs.current[current];
    if (el) setUnderline({ left: el.offsetLeft, width: el.offsetWidth });
  });

  useEffect(() => {
    measure.current(filter);
    document.fonts?.ready?.then(() => measure.current(filter));
    const onResize = () => measure.current(filter);
    window.addEventListener('resize', onResize);
    return () => window.removeEventListener('resize', onResize);
  }, [filter]);

  // ⌘K / the top-bar search icon land in this input (see WorkspaceLayout)
  useEffect(() => {
    if (!search) return;
    const onFocus = () => searchRef.current?.focus();
    window.addEventListener(SEARCH_FOCUS_EVENT, onFocus);
    return () => window.removeEventListener(SEARCH_FOCUS_EVENT, onFocus);
  }, [search]);

  return (
    <div className="sticky top-14 z-20 mt-10 bg-bg/60 backdrop-blur-md">
      <div className={HOME_CONTAINER}>
        <div className="flex h-10 items-center justify-between">
          <div
            role="tablist"
            aria-label="Notebook filters"
            className="relative flex items-center"
          >
            {NOTEBOOK_TABS.map((tab) => (
              <button
                key={tab}
                ref={(el) => {
                  tabRefs.current[tab] = el;
                }}
                role="tab"
                aria-selected={filter === tab}
                onClick={() => onFilterChange(tab)}
                className={`h-10 px-3 text-sm transition-colors duration-150 ${
                  filter === tab ? 'text-fg-1' : 'text-fg-3 hover:text-fg-2'
                }`}
              >
                {tab[0].toUpperCase() + tab.slice(1)}
                {filter === tab && typeof count === 'number' && (
                  <span className="ml-3 text-sm text-fg-3 tabular-nums">{count}</span>
                )}
              </button>
            ))}
            <span
              aria-hidden
              className="pointer-events-none absolute bottom-0 h-0.5 rounded-full bg-iris shadow-[0_0_12px_rgba(124,124,248,0.5)] transition-[transform,width] duration-200 ease-out"
              style={{ transform: `translateX(${underline.left}px)`, width: underline.width }}
            />
          </div>

          <div className="flex items-center gap-3">
            {search && (
              <label className="flex h-8 items-center gap-2">
                <Search className="h-3.5 w-3.5 shrink-0 text-fg-3" strokeWidth={1.5} aria-hidden />
                <input
                  ref={searchRef}
                  value={search.value}
                  onChange={(e) => search.onChange(e.target.value)}
                  placeholder="Filter notebooks..."
                  className="w-40 bg-transparent text-sm text-fg-1 outline-none transition-[width] duration-150 focus:w-52 placeholder:text-fg-3"
                  aria-label={search.placeholder}
                />
              </label>
            )}

            <span aria-hidden className="h-5 w-px bg-white/[0.06]" />
{/*
            <DropdownMenu>
              <DropdownMenuTrigger
                render={
                  <button
                    className="inline-flex h-8 items-center gap-1.5 rounded-lg px-2 text-sm text-fg-2 transition-colors duration-150 hover:text-fg-1"
                    aria-label="Sort notebooks"
                  >
                    {NOTEBOOK_SORTS.find((sortOption) => sortOption.id === sort)?.label}
                    <ChevronDown className="h-3.5 w-3.5" strokeWidth={1.5} />
                  </button>
                }
              />
              <DropdownMenuContent
                align="end"
                className="w-44 rounded-lg border border-white/[0.08] bg-[#0F0F12] p-1"
              >
                {NOTEBOOK_SORTS.map((sortOption) => (
                  <DropdownMenuItem
                    key={sortOption.id}
                    onClick={() => onSortChange(sortOption.id)}
                    className="flex h-8 w-full items-center justify-between rounded-md px-3 text-left text-[13px] hover:bg-white/[0.04]"
                  >
                    <span className={sort === sortOption.id ? 'text-fg-1' : undefined}>
                      {sortOption.label}
                    </span>
                    {sort === sortOption.id && <span className="text-iris">✓</span>}
                  </DropdownMenuItem>
                ))}
              </DropdownMenuContent>
            </DropdownMenu>*/}

            {view && onViewChange && (
              <div role="group" aria-label="View mode" className="flex items-center gap-1">
                <button
                  type="button"
                  onClick={() => onViewChange('list')}
                  aria-label="List view"
                  aria-pressed={view === 'list'}
                  className={`flex h-7 w-7 items-center justify-center rounded-lg transition-colors duration-150 ${
                    view === 'list' ? 'bg-white/[0.06] text-fg-1' : 'text-fg-3 hover:text-fg-2'
                  }`}
                >
                  <List className="h-4 w-4" strokeWidth={1.5} />
                </button>
                <button
                  type="button"
                  onClick={() => onViewChange('grid')}
                  aria-label="Grid view"
                  aria-pressed={view === 'grid'}
                  className={`flex h-7 w-7 items-center justify-center rounded-lg transition-colors duration-150 ${
                    view === 'grid' ? 'bg-white/[0.06] text-fg-1' : 'text-fg-3 hover:text-fg-2'
                  }`}
                >
                  <LayoutGrid className="h-4 w-4" strokeWidth={1.5} />
                </button>
              </div>
            )}
          </div>
        </div>
        <div className="hairline" aria-hidden />
      </div>
    </div>
  );
}
