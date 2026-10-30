import { useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { ChevronLeft, ChevronRight, Plus } from 'lucide-react';
import { Tldraw } from 'tldraw';
import { getAssetUrlsByImport } from '@tldraw/assets/imports.vite';

/** tldraw's static assets (toolbar icons, embed icons, shape fonts,
 *  translations) bundled INTO the app instead of tldraw's public CDN — the
 *  CDN default makes the canvas chrome render without any icons whenever
 *  the desktop exe runs offline. `imports.vite` imports each file with
 *  `?url`, so Vite hashes and emits them inside dist/ for Tauri to ship. */
const ASSET_URLS = getAssetUrlsByImport();
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
import { AiChatPanel, AiConfirmCard } from '@/features/ai/components/ai-chat-panel';
import { useAiStore } from '@/features/ai/ai-store';
import { AiCanvasPrompt } from '@/features/ai/components/ai-canvas-prompt';
import { AiGhostLayer } from '@/features/ai/components/ai-ghost-layer';
import { useAiBridge } from '@/features/ai/use-ai-bridge';
import { AiBusyPill } from '@/features/ai/components/ai-busy-pill';
import { ZoomSlotContext } from '@/components/global/canvas/PresetToolbar';
import { CanvasSettingsCard } from '@/components/global/canvas/CanvasSettingsCard';
import { ViewModeHint } from '@/components/global/canvas/ViewModeHint';
import { useChapterCanvas, SHEET_GAP, type CanvasDeeplink } from '@/hooks/canvas/use-chapter-canvas';
import { useChapterPreset } from '@/hooks/canvas/use-chapter-preset';
import { usePageView } from '@/hooks/canvas/use-page-view';
import { useCanvasUi } from '@/hooks/canvas/use-canvas-ui';
import { oortShortcutOverrides } from '@/features/canvas/app-shortcut-overrides';
import { canvasUiState } from '@/features/canvas/canvas-ui-state';
import { appCombo } from '@/lib/platform';
import type { Chapter, Notebook } from '@/lib/ipc';
import { isTauri } from '@tauri-apps/api/core';

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
    aiPages,
    getEditor,
  } = useChapterCanvas(chapter, paddingRef, deeplink, insetRef);

  const isPageChapter = chapter.canvas_type === 'page';
  const activeTopic = topics.find((t) => t.id === activeTopicId) ?? null;

  // AI bridge: desktop only — pins this chapter as the AI's canvas and
  // answers the backend's `canvas:call` tool invocations. The context makes
  // pages-mode geometry (sheet size/count) visible to the tool executors;
  // the pages capability lets `add_page` extend the sheet stacks.
  useAiBridge(
    chapter.id,
    getEditor,
    () => ({
      canvas_type: chapter.canvas_type,
      page:
        isPageChapter && chapter.page_width && chapter.page_height
          ? {
              width: chapter.page_width,
              height: chapter.page_height,
              gap: SHEET_GAP,
              count: activePages.length,
            }
          : null,
    }),
    aiPages,
  );

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

  // mirror the settings card's open state for the dialog-registered tldraw
  // shortcut actions (whose window-level capture handlers only run through
  // this component); plain object write — no re-render involved
  useEffect(() => {
    canvasUiState.settingsOpen = settingsOpen;
  }, [settingsOpen]);

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
  // Cross-platform notes: both Cmd (mac) and Ctrl (win/linux) are accepted
  // via `appCombo`, and AltGraph (which IS Ctrl+Alt on international
  // Windows/Linux layouts) is inside that check so AltGr+I composing é/§
  // etc. never opens the dialog. The match is ALSO on `e.code` so
  // international layouts keep working: on many of them ctrl+alt is AltGr
  // and the reported `e.key` is a composed character other than `i`, while
  // the physical key stays KeyI. Capture phase + stopPropagation so tldraw
  // never sees the combo; typing contexts (cell editors, words, own dialog
  // inputs) stay untouched, and "cmd+i" (no alt) keeps italic.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const isI = e.code === 'KeyI' || e.key.toLowerCase() === 'i';
      if (!isI || !appCombo(e) || !e.altKey) return;
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

  // page view mode: page chapters only. Same cross-platform modifier model
  // as the icon finder above (Ctrl or Cmd + Alt, AltGraph-safe). Capture
  // phase + stopPropagation so tldraw never sees it; typing contexts stay
  // untouched, and the combo also works while IN view mode (whose header is
  // hidden) to exit back — mirrors the Icon finder handler, including the
  // AltGr-safe `e.code` match.
  useEffect(() => {
    if (!isPageChapter) return;
    const onKey = (e: KeyboardEvent) => {
      const isV = e.code === 'KeyV' || e.key.toLowerCase() === 'v';
      if (!isV || !appCombo(e) || !e.altKey || e.shiftKey) return;
      const t = e.target as HTMLElement | null;
      if (t && (t.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(t.tagName))) return;
      const ed = getEditor();
      if (!ed || (!pageView.viewMode && (settingsOpen || ed.getEditingShapeId()))) return;
      e.preventDefault();
      e.stopPropagation();
      pageView.toggleViewMode();
    };
    window.addEventListener('keydown', onKey, true);
    return () => window.removeEventListener('keydown', onKey, true);
  }, [isPageChapter, getEditor, pageView.viewMode, pageView.toggleViewMode, settingsOpen]);

  // the AI chat panel keyboard command: ctrl/cmd+alt+A toggles the chat
  // overlay (desktop only). Same capture-phase + e.code pattern as the icon
  // finder above, with the shared AltGr-safe `appCombo` modifier check so
  // tldraw never sees the combo and international AltGr always wins.
  useEffect(() => {
    if (!isTauri()) return;
    const onKey = (e: KeyboardEvent) => {
      const isA = e.code === 'KeyA' || e.key.toLowerCase() === 'a';
      if (!isA || !appCombo(e) || !e.altKey) return;
      const t = e.target as HTMLElement | null;
      if (t && (t.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(t.tagName))) return;
      const ed = getEditor();
      if (!ed || ed.getEditingShapeId()) return;
      e.preventDefault();
      e.stopPropagation();
      useAiStore.getState().toggle();
    };
    window.addEventListener('keydown', onKey, true);
    return () => window.removeEventListener('keydown', onKey, true);
  }, [getEditor]);

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
        <div className="relative flex h-dvh w-full flex-col overflow-hidden bg-canvas">
        <IconFinder open={iconsOpen} onClose={() => useIconFinderStore.getState().setOpen(false)} />
        {!pageView.viewMode && (
          <CanvasTopBar
            chapterName={chapter.name}
            pageMenuSlotRef={ui.pageMenuSlotRef}
            mainMenuSlotRef={ui.mainMenuSlotRef}
            /* header strip (name / topic / ⋮) only on page chapters —
               infinite canvases stay clean, keeping Back + Settings chips */
            strip={isPageChapter}
            onOpenSettings={() => setSettingsOpen((o) => !o)}
            onBack={() => navigate(`/notebooks/${notebook.id}`)}
            onOpenAi={isTauri() ? () => useAiStore.getState().toggle() : undefined}
          />
        )}

        <div ref={pageView.canvasAreaRef} className="relative min-h-0 flex-1">
          {error && (
            <div className="absolute left-1/2 top-4 z-20 -translate-x-1/2 rounded-lg bg-red-950/90 px-4 py-2 text-sm text-red-300 shadow-lg backdrop-blur">
              {error}
            </div>
          )}

          <ViewModeContext.Provider value={pageView.viewMode}>
            {/* chapter-type class lets CSS tune the canvas backdrop: infinite
                canvases read the same dimmed tone the page-stack bands
                produce around page sheets, so both look alike */}
            <div className={`oort-editor absolute inset-0 ${isPageChapter ? 'oort-pages' : 'oort-infinite'}`}>
              <ZoomSlotContext.Provider value={ui.zoomSlot}>
                <Tldraw
                  tools={[ComponentsTool]}
                  shapeUtils={[CodeBlockUtil, SvgDiagramUtil, MathBlockUtil, TableUtil, CalloutCardUtil, IconUtil]}
                  overrides={oortShortcutOverrides}
                  assetUrls={ASSET_URLS}
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

          {/* AI overlays: the chat panel and the destructive-tool confirm
              card (rendered outside the panel so deletes are confirmable
              even while the panel is closed). The working pill is canvas-
              wide: it reports tool execution even when the panel is closed. */}
          {!pageView.viewMode && isTauri() && (
            <>
              <AiChatPanel />
              <AiConfirmCard />
              {/* right-click → "AI help…": floating anchored prompt */}
              <AiCanvasPrompt getEditor={getEditor} />
              {/* glowing ghosts at the exact size/placement of what the AI
                  is creating (executor-predicted boxes) */}
              <AiGhostLayer getEditor={getEditor} />
              <AiBusyPill />
            </>
          )}

          {/* page pager: a floating chip at the bottom-right corner — page
              nav lives beside the canvas content instead of the hover
              chrome, so paging is always one hop away */}
          {!pageView.viewMode && isPageChapter && activePages.length > 0 && (
            <div className="pointer-events-auto absolute bottom-3 right-3 z-30 flex items-center gap-0.5 rounded-lg border border-line bg-raised px-1 py-0.5 shadow-[0_2px_10px_rgba(0,0,0,0.35)]">
              <button
                title="Previous page"
                onClick={() => goToSheet(activePageIndex - 1)}
                disabled={activePageIndex === 0}
                className="rounded-md p-1.5 text-muted-foreground transition-colors hover:bg-raised hover:text-foreground disabled:opacity-30 disabled:hover:bg-transparent"
              >
                <ChevronLeft className="h-3 w-3" />
              </button>
              <span className="min-w-10 text-center text-xs tabular-nums text-ink">
                {activePageIndex + 1} / {activePages.length}
              </span>
              <button
                title="Next page"
                onClick={() => goToSheet(activePageIndex + 1)}
                disabled={activePageIndex >= activePages.length - 1}
                className="rounded-md p-1.5 text-muted-foreground transition-colors hover:bg-raised hover:text-foreground disabled:opacity-30 disabled:hover:bg-transparent"
              >
                <ChevronRight className="h-3 w-3" />
              </button>
              <button
                title="Add page"
                onClick={addSheet}
                className="rounded-md p-1.5 text-muted-foreground transition-colors hover:bg-raised hover:text-foreground"
              >
                <Plus className="h-4 w-4" />
              </button>
            </div>
          )}

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
