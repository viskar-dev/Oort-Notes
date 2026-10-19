import { Link } from 'react-router-dom';
import { MoreHorizontal } from 'lucide-react';
import { emblem } from '@/constants/notebooks/emblems';
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger } from '@/components/ui/dropdown-menu';
import type { Notebook, NotebookFilter } from '@/lib/ipc';

function emblemIcon(icon: string | null) {
  const Icon = emblem(icon);
  return <Icon className="mt-3 h-5 w-5 shrink-0" strokeWidth={1.5} style={{ color: 'var(--text-3)' }} />;
}

function timeAgo(ts: number | null): string {
  if (!ts) return 'never';
  const s = Math.floor((Date.now() - ts) / 1000);
  const m = Math.floor(s / 60);
  if (m < 1) return 'just now';
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ago`;
  const d = Math.floor(h / 24);
  if (d < 7) return `${d}d ago`;
  if (d < 30) return `${Math.floor(d / 7)}w ago`;
  return `${Math.floor(d / 30)}mo ago`;
}

/** deterministic spine accent opacity from the notebook id */
function spineOpacity(id: string): number {
  let hash = 0;
  for (let i = 0; i < id.length; i++) hash = (hash * 31 + id.charCodeAt(i)) | 0;
  return [1, 0.7, 0.5, 0.35][Math.abs(hash) % 4];
}

/** One notebook on the home grid: its cover (a real link), option menu and
 *  favorite ribbon. */
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
  // "NOTEBOOK" is a legacy default: treat it as empty
  const tag =
    nb.label && nb.label.toUpperCase() !== 'NOTEBOOK' && nb.label.toLowerCase() !== nb.name.toLowerCase()
      ? nb.label
      : null;
  const archived = nb.archived_at !== null;
  const countLine =
    nb.chapters_count === 0 && nb.topics_count === 0
      ? 'No chapters yet'
      : `${nb.chapters_count} ${nb.chapters_count === 1 ? 'chapter' : 'chapters'} · ${nb.topics_count} ${nb.topics_count === 1 ? 'topic' : 'topics'}`;

  return (
    <div
      className="nb-card group relative select-none"
      style={{ width: '100%', maxWidth: 200, marginRight: 8, marginBottom: 8 }}
    >
      <Link
        to={`/notebooks/${nb.id}`}
        title={`${countLine} · Edited ${timeAgo(nb.updated_at)}`}
        className="nb-cover relative flex w-full cursor-pointer flex-col"
        style={{
          aspectRatio: '3 / 4',
          opacity: filter === 'archived' && archived ? 0.55 : 1,
          borderRadius: '4px 18px 18px 4px',
          border: '1px solid var(--border)',
        }}
        // data-nb-open preserves the cover as the card's open target for tests
        aria-label={`Open ${nb.name}`}
      >
        {/* spine */}
        <div
          className="absolute bottom-0 left-0 top-0 w-[28px] overflow-hidden"
          style={{
            background: 'var(--spine)',
            backgroundImage:
              'linear-gradient(90deg, rgba(0,0,0,0.35) 0%, rgba(255,255,255,0.05) 60%, rgba(0,0,0,0.18) 100%)',
            borderRight: '1px solid var(--border)',
            borderRadius: '4px 0 0 4px',
          }}
        >
          <div
            className="absolute bottom-0 left-0 top-0 w-[3px]"
            style={{ background: 'var(--primary)', opacity: spineOpacity(nb.id) }}
          />
        </div>

        {/* hinge shadow */}
        <div
          className="pointer-events-none absolute bottom-0 top-0 w-[10px]"
          style={{
            left: 28,
            background: 'linear-gradient(90deg, rgba(0,0,0,0.28), rgba(0,0,0,0))',
          }}
        />

        {/* face */}
        <div className="flex min-h-0 flex-1 flex-col items-center pb-5 pl-[28px] pr-4 pt-5">
          <div className="flex min-h-0 flex-1 flex-col items-center justify-center px-2 text-center">
            <h3
              className="line-clamp-3 text-[22px] font-medium leading-[1.25] text-[#f4f4f6]"
              style={{ fontFamily: 'Georgia, "Times New Roman", serif' }}
            >
              {nb.name}
            </h3>
            <div
              className="mt-1.5 line-clamp-2 text-[11px] text-[#a09fab]"
              style={{ fontFamily: 'Georgia, "Times New Roman", serif' }}
            >
              {tag ?? countLine}
            </div>
          </div>

          {emblemIcon(nb.icon)}
        </div>

        {/* favorite ribbon */}
        {nb.is_favorite && (
          <span
            className="absolute top-0 h-[28px] w-[16px]"
            style={{
              right: 22,
              background: 'var(--primary)',
              clipPath: 'polygon(0 0, 100% 0, 100% 100%, 50% 82%, 0 100%)',
            }}
          />
        )}
      </Link>

      {/* three-dot menu (hover/focus reveal) */}
      <DropdownMenu>
        <DropdownMenuTrigger
          render={
            <button
              onClick={(e) => e.stopPropagation()}
              title="Notebook options"
              className="absolute right-2 top-2 z-10 flex h-7 w-7 items-center justify-center rounded-full border opacity-0 transition-opacity focus-visible:opacity-100 group-hover:opacity-100 hover:opacity-100 data-popup-open:opacity-100"
              style={{ background: '#14141a', borderColor: 'var(--border)', color: 'var(--text-2)' }}
            >
              <MoreHorizontal className="h-4 w-4" />
            </button>
          }
        />
        <DropdownMenuContent align="end" className="w-[200px]">
          <DropdownMenuItem onClick={onOpen}>Open</DropdownMenuItem>
          <DropdownMenuItem onClick={onRename}>Rename</DropdownMenuItem>
          <DropdownMenuItem onClick={onToggleFavorite}>
            {nb.is_favorite ? 'Remove from favorites' : 'Add to favorites'}
          </DropdownMenuItem>
          <DropdownMenuItem onClick={onToggleArchive}>
            {archived ? 'Unarchive' : 'Archive'}
          </DropdownMenuItem>
          <DropdownMenuSeparator />
          <DropdownMenuItem variant="destructive" onClick={onDelete}>
            Delete
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
    </div>
  );
}
