import type { Editor } from 'tldraw';

/**
 * Failure-proof model-generated shape writes. The AI tools accept free-form
 * shape props from the model, and tldraw validates every record at put time —
 * a wrong enum or an unexpected key raises the full-page error boundary and
 * (before a commit) rejects the whole transaction (the "roundRectangle" geo
 * crash, and tldraw GH #5258's "Unexpected property" class).
 *
 * This helper runs the EXACT validators the store will run — the live
 * `ShapeUtil.props` map exposed via `editor.getShapeUtil(type)` (public API;
 * see tldraw.dev/examples/custom-validators) — so anything it accepts cannot
 * fail the store, and anything the model hallucinated is repaired here:
 *
 * - unknown keys are dropped (tldraw's object validators reject them)
 * - a key that fails validation is replaced by the util's default
 *   (`getDefaultProps()`), or dropped when it has none
 * - validators that refine (`T.…refine`) keep their refined value — what
 *   the store would have persisted anyway
 *
 * Test seams (fake editors without the real utils) fail OPEN — props pass
 * through unchanged — so downstream store validation stays the single
 * source of truth there.
 */

type PropValidator = { validate(value: unknown): unknown };

interface ShapeUtilPropsAccess {
  props?: unknown;
  getDefaultProps?: () => unknown;
}

export function sanitizeShapeProps(
  editor: Editor,
  type: string,
  input: unknown,
): Record<string, unknown> {
  if (!input || typeof input !== 'object' || Array.isArray(input)) return {};
  const source = input as Record<string, unknown>;

  let util: ShapeUtilPropsAccess | null = null;
  try {
    util = editor.getShapeUtil(type) as unknown as ShapeUtilPropsAccess | null;
  } catch {
    // not a real editor (unit seam): let the store's own validation guard
    return { ...source };
  }
  if (!util?.props) return { ...source };
  const validators = util.props as Record<string, PropValidator>;

  let defaults: Record<string, unknown> | null = null;
  const output: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(source)) {
    const validator = validators[key];
    // drop unexpected props outright — the store would throw on them
    if (!validator) continue;
    try {
      output[key] = validator.validate(value);
    } catch {
      // invalid value: repair with the util's default when one exists,
      // otherwise omit the key (createShape fills the rest itself)
      if (!defaults) defaults = (util.getDefaultProps?.() ?? {}) as Record<string, unknown>;
      if (key in defaults) output[key] = defaults[key];
    }
  }
  return output;
}
