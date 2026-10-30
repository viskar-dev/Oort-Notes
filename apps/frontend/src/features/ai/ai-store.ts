import { create } from 'zustand';
import { aiCancelTurn, aiChat, listenAiTurnEvents, type AiAgentEvent, type AiHistoryMessage } from './ai-ipc';
import { useAiGhostStore } from './ghost-store';
import { isTransientAiError, AI_TURN_RETRY_DELAYS_MS } from './turn-retry';
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

  /** Press Stop while a turn runs — including while it is quietly retrying
   *  a transient failure (see `send`): prevents the pending retry from
   *  spawning a fresh request and ends the turn as a quiet stop. */
  requestStop: () => void;
  /** Set by requestStop; consumed + cleared per turn. */
  stopRequested: boolean;

  /** One turn runs at a time; later requests (chat panel or the canvas
   *  prompt) queue behind the current one instead of being dropped. */
  send: (userMessage: string, context?: string | null) => Promise<void>;
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

/** Replace the streamed tail of a running turn with the authoritative
 *  result. The stream and the final list carry the same events by
 *  construction (collector pushes to both), so settling is an exact N-event
 *  window swap — and heals any formatting drift between the two channels. */
export function settleTurn(
  events: ConversationEvent[],
  agentEvents: AiAgentEvent[],
): ConversationEvent[] {
  const head = events.slice(0, Math.max(0, events.length - agentEvents.length));
  return [...head, ...agentEvents.map((event) => ({ kind: 'agent' as const, ...event }))];
}

/** Turns are strictly sequential (see `send`): this chain hands from one
 *  turn to the next. Module-level and never rejects — `send`'s turn body
 *  catches its own failures. */
let turnChain: Promise<void> = Promise.resolve();

const sleep = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms));

export const useAiStore = create<AiState>((set, get) => ({
  open: false,
  setOpen: (open) => set({ open, error: open ? null : get().error }),
  toggle: () => set({ open: !get().open }),

  events: [],
  busy: false,
  error: null,
  stopRequested: false,

  requestStop: () => {
    set({ stopRequested: true });
    // The backend flag only matters while the invoke is actually running;
    // it is reset at every fresh turn start, which is exactly why the
    // frontend bookkeeping must live here (a retry after a Stop press
    // would otherwise begin a brand-new turn).
    void aiCancelTurn().catch(() => undefined);
  },

  send: (userMessage, context) => {
    const text = userMessage.trim();
    if (text.length === 0) return turnChain;
    const turn = async () => {
      set({ busy: true, error: null, stopRequested: false });
      const withPrompt: ConversationEvent[] = [...get().events, { kind: 'user', text }];
      set({ events: withPrompt });
      // Subscribe BEFORE the invoke: event delivery races the final list.
      const unlisten = await listenAiTurnEvents((event) => {
        if (!get().busy) return; // a late straggler after teardown
        set({ events: [...get().events, { kind: 'agent' as const, ...event }] });
      });
      try {
        // Quiet internal retries: a transient model-provider failure never
        // reaches the user — the turn simply attempts again behind the
        // same "working…" shimmer (busy stays true, no error card). Budget:
        // AI_TURN_RETRY_DELAYS_MS.length retries. Rules of engagement:
        //  - only the KNOWN-transient failure classes retry (turn-retry.ts)
        //  - an attempt that streamed tool events never retries — those
        //    shapes already ran on the canvas, and a fresh attempt would
        //    duplicate them; such failures surface immediately
        //  - pressing Stop during the backoff sleeps ends the turn as a
        //    quiet stop (the panel's shimmer is already saying "cancelling…")
        // Worst case before a visible error: the completion timeout the
        // Rust side enforces (120s) × the attempt budget.
        let attempt = 0;
        for (;;) {
          try {
            const agentEvents = await aiChat(historyOf(withPrompt), text, context);
            // Success path (also the only exit): stop the stream before
            // settling — a straggler payload that arrives between the
            // invoke resolving and this point must not append after the
            // authoritative replace and duplicate the tail.
            unlisten();
            set({ events: settleTurn(get().events, agentEvents) });
            return;
          } catch (error) {
            const message = error instanceof Error ? error.message : String(error);
            const streamed = get().events.length > withPrompt.length;
            if (get().stopRequested) return; // quiet stop: no error, no retry
            if (
              attempt >= AI_TURN_RETRY_DELAYS_MS.length ||
              streamed ||
              !isTransientAiError(message)
            ) {
              throw error;
            }
            // the retry budget owns backoff sleeps: busy never flips, so the
            // panel's "working…" shimmer holds across attempts
            await sleep(AI_TURN_RETRY_DELAYS_MS[attempt]);
            attempt += 1;
            if (get().stopRequested) return; // stop pressed during backoff
          }
        }
      } catch (error) {
        // Tool events that streamed before the failure stay in the
        // transcript — the turn's work is never thrown away.
        set({ error: error instanceof Error ? error.message : String(error) });
      } finally {
        try {
          unlisten();
        } catch {
          // Double-unlisten is harmless.
        }
        useAiGhostStore.getState().clear();
        set({ busy: false });
      }
    };
    // Sequential turns: a request typed into the canvas prompt while a turn
    // runs queues behind it (its context anchors independently).
    turnChain = turnChain.then(turn, turn);
    return turnChain;
  },

  clear: () => set({ events: [], error: null }),
}));

/** Model-facing read-only check at call time (the top bar button closes the
 *  panel in view mode; turns already running are left alone). */
export function aiIsReadOnly(): boolean {
  return useViewModeStore.getState().on;
}
