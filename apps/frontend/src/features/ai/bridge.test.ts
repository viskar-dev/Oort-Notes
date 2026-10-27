import { describe, expect, it, vi } from 'vitest';
import { EXECUTED_TOOLS, handleCanvasCall, missingExecutors, type BridgeIo } from './bridge';

function makeIo(overrides: Partial<BridgeIo> = {}): BridgeIo & {
  answers: Array<{ id: string; ok: boolean; error: string | null; result: unknown }>;
} {
  const answers: Array<{ id: string; ok: boolean; error: string | null; result: unknown }> = [];
  return {
    answers,
    chapterId: () => 'chapter-1',
    runTool: vi.fn(async () => ({ ok: 1 })),
    answer: async (id, ok, error, result) => {
      answers.push({ id, ok, error, result });
    },
    ...overrides,
  };
}

describe('handleCanvasCall', () => {
  it('pinned calls run the executor and answer ok', async () => {
    const runTool = vi.fn(async () => ({ shapes: [] }));
    const io = makeIo({ runTool });
    await handleCanvasCall(io, { id: 'c1', name: 'get_canvas', args: {}, canvas_id: 'chapter-1', origin: 'assistant' });
    expect(runTool).toHaveBeenCalledWith('get_canvas', {}, 'assistant');
    expect(io.answers).toEqual([{ id: 'c1', ok: true, error: null, result: { shapes: [] } }]);
  });

  it('passes the args and the origin through untouched', async () => {
    const runTool = vi.fn(async () => ({}));
    const io = makeIo({ runTool });
    const args = { ids: ['shape:a'], confirmed: true };
    await handleCanvasCall(io, { id: 'c2', name: 'delete_shapes', args, canvas_id: 'chapter-1', origin: 'mcp' });
    expect(runTool).toHaveBeenCalledWith('delete_shapes', args, 'mcp');
  });

  it('rejects calls whose canvas pin no longer matches', async () => {
    const runTool = vi.fn();
    const io = makeIo({ runTool });
    await handleCanvasCall(io, { id: 'c3', name: 'get_canvas', args: {}, canvas_id: 'other', origin: 'assistant' });
    expect(runTool).not.toHaveBeenCalled();
    expect(io.answers).toEqual([
      {
        id: 'c3',
        ok: false,
        error: 'the open canvas changed while the AI was working',
        result: null,
      },
    ]);
  });

  it('executor errors become the answer error, results never success', async () => {
    const runTool = vi.fn(async () => {
      throw new Error('exec boom');
    });
    const io = makeIo({ runTool });
    await handleCanvasCall(io, { id: 'c4', name: 'create_shapes', args: {}, canvas_id: 'chapter-1', origin: 'assistant' });
    expect(io.answers).toEqual([
      { id: 'c4', ok: false, error: 'exec boom', result: null },
    ]);
  });

  it('stringifies thrown non-Error values', async () => {
    const runTool = vi.fn(async () => {
      throw 'plain string failure';
    });
    const io = makeIo({ runTool });
    await handleCanvasCall(io, { id: 'c5', name: 'x', args: {}, canvas_id: 'chapter-1', origin: 'assistant' });
    expect(io.answers[0].error).toBe('plain string failure');
  });

  it('missing args arrive as an empty object', async () => {
    const runTool = vi.fn(async () => ({}));
    const io = makeIo({ runTool });
    await handleCanvasCall(io, { id: 'c6', name: 'get_selection', canvas_id: 'chapter-1', origin: 'assistant' });
    expect(runTool).toHaveBeenCalledWith('get_selection', {}, 'assistant');
  });

  it('begins and ends the busy indicator around every run, including failures', async () => {
    const order: string[] = [];
    const busy = {
      begin: () => order.push('begin'),
      end: () => order.push('end'),
    };
    const failing = vi.fn(async () => {
      order.push('run');
      throw new Error('exec boom');
    });
    const io = makeIo({ runTool: failing, busy });
    await handleCanvasCall(io, { id: 'c7', name: 'create_note', args: {}, canvas_id: 'chapter-1', origin: 'assistant' });
    expect(order).toEqual(['begin', 'run', 'end']);
    expect(io.answers).toEqual([{ id: 'c7', ok: false, error: 'exec boom', result: null }]);
  });

  it('settles the renderer before answering, after the executor finished', async () => {
    const order: string[] = [];
    const runTool = vi.fn(async () => {
      order.push('run');
      return { ok: 1 };
    });
    const settle = vi.fn(async () => {
      order.push('settle');
    });
    const answered: Array<{ id: string; ok: boolean; error: string | null; result: unknown }> = [];
    const answer = async (
      id: string,
      ok: boolean,
      error: string | null,
      result: Record<string, unknown> | null,
    ) => {
      order.push('answer');
      answered.push({ id, ok, error, result });
    };
    const io = makeIo({ runTool, settle, answer });
    await handleCanvasCall(io, { id: 'c8', name: 'create_card', args: {}, canvas_id: 'chapter-1', origin: 'assistant' });
    expect(answered).toEqual([{ id: 'c8', ok: true, error: null, result: { ok: 1 } }]);
    expect(order.slice(-2)).toEqual(['settle', 'answer']);
  });
});

describe('missingExecutors', () => {
  it('is empty when every registry name is implemented', () => {
    expect(missingExecutors([...EXECUTED_TOOLS])).toEqual([]);
  });

  it('reports unknown registry names', () => {
    expect(missingExecutors(['get_canvas', 'teleport_user'])).toEqual(['teleport_user']);
  });
});
