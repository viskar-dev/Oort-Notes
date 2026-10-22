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
 */

import { getSnapshot, toRichText, type Editor, type TLShapeId } from 'tldraw';
import { prepareSvg } from '@/features/canvas/svg-diagram/svg-diagram-shape';
import { outlineShapes, type ShapeOutline } from './canvas-outline';
import { confirmShapeDeletion } from './confirm-store';
import { layoutDiagram } from './diagram-layout';

/** Tools the AI may call that change the canvas. Rejected in view mode. */
const MUTATING_TOOLS = new Set([
  'create_note',
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
  /** Destructive gate (inline card in the AI panel). */
  confirm: (title: string, detail: string) => Promise<boolean>;
  /** True in view mode: mutations are rejected, reads go through. */
  readOnly: () => boolean;
}

type ToolArgs = Record<string, unknown>;
type ToolValue = Record<string, unknown>;

/** Route one registry tool call by name. Throws user-readable errors — the
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
      return { shapes: currentPageOutlines(deps.editor) };
    case 'get_selection':
      return { shapes: outlineShapes(deps.editor, deps.editor.getSelectedShapeIds()) };
    case 'get_snapshot':
      // Internal plumbing for forced saves; never advertised to models.
      return { snapshot: getSnapshot(deps.editor.store), tldraw_version: null };
    case 'get_screenshot':
      return await screenshot(deps.editor, args);
    case 'create_note':
      return createNote(deps.editor, args);
    case 'create_svg':
      return await createSvg(deps.editor, args);
    case 'create_diagram':
      return createDiagram(deps.editor, args);
    case 'create_shapes':
      return createShapes(deps.editor, args);
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

function currentPageOutlines(editor: Editor): ShapeOutline[] {
  const ids = [...editor.getCurrentPageShapeIds()];
  return outlineShapes(editor, ids);
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
// shared helpers
// ---------------------------------------------------------------------------

function viewportPoint(editor: Editor, x: ToolArgs['x'], y: ToolArgs['y']): { x: number; y: number } {
  const center = editor.getViewportPageBounds().center;
  const nx = typeof x === 'number' && Number.isFinite(x) ? x : center.x;
  const ny = typeof y === 'number' && Number.isFinite(y) ? y : center.y;
  return { x: nx, y: ny };
}

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

// ---------------------------------------------------------------------------
// creates
// ---------------------------------------------------------------------------

function createNote(editor: Editor, args: ToolArgs): ToolValue {
  const text = requiredText(args);
  const at = viewportPoint(editor, args.x, args.y);
  let id: TLShapeId | null = null;
  editor.run(() => {
    id = editor.createShape({
      id: newShapeId(),
      type: 'note',
      x: at.x - DEFAULT_NOTE_W / 2,
      y: at.y - DEFAULT_NOTE_W / 2,
      props: { richText: toRichText(text) },
    }).next.id;
    // "Preferred width"(>120): notes resize through their scale prop.
    if (typeof args.width === 'number' && args.width >= 120) {
      const scale = Math.max(0.35, Math.min(4, args.width / DEFAULT_NOTE_W));
      editor.updateShape({ id: id!, type: 'note', props: { scale } });
    }
  });
  return { created: id };
}

async function createSvg(editor: Editor, args: ToolArgs): Promise<ToolValue> {
  const svg = requiredText(args, 'svg');
  const name = typeof args.name === 'string' ? args.name : '';
  const prepared = prepareSvg(svg);
  if (!prepared) {
    throw new Error('invalid svg: needs a viewBox, or width and height');
  }
  const at = viewportPoint(editor, args.x, args.y);
  const w = typeof args.width === 'number' && args.width >= 120 ? args.width : 320;
  const h = Math.round(w * prepared.ratio);
  let id: TLShapeId;
  editor.run(() => {
    id = editor.createShape({
      id: newShapeId(),
      type: 'svg-diagram',
      x: at.x - w / 2,
      y: at.y - h / 2,
      props: { svg: prepared.svg, ratio: prepared.ratio, draft: svg.trim(), h },
    }).next.id;
  });
  return { created: id, name: name || null, w, h };
}

/** tldraw geo values for the schema's simple node kinds. */
const GEO_KINDS = { rect: 'rectangle', round: 'roundRectangle', diamond: 'diamond' } as const;

function createDiagram(editor: Editor, args: ToolArgs): ToolValue {
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

  // Center the finished bounding box on the current viewport (or the
  // explicit x/y if the model gave one).
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
  const at = viewportPoint(editor, args.x, args.y);
  const dx = at.x - (minX + maxX) / 2;
  const dy = at.y - (minY + maxY) / 2;

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
    warnings: layout.warnings,
  };
}

function createShapes(editor: Editor, args: ToolArgs): ToolValue {
  const entries = asArray(args, 'shapes');
  const created: string[] = [];
  const errors: string[] = [];
  editor.run(() => {
    entries.forEach((entry, index) => {
      try {
        const type = entry.type;
        if (typeof type !== 'string' || !CREATE_TYPES.has(type)) {
          throw new Error(`type must be one of: ${[...CREATE_TYPES].join(', ')}`);
        }
        const id = typeof entry.id === 'string' && entry.id.startsWith('shape:')
          ? (entry.id as TLShapeId)
          : newShapeId();
        const x = typeof entry.x === 'number' && Number.isFinite(entry.x) ? entry.x : 0;
        const y = typeof entry.y === 'number' && Number.isFinite(entry.y) ? entry.y : 0;
        const props = entry.props && typeof entry.props === 'object' ? entry.props : {};
        const shape = { id, type, x, y, props } as Parameters<Editor['createShape']>[0];
        if (type === 'geo' && (typeof (props as ToolArgs).w !== 'number' || typeof (props as ToolArgs).h !== 'number')) {
          throw new Error("geo shapes need numeric \"w\" and \"h\"");
        }
        editor.createShape(shape);
        created.push(id);
      } catch (error) {
        errors.push(`shape ${index}: ${error instanceof Error ? error.message : String(error)}`);
      }
    });
  });
  if (created.length === 0 && errors.length > 0) {
    throw new Error(errors[0]);
  }
  return { created, shape_ids: created, errors };
}

// ---------------------------------------------------------------------------
// edits
// ---------------------------------------------------------------------------

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
        if (!editor.getShape(entry.id as TLShapeId)) {
          throw new Error(`no shape with id ${entry.id} on the active page`);
        }
        const { id, ...patch } = entry;
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
