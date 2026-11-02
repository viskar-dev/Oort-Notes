import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { api, type Chapter, type Notebook, type Topic } from '@/lib/ipc';
import { errorText } from '@/lib/utils';
import { useReloadKey } from '@/hooks/use-reload-key';

interface NotebookLoadState {
  id: string;
  notebook: Notebook | null;
  error: string | null;
}

interface ListState<T> {
  id: string;
  items: T[];
}

/** The chapters-page data: the route's notebook, its chapters, the selected
 *  chapter's topics, the client-side search filter and the list mutations.
 *  Everything is keyed by the id it belongs to, so a stale response for a
 *  different notebook/selection can never render, and a route change shows
 *  the loading state by derivation instead of a second render pass. */
export function useNotebookOverview(notebookId: string) {
  const navigate = useNavigate();

  const [notebookState, setNotebookState] = useState<NotebookLoadState | null>(null);
  const activeNotebook = notebookState?.id === notebookId ? notebookState : null;
  const notebook = activeNotebook?.notebook ?? null;
  const loadError = activeNotebook?.error ?? null;

  const [chaptersState, setChaptersState] = useState<ListState<Chapter> | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState('');
  const [reloadKey, reload] = useReloadKey();

  // selection + the selected chapter's topics (selection is derived below)
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [topicsState, setTopicsState] = useState<ListState<Topic> | null>(null);

  // load the notebook
  useEffect(() => {
    let cancelled = false;
    const id = notebookId;
    api
      .loadNotebook(id)
      .then((n) => {
        if (!cancelled) setNotebookState({ id, notebook: n, error: null });
      })
      .catch((e) => {
        if (!cancelled) {
          setNotebookState({ id, notebook: null, error: errorText(e) });
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
        if (!cancelled) setError(errorText(e));
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [notebookIdResolved, reloadKey]);

  const chapters = chaptersState?.id === notebookIdResolved ? chaptersState.items : null;

  // the selection is derived: the picked chapter, or the first one
  const selected = chapters?.length
    ? (chapters.find((c) => c.id === selectedId) ?? chapters[0])
    : null;
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
          setError(errorText(e));
          setTopicsState({ id, items: [] });
        }
      });
    return () => {
      cancelled = true;
    };
  }, [selectedResolvedId]);

  const topics = topicsState?.id === selectedResolvedId ? topicsState.items : null;

  const chapterIndex = selected ? (chapters?.findIndex((c) => c.id === selected.id) ?? -1) : -1;

  // the search filters client-side: the topic list is small, so computing
  // during render is cheaper than another memo layer. Topics only — the
  // chapters column stays complete (the header field says "Search topics")
  const filteredTopics = topics && search.trim()
    ? topics.filter((t) => t.name.toLowerCase().includes(search.trim().toLowerCase()))
    : topics;

  const totalTopics = chapters?.reduce((acc, c) => acc + c.topics_count, 0) ?? 0;

  // ---- actions: all throw on failure so the caller keeps dialogs open ----
  const createTopic = async (name: string) => {
    if (!selected) return;
    const topic = await api.createTopic(selected.id, name);
    setTopicsState((prev) =>
      prev && prev.id === selected.id ? { id: prev.id, items: [...prev.items, topic] } : prev,
    );
    reload(); // refresh the chapter counters in the sidebar
  };

  const renameChapter = async (chapter: Chapter, name: string) => {
    const updated = await api.updateChapter(chapter.id, name);
    setChaptersState((prev) =>
      prev
        ? { id: prev.id, items: prev.items.map((c) => (c.id === updated.id ? updated : c)) }
        : prev,
    );
  };

  const deleteChapter = async (chapter: Chapter) => {
    await api.deleteChapter(chapter.id);
    reload();
  };

  // deleting the notebook leaves the page: navigate home on success
  const deleteNotebook = async (nb: Notebook) => {
    await api.deleteNotebook(nb.id);
    navigate('/');
  };

  const renameNotebook = async (name: string) => {
    if (!notebook) return;
    const updated = await api.updateNotebookFlags(notebook.id, { name });
    setNotebookState((prev) =>
      prev ? { id: prev.id, notebook: updated, error: null } : prev,
    );
  };

  return {
    notebook,
    loadError,
    error,
    setError,
    chapters,
    filteredTopics,
    topics,
    selected,
    selectedId,
    setSelectedId,
    chapterIndex,
    totalTopics,
    search,
    setSearch,
    reload,
    createTopic,
    renameChapter,
    deleteChapter,
    deleteNotebook,
    renameNotebook,
  };
}
