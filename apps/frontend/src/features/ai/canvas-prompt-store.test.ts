import { afterEach, describe, expect, it } from 'vitest';
import type { Editor, TLShapeId } from 'tldraw';
import { useAiCanvasPromptStore } from './canvas-prompt-store';

/** Minimal editor: screenToPage halves the client coords (so the conversion
 *  is verifiable) and reports a canned selection. tldraw's screen space is
 *  the browser viewport, so capture must pass client coords through. */
function fakeEditor(overrides?: { selection?: TLShapeId[] }) {
  const selection = overrides?.selection ?? [];
  return {
    screenToPage: ({ x, y }: { x: number; y: number }) => ({ x: x / 2, y: y / 2 }),
    getSelectedShapeIds: () => selection,
  } as unknown as Editor;
}

describe('canvas prompt capture', () => {
  afterEach(() => {
    useAiCanvasPromptStore.getState().close();
  });

  it('capture stores client coords, snapped page coords and the selection', () => {
    const editor = fakeEditor({
      // client (260, 211.256) → page (130, 105.628), which snaps to 2dp
      selection: ['shape:A' as TLShapeId, 'shape:B' as TLShapeId],
    });
    useAiCanvasPromptStore.getState().capture(editor, 260, 211.256);

    const s = useAiCanvasPromptStore.getState();
    expect(s.at).toEqual({ x: 260, y: 211.256 });
    expect(s.page).toEqual({ x: 130, y: 105.63 });
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

  it('a capture against an editor without screenToPage resets the geometry', () => {
    // The live bug this guards: tldraw forks without screenToWorld — capture
    // must degrade to "no capture", never throw.
    const broken = { getSelectedShapeIds: () => [] } as unknown as Editor;
    expect(() =>
      useAiCanvasPromptStore.getState().capture(broken, 12, 34),
    ).not.toThrow();
    expect(useAiCanvasPromptStore.getState().openPrompt()).toBe(false);

    // A later good capture re-arms the prompt.
    useAiCanvasPromptStore.getState().capture(fakeEditor(), 12, 34);
    expect(useAiCanvasPromptStore.getState().openPrompt()).toBe(true);
  });

  it('a throwing editor never escapes the capture', () => {
    const throwing = {
      screenToPage: () => {
        throw new Error('camera exploded');
      },
    } as unknown as Editor;
    expect(() =>
      useAiCanvasPromptStore.getState().capture(throwing, 5, 6),
    ).not.toThrow();
    expect(useAiCanvasPromptStore.getState().openPrompt()).toBe(false);
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
    expect(s.page).toBeNull();
    expect(s.selection).toEqual([]);
  });
});
