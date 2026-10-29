import { create } from 'zustand';
import { aiGetConfig } from './ai-ipc';

/**
 * How destructive AI tool calls (delete_shapes) behave for MCP-origin
 * callers — the one AI setting the webview executors need at call time.
 *
 * - "ask" (default): the call comes back as a structured
 *   `requires_confirmation` result and the MCP client's own model re-sends
 *   it with `confirmed: true` once its user agrees. No desktop UI ever.
 * - "auto_confirm": the call runs immediately — for callers the user has
 *   decided to trust.
 *
 * The in-app assistant is unaffected: it always confirms through the app's
 * own card, no matter this value.
 */
export type AiDestructivePolicy = 'ask' | 'auto_confirm';

/** Clamp any stored value to the two valid policies. Defensive against a
 *  stale/unknown stored value: fail closed to "ask". */
export function normPolicy(value: unknown): AiDestructivePolicy {
  return value === 'auto_confirm' ? 'auto_confirm' : 'ask';
}

interface AiPolicyState {
  policy: AiDestructivePolicy;
  set: (policy: AiDestructivePolicy) => void;
  /** Read the stored config once and adopt its policy (errors are
   *  swallowed — the store default "ask" stays in charge if IPC fails). */
  refresh: () => Promise<void>;
}

export const useAiPolicyStore = create<AiPolicyState>((set) => ({
  policy: 'ask',
  set: (policy) => set({ policy }),
  refresh: async () => {
    try {
      const config = await aiGetConfig();
      set({ policy: normPolicy(config.destructive_policy) });
    } catch {
      // No config fetch (not desktop, early teardown): keep "ask".
    }
  },
}));
