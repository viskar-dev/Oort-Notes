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
});
