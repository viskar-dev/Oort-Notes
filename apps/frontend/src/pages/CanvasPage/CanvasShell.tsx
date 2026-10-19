import { useMemo, useRef, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { Tldraw } from 'tldraw';
import { CodeBlockUtil } from '@/features/canvas/code-block/code-block-shape';
import { SvgDiagramUtil } from '@/features/canvas/svg-diagram/svg-diagram-shape';
import { MathBlockUtil } from '@/features/canvas/math-extension/math-block-shape';
import { pasteTextWithMath } from '@/features/canvas/math-extension';
import { registerTablePaste, TableUtil } from '@/features/canvas/table-shape';
import { attachEditReveal } from '@/features/canvas/rich-text-setup';
import { CalloutCardUtil } from '@/features/canvas/card';
import { ComponentsTool } from '@/features/canvas/components-tool';
import { PageFrameStack } from '@/features/canvas/components/page-frame-stack';
import { ViewModeContext } from '@/features/canvas/view-mode';
import {
  TOPIC_DELETE,
  TOPIC_DUPLICATE,
  TOPIC_RENAME,
  type TopicMenuAction,
} from '@/features/canvas/components/topic-menu';
import { CanvasSidebar } from '@/features/canvas/components/canvas-sidebar';
import { CanvasTopBar } from '@/features/canvas/components/canvas-top-bar';
import { ZoomSlotContext } from '@/components/global/canvas/PresetToolbar';
import { CanvasSettingsCard } from '@/components/global/canvas/CanvasSettingsCard';
import { ViewModeHint } from '@/components/global/canvas/ViewModeHint';
import { TopicRenameDialog } from '@/components/global/canvas/TopicRenameDialog';
import { ConfirmAlertDialog } from '@/components/global/common/ConfirmAlertDialog';
import { SidebarInset } from '@/components/ui/sidebar';
import { useChapterCanvas, SHEET_GAP, type CanvasDeeplink } from '@/hooks/canvas/use-chapter-canvas';
import { useChapterPreset } from '@/hooks/canvas/use-chapter-preset';
import { usePageView } from '@/hooks/canvas/use-page-view';
import { useCanvasUi } from '@/hooks/canvas/use-canvas-ui';
import type { Chapter, Notebook, Topic } from '@/lib/ipc';

/** The mounted canvas: sidebar, top bar, tldraw editor and its slots. Pure
 *  composition — data and behavior come from hooks/features. */
export function CanvasShell({ notebook, chapter }: { notebook: Notebook; chapter: Chapter }) {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const [renaming, setRenaming] = useState<Topic | null>(null);
  const [confirmDelete, setConfirmDelete] = useState<Topic | null>(null);
  const [settingsOpen, setSettingsOpen] = useState(false);

  // sheet geometry, persisted locally; the refs are shared with the canvas
  // hook so its fit logic reads them without re-binding
  const [pagePadding, setPagePadding] = useState(() => {
    const stored = Number(localStorage.getItem('oort:page-padding'));
    return Number.isFinite(stored) && stored >= 0 ? stored : 10;
  });
  const [contentInset, setContentInset] = useState(() => {
    const stored = Number(localStorage.getItem('oort:content-inset'));
    return Number.isFinite(stored) && stored >= 0 ? stored : 24;
  });
  const paddingRef = useRef(pagePadding);
  paddingRef.current = pagePadding;
  const insetRef = useRef(contentInset);
  insetRef.current = contentInset;

  const preset = useChapterPreset(chapter, settingsOpen);

  // deep links: the entry topic + camera come from the search string (used
  // by /t/:topicId links). The URL is NOT written back as the camera moves —
  // that caused a react-router re-render every 300ms mid-scroll.
  const deeplink: CanvasDeeplink = useMemo(
    () => ({
      initialTopicId: searchParams.get('topic'),
      initialViewport: searchParams.get('v'),
    }),
    [searchParams],
  );

  const {
    topics,
    activeTopicId,
    activePages,
    activePageIndex,
    error,
    handleMount,
    createTopic,
    selectTopic,
    applyFitMode,
    refit,
    goToSheet,
    addSheet,
    renameTopic,
    duplicateTopic,
    deleteTopic,
    getEditor,
  } = useChapterCanvas(chapter, paddingRef, deeplink, insetRef);

  const canDeleteTopic = topics.length > 1;
  const isPageChapter = chapter.canvas_type === 'page';
  const activeTopic = topics.find((t) => t.id === activeTopicId) ?? null;

  const pageView = usePageView({
    chapter,
    isPageChapter,
    activeTopic,
    activePageIndex,
    activePageCount: activePages.length,
    getEditor,
    applyFitMode,
    goToSheet,
    refit,
  });
  const ui = useCanvasUi({ isPageChapter, applyFitMode });

  function handlePaddingChange(value: number) {
    const clamped = Math.min(Math.max(Math.round(value) || 0, 0), 200);
    setPagePadding(clamped);
    localStorage.setItem('oort:page-padding', String(clamped));
    paddingRef.current = clamped;
    refit();
  }

  function handleInsetChange(value: number) {
    const clamped = Math.min(Math.max(Math.round(value) || 0, 0), 200);
    setContentInset(clamped);
    localStorage.setItem('oort:content-inset', String(clamped));
    insetRef.current = clamped;
  }

  function handleTopicAction(topic: Topic, action: TopicMenuAction) {
    switch (action) {
      case TOPIC_RENAME:
        setRenaming(topic);
        break;
      case TOPIC_DUPLICATE:
        duplicateTopic(topic);
        break;
      case TOPIC_DELETE:
        setConfirmDelete(topic);
        break;
    }
  }

  return (
    <>
      {!pageView.viewMode && (
        <CanvasSidebar
          notebook={notebook}
          topics={topics}
          activeTopicId={activeTopicId}
          canDeleteTopic={canDeleteTopic}
          onSelectTopic={selectTopic}
          onCreateTopic={createTopic}
          onTopicAction={handleTopicAction}
          onBack={() => navigate(`/notebooks/${notebook.id}`)}
        />
      )}

      <SidebarInset className="bg-canvas">
        {!pageView.viewMode && (
          <CanvasTopBar
            notebookName={notebook.name}
            pageMenuSlotRef={ui.pageMenuSlotRef}
            mainMenuSlotRef={ui.mainMenuSlotRef}
            pageControls={
              isPageChapter && activePages.length > 0
                ? {
                    index: activePageIndex,
                    count: activePages.length,
                    onPrev: () => goToSheet(activePageIndex - 1),
                    onNext: () => goToSheet(activePageIndex + 1),
                    onAdd: addSheet,
                  }
                : null
            }
            pageActions={
              isPageChapter && activePages.length > 0
                ? {
                    onExportPdf: pageView.handleExportPdf,
                    exporting: pageView.exporting,
                    onToggleView: pageView.toggleViewMode,
                  }
                : null
            }
            onOpenSettings={() => setSettingsOpen((o) => !o)}
          />
        )}

        <div ref={pageView.canvasAreaRef} className="relative min-h-0 flex-1">
          {error && (
            <div className="absolute left-1/2 top-4 z-20 -translate-x-1/2 rounded-lg bg-red-950/90 px-4 py-2 text-sm text-red-300 shadow-lg backdrop-blur">
              {error}
            </div>
          )}
          {pageView.exportError && (
            <div className="absolute left-1/2 top-4 z-30 -translate-x-1/2 rounded-lg bg-red-950/90 px-4 py-2 text-sm text-red-300 shadow-lg backdrop-blur">
              PDF export failed: {pageView.exportError}
            </div>
          )}

          <ViewModeContext.Provider value={pageView.viewMode}>
            <div className="oort-editor absolute inset-0">
              <ZoomSlotContext.Provider value={ui.zoomSlot}>
                <Tldraw
                  tools={[ComponentsTool]}
                  shapeUtils={[CodeBlockUtil, SvgDiagramUtil, MathBlockUtil, TableUtil, CalloutCardUtil]}
                  textOptions={ui.textOptions}
                  onMount={(editor) => {
                    handleMount(editor);
                    attachEditReveal(editor);
                    // text pasted onto the canvas runs table detection first,
                    // then math detection, then tldraw's default text handler
                    registerTablePaste(editor, (content) => pasteTextWithMath(editor, content));
                  }}
                  components={ui.components}
                >
                  {isPageChapter &&
                    chapter.page_width &&
                    chapter.page_height &&
                    activePages.length > 0 && (
                      <PageFrameStack
                        width={chapter.page_width}
                        height={chapter.page_height}
                        gap={SHEET_GAP}
                        count={activePages.length}
                      />
                    )}
                </Tldraw>
              </ZoomSlotContext.Provider>
            </div>
          </ViewModeContext.Provider>

          {pageView.viewMode && <ViewModeHint />}

          <CanvasSettingsCard
            open={settingsOpen}
            onClose={() => setSettingsOpen(false)}
            isPageChapter={isPageChapter}
            pagePadding={pagePadding}
            contentInset={contentInset}
            onPaddingChange={handlePaddingChange}
            onInsetChange={handleInsetChange}
            chapterPresetId={preset.chapterPresetId}
            uiPresets={preset.uiPresets}
            onApplyPreset={(id) => void preset.applyPreset(id)}
          />

        </div>
      </SidebarInset>

      {renaming && (
        <TopicRenameDialog
          topic={renaming}
          onClose={() => setRenaming(null)}
          onRename={async (name) => {
            if (renaming) renameTopic(renaming, name);
            setRenaming(null);
          }}
        />
      )}

      <ConfirmAlertDialog
        open={confirmDelete !== null}
        onOpenChange={(open) => !open && setConfirmDelete(null)}
        title={`Delete "${confirmDelete?.name}"?`}
        description="The topic's canvas page and everything on it is removed. This cannot be undone."
        confirmLabel="Delete topic"
        onConfirm={() => {
          if (confirmDelete) deleteTopic(confirmDelete);
          setConfirmDelete(null);
        }}
      />
    </>
  );
}
