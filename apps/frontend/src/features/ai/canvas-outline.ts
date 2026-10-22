/**
 * The AI's view of a shape: a small plain-data outline (kind, position,
 * size, label text) that the model can reason about. Canvas content is
 * user data, so it goes out verbatim — no interpretation here.
 */

import type { Editor, TLShape, TLShapeId } from 'tldraw';
import { labelFromProps } from './rich-text';

export interface ShapeOutline {
  id: string;
  type: string;
  x: number;
  y: number;
  w?: number;
  h?: number;
  /** The visible label, if the shape has one. */
  text?: string;
  color?: string;
  /** Present when the shape is nested in a container/group. */
  parentId?: string;
  /** For arrows: the bound shapes. */
  from?: string;
  to?: string;
}

const round2 = (value: number) => Math.round(value * 100) / 100;

/** Describe one shape for the AI. Sizes come from the shape's geometry
 *  (post-growY), labels from its rich text. */
export function outlineShape(editor: Editor, shape: TLShape): ShapeOutline {
  const outline: ShapeOutline = {
    id: shape.id,
    type: shape.type,
    x: round2(shape.x),
    y: round2(shape.y),
  };

  try {
    const bounds = editor.getShapeGeometry(shape).bounds;
    outline.w = round2(bounds.w);
    outline.h = round2(bounds.h);
  } catch {
    // Geometry can fail on stale ids mid-batch; outline without size.
  }

  const props = shape.props as Record<string, unknown> | undefined;
  const label = labelFromProps(props);
  if (label !== undefined) outline.text = label;
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
export function outlineShapes(
  editor: Editor,
  ids: Iterable<TLShapeId>,
): ShapeOutline[] {
  const out: ShapeOutline[] = [];
  for (const id of ids) {
    const shape = editor.getShape(id);
    if (!shape) continue;
    out.push(outlineShape(editor, shape));
  }
  return out;
}
