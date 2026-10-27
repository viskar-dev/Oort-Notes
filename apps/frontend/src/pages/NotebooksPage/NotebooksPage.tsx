import { useCallback, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import type { Notebook } from '@/lib/ipc';
import { errorText } from '@/lib/utils';
import { HOME_CONTAINER, WorkspaceLayout } from '@/components/layout/workspace-layout';
import { NotebooksHeader } from '@/components/global/notebooks/NotebooksHeader';
import { NotebookFilterRow } from '@/components/global/notebooks/NotebookFilterRow';
import { NotebookCard } from '@/components/global/notebooks/NotebookCard';
import { NotebookRow } from '@/components/global/notebooks/NotebookRow';
import { NotebookEmptyState } from '@/components/global/notebooks/NotebookEmptyState';
import { NotebookCreateDialog } from '@/components/global/notebooks/NotebookCreateDialog';
import { NotebookRenameDialog } from '@/components/global/notebooks/NotebookRenameDialog';
import { NotebookDeleteDialog } from '@/components/global/notebooks/NotebookDeleteDialog';
import { useNotebookList, type NotebookFlagChanges } from '@/hooks/notebooks/use-notebook-list';
import { useNotebookDialogs } from '@/hooks/notebooks/use-notebook-dialogs';
import { toast } from 'sonner';

/** Route: '/'. The notebooks home — search (server-side, debounced), filter
 *  tabs, sort, view mode and the whole notebook lifecycle via dialogs. */
export function NotebooksPage() {
  const navigate = useNavigate();

  const list = useNotebookList();
  const dialogs = useNotebookDialogs({
    createNotebook: list.createNotebook,
    updateNotebook: list.updateNotebook,
    deleteNotebook: list.deleteNotebook,
    onError: (message) => toast.error('Notebook action failed', { description: message }),
  });

  // presentation-only view state: same data and handlers in two skins
  const [view, setView] = useState<'list' | 'grid'>('list');

  const handleUpdate = useCallback(async (nb: Notebook, flags: NotebookFlagChanges) => {
    try {
      await list.updateNotebook(nb, flags);
      toast.success('Notebook updated', { description: nb.name });
    } catch (e) {
      toast.error('Could not update notebook', { description: errorText(e) });
    }
  }, [list]);

  const clearFilters = useCallback(() => {
    list.setSearch('');
    list.setFilter('all');
  }, [list]);

  const notebooks = list.notebooks ?? [];
  const totalChapters = notebooks.reduce((acc, n) => acc + n.chapters_count, 0);
  const hasQuery = list.search.trim() !== '';

  const search = {
    value: list.search,
    onChange: list.setSearch,
    placeholder: 'Filter notebooks...',
  };

  return (
    <WorkspaceLayout
      container={HOME_CONTAINER}
      crumbs={[{ label: 'Notebooks' }]}
      showFooter={false}
      syncDot
    >
      {/* section stagger: header → controls → list */}
      <div className="animate-[fadeUp_240ms_ease-out_both]" style={{ animationDelay: '0ms' }}>
        <NotebooksHeader
          loaded={list.notebooks !== null}
          notebookCount={notebooks.length}
          chapterCount={totalChapters}
          onCreate={dialogs.openCreate}
        />
      </div>

      {list.error && (
        <div className={`${HOME_CONTAINER} mt-4`}>
          <div className="rounded-lg border border-white/[0.08] bg-white/[0.03] px-4 py-3 text-sm text-[#f87171]">
            {list.error}
          </div>
        </div>
      )}

      <div className="animate-[fadeUp_240ms_ease-out_both]" style={{ animationDelay: '40ms' }}>
        <NotebookFilterRow
          filter={list.filter}
          sort={list.sort}
          search={search}
          view={view}
          onViewChange={setView}
          count={list.notebooks === null ? undefined : notebooks.length}
          onFilterChange={list.setFilter}
          onSortChange={list.setSort}
        />
      </div>

      <div className={`${HOME_CONTAINER} animate-[fadeUp_240ms_ease-out_both]`} style={{ animationDelay: '80ms' }}>
        {/* skeleton loading */}
        {list.notebooks === null && (
          <div className="mt-8 flex flex-col">
            {Array.from({ length: 6 }, (_, i) => (
              <div key={i}>
                <div className="h-16 rounded-lg bg-white/[0.03]" />
                <div className="hairline my-0.5" aria-hidden />
              </div>
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

        {/* list body */}
        {list.notebooks !== null && notebooks.length > 0 && view === 'list' && (
          <div className="mt-8 pb-24">
            {notebooks.map((nb) => (
              <NotebookRow
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
          </div>
        )}

        {/* grid body */}
        {list.notebooks !== null && notebooks.length > 0 && view === 'grid' && (
          <div className="mt-4 grid grid-cols-[repeat(auto-fill,minmax(220px,1fr))] gap-3 pb-24">
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
