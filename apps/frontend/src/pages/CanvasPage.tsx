import { Fragment, createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { useNavigate, useParams, useSearchParams } from 'react-router-dom';
import { Blocks, Code, Globe, Image as ImageIcon, MessageSquareQuote, Sigma, StickyNote, Table as TableIcon, Workflow } from 'lucide-react';
import {
  AssetToolbarItem,
  ArrowToolbarItem,
  createShapeId,
  DefaultMainMenu,
  DefaultPageMenu,
  DefaultToolbar,
  DefaultToolbarContent,
  DefaultZoomMenu,
  DefaultZoomMenuContent,
  DrawToolbarItem,
  EraserToolbarItem,
  FrameToolbarItem,
  HandToolbarItem,
  HighlightToolbarItem,
  LineToolbarItem,
  NoteToolbarItem,
  SelectToolbarItem,
  TextToolbarItem,
  Tldraw,
  TldrawUiMenuGroup,
  TldrawUiMenuItem,
  TldrawUiToolbarButton,
  useEditor,
  useValue,
  DefaultFontStyle,
  tipTapDefaultExtensions,
  type Editor as TldrawEditor,
} from 'tldraw';
import 'tldraw/tldraw.css';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { SidebarInset, SidebarProvider } from '@/components/ui/sidebar';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { ContextualStylePanel } from '@/features/canvas/components/contextual-style-panel';
import { CanvasSidebar } from '@/features/canvas/components/canvas-sidebar';
import { CanvasTopBar } from '@/features/canvas/components/canvas-top-bar';
import { PageFrameStack } from '@/features/canvas/components/page-frame-stack';
import { ComponentsTool } from '@/features/canvas/components-tool';
import { CanvasRichTextToolbar } from '@/features/canvas/canvas-rich-text-toolbar';
import { CodeBlockUtil } from '@/features/canvas/code-block/code-block-shape';
import { SvgDiagramUtil } from '@/features/canvas/svg-diagram/svg-diagram-shape';
import { MathInline, pasteTextWithMath, revealMathAtPoint } from '@/features/canvas/math-extension';
import { MathBlockUtil } from '@/features/canvas/math-extension/math-block-shape';
import { CalloutCardUtil } from '@/features/canvas/card';
import { registerTablePaste, TableUtil } from '@/features/canvas/table-shape';
import { ColorMark } from '@/features/canvas/color-mark';
import { ShapesToolbarItem } from '@/features/canvas/components/shapes-menu';
import { exportChapterToPdf } from '@/features/canvas/export-pdf';
import { ViewModeContext, useViewMode } from '@/features/canvas/view-mode';
import { TEXT_BASE_PX, type ToolId } from '@/constants/presets/catalog';
import { normalizeConfig } from '@/lib/preset-config';
import { useUiPresetStore } from '@/stores/ui-preset-store';
import { PortalSlot } from '@/features/canvas/components/portal-slot';
import {
  TOPIC_DELETE,
  TOPIC_DUPLICATE,
  TOPIC_RENAME,
  type TopicMenuAction,
} from '@/features/canvas/components/topic-menu';
import {
  SHEET_GAP,
  useChapterCanvas,
  type CanvasDeeplink,
} from '@/features/canvas/hooks/use-chapter-canvas';
import { api, type Chapter, type Notebook, type Topic, type UiPreset } from '@/lib/ipc';
import { RouteError } from '@/pages/route-error';

/** Route: '/chapters/:chapterId'. Loads the chapter and its notebook (and the
 * UI preset the chapter was created with), then mounts the canvas shell.
 * Deep-link entry params ('topic', 'v') come from the search string and are
 * written back as the camera moves. */
export function CanvasPage() {
  const { chapterId } = useParams();
  const navigate = useNavigate();
  const [loaded, setLoaded] = useState<{ notebook: Notebook; chapter: Chapter } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const setPresetConfig = useUiPresetStore((s) => s.setConfig);

  useEffect(() => {
    let cancelled = false;
    setLoaded(null);
    setError(null);
    setPresetConfig(null);
    (async () => {
      try {
        const chapter = await api.loadChapter(chapterId!);
        const notebook = await api.loadNotebook(chapter.notebook_id);
        if (cancelled) return;
        setLoaded({ notebook, chapter });
        if (chapter.ui_preset_id) {
          const preset = await api.loadUiPreset(chapter.ui_preset_id);
          if (!cancelled) setPresetConfig(normalizeConfig(preset.config));
        }
      } catch (e) {
        if (!cancelled) setError(e instanceof Error ? e.message : String(e));
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [chapterId, setPresetConfig]);

  if (error) {
    return (
      <RouteError
        title="Chapter not found"
        message={error}
        onBack={() => navigate('/')}
        backLabel="Back to notebooks"
      />
    );
  }
  if (!loaded) {
    return <div className="flex h-screen items-center justify-center text-muted-foreground">Loading…</div>;
  }
  // the provider must wrap the shell: CanvasShell reads useSidebar to re-fit
  // the sheets when the sidebar toggles
  return (
    <SidebarProvider>
      <CanvasShell key={loaded.chapter.id} notebook={loaded.notebook} chapter={loaded.chapter} />
    </SidebarProvider>
  );
}

/**
 * The components picker, shown while the Components tool is active. Escape
 * or clicking anywhere outside the menu (or picking any other tool)
 * deactivates the tool and closes the picker.
 */
function ComponentsMenu() {
  const editor = useEditor();
  const menuRef = useRef<HTMLDivElement | null>(null);

  // close on outside clicks: deactivate the tool so the menu unmounts
  useEffect(() => {
    const onPointerDown = (e: PointerEvent) => {
      const target = e.target as Element | null;
      if (!target) return;
      if (menuRef.current?.contains(target)) return;
      // the toolbar's own toggle button handles itself
      if (target.closest?.('[data-testid="toolbar.components"]')) return;
      editor.setCurrentTool('select');
    };
    document.addEventListener('pointerdown', onPointerDown, true);
    return () => document.removeEventListener('pointerdown', onPointerDown, true);
  }, [editor]);

  // Escape exits the tool (closes the menu)
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') editor.setCurrentTool('select');
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [editor]);

  /// Drop a code block at the center of the current viewport.
  function createCodeBlock() {
    const bounds = editor.getViewportPageBounds();
    editor.run(() => {
      editor.createShape({
        type: 'code-block',
        x: Math.round(bounds.center.x - 280),
        y: Math.round(bounds.center.y - 100),
      });
    });
    editor.setCurrentTool('select');
  }

  /// Drop an SVG diagram at the center of the current viewport.
  function createSvgDiagram() {
    const bounds = editor.getViewportPageBounds();
    editor.run(() => {
      editor.createShape({
        type: 'svg-diagram',
        x: Math.round(bounds.center.x - 180),
        y: Math.round(bounds.center.y - 112),
      });
    });
    editor.setCurrentTool('select');
  }

  /// Drop an equation at the center of the viewport and open its LaTeX editor.
  function createMathEquation() {
    const bounds = editor.getViewportPageBounds();
    const id = createShapeId();
    editor.run(() => {
      editor.createShape({
        id,
        type: 'math-block',
        x: Math.round(bounds.center.x - 140),
        y: Math.round(bounds.center.y - 60),
      });
      editor.select(id);
    });
    editor.setCurrentTool('select');
    editor.setEditingShape(id);
  }

  /// Drop a table at the center of the current viewport.
  function createTable() {
    const bounds = editor.getViewportPageBounds();
    editor.run(() => {
      editor.createShape({
        type: 'table',
        x: Math.round(bounds.center.x - 280),
        y: Math.round(bounds.center.y - 100),
      });
    });
    editor.setCurrentTool('select');
  }

  /// Drop a callout card at the center of the current viewport.
  function createCard() {
    const bounds = editor.getViewportPageBounds();
    editor.run(() => {
      editor.createShape({
        type: 'callout-card',
        x: Math.round(bounds.center.x - 230),
        y: Math.round(bounds.center.y - 65),
      });
    });
    editor.setCurrentTool('select');
  }

  return createPortal(
    <div
      ref={menuRef}
      data-testid="components-menu"
      className="tlui-menu absolute bottom-16 z-10 rounded-xl border border-line bg-surface p-1 shadow-xl"
      style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 4, width: 240, left: 'calc(50% + 170px)' }}
    >
      {(
        [
          ['Sticky note', false],
          ['Code block', true],
          ['SVG diagram', true],
          ['Table', true],
          ['Card', true],
          ['Image', false],
          ['Embed', false],
          ['Katex', true],
        ] as const
      ).map(([name, enabled]) => {
        const Icon = {
          'Sticky note': StickyNote,
          'Code block': Code,
          'SVG diagram': Workflow,
          Table: TableIcon,
          Card: MessageSquareQuote,
          Image: ImageIcon,
          Embed: Globe,
          Katex: Sigma,
        }[name];
        return (
          <button
            key={name}
            disabled={!enabled}
            title={enabled ? name : 'Coming soon'}
            onClick={() => {
              if (name === 'Code block') createCodeBlock();
              else if (name === 'SVG diagram') createSvgDiagram();
              else if (name === 'Katex') createMathEquation();
              else if (name === 'Table') createTable();
              else if (name === 'Card') createCard();
            }}
            className="flex flex-col items-center gap-1 rounded-lg px-2 py-3 text-xs text-muted-foreground enabled:text-ink enabled:hover:bg-raised disabled:cursor-not-allowed"
          >
            <Icon className="h-5 w-5" />
            {name}
          </button>
        );
      })}
    </div>,
    editor.getContainer(),
  );
}

/**
 * tldraw's default rich-text extensions plus inline math and per-word color.
 * Module scope so the array identity never changes: tldraw recreates its
 * editor when the `textOptions` prop changes, and a fresh editor on every
 * render leaves the canvas stuck behind its font-loading screen.
 */
const RICH_TEXT_EXTENSIONS = [...tipTapDefaultExtensions, MathInline, ColorMark];

/**
 * When tldraw begins editing a shape at a click point, and that point lands on
 * a rendered formula in the label, the formula must show its real `$latex$`
 * string right away. The rich text editor mounts a frame or two after
 * `place-caret`, so poll for it briefly before doing the hit test.
 */
function attachEditReveal(editor: TldrawEditor) {
  let raf = 0;
  editor.on('place-caret', ({ shapeId, point }) => {
    cancelAnimationFrame(raf);
    let tries = 0;
    const tick = () => {
      if (tries++ > 90) return;
      const rte = editor.getRichTextEditor();
      if (!rte) {
        raf = requestAnimationFrame(tick);
        return;
      }
      if (editor.getEditingShapeId() === shapeId) revealMathAtPoint(rte, point);
    };
    raf = requestAnimationFrame(tick);
  });
}

/**
 * Slot that carries the chapter's zoom menu into the toolbar. tldraw renders
 * the Toolbar from its components map, so the zoom control travels through a
 * context rather than a prop: the Toolbar component itself must keep a stable
 * identity, otherwise React remounts it (and tldraw's whole UI provider) on
 * every render.
 */
const ZoomSlotContext = createContext<React.ReactNode>(null);

/** Stable toolbar override; reads the zoom slot and renders the pill. */
function ToolbarOverride() {
  const zoomMenu = useContext(ZoomSlotContext);
  // view mode: no chrome, just the sheets
  if (useViewMode()) return null;
  return <PresetToolbar zoomMenu={zoomMenu} />;
}

/** Per-tool toolbar buttons, keyed by preset tool id. */
const TOOL_ITEMS: Partial<Record<ToolId, () => React.JSX.Element>> = {
  select: SelectToolbarItem,
  hand: HandToolbarItem,
  draw: DrawToolbarItem,
  eraser: EraserToolbarItem,
  arrow: ArrowToolbarItem,
  text: TextToolbarItem,
  note: NoteToolbarItem,
  image: AssetToolbarItem,
  // one trigger that opens the shape picker (click a shape to create it)
  shape: ShapesToolbarItem,
  line: LineToolbarItem,
  highlight: HighlightToolbarItem,
  frame: FrameToolbarItem,
};

/**
 * Toolbar override following tldraw's add-tool-to-example. When the
 * chapter has a UI preset, the default tools are replaced by the preset's
 * enabled tools in its saved order; otherwise tldraw's default content
 * renders. The Components button sits at the toolbar's 4th place and the
 * canvas-zoom readout closes the row behind a hairline divider so the whole
 * row stays one pill.
 */
function PresetToolbar({ zoomMenu }: { zoomMenu?: React.ReactNode }) {
  const editor = useEditor();
  const config = useUiPresetStore((s) => s.config);
  const isActive = useValue(
    'components tool active',
    () => editor.getCurrentToolId() === 'components',
    [editor],
  );
  // idle dimming: the pill fades to 20% unless the pointer is over it or a
  // drawing tool (anything other than select) is active
  const [hovered, setHovered] = useState(false);
  const isSelectTool = useValue(
    'toolbar idle',
    () => editor.getCurrentToolId() === 'select',
    [editor],
  );
  const dimmed = !hovered && !isActive && isSelectTool;

  // apply the preset's defaults: font for new shapes, and M-size for new text
  // (tldraw's text base is 24px, so scale = px / 24)
  useEffect(() => {
    if (!config) return;
    editor.setStyleForNextShapes(DefaultFontStyle, config.fonts.default);
    const off = editor.sideEffects.registerBeforeCreateHandler('shape', (shape) => {
      if (shape.type !== 'text') return shape;
      return { ...shape, props: { ...(shape.props as object), scale: config.sizes.p / TEXT_BASE_PX } };
    });
    return off;
  }, [editor, config]);

  const componentsVisible =
    config ? config.toolbar.find((t) => t.id === 'components')?.visible !== false : true;
  const tools = config
    ? config.toolbar
        .filter((t) => t.visible && TOOL_ITEMS[t.id])
        .map((t) => TOOL_ITEMS[t.id]!)
    : null;

  const componentsButton = componentsVisible ? (
    <TldrawUiToolbarButton
      type="tool"
      title="Components"
      data-testid="toolbar.components"
      isActive={isActive}
      // toggle, reading the live tool id (a captured `isActive` can be stale
      // after Escape closes the menu mid-render)
      onClick={() =>
        editor.setCurrentTool(editor.getCurrentToolId() === 'components' ? 'select' : 'components')
      }
    >
      <Blocks className="h-5 w-5" />
    </TldrawUiToolbarButton>
  ) : null;

  // the Components entry sits at the 4th place in the toolbar: after the
  // first three tool buttons (preset-ordered); when there are three or fewer
  // preset tools it closes the row. tldraw's default content block cannot be
  // interleaved, so without a preset it lands right after it.
  let toolNodes: React.ReactNode[];
  if (tools) {
    toolNodes = [];
    let componentsPlaced = false;
    tools.forEach((Item, i) => {
      if (i === 3 && componentsButton) {
        toolNodes.push(<Fragment key="components">{componentsButton}</Fragment>);
        componentsPlaced = true;
      }
      toolNodes.push(<Item key={`tool-${i}`} />);
    });
    if (componentsButton && !componentsPlaced) {
      toolNodes.push(<Fragment key="components">{componentsButton}</Fragment>);
    }
  } else {
    toolNodes = [<DefaultToolbarContent key="default" />, ...(componentsButton ? [<Fragment key="components">{componentsButton}</Fragment>] : [])];
  }

  return (
    <div
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      style={{ opacity: dimmed ? 0.2 : 1, transition: 'opacity 150ms ease-out' }}
    >
    <DefaultToolbar>
      {toolNodes}
      {isActive && componentsButton && <ComponentsMenu />}
      {zoomMenu && (
        <div className="oort-toolbar__zoom">
          <span className="oort-toolbar__zoom-divider" aria-hidden />
          {zoomMenu}
        </div>
      )}
    </DefaultToolbar>
    </div>
  );
}

function CanvasShell({ notebook, chapter }: { notebook: Notebook; chapter: Chapter }) {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const [renaming, setRenaming] = useState<Topic | null>(null);
  const [confirmDelete, setConfirmDelete] = useState<Topic | null>(null);
  const [settingsOpen, setSettingsOpen] = useState(false);
  // the settings card closes when a click lands outside of it
  const settingsCardRef = useRef<HTMLDivElement | null>(null);
  useEffect(() => {
    if (!settingsOpen) return;
    const onPointerDown = (e: PointerEvent) => {
      const target = e.target as Element | null;
      if (!target) return;
      if (settingsCardRef.current?.contains(target)) return;
      // the toolbar's settings button toggles the card itself
      if (target.closest?.('[data-settings-toggle]')) return;
      setSettingsOpen(false);
    };
    document.addEventListener('pointerdown', onPointerDown, true);
    return () => document.removeEventListener('pointerdown', onPointerDown, true);
  }, [settingsOpen]);
  const [uiPresets, setUiPresets] = useState<UiPreset[]>([]);
  const [chapterPresetId, setChapterPresetId] = useState<string>(chapter.ui_preset_id ?? '');
  const setPresetConfig = useUiPresetStore((st) => st.setConfig);

  // load the presets list whenever the settings panel opens
  useEffect(() => {
    if (!settingsOpen) return;
    api.listUiPresets().then(setUiPresets).catch(() => setUiPresets([]));
  }, [settingsOpen]);

  /// Switch the chapter's UI preset live (also persisted for future sessions).
  async function handleApplyPreset(id: string) {
    setChapterPresetId(id);
    if (!id) {
      setPresetConfig(null);
    } else {
      const preset = await api.loadUiPreset(id);
      setPresetConfig(normalizeConfig(preset.config));
    }
    api.setChapterUiPreset(chapter.id, id || null).catch((e) => console.error('preset apply failed', e));
  }
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

  // ---- view mode (page chapters): no chrome, just the sheets, arrow-key
  // navigation. The editor goes readonly so clicks select but never edit.
  const [viewMode, setViewMode] = useState(false);
  const [exporting, setExporting] = useState(false);
  const [exportError, setExportError] = useState<string | null>(null);
  const activeTopic = topics.find((t) => t.id === activeTopicId) ?? null;
  // the keydown handler reads the index through a ref so the listener
  // doesn't need to re-bind on every page flip
  const pageIndexRef = useRef(activePageIndex);
  pageIndexRef.current = activePageIndex;

  const toggleViewMode = useCallback(() => {
    if (!isPageChapter) return;
    setViewMode((open) => !open);
  }, [isPageChapter]);

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

  // ---- PDF export: the open topic's sheet stack, one PDF page per sheet
  const handleExportPdf = useCallback(() => {
    const editor = getEditor();
    if (!editor || !isPageChapter || !chapter.page_width || !chapter.page_height) return;
    setExportError(null);
    setExporting(true);
    exportChapterToPdf(editor, {
      pageWidth: chapter.page_width,
      pageHeight: chapter.page_height,
      sheetCount: Math.max(activePages.length, 1),
      gap: SHEET_GAP,
      fileName: activeTopic ? activeTopic.name : chapter.name,
    })
      .catch((e) => setExportError(e instanceof Error ? e.message : String(e)))
      .finally(() => setExporting(false));
  }, [getEditor, isPageChapter, chapter.page_width, chapter.page_height, chapter.name, activePages.length, activeTopic]);


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

  const pageMenuSlotRef = useRef<HTMLDivElement | null>(null);
  const mainMenuSlotRef = useRef<HTMLDivElement | null>(null);

  // tldraw's own menus in the top bar slots, plus the contextual style
  // toolbar over the selection. In page chapters the native page menu is
  // meaningless (sheets are regions of one canvas), so the top bar gets our
  // topic dropdown instead and the zoom menu gains a "Fit page" entry.
  const ZoomMenu = useCallback(() => {
    if (!isPageChapter) return <DefaultZoomMenu />;
    return (
      <DefaultZoomMenu>
        <DefaultZoomMenuContent />
        <TldrawUiMenuGroup id="oort-fit-group">
          <TldrawUiMenuItem
            id="oort-fit-screen"
            label="Fit screen"
            onSelect={() => applyFitMode('screen')}
            noClose
          />
          <TldrawUiMenuItem
            id="oort-fit-page"
            label="Fit page"
            onSelect={() => applyFitMode('page')}
            noClose
          />
        </TldrawUiMenuGroup>
      </DefaultZoomMenu>
    );
  }, [isPageChapter, applyFitMode]);
  // the zoom readout lives inside the toolbar pill (handed to it through the
  // slot above), and tldraw's navigation-panel zoom menu is switched off so
  // there is only one zoom control. The components map is stable: every entry
  // is module scope or a ref-only closure.
  const zoomSlot = useMemo(() => <ZoomMenu />, [ZoomMenu]);
  // stable identity: tldraw keys its editor on this prop (see
  // RICH_TEXT_EXTENSIONS above)
  const textOptions = useMemo(() => ({ tipTapConfig: { extensions: RICH_TEXT_EXTENSIONS } }), []);
  const components = useMemo(
    () => ({
      MenuPanel: () => (
        <>
          <PortalSlot slotRef={mainMenuSlotRef}>
            <DefaultMainMenu />
          </PortalSlot>
          <PortalSlot slotRef={pageMenuSlotRef}>
            <DefaultPageMenu />
          </PortalSlot>
        </>
      ),
      StylePanel: null,
      InFrontOfTheCanvas: ContextualStylePanel,
      RichTextToolbar: CanvasRichTextToolbar,
      Toolbar: ToolbarOverride,
      ZoomMenu: null,
    }),
    [],
  );

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
      {!viewMode && (
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
        {!viewMode && (
          <CanvasTopBar
            notebookName={notebook.name}
            pageMenuSlotRef={pageMenuSlotRef}
            mainMenuSlotRef={mainMenuSlotRef}
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
                    onExportPdf: handleExportPdf,
                    exporting,
                    onToggleView: toggleViewMode,
                  }
                : null
            }
            onOpenSettings={() => setSettingsOpen((o) => !o)}
          />
        )}

        <div ref={canvasAreaRef} className="relative min-h-0 flex-1">
          {error && (
            <div className="absolute left-1/2 top-4 z-20 -translate-x-1/2 rounded-lg bg-red-950/90 px-4 py-2 text-sm text-red-300 shadow-lg backdrop-blur">
              {error}
            </div>
          )}
          {exportError && (
            <div className="absolute left-1/2 top-4 z-30 -translate-x-1/2 rounded-lg bg-red-950/90 px-4 py-2 text-sm text-red-300 shadow-lg backdrop-blur">
              PDF export failed: {exportError}
            </div>
          )}

          <ViewModeContext.Provider value={viewMode}>
          <div className="oort-editor absolute inset-0">
            <ZoomSlotContext.Provider value={zoomSlot}>
              <Tldraw
                tools={[ComponentsTool]}
                shapeUtils={[CodeBlockUtil, SvgDiagramUtil, MathBlockUtil, TableUtil, CalloutCardUtil]}
                // extend tldraw's rich text with inline math: $E=mc^2$ and
                // $$\int_0^1 x dx$$ render via KaTeX while editing, measuring
                // and exporting (defaults must be spread in: passing
                // extensions replaces tldraw's list wholesale)
                textOptions={textOptions}
                onMount={(editor) => {
                  handleMount(editor);
                  attachEditReveal(editor);
                  // text pasted onto the canvas runs table detection first,
                  // then math detection, then tldraw's default text handler
                  registerTablePaste(editor, (content) => pasteTextWithMath(editor, content));
                }}
                components={components}
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

          {/* view mode chrome: a minimal exit hint — the arrow keys flip pages */}
          {viewMode && (
            <div className="pointer-events-none absolute bottom-6 left-1/2 z-30 -translate-x-1/2">
              <div className="rounded-full bg-surface px-4 py-1.5 text-xs text-muted-foreground shadow-lg">
                View — <kbd className="font-medium text-ink">↑ ↓</kbd> flip pages ·{' '}
                <kbd className="font-medium text-ink">Esc</kbd> exit
              </div>
            </div>
          )}

          {/* settings card: closes when clicking outside of it (the toolbar's
              settings button toggles it itself, so it's excluded) */}
          {settingsOpen && (
            <div
              ref={settingsCardRef}
              className="absolute right-4 top-14 z-30 w-64 rounded-xl border border-line bg-surface p-4 shadow-xl"
            >
              <div className="mb-3 text-sm font-semibold">Settings</div>
              {isPageChapter && (
                <>
                  <label className="mb-1.5 block text-[13px] font-medium text-muted-foreground">
                    Page padding (px)
                  </label>
                  <Input
                    type="number"
                    min={0}
                    max={200}
                    value={pagePadding}
                    onChange={(e) => handlePaddingChange(Number(e.target.value))}
                  />
                  <p className="mt-2 text-xs text-muted-foreground">
                    Gap between the sheet and the viewport edges. Sheets always stay
                    centered in the available area.
                  </p>
                  <label className="mb-1.5 mt-4 block text-[13px] font-medium text-muted-foreground">
                    Content boundary (px)
                  </label>
                  <Input
                    type="number"
                    min={0}
                    max={200}
                    value={contentInset}
                    onChange={(e) => handleInsetChange(Number(e.target.value))}
                  />
                  <p className="mt-2 text-xs text-muted-foreground">
                    Inner margin of the sheet: how close shapes and text may come
                    to the page edge before they clamp and wrap.
                  </p>
                </>
              )}
              <label className="mb-1.5 mt-4 block text-[13px] font-medium text-muted-foreground">
                UI preset
              </label>
              <Select
                value={chapterPresetId || 'none'}
                onValueChange={(v) => {
                  if (v === null) return;
                  void handleApplyPreset(v === 'none' ? '' : v);
                }}
              >
                <SelectTrigger className="w-full">
                  <SelectValue placeholder="tldraw defaults" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">tldraw defaults</SelectItem>
                  {uiPresets.map((p) => (
                    <SelectItem key={p.id} value={p.id}>
                      {p.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <p className="mt-2 text-xs text-muted-foreground">
                Applies this preset to the chapter immediately and keeps it for
                future sessions. Manage presets in Settings → Presets.
              </p>
            </div>
          )}

        </div>
      </SidebarInset>

      {renaming && (
        <RenameTopicDialog
          topic={renaming}
          onClose={() => setRenaming(null)}
          onRename={(name) => {
            renameTopic(renaming, name);
            setRenaming(null);
          }}
        />
      )}

      <AlertDialog open={confirmDelete !== null} onOpenChange={(open) => !open && setConfirmDelete(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete "{confirmDelete?.name}"?</AlertDialogTitle>
            <AlertDialogDescription>
              The topic's canvas page and everything on it is removed. This
              cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => {
                if (confirmDelete) deleteTopic(confirmDelete);
                setConfirmDelete(null);
              }}
            >
              Delete topic
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}

function RenameTopicDialog({
  topic,
  onClose,
  onRename,
}: {
  topic: Topic;
  onClose: () => void;
  onRename: (name: string) => void;
}) {
  const [name, setName] = useState(topic.name);

  return (
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="sm:max-w-[400px]">
        <DialogHeader>
          <DialogTitle>Rename topic</DialogTitle>
        </DialogHeader>
        <Input
          value={name}
          onChange={(e) => setName(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter' && name.trim()) onRename(name);
          }}
          autoFocus
        />
        <DialogFooter>
          <Button variant="ghost" onClick={onClose}>
            Cancel
          </Button>
          <Button disabled={!name.trim() || name.trim() === topic.name} onClick={() => onRename(name)}>
            Rename
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
