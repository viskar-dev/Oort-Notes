import { useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { Plus } from 'lucide-react';
import type { Notebook } from '@/lib/ipc';
import { errorText } from '@/lib/utils';
import { APP_CONTAINER, WorkspaceLayout } from '@/components/layout/workspace-layout';
import { NotebooksHeader } from '@/components/global/notebooks/NotebooksHeader';
import { NotebookFilterRow } from '@/components/global/notebooks/NotebookFilterRow';
import { NotebookCard } from '@/components/global/notebooks/NotebookCard';
import { NotebookEmptyState } from '@/components/global/notebooks/NotebookEmptyState';
import { NotebookCreateDialog } from '@/components/global/notebooks/NotebookCreateDialog';
import { NotebookRenameDialog } from '@/components/global/notebooks/NotebookRenameDialog';
import { NotebookDeleteDialog } from '@/components/global/notebooks/NotebookDeleteDialog';
import { useNotebookList, type NotebookFlagChanges } from '@/hooks/notebooks/use-notebook-list';
import { useNotebookDialogs } from '@/hooks/notebooks/use-notebook-dialogs';

/** Route: '/'. The notebooks home — search (server-side, debounced), filter
 *  tabs, sort and the whole notebook lifecycle via dialogs. */
export function NotebooksPage() {
  const navigate = useNavigate();

  const list = useNotebookList();
  const dialogs = useNotebookDialogs({
    createNotebook: list.createNotebook,
    updateNotebook: list.updateNotebook,
    deleteNotebook: list.deleteNotebook,
    onError: list.setError,
  });

  const handleUpdate = useCallback(async (nb: Notebook, flags: NotebookFlagChanges) => {
    try {
      await list.updateNotebook(nb, flags);
    } catch (e) {
      list.setError(errorText(e));
    }
  }, [list]);

  const clearFilters = useCallback(() => {
    list.setSearch('');
    list.setFilter('all');
  }, [list]);

  const notebooks = list.notebooks ?? [];
  const totalChapters = notebooks.reduce((acc, n) => acc + n.chapters_count, 0);
  const hasQuery = list.search.trim() !== '';

  return (
    <WorkspaceLayout
      search={{ value: list.search, onChange: list.setSearch, placeholder: 'Search notebooks' }}
      crumbs={[{ label: 'Notebooks' }]}
    >
      <NotebooksHeader
        loaded={list.notebooks !== null}
        notebookCount={notebooks.length}
        chapterCount={totalChapters}
        onCreate={dialogs.openCreate}
      />

      {list.error && (
        <div className={`${APP_CONTAINER} mt-4`}>
          <div className="rounded-lg border border-[#24232c] bg-[#111016] px-4 py-3 text-sm text-[#f87171]">
            {list.error}
          </div>
        </div>
      )}

      <NotebookFilterRow
        filter={list.filter}
        sort={list.sort}
        onFilterChange={list.setFilter}
        onSortChange={list.setSort}
      />

      <div className={APP_CONTAINER}>
        {/* skeleton loading */}
        {list.notebooks === null && (
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
        {list.notebooks !== null && notebooks.length === 0 && (
          <NotebookEmptyState
            filter={list.filter}
            hasQuery={hasQuery}
            onClearFilters={clearFilters}
            onOpenCreate={dialogs.openCreate}
          />
        )}

        {/* grid */}
        {list.notebooks !== null && notebooks.length > 0 && (
          <div className="mt-8 grid grid-cols-[repeat(auto-fill,minmax(264px,1fr))] gap-x-8 gap-y-10 pb-20">
            {notebooks.map((nb) => (
              <NotebookCard
                key={nb.id}
                notebook={nb}
                filter={list.filter}
                onOpen={() => navigate(`/notebooks/${nb.id}`)}
                onRename={() => dialogs.openRename(nb)}
                onToggleFavorite={() => handleUpdate(nb, { isFavorite: !nb.is_favorite })}
                onToggleArchive={() => handleUpdate(nb, { archived: nb.archived_at === null })}
                onDelete={() => dialogs.openDelete(nb)}
              />
            ))}

            {/* dashed "New notebook" tile */}
            <button
              onClick={dialogs.openCreate}
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

      {dialogs.creating && (
        <NotebookCreateDialog onCreate={dialogs.submitCreate} onClose={dialogs.closeCreate} />
      )}
      {dialogs.renaming && (
        <NotebookRenameDialog
          notebook={dialogs.renaming}
          onRename={dialogs.submitRename}
          onClose={dialogs.closeRename}
        />
      )}
      {dialogs.deleting && (
        <NotebookDeleteDialog
          notebook={dialogs.deleting}
          onDelete={dialogs.submitDelete}
          onClose={dialogs.closeDelete}
        />
      )}
    </WorkspaceLayout>
  );
}
