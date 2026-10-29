import { create } from 'zustand';
import type { Editor, TLShapeId } from 'tldraw';

/** Two-decimal coords: the model sends these back in tool args; full float
 *  precision is noise for placement. */
const snap = (value: number) => Math.round(value * 100) / 100;

/**
 * The right-click → "AI help" floating prompt.
 *
 * A window-level capture from the canvas shell snapshots the right-click's
 * exact geometry (client position for the card, canvas position via the
 * editor, current selection). Choosing "AI help…" in the canvas context
 * menu opens the card at that spot; submitting feeds the turn both the
 * prompt (visible in the transcript) and an anchor context (system-side:
 * the click position + selected shapes) so creation lands right there.
 */
interface AiCanvasPromptState {
  open: boolean;
  /** Viewport (client) coords for the floating card. */
  at: { x: number; y: number } | null;
  /** Canvas (page-space) coords the request is anchored to — the same space
   *  the create tools take explicit x/y arguments in. */
  page: { x: number; y: number } | null;
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
  page: null,
  selection: [],

  capture: (editor, clientX, clientY) => {
    // Defensive by design: this runs from a window-level listener, so any
    // editor quirk must degrade to "no capture", never to an exception
    // (an unhandled rejection in the page would be hostile to the user).
    try {
      // tldraw's screen space is the browser viewport (client coords, no
      // container math) — the same convention CanvasShell and the wheel
      // handlers use for screenToPage.
      if (typeof editor.screenToPage !== 'function') {
        set({ at: null, page: null, selection: [] });
        return;
      }
      const page = editor.screenToPage({ x: clientX, y: clientY });
      set({
        at: { x: clientX, y: clientY },
        page: { x: snap(page.x), y: snap(page.y) },
        selection: editor.getSelectedShapeIds(),
      });
    } catch {
      set({ at: null, page: null, selection: [] });
    }
  },

  openPrompt: () => {
    if (!get().at || !get().page) return false;
    set({ open: true });
    return true;
  },

  close: () => set({ open: false, at: null, page: null, selection: [] }),
}));
