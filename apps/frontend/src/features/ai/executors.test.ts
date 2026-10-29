import { describe, expect, it, vi } from 'vitest';
import { executeAiTool, type AiExecutorDeps } from './executors';
import { ghostConfig } from './ghost-store';
import { useViewModeStore } from '@/stores/view-mode-store';
import { useAiConfirmStore } from './confirm-store';
import { useAiPolicyStore } from './policy-store';

// The executor's ghost-glow dwell is a screen-beat, not logic: skip it here
// so the placement tests keep running fast.
ghostConfig.dwellMs = 0;

/** executors only needs the handful of editor methods its filters touch. */
function makeEditor(): AiExecutorDeps['editor'] {
  return {
    run: (fn: () => void) => fn(),
    getSelectedShapeIds: vi.fn(() => []),
    getCurrentPageShapeIds: vi.fn(() => new Set()),
    getShape: vi.fn(() => null),
  } as unknown as AiExecutorDeps['editor'];
}

/** Recorded createShape calls. The editor is cast to the real `Editor`
 *  type, so the spy's `.mock` must be read through a narrow cast here. */
function createShapeCalls(editor: AiExecutorDeps['editor']): Array<{
  type?: string;
  x?: number;
  y?: number;
  props: { scale?: number; autoSize?: boolean } & Record<string, unknown>;
}> {
  return (
    editor.createShape as unknown as {
      mock: {
        calls: Array<[{ type?: string; x?: number; y?: number; props: { scale?: number; autoSize?: boolean } & Record<string, unknown> }]>;
      };
    }
  ).mock.calls.map((call) => call[0]);
}

function deps(): AiExecutorDeps {
  return {
    editor: makeEditor(),
    context: () => ({ canvas_type: 'infinite', page: null }),
    confirm: async () => true,
    readOnly: () => useViewModeStore.getState().on,
    origin: 'assistant',
    destructivePolicy: () => useAiPolicyStore.getState().policy,
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

  it('create_text places native text and applies heading scale', async () => {
    const { editor, deps: d } = placedDeps();
    const value = await executeAiTool(d, 'create_text', { text: 'Optics', heading: true });
    expect((value.created as string).startsWith('shape:')).toBe(true);
    const created = createShapeCalls(editor)[0];
    expect(created.type).toBe('text');
    expect(created.props.scale).toBe(2);
    expect(created.props.autoSize).toBe(true);
    // Heading text anchors below the content block, inside the viewport.
    expect(created.y).toBeGreaterThan(200);
    expect(created.y).toBeLessThan(1000);

    await expect(executeAiTool(d, 'create_text', { x: 5 })).rejects.toThrow('"text" is required');
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

  it('get_canvas outlines report sheet membership in pages mode', async () => {
    // Two shapes on sheet 0 and 1 of a 3-sheet 800×1100 stack; one more on
    // sheet 2 beyond the last, and one above y=0 — all must clamp.
    const editor = {
      ...makeEditor(),
      getCurrentPageShapeIds: vi.fn(() => new Set(['shape:a', 'shape:b', 'shape:c', 'shape:d'])),
      getShape: vi.fn((id: string) => {
        const ys: Record<string, number> = {
          'shape:a': 10,
          'shape:b': 1100 + 40 + 300,
          'shape:c': 2 * (1100 + 40) + 500,
          'shape:d': -500,
        };
        return { id, type: 'text', x: 100, y: ys[id], parentId: 'page:1', props: {} };
      }),
      getShapeGeometry: vi.fn(() => ({ bounds: { w: 100, h: 50 } })),
    } as unknown as AiExecutorDeps['editor'];
    const ctx = () => ({
      canvas_type: 'page' as const,
      page: { width: 800, height: 1100, gap: 40, count: 3 },
    });

    const value = await executeAiTool({ ...deps(), editor, context: ctx }, 'get_canvas', {});
    const shapes = value.shapes as Array<{ id: string; sheet_index?: number }>;
    expect(shapes.find((s) => s.id === 'shape:a')!.sheet_index).toBe(0);
    expect(shapes.find((s) => s.id === 'shape:b')!.sheet_index).toBe(1);
    expect(shapes.find((s) => s.id === 'shape:c')!.sheet_index).toBe(2);
    expect(shapes.find((s) => s.id === 'shape:d')!.sheet_index).toBe(0);
  });

  it('get_canvas leaves sheet membership off infinite canvases', async () => {
    const editor = {
      ...makeEditor(),
      getCurrentPageShapeIds: vi.fn(() => new Set(['shape:a'])),
      getShape: vi.fn(() => ({ id: 'shape:a', type: 'text', x: 100, y: 1140, parentId: 'page:1', props: {} })),
      getShapeGeometry: vi.fn(() => ({ bounds: { w: 100, h: 50 } })),
    } as unknown as AiExecutorDeps['editor'];
    const value = await executeAiTool({ ...deps(), editor }, 'get_canvas', {});
    expect((value.shapes as Array<Record<string, unknown>>)[0].sheet_index).toBeUndefined();
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

  it('delete_shapes never self-approves for the assistant, even with confirmed', async () => {
    const requests: Array<{ title: string }> = [];
    useAiConfirmStore.setState({
      requestConfirm: async (title) => {
        requests.push({ title });
        return true;
      },
    });
    const editor = {
      ...makeEditor(),
      getShape: vi.fn(() => ({ id: 'shape:a' })),
      deleteShapes: vi.fn(),
    } as unknown as AiExecutorDeps['editor'];
    // The model passing "confirmed": true must not bypass the app's card.
    await executeAiTool(
      { ...deps(), editor },
      'delete_shapes',
      { ids: ['shape:a'], confirmed: true },
    );
    expect(requests).toHaveLength(1); // the card showed
    expect(editor.deleteShapes).toHaveBeenCalledWith(['shape:a']);
  }, 5000);

  it('mcp delete returns requires_confirmation without any desktop UI', async () => {    const confirmSpy = vi.fn();
    useAiConfirmStore.setState({ requestConfirm: confirmSpy });
    const editor = {
      ...makeEditor(),
      getShape: vi.fn(() => ({ id: 'shape:a' })),
      deleteShapes: vi.fn(),
    } as unknown as AiExecutorDeps['editor'];

    // Unconfirmed: a structured result the client model acts on — no card,
    // no error, no deletion.
    const pending = await executeAiTool(
      { ...deps(), editor, origin: 'mcp' },
      'delete_shapes',
      { ids: ['shape:a'] },
    );
    expect(pending).toMatchObject({ status: 'requires_confirmation', count: 1 });
    expect(String(pending.prompt).includes('confirmed')).toBe(true);
    expect(confirmSpy).not.toHaveBeenCalled();
    expect(editor.deleteShapes).not.toHaveBeenCalled();

    // The client confirms in its own UI and re-sends: deletion proceeds,
    // still without desktop UI.
    const done = await executeAiTool(
      { ...deps(), editor, origin: 'mcp' },
      'delete_shapes',
      { ids: ['shape:a'], confirmed: true },
    );
    expect(done).toEqual({ deleted: ['shape:a'] });
    expect(editor.deleteShapes).toHaveBeenCalledTimes(1);
    expect(confirmSpy).not.toHaveBeenCalled();
  }, 5000);

  it('mcp delete runs immediately under the auto_confirm policy', async () => {
    const confirmSpy = vi.fn();
    useAiConfirmStore.setState({ requestConfirm: confirmSpy });
    try {
      useAiPolicyStore.setState({ policy: 'auto_confirm' });
      const editor = {
        ...makeEditor(),
        getShape: vi.fn(() => ({ id: 'shape:a' })),
        deleteShapes: vi.fn(),
      } as unknown as AiExecutorDeps['editor'];

      // The user opted MCP clients into trusted destructive calls: the
      // requires_confirmation round-trip is skipped and the shapes go.
      const done = await executeAiTool(
        { ...deps(), editor, origin: 'mcp' },
        'delete_shapes',
        { ids: ['shape:a'] },
      );
      expect(done).toEqual({ deleted: ['shape:a'] });
      expect(editor.deleteShapes).toHaveBeenCalledWith(['shape:a']);
      expect(confirmSpy).not.toHaveBeenCalled();
    } finally {
      // Policy is a global store: never leak auto_confirm into other tests.
      useAiPolicyStore.setState({ policy: 'ask' });
    }
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
    const codes = createShapeCalls(editor).map((c) => ({ x: c.x, y: c.y }));
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
    expect(createShapeCalls(editor)[0]).toMatchObject({ x: -77, y: 1234 });
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
    const calls = createShapeCalls(editor).map((c) => ({ type: c.type, x: c.x, y: c.y }));
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
    const text = createShapeCalls(editor)[0];
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

  // -----------------------------------------------------------------
  // add_page: the topic is a decision the caller makes
  // -----------------------------------------------------------------

  /** Pages capability: two topics, first one active with two sheets. */
  function pagesDeps(
    overrides: Partial<{
      active_topic_id: string;
      topics: Array<{ id: string; name: string; page_count?: number }>;
      addPage: (topicId: string) => Promise<{ id: string; name: string; index: number }>;
    }> = {},
  ): {
    deps: AiExecutorDeps;
    addPage: ReturnType<typeof vi.fn>;
  } {
    const addPage = vi.fn(async (topicId: string) => ({
      id: 'tp:new',
      name: String(topicId === 't1' ? 3 : 1),
      index: topicId === 't1' ? 2 : 0,
    }));
    const capability = {
      active_topic_id: 't1',
      topics: [
        { id: 't1', name: 'Reflection', page_count: 2 },
        { id: 't2', name: 'Refraction' },
      ],
      addPage,
      ...overrides,
    };
    const d = {
      ...deps(),
      context: () => ({
        canvas_type: 'page' as const,
        page: { width: 800, height: 1100, gap: 40, count: 2 },
      }),
      pages: () => capability,
    };
    return { deps: d, addPage };
  }

  it('add_page asks the caller which topic via requires_input (no desktop UI)', async () => {
    const { deps: d } = pagesDeps();
    const confirmSpy = vi.fn();
    useAiConfirmStore.setState({ requestConfirm: confirmSpy });
    const value = await executeAiTool(d, 'add_page', {});
    expect(value.status).toBe('requires_input');
    expect(value.input).toBe('topic_id');
    expect(String(value.prompt).includes('topic_id')).toBe(true);
    const options = value.topics as Array<{ id: string; name: string; page_count?: number; active?: boolean }>;
    expect(options).toHaveLength(2);
    expect(options.find((t) => t.id === 't1')).toMatchObject({ name: 'Reflection', page_count: 2, active: true });
    expect(options.find((t) => t.id === 't2')).toMatchObject({ name: 'Refraction' });
    expect(options.find((t) => t.id === 't2')!.page_count).toBeUndefined();
    expect(confirmSpy).not.toHaveBeenCalled();
  });

  it('add_page creates directly when the model picks a topic_id', async () => {
    const { deps: d, addPage } = pagesDeps();
    const value = await executeAiTool(d, 'add_page', { topic_id: 't2' });
    expect(addPage).toHaveBeenCalledWith('t2');
    expect(value).toMatchObject({ created_page: { id: 'tp:new', index: 0 }, topic: { name: 'Refraction' } });
  });

  it('add_page uses the only topic without a decision', async () => {
    const { deps: d, addPage } = pagesDeps({
      topics: [{ id: 'only', name: 'Solo', page_count: 1 }],
      active_topic_id: 'only',
    });
    const value = await executeAiTool(d, 'add_page', {});
    expect(addPage).toHaveBeenCalledWith('only');
    expect(value.topic).toEqual({ id: 'only', name: 'Solo' });
    expect(value.status).toBeUndefined();
  });

  it('add_page rejects unknown topic ids with the topic names', async () => {
    const { deps: d } = pagesDeps();
    await expect(executeAiTool(d, 'add_page', { topic_id: 'nope' })).rejects.toThrow(
      'no topic with id "nope"',
    );
  });

  it('add_page fails readably off pages mode', async () => {
    await expect(executeAiTool(deps(), 'add_page', { topic_id: 't1' })).rejects.toThrow(
      'page-type canvases only',
    );
  });
});

describe('convert_selection', () => {
  const DIAGRAM_ARGS = {
    nodes: [
      { id: 'n1', label: 'Light in' },
      { id: 'n2', label: 'Refract' },
    ],
    edges: [{ from: 'n1', to: 'n2', label: 'bends' }],
  };

  /** Selection of one shape at (40, 12) whose content the model turned into
   *  DIAGRAM_ARGS; diagram creation runs against the same minimal mock the
   *  create_diagram path needs (no planning — x/y are pinned by the tool). */
  function convertDeps(approves: (title: string) => boolean = () => true): {
    deps: AiExecutorDeps;
    editor: AiExecutorDeps['editor'];
    confirmCalls: string[];
  } {
    const confirmCalls: string[] = [];
    const confirm = async (title: string, _detail: string) => {
      confirmCalls.push(title);
      return approves(title);
    };
    const editor = {
      ...makeEditor(),
      getSelectedShapeIds: vi.fn(() => ['shape:a']),
      getShape: vi.fn(() => ({ id: 'shape:a' })),
      getShapePageBounds: vi.fn(() => ({ x: 200, y: 300, w: 120, h: 60, minX: 200, minY: 300, maxX: 320, maxY: 360 })),
      getViewportPageBounds: vi.fn(() => ({ x: 0, y: 0, w: 1600, h: 1000 })),
      createShape: vi.fn(),
      createBinding: vi.fn(),
      getBindingsFromShape: vi.fn(() => []),
      deleteShapes: vi.fn(),
    } as unknown as AiExecutorDeps['editor'];
    return { deps: { ...deps(), editor, confirm }, editor, confirmCalls };
  }

  // The confirm card precedes everything: convert deletes user content.
  it('asks before swapping the selection for a diagram', async () => {
    useAiPolicyStore.setState({ policy: 'ask' });
    const { deps: d, editor, confirmCalls } = convertDeps();
    const value = await executeAiTool(d, 'convert_selection', DIAGRAM_ARGS);
    expect(confirmCalls).toHaveLength(1);
    expect(confirmCalls[0]).toBe('Convert selection?');
    expect((value as Record<string, unknown> & { deleted: string[] }).deleted).toEqual(['shape:a']);
    // The diagram took the selection's top-left, not a planned slot.
    expect((value as Record<string, unknown> & { x: number }).x).toBe(200);
    expect((value as Record<string, unknown> & { y: number }).y).toBe(300);
    expect(editor.deleteShapes).toHaveBeenCalledTimes(1);
  });

  it('declines the card and nothing is touched', async () => {
    const { deps: d, editor } = convertDeps(() => false);
    await expect(executeAiTool(d, 'convert_selection', DIAGRAM_ARGS)).rejects.toThrow(
      'cancelled by the user',
    );
    expect(editor.deleteShapes).not.toHaveBeenCalled();
    expect(editor.createShape).not.toHaveBeenCalled();
  });

  it('fails cleanly when nothing is selected', async () => {
    const { deps: d } = convertDeps();
    const empty = { ...d.editor as object, getSelectedShapeIds: () => [] } as unknown as AiExecutorDeps['editor'];
    await expect(executeAiTool({ ...d, editor: empty }, 'convert_selection', DIAGRAM_ARGS)).rejects.toThrow(
      'nothing is selected',
    );
  });

  it('mcp convert returns requires_confirmation without any desktop UI', async () => {
    const confirmSpy = vi.fn();
    useAiConfirmStore.setState({ requestConfirm: confirmSpy });
    const { deps: d, editor } = convertDeps();
    const pending = await executeAiTool(
      { ...d, editor, origin: 'mcp' },
      'convert_selection',
      DIAGRAM_ARGS,
    );
    expect((pending as Record<string, unknown> & { status?: string }).status).toBe('requires_confirmation');
    expect(String(pending.prompt as string)).toContain('"confirmed": true');
    expect(confirmSpy).not.toHaveBeenCalled();
    expect(editor.deleteShapes).not.toHaveBeenCalled();
  });

  it('mcp convert with confirmed deletes and replaces', async () => {
    useAiPolicyStore.setState({ policy: 'ask' });
    const confirmSpy = vi.fn();
    useAiConfirmStore.setState({ requestConfirm: confirmSpy });
    const { deps: d, editor } = convertDeps();
    const value = await executeAiTool(
      { ...d, editor, origin: 'mcp' },
      'convert_selection',
      { ...DIAGRAM_ARGS, confirmed: true },
    );
    expect((value as Record<string, unknown> & { deleted: string[] }).deleted).toEqual(['shape:a']);
    expect(confirmSpy).not.toHaveBeenCalled();
    expect(editor.deleteShapes).toHaveBeenCalledTimes(1);
  });

  it('mcp auto-converts under the auto_confirm policy', async () => {
    useAiPolicyStore.setState({ policy: 'auto_confirm' });
    const { deps: d, editor } = convertDeps();
    const value = await executeAiTool(
      { ...d, editor, origin: 'mcp' },
      'convert_selection',
      DIAGRAM_ARGS,
    );
    expect(String((value as { status?: string }).status ?? '')).toBe('');
    expect((value as Record<string, unknown> & { deleted: string[] }).deleted).toEqual(['shape:a']);
    expect(editor.deleteShapes).toHaveBeenCalledTimes(1);
  });
});
