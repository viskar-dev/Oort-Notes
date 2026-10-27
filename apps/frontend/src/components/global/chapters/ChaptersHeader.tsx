import { MoreVertical } from 'lucide-react';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { HOME_CONTAINER } from '@/components/layout/workspace-layout';
import type { Chapter, Notebook } from '@/lib/ipc';

/** Page header: the notebook name, its counters and the notebook ⋮ menu
 *  (rename/delete). The full-wrapper hairline under it comes from the grid
 *  section in ChaptersPage, forming the T with the column divider. */
export function ChaptersHeader({
  notebook,
  chapters,
  totalTopics,
  onRename,
  onDelete,
}: {
  notebook: Notebook;
  chapters: Chapter[] | null;
  totalTopics: number;
  onRename: () => void;
  onDelete: () => void;
}) {
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
  );
}
