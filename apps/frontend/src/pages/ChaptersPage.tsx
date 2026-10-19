import { useCallback, useEffect, useMemo, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import {
  ChevronRight,
  Eye,
  FileText,
  Infinity as InfinityIcon,
  MoreVertical,
  Plus,
} from 'lucide-react';
import {
  api,
  type Chapter,
  type Notebook,
  type PagePreset,
  type CanvasType,
  type Topic,
  type UiPreset,
} from '../lib/ipc';
import { RouteError } from '@/pages/route-error';
import { APP_CONTAINER, WorkspaceLayout } from '@/components/layout/workspace-layout';
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
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { CreateTopicDialog } from '@/features/chapters/create-topic-dialog';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectGroupLabel,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { timeAgo } from '@/lib/canvas';

function canvasLabel(type: CanvasType): string {
  return type === 'page' ? 'Page' : type === 'scroll' ? 'Scroll' : 'Infinite';
}

/** Route: '/notebooks/:notebookId'. Notebooks-home shell with a two-panel
 * chapters list / topics list. */
export function ChaptersPage() {
  const { notebookId } = useParams();
  const navigate = useNavigate();

  // the route's notebook, keyed by id: a stale response for another
  // notebook can never render, and a route change shows the loading state
  // by derivation instead of a second render pass
  const [notebookState, setNotebookState] = useState<{
    id: string;
    notebook: Notebook | null;
    error: string | null;
  } | null>(null);
  const activeNotebook = notebookState?.id === notebookId ? notebookState : null;
  const notebook = activeNotebook?.notebook ?? null;
  const loadError = activeNotebook?.error ?? null;

  // the notebook's chapters, keyed the same way on the notebook id
  const [chaptersState, setChaptersState] = useState<{ id: string; items: Chapter[] } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState('');

  const [refreshKey, setRefreshKey] = useState(0);
  const reload = useCallback(() => setRefreshKey((k) => k + 1), []);

  // selection + the selected chapter's topics (selection is derived below)
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [topicsState, setTopicsState] = useState<{ id: string; items: Topic[] } | null>(null);

  const [creating, setCreating] = useState(false);
  const [creatingTopic, setCreatingTopic] = useState(false);
  const [deleting, setDeleting] = useState<Chapter | null>(null);
  const [deletingNotebook, setDeletingNotebook] = useState<Notebook | null>(null);
  const [renaming, setRenaming] = useState(false);
  const [renamingChapter, setRenamingChapter] = useState<Chapter | null>(null);

  // load the notebook
  useEffect(() => {
    let cancelled = false;
    const id = notebookId!;
    api
      .loadNotebook(id)
      .then((n) => {
        if (!cancelled) setNotebookState({ id, notebook: n, error: null });
      })
      .catch((e) => {
        if (!cancelled) {
          setNotebookState({
            id,
            notebook: null,
            error: e instanceof Error ? e.message : String(e),
          });
        }
      });
    return () => {
      cancelled = true;
    };
  }, [notebookId]);

  // load the notebook's chapters
  const notebookIdResolved = notebook?.id ?? null;
  useEffect(() => {
    const id = notebookIdResolved;
    if (!id) return;
    let cancelled = false;
    (async () => {
      try {
        const list = await api.listChapters(id);
        if (cancelled) return;
        setChaptersState({ id, items: list });
        setError(null);
      } catch (e) {
        if (!cancelled) setError(e instanceof Error ? e.message : String(e));
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [notebookIdResolved, refreshKey]);

  const chapters = chaptersState?.id === notebookIdResolved ? chaptersState.items : null;

  // the selection is derived: the picked chapter, or the first one
  const selected = useMemo(
    () => (chapters?.length ? chapters.find((c) => c.id === selectedId) ?? chapters[0] : null),
    [chapters, selectedId],
  );
  const selectedResolvedId = selected?.id ?? null;

  // load the selected chapter's topics
  useEffect(() => {
    const id = selectedResolvedId;
    if (!id) return;
    let cancelled = false;
    api
      .listTopics(id)
      .then((t) => {
        if (!cancelled) setTopicsState({ id, items: t });
      })
      .catch((e) => {
        if (!cancelled) {
          setError(e instanceof Error ? e.message : String(e));
          setTopicsState({ id, items: [] });
        }
      });
    return () => {
      cancelled = true;
    };
  }, [selectedResolvedId]);

  const topics = topicsState?.id === selectedResolvedId ? topicsState.items : null;

  const chapterIndex = selected ? (chapters?.findIndex((c) => c.id === selected.id) ?? -1) : -1;

  const filteredChapters = useMemo(() => {
    if (!chapters) return null;
    const q = search.trim().toLowerCase();
    return q ? chapters.filter((c) => c.name.toLowerCase().includes(q)) : chapters;
  }, [chapters, search]);

  const filteredTopics = useMemo(() => {
    if (!topics) return null;
    const q = search.trim().toLowerCase();
    return q ? topics.filter((t) => t.name.toLowerCase().includes(q)) : topics;
  }, [topics, search]);

  const totalTopics = chapters?.reduce((acc, c) => acc + c.topics_count, 0) ?? 0;

  async function createTopic(name: string) {
    if (!selected) return;
    try {
      const topic = await api.createTopic(selected.id, name);
      setTopicsState((prev) =>
        prev && prev.id === selected.id ? { id: prev.id, items: [...prev.items, topic] } : prev,
      );
      reload(); // refresh the chapter counters in the sidebar
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
      throw e;
    }
  }

  async function renameChapter(chapter: Chapter, name: string) {
    try {
      const updated = await api.updateChapter(chapter.id, name);
      setChaptersState((prev) =>
        prev ? { id: prev.id, items: prev.items.map((c) => (c.id === updated.id ? updated : c)) } : prev,
      );
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
      throw e;
    }
  }

  async function handleDeleteChapter(chapter: Chapter) {
    try {
      await api.deleteChapter(chapter.id);
      setDeleting(null);
      reload();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    }
  }

  async function handleDeleteNotebook(nb: Notebook) {
    try {
      await api.deleteNotebook(nb.id);
      navigate('/');
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    }
  }

  if (loadError) {
    return (
      <RouteError
        title="Notebook not found"
        message={loadError}
        onBack={() => navigate('/')}
        backLabel="Back to notebooks"
      />
    );
  }
  if (!notebook) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-[#060608] text-[#8b8a96]">
        Loading…
      </div>
    );
  }

  return (
    <WorkspaceLayout
      search={{ value: search, onChange: setSearch, placeholder: 'Search chapters and topics' }}
      crumbs={[{ label: 'Notebooks', to: '/' }, { label: notebook.name }]}
    >
      {/* ============ page header ============ */}
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
              <DropdownMenuItem onClick={() => setRenaming(true)}>Rename notebook</DropdownMenuItem>
              <DropdownMenuItem variant="destructive" onClick={() => setDeletingNotebook(notebook)}>
                Delete notebook
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>

        {error && (
          <div className="mt-4 rounded-lg border border-[#24232c] bg-[#111016] px-4 py-3 text-sm text-[#f87171]">
            {error}
          </div>
        )}
      </div>

      {/* ============ two-panel body ============ */}
      <div className={`${APP_CONTAINER} mb-16 mt-8 flex flex-1 items-start gap-6`}>
        {/* chapters panel */}
        <aside className="w-[280px] shrink-0 rounded-xl border border-[#24232c] bg-[#111016]">
          <div className="flex items-center justify-between px-4 py-3.5">
            <div className="flex items-center gap-2">
              <span className="text-sm font-semibold text-[#f4f4f6]">Chapters</span>
              {filteredChapters && (
                <span className="flex h-5 min-w-5 items-center justify-center rounded-full bg-[#17161c] px-1.5 text-[11px] text-[#8b8a96]">
                  {filteredChapters.length}
                </span>
              )}
            </div>
            <button
              onClick={() => setCreating(true)}
              className="flex h-8 items-center gap-1.5 rounded-lg border border-[#24232c] bg-[#17161c] px-2.5 text-[13px] text-[#f4f4f6] transition-colors hover:bg-[#1c1b22]"
            >
              <Plus className="h-3.5 w-3.5 text-[#a09fab]" /> New chapter
            </button>
          </div>

          <div className="px-2 pb-2">
            {filteredChapters === null && <p className="px-3 py-6 text-sm text-[#8b8a96]">Loading…</p>}
            {filteredChapters?.length === 0 && (
              <p className="px-3 py-6 text-sm text-[#8b8a96]">
                {search ? 'No matches' : 'No chapters yet'}
              </p>
            )}
            {filteredChapters?.map((chapter, i) => {
              const active = chapter.id === selected?.id;
              return (
                <div
                  key={chapter.id}
                  role="button"
                  tabIndex={0}
                  onClick={() => setSelectedId(chapter.id)}
                  className={`group relative flex h-10 w-full cursor-pointer items-center gap-3 rounded-lg px-3 text-left transition-colors ${
                    active ? 'bg-[#1c1b22]' : 'hover:bg-[#17161c]'
                  }`}
                >
                  {active && (
                    <span className="absolute inset-y-1.5 left-0 w-[3px] rounded-full bg-[#7c6ee6]" />
                  )}
                  <span className="w-6 text-[11px] text-[#8b8a96]">
                    {String(i + 1).padStart(2, '0')}
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
                      navigate(`/chapters/${chapter.id}`);
                    }}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') {
                        e.stopPropagation();
                        navigate(`/chapters/${chapter.id}`);
                      }
                    }}
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
                        <DropdownMenuItem onClick={() => setRenamingChapter(chapter)}>
                          Rename
                        </DropdownMenuItem>
                        <DropdownMenuItem
                          variant="destructive"
                          onClick={() => setDeleting(chapter)}
                        >
                          Delete
                        </DropdownMenuItem>
                      </DropdownMenuContent>
                    </DropdownMenu>
                  </span>
                </div>
              );
            })}
          </div>
        </aside>

        {/* topics panel */}
        <section className="min-w-0 flex-1 rounded-xl border border-[#24232c] bg-[#111016]">
          {!selected ? (
            <div className="flex h-full min-h-[420px] items-center justify-center text-sm text-[#8b8a96]">
              {filteredChapters?.length === 0 ? 'Create a chapter to get started' : 'Select a chapter'}
            </div>
          ) : (
            <>
              <div className="flex items-center justify-between border-b border-[#24232c] px-6 py-4">
                <div className="min-w-0">
                  <div className="flex items-center gap-2.5">
                    <h2 className="truncate text-[22px] font-semibold leading-tight tracking-tight text-[#f4f4f6]">
                      {selected.name}
                    </h2>
                    <span className="flex h-[22px] shrink-0 items-center gap-1 rounded-md border border-[#24232c] bg-[#17161c] px-2 text-[11px] text-[#a09fab]">
                      {selected.canvas_type === 'infinite' ? (
                        <InfinityIcon className="h-3 w-3" />
                      ) : (
                        <FileText className="h-3 w-3" />
                      )}
                      {canvasLabel(selected.canvas_type)}
                    </span>
                  </div>
                  <p className="mt-0.5 text-[13px] text-[#8b8a96]">
                    {selected.topics_count} {selected.topics_count === 1 ? 'topic' : 'topics'} · Edited{' '}
                    {timeAgo(selected.updated_at)}
                  </p>
                </div>
                <div className="flex shrink-0 items-center gap-2">
                  <button
                    onClick={() => setCreatingTopic(true)}
                    className="inline-flex h-9 items-center gap-2 rounded-[10px] bg-[#7c6ee6] px-3.5 text-[13px] font-medium text-white transition-colors hover:bg-[#8b7ff0] shadow-[inset_0_1px_0_rgba(255,255,255,0.28),inset_0_-1px_0_rgba(0,0,0,0.22),0_1px_2px_rgba(6,6,8,0.45),0_4px_14px_-2px_rgba(124,110,230,0.45)] ring-1 ring-inset ring-white/10 active:shadow-[inset_0_1px_2px_rgba(0,0,0,0.25),0_1px_2px_rgba(6,6,8,0.4)] active:translate-y-px"
                  >
                    <Plus className="h-4 w-4" /> New topic
                  </button>
                </div>
              </div>

              <div>
                {filteredTopics === null && <p className="px-6 py-6 text-sm text-[#8b8a96]">Loading…</p>}
                {filteredTopics?.length === 0 && (
                  <p className="px-6 py-6 text-sm text-[#8b8a96]">
                    {search ? 'No topics match' : 'No topics yet — create one to start writing.'}
                  </p>
                )}
                {filteredTopics?.map((topic, i) => (
                  <button
                    key={topic.id}
                    onClick={() => navigate(`/chapters/${selected.id}?topic=${topic.id}`)}
                    className="group flex h-12 w-full items-center gap-3 border-b border-[#1c1b22] px-6 text-left transition-colors last:border-b-0 hover:bg-[#17161c]"
                  >
                    <span className="w-8 text-[11px] text-[#8b8a96]">
                      {chapterIndex + 1}.{i + 1}
                    </span>
                    <span className="flex-1 truncate text-[13px] font-medium text-[#f4f4f6]">
                      {topic.name}
                    </span>
                    <span className="text-[13px] text-[#8b8a96]">
                      Edited {timeAgo(topic.updated_at)}
                    </span>
                    <ChevronRight className="h-4 w-4 text-[#6c6c78] transition-colors group-hover:text-[#a09fab]" />
                  </button>
                ))}
              </div>
            </>
          )}
        </section>
      </div>

      {/* ============ dialogs ============ */}
      <CreateTopicDialog open={creatingTopic} onOpenChange={setCreatingTopic} onCreate={createTopic} />

      <CreateChapterModal open={creating} onOpenChange={setCreating} notebookId={notebook.id} onCreated={reload} />

      <AlertDialog open={deleting !== null} onOpenChange={(open) => !open && setDeleting(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete "{deleting?.name}"?</AlertDialogTitle>
            <AlertDialogDescription>
              This removes the chapter and every topic and canvas in it. This
              cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={() => deleting && handleDeleteChapter(deleting)}>
              Delete chapter
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <AlertDialog
        open={deletingNotebook !== null}
        onOpenChange={(open) => !open && setDeletingNotebook(null)}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete "{deletingNotebook?.name}"?</AlertDialogTitle>
            <AlertDialogDescription>
              This permanently removes the notebook and all of its chapters and
              topics. This cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={() => deletingNotebook && handleDeleteNotebook(deletingNotebook)}>
              Delete notebook
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <Dialog open={renaming} onOpenChange={setRenaming}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Rename notebook</DialogTitle>
          </DialogHeader>
          <RenameForm
            initial={notebook.name}
            onSubmit={async (name) => {
              const updated = await api.updateNotebookFlags(notebook.id, { name });
              setNotebookState({ id: notebook.id, notebook: updated, error: null });
              setRenaming(false);
            }}
          />
        </DialogContent>
      </Dialog>

      <Dialog open={renamingChapter !== null} onOpenChange={(open) => !open && setRenamingChapter(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Rename chapter</DialogTitle>
          </DialogHeader>
          <RenameForm
            initial={renamingChapter?.name ?? ''}
            onSubmit={async (name) => {
              if (renamingChapter) await renameChapter(renamingChapter, name);
              setRenamingChapter(null);
            }}
          />
        </DialogContent>
      </Dialog>
    </WorkspaceLayout>
  );
}

function RenameForm({
  initial,
  onSubmit,
}: {
  initial: string;
  onSubmit: (name: string) => Promise<void>;
}) {
  const [name, setName] = useState(initial);
  const [saving, setSaving] = useState(false);

  return (
    <>
      <Input
        value={name}
        onChange={(e) => setName(e.target.value)}
        autoFocus
        onKeyDown={(e) => {
          if (e.key === 'Enter' && name.trim() && name.trim() !== initial && !saving) {
            setSaving(true);
            onSubmit(name.trim());
          }
        }}
      />
      <DialogFooter>
        <Button variant="ghost" onClick={() => setSaving(false)}>
          Cancel
        </Button>
        <Button
          disabled={!name.trim() || name.trim() === initial || saving}
          onClick={async () => {
            setSaving(true);
            await onSubmit(name.trim());
          }}
        >
          Rename
        </Button>
      </DialogFooter>
    </>
  );
}

/* ================= create chapter dialog ================= */

function CreateChapterModal({
  open,
  onOpenChange,
  notebookId,
  onCreated,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  notebookId: string;
  onCreated: () => void;
}) {
  const [name, setName] = useState('');
  const [canvasType, setCanvasType] = useState<CanvasType>('infinite');
  const [presetId, setPresetId] = useState<string>('a4-portrait');
  const [presets, setPresets] = useState<PagePreset[] | null>(null);
  const [uiPresets, setUiPresets] = useState<UiPreset[]>([]);
  const [uiPresetId, setUiPresetId] = useState<string>('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!open) return;
    let cancelled = false;
    api
      .listPagePresets()
      .then((p) => {
        if (!cancelled) setPresets(p);
      })
      .catch((e) => {
        if (!cancelled) setError(e instanceof Error ? e.message : String(e));
      });
    api
      .listUiPresets()
      .then((p) => {
        if (!cancelled) setUiPresets(p);
      })
      .catch(() => {
        if (!cancelled) setUiPresets([]);
      });
    return () => {
      cancelled = true;
    };
  }, [open]);

  const selectedPreset = presets?.find((p) => p.id === presetId);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!name.trim() || saving) return;
    setSaving(true);
    setError(null);
    try {
      await api.createChapter(notebookId, name.trim(), canvasType, {
        pagePresetId: canvasType === 'page' ? presetId : undefined,
        uiPresetId: uiPresetId || undefined,
      });
      onOpenChange(false);
      setName('');
      onCreated();
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
      setSaving(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[85vh] max-w-[440px] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>New chapter</DialogTitle>
          <DialogDescription>
            Chapters are canvases: free-form (infinite) or fixed paper pages.
          </DialogDescription>
        </DialogHeader>
        <form onSubmit={submit} className="flex flex-col gap-4">
          <div>
            <label className="mb-1.5 block text-[13px] font-medium text-[#a09fab]">Name</label>
            <Input
              value={name}
              onChange={(e) => setName(e.target.value)}
              autoFocus
              placeholder="e.g. Graph Theory"
            />
          </div>

          <div>
            <label className="mb-1.5 block text-[13px] font-medium text-[#a09fab]">Canvas type</label>
            <div className="grid grid-cols-2 gap-2">
              {(
                [
                  ['infinite', 'Infinite', 'Free-form canvas'],
                  ['page', 'Page', 'Fixed paper size'],
                ] as const
              ).map(([value, title, hint]) => (
                <button
                  key={value}
                  type="button"
                  onClick={() => setCanvasType(value)}
                  className={`rounded-lg border px-3 py-2.5 text-left transition-colors ${
                    canvasType === value
                      ? 'border-[#7c6ee6] bg-[#17161c]'
                      : 'border-[#24232c] hover:border-[#3f3f46]'
                  }`}
                >
                  <div className="text-[13px] font-medium text-[#f4f4f6]">{title}</div>
                  <div className="text-[11px] text-[#8b8a96]">{hint}</div>
                </button>
              ))}
            </div>
          </div>

          {canvasType === 'page' && (
            <div>
              <label className="mb-1.5 block text-[13px] font-medium text-[#a09fab]">Page size</label>
              <Select
                value={presetId}
                onValueChange={(v) => setPresetId(v as unknown as string)}
                items={
                  presets
                    ? Object.fromEntries(presets.map((p) => [p.id, `${p.name} (${p.size_label})`]))
                    : undefined
                }
              >
                <SelectTrigger>
                  <SelectValue placeholder="Choose a page size" />
                </SelectTrigger>
                <SelectContent>
                  {(['paper', 'ratio'] as const).map((category) => (
                    <SelectGroup key={category}>
                      <SelectGroupLabel>{category === 'paper' ? 'Paper' : 'Aspect ratio'}</SelectGroupLabel>
                      {presets
                        ?.filter((p) => p.category === category)
                        .map((p) => (
                          <SelectItem key={p.id} value={p.id} label={`${p.name} (${p.size_label})`}>
                            {p.name} ({p.size_label})
                          </SelectItem>
                        ))}
                    </SelectGroup>
                  ))}
                </SelectContent>
              </Select>
              {selectedPreset && (
                <p className="mt-1.5 text-[11px] text-[#8b8a96]">
                  {selectedPreset.width} × {selectedPreset.height} px, {selectedPreset.orientation}
                </p>
              )}
            </div>
          )}

          <div>
            <label className="mb-1.5 block text-[13px] font-medium text-[#a09fab]">UI preset</label>
            <Select
              value={uiPresetId}
              onValueChange={(v) => setUiPresetId(v as unknown as string)}
              items={{
                '': 'tldraw defaults',
                ...Object.fromEntries(uiPresets.map((p) => [p.id, p.name])),
              }}
            >
              <SelectTrigger>
                <SelectValue placeholder="tldraw defaults" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="">tldraw defaults</SelectItem>
                {uiPresets.map((p) => (
                  <SelectItem key={p.id} value={p.id} label={p.name}>
                    {p.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            {uiPresets.length === 0 && (
              <p className="mt-1.5 text-[11px] text-[#8b8a96]">
                No presets yet — create one in Settings → Presets.
              </p>
            )}
          </div>

          {error && (
            <div className="rounded-lg border border-[#24232c] bg-[#111016] px-4 py-3 text-sm text-[#f87171]">
              {error}
            </div>
          )}

          <DialogFooter className="mt-2">
            <Button type="button" variant="ghost" onClick={() => onOpenChange(false)}>
              Cancel
            </Button>
            <Button type="submit" disabled={!name.trim() || saving}>
              {saving ? 'Creating…' : 'Create'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
