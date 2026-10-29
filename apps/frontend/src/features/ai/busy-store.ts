import { create } from 'zustand';

/**
 * Canvas-level "AI is working" indicator state: reference-counted, because
 * concurrent callers (the in-app turn and a hosted MCP client) may overlap.
 * Purely an indicator — nothing here gates or blocks input.
 */
interface AiBusyState {
  /** >0 while at least one canvas tool call is executing. */
  calls: number;
  begin: () => void;
  end: () => void;
}

export const useAiBusyStore = create<AiBusyState>((set, get) => ({
  calls: 0,
  begin: () => set({ calls: get().calls + 1 }),
  end: () => set({ calls: Math.max(0, get().calls - 1) }),
}));
