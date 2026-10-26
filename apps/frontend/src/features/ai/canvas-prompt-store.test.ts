import { afterEach, describe, expect, it } from 'vitest';
import type { Editor, TLShapeId } from 'tldraw';
import { useAiCanvasPromptStore } from './canvas-prompt-store';

/** Minimal editor: world = screen / 2 (so the conversion is verifiable),
 *  plus a fixed container rect and a canned selection. */
function fakeEditor(overrides?: {
  rect?: { left: number; top: number };
  selection?: TLShapeId[];
}) {
  const rect = overrides?.rect ?? { left: 100, top: 50 };
  const selection = overrides?.selection ?? [];
  return {
    getContainer: () => ({
      getBoundingClientRect: () => ({ ...rect, width: 800, height: 600 }),
    }),
    screenToWorld: ({ x, y }: { x: number; y: number }) => ({ x: x / 2, y: y / 2 }),
    getSelectedShapeIds: () => selection,
  } as unknown as Editor;
}

describe('canvas prompt capture', () => {
  afterEach(() => {
    useAiCanvasPromptStore.getState().close();
  });

  it('capture stores client coords, snapped world coords and the selection', () => {
    const editor = fakeEditor({
      // client (260, 261.256) → container-relative (160, 211.256)
      // → world (80, 105.628), which snaps to 2dp
      selection: ['shape:A' as TLShapeId, 'shape:B' as TLShapeId],
    });
    useAiCanvasPromptStore.getState().capture(editor, 260, 261.256);

    const s = useAiCanvasPromptStore.getState();
    expect(s.at).toEqual({ x: 260, y: 261.256 });
    expect(s.world).toEqual({ x: 80, y: 105.63 });
    expect(s.selection).toEqual(['shape:A', 'shape:B']);
    // Capture alone doesn't open the card.
    expect(s.open).toBe(false);
  });

  it('openPrompt opens at the captured geometry and reports false without one', () => {
    expect(useAiCanvasPromptStore.getState().openPrompt()).toBe(false);

    useAiCanvasPromptStore.getState().capture(fakeEditor(), 30, 40);
    expect(useAiCanvasPromptStore.getState().openPrompt()).toBe(true);
    expect(useAiCanvasPromptStore.getState().open).toBe(true);
  });

  it('a capture without a container resets the geometry so openPrompt refuses', () => {
    // No getContainer (canvas not mounted yet).
    const broken = {} as unknown as Editor;
    useAiCanvasPromptStore.getState().capture(broken, 12, 34);
    expect(useAiCanvasPromptStore.getState().openPrompt()).toBe(false);

    // A later good capture re-arms the prompt.
    useAiCanvasPromptStore.getState().capture(fakeEditor(), 12, 34);
    expect(useAiCanvasPromptStore.getState().openPrompt()).toBe(true);
  });

  it('close clears the geometry and selection', () => {
    useAiCanvasPromptStore.getState().capture(
      fakeEditor({ selection: ['shape:A' as TLShapeId] }),
      10,
      20,
    );
    useAiCanvasPromptStore.getState().openPrompt();
    useAiCanvasPromptStore.getState().close();

    const s = useAiCanvasPromptStore.getState();
    expect(s.open).toBe(false);
    expect(s.at).toBeNull();
    expect(s.world).toBeNull();
    expect(s.selection).toEqual([]);
  });
});
