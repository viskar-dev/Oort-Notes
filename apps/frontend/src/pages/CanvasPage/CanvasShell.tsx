import { useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { Tldraw } from 'tldraw';
import { CodeBlockUtil } from '@/features/canvas/code-block/code-block-shape';
import { SvgDiagramUtil } from '@/features/canvas/svg-diagram/svg-diagram-shape';
import { MathBlockUtil } from '@/features/canvas/math-extension/math-block-shape';
import { pasteTextWithMath } from '@/features/canvas/math-extension';
import { registerTablePaste, TableUtil } from '@/features/canvas/table-shape';
import { attachEditReveal } from '@/features/canvas/rich-text-setup';
import { CalloutCardUtil } from '@/features/canvas/card';
import { createIconShapeAt, IconUtil } from '@/features/canvas/icon-shape';
import { ComponentsTool } from '@/features/canvas/components-tool';
import { IconFinder } from '@/features/canvas/components/icon-finder';
import { useIconFinderStore } from '@/stores/icon-finder-store';
import { PageFrameStack } from '@/features/canvas/components/page-frame-stack';
import { ViewModeContext } from '@/features/canvas/view-mode';
import { CanvasTopBar } from '@/features/canvas/components/canvas-top-bar';
import { ZoomSlotContext } from '@/components/global/canvas/PresetToolbar';
import { CanvasSettingsCard } from '@/components/global/canvas/CanvasSettingsCard';
import { ViewModeHint } from '@/components/global/canvas/ViewModeHint';
import { useChapterCanvas, SHEET_GAP, type CanvasDeeplink } from '@/hooks/canvas/use-chapter-canvas';
import { useChapterPreset } from '@/hooks/canvas/use-chapter-preset';
import { usePageView } from '@/hooks/canvas/use-page-view';
import { useCanvasUi } from '@/hooks/canvas/use-canvas-ui';
import type { Chapter, Notebook } from '@/lib/ipc';

/** The mounted canvas: top bar, tldraw editor and its slots. Pure composition
 *  — data and behavior come from hooks/features. */
export function CanvasShell({ notebook, chapter }: { notebook: Notebook; chapter: Chapter }) {
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
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
    applyFitMode,
    refit,
    goToSheet,
    addSheet,
    getEditor,
  } = useChapterCanvas(chapter, paddingRef, deeplink, insetRef);

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
  const iconsOpen = useIconFinderStore((s) => s.open);

  // dropping icon-finder results on the canvas: capture-phase listeners on
  // the canvas area so they run before tldraw's own drop handling and keep
  // external text drops (table paste etc.) untouched
  useEffect(() => {
    const el = pageView.canvasAreaRef.current;
    if (!el) return;
    const hasIcon = (e: DragEvent) => !!e.dataTransfer?.types.includes('application/x-oort-icon');
    const over = (e: DragEvent) => {
      if (!hasIcon(e) || !e.dataTransfer) return;
      e.preventDefault();
      e.stopPropagation();
      e.dataTransfer.dropEffect = 'copy';
    };
    const drop = (e: DragEvent) => {
      const id = e.dataTransfer?.getData('application/x-oort-icon');
      if (!id) return;
      const ed = getEditor();
      // view mode hides every editing affordance, including this flow
      if (!ed || pageView.viewMode) return;
      e.preventDefault();
      e.stopPropagation();
      createIconShapeAt(ed, id, ed.screenToPage({ x: e.clientX, y: e.clientY }));
    };
    el.addEventListener('dragover', over, true);
    el.addEventListener('drop', drop, true);
    return () => {
      el.removeEventListener('dragover', over, true);
      el.removeEventListener('drop', drop, true);
    };
  }, [getEditor, pageView.viewMode]);

  // the icon finder keyboard command: ctrl/cmd+alt+I toggles the dialog.
  // Capture phase + stopPropagation so tldraw never sees the combo; typing
  // contexts (cell editors, words, own dialog inputs) stay untouched, and
  // "cmd+i" (no alt) keeps italic.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key.toLowerCase() !== 'i' || !(e.ctrlKey || e.metaKey) || !e.altKey) return;
      const t = e.target as HTMLElement | null;
      if (t && (t.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(t.tagName))) return;
      const ed = getEditor();
      if (!ed || pageView.viewMode || settingsOpen || ed.getEditingShapeId()) return;
      e.preventDefault();
      e.stopPropagation();
      const store = useIconFinderStore.getState();
      store.setOpen(!store.open);
    };
    window.addEventListener('keydown', onKey, true);
    return () => window.removeEventListener('keydown', onKey, true);
  }, [getEditor, pageView.viewMode, settingsOpen]);

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

  return (
    <>
      <div className="flex h-dvh w-full flex-col overflow-hidden bg-canvas">
        <IconFinder open={iconsOpen} onClose={() => useIconFinderStore.getState().setOpen(false)} />
        {!pageView.viewMode && (
          <CanvasTopBar
            chapterName={chapter.name}
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
            onBack={() => navigate(`/notebooks/${notebook.id}`)}
            onOpenIcons={pageView.viewMode ? undefined : () => useIconFinderStore.getState().setOpen(true)}
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
                  shapeUtils={[CodeBlockUtil, SvgDiagramUtil, MathBlockUtil, TableUtil, CalloutCardUtil, IconUtil]}
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
      </div>
    </>
  );
}
