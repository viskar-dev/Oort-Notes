import { create } from 'zustand';

/**
 * Confirmation gate for destructive AI tools: an executor asks, the user
 * answers through the AI panel's inline card. One pending question at a
 * time — a new request cancels the previous one (the executor that asked
 * saw its promise resolved `false`).
 */
interface PendingConfirm {
  title: string;
  detail: string;
  resolve: (ok: boolean) => void;
}

interface AiConfirmState {
  request: PendingConfirm | null;
  requestConfirm: (title: string, detail: string) => Promise<boolean>;
  /** Called by the UI with the user's decision. */
  resolve: (ok: boolean) => void;
  /** Drop a pending request without answering it (component teardown). */
  cancel: () => void;
}

export const useAiConfirmStore = create<AiConfirmState>((set, get) => ({
  request: null,
  requestConfirm: (title, detail) => {
    // A second question while one is open: the first one loses.
    const previous = get().request;
    if (previous) {
      previous.resolve(false);
    }
    return new Promise<boolean>((resolve) => {
      set({ request: { title, detail, resolve } });
    });
  },
  resolve: (ok) => {
    const request = get().request;
    if (request) {
      request.resolve(ok);
      set({ request: null });
    }
  },
  cancel: () => {
    const request = get().request;
    if (request) {
      request.resolve(false);
      set({ request: null });
    }
  },
}));

/** Executor-facing helper: ask in one call. */
export function confirmShapeDeletion(count: number): Promise<boolean> {
  return useAiConfirmStore
    .getState()
    .requestConfirm(
      'Delete shapes?',
      count === 1 ? 'Delete 1 shape from this canvas?' : `Delete ${count} shapes from this canvas?`,
    );
}
