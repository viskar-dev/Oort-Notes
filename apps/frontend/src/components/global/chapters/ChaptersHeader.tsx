import { MoreVertical } from 'lucide-react';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { APP_CONTAINER } from '@/components/layout/workspace-layout';
import type { Chapter, Notebook } from '@/lib/ipc';

/** Page header: the notebook name, its counters and the notebook settings
 *  menu (rename/delete). */
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
    <div className={APP_CONTAINER}>
      <div className="flex items-start justify-between pt-12">
        <div>
          <h1 className="text-[32px] font-semibold leading-tight tracking-tight text-[#f4f4f6]">
            {notebook.name}
          </h1>
          <p className="mt-1 text-sm text-[#8b8a96]">
            {chapters === null
              ? 'Loading…'
              : `${chapters.length} ${chapters.length === 1 ? 'chapter' : 'chapters'} · ${totalTopics} ${totalTopics === 1 ? 'topic' : 'topics'}`}
          </p>
        </div>
        <DropdownMenu>
          <DropdownMenuTrigger
            render={
              <button
                title="Notebook options"
                className="flex size-8 items-center justify-center rounded-lg text-[#a09fab] transition-colors hover:bg-[#17161c] hover:text-[#f4f4f6]"
              >
                <MoreVertical className="h-4 w-4" />
              </button>
            }
          />
          <DropdownMenuContent align="end" className="w-[200px]">
            <DropdownMenuItem onClick={onRename}>Rename notebook</DropdownMenuItem>
            <DropdownMenuItem variant="destructive" onClick={onDelete}>
              Delete notebook
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
    </div>
  );
}
