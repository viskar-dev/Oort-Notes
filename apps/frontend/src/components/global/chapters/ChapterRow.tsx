import { useNavigate } from 'react-router-dom';
import { Eye, Infinity as InfinityIcon, FileText, MoreVertical } from 'lucide-react';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import type { Chapter } from '@/lib/ipc';

/** One chapter in the sidebar list: its number, name, topic count and the
 *  hover actions (open on the canvas, rename, delete). */
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
      onClick={() => onSelect(chapter.id)}
      className={`group relative flex h-10 w-full cursor-pointer items-center gap-3 rounded-lg px-3 text-left transition-colors ${
        active ? 'bg-[#1c1b22]' : 'hover:bg-[#17161c]'
      }`}
    >
      {active && (
        <span className="absolute inset-y-1.5 left-0 w-[3px] rounded-full bg-[#7c6ee6]" />
      )}
      <span className="w-6 text-[11px] text-[#8b8a96]">
        {String(index + 1).padStart(2, '0')}
      </span>
      <span
        className={`flex-1 truncate text-[13px] ${active ? 'font-medium text-[#f4f4f6]' : 'text-[#c9c9d1]'}`}
      >
        {chapter.name}
      </span>
      <span className="flex items-center gap-1 text-[11px] text-[#8b8a96]">
        {chapter.canvas_type === 'infinite' ? (
          <InfinityIcon className="h-3.5 w-3.5" />
        ) : (
          <FileText className="h-3.5 w-3.5" />
        )}
        {chapter.topics_count}
      </span>
      <span
        role="button"
        tabIndex={0}
        title="View chapter"
        onClick={(e) => {
          e.stopPropagation();
          openCanvas();
        }}
        onKeyDown={openCanvasOnEnter}
        className="hidden h-6 w-6 items-center justify-center rounded-md text-[#6c6c78] hover:bg-[#24232c] hover:text-[#7c6ee6] group-hover:flex"
      >
        <Eye className="h-3.5 w-3.5" />
      </span>
      <span
        title="Chapter options"
        onClick={(e) => e.stopPropagation()}
        className="hidden group-hover:flex"
      >
        <DropdownMenu>
          <DropdownMenuTrigger
            render={
              <button
                title="Chapter options"
                className="flex h-6 w-6 items-center justify-center rounded-md text-[#6c6c78] hover:bg-[#24232c] hover:text-[#f4f4f6] data-popup-open:flex"
              >
                <MoreVertical className="h-3.5 w-3.5" />
              </button>
            }
          />
          <DropdownMenuContent align="end" className="w-32">
            <DropdownMenuItem onClick={() => onRename(chapter)}>Rename</DropdownMenuItem>
            <DropdownMenuItem variant="destructive" onClick={() => onDelete(chapter)}>
              Delete
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </span>
    </div>
  );
}
