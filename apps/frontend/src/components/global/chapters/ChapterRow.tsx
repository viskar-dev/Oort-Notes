import { useNavigate } from 'react-router-dom';
import { MoreVertical } from 'lucide-react';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { accentOpacity } from '@/components/global/notebooks/notebook-utils';
import { CanvasTypeIcon } from './CanvasTypeIcon';
import type { Chapter } from '@/lib/ipc';

/** One chapter row (h-11): number slot, name, and one right slot that shows
 *  the topic count and swaps to the ⋯ menu on hover/focus. Selecting the row
 *  updates the sidebar; the canvas stays reachable through the menu (same
 *  handler the old eye button had). */
export function ChapterRow({
  chapter,
  index,
  active,
  onSelect,
  onRename,
  onDelete,
}: {
  chapter: Chapter;
  index: number;
  active: boolean;
  onSelect: (chapterId: string) => void;
  onRename: (chapter: Chapter) => void;
  onDelete: (chapter: Chapter) => void;
}) {
  const navigate = useNavigate();
  const openCanvas = () => navigate(`/chapters/${chapter.id}`);
  const openCanvasOnEnter = (e: React.KeyboardEvent) => {
    if (e.key !== 'Enter') return;
    e.stopPropagation();
    openCanvas();
  };

  return (
    <div
      role="button"
      tabIndex={0}
      aria-current={active ? 'true' : undefined}
      title={chapter.name}
      onClick={() => onSelect(chapter.id)}
      className={`group flex h-11 w-full cursor-pointer items-center gap-3 rounded-lg px-2.5 -mx-2.5 text-left transition-colors duration-150 ${
        active ? 'bg-white/[0.05]' : 'hover:bg-white/[0.03]'
      }`}
    >
      {/* chapter accent bar — same design language as the notebook rows,
          which carry one iris bar per row */}
      <span
        aria-hidden
        className="h-5 w-[3px] shrink-0 rounded-full bg-iris"
        style={{ opacity: active ? 1 : accentOpacity(chapter.id) * 0.7 }}
      />

      {/* number: reserved slot, revealed on hover/active so names never shift */}
      <span
        className={`w-6 shrink-0 text-xs text-fg-3 tabular-nums transition-opacity duration-100 ${
          active ? 'opacity-100' : 'opacity-0 group-hover:opacity-100'
        }`}
      >
        {index + 1}
      </span>

      <span
        className={`min-w-0 flex-1 truncate text-sm transition-colors duration-150 ${
          active ? 'text-fg-1' : 'text-fg-2 group-hover:text-fg-1'
        }`}
      >
        {chapter.name}
      </span>

      {/* canvas type + count ⋄ menu: one reserved slot; the tiny type icon
          sits left of the count and hover swaps both for the menu */}
      <span className="relative grid h-7 shrink-0 place-items-center gap-1.5 grid-flow-col pr-1.5">
        <CanvasTypeIcon type={chapter.canvas_type} className="group-hover:opacity-0 transition-opacity duration-100" />
        <span
          className={`text-xs text-fg-3 tabular-nums transition-opacity duration-100 ${
            active ? 'opacity-100 group-hover:opacity-0' : 'group-hover:opacity-0'
          }`}
        >
          {chapter.topics_count}
        </span>
        <span
          className="absolute inset-0 grid place-items-center opacity-0 transition-opacity duration-100 group-hover:opacity-100 group-focus-within:opacity-100"
          onClick={(e) => e.stopPropagation()}
        >
          <DropdownMenu>
            <DropdownMenuTrigger
              render={
                <button
                  aria-label={`Options for ${chapter.name}`}
                  title="Chapter options"
                  className="flex h-7 w-7 items-center justify-center rounded-lg text-fg-3 transition-colors duration-150 hover:bg-white/[0.04] hover:text-fg-1"
                >
                  <MoreVertical className="h-3.5 w-3.5" strokeWidth={1.5} />
                </button>
              }
            />
            <DropdownMenuContent
              align="end"
              className="w-40 rounded-lg border border-white/[0.08] bg-[#0F0F12] p-1"
            >
              <DropdownMenuItem
                onClick={openCanvas}
                onKeyDown={openCanvasOnEnter}
                className="h-8 rounded-md hover:bg-white/[0.04] text-[13px]"
              >
                Open canvas
              </DropdownMenuItem>
              <DropdownMenuItem
                onClick={() => onRename(chapter)}
                className="h-8 rounded-md hover:bg-white/[0.04] text-[13px]"
              >
                Rename
              </DropdownMenuItem>
              <DropdownMenuItem
                variant="destructive"
                onClick={() => onDelete(chapter)}
                className="h-8 rounded-md text-[13px]"
              >
                Delete
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </span>
      </span>
    </div>
  );
}
