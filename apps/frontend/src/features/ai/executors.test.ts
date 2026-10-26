import { describe, expect, it, vi } from 'vitest';
import { executeAiTool, type AiExecutorDeps } from './executors';
import { useViewModeStore } from '@/stores/view-mode-store';
import { useAiConfirmStore } from './confirm-store';

/** executors only needs the handful of editor methods its filters touch. */
function makeEditor(): AiExecutorDeps['editor'] {
  return {
    run: (fn: () => void) => fn(),
    getSelectedShapeIds: vi.fn(() => []),
    getCurrentPageShapeIds: vi.fn(() => new Set()),
    getShape: vi.fn(() => null),
  } as unknown as AiExecutorDeps['editor'];
}

function deps(): AiExecutorDeps {
  return {
    editor: makeEditor(),
    context: () => ({ canvas_type: 'infinite', page: null }),
    confirm: async () => true,
    readOnly: () => useViewModeStore.getState().on,
  };
}

describe('executeAiTool routing', () => {
  it('rejects unknown tools with a readable error', async () => {
    await expect(
      executeAiTool(deps(), 'remote_wipe', {}),
    ).rejects.toThrow('no executor for "remote_wipe"');
  });

  it('rejects mutations in view mode before touching the editor', async () => {
    useViewModeStore.setState({ on: true });
    try {
      await expect(
        executeAiTool(deps(), 'create_shapes', { shapes: [{ type: 'geo' }] }),
      ).rejects.toThrow('view mode');
      await expect(
        executeAiTool(deps(), 'delete_shapes', { ids: ['shape:a'] }),
      ).rejects.toThrow('view mode');
      // Reads still work in view mode (get_canvas also reports the context).
      await expect(executeAiTool(deps(), 'get_canvas', {})).resolves.toEqual({
        shapes: [],
        canvas: { canvas_type: 'infinite', page: null },
      });
    } finally {
      useViewModeStore.setState({ on: false });
    }
  });

  it('create_note requires a text field', async () => {
    await expect(
      executeAiTool(deps(), 'create_note', { x: 1 }),
    ).rejects.toThrow('"text" is required');
  });

  it('get_shape returns the full unclipped state of one shape', async () => {
    const longCode = 'x = 1\n'.repeat(500); // ~3000 chars, far past the outline clip
    const editor = {
      ...makeEditor(),
      getShape: vi.fn((id: string) =>
        id === 'shape:k'
          ? {
              id: 'shape:k',
              type: 'code-block',
              x: 1.234567,
              y: 9.876543,
              parentId: 'page:1',
              props: { code: longCode, language: 'python' },
            }
          : null,
      ),
      getShapeGeometry: vi.fn(() => ({ bounds: { w: 560, h: 300 } })),
    } as unknown as AiExecutorDeps['editor'];

    const state = await executeAiTool({ ...deps(), editor }, 'get_shape', { shape_id: 'shape:k' });
    expect(state.type).toBe('code-block');
    // Full precision coordinates: an edit can put it back exactly.
    expect(state.x).toBe(1.234567);
    expect(state.y).toBe(9.876543);
    expect(state.w).toBe(560);
    expect(state.h).toBe(300);
    // Props go out verbatim — the outline's 600-char clip must not apply.
    expect((state.props as { code: string }).code).toHaveLength(longCode.length);
    expect((state.props as { code: string }).code.includes('…')).toBe(false);

    await expect(
      executeAiTool({ ...deps(), editor }, 'get_shape', { shape_id: 'shape:gone' }),
    ).rejects.toThrow('no shape with id shape:gone');
    await expect(
      executeAiTool({ ...deps(), editor }, 'get_shape', { shape_id: 'page:1' }),
    ).rejects.toThrow('starts with "shape:"');
  });

  it('create_shapes requires a non-empty allow-listed array', async () => {
    await expect(executeAiTool(deps(), 'create_shapes', { shapes: [] })).rejects.toThrow(
      'non-empty array',
    );
    await expect(
      executeAiTool(deps(), 'create_shapes', { shapes: [{ type: 'icon' }] }),
    ).rejects.toThrow('type must be one of');
  });

  it('create_diagram validates node ids', async () => {
    await expect(
      executeAiTool(deps(), 'create_diagram', { nodes: [{ id: '', label: 'x' }], edges: [] }),
    ).rejects.toThrow('non-empty "id"');
    await expect(
      executeAiTool(deps(), 'create_diagram', {
        nodes: [
          { id: 'a', label: 'x' },
          { id: 'a', label: 'y' },
        ],
        edges: [],
      }),
    ).rejects.toThrow('unique');
  });

  it('update_shapes requires real shape ids', async () => {
    await expect(
      executeAiTool(deps(), 'update_shapes', { updates: [{ id: 'page:1' }] }),
    ).rejects.toThrow('shape "id"');
  });

  it('delete_shapes asks the user before deleting anything', async () => {
    const requests: Array<{ title: string; detail: string }> = [];
    useAiConfirmStore.setState({
      requestConfirm: async (title, detail) => {
        requests.push({ title, detail });
        return false; // user declines
      },
    });
    const editor = {
      ...makeEditor(),
      getShape: vi.fn(() => ({ id: 'shape:a' })),
      deleteShapes: vi.fn(),
    } as unknown as AiExecutorDeps['editor'];
    await expect(
      executeAiTool({ ...deps(), editor }, 'delete_shapes', { ids: ['shape:a'] }),
    ).rejects.toThrow('cancelled by the user');
    expect(requests).toHaveLength(1);
    expect(editor.deleteShapes).not.toHaveBeenCalled();
  }, 5000);

  // -----------------------------------------------------------------
  // create_shapes placement
  // -----------------------------------------------------------------

  /** Editor that reports one content block (100..300 × 100..200) and a
   *  1600×1000 viewport, the minimum the placement math touches. */
  function placedDeps(): { deps: AiExecutorDeps; editor: AiExecutorDeps['editor'] } {
    const editor = {
      ...makeEditor(),
      getCurrentPageShapeIds: vi.fn(() => new Set(['shape:a'])),
      getShape: vi.fn(() => ({ id: 'shape:a' })),
      getShapePageBounds: vi.fn(() => ({ minX: 100, minY: 100, maxX: 300, maxY: 200, w: 200, h: 100 })),
      getViewportPageBounds: vi.fn(() => ({ x: 0, y: 0, w: 1600, h: 1000 })),
      createShape: vi.fn(),
    } as unknown as AiExecutorDeps['editor'];
    return { editor, deps: { ...deps(), editor } };
  }

  it('places x/y-less entries as a column below existing content', async () => {
    const { editor, deps: d } = placedDeps();
    await executeAiTool(d, 'create_shapes', { shapes: [{ type: 'text' }, { type: 'text' }] });
    // Batch anchor: content right edge + gap, aligned with content top —
    // both planned shapes share the column x; offsets keep their order.
    const codes = editor.createShape.mock.calls.map((c) => ({ x: c[0].x, y: c[0].y }));
    expect(codes).toHaveLength(2);
    expect(codes[0]).toEqual({ x: expect.closeTo(80, 0), y: expect.closeTo(272, 0) });
    expect(codes[1]).toEqual({ x: expect.closeTo(80, 0), y: expect.closeTo(386, 0) });
    // Nothing was dropped at world origin.
    expect(codes.every((p) => p.x !== 0 || p.y !== 0)).toBe(true);
  });

  it('honors explicit x/y exactly and skips planning for them', async () => {
    const { editor, deps: d } = placedDeps();
    const result = await executeAiTool(d, 'create_shapes', {
      shapes: [{ type: 'geo', x: -77, y: 1234, props: { w: 10, h: 10 } }],
    });
    expect(result.created).toHaveLength(1);
    expect(editor.createShape.mock.calls[0][0]).toMatchObject({ x: -77, y: 1234 });
    // Explicit positions are never clamped or moved: no region read at all.
    expect(editor.getViewportPageBounds).not.toHaveBeenCalled();
  });

  it('plans only the x/y-less entries in a mixed batch', async () => {
    const { editor, deps: d } = placedDeps();
    await executeAiTool(d, 'create_shapes', {
      shapes: [
        { type: 'geo', x: 500, y: 900, props: { w: 60, h: 60 } },
        { type: 'text' },
      ],
    });
    const calls = editor.createShape.mock.calls.map((c) => ({ type: c[0].type, x: c[0].x, y: c[0].y }));
    expect(calls[0]).toMatchObject({ type: 'geo', x: 500, y: 900 });
    expect(calls[1]).toMatchObject({ type: 'text' });
    expect(calls[1].x).not.toBe(0);
  });

  it('respects side for the planned anchor', async () => {
    const { editor, deps: d } = placedDeps();
    await executeAiTool(d, 'create_shapes', {
      shapes: [{ type: 'text' }, { type: 'geo', x: 0, y: 0, props: { w: 1, h: 1 } }],
      side: 'right',
    });
    const text = editor.createShape.mock.calls[0][0];
    // content.x + content.w + LAYOUT_GAP = 372, vertically on content top.
    expect(text.x).toBeCloseTo(372, 0);
    expect(text.y).toBeCloseTo(100, 0);
  });

  it('reports validation errors while still creating valid entries', async () => {
    const { editor, deps: d } = placedDeps();
    const result = await executeAiTool(d, 'create_shapes', {
      shapes: [{ type: 'icon' }, { type: 'text' }],
    });
    expect(result.created).toHaveLength(1);
    expect(result.errors).toEqual([
      expect.stringContaining('shape 0: type must be one of'),
    ]);
    expect(editor.createShape).toHaveBeenCalledTimes(1);
  });

  it('rejects an all-invalid batch with the first error', async () => {
    const { editor, deps: d } = placedDeps();
    await expect(
      executeAiTool(d, 'create_shapes', { shapes: [{ type: 'geo', props: { w: 4 } }] }),
    ).rejects.toThrow('geo shapes need numeric "w" and "h"');
    expect(editor.createShape).not.toHaveBeenCalled();
  });
});
