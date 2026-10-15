import { useEffect, useRef, useState } from 'react';
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
  Search,
  Sigma,
} from 'lucide-react';
import { api, type Notebook, type NotebookFilter, type NotebookSort } from '../lib/ipc';
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

function isMac(): boolean {
  return typeof navigator !== 'undefined' && /Mac|iPhone|iPad/.test(navigator.platform ?? navigator.userAgent);
}

export function NotebooksPage() {
  const navigate = useNavigate();
  const [notebooks, setNotebooks] = useState<Notebook[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [creating, setCreating] = useState(false);
  const [renaming, setRenaming] = useState<Notebook | null>(null);
  const [deleting, setDeleting] = useState<Notebook | null>(null);
  const [filter, setFilter] = useState<NotebookFilter>('all');
  const [sort, setSort] = useState<NotebookSort>('edited');
  const [search, setSearch] = useState('');
  const [sortOpen, setSortOpen] = useState(false);
  const [menuFor, setMenuFor] = useState<string | null>(null);
  const [name, setName] = useState('');
  const [label, setLabel] = useState('');
  const [description, setDescription] = useState('');
  const [saving, setSaving] = useState(false);
  const searchRef = useRef<HTMLInputElement>(null);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);

  // the backend does the filtering/sorting/searching (SQL); the page only
  // sends the current view state and renders what comes back
  async function load(f: NotebookFilter, s: NotebookSort, q: string) {
    try {
      setError(null);
      setNotebooks(await api.listNotebooks(f, s, q.trim() || undefined));
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    }
  }

  useEffect(() => {
    load(filter, sort, search);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [filter, sort]);

  // Ctrl/Cmd+K focuses search
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault();
        searchRef.current?.focus();
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  function handleSearch(value: string) {
    setSearch(value);
    clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => load(filter, sort, value), 250);
  }

  async function handleDelete(nb: Notebook) {
    try {
      await api.deleteNotebook(nb.id);
      setDeleting(null);
      await load(filter, sort, search);
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
      setName('');
      setLabel('');
      setDescription('');
      await load(filter, sort, search);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
      setSaving(false);
    }
  }

  async function update(nb: Notebook, flags: { name?: string; isFavorite?: boolean; archived?: boolean }) {
    try {
      await api.updateNotebookFlags(nb.id, flags);
      setMenuFor(null);
      await load(filter, sort, search);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    }
  }

  const loaded = notebooks !== null;
  const list = notebooks ?? [];
  const totalChapters = list.reduce((acc, n) => acc + n.chapters_count, 0);
  const hasQuery = search.trim() !== '';

  return (
    <div className="nb-root flex min-h-screen flex-col">
      {/* ============ top bar ============ */}
      <header className="sticky top-0 z-30 w-full max-w-7xl m-auto flex h-14 items-center justify-between  bg-[#060608] py-10">
        <div className="flex items-center gap-2">
          {/* logo mark: solid dot + thin orbit ring */}
          <svg width="20" height="20" viewBox="0 0 22 22" aria-hidden>
            <circle cx="11" cy="11" r="5" fill="var(--text)" />
            <ellipse
              cx="11"
              cy="11"
              rx="9.5"
              ry="4.2"
              fill="none"
              stroke="var(--text-3)"
              strokeWidth="1"
              transform="rotate(-24 11 11)"
            />
          </svg>
          <span className="text-sm font-semibold text-[#f4f4f6]">Oort Notes</span>
        </div>

        <div className="flex items-center gap-3">
          <div className="relative h-9 w-64 rounded-[10px] border border-[#24232c] bg-[#17161c] focus-within:ring-2 focus-within:ring-[#7c6ee6] focus-within:ring-offset-2 focus-within:ring-offset-[#060608]">
            <Search
              className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-[#8b8a96]"
            />
            <input
              ref={searchRef}
              value={search}
              onChange={(e) => handleSearch(e.target.value)}
              placeholder="Search notebooks"
              className="h-full w-full rounded-[10px] bg-transparent pl-9 pr-16 text-[13px] text-[#f4f4f6] outline-none placeholder:text-[#8b8a96]"
            />
            <kbd className="pointer-events-none absolute right-2 top-1/2 flex h-5 -translate-y-1/2 items-center rounded-md border border-[#24232c] bg-[#060608] px-1.5 font-sans text-[11px] text-[#8b8a96]">
              {isMac() ? '⌘K' : 'Ctrl K'}
            </kbd>
          </div>
          <button
            onClick={() => navigate('/settings')}
            title="Settings"
            className="flex size-8 items-center justify-center rounded-full border border-[#24232c] bg-[#17161c] text-[#a09fab] transition-colors hover:bg-[#1c1b22] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#7c6ee6] focus-visible:ring-offset-2 focus-visible:ring-offset-[#060608]"
          >
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
              <circle cx="12" cy="12" r="3" />
              <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 1 1-4 0v-.09a1.65 1.65 0 0 0-1-1.51 1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 1 1 0-4h.09a1.65 1.65 0 0 0 1.51-1 1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06a1.65 1.65 0 0 0 1.82.33h.01a1.65 1.65 0 0 0 1-1.51V3a2 2 0 1 1 4 0v.09a1.65 1.65 0 0 0 1 1.51h.01a1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82v.01a1.65 1.65 0 0 0 1.51 1H21a2 2 0 1 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z" />
            </svg>
          </button>
        </div>
      </header>

      {/* ============ page header (shared container) ============ */}
      <div className="mx-auto w-full max-w-7xl px-6 lg:px-8">
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
            onClick={() => setCreating(true)}
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
        <div className="mx-auto w-full max-w-7xl px-6 lg:px-8">
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

      {/* ============ grid (shared container) ============ */}
      <div className="mx-auto w-full max-w-7xl px-6 lg:px-8">
        {/* skeleton loading */}
        {!loaded && (
          <div className="mt-8 grid [grid-template-columns:repeat(auto-fill,minmax(264px,1fr))] gap-x-8 gap-y-10">
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
                    load('all', sort, '');
                  }}
                  className="mt-4 h-9 rounded-[10px] border border-[#24232c] px-4 text-[13px] text-[#a09fab] transition-colors hover:bg-[#17161c]"
                >
                  Clear filter
                </button>
              </>
            ) : (
              <div className="mx-auto max-w-[280px]">
                <div
                  onClick={() => setCreating(true)}
                  className="nb-cover mb-8 flex cursor-pointer items-center justify-center"
                  style={{ borderStyle: 'dashed' }}
                >
                  <span className="text-[#a09fab]">
                    <Plus className="h-8 w-8" />
                  </span>
                </div>
                <p className="text-sm text-[#a09fab]">Create your first notebook</p>
                <button
                  onClick={() => setCreating(true)}
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
                onMenu={() => setMenuFor(menuFor === nb.id ? null : nb.id)}
                menuOpen={menuFor === nb.id}
                onMenuClose={() => setMenuFor(null)}
                onRename={() => {
                  setMenuFor(null);
                  setRenaming(nb);
                }}
                onToggleFavorite={() => update(nb, { isFavorite: !nb.is_favorite })}
                onToggleArchive={() => update(nb, { archived: nb.archived_at === null })}
                onDelete={() => {
                  setMenuFor(null);
                  setDeleting(nb);
                }}
              />
            ))}

            {/* dashed "New notebook" tile */}
            <button
              onClick={() => setCreating(true)}
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

      {/* ============ footer breadcrumb bar (same shell as chapters) ============ */}
      <footer className="sticky bottom-0 z-30 mt-auto border-t border-[#24232c] bg-[#060608]">
        <div className="mx-auto flex h-10 w-full max-w-7xl items-center justify-between px-6 text-[13px] lg:px-8">
          <div className="flex items-center gap-1.5">
            <span className="font-medium text-[#f4f4f6]">Notebooks</span>
          </div>
          <span className="text-[#8b8a96]">Last synced just now</span>
        </div>
      </footer>

      {/* create */}
      <Dialog open={creating} onOpenChange={setCreating}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>New notebook</DialogTitle>
            <DialogDescription>
              Notebooks hold chapters of topics on their canvases.
            </DialogDescription>
          </DialogHeader>
          <Field label="Name" value={name} onChange={setName} placeholder="e.g. Physics" autoFocus />
          <Field label="Label (optional tag on the card)" value={label} onChange={setLabel} placeholder="e.g. PHYS" />
          <Field label="Description" value={description} onChange={setDescription} placeholder="Optional" />
          <DialogFooter>
            <GhostButton onClick={() => setCreating(false)}>Cancel</GhostButton>
            <PrimaryButton disabled={!name.trim() || saving} onClick={submit}>
              {saving ? 'Creating…' : 'Create'}
            </PrimaryButton>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* rename */}
      <Dialog open={renaming !== null} onOpenChange={(open) => !open && setRenaming(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Rename notebook</DialogTitle>
          </DialogHeader>
          <Field label="Name" value={name} onChange={setName} placeholder="Notebook name" />
          <DialogFooter>
            <GhostButton onClick={() => setRenaming(null)}>Cancel</GhostButton>
            <PrimaryButton
              disabled={!name.trim() || name.trim() === renaming?.name}
              onClick={async () => {
                if (renaming) await update(renaming, { name: name.trim() });
                setRenaming(null);
              }}
            >
              Rename
            </PrimaryButton>
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
    </div>
  );
}

/* ================= card ================= */

function NotebookCard({
  notebook: nb,
  filter,
  onOpen,
  onMenu,
  menuOpen,
  onMenuClose,
  onRename,
  onToggleFavorite,
  onToggleArchive,
  onDelete,
}: {
  notebook: Notebook;
  filter: NotebookFilter;
  onOpen: () => void;
  onMenu: () => void;
  menuOpen: boolean;
  onMenuClose: () => void;
  onRename: () => void;
  onToggleFavorite: () => void;
  onToggleArchive: () => void;
  onDelete: () => void;
}) {
  const Icon = emblem(nb.icon);
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
            style={{ background: 'var(--accent)', opacity: spineOpacity(nb.id) }}
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

          <Icon className="mt-3 h-5 w-5 shrink-0" strokeWidth={1.5} style={{ color: 'var(--text-3)' }} />
        </div>

        {/* favorite ribbon */}
        {nb.is_favorite && (
          <span
            className="absolute top-0 h-[28px] w-[16px]"
            style={{
              right: 22,
              background: 'var(--accent)',
              clipPath: 'polygon(0 0, 100% 0, 100% 100%, 50% 82%, 0 100%)',
            }}
          />
        )}
      </div>

      {/* three-dot menu button (hover/focus reveal) */}
      <button
        onClick={(e) => {
          e.stopPropagation();
          onMenu();
        }}
        title="Notebook options"
        className={`absolute right-2 top-2 z-10 flex h-7 w-7 items-center justify-center rounded-full border opacity-0 transition-opacity focus-visible:opacity-100 group-hover:opacity-100 hover:opacity-100 ${
          menuOpen ? 'opacity-100' : ''
        }`}
        style={{ background: '#14141a', borderColor: 'var(--border)', color: 'var(--text-2)' }}
      >
        <MoreHorizontal className="h-4 w-4" />
      </button>

      {menuOpen && (
        <>
          <div className="fixed inset-0 z-40" onClick={onMenuClose} />
          <div
            className="absolute right-2 top-10 z-50 w-[200px] rounded-[10px] border p-1 shadow-xl"
            style={{ background: '#14141a', borderColor: 'var(--border)' }}
          >
            <MenuItem onClick={() => { onMenuClose(); onOpen(); }}>Open</MenuItem>
            <MenuItem onClick={() => { onMenuClose(); onRename(); }}>Rename</MenuItem>
            <MenuItem onClick={() => { onMenuClose(); onToggleFavorite(); }}>
              {nb.is_favorite ? 'Remove from favorites' : 'Add to favorites'}
            </MenuItem>
            <MenuItem onClick={() => { onMenuClose(); onToggleArchive(); }}>
              {archived ? 'Unarchive' : 'Archive'}
            </MenuItem>
            <div className="my-1 border-t" style={{ borderColor: 'var(--border)' }} />
            <MenuItem danger onClick={onDelete}>Delete</MenuItem>
          </div>
        </>
      )}
    </div>
  );
}
function MenuItem({
  children,
  onClick,
  danger,
}: {
  children: React.ReactNode;
  onClick: () => void;
  danger?: boolean;
}) {
  return (
    <button
      onClick={onClick}
      className="flex w-full items-center rounded-md px-3 py-2 text-left text-[13px] transition-colors hover:bg-[var(--hover)]"
      style={{ color: danger ? 'var(--danger)' : 'var(--text-2)' }}
    >
      {children}
    </button>
  );
}

function Field({
  label,
  value,
  onChange,
  placeholder,
  autoFocus,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  placeholder: string;
  autoFocus?: boolean;
}) {
  return (
    <div className="mb-4">
      <label className="mb-1.5 block text-[13px] font-medium" style={{ color: 'var(--text-2)' }}>
        {label}
      </label>
      <input
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        autoFocus={autoFocus}
        className="w-full rounded-lg border px-3 py-2.5 text-[15px] outline-none transition-colors focus:border-[var(--border-strong)] placeholder:text-[var(--text-3)]"
        style={{ background: 'var(--input)', borderColor: 'var(--border)', color: 'var(--text)' }}
      />
    </div>
  );
}

function GhostButton({ children, onClick }: { children: React.ReactNode; onClick: () => void }) {
  return (
    <button
      onClick={onClick}
      className="rounded-lg px-4 py-2.5 text-sm font-medium transition-colors hover:bg-[var(--hover)]"
      style={{ color: 'var(--text-2)' }}
    >
      {children}
    </button>
  );
}

function PrimaryButton({
  children,
  onClick,
  disabled,
  type,
}: {
  children: React.ReactNode;
  onClick?: () => void;
  disabled?: boolean;
  type?: 'submit';
}) {
  return (
    <button
      type={type}
      onClick={onClick}
      disabled={disabled}
      className="h-10 rounded-[10px] px-4 text-sm font-medium text-white transition-colors disabled:opacity-40"
      style={{ background: 'var(--accent)' }}
      onMouseEnter={(e) => !disabled && (e.currentTarget.style.background = 'var(--accent-hover)')}
      onMouseLeave={(e) => (e.currentTarget.style.background = 'var(--accent)')}
    >
      {children}
    </button>
  );
}
