import { useCallback, useState } from 'react';
import type { Notebook } from '@/lib/ipc';
import { errorText } from '@/lib/utils';
import { toast } from 'sonner';
import type { NotebookFlagChanges, NotebookCreateInput } from '@/hooks/notebooks/use-notebook-list';

/** The create/rename/delete dialog commands for the notebooks home: which
 *  dialog is open, and the submit that closes it on success. Failures keep
 *  the dialog open and surface through the page's error banner. */
export function useNotebookDialogs({
  createNotebook,
  updateNotebook,
  deleteNotebook,
  onError,
}: {
  createNotebook: (input: NotebookCreateInput) => Promise<void>;
  updateNotebook: (nb: Notebook, flags: NotebookFlagChanges) => Promise<void>;
  deleteNotebook: (nb: Notebook) => Promise<void>;
  onError: (message: string) => void;
}) {
  const [creating, setCreating] = useState(false);
  const [renaming, setRenaming] = useState<Notebook | null>(null);
  const [deleting, setDeleting] = useState<Notebook | null>(null);

  const openCreate = useCallback(() => setCreating(true), []);
  const openRename = useCallback((nb: Notebook) => setRenaming(nb), []);
  const openDelete = useCallback((nb: Notebook) => setDeleting(nb), []);

  const closeCreate = useCallback(() => setCreating(false), []);
  const closeRename = useCallback(() => setRenaming(null), []);
  const closeDelete = useCallback(() => setDeleting(null), []);

  const submitCreate = async (input: NotebookCreateInput) => {
    try {
      await createNotebook(input);
      closeCreate();
      toast.success('Notebook created', { description: input.name });
    } catch (e) {
      onError(errorText(e));
    }
  };

  const submitRename = async (name: string) => {
    if (!renaming) return;
    try {
      await updateNotebook(renaming, { name });
      closeRename();
      toast.success('Notebook renamed', { description: name });
    } catch (e) {
      onError(errorText(e));
    }
  };

  const submitDelete = async () => {
    if (!deleting) return;
    try {
      await deleteNotebook(deleting);
      closeDelete();
      toast.success('Notebook deleted', { description: deleting.name });
    } catch (e) {
      onError(errorText(e));
    }
  };

  return {
    creating,
    renaming,
    deleting,
    openCreate,
    openRename,
    openDelete,
    closeCreate,
    closeRename,
    closeDelete,
    submitCreate,
    submitRename,
    submitDelete,
  };
}
