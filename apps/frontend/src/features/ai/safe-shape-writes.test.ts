import { describe, expect, it, vi } from 'vitest';
import { sanitizeShapeProps } from './safe-shape-writes';
import type { Editor } from 'tldraw';

/** The slice of ShapeUtil the sanitizer reads: the live props validator map
 *  and the default-props fallback, mirroring tldraw's own geo/rect setup
 *  (see the store's TLGeoShapeProps validators). */
function makeEditor(
  props: Record<string, { validate: (value: unknown) => unknown }>,
  defaults: Record<string, unknown> = {},
): Editor {
  return {
    getShapeUtil: vi.fn(() => ({
      props,
      getDefaultProps: () => defaults,
    })),
  } as unknown as Editor;
}

describe('sanitizeShapeProps', () => {
  it('passes values that the store validators accept', () => {
    const editor = makeEditor(
      { geo: { validate: (v) => v }, w: { validate: (v) => v }, h: { validate: (v) => v } },
      { geo: 'rectangle' },
    );
    expect(sanitizeShapeProps(editor, 'geo', { geo: 'rectangle', w: 100, h: 60 })).toEqual({
      geo: 'rectangle',
      w: 100,
      h: 60,
    });
  });

  it('drops unexpected keys — the store would throw on them (GH #5258 class)', () => {
    const editor = makeEditor({ w: { validate: (v) => v } }, { w: 300 });
    expect(sanitizeShapeProps(editor, 'geo', { w: 10, status: 'synced' })).toEqual({ w: 10 });
  });

  it('replaces an invalid enum with the util default — the roundRectangle crash class', () => {
    // like T.stringEnum for the geo field: accepts only the v3 enum values
    const GEO_ENUM = ['rectangle', 'ellipse', 'diamond', 'oval'] as const;
    const editor = makeEditor(
      {
        geo: {
          validate: (v) => {
            if (typeof v !== 'string' || !(GEO_ENUM as readonly string[]).includes(v)) {
              throw new Error(`Bad literal: expect one of "${GEO_ENUM.join('", "')}", got ${v}`);
            }
            return v;
          },
        },
      },
      { geo: 'rectangle' },
    );
    // the exact payload from the reported crash ("roundRectangle")
    expect(sanitizeShapeProps(editor, 'geo', { geo: 'roundRectangle' })).toEqual({
      geo: 'rectangle',
    });
    // a valid value survives untouched
    expect(sanitizeShapeProps(editor, 'geo', { geo: 'oval' })).toEqual({ geo: 'oval' });
  });

  it('drops invalid values for props with no default', () => {
    const editor = makeEditor({
      scale: { validate: () => { throw new Error('unbuildable'); } },
      w: { validate: (v) => v },
      h: { validate: (v) => v },
    });
    expect(sanitizeShapeProps(editor, 'geo', { scale: 1, w: 400, h: 200 })).toEqual({
      w: 400,
      h: 200,
    });
  });

  it('keeps values that refine (what the store would persist anyway)', () => {
    const editor = makeEditor({ scale: { validate: () => 2 } });
    expect(sanitizeShapeProps(editor, 'geo', { scale: 1 })).toEqual({ scale: 2 });
  });

  it('fails open without a real editor (unit seams): props pass through', () => {
    const notAnEditor = {} as Editor;
    const props = { geo: 'roundRectangle', w: 10 };
    expect(sanitizeShapeProps(notAnEditor, 'geo', props)).toEqual(props);
  });

  it('sanitizes nothing useful out of non-object input', () => {
    const editor = makeEditor({});
    expect(sanitizeShapeProps(editor, 'geo', null)).toEqual({});
    expect(sanitizeShapeProps(editor, 'geo', [1, 2])).toEqual({});
    expect(sanitizeShapeProps(editor, 'geo', 'text')).toEqual({});
  });
});
