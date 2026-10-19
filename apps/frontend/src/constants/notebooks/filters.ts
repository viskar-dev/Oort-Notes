import type { NotebookFilter, NotebookSort } from '@/lib/ipc';

/** The home filter tabs, in display order. */
export const NOTEBOOK_TABS: NotebookFilter[] = ['all', 'recent', 'favorites', 'archived'];

/** Sort choices for the notebook list (server-side SQL sorts). */
export const NOTEBOOK_SORTS: { id: NotebookSort; label: string }[] = [
  { id: 'edited', label: 'Last edited' },
  { id: 'opened', label: 'Recently opened' },
  { id: 'name', label: 'Name' },
];
