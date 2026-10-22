/**
 * The AI's view of a shape: a small plain-data outline (kind, position,
 * size, label text) that the model can reason about. Canvas content is
 * user data, so it goes out verbatim — no interpretation here.
 */

import type { Editor, TLShape, TLShapeId } from 'tldraw';
import type { CodeBlockShape } from '@/features/canvas/code-block/code-block-shape';
import type { CalloutCardShape } from '@/features/canvas/card';
import type { MathBlockShape } from '@/features/canvas/math-extension/math-block-shape';
import type { IconShape } from '@/features/canvas/icon-shape';
import { tableToMarkdown, type TableShape } from '@/features/canvas/table-shape';
import { labelFromProps, richTextToPlainText } from './rich-text';

export interface ShapeOutline {
  id: string;
  type: string;
  x: number;
  y: number;
  w?: number;
  h?: number;
  /** The visible label / content, if the shape has one. */
  text?: string;
  color?: string;
  /** code-block: the highlighted language. */
  language?: string;
  /** callout-card: the accent variant (note/info/tip/…). */
  variant?: string;
  /** callout-card or icon: the icon in use. */
  icon?: string;
  /** Present when the shape is nested in a container/group. */
  parentId?: string;
  /** For arrows: the bound shapes. */
  from?: string;
  to?: string;
}

const round2 = (value: number) => Math.round(value * 100) / 100;

/** Block types whose stored props keep the authoritative w/h (auto-fit
 *  updates props itself; geometry bounds can be stale right after create). */
const BOX_SIZED = new Set(['geo', 'frame', 'code-block', 'math-block', 'table', 'callout-card', 'icon']);

/** Very long raw content (code, SVG markup) is clipped in the outline: the
 *  shape itself stays the source of truth for edits. */
const TEXT_LIMIT = 600;

const clip = (text: string) =>
  text.length > TEXT_LIMIT ? `${text.slice(0, TEXT_LIMIT)}… (clipped)` : text;

/** Per-type content extraction for the app's custom shapes; returns the
 *  label plus optional keyword fields for the outline. */
function typeSpecific(
  editor: Editor,
  shape: TLShape,
  props: Record<string, unknown> | undefined,
): Partial<ShapeOutline> {
  switch (shape.type) {
    case 'code-block': {
      const p = shape.props as CodeBlockShape['props'];
      return {
        text: clip(p.code),
        language: p.language,
      };
    }
    case 'math-block': {
      const p = shape.props as MathBlockShape['props'];
      return { text: p.latex, language: 'latex' };
    }
    case 'table': {
      const p = shape.props as TableShape['props'];
      try {
        return { text: tableToMarkdown(editor, p) };
      } catch {
        return { text: labelFromProps(props) };
      }
    }
    case 'callout-card': {
      const p = shape.props as CalloutCardShape['props'];
      const parts: string[] = [];
      const title = richTextToPlainText(p.title).trim();
      const badge = richTextToPlainText(p.badge).trim();
      const body = richTextToPlainText(p.body).trim();
      if (title) parts.push(title);
      if (badge) parts.push(`[${badge}]`);
      if (body) parts.push(body);
      return {
        text: clip(parts.join('\n')),
        variant: p.variant,
        icon: p.icon,
      };
    }
    case 'icon': {
      const p = shape.props as IconShape['props'];
      return { text: p.name || 'icon', icon: `${p.prefix}:${p.name}` };
    }
    case 'svg-diagram': {
      // draft is the model-authored source; fall back to the sanitized svg.
      const draft = typeof props?.draft === 'string' ? props.draft : '';
      const svg = typeof props?.svg === 'string' ? props.svg : '';
      const markup = draft || svg;
      return markup ? { text: clip(markup) } : {};
    }
    default:
      return {};
  }
}

/** Describe one shape for the AI. Sizes come from the shape's geometry
 *  (post-growY) — except for box-type blocks, where the stored `props` are
 *  the truth the creating tool set (geometry bounds can lag behind until
 *  the shape has rendered). Content comes from per-type extraction. */
export function outlineShape(editor: Editor, shape: TLShape): ShapeOutline {
  const outline: ShapeOutline = {
    id: shape.id,
    type: shape.type,
    x: round2(shape.x),
    y: round2(shape.y),
  };

  const props = shape.props as Record<string, unknown> | undefined;
  const propsSize =
    props && typeof props.w === 'number' && typeof props.h === 'number'
      ? { w: round2(props.w), h: round2(props.h) }
      : undefined;
  try {
    const bounds = editor.getShapeGeometry(shape).bounds;
    outline.w = round2(bounds.w);
    outline.h = round2(bounds.h);
    // Auto-fit blocks keep their real size in props; geometry only catches
    // up after the first render, so props win when present.
    if (propsSize && BOX_SIZED.has(shape.type)) {
      outline.w = propsSize.w;
      outline.h = propsSize.h;
    }
  } catch {
    // Geometry can fail on stale ids mid-batch; outline without size.
    if (propsSize) Object.assign(outline, propsSize);
  }

  const extra = typeSpecific(editor, shape, props);
  if (extra.text === undefined) {
    const label = labelFromProps(props);
    if (label !== undefined) outline.text = label;
  }
  Object.assign(outline, extra);
  if (props && typeof props.color === 'string') outline.color = props.color;

  if (shape.parentId.startsWith('shape:')) outline.parentId = shape.parentId;

  if (shape.type === 'arrow' && props) {
    const start = props.start as { boundShapeId?: string } | undefined;
    const end = props.end as { boundShapeId?: string } | undefined;
    if (start?.boundShapeId) outline.from = start.boundShapeId;
    if (end?.boundShapeId) outline.to = end.boundShapeId;
  }

  return outline;
}

/** Outline a batch, skipping ids that no longer resolve (concurrent edits). */
export function outlineShapes(editor: Editor, ids: Iterable<TLShapeId>): ShapeOutline[] {
  const out: ShapeOutline[] = [];
  for (const id of ids) {
    const shape = editor.getShape(id);
    if (!shape) continue;
    out.push(outlineShape(editor, shape));
  }
  return out;
}
