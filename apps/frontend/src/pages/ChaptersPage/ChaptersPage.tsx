import { useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { RouteError } from '@/pages/route-error';
import { ConfirmAlertDialog } from '@/components/global/common/ConfirmAlertDialog';
import { NotebookRenameDialog } from '@/components/global/notebooks/NotebookRenameDialog';
import { NotebookDeleteDialog } from '@/components/global/notebooks/NotebookDeleteDialog';
import {
  HOME_CONTAINER,
  WorkspaceLayout,
} from '@/components/layout/workspace-layout';
import { ChaptersHeader } from '@/components/global/chapters/ChaptersHeader';
import { ChaptersPanel } from '@/components/global/chapters/ChaptersPanel';
import { TopicsPanel } from '@/components/global/chapters/TopicsPanel';
import { ChapterCreateDialog } from '@/components/global/chapters/ChapterCreateDialog';
import { ChapterRenameDialog } from '@/components/global/chapters/ChapterRenameDialog';
import { TopicCreateForm } from '@/components/forms/TopicCreateForm';
import { useNotebookOverview } from '@/hooks/chapters/use-notebook-overview';
import { toast } from 'sonner';
import { useChapterDialogs } from '@/hooks/chapters/use-chapter-dialogs';

/** Route: '/notebooks/:notebookId'. The notebook screen: page header with the
 *  notebook ⋮ menu, then a T layout — one hairline under the header meeting
 *  the vertical line between the chapters column and the topics column. */
export function ChaptersPage() {
  const { notebookId } = useParams();
  const navigate = useNavigate();

  const data = useNotebookOverview(notebookId!);
  const dialogs = useChapterDialogs({
    renameNotebook: data.renameNotebook,
    renameChapter: data.renameChapter,
    deleteChapter: data.deleteChapter,
    deleteNotebook: data.deleteNotebook,
    onError: (message) => toast.error('Action failed', { description: message }),
  });

  // presentational sidebar state (collapse toggle lives here so the grid and
  // both panels move together); no app data or URL state involved
  const [collapsed, setCollapsed] = useState(false);

  if (data.loadError) {
    return (
      <RouteError
        title="Notebook not found"
        message={data.loadError}
        onBack={() => navigate('/')}
        backLabel="Back to notebooks"
      />
    );
  }
  const notebook = data.notebook;
  if (!notebook) {
    return (
      <div className="flex min-h-screen items-center justify-center text-fg-3">Loading…</div>
    );
  }

  return (
    <WorkspaceLayout
      container={HOME_CONTAINER}
      crumbs={[{ label: 'Notebooks', to: '/' }, { label: notebook.name }]}
      showFooter={false}
      syncDot
    >
      <div className="animate-[fadeUp_240ms_ease-out_both]">
        <ChaptersHeader
          notebook={notebook}
          chapters={data.chapters}
          totalTopics={data.totalTopics}
          search={{
            value: data.search,
            onChange: data.setSearch,
            placeholder: 'Search topics',
          }}
          onRename={dialogs.openRenameNotebook}
          onDelete={() => dialogs.setDeletingNotebook(notebook)}
        />
      </div>

      {data.error && (
        <div className={`${HOME_CONTAINER} mt-4`}>
          <div className="rounded-lg border border-white/[0.08] bg-white/[0.03] px-4 py-3 text-sm text-[#f87171]">
            {data.error}
          </div>
        </div>
      )}

      {/* <768px: chapters become horizontally scrolling selection chips */}
      <div className={`${HOME_CONTAINER} md:hidden`}>
        {data.chapters && data.chapters.length > 0 && (
          <div className="flex gap-2 overflow-x-auto pb-4">
            {data.chapters.map((chapter, i) => (
              <button
                key={chapter.id}
                onClick={() => data.setSelectedId(chapter.id)}
                aria-pressed={chapter.id === data.selected?.id}
                className={`h-8 shrink-0 truncate rounded-lg px-3 text-sm transition-colors duration-150 ${
                  chapter.id === data.selected?.id
                    ? 'bg-white/[0.06] text-fg-1'
                    : 'text-fg-2 hover:text-fg-1'
                }`}
              >
                <span className="mr-2 text-xs text-fg-3 tabular-nums">{i + 1}</span>
                {chapter.name}
              </button>
            ))}
          </div>
        )}
      </div>

      {/* flex child instead of a vh-math min-height: the column above this
          grid (navbar + header) measures whatever it wants; flexbox hands
          this block exactly the remaining viewport so the page never
          overflows by a hair (scrollbars appeared for no visible reason) */}
      <div
        className="animate-[fadeUp_240ms_ease-out_both] flex min-h-0 flex-1 flex-col"
        style={{ animationDelay: '40ms' }}
      >
        <div
          className={`${HOME_CONTAINER} flex-1 border-t border-white/[0.06] grid grid-cols-1 transition-[grid-template-columns] duration-200 ease-out ${
            collapsed ? 'grid-cols-1' : 'md:grid-cols-[260px_minmax(0,1fr)]'
          }`}
        >
          {/* chapters column */}
          <div
            className={`hidden ${collapsed ? 'overflow-hidden opacity-0' : 'md:block'} overflow-hidden transition-[opacity] duration-200 ease-out ${
              collapsed ? '' : 'md:border-r md:border-white/[0.06] md:pr-6'
            }`}
          >
            <ChaptersPanel
              items={data.chapters}
              selectedId={data.selected?.id ?? null}
              onSelect={data.setSelectedId}
              onCreate={dialogs.openCreateChapter}
              onRename={dialogs.setRenamingChapter}
              onDelete={dialogs.setDeletingChapter}
              onCollapse={() => setCollapsed(true)}
            />
          </div>

          {/* topics column */}
          <div className="min-w-0 md:pl-10">
            <TopicsPanel
              chapter={data.selected}
              topics={data.filteredTopics}
              chapterIndex={data.chapterIndex}
              hasSearch={data.search.trim() !== ''}
              noChapters={data.chapters?.length === 0}
              onCreateTopic={() => dialogs.setCreatingTopic(true)}
              collapsed={collapsed}
              onExpand={() => setCollapsed(false)}
            />
          </div>
        </div>
      </div>

      {dialogs.creatingTopic && (
        <TopicCreateForm
          open
          onOpenChange={(open) => {
            if (!open) dialogs.setCreatingTopic(false);
          }}
          onCreate={data.createTopic}
        />
      )}

      {dialogs.creatingChapter && (
        <ChapterCreateDialog
          notebookId={notebook.id}
          onCreated={() => {
            dialogs.closeCreateChapter();
            data.reload();
          }}
          onClose={dialogs.closeCreateChapter}
        />
      )}

      {dialogs.renamingNotebook && (
        <NotebookRenameDialog
          notebook={notebook}
          onRename={dialogs.submitRenameNotebook}
          onClose={dialogs.closeRenameNotebook}
        />
      )}

      {dialogs.renamingChapter && (
        <ChapterRenameDialog
          chapter={dialogs.renamingChapter}
          onRename={dialogs.submitRenameChapter}
          onClose={() => dialogs.setRenamingChapter(null)}
        />
      )}

      <ConfirmAlertDialog
        open={dialogs.deletingChapter !== null}
        onOpenChange={(open) => !open && dialogs.setDeletingChapter(null)}
        title={`Delete "${dialogs.deletingChapter?.name}"?`}
        description="This removes the chapter and every topic and canvas in it. This cannot be undone."
        confirmLabel="Delete chapter"
        onConfirm={dialogs.submitDeleteChapter}
      />

      {dialogs.deletingNotebook && (
        <NotebookDeleteDialog
          notebook={dialogs.deletingNotebook}
          onDelete={dialogs.submitDeleteNotebook}
          onClose={() => dialogs.setDeletingNotebook(null)}
        />
      )}
    </WorkspaceLayout>
  );
}
