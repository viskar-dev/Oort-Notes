import { create } from 'zustand';
import { aiChat, type AiAgentEvent, type AiHistoryMessage } from './ai-ipc';
import { useViewModeStore } from '@/stores/view-mode-store';

/**
 * The AI chat panel's state: the visible transcript plus the running turn.
 * A zustand store because the confirm card, the panel toggle (top bar) and
 * the canvas keyboard shortcut all need it from different places, and the
 * tldraw component layer can't receive context naturally.
 */

interface AiState {
  /** Chat panel visibility (toggled from the canvas top bar / keyboard). */
  open: boolean;
  setOpen: (open: boolean) => void;
  toggle: () => void;

  /** Transcript as rendered: user prompts + agent events in order. */
  events: ConversationEvent[];
  /** A turn is being awaited (send button spins, input disabled). */
  busy: boolean;
  /** Transport/turn failure shown at the bottom of the transcript. */
  error: string | null;

  send: (userMessage: string) => Promise<void>;
  clear: () => void;
}

/** What the panel renders. Local user prompts are stored alongside agent
 *  events so the timeline reads like a chat. */
export type ConversationEvent =
  | { kind: 'user'; text: string }
  | AiAgentEvent & { kind: 'agent' };

/** History sent back to the model: text-only, user/assistant, recent first. */
function historyOf(events: ConversationEvent[]): AiHistoryMessage[] {
  return events
    .filter(
      (event) =>
        (event.kind === 'user' || (event.kind === 'agent' && event.role === 'assistant')) &&
        event.text.trim().length > 0,
    )
    .slice(-40)
    .map((event) => ({ role: event.kind === 'user' ? 'user' : 'assistant', content: event.text }));
}

export const useAiStore = create<AiState>((set, get) => ({
  open: false,
  setOpen: (open) => set({ open, error: open ? null : get().error }),
  toggle: () => set({ open: !get().open }),

  events: [],
  busy: false,
  error: null,

  send: async (userMessage) => {
    const text = userMessage.trim();
    if (text.length === 0 || get().busy) return;
    set({ busy: true, error: null });
    const withPrompt: ConversationEvent[] = [...get().events, { kind: 'user', text }];
    set({ events: withPrompt });
    try {
      const agentEvents = await aiChat(historyOf(withPrompt), text);
      set({ events: [...get().events, ...agentEvents.map((event) => ({ kind: 'agent' as const, ...event }))] });
    } catch (error) {
      set({ error: error instanceof Error ? error.message : String(error) });
    } finally {
      set({ busy: false });
    }
  },

  clear: () => set({ events: [], error: null }),
}));

/** Model-facing read-only check at call time (the top bar button closes the
 *  panel in view mode; turns already running are left alone). */
export function aiIsReadOnly(): boolean {
  return useViewModeStore.getState().on;
}
