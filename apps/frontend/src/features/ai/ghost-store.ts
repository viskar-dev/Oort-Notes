import { create } from 'zustand';

/**
 * Glowing ghosts on the canvas: while an executor is about to create shapes,
 * it first announces the exact target geometry here, the canvas renders a
 * pulsing "loading" glow card in that spot, and only after a short dwell do
 * the real shapes land and the ghost dissolve. The prediction is honest —
 * the executor computes the geometry itself, so the ghost IS the final box.
 */

/** One ghost, in canvas (page-space) coordinates. */
export interface AiGhostBox {
  id: string;
  x: number;
  y: number;
  w: number;
  h: number;
}

interface AiGhostState {
  ghosts: AiGhostBox[];
  /** Announce one executor's target boxes; returns the batch id for removal. */
  push: (boxes: Array<{ x: number; y: number; w: number; h: number }>) => string;
  /** Withdraw one executor's ghosts (replace with the real shapes). */
  remove: (id: string) => void;
  /** Turn ended or failed: nothing may keep glowing. */
  clear: () => void;
}

let seq = 0;

/** The glow beat before real shapes replace the ghosts. Mutable on purpose:
 *  tests set it near 0 so executor tests don't eat a dwell per creation. */
export const ghostConfig = { dwellMs: 650 };

export const useAiGhostStore = create<AiGhostState>((set) => ({
  ghosts: [],
  push: (boxes) => {
    const id = `ghost-${++seq}`;
    set((state) => ({
      ghosts: [
        ...state.ghosts,
        ...boxes
          .filter(
            (box) =>
              box.w > 0 && box.h > 0 && Number.isFinite(box.x) && Number.isFinite(box.y),
          )
          .map((box) => ({ ...box, id: `${id}:${state.ghosts.length}` })),
      ],
    }));
    return id;
  },
  remove: (id) =>
    set((state) => ({
      ghosts: state.ghosts.filter((ghost) => !ghost.id.startsWith(`${id}:`)),
    })),
  clear: () => set({ ghosts: [] }),
}));
