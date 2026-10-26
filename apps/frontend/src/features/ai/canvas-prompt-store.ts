import { create } from 'zustand';
import type { Editor, TLShapeId } from 'tldraw';

/** Two-decimal world coords: the model sends these back in tool args; full
 *  float precision is noise for placement. */
const snap = (value: number) => Math.round(value * 100) / 100;

/**
 * The right-click → "AI help" floating prompt.
 *
 * A window-level capture from the canvas shell snapshots the right-clicks'
 * exact geometry (client position for the card, world position via the
 * editor, current selection). Choosing "AI help…" in the canvas context
 * menu opens the card at that spot; submitting feeds the turn both the
 * prompt (visible in the transcript) and an anchor context (system-side:
 * world position + selected shapes) so creation lands right there.
 */
interface AiCanvasPromptState {
  open: boolean;
  /** Viewport (client) coords for the floating card. */
  at: { x: number; y: number } | null;
  /** World coords the request is anchored to. */
  world: { x: number; y: number } | null;
  /** Shape ids selected at right-click time — the request can update them. */
  selection: TLShapeId[];
  /** Snapshot from the last right-click (called from a capture listener). */
  capture: (editor: Editor, clientX: number, clientY: number) => void;
  /** Menu action: open at the captured geometry. False when never captured. */
  openPrompt: () => boolean;
  close: () => void;
}

export const useAiCanvasPromptStore = create<AiCanvasPromptState>((set, get) => ({
  open: false,
  at: null,
  world: null,
  selection: [],

  capture: (editor, clientX, clientY) => {
    // Defensive by design: this runs from a window-level listener, so any
    // editor quirk must degrade to "no capture", never to an exception.
    const container = editor.getContainer?.();
    const rect = container?.getBoundingClientRect?.();
    if (!rect) {
      set({ at: null, world: null, selection: [] });
      return;
    }
    // tldraw's "screen" space is container-relative.
    const world = editor.screenToWorld({
      x: clientX - rect.left,
      y: clientY - rect.top,
    });
    set({
      at: { x: clientX, y: clientY },
      world: { x: snap(world.x), y: snap(world.y) },
      selection: editor.getSelectedShapeIds(),
    });
  },

  openPrompt: () => {
    if (!get().at || !get().world) return false;
    set({ open: true });
    return true;
  },

  close: () => set({ open: false, at: null, world: null, selection: [] }),
}));
