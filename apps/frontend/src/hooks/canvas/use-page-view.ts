import { useCallback, useEffect, useRef, useState } from 'react';
import type { Editor } from 'tldraw';
import { exportChapterToPdf } from '@/features/canvas/export-pdf';
import { useExportStore } from '@/stores/export-store';
import { useViewModeStore } from '@/stores/view-mode-store';
import { SHEET_GAP, type FitMode } from '@/hooks/canvas/use-chapter-canvas';
import type { Chapter, Topic } from '@/lib/ipc';
import { errorText } from '@/lib/utils';

interface PageViewParams {
  chapter: Chapter;
  isPageChapter: boolean;
  activeTopic: Topic | null;
  /** index of the open sheet (used by the arrow-key navigation) */
  activePageIndex: number;
  activePageCount: number;
  getEditor: () => Editor | null;
  applyFitMode: (mode: FitMode) => void;
  goToSheet: (index: number) => void;
  refit: () => void;
}

/** Page-chapter view mode: chrome-free readonly sheets with arrow-key
 *  navigation, plus the PDF export of the open topic's sheet stack and the
 *  debounced resize re-fit so sidebar toggles and window resizes keep the
 *  sheet centered. */
export function usePageView({
  chapter,
  isPageChapter,
  activeTopic,
  activePageIndex,
  activePageCount,
  getEditor,
  applyFitMode,
  goToSheet,
  refit,
}: PageViewParams) {
  const [viewMode, setViewMode] = useState(false);
  const [exporting, setExporting] = useState(false);
  const [exportError, setExportError] = useState<string | null>(null);

  // the keydown handler reads the index through a ref so the listener
  // doesn't need to re-bind on every page flip
  const pageIndexRef = useRef(activePageIndex);
  pageIndexRef.current = activePageIndex;

  const toggleViewMode = useCallback(() => {
    if (!isPageChapter) return;
    setViewMode((open) => !open);
  }, [isPageChapter]);

  // the ⋮ menu's Preferences submenu reads view mode through its store
  // (menu components mount inside the editor without chapter props)
  const setViewModeContext = useViewModeStore((s) => s.setContext);
  useEffect(() => {
    if (!isPageChapter) {
      setViewModeContext(null);
      return;
    }
    setViewModeContext({ on: viewMode, toggle: toggleViewMode });
    return () => setViewModeContext(null);
  }, [setViewModeContext, isPageChapter, viewMode, toggleViewMode]);

  // enter/exit view mode: readonly + page fit. Deliberately depends on
  // nothing but the mode: a re-run mid-view would toggle readonly and refit
  // the camera on every unrelated render (a flicker feedback loop)
  useEffect(() => {
    if (!isPageChapter || !viewMode) return;
    const editor = getEditor();
    if (!editor) return;
    editor.updateInstanceState({ isReadonly: true });
    applyFitMode('page');
    return () => {
      editor.updateInstanceState({ isReadonly: false });
      applyFitMode('screen');
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isPageChapter, viewMode]);

  // arrow keys flip between sheets; Esc exits
  useEffect(() => {
    if (!isPageChapter || !viewMode) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        setViewMode(false);
        return;
      }
      if (e.key === 'ArrowDown' || e.key === 'ArrowRight' || e.key === 'PageDown' || e.key === ' ') {
        e.preventDefault();
        goToSheet(pageIndexRef.current + 1);
      } else if (e.key === 'ArrowUp' || e.key === 'ArrowLeft' || e.key === 'PageUp') {
        e.preventDefault();
        goToSheet(pageIndexRef.current - 1);
      } else if (e.key === 'Home') {
        e.preventDefault();
        goToSheet(0);
      } else if (e.key === 'End') {
        e.preventDefault();
        goToSheet(Number.MAX_SAFE_INTEGER);
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [isPageChapter, viewMode, goToSheet]);

  // PDF export: the open topic's sheet stack, one PDF page per sheet. The
  // ⋮ menu's and right-click menu's "Export as" → PDF rows go through here;
  // errors surface through the same canvas toast as before.
  const handleExportPdf = useCallback(() => {
    const editor = getEditor();
    if (!editor || !isPageChapter || !chapter.page_width || !chapter.page_height) return;
    setExportError(null);
    setExporting(true);
    exportChapterToPdf(editor, {
      pageWidth: chapter.page_width,
      pageHeight: chapter.page_height,
      sheetCount: Math.max(activePageCount, 1),
      gap: SHEET_GAP,
      fileName: activeTopic ? activeTopic.name : chapter.name,
    })
      .catch((e) => setExportError(errorText(e)))
      .finally(() => setExporting(false));
  }, [getEditor, isPageChapter, chapter.page_width, chapter.page_height, chapter.name, activePageCount, activeTopic]);

  // tldraw's menu components mount inside the editor with no chapter props,
  // so the export capability travels through the export store (the PDF rows
  // tldraw's "Export as" submenus read it from there)
  const setExportContext = useExportStore((s) => s.setContext);
  const setStoreBusy = useExportStore((s) => s.setBusy);
  useEffect(() => {
    const supported = isPageChapter && !!chapter.page_width && !!chapter.page_height;
    if (!supported) {
      setExportContext(null);
      return;
    }
    setExportContext({ enabled: true, run: handleExportPdf });
    return () => setExportContext(null);
  }, [setExportContext, handleExportPdf, isPageChapter, chapter.page_width, chapter.page_height]);
  useEffect(() => setStoreBusy(exporting), [setStoreBusy, exporting]);

  // the sheet centers itself in whatever area it has: observe the canvas
  // area's size so sidebar toggles, window resizes and layout shifts all
  // trigger a re-fit (debounced past tldraw's own viewport update)
  const canvasAreaRef = useRef<HTMLDivElement | null>(null);
  useEffect(() => {
    if (!isPageChapter) return;
    const el = canvasAreaRef.current;
    if (!el) return;
    let timer: ReturnType<typeof setTimeout> | undefined;
    const ro = new ResizeObserver(() => {
      clearTimeout(timer);
      timer = setTimeout(refit, 120);
    });
    ro.observe(el);
    return () => {
      ro.disconnect();
      clearTimeout(timer);
    };
  }, [isPageChapter, refit]);

  return { viewMode, toggleViewMode, exporting, exportError, handleExportPdf, canvasAreaRef };
}
