import { Link } from 'react-router-dom';
import { MoreVertical, Star } from 'lucide-react';
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger } from '@/components/ui/dropdown-menu';
import { accentOpacity, countLine, timeAgo } from '@/components/global/notebooks/notebook-utils';
import type { Notebook, NotebookFilter } from '@/lib/ipc';

/** One notebook as a list row: color bar, name + meta, relative time and the
 *  hover-revealed favorite/menu actions. Purely the list skin — the handlers
 *  are the same callbacks the grid card receives. */
export function NotebookRow({
  notebook: nb,
  filter,
  onOpen,
  onRename,
  onToggleFavorite,
  onToggleArchive,
  onDelete,
}: {
  notebook: Notebook;
  filter: NotebookFilter;
  onOpen: () => void;
  onRename: () => void;
  onToggleFavorite: () => void;
  onToggleArchive: () => void;
  onDelete: () => void;
}) {
  const archived = nb.archived_at !== null;
  const meta = countLine(nb.chapters_count, nb.topics_count);

  // cursor spotlight (visual only): pointer position feeds a CSS var that a
  // radial-gradient reads — no app state involved
  const trackPointer = (e: React.MouseEvent<HTMLDivElement>) => {
    const rect = e.currentTarget.getBoundingClientRect();
    e.currentTarget.style.setProperty('--mx', `${e.clientX - rect.left}px`);
    e.currentTarget.style.setProperty('--my', `${e.clientY - rect.top}px`);
  };

  return (
    <div>
      <div
        className="group relative h-16 px-4 flex items-center gap-4 rounded-lg transition-colors duration-150 hover:bg-white/[0.03]"
        onMouseMove={trackPointer}
      >
        {/* cursor spotlight */}
        <div
          aria-hidden
          className="pointer-events-none absolute inset-0 rounded-lg opacity-0 transition-opacity duration-150 group-hover:opacity-100"
          style={{
            background:
              'radial-gradient(140px circle at var(--mx, 50%) var(--my, 50%), rgba(124,124,248,0.07), transparent 70%)',
          }}
        />

        {/* color bar */}
        <span
          aria-hidden
          className="w-[3px] h-7 shrink-0 rounded-full bg-iris"
          style={{ opacity: filter === 'archived' && archived ? 0.35 : accentOpacity(nb.id) * 0.7 }}
        />

        <Link
          to={`/notebooks/${nb.id}`}
          title={`${meta} · Edited ${timeAgo(nb.updated_at)}`}
          aria-label={`Open ${nb.name}`}
          className="min-w-0 flex-1"
        >
          <h3 className="truncate text-[15px] font-medium text-fg-1" style={{ opacity: filter === 'archived' && archived ? 0.55 : 1 }}>
            {nb.name}
          </h3>
          <p className="mt-0.5 truncate text-[13px] text-fg-3 tabular-nums">{meta}</p>
        </Link>

        <span className="shrink-0 text-xs text-fg-3 tabular-nums">
          edited {timeAgo(nb.updated_at)}
        </span>

        {/* favorite + option menu: hover-revealed, always keyboard reachable */}
        <button
          onClick={onToggleFavorite}
          aria-label={nb.is_favorite ? `Remove ${nb.name} from favorites` : `Add ${nb.name} to favorites`}
          className={`flex h-7 w-7 shrink-0 items-center justify-center rounded-lg transition-opacity duration-100 hover:bg-white/[0.04] focus-visible:opacity-100 group-hover:opacity-100 ${
            nb.is_favorite ? 'text-iris' : 'text-fg-3 opacity-0 hover:text-fg-1'
          }`}
        >
          <Star className="h-4 w-4" strokeWidth={1.5} fill={nb.is_favorite ? 'currentColor' : 'none'} />
        </button>

        <DropdownMenu>
          <DropdownMenuTrigger
            render={
              <button
                onClick={(e) => e.stopPropagation()}
                aria-label={`Options for ${nb.name}`}
                className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg text-fg-3 opacity-0 transition-opacity duration-100 hover:bg-white/[0.04] hover:text-fg-1 focus-visible:opacity-100 group-hover:opacity-100 data-popup-open:opacity-100"
              >
                <MoreVertical className="h-4 w-4" strokeWidth={1.5} />
              </button>
            }
          />
          <NotebookMenu nb={nb} archived={archived} onOpen={onOpen} onRename={onRename} onToggleFavorite={onToggleFavorite} onToggleArchive={onToggleArchive} onDelete={onDelete} />
        </DropdownMenu>
      </div>
      {/* hairline divider fades at both ends; sibling, not a border */}
      <div className="hairline" aria-hidden />
    </div>
  );
}

/** The option menu body, shared verbatim between row and card. */
export function NotebookMenu({
  nb,
  archived,
  onOpen,
  onRename,
  onToggleFavorite,
  onToggleArchive,
  onDelete,
}: {
  nb: Notebook;
  archived: boolean;
  onOpen: () => void;
  onRename: () => void;
  onToggleFavorite: () => void;
  onToggleArchive: () => void;
  onDelete: () => void;
}) {
  return (
    <DropdownMenuContent align="end" className="w-[200px] rounded-lg border border-white/[0.08] bg-[#0F0F12] p-1">
      <DropdownMenuItem onClick={onOpen} className="h-8 rounded-md hover:bg-white/[0.04]">Open</DropdownMenuItem>
      <DropdownMenuItem onClick={onRename} className="h-8 rounded-md hover:bg-white/[0.04]">Rename</DropdownMenuItem>
      <DropdownMenuItem onClick={onToggleFavorite} className="h-8 rounded-md hover:bg-white/[0.04]">
        {nb.is_favorite ? 'Remove from favorites' : 'Add to favorites'}
      </DropdownMenuItem>
      <DropdownMenuItem onClick={onToggleArchive} className="h-8 rounded-md hover:bg-white/[0.04]">
        {archived ? 'Unarchive' : 'Archive'}
      </DropdownMenuItem>
      <DropdownMenuSeparator className="bg-white/[0.06]" />
      <DropdownMenuItem variant="destructive" onClick={onDelete} className="h-8 rounded-md">
        Delete
      </DropdownMenuItem>
    </DropdownMenuContent>
  );
}
