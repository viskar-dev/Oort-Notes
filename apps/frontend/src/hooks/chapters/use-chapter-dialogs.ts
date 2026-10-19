import { useCallback, useState } from 'react';
import type { Chapter, Notebook } from '@/lib/ipc';
import { errorText } from '@/lib/utils';

export interface ChapterDialogActions {
  renameNotebook: (name: string) => Promise<void>;
  renameChapter: (chapter: Chapter, name: string) => Promise<void>;
  deleteChapter: (chapter: Chapter) => Promise<void>;
  deleteNotebook: (nb: Notebook) => Promise<void>;
  onError: (message: string) => void;
}

/** The chapters-page dialog commands: which dialog is open and the submits
 *  that close them on success. Failures keep the dialog open (the create
 *  form shows its own error; the others surface through the page banner). */
export function useChapterDialogs({ renameNotebook, renameChapter, deleteChapter, deleteNotebook, onError }: ChapterDialogActions) {
  const [creatingChapter, setCreatingChapter] = useState(false);
  const [creatingTopic, setCreatingTopic] = useState(false);
  const [renamingNotebook, setRenamingNotebook] = useState(false);
  const [renamingChapter, setRenamingChapter] = useState<Chapter | null>(null);
  const [deletingChapter, setDeletingChapter] = useState<Chapter | null>(null);
  const [deletingNotebook, setDeletingNotebook] = useState<Notebook | null>(null);

  const openCreateChapter = useCallback(() => setCreatingChapter(true), []);
  const closeCreateChapter = useCallback(() => setCreatingChapter(false), []);
  const openRenameNotebook = useCallback(() => setRenamingNotebook(true), []);
  const closeRenameNotebook = useCallback(() => setRenamingNotebook(false), []);

  const submitRenameNotebook = async (name: string) => {
    try {
      await renameNotebook(name);
      setRenamingNotebook(false);
    } catch (e) {
      onError(errorText(e));
    }
  };

  const submitRenameChapter = async (name: string) => {
    if (!renamingChapter) return;
    try {
      await renameChapter(renamingChapter, name);
      setRenamingChapter(null);
    } catch (e) {
      onError(errorText(e));
    }
  };

  const submitDeleteChapter = async () => {
    if (!deletingChapter) return;
    try {
      await deleteChapter(deletingChapter);
      setDeletingChapter(null);
    } catch (e) {
      onError(errorText(e));
    }
  };

  // on success the hook navigates home; no dialog to tidy up
  const submitDeleteNotebook = async () => {
    if (!deletingNotebook) return;
    try {
      await deleteNotebook(deletingNotebook);
    } catch (e) {
      onError(errorText(e));
    }
  };

  return {
    creatingChapter,
    creatingTopic,
    setCreatingTopic,
    renamingNotebook,
    renamingChapter,
    deletingChapter,
    deletingNotebook,
    openCreateChapter,
    closeCreateChapter,
    openRenameNotebook,
    closeRenameNotebook,
    setRenamingChapter,
    setDeletingChapter,
    setDeletingNotebook,
    submitRenameNotebook,
    submitRenameChapter,
    submitDeleteChapter,
    submitDeleteNotebook,
  };
}
