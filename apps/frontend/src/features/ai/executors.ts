/**
 * The webview side of the AI tool registry: one executor per tool. The AI
 * bridge (use-ai-bridge) routes `canvas:call` events here; these functions
 * are the ONLY place that talks to the tldraw editor on the model's behalf.
 *
 * Design rules:
 * - Every result is plain JSON. The model never sees tldraw internals.
 * - Mutating executors wrap their changes in a single `editor.run()` (one
 *   undo entry per tool call; the grouped-undo marker comes from the
 *   `canvas:begin`/`canvas:end` events the Rust side sends around batches).
 * - Destructive work goes through the confirm store (inline card in the
 *   AI panel).
 * - Placement is deterministic: blocks the model creates without explicit
 *   x/y are laid out against the existing content or the open page sheet,
 *   never on top of it.
 */

import { getSnapshot, toRichText, type Box, type Editor, type TLShapeId } from 'tldraw';
import { prepareSvg } from '@/features/canvas/svg-diagram/svg-diagram-shape';
import { CODE_LANGUAGES } from '@/features/canvas/code-block/code-block-shape';
import { parseMarkdownTable, createTableFromMarkdown } from '@/features/canvas/table-shape';
import { outlineShapes } from './canvas-outline';
import { buildRichDocument } from './rich-text';
import { confirmShapeDeletion } from './confirm-store';
import { layoutDiagram } from './diagram-layout';

/** What the executors need to know about the chapter rendering context
 *  (pages-mode geometry). Provided by the canvas shell via use-ai-bridge. */
export interface AiCanvasContext {
  canvas_type: string;
  /** Pages-mode sheet geometry; null on infinite canvases. */
  page: { width: number; height: number; gap: number; count: number } | null;
}

/** Tools the AI may call that change the canvas. Rejected in view mode. */
const MUTATING_TOOLS = new Set([
  'create_note',
  'create_math_block',
  'create_code_block',
  'create_table',
  'create_card',
  'create_svg',
  'create_diagram',
  'create_shapes',
  'update_shapes',
  'delete_shapes',
]);

/** Shape types `create_shapes` may pass through. Custom shapes (icon, card,
 *  table…) are left out: their required props are app-specific and a
 *  misplaced guess renders badly or breaks. */
const CREATE_TYPES = new Set(['geo', 'text', 'note', 'arrow', 'line', 'frame', 'svg-diagram']);

const DEFAULT_NOTE_W = 220;

export interface AiExecutorDeps {
  editor: Editor;
  /** Chapter rendering context (pages-mode geometry). */
  context: () => AiCanvasContext;
  /** Destructive gate (inline card in the AI panel). */
  confirm: (title: string, detail: string) => Promise<boolean>;
  /** True in view mode: mutations are rejected, reads go through. */
  readOnly: () => boolean;
}

type ToolArgs = Record<string, unknown>;
type ToolValue = Record<string, unknown>;

/** Route one registry tool call by name. Throws user-readable errors— the
 *  bridge turns them into the `canvas_result` error field. */
export async function executeAiTool(
  deps: AiExecutorDeps,
  name: string,
  args: ToolArgs,
): Promise<ToolValue> {
  if (MUTATING_TOOLS.has(name) && deps.readOnly()) {
    throw new Error('the canvas is in view mode: turn off view mode to let the AI edit');
  }
  switch (name) {
    case 'get_canvas':
      return getCanvas(deps);
    case 'get_selection':
      return { shapes: outlineShapes(deps.editor, deps.editor.getSelectedShapeIds()) };
    case 'get_snapshot':
      // Internal plumbing for forced saves; never advertised to models.
      return { snapshot: getSnapshot(deps.editor.store), tldraw_version: null };
    case 'get_screenshot':
      return await screenshot(deps.editor, args);
    case 'create_note':
      return createNote(deps, args);
    case 'create_math_block':
      return createMathBlock(deps, args);
    case 'create_code_block':
      return createCodeBlock(deps, args);
    case 'create_table':
      return createTable(deps, args);
    case 'create_card':
      return createCard(deps, args);
    case 'create_svg':
      return await createSvg(deps, args);
    case 'create_diagram':
      return createDiagram(deps, args);
    case 'create_shapes':
      return createShapes(deps, args);
    case 'update_shapes':
      return updateShapes(deps.editor, args);
    case 'delete_shapes':
      return await deleteShapes(deps.editor, args);
    case 'focus_viewport':
      return focusViewport(deps.editor, args);
    default:
      throw new Error(`no executor for "${name}"`);
  }
}

// ---------------------------------------------------------------------------
// reads
// ---------------------------------------------------------------------------

/** get_canvas: outlines plus the pages-mode geometry the layout rules need. */
function getCanvas(deps: AiExecutorDeps): ToolValue {
  const editor = deps.editor;
  const ids = [...editor.getCurrentPageShapeIds()];
  return { shapes: outlineShapes(editor, ids), canvas: { ...deps.context() } };
}

/** Blob → raw base64 (no data: prefix; mime is reported separately). */
async function blobToBase64(blob: Blob): Promise<string> {
  const bytes = new Uint8Array(await blob.arrayBuffer());
  let binary = '';
  const CHUNK = 0x8000;
  for (let i = 0; i < bytes.length; i += CHUNK) {
    binary += String.fromCharCode(...bytes.subarray(i, i + CHUNK));
  }
  return btoa(binary);
}

/** PNG of the canvas (or selection) for visual questions. */
async function screenshot(editor: Editor, args: ToolArgs): Promise<ToolValue> {
  const focusSelection = args.focus_selection === true;
  const ids = focusSelection ? editor.getSelectedShapeIds() : [...editor.getCurrentPageShapeIds()];
  if (ids.length === 0) {
    throw new Error('nothing to screenshot: the selection is empty');
  }

  // Zoom factor: never upscale past 2x, cover the requested target width.
  let bounds = editor.getShapePageBounds(ids[0])!.clone();
  for (const id of ids.slice(1)) {
    const next = editor.getShapePageBounds(id);
    if (next) bounds.expand(next);
  }
  const target = Math.max(320, Math.min(2400, Number(args.max_width) || 1568));
  const scale = Math.max(1, Math.min(2, target / Math.max(bounds.w, 1)));

  const image = await editor.toImage(ids, { format: 'png', background: true, scale, padding: 16 });
  if (!image.blob) throw new Error('screenshot export failed');
  const base64 = await blobToBase64(image.blob);
  return { image_base64: base64, mime: 'image/png', width: image.width, height: image.height };
}

// ---------------------------------------------------------------------------
// deterministic placement
// ---------------------------------------------------------------------------

interface LayoutRect {
  x: number;
  y: number;
  w: number;
  h: number;
}

const LAYOUT_GAP = 72;
const PAGE_INSET = 40;

const clamp = (value: number, min: number, max: number) => Math.min(Math.max(value, min), max);

/** The part of the canvas the AI composes in (the visible viewport on
 *  infinite canvases; the active sheet in pages mode) plus the bounding box
 *  of existing content inside it. */
function layoutRegion(editor: Editor, deps: AiExecutorDeps): { region: LayoutRect; content: LayoutRect | null } {
  const ctx = deps.context();
  const viewport = editor.getViewportPageBounds();
  let region: LayoutRect;
  if (ctx.page && ctx.canvas_type === 'page') {
    // Sheets are stacked at y = i * (height + gap); the active one holds the
    // viewport's vertical midpoint.
    const pitch = ctx.page.height + ctx.page.gap;
    const midY = viewport.y + viewport.h / 2;
    const sheet = clamp(Math.floor(midY / pitch), 0, Math.max(0, ctx.page.count - 1));
    region = { x: 0, y: sheet * pitch, w: ctx.page.width, h: ctx.page.height };
  } else {
    region = { x: viewport.x, y: viewport.y, w: viewport.w, h: viewport.h };
  }

  let content: LayoutRect | null = null;
  for (const id of editor.getCurrentPageShapeIds()) {
    const shape = editor.getShape(id);
    if (!shape) continue;
    let bounds: Box;
    try {
      const pageBounds = editor.getShapePageBounds(id);
      if (!pageBounds) continue;
      bounds = pageBounds;
    } catch {
      continue;
    }
    // Only content inside the region anchors placement.
    if (
      bounds.maxX < region.x ||
      bounds.minX > region.x + region.w ||
      bounds.maxY < region.y ||
      bounds.minY > region.y + region.h
    ) {
      continue;
    }
    const rect = { x: bounds.minX, y: bounds.minY, w: bounds.w, h: bounds.h };
    if (!content) {
      content = rect;
    } else {
      const x = Math.min(content.x, rect.x);
      const y = Math.min(content.y, rect.y);
      content = {
        x,
        y,
        w: Math.max(content.x + content.w, rect.x + rect.w) - x,
        h: Math.max(content.y + content.h, rect.y + rect.h) - y,
      };
    }
  }
  return { region, content };
}

/** Where a new block of w×h goes. Explicit x/y always win; otherwise it
 *  attaches to the content bounding box on the requested side ('below'
 *  default) and is clamped into the region, so AI output never lands on top
 *  of existing content and stays inside the open sheet. */
function planPlacement(
  editor: Editor,
  deps: AiExecutorDeps,
  args: ToolArgs,
  w: number,
  h: number,
): { x: number; y: number } {
  const { region, content } = layoutRegion(editor, deps);
  let target: { x: number; y: number };
  if (typeof args.x === 'number' && Number.isFinite(args.x) && typeof args.y === 'number' && Number.isFinite(args.y)) {
    target = { x: args.x, y: args.y };
  } else if (content) {
    const side = typeof args.side === 'string' ? args.side : '';
    target =
      side === 'left'
        ? { x: content.x - LAYOUT_GAP - w, y: content.y }
        : side === 'right'
          ? { x: content.x + content.w + LAYOUT_GAP, y: content.y }
          : side === 'above'
            ? { x: content.x, y: content.y - LAYOUT_GAP - h }
            : { x: content.x + content.w / 2 - w / 2, y: content.y + content.h + LAYOUT_GAP };
  } else {
    // Nothing to anchor on: start near the top of the region (centered).
    target = { x: region.x + region.w / 2 - w / 2, y: region.y + PAGE_INSET };
  }
  // Keep the block inside the region (centered if it simply does not fit).
  const maxX = region.x + region.w - w - PAGE_INSET;
  const maxY = region.y + region.h - h - PAGE_INSET;
  return {
    x: maxX < region.x + PAGE_INSET
      ? region.x + (region.w - w) / 2
      : clamp(target.x, region.x + PAGE_INSET, maxX),
    y: maxY < region.y + PAGE_INSET
      ? region.y + (region.h - h) / 2
      : clamp(target.y, region.y + PAGE_INSET, maxY),
  };
}

// ---------------------------------------------------------------------------
// shared helpers
// ---------------------------------------------------------------------------

const newShapeId = (): TLShapeId => `shape:${crypto.randomUUID()}` as TLShapeId;

function requiredText(args: ToolArgs, field = 'text'): string {
  const text = args[field];
  if (typeof text !== 'string' || text.trim().length === 0) {
    throw new Error(`"${field}" is required and must be a non-empty string`);
  }
  return text;
}

const asArray = (args: ToolArgs, field: string): ToolArgs[] => {
  const list = args[field];
  if (!Array.isArray(list) || list.length === 0) {
    throw new Error(`"${field}" must be a non-empty array`);
  }
  return list.filter((entry): entry is ToolArgs => entry !== null && typeof entry === 'object');
};

/** The direction the arrows push; null edges (a→a etc.) are dropped by the
 *  layout already. */
function asScheme(value: ToolArgs['shape']): 'rect' | 'round' | 'diamond' | 'note' {
  return value === 'round' || value === 'diamond' || value === 'note' ? value : 'rect';
}

/** width arg → clamped size (must not be smaller than min). */
function widthArg(args: ToolArgs, min: number, max: number, fallback: number): number {
  const parsed = typeof args.width === 'number' && Number.isFinite(args.width) ? args.width : fallback;
  return clamp(parsed, min, max);
}

/** Rough height estimates keep placement enough room; the shapes themselves
 *  auto-fit their height to content after creation. */
const textLines = (text: string) => text.split(/\r?\n/).length;

/** Outline-friendly rounding for the geometry this module reports back. */
const round = (value: number) => Math.round(value * 100) / 100;

// ---------------------------------------------------------------------------
// creates
// ---------------------------------------------------------------------------

function createNote(deps: AiExecutorDeps, args: ToolArgs): ToolValue {
  const editor = deps.editor;
  const text = requiredText(args);
  const w = widthArg(args, 160, 1200, DEFAULT_NOTE_W);
  const h = Math.max(64, textLines(text) * 30 + 30);
  const at = planPlacement(editor, deps, args, w, h);
  const id = newShapeId();
  editor.run(() => {
    editor.createShape({
      id,
      type: 'note',
      x: at.x,
      y: at.y,
      props: { richText: buildRichDocument(text) as never },
    });
    // "Preferred width"(>120): notes resize through their scale prop.
    if (w !== DEFAULT_NOTE_W) {
      const scale = Math.max(0.35, Math.min(4, w / DEFAULT_NOTE_W));
      editor.updateShape({ id, type: 'note', props: { scale } });
    }
  });
  return { created: id, x: round(at.x), y: round(at.y), w: round(w), h: round(h) };
}

function createMathBlock(deps: AiExecutorDeps, args: ToolArgs): ToolValue {
  const editor = deps.editor;
  const latex = requiredText(args, 'latex');
  const w = widthArg(args, 160, 900, 320);
  const lines = textLines(latex);
  const h = lines > 1 ? Math.max(64, lines * 28 + 32) : 96;
  const at = planPlacement(editor, deps, args, w, h);
  const id = newShapeId();
  editor.run(() => {
    editor.createShape({
      id,
      type: 'math-block',
      x: at.x,
      y: at.y,
      props: { w, h, latex },
    });
  });
  return { created: id, x: round(at.x), y: round(at.y), w: round(w), h: round(h) };
}

function createCodeBlock(deps: AiExecutorDeps, args: ToolArgs): ToolValue {
  const editor = deps.editor;
  const code = requiredText(args, 'code');
  const language =
    typeof args.language === 'string' && (CODE_LANGUAGES as readonly string[]).includes(args.language)
      ? (args.language as (typeof CODE_LANGUAGES)[number])
      : 'typescript';
  const w = widthArg(args, 320, 1400, 560);
  // header 25 + body padding 24 + border 2 ≈ 51; ~20px per code line at 13px
  const h = clamp(51 + textLines(code) * 21, 120, 2000);
  const at = planPlacement(editor, deps, args, w, Math.min(h, 400));
  const id = newShapeId();
  editor.run(() => {
    editor.createShape({
      id,
      type: 'code-block',
      x: at.x,
      y: at.y,
      props: { w, h, code, language, fontSize: 13, autoHeight: true },
    });
  });
  return { created: id, language, x: round(at.x), y: round(at.y), w: round(w), h: round(h) };
}

function createTable(deps: AiExecutorDeps, args: ToolArgs): ToolValue {
  const editor = deps.editor;
  const markdown = args.markdown;
  if (typeof markdown !== 'string' || markdown.trim().length === 0) {
    throw new Error('"markdown" is required: a GFM table (header row, | --- | delimiter row, rows)');
  }
  const parsed = parseMarkdownTable(markdown);
  if (!parsed) {
    throw new Error(
      '"markdown" must be a GitHub-flavored table: header row, a | --- | delimiter row, then one row per line',
    );
  }
  const cols = parsed.header.length;
  const fallbackW = clamp(cols * 200, 360, 1000);
  const w = widthArg(args, 240, 1400, fallbackW);
  const rowCount = parsed.rows.length || 1;
  const h = 60 + (rowCount + 1) * 46;
  const at = planPlacement(editor, deps, args, w, h);
  let id: TLShapeId | null = null;
  editor.run(() => {
    createTableFromMarkdown(editor, parsed, { x: at.x, y: at.y }, w);
    const selected = editor.getSelectedShapeIds()[0];
    if (selected) id = selected;
  });
  if (!id) throw new Error('the table block was not created');
  return {
    created: id,
    x: round(at.x),
    y: round(at.y),
    w: round(w),
    h: round(h),
  };
}

const CARD_VARIANTS = new Set(['note', 'info', 'tip', 'success', 'warning', 'danger']);
const CARD_ICONS = new Set([
  'dot', 'info', 'tip', 'success', 'warning', 'danger', 'pin', 'star', 'bookmark', 'zap', 'help',
]);
const CARD_DEFAULT_ICON: Record<string, string> = {
  note: 'dot',
  info: 'info',
  tip: 'tip',
  success: 'success',
  warning: 'warning',
  danger: 'danger',
};

function createCard(deps: AiExecutorDeps, args: ToolArgs): ToolValue {
  const editor = deps.editor;
  const title = requiredText(args, 'title');
  const body = typeof args.body === 'string' ? args.body : '';
  const variant = typeof args.variant === 'string' && CARD_VARIANTS.has(args.variant) ? args.variant : 'note';
  const badge = typeof args.badge === 'string' ? args.badge.trim() : '';
  const icon =
    typeof args.icon === 'string' && CARD_ICONS.has(args.icon)
      ? args.icon
      : (CARD_DEFAULT_ICON[variant] ?? 'dot');
  const w = widthArg(args, 220, 1200, 460);
  const h = clamp(textLines(body) * 26 + (badge ? 92 : 64), 64, 1200);
  const at = planPlacement(editor, deps, args, w, Math.min(h, 320));
  const id = newShapeId();
  editor.run(() => {
    editor.createShape({
      id,
      type: 'callout-card',
      x: at.x,
      y: at.y,
      props: {
        w,
        h,
        variant,
        icon,
        title: buildRichDocument(title) as never,
        badge: buildRichDocument(badge) as never,
        body: buildRichDocument(body) as never,
        showIcon: true,
        showBadge: Boolean(badge),
        tinted: false,
        collapsed: false,
      },
    });
  });
  return { created: id, variant, icon, x: round(at.x), y: round(at.y), w: round(w), h: round(h) };
}

async function createSvg(deps: AiExecutorDeps, args: ToolArgs): Promise<ToolValue> {
  const editor = deps.editor;
  const svg = requiredText(args, 'svg');
  const name = typeof args.name === 'string' ? args.name : '';
  const prepared = prepareSvg(svg);
  if (!prepared) {
    throw new Error('invalid svg: needs a viewBox, or width and height');
  }
  const w = widthArg(args, 120, 2000, 320);
  const h = Math.round(w * prepared.ratio);
  const at = planPlacement(editor, deps, args, w, h);
  const id = newShapeId();
  editor.run(() => {
    editor.createShape({
      id,
      type: 'svg-diagram',
      x: at.x,
      y: at.y,
      props: { svg: prepared.svg, ratio: prepared.ratio, draft: svg.trim(), h },
    });
  });
  return { created: id, name: name || null, x: round(at.x), y: round(at.y), w: round(w), h: round(h) };
}

/** tldraw geo values for the schema's simple node kinds. */
const GEO_KINDS = { rect: 'rectangle', round: 'roundRectangle', diamond: 'diamond' } as const;

function createDiagram(deps: AiExecutorDeps, args: ToolArgs): ToolValue {
  const editor = deps.editor;
  const rawNodes = asArray(args, 'nodes');
  const rawEdges = args.edges;
  if (!Array.isArray(rawEdges)) {
    throw new Error('"edges" must be an array');
  }
  const nodes = rawNodes.map((node) => ({
    id: typeof node.id === 'string' ? node.id : '',
    label: typeof node.label === 'string' ? node.label : '',
    shape: asScheme(node.shape),
  }));
  const ids = new Set(nodes.map((node) => node.id));
  if (nodes.some((node) => node.id.length === 0)) {
    throw new Error('every node needs a non-empty "id"');
  }
  if (ids.size !== nodes.length) {
    throw new Error('node ids must be unique');
  }
  const edges = (rawEdges as ToolArgs[]).map((edge) => ({
    from: typeof edge.from === 'string' ? edge.from : '',
    to: typeof edge.to === 'string' ? edge.to : '',
    label: typeof edge.label === 'string' ? edge.label : undefined,
  }));

  const layout = layoutDiagram(nodes, edges, args.direction === 'right' ? 'right' : 'down', { x: 0, y: 0 });
  if (layout.nodes.size === 0) {
    throw new Error('nothing to create: the diagram is empty');
  }

  // The diagram's own bounding box feeds the same deterministic placement
  // rule as every other block: below (or left/right/above of) the content.
  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  for (const placement of layout.nodes.values()) {
    minX = Math.min(minX, placement.x);
    minY = Math.min(minY, placement.y);
    maxX = Math.max(maxX, placement.x + placement.w);
    maxY = Math.max(maxY, placement.y + placement.h);
  }
  const boxW = maxX - minX;
  const boxH = maxY - minY;
  const at = planPlacement(editor, deps, args, Math.min(boxW, 2000), Math.min(boxH, 2000));
  const dx = at.x - minX;
  const dy = at.y - minY;
  const createdNodes: TLShapeId[] = [];
  const createdArrows: TLShapeId[] = [];
  editor.run(() => {
    for (const node of nodes) {
      const placement = layout.nodes.get(node.id)!;
      const scaleFactor = node.shape === 'diamond' ? 1.25 : 1;
      const w = placement.w * scaleFactor;
      const h = placement.h * scaleFactor;
      const id = newShapeId();
      if (node.shape === 'note') {
        editor.createShape({
          id,
          type: 'note',
          x: placement.x + dx,
          y: placement.y + dy,
          props: { richText: toRichText(node.label) },
        });
      } else {
        editor.createShape({
          id,
          type: 'geo',
          x: placement.x + dx,
          y: placement.y + dy,
          props: {
            geo: GEO_KINDS[node.shape],
            w,
            h,
            richText: toRichText(node.label),
          },
        });
      }
      createdNodes.push(id);
    }
    for (const arrow of layout.arrows) {
      const id = newShapeId();
      editor.createShape({
        id,
        type: 'arrow',
        x: 0,
        y: 0,
        props: {
          start: { x: 0, y: 0, boundShapeId: arrow.from as TLShapeId },
          end: { x: 100, y: 100, boundShapeId: arrow.to as TLShapeId },
          text: arrow.label ?? undefined,
        },
      });
      // Belt and braces: if tldraw didn't create the bindings from the
      // props, make them explicitly.
      const bindings = editor.getBindingsFromShape(id, 'arrow');
      for (const endpoint of [arrow.from, arrow.to]) {
        if (!bindings.some((binding) => binding.toId === endpoint)) {
          editor.createBinding({
            fromId: id,
            toId: endpoint as TLShapeId,
            type: 'arrow',
          });
        }
      }
      createdArrows.push(id);
    }
  });
  return {
    created: { nodes: createdNodes, arrows: createdArrows },
    shape_ids: createdNodes,
    x: round(at.x),
    y: round(at.y),
    w: round(boxW),
    h: round(boxH),
    warnings: layout.warnings,
  };
}

/** Rough planned footprint for one create_shapes entry. Placement only —
 *  blocks auto-fit their real height right after creation (geo carries its
 *  real w/h in props; that is validated before this runs). */
function plannedSize(type: string, props: ToolArgs): { w: number; h: number } {
  const w = typeof props.w === 'number' && Number.isFinite(props.w) ? props.w : 0;
  const h = typeof props.h === 'number' && Number.isFinite(props.h) ? props.h : 0;
  if (w > 0 && h > 0) return { w, h };
  const text = typeof props.text === 'string' ? props.text : '';
  switch (type) {
    case 'text':
      return { w: 240, h: Math.max(42, textLines(text) * 36 + 6) };
    case 'frame':
      return { w: 480, h: 360 };
    case 'arrow':
    case 'line':
      return { w: 180, h: 32 };
    case 'svg-diagram':
      return { w: 320, h: 240 };
    default:
      return { w: 120, h: 120 };
  }
}

/** An entry position set by the model itself (honored exactly, no planning). */
const hasExplicitXY = (entry: ToolArgs): boolean =>
  typeof entry.x === 'number' && Number.isFinite(entry.x) &&
  typeof entry.y === 'number' && Number.isFinite(entry.y);

function createShapes(deps: AiExecutorDeps, args: ToolArgs): ToolValue {
  const editor = deps.editor;
  const entries: ToolArgs[] = asArray(args, 'shapes');

  // Validate before any placement math, with the exact messages the
  // executor has always produced (per-entry, prefixed by the batch index).
  const errors: string[] = [];
  const ok: Array<{ entry: ToolArgs; index: number; type: string; size: { w: number; h: number } }> = [];
  entries.forEach((entry, index) => {
    const type = entry.type;
    if (typeof type !== 'string' || !CREATE_TYPES.has(type)) {
      errors.push(`shape ${index}: type must be one of: ${[...CREATE_TYPES].join(', ')}`);
      return;
    }
    const props = entry.props && typeof entry.props === 'object' ? (entry.props as ToolArgs) : {};
    if (type === 'geo' && (typeof props.w !== 'number' || typeof props.h !== 'number')) {
      errors.push(`shape ${index}: geo shapes need numeric "w" and "h"`);
      return;
    }
    ok.push({ entry, index, type, size: plannedSize(type, props) });
  });

  // x/y-less entries used to drop at world origin — off-sheet in pages mode.
  // They now get the dedicated create_* tools' contract: one column anchored
  // by planPlacement (below existing content, side-honored) and clamped into
  // the compose region, keeping the batch's relative offsets.
  let cursor: { x: number; y: number } | null = null;
  if (ok.some((it) => !hasExplicitXY(it.entry))) {
    const batchW = Math.max(...ok.map((it) => it.size.w));
    const batchH = ok.reduce((sum, it) => sum + it.size.h + LAYOUT_GAP, -LAYOUT_GAP);
    const anchor = planPlacement(editor, deps, args, batchW, batchH);
    cursor = { x: anchor.x, y: anchor.y };
  }

  const created: string[] = [];
  editor.run(() => {
    for (const { entry, index, type, size } of ok) {
      try {
        const id = typeof entry.id === 'string' && entry.id.startsWith('shape:')
          ? (entry.id as TLShapeId)
          : newShapeId();
        let x: number;
        let y: number;
        if (cursor === null) {
          // Every entry is explicit: no planning touched the coordinates.
          x = typeof entry.x === 'number' && Number.isFinite(entry.x) ? entry.x : 0;
          y = typeof entry.y === 'number' && Number.isFinite(entry.y) ? entry.y : 0;
        } else if (hasExplicitXY(entry)) {
          x = entry.x;
          y = entry.y;
        } else {
          x = cursor.x;
          y = cursor.y;
          cursor.y += size.h + LAYOUT_GAP;
        }
        editor.createShape({ id, type, x, y, props: entry.props && typeof entry.props === 'object' ? entry.props : {} } as Parameters<Editor['createShape']>[0]);
        created.push(id);
      } catch (error) {
        errors.push(`shape ${index}: ${error instanceof Error ? error.message : String(error)}`);
      }
    }
  });
  if (created.length === 0 && errors.length > 0) {
    throw new Error(errors[0]);
  }
  return { created, shape_ids: created, errors };
}

// ---------------------------------------------------------------------------
// edits
// ---------------------------------------------------------------------------

/** Shape types whose geometry lives inside `props`. For these, top-level
 *  `w`/`h` in an update entry are moved under `props` so the model never has
 *  to remember where the size sits. */
const BOX_PROP_TYPES = new Set([
  'geo',
  'frame',
  'code-block',
  'math-block',
  'table',
  'callout-card',
  'svg-diagram',
  'icon',
]);

function updateShapes(editor: Editor, args: ToolArgs): ToolValue {
  const entries = asArray(args, 'updates');
  const updated: string[] = [];
  const errors: string[] = [];
  editor.run(() => {
    for (const [index, entry] of entries.entries()) {
      try {
        if (typeof entry.id !== 'string' || !entry.id.startsWith('shape:')) {
          throw new Error('every update needs a shape "id"');
        }
        const shape = editor.getShape(entry.id as TLShapeId);
        if (!shape) {
          throw new Error(`no shape with id ${entry.id} on the active page`);
        }
        const { id, ...patch } = entry;
        // Convenience: for box-shaped blocks sizes live under `props`; a
        // top-level w/h is moved there instead of being silently ignored.
        if (
          BOX_PROP_TYPES.has(shape.type) &&
          !(patch.props && typeof patch.props === 'object') &&
          ('w' in patch || 'h' in patch)
        ) {
          patch.props = { w: patch.w, h: patch.h } as ToolArgs;
          delete patch.w;
          delete patch.h;
        }
        editor.updateShape({ id: id as TLShapeId, ...patch } as Parameters<Editor['updateShape']>[0]);
        updated.push(id);
      } catch (error) {
        errors.push(`update ${index}: ${error instanceof Error ? error.message : String(error)}`);
      }
    }
  });
  if (updated.length === 0 && errors.length > 0) {
    throw new Error(errors[0]);
  }
  return { updated, errors };
}

function deleteShapes(editor: Editor, args: ToolArgs): Promise<ToolValue> {
  const ids = args.ids;
  if (!Array.isArray(ids) || ids.length === 0) {
    throw new Error('"ids" must be a non-empty array of shape ids');
  }
  const existing = ids.filter(
    (id): id is string => typeof id === 'string' && !!editor.getShape(id as TLShapeId),
  );
  if (existing.length === 0) {
    throw new Error('none of the ids refer to a shape on the active page');
  }
  return confirmShapeDeletion(existing.length).then((ok) => {
    if (!ok) throw new Error('delete cancelled by the user');
    editor.run(() => {
      editor.deleteShapes(existing.map((id) => id as TLShapeId));
    });
    return { deleted: existing.map(String) } as ToolValue;
  });
}

function focusViewport(editor: Editor, args: ToolArgs): ToolValue {
  const requested = Array.isArray(args.shape_ids)
    ? args.shape_ids.filter((id): id is string => typeof id === 'string')
    : [];
  if (requested.length === 0) {
    editor.zoomToFit();
    return { focused: 'all content' };
  }
  const ids = requested.filter((id) => editor.getShape(id as TLShapeId));
  if (ids.length === 0) {
    throw new Error('none of the ids refer to a shape on the active page');
  }
  let bounds = editor.getShapePageBounds(ids[0] as TLShapeId)!.clone();
  for (const id of ids.slice(1)) {
    const next = editor.getShapePageBounds(id as TLShapeId);
    if (next) bounds.expand(next);
  }
  editor.zoomToBounds(bounds, { inset: 80, animation: { duration: 220 } });
  return { focused: ids.map(String) };
}
