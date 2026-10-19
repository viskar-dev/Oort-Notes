import { useCallback, useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Atom,
  BookOpen,
  Brain,
  ChevronDown,
  Code2,
  Globe,
  Languages,
  type LucideIcon,
  MoreHorizontal,
  PenLine,
  Plus,
  Sigma,
} from 'lucide-react';
import { api, type Notebook, type NotebookFilter, type NotebookSort } from '../lib/ipc';
import { APP_CONTAINER, WorkspaceLayout } from '@/components/layout/workspace-layout';
import { useDebouncedValue } from '@/hooks/use-debounced-value';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';

/* Emblem map: notebook.icon -> monochrome Lucide icon (fallback BookOpen). */
const EMBLEMS: Record<string, LucideIcon> = {
  atom: Atom,
  code: Code2,
  brain: Brain,
  globe: Globe,
  languages: Languages,
  sigma: Sigma,
  book: BookOpen,
  pen: PenLine,
};

function emblem(icon: string | null): LucideIcon {
  return (icon && EMBLEMS[icon.toLowerCase()]) || BookOpen;
}

/** The notebook's emblem icon element (rendered at module scope helper so
 *  no component is minted during render). */
function emblemIcon(icon: string | null) {
  const Icon = emblem(icon);
  return <Icon className="mt-3 h-5 w-5 shrink-0" strokeWidth={1.5} style={{ color: 'var(--text-3)' }} />;
}

const TABS: NotebookFilter[] = ['all', 'recent', 'favorites', 'archived'];
const SORTS: { id: NotebookSort; label: string }[] = [
  { id: 'edited', label: 'Last edited' },
  { id: 'opened', label: 'Recently opened' },
  { id: 'name', label: 'Name' },
];

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

export function NotebooksPage() {
  const navigate = useNavigate();

  const [notebooks, setNotebooks] = useState<Notebook[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [filter, setFilter] = useState<NotebookFilter>('all');
  const [sort, setSort] = useState<NotebookSort>('edited');
  const [search, setSearch] = useState('');
  const [sortOpen, setSortOpen] = useState(false);

  // the backend does the filtering/sorting/searching (SQL); the page only
  // sends the current view state and renders what comes back
  const debouncedSearch = useDebouncedValue(search, 250);
  const [refreshKey, setRefreshKey] = useState(0);
  const reload = useCallback(() => setRefreshKey((k) => k + 1), []);

  const [creating, setCreating] = useState(false);
  const [renaming, setRenaming] = useState<Notebook | null>(null);
  const [deleting, setDeleting] = useState<Notebook | null>(null);
  const [name, setName] = useState('');
  const [label, setLabel] = useState('');
  const [description, setDescription] = useState('');
  const [saving, setSaving] = useState(false);

  // single fetch effect for the list; `cancelled` drops out-of-order
  // responses when the view state changes while a request is in flight
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const list = await api.listNotebooks(filter, sort, debouncedSearch.trim() || undefined);
        if (cancelled) return;
        setNotebooks(list);
        setError(null);
      } catch (e) {
        if (!cancelled) setError(e instanceof Error ? e.message : String(e));
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [filter, sort, debouncedSearch, refreshKey]);

  // a different tab shows a different list — start it from the top
  useEffect(() => {
    window.scrollTo({ top: 0 });
  }, [filter]);

  function openCreate() {
    setName('');
    setLabel('');
    setDescription('');
    setSaving(false);
    setCreating(true);
  }

  async function handleDelete(nb: Notebook) {
    try {
      await api.deleteNotebook(nb.id);
      setDeleting(null);
      reload();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    }
  }

  async function submit() {
    if (!name.trim() || saving) return;
    setSaving(true);
    setError(null);
    try {
      await api.createNotebook(name.trim(), label.trim() || undefined, description.trim() || undefined);
      setCreating(false);
      reload();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
      setSaving(false);
    }
  }

  async function update(nb: Notebook, flags: { name?: string; isFavorite?: boolean; archived?: boolean }) {
    try {
      await api.updateNotebookFlags(nb.id, flags);
      reload();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    }
  }

  const loaded = notebooks !== null;
  const list = notebooks ?? [];
  const totalChapters = list.reduce((acc, n) => acc + n.chapters_count, 0);
  const hasQuery = search.trim() !== '';

  return (
    <WorkspaceLayout
      search={{ value: search, onChange: setSearch, placeholder: 'Search notebooks' }}
      crumbs={[{ label: 'Notebooks' }]}
    >
      {/* ============ page header ============ */}
      <div className={APP_CONTAINER}>
        <div className="flex items-center justify-between pt-12">
          <div>
            <h1 className="text-[32px] font-semibold leading-tight tracking-tight text-[#f4f4f6]">
              Notebooks
            </h1>
            <p className="mt-1 text-sm text-[#8b8a96]">
              {loaded
                ? `${list.length} ${list.length === 1 ? 'notebook' : 'notebooks'} · ${totalChapters} ${totalChapters === 1 ? 'chapter' : 'chapters'}`
                : 'Loading…'}
            </p>
          </div>
          <button
            onClick={openCreate}
            className="inline-flex h-10 items-center gap-2 rounded-[10px] bg-[#7c6ee6] px-4 text-sm font-medium text-white transition-colors hover:bg-[#8b7ff0] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#7c6ee6] focus-visible:ring-offset-2 focus-visible:ring-offset-[#060608]"
          >
            <Plus className="h-4 w-4" /> New notebook
          </button>
        </div>

        {error && (
          <div className="mt-4 rounded-lg border border-[#24232c] bg-[#111016] px-4 py-3 text-sm text-[#f87171]">
            {error}
          </div>
        )}
      </div>

      {/* ============ filter row: full-bleed sticky, container-aligned ============ */}
      <div className="sticky top-14 z-20 mt-8 bg-[#060608]">
        <div className={APP_CONTAINER}>
          <div className="flex h-12 items-center justify-between border-b border-[#24232c]">
            <div className="flex items-center gap-1">
              {TABS.map((t) => (
                <button
                  key={t}
                  onClick={() => setFilter(t)}
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

            <div className="relative">
              <button
                onClick={() => setSortOpen((o) => !o)}
                className="inline-flex h-8 items-center gap-1 rounded-lg px-2 text-[13px] text-[#a09fab] transition-colors hover:bg-[#17161c] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#7c6ee6] focus-visible:ring-offset-2 focus-visible:ring-offset-[#060608]"
              >
                {SORTS.find((sortOption) => sortOption.id === sort)?.label}
                <ChevronDown className="h-3.5 w-3.5" />
              </button>
              {sortOpen && (
                <>
                  <div className="fixed inset-0 z-40" onClick={() => setSortOpen(false)} />
                  <div className="absolute right-0 top-full z-50 mt-1 w-44 rounded-[10px] border border-[#24232c] bg-[#14141a] p-1 shadow-xl">
                    {SORTS.map((sortOption) => (
                      <button
                        key={sortOption.id}
                        onClick={() => {
                          setSort(sortOption.id);
                          setSortOpen(false);
                        }}
                        className="flex w-full items-center justify-between rounded-md px-3 py-2 text-left text-[13px] text-[#a09fab] transition-colors hover:bg-[#17161c]"
                        style={sort === sortOption.id ? { color: '#f4f4f6' } : undefined}
                      >
                        {sortOption.label}
                        {sort === sortOption.id && <span className="text-[#7c6ee6]">✓</span>}
                      </button>
                    ))}
                  </div>
                </>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* ============ grid ============ */}
      <div className={APP_CONTAINER}>
        {/* skeleton loading */}
        {!loaded && (
          <div className="mt-8 grid grid-cols-[repeat(auto-fill,minmax(264px,1fr))] gap-x-8 gap-y-10">
            {Array.from({ length: 8 }, (_, i) => (
              <div
                key={i}
                className="mr-2 mb-2 rounded-l-[4px] rounded-r-xl border border-[#24232c] bg-[#111016]"
                style={{ aspectRatio: '3/4' }}
              />
            ))}
          </div>
        )}

        {/* empty states */}
        {loaded && list.length === 0 && (
          <div className="py-10 text-center">
            {hasQuery || filter !== 'all' ? (
              <>
                <p className="text-sm text-[#a09fab]">No notebooks match</p>
                <button
                  onClick={() => {
                    setSearch('');
                    setFilter('all');
                  }}
                  className="mt-4 h-9 rounded-[10px] border border-[#24232c] px-4 text-[13px] text-[#a09fab] transition-colors hover:bg-[#17161c]"
                >
                  Clear filter
                </button>
              </>
            ) : (
              <div className="mx-auto max-w-[280px]">
                <div
                  onClick={openCreate}
                  className="nb-cover mb-8 flex cursor-pointer items-center justify-center"
                  style={{ borderStyle: 'dashed' }}
                >
                  <span className="text-[#a09fab]">
                    <Plus className="h-8 w-8" />
                  </span>
                </div>
                <p className="text-sm text-[#a09fab]">Create your first notebook</p>
                <button
                  onClick={openCreate}
                  className="mt-4 inline-flex h-10 items-center gap-2 rounded-[10px] bg-[#7c6ee6] px-4 text-sm font-medium text-white transition-colors hover:bg-[#8b7ff0]"
                >
                  <Plus className="h-4 w-4" /> New notebook
                </button>
              </div>
            )}
          </div>
        )}

        {/* grid */}
        {loaded && list.length > 0 && (
          <div className="mt-8 grid grid-cols-[repeat(auto-fill,minmax(264px,1fr))] gap-x-8 gap-y-10 pb-20">
            {list.map((nb) => (
              <NotebookCard
                key={nb.id}
                notebook={nb}
                filter={filter}
                onOpen={() => navigate(`/notebooks/${nb.id}`)}
                onRename={() => {
                  setName(nb.name);
                  setRenaming(nb);
                }}
                onToggleFavorite={() => update(nb, { isFavorite: !nb.is_favorite })}
                onToggleArchive={() => update(nb, { archived: nb.archived_at === null })}
                onDelete={() => setDeleting(nb)}
              />
            ))}

            {/* dashed "New notebook" tile */}
            <button
              onClick={openCreate}
              className="group flex flex-col items-center justify-center gap-4 rounded-xl border border-dashed border-[#24232c] transition-colors hover:border-[#3f3f46] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#7c6ee6] focus-visible:ring-offset-2 focus-visible:ring-offset-[#060608]"
              style={{ aspectRatio: '3/4', marginRight: 8, marginBottom: 8, minHeight: 260 }}
            >
              <span className="flex h-10 w-10 items-center justify-center rounded-lg border border-[#24232c] text-[#a09fab]">
                <Plus className="h-5 w-5" />
              </span>
              <span className="text-sm text-[#a09fab] transition-colors group-hover:text-[#f4f4f6]">
                New notebook
              </span>
            </button>
          </div>
        )}
      </div>

      {/* create */}
      <Dialog open={creating} onOpenChange={setCreating}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>New notebook</DialogTitle>
            <DialogDescription>
              Notebooks hold chapters of topics on their canvases.
            </DialogDescription>
          </DialogHeader>
          <Field
            id="nb-create-name"
            label="Name"
            value={name}
            onChange={setName}
            placeholder="e.g. Physics"
            autoFocus
          />
          <Field
            id="nb-create-label"
            label="Label (optional tag on the card)"
            value={label}
            onChange={setLabel}
            placeholder="e.g. PHYS"
          />
          <Field
            id="nb-create-description"
            label="Description"
            value={description}
            onChange={setDescription}
            placeholder="Optional"
          />
          <DialogFooter>
            <Button variant="ghost" onClick={() => setCreating(false)}>
              Cancel
            </Button>
            <Button disabled={!name.trim() || saving} onClick={submit}>
              {saving ? 'Creating…' : 'Create'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* rename */}
      <Dialog open={renaming !== null} onOpenChange={(open) => !open && setRenaming(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Rename notebook</DialogTitle>
          </DialogHeader>
          <Field
            id="nb-rename-name"
            label="Name"
            value={name}
            onChange={setName}
            placeholder="Notebook name"
            autoFocus
          />
          <DialogFooter>
            <Button variant="ghost" onClick={() => setRenaming(null)}>
              Cancel
            </Button>
            <Button
              disabled={!name.trim() || name.trim() === renaming?.name}
              onClick={async () => {
                if (renaming) await update(renaming, { name: name.trim() });
                setRenaming(null);
              }}
            >
              Rename
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* delete */}
      <AlertDialog open={deleting !== null} onOpenChange={(open) => !open && setDeleting(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete "{deleting?.name}"?</AlertDialogTitle>
            <AlertDialogDescription>
              This permanently removes the notebook and all of its chapters and
              topics. This cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={() => deleting && handleDelete(deleting)}>
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </WorkspaceLayout>
  );
}

/* ================= card ================= */

function NotebookCard({
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
      <div
        role="link"
        tabIndex={0}
        onClick={onOpen}
        onKeyDown={(e) => {
          if (e.key === 'Enter') onOpen();
        }}
        title={`${countLine} · Edited ${timeAgo(nb.updated_at)}`}
        className="nb-cover relative flex w-full cursor-pointer flex-col"
        style={{
          aspectRatio: '3 / 4',
          opacity: filter === 'archived' && archived ? 0.55 : 1,
          borderRadius: '4px 18px 18px 4px',
          border: '1px solid var(--border)',
        }}
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
      </div>

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

function Field({
  id,
  label,
  value,
  onChange,
  placeholder,
  autoFocus,
}: {
  id: string;
  label: string;
  value: string;
  onChange: (v: string) => void;
  placeholder: string;
  autoFocus?: boolean;
}) {
  return (
    <div className="flex flex-col gap-1.5">
      <label htmlFor={id} className="text-[13px] font-medium text-muted-foreground">
        {label}
      </label>
      <Input
        id={id}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        autoFocus={autoFocus}
      />
    </div>
  );
}
