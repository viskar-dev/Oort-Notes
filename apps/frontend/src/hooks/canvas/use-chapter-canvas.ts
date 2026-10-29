import { useCallback, useEffect, useRef, useState } from 'react';
import { getSnapshot, loadSnapshot, type Editor, type TLCamera, type TLPageId, type TLShape, type TLUnknownShape } from 'tldraw';
import { api, type Chapter, type Topic, type TopicPage } from '@/lib/ipc';
import { toast } from 'sonner';

// tldraw page ids are 'page:<uuid>'; in both chapter modes the uuid is the
// topic's own id (a 'page' chapter topic is a PDF-style stack of sheet
// regions inside ONE tldraw page, positioned by its topic_pages rows).
const PAGE_PREFIX = 'page:';
const AUTOSAVE_DEBOUNCE_MS = 800;
const PAGE_PADDING = 10;
const SHEET_INSET = 24;
/** World-space gap between stacked sheets of a multi-page topic. */
export const SHEET_GAP = 40;

export type FitMode = 'screen' | 'page';

function topicIdToPageId(topicId: string): TLPageId {
  return (PAGE_PREFIX + topicId) as TLPageId;
}

function pageIdToTopicId(pageId: string): string {
  return pageId.startsWith(PAGE_PREFIX) ? pageId.slice(PAGE_PREFIX.length) : pageId;
}

function toErrorMessage(err: unknown): string {
  return err instanceof Error ? err.message : String(err);
}

/**
 * A topic deep link: the entry topic (and camera) from the URL's search
 * params, read once on mount. The URL is never written back afterwards.
 */
export interface CanvasDeeplink {
  initialTopicId?: string | null;
  initialViewport?: string | null;
}

/**
 * Smooth wheel panning for the page chapters. tldraw applies every wheel
 * delta instantly (`immediate: true`), so a mouse wheel's ~100px ticks land
 * as visible jumps. Here the wheel is intercepted (capture phase, on the
 * container's parent so we run before tldraw's own listener) and the deltas
 * accumulate into a camera target that a rAF loop eases toward — the
 * existing camera-constraint side effect keeps every applied frame inside
 * the stack. ctrl+wheel / trackpad pinch passes through untouched (native
 * zoom).
 */
function setupSmoothWheelPanning(editor: Editor): { cleanup: () => void; cancel: () => void } {
  // capture on an ancestor: at the container element itself, listener order
  // is registration order and tldraw's would already have run
  const host = editor.getContainer().parentElement ?? editor.getContainer();
  let target: { x: number; y: number } | null = null;
  let raf = 0;

  const stop = () => {
    cancelAnimationFrame(raf);
    raf = 0;
    target = null;
  };

  const step = () => {
    if (!target) return;
    const cam = editor.getCamera();
    const nx = cam.x + (target.x - cam.x) * 0.3;
    const ny = cam.y + (target.y - cam.y) * 0.3;
    editor.setCamera({ x: nx, y: ny, z: cam.z }, { immediate: true });
    const applied = editor.getCamera();
    // the camera constraints refused part of the move (stack edge): align
    // the target with reality so the loop terminates
    if (Math.abs(applied.x - nx) > 0.01 || Math.abs(applied.y - ny) > 0.01) {
      target.x = applied.x;
      target.y = applied.y;
    }
    if (Math.abs(target.x - applied.x) < 0.5 && Math.abs(target.y - applied.y) < 0.5) {
      stop();
      return;
    }
    raf = requestAnimationFrame(step);
  };

  const onWheel = (e: WheelEvent) => {
    if (e.ctrlKey) return; // pinch / ctrl+wheel → tldraw's native zoom
    e.preventDefault();
    e.stopPropagation();
    const cam = editor.getCamera();
    if (!target) target = { x: cam.x, y: cam.y };
    const z = cam.z || 1;
    // mirror tldraw's normalizeWheel: deltas are negated, and shift+wheel is
    // horizontal on non-mac
    let dx = e.deltaX;
    let dy = e.deltaY;
    if (e.shiftKey && !/Mac|iPod|iPhone|iPad/.test(window.navigator.platform)) {
      dx = dy;
      dy = 0;
    }
    target.x -= dx / z;
    target.y -= dy / z;
    if (!raf) raf = requestAnimationFrame(step);
  };

  host.addEventListener('wheel', onWheel, { capture: true, passive: false });
  return {
    cleanup: () => {
      host.removeEventListener('wheel', onWheel, { capture: true } as EventListenerOptions);
      stop();
    },
    // drop the eased target without tearing the listener down — called by
    // programmatic camera fits (pager / fit toggle / refit) so their flush
    // position isn't dragged back by a still-running easing loop
    cancel: stop,
  };
}

function applyDeeplink(editor: Editor, deeplink?: CanvasDeeplink | null) {
  if (!deeplink?.initialTopicId) return false;
  if (!editor.getPage(topicIdToPageId(deeplink.initialTopicId))) return false;

  editor.setCurrentPage(topicIdToPageId(deeplink.initialTopicId));
  if (deeplink.initialViewport) {
    const [x, y, z] = deeplink.initialViewport.split(',').map(Number);
    if ([x, y, z].every(Number.isFinite)) {
      editor.setCamera({ x, y, z }, { immediate: true });
      return true;
    }
  }
  return false;
}

/**
 * One tldraw editor per chapter; one native tldraw page per topic.
 * In 'page' chapters the topic's tldraw page holds a vertical stack of
 * fixed-size sheet regions (one per topic_pages row) that scrolls and zooms
 * like a PDF viewer. Owns the chapter snapshot persistence (autosave) and
 * the sync between the editor and the database.
 */
export function useChapterCanvas(
  chapter: Chapter,
  pagePaddingRef?: { current: number },
  deeplink?: CanvasDeeplink,
  insetRef?: { current: number },
) {
  const isPageChapter = chapter.canvas_type === 'page';

  // keep the latest deeplink handlers reachable from mount-time callbacks
  const deeplinkRef = useRef<CanvasDeeplink | undefined>(undefined);
  deeplinkRef.current = deeplink;

  const editorRef = useRef<Editor | null>(null);
  const topicsRef = useRef<Topic[]>([]);
  const syncQueueRef = useRef<Promise<void>>(Promise.resolve());
  const saveTimerRef = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const unregisterSideEffectsRef = useRef<(() => void)[]>([]);

  // the sheet clamp, shared with the text-measure sweep in handleMount
  // (text shapes compute their geometry live, so their measured size never
  // passes through the store's before/after-change side effects)
  const clampIntoSheetsRef = useRef<(x: number, y: number, w: number, h: number) => { x: number; y: number }>(
    (x, y) => ({ x, y }),
  );

  // smooth wheel panning teardown + "drop the pending wheel anim" hook
  const smoothWheelCleanupRef = useRef<(() => void) | null>(null);
  // programmatic camera fits (pager, fit toggle, refit) cancel any in-flight
  // wheel easing first — otherwise it keeps steering the camera toward the
  // stale scroll target and the fitted sheet ends up floating mid-viewport
  const smoothWheelCancelRef = useRef<(() => void) | null>(null);
  // camera → pager sync teardown (page chapters): free wheel-scrolling must
  // keep the pager's active page following what's actually in view
  const cameraSyncTeardownRef = useRef<(() => void) | null>(null);

  // page-mode state: the open topic's sheets (order = vertical position)
  const activePagesRef = useRef<TopicPage[]>([]);
  const [activePages, setActivePages] = useState<TopicPage[]>([]);
  const [activePageIndex, setActivePageIndex] = useState(0);

  const [topics, setTopics] = useState<Topic[]>([]);
  const [activeTopicId, setActiveTopicId] = useState<string | null>(null);
  // Sync mirror for sync readers (the AI's page capability reads topic state
  // outside the render flow).
  const activeTopicRef = useRef<string | null>(null);
  useEffect(() => {
    activeTopicRef.current = activeTopicId;
  }, [activeTopicId]);
  const [fitMode, setFitMode] = useState<FitMode>('screen');
  const fitModeRef = useRef<FitMode>('screen');
  const [error, setError] = useState<string | null>(null);

  // viewport padding around the sheets (user-configurable in settings)
  const getPadding = useCallback(
    () => pagePaddingRef?.current ?? PAGE_PADDING,
    [pagePaddingRef],
  );

  // the sheet's inner boundary: how close content may come to the page edge
  // (user-configurable in settings)
  const getInset = useCallback(
    () => Math.max(insetRef?.current ?? SHEET_INSET, 0),
    [insetRef],
  );

  const saveCanvas = useCallback(
    (editor: Editor) => {
      const snapshot = getSnapshot(editor.store) as unknown as Record<string, unknown>;
      api
        .saveChapterCanvas(chapter.id, snapshot, null)
        .catch((e) => console.error('canvas save failed', e));
    },
    [chapter.id],
  );

  /// Mirror tldraw pages into the topics table: pages created/renamed/reordered
  /// or deleted inside the tldraw UI are persisted, and the sidebar list stays
  /// identical to what the editor shows.
  const reconcileTopics = useCallback(
    async (editor: Editor) => {
      const pages = editor.getPages();
      const current = topicsRef.current;
      const byId = new Map(current.map((t) => [t.id, t]));
      const seen = new Set<string>();
      const next: Topic[] = [];

      for (let i = 0; i < pages.length; i++) {
        const page = pages[i];
        const id = pageIdToTopicId(page.id);
        seen.add(id);
        const existing = byId.get(id);
        if (!existing) {
          try {
            next.push(await api.createTopic(chapter.id, page.name, id));
          } catch {
            // lost a race with another reconcile run; the row already exists
            next.push({
              id,
              chapter_id: chapter.id,
              name: page.name,
              position: i,
              is_pinned: false,
              last_opened_at: null,
              created_at: 0,
              updated_at: 0,
            });
          }
          continue;
        }
        if (existing.name !== page.name) {
          api
            .updateTopic(id, { name: page.name })
            .catch((e) => console.error('topic rename failed', e));
          next.push({ ...existing, name: page.name });
          continue;
        }
        if (existing.position !== i) {
          api
            .updateTopic(id, { position: i })
            .catch((e) => console.error('topic reorder failed', e));
          next.push({ ...existing, position: i });
          continue;
        }
        next.push(existing);
      }

      for (const t of current) {
        if (!seen.has(t.id)) {
          api.deleteTopic(t.id).catch((e) => {
            console.error('topic delete failed', e);
            toast.error('Topic delete failed', { description: `${t.name}: ${e instanceof Error ? e.message : String(e)}` });
          });
        }
      }

      const changed =
        next.length !== current.length || next.some((t, i) => t !== current[i]);
      if (changed) {
        topicsRef.current = next;
        setTopics(next);
      }
    },
    [chapter.id],
  );

  const enqueueReconcile = useCallback(
    (editor: Editor) => {
      syncQueueRef.current = syncQueueRef.current
        .then(() => reconcileTopics(editor))
        .catch((e) => console.error('topic sync failed', e));
    },
    [reconcileTopics],
  );

  const scheduleSync = useCallback(
    (editor: Editor) => {
      clearTimeout(saveTimerRef.current);
      saveTimerRef.current = setTimeout(() => {
        saveCanvas(editor);
        enqueueReconcile(editor);
      }, AUTOSAVE_DEBOUNCE_MS);
    },
    [saveCanvas, enqueueReconcile],
  );

  const stackHeight = useCallback(
    (count: number) => (count > 0 ? count * (chapter.page_height! + SHEET_GAP) - SHEET_GAP : chapter.page_height!),
    [chapter.page_height],
  );

  /// Region y offset of sheet index i inside the topic's stack (world units).
  const sheetY = useCallback(
    (index: number) => index * ((chapter.page_height ?? 0) + SHEET_GAP),
    [chapter.page_height],
  );

  /// Page-mode camera constraints: the camera can never leave the stack.
  const applyStackConstraints = useCallback(
    (editor: Editor, sheetCount: number) => {
      if (!chapter.page_width || !chapter.page_height) return;
        editor.setCameraOptions({
          constraints: {
            bounds: { x: 0, y: 0, w: chapter.page_width, h: stackHeight(sheetCount) },
            padding: { x: getPadding(), y: getPadding() },
            origin: { x: 0, y: 0 },
            initialZoom: 'fit-min-100',
            baseZoom: 'fit-min',
            behavior: 'contain',
          },
        });
    },
    [chapter.page_width, chapter.page_height, stackHeight, getPadding],
  );

  /// Fit the sheet to the available viewport. 'screen': width matches the
  /// viewport with padding — the stack stays reachable by scrolling.
  /// 'page': the whole current sheet fits, vertically centered.
  const applyFit = useCallback(
    (editor: Editor, mode: FitMode, index = 0) => {
      const pw = chapter.page_width;
      const ph = chapter.page_height;
      if (!pw || !ph) return;
      // a fitted camera must stick: kill any in-flight wheel easing, or its
      // eased target keeps steering and the sheet floats mid-viewport
      smoothWheelCancelRef.current?.();
      const screen = editor.getViewportScreenBounds();
      const p = getPadding();
      const target =
        mode === 'screen'
          ? (() => {
              const z = (screen.w - p * 2) / pw;
              // width fits; the sheet centers horizontally in the available
              // area (sidebar open/closed) and scrolls vertically
              return { x: screen.w / (2 * z) - pw / 2, y: p / z - sheetY(index), z };
            })()
          : (() => {
              const z = Math.min((screen.w - p * 2) / pw, (screen.h - p * 2) / ph);
              return { x: screen.w / (2 * z) - pw / 2, y: p / z + (screen.h / z - ph) / 2 - sheetY(index), z };
            })();
      // the constraint system normalizes the camera once right after its
      // options change (to initialZoom); a second application sticks
      editor.setCamera(target, { immediate: true });
      setTimeout(() => editor.setCamera(target, { immediate: true }), 80);
    },
    [chapter.page_width, chapter.page_height, sheetY, getPadding],
  );

  const applyFitMode = useCallback(
    (mode: FitMode) => {
      const editor = editorRef.current;
      if (!editor || !isPageChapter) return;
      fitModeRef.current = mode;
      setFitMode(mode);
      applyFit(editor, mode, activePageIndexRef.current);
    },
    [applyFit, isPageChapter],
  );

  const toggleFitMode = useCallback(() => {
    applyFitMode(fitModeRef.current === 'screen' ? 'page' : 'screen');
  }, [applyFitMode]);

  /// Re-apply constraints + current fit: called when the viewport geometry
  /// changes (sidebar toggled, window resized, page padding changed) so the
  /// sheet always centers itself in whatever area it has.
  const refit = useCallback(() => {
    const editor = editorRef.current;
    if (!editor || !isPageChapter) return;
    applyStackConstraints(editor, activePagesRef.current.length);
    applyFit(editor, fitModeRef.current, activePageIndexRef.current);
  }, [applyStackConstraints, applyFit, isPageChapter]);

  const activePageIndexRef = useRef(0);

  const goToSheet = useCallback(
    (index: number) => {
      const editor = editorRef.current;
      if (!editor || !isPageChapter) return;
      const count = activePagesRef.current.length;
      const clamped = Math.min(Math.max(index, 0), Math.max(count - 1, 0));
      applyFit(editor, fitModeRef.current, clamped);
      activePageIndexRef.current = clamped;
      setActivePageIndex(clamped);
    },
    [applyFit, isPageChapter],
  );

  const addSheet = useCallback(() => {
    const topicId = activeTopicId;
    if (!topicId || !isPageChapter) return;
    void (async () => {
      try {
        const created = await api.createTopicPage(
          topicId,
          String(activePagesRef.current.length + 1),
        );
        activePagesRef.current = [...activePagesRef.current, created];
        setActivePages(activePagesRef.current);
        const editor = editorRef.current;
        if (editor) {
          applyStackConstraints(editor, activePagesRef.current.length);
          goToSheet(activePagesRef.current.length - 1);
        }
      } catch (e) {
        setError(toErrorMessage(e));
      }
    })();
  }, [activeTopicId, isPageChapter, applyStackConstraints, goToSheet]);

  /// AI capability: extend a topic's sheet stack. The active topic walks the
  /// same state/constraint/camera path as `addSheet`; a non-active topic just
  /// gains a persisted row (it lays out when the user opens that topic).
  const aiAddPage = useCallback(
    async (topicId: string): Promise<{ id: string; name: string; index: number }> => {
      if (!isPageChapter) throw new Error('not a page chapter');
      if (topicId === activeTopicId) {
        const created = await api.createTopicPage(topicId, String(activePagesRef.current.length + 1));
        activePagesRef.current = [...activePagesRef.current, created];
        setActivePages(activePagesRef.current);
        const editor = editorRef.current;
        if (editor) {
          applyStackConstraints(editor, activePagesRef.current.length);
          goToSheet(activePagesRef.current.length - 1);
        }
        return { id: created.id, name: created.name, index: activePagesRef.current.length - 1 };
      }
      const rows = await api.listTopicPages(topicId).catch(() => []);
      const created = await api.createTopicPage(topicId, String(rows.length + 1));
      return { id: created.id, name: created.name, index: rows.length };
    },
    [isPageChapter, activeTopicId, applyStackConstraints, goToSheet],
  );

  /// The AI's view of the page stacks (sync; called per tool call). The
  /// active topic carries its sheet count so decision requests can be
  /// informed.
  const aiPages = useCallback(
    () => ({
      active_topic_id: activeTopicRef.current,
      topics: topicsRef.current.map((t) => ({
        id: t.id,
        name: t.name,
        page_count:
          t.id === activeTopicRef.current ? activePagesRef.current.length : undefined,
      })),
      addPage: aiAddPage,
    }),
    [aiAddPage],
  );

  /// Page-mode sheet containment: shapes live inside the sheet regions of
  /// the stack — never in the gap between two sheets. Re-registered when the
  /// stack changes.
  const registerStackSideEffects = useCallback(
    (editor: Editor, stackH: number) => {
      unregisterSideEffectsRef.current.forEach((fn) => fn());
      const pw = chapter.page_width!;
      const ph = chapter.page_height!;
      const maxW = () => pw - getInset() * 2;

      // number of sheet regions the stack height was built from
      const sheetCount = Math.max(1, Math.round((stackH + SHEET_GAP) / (ph + SHEET_GAP)));

      /// Clamps a shape into the sheet region it overlaps most: x within the
      /// sheet's width, y within that sheet's band. Shapes land on a page —
      /// never in the dead space between two pages. Shapes taller than one
      /// sheet fall back to stack-wide clamping (they must span sheets).
      const clampIntoSheets = (x: number, y: number, w: number, h: number) => {
        const inset = getInset();
        const cx = w >= maxW() ? inset : Math.min(Math.max(x, inset), pw - inset - w);
        if (h >= ph - inset * 2) {
          // taller than a sheet: span the stack rather than overflow one page
          const cy = Math.min(Math.max(y, inset), stackH - inset - h);
          return { x: cx, y: cy };
        }
        // the sheet the shape overlaps most — never the dead space between
        let best = 0;
        let bestOverlap = -Infinity;
        for (let i = 0; i < sheetCount; i++) {
          const top = i * (ph + SHEET_GAP);
          const overlap = Math.min(y + h, top + ph) - Math.max(y, top);
          if (overlap > bestOverlap) {
            bestOverlap = overlap;
            best = i;
          }
        }
        const top = best * (ph + SHEET_GAP);
        const cy = Math.min(Math.max(y, top + inset), top + ph - inset - h);
        return { x: cx, y: cy };
      };
      // shared with the text-measure sweep (see handleMount)
      clampIntoSheetsRef.current = clampIntoSheets;

      const boundsOf = (shape: TLUnknownShape) => {
        try {
          // getShapeGeometry: the editor's cached path (raw
          // shapeUtil.getGeometry recomputes on every call)
          return editor.getShapeGeometry(shape as unknown as TLShape).bounds;
        } catch {
          const props = shape.props as { w?: number; h?: number };
          return {
            x: shape.x,
            y: shape.y,
            w: Number(props?.w) || 1,
            h: Number(props?.h) || 1,
          };
        }
      };

      // the sheet never touches the viewport edges: clamp the camera so at
      // least `padding` px of canvas stays visible around the stack. When the
      // padded stack fits an axis entirely, that axis is forced to center
      // (tldraw's 'contain' would otherwise pin it to the constraints
      // origin); zoomed in past that, one axis must give (PDF-style panning)
      // and the clamp keeps at least `padding` px of the sheet on screen.
      const clampAxis = (cam: number, viewport: number, stack: number, z: number) => {
        const p = getPadding();
        if (stack * z + p * 2 <= viewport) return viewport / (2 * z) - stack / 2;
        const fittedLo = p / z;
        const fittedHi = (viewport - p) / z - stack;
        if (fittedLo <= fittedHi) return Math.min(Math.max(cam, fittedLo), fittedHi);
        return Math.min(Math.max(cam, p / z - stack), (viewport - p) / z);
      };
      const cameraMargin = (_prev: TLCamera, next: TLCamera) => {
        const { w: W, h: H } = editor.getViewportScreenBounds();
        const z = next.z || 1;
        const x = clampAxis(next.x, W, pw, z);
        const y = clampAxis(next.y, H, stackH, z);
        if (x === next.x && y === next.y) return next;
        return { ...next, x, y };
      };

      unregisterSideEffectsRef.current = [
        editor.sideEffects.registerBeforeChangeHandler('camera', cameraMargin),
        editor.sideEffects.registerBeforeCreateHandler('shape', (shape) => {
          const bounds = boundsOf(shape);
          const { x, y } = clampIntoSheets(shape.x, shape.y, bounds.w, bounds.h);
          return { ...shape, x, y };
        }),
        editor.sideEffects.registerBeforeChangeHandler('shape', (_prev, next) => {
          const bounds = boundsOf(next);
          const { x, y } = clampIntoSheets(next.x, next.y, bounds.w, bounds.h);
          if (x === next.x && y === next.y) return next;
          return { ...next, x, y };
        }),
        // text shapes self-measure AFTER creation (the empty paragraph starts
        // with h=1 and grows once tiptap mounts) — that growth must not push
        // them off their sheet, so re-clamp here too
        editor.sideEffects.registerAfterChangeHandler('shape', (_prev, next) => {
          if (next.type !== 'text') return;
          const bounds = boundsOf(next);
          const inset = getInset();
          const { x, y } = clampIntoSheets(next.x, next.y, bounds.w, bounds.h);
          if (x !== next.x || y !== next.y) {
            editor.updateShape({ id: next.id, type: 'text', x, y });
            return;
          }
          // overflowing text wraps at the sheet edge: fix its width and let
          // tldraw break the line
          const props = next.props as { autoSize?: boolean; w?: number };
          if (!props.autoSize) return;
          if (next.x + bounds.w > pw - inset) {
            editor.updateShape({
              id: next.id,
              type: 'text',
              props: { autoSize: false, w: Math.max(pw - inset - next.x, 40) },
            });
          }
        }),
      ];
    },
    [chapter.page_width, chapter.page_height, getPadding, getInset],
  );

  /// Load a topic's sheets into the stack view (page chapters).
  const openTopicStack = useCallback(
    async (editor: Editor, topic: Topic) => {
      let rows = await api.listTopicPages(topic.id);
      if (rows.length === 0) {
        rows = [await api.createTopicPage(topic.id, '1')];
      }
      rows = rows.map((r, i) => ({ ...r, position: r.position || i }));
      activePagesRef.current = rows;
      setActivePages(rows);
      activePageIndexRef.current = 0;
      setActivePageIndex(0);
      applyStackConstraints(editor, rows.length);
      registerStackSideEffects(editor, stackHeight(rows.length));
      applyFit(editor, fitModeRef.current, 0);
    },
    [applyStackConstraints, registerStackSideEffects, stackHeight, applyFit],
  );

  const handleMount = useCallback(
    async (editor: Editor) => {
      editorRef.current = editor;
      // handy for debugging/e2e drives in dev
      if (import.meta.env.DEV) {
        (window as unknown as { __editor?: Editor }).__editor = editor;
      }
      editor.user.updateUserPreferences({ colorScheme: 'dark' });

      try {
        const dbTopics = await api.listTopics(chapter.id);
        const canvas = await api.loadChapterCanvas(chapter.id);

        const hasSnapshot = canvas.snapshot && Object.keys(canvas.snapshot).length > 0;
        if (hasSnapshot) {
          await loadSnapshot(
            editor.store,
            canvas.snapshot as unknown as Parameters<typeof loadSnapshot>[1],
          );
        }

        topicsRef.current = dbTopics;
        setTopics(dbTopics);

        // a brand-new chapter starts on tldraw's default "Page 1"; align the
        // name with our topic naming before it gets persisted
        if (!hasSnapshot && dbTopics.length === 0 && editor.getPages().length === 1) {
          const only = editor.getPages()[0];
          if (only.name === 'Page 1') {
            editor.updatePage({ id: only.id, name: 'Topic 1' });
          }
        }

        // DB -> editor: every stored topic gets its page back (stable page id)
        for (const t of dbTopics) {
          if (!editor.getPage(topicIdToPageId(t.id))) {
            editor.createPage({ id: topicIdToPageId(t.id), name: t.name });
          }
        }

        // a fresh editor starts with one throwaway default page; drop it when
        // the chapter already has real topics
        if (!hasSnapshot && dbTopics.length > 0) {
          for (const page of editor.getPages()) {
            if (!dbTopics.some((t) => topicIdToPageId(t.id) === page.id)) {
              try {
                editor.deletePage(page.id);
              } catch {
                // tldraw refuses to delete the last remaining page
              }
            }
          }
        }

        await reconcileTopics(editor);

        if (isPageChapter) {
          // open the entry topic's stack (deep link) or the first topic's
          const target =
            topicsRef.current.find(
              (t) => t.id === deeplinkRef.current?.initialTopicId,
            ) ?? topicsRef.current[0] ?? null;
          if (target) {
            await openTopicStack(editor, target);
            setActiveTopicId(target.id);
          }
        } else {
          const restored = applyDeeplink(editor, deeplinkRef.current);
          if (!restored) {
            // center the content
            editor.zoomToFit({ immediate: true } as never);
          }
        }

        setActiveTopicId(pageIdToTopicId(editor.getCurrentPageId()));
      } catch (e) {
        setError(toErrorMessage(e));
        console.error('chapter canvas load failed', e);
      }

      // any store change (drawing, camera, page ops) schedules the autosave,
      // the topic sync and the deep-link hash update
      editor.store.listen(() => {
        setActiveTopicId(pageIdToTopicId(editor.getCurrentPageId()));
        scheduleSync(editor);
      });

      // pages: PDF-like smooth wheel scrolling (eased camera, no jumps)
      if (isPageChapter) {
        smoothWheelCleanupRef.current?.();
        smoothWheelCancelRef.current?.();
        const wheel = setupSmoothWheelPanning(editor);
        smoothWheelCleanupRef.current = wheel.cleanup;
        smoothWheelCancelRef.current = wheel.cancel;

        // camera → pager sync: while the user free-scrolls the stack, the
        // sheet covering the viewport's center becomes the active page —
        // chip only, the camera itself is never touched
        let syncTimer: ReturnType<typeof setTimeout> | undefined;
        const syncFromCamera = () => {
          const count = activePagesRef.current.length;
          if (count === 0) return;
          const vp = editor.getViewportScreenBounds();
          const centerY = editor.screenToPage({ x: vp.x + vp.w / 2, y: vp.y + vp.h / 2 }).y;
          const stepY = (chapter.page_height ?? 0) + SHEET_GAP;
          const idx = Math.min(Math.max(Math.round(centerY / stepY), 0), count - 1);
          if (idx !== activePageIndexRef.current) {
            activePageIndexRef.current = idx;
            setActivePageIndex(idx);
          }
        };
        cameraSyncTeardownRef.current = editor.store.listen((changes) => {
          if (!Object.keys(changes.changes.updated ?? {}).some((k) => k.startsWith('camera:')))
            return;
          clearTimeout(syncTimer);
          syncTimer = setTimeout(syncFromCamera, 120);
        }, { scope: 'session' });
      }

      // text shapes compute their geometry live (measured from the rich
      // text), so their real size never passes through the store's
      // before/after-change side effects: after fonts load (or any edit),
      // sweep the page's text shapes back into their sheet. The shape being
      // edited is skipped — clamping mid-typing would jump the text.
      if (isPageChapter) {
        const sweep = () => {
          const editingId = editor.getEditingShapeId();
          for (const shape of editor.getCurrentPageShapes()) {
            if (shape.type !== 'text' || shape.id === editingId) continue;
            let bounds: { w: number; h: number };
            try {
              bounds = editor.getShapeGeometry(shape).bounds;
            } catch {
              continue;
            }
            const { x, y } = clampIntoSheetsRef.current(shape.x, shape.y, bounds.w, bounds.h);
            if (x !== shape.x || y !== shape.y) {
              editor.updateShape({ id: shape.id, type: 'text', x, y });
            }
          }
        };
        let sweepTimer: ReturnType<typeof setTimeout> | undefined;
        const scheduleSweep = () => {
          clearTimeout(sweepTimer);
          sweepTimer = setTimeout(sweep, 250);
        };
        document.fonts?.ready.then(() => sweep()).catch(() => {});
        editor.store.listen(scheduleSweep);
      }
    },
    [chapter, isPageChapter, reconcileTopics, openTopicStack, scheduleSync],
  );
  // flush a pending debounced save when leaving the chapter
  useEffect(
    () => () => {
      clearTimeout(saveTimerRef.current);
      unregisterSideEffectsRef.current.forEach((fn) => fn());
      unregisterSideEffectsRef.current = [];
      smoothWheelCleanupRef.current?.();
      smoothWheelCancelRef.current?.();
      smoothWheelCleanupRef.current = null;
      smoothWheelCancelRef.current = null;
      cameraSyncTeardownRef.current?.();
      cameraSyncTeardownRef.current = null;
      const editor = editorRef.current;
      if (editor) saveCanvas(editor);
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [],
  );

  const createTopic = useCallback(() => {
    const editor = editorRef.current;
    if (!editor) return;
    // the store listener picks this up and persists the topic row; page
    // chapters open the new topic's stack right away
    editor.createPage({ name: `Topic ${editor.getPages().length + 1}` });
    if (isPageChapter) {
      const created = topicsRef.current[topicsRef.current.length - 1];
      const newPage = editor.getPages().find((p) => p.name === `Topic ${editor.getPages().length}`);
      const topic = newPage
        ? topicsRef.current.find((t) => topicIdToPageId(t.id) === newPage.id) ?? created
        : created;
      if (topic) {
        void openTopicStack(editor, topic).then(() => setActiveTopicId(topic.id));
      }
    }
  }, [isPageChapter, openTopicStack]);

  const selectTopic = useCallback(
    (topic: Topic) => {
      const editor = editorRef.current;
      if (!editor) return;
      editor.setCurrentPage(topicIdToPageId(topic.id));
      setActiveTopicId(topic.id);
      if (isPageChapter) {
        void openTopicStack(editor, topic);
      }
    },
    [isPageChapter, openTopicStack],
  );

  // All three go through the editor's page ops: the store listener persists
  // the changes into the database, so both sides stay in sync.
  const renameTopic = useCallback((topic: Topic, name: string) => {
    const trimmed = name.trim();
    const editor = editorRef.current;
    if (!editor || !trimmed) return;
    api
      .updateTopic(topic.id, { name: trimmed })
      .then((updated) => {
        topicsRef.current = topicsRef.current.map((t) => (t.id === topic.id ? updated : t));
        setTopics(topicsRef.current);
      })
      .catch((e) => setError(toErrorMessage(e)));
    // the tldraw page name mirrors the topic name in both modes
    editor.updatePage({ id: topicIdToPageId(topic.id), name: trimmed });
  }, []);

  const duplicateTopic = useCallback((topic: Topic) => {
    const editor = editorRef.current;
    if (!editor) return;
    editor.duplicatePage(topicIdToPageId(topic.id));
  }, []);

  const deleteTopic = useCallback(
    (topic: Topic) => {
      const editor = editorRef.current;
      // tldraw refuses to delete the last remaining page
      if (!editor || editor.getPages().length <= 1) return;
      api
        .deleteTopic(topic.id)
        .then(() => toast.success('Topic deleted', { description: topic.name }))
        .catch((e) => {
          console.error('topic delete failed', e);
          toast.error('Topic delete failed', { description: e instanceof Error ? e.message : String(e) });
        });
      editor.deletePage(topicIdToPageId(topic.id));
    },
    [],
  );

  // stable identity: consumers use it as an effect dependency; a new function
  // per render would re-run those effects (and in view mode that meant a
  // readonly/camera toggle loop)
  const getEditor = useCallback(() => editorRef.current, []);

  return {
    topics,
    activeTopicId,
    activePages,
    activePageIndex,
    fitMode,
    error,
    handleMount,
    createTopic,
    selectTopic,
    toggleFitMode,
    applyFitMode,
    refit,
    goToSheet,
    addSheet,
    aiPages,
    renameTopic,
    duplicateTopic,
    deleteTopic,
    getEditor,
  };
}
