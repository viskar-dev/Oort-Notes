import { useNavigate, useParams } from 'react-router-dom';
import { RouteError } from '@/pages/route-error';
import { ConfirmAlertDialog } from '@/components/global/common/ConfirmAlertDialog';
import { NotebookRenameDialog } from '@/components/global/notebooks/NotebookRenameDialog';
import { NotebookDeleteDialog } from '@/components/global/notebooks/NotebookDeleteDialog';
import { APP_CONTAINER, WorkspaceLayout } from '@/components/layout/workspace-layout';
import { ChaptersHeader } from '@/components/global/chapters/ChaptersHeader';
import { ChaptersPanel } from '@/components/global/chapters/ChaptersPanel';
import { TopicsPanel } from '@/components/global/chapters/TopicsPanel';
import { ChapterCreateDialog } from '@/components/global/chapters/ChapterCreateDialog';
import { ChapterRenameDialog } from '@/components/global/chapters/ChapterRenameDialog';
import { TopicCreateForm } from '@/components/forms/TopicCreateForm';
import { useNotebookOverview } from '@/hooks/chapters/use-notebook-overview';
import { useChapterDialogs } from '@/hooks/chapters/use-chapter-dialogs';

/** Route: '/notebooks/:notebookId'. Notebooks-home shell with a two-panel
 *  chapters list / topics list. */
export function ChaptersPage() {
  const { notebookId } = useParams();
  const navigate = useNavigate();

  const data = useNotebookOverview(notebookId!);
  const dialogs = useChapterDialogs({
    renameNotebook: data.renameNotebook,
    renameChapter: data.renameChapter,
    deleteChapter: data.deleteChapter,
    deleteNotebook: data.deleteNotebook,
    onError: data.setError,
  });

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
      <div className="flex min-h-screen items-center justify-center bg-[#060608] text-[#8b8a96]">
        Loading…
      </div>
    );
  }

  return (
    <WorkspaceLayout
      search={{
        value: data.search,
        onChange: data.setSearch,
        placeholder: 'Search chapters and topics',
      }}
      crumbs={[{ label: 'Notebooks', to: '/' }, { label: notebook.name }]}
    >
      <ChaptersHeader
        notebook={notebook}
        chapters={data.chapters}
        totalTopics={data.totalTopics}
        onRename={dialogs.openRenameNotebook}
        onDelete={() => dialogs.setDeletingNotebook(notebook)}
      />

      {data.error && (
        <div className={`${APP_CONTAINER} mt-4`}>
          <div className="rounded-lg border border-[#24232c] bg-[#111016] px-4 py-3 text-sm text-[#f87171]">
            {data.error}
          </div>
        </div>
      )}

      <div className={`${APP_CONTAINER} mb-16 mt-8 flex flex-1 items-start gap-6`}>
        <ChaptersPanel
          items={data.filteredChapters}
          selectedId={data.selected?.id ?? null}
          hasSearch={data.search.trim() !== ''}
          onSelect={data.setSelectedId}
          onCreate={dialogs.openCreateChapter}
          onRename={dialogs.setRenamingChapter}
          onDelete={dialogs.setDeletingChapter}
        />

        <TopicsPanel
          chapter={data.selected}
          topics={data.filteredTopics}
          chapterIndex={data.chapterIndex}
          hasSearch={data.search.trim() !== ''}
          noChapters={data.filteredChapters?.length === 0}
          onCreateTopic={() => dialogs.setCreatingTopic(true)}
        />
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
