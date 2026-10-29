import { Link } from 'react-router-dom';
import { MoreVertical, Star } from 'lucide-react';
import { DropdownMenu, DropdownMenuTrigger } from '@/components/ui/dropdown-menu';
import { NotebookMenu } from '@/components/global/notebooks/NotebookRow';
import { accentOpacity, countLine, timeAgo } from '@/components/global/notebooks/notebook-utils';
import type { Notebook, NotebookFilter } from '@/lib/ipc';

/** One notebook as a flat grid card: hairline border, color bar, name +
 *  meta. The behavior (link to open, favorite, option menu) is identical to
 *  the list row; only the skin differs. */
export function NotebookCard({
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
  const dimmed = filter === 'archived' && archived;

  // cursor spotlight (visual only) — same trick as the list row
  const trackPointer = (e: React.MouseEvent<HTMLDivElement>) => {
    const rect = e.currentTarget.getBoundingClientRect();
    e.currentTarget.style.setProperty('--mx', `${e.clientX - rect.left}px`);
    e.currentTarget.style.setProperty('--my', `${e.clientY - rect.top}px`);
  };

  return (
    <div
      onMouseMove={trackPointer}
      className="group relative h-[104px] rounded-lg border border-white/[0.06] bg-transparent p-4 pl-5 transition-[border-color,background-color] duration-150 hover:border-white/[0.12] hover:bg-white/[0.03]"
      style={{ opacity: dimmed ? 0.55 : 1 }}
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
        className="absolute left-0 top-3.5 bottom-3.5 w-[3px] rounded-full bg-iris"
        style={{ opacity: accentOpacity(nb.id) * 0.7 }}
      />

      <Link
        to={`/notebooks/${nb.id}`}
        title={`${countLine(nb.chapters_count, nb.topics_count)} · Edited ${timeAgo(nb.updated_at)}`}
        aria-label={`Open ${nb.name}`}
        className="flex h-full min-w-0 flex-col"
      >
        <h3 className="truncate pr-14 text-[15px] font-medium text-fg-1">{nb.name}</h3>
        <p className="mt-0.5 truncate text-xs text-fg-3 tabular-nums">
          {countLine(nb.chapters_count, nb.topics_count)} · {timeAgo(nb.updated_at)}
        </p>
      </Link>

      {/* favorite + option menu: hover-revealed, keyboard reachable */}
      <button
        onClick={onToggleFavorite}
        aria-label={nb.is_favorite ? `Remove ${nb.name} from favorites` : `Add ${nb.name} to favorites`}
        className={`absolute right-8 top-2.5 flex h-7 w-7 items-center justify-center rounded-lg transition-opacity duration-100 hover:bg-white/[0.04] focus-visible:opacity-100 group-hover:opacity-100 ${
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
              className="absolute right-2.5 top-2.5 z-10 flex h-7 w-7 items-center justify-center rounded-lg text-fg-3 opacity-0 transition-opacity duration-100 hover:bg-white/[0.04] hover:text-fg-1 focus-visible:opacity-100 group-hover:opacity-100 data-popup-open:opacity-100"
            >
              <MoreVertical className="h-4 w-4" strokeWidth={1.5} />
            </button>
          }
        />
        <NotebookMenu nb={nb} archived={archived} onOpen={onOpen} onRename={onRename} onToggleFavorite={onToggleFavorite} onToggleArchive={onToggleArchive} onDelete={onDelete} />
      </DropdownMenu>
    </div>
  );
}
