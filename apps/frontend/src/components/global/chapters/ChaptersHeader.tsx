import { useEffect, useRef } from 'react';
import { MoreVertical, Search } from 'lucide-react';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import {
  HOME_CONTAINER,
  SEARCH_FOCUS_EVENT,
  type LayoutSearch,
} from '@/components/layout/workspace-layout';
import type { Chapter, Notebook } from '@/lib/ipc';

/** Page header: the notebook name, its counters and the notebook ⋮ menu
 *  (rename/delete). The full-wrapper hairline under it comes from the grid
 *  section in ChaptersPage, forming the T with the column divider. The
 *  search field re-houses the layout's navbar search (same skin as the
 *  notebooks home's filter row) so it sits at the right end of this row,
 *  vertically aligned with the notebook name. */
export function ChaptersHeader({
  notebook,
  chapters,
  totalTopics,
  search,
  onRename,
  onDelete,
}: {
  notebook: Notebook;
  chapters: Chapter[] | null;
  totalTopics: number;
  /** Same search state the layout's navbar field used to receive; omitting
   *  it keeps the header search-less (and ⌘K dispatches with no target). */
  search?: LayoutSearch;
  onRename: () => void;
  onDelete: () => void;
}) {
  const searchRef = useRef<HTMLInputElement>(null);

  // ⌘K / the top-bar search icon land in this input: with no navbar field
  // WorkspaceLayout re-targets the page by dispatching this event (same
  // contract the notebooks home's filter row listens on)
  useEffect(() => {
    if (!search) return;
    const onFocus = () => searchRef.current?.focus();
    window.addEventListener(SEARCH_FOCUS_EVENT, onFocus);
    return () => window.removeEventListener(SEARCH_FOCUS_EVENT, onFocus);
  }, [search]);

  return (
    <div className={HOME_CONTAINER}>
      <div className="flex items-start justify-between pt-10 pb-8">
        <div>
          <h1 className="text-[28px] font-semibold leading-[1.1] tracking-[-0.02em] text-fg-1">
            {notebook.name}
          </h1>
          <p className="mt-1.5 text-[13px] text-fg-3 tabular-nums">
            {chapters === null
              ? 'Loading…'
              : `${chapters.length} ${chapters.length === 1 ? 'chapter' : 'chapters'} · ${totalTopics} ${totalTopics === 1 ? 'topic' : 'topics'}`}
          </p>
        </div>
        <div className="flex items-center gap-3 pt-1">
          {search && (
            <label className="flex h-8 items-center gap-2">
              <Search className="h-3.5 w-3.5 shrink-0 text-fg-3" strokeWidth={1.5} aria-hidden />
              <input
                ref={searchRef}
                value={search.value}
                onChange={(e) => search.onChange(e.target.value)}
                placeholder="Search topics..."
                className="w-40 bg-transparent text-sm text-fg-1 outline-none transition-[width] duration-150 focus:w-52 placeholder:text-fg-3"
                aria-label={search.placeholder}
              />
            </label>
          )}
          <span aria-hidden className="h-5 w-px bg-white/[0.06]" />
          <DropdownMenu>
          <DropdownMenuTrigger
            render={
              <button
                aria-label="Notebook options"
                title="Notebook options"
                className="flex h-8 w-8 items-center justify-center rounded-lg text-fg-3 transition-colors duration-150 hover:bg-white/[0.04] hover:text-fg-1"
              >
                <MoreVertical className="h-4 w-4" strokeWidth={1.5} />
              </button>
            }
          />
          <DropdownMenuContent
            align="end"
            className="w-[200px] rounded-lg border border-white/[0.08] bg-[#0F0F12] p-1"
          >
            <DropdownMenuItem onClick={onRename} className="h-8 rounded-md hover:bg-white/[0.04] text-[13px]">
              Rename notebook
            </DropdownMenuItem>
            <DropdownMenuItem variant="destructive" onClick={onDelete} className="h-8 rounded-md text-[13px]">
              Delete notebook
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
        </div>
      </div>
    </div>
  );
}
