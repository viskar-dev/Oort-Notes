import { create } from 'zustand';

/**
 * Glowing ghosts on the canvas: while an executor is about to create shapes,
 * it first announces the exact target geometry here, the canvas renders a
 * pulsing "loading" glow card in that spot, and only after a short dwell do
 * the real shapes land and the ghost dissolve. The prediction is honest —
 * the executor computes the geometry itself, so the ghost IS the final box
 * (page-space aspect ratio included; the layer scales it to the screen).
 */

/** One ghost box, in canvas (page-space) coordinates. */
export interface AiGhostBox {
  id: string;
  /** The announcing batch — removal matches this exactly (a startsWith
   *  prefix used to collide: batch 1's remove would also wipe batches 10+,
   *  killing another executor's glow mid-shimmer). */
  batch: string;
  /** 'create' = a filled "something is forming here" card over empty ground;
   *  'edit' = a shimmer laid ON the shape being transformed (see-through, so
   *  the original stays visible while it converts). */
  kind: 'create' | 'edit';
  x: number;
  y: number;
  w: number;
  h: number;
}

interface AiGhostState {
  ghosts: AiGhostBox[];
  /** Announce one executor's target boxes; returns the batch id for removal. */
  push: (
    boxes: Array<{ kind?: 'create' | 'edit'; x: number; y: number; w: number; h: number }>,
  ) => string;
  /** Withdraw one executor's ghosts (replace with the real shapes). */
  remove: (batch: string) => void;
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
    const batch = `ghost-${++seq}`;
    set((state) => ({
      ghosts: [
        ...state.ghosts,
        ...boxes
          .filter(
            (box) =>
              box.w > 0 && box.h > 0 && Number.isFinite(box.x) && Number.isFinite(box.y),
          )
          .map((box) => ({
            kind: box.kind ?? ('create' as const),
            ...box,
            batch,
            id: `${batch}:${state.ghosts.length}`,
          })),
      ],
    }));
    return batch;
  },
  remove: (batch) => {
    set((state) => ({
      ghosts: state.ghosts.filter((ghost) => ghost.batch !== batch),
    }));
  },
  clear: () => set({ ghosts: [] }),
}));
