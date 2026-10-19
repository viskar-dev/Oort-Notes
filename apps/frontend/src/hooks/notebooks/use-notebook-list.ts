import { useEffect, useState } from 'react';
import type { Notebook, NotebookFilter, NotebookSort } from '@/lib/ipc';
import { api } from '@/lib/ipc';
import { useDebouncedValue } from '@/hooks/use-debounced-value';
import { useReloadKey } from '@/hooks/use-reload-key';
import { errorText } from '@/lib/utils';

export interface NotebookFlagChanges {
  name?: string;
  isFavorite?: boolean;
  archived?: boolean;
}

export interface NotebookCreateInput {
  name: string;
  label: string;
  description: string;
}

/** Notebooks-home data: one cancel-guarded fetch per view state (the backend
 *  filters/sorts/searches in SQL) plus actions that throw on failure so the
 *  distinguishing caller decides between closing a dialog or not. */
export function useNotebookList() {
  const [notebooks, setNotebooks] = useState<Notebook[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [filter, setFilter] = useState<NotebookFilter>('all');
  const [sort, setSort] = useState<NotebookSort>('edited');
  const [search, setSearch] = useState('');
  const searchDebounced = useDebouncedValue(search, 250);
  const [reloadKey, reload] = useReloadKey();

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const list = await api.listNotebooks(filter, sort, searchDebounced.trim() || undefined);
        if (cancelled) return;
        setNotebooks(list);
        setError(null);
      } catch (e) {
        if (!cancelled) setError(errorText(e));
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [filter, sort, searchDebounced, reloadKey]);

  // a different tab shows a different list — start it from the top
  useEffect(() => {
    window.scrollTo({ top: 0 });
  }, [filter]);

  const createNotebook = async (input: {
    name: string;
    label: string;
    description: string;
  }) => {
    setError(null);
    await api.createNotebook(
      input.name,
      input.label || undefined,
      input.description || undefined,
    );
    reload();
  };

  const updateNotebook = async (nb: Notebook, flags: NotebookFlagChanges) => {
    setError(null);
    await api.updateNotebookFlags(nb.id, flags);
    reload();
  };

  const deleteNotebook = async (nb: Notebook) => {
    setError(null);
    await api.deleteNotebook(nb.id);
    reload();
  };

  return {
    notebooks,
    error,
    setError,
    filter,
    setFilter,
    sort,
    setSort,
    search,
    setSearch,
    reload,
    createNotebook,
    updateNotebook,
    deleteNotebook,
  };
}
