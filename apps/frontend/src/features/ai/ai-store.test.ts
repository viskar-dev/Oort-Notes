import { beforeEach, describe, expect, it, vi } from 'vitest';
import { useAiStore } from './ai-store';

/** The store's turn loop is exercised against a scripted aiChat: transient
 *  failures must retry quietly (no error card, busy stays true between
 *  attempts), non-transient ones surface immediately, attempts that
 *  streamed tool events never retry (the canvas already ran them), and
 *  pressing Stop during a backoff sleep is a quiet stop. */
vi.mock('./ai-ipc', () => ({
  aiChat: vi.fn(),
  aiCancelTurn: vi.fn(async () => false),
  listenAiTurnEvents: vi.fn(async () => () => undefined),
}));

const { aiChat } = await import('./ai-ipc');
const chatMock = vi.mocked(aiChat);

const reply = [{ role: 'assistant', text: 'done', tool: null, ok: null, image_base64: null }];
const transient = async () => {
  throw new Error('model request failed: HTTP 502 Bad Gateway: upstream died');
};

beforeEach(() => {
  chatMock.mockReset();
  useAiStore.setState({ events: [], busy: false, error: null, stopRequested: false });
});

describe('quiet internal retry', () => {
  it('retries transient failures silently and settles on success', async () => {
    chatMock
      .mockImplementationOnce(transient)
      .mockImplementationOnce(transient)
      .mockResolvedValueOnce(reply);

    await useAiStore.getState().send('hi');
    expect(chatMock).toHaveBeenCalledTimes(3);
    const state = useAiStore.getState();
    expect(state.error).toBeNull(); // the user never saw a failure
    expect(state.busy).toBe(false);
    const last = state.events[state.events.length - 1]!;
    expect(last).toMatchObject({ kind: 'agent', role: 'assistant', text: 'done' });
  });

  it('surfaces non-transient failures after a single attempt', async () => {
    chatMock.mockRejectedValueOnce(new Error('no API key set — add one in AI settings first'));
    await useAiStore.getState().send('hi');
    expect(chatMock).toHaveBeenCalledTimes(1);
    expect(useAiStore.getState().error).toContain('no API key');
  });

  it('never retries an attempt that already streamed tool events', async () => {
    chatMock.mockImplementationOnce(async () => {
      // push a streamed agent event into the transcript mid-attempt
      useAiStore.setState({
        events: [
          { kind: 'user', text: 'hi' },
          { kind: 'agent', role: 'tool', text: 'create_shapes', tool: 'create_shapes', ok: true, image_base64: null },
        ],
      });
      throw new Error('model request failed: HTTP 502: upstream died');
    });

    await useAiStore.getState().send('hi');
    expect(chatMock).toHaveBeenCalledTimes(1);
    expect(useAiStore.getState().error).toContain('502');
  });

  it('treats Stop pressed during a backoff sleep as a quiet stop', async () => {
    chatMock.mockImplementation(transient); // fails forever — the only way
    // Stop arrives while the first backoff sleep is pending
    chatMock.mockImplementationOnce(async () => {
      useAiStore.getState().requestStop();
      throw new Error('model request failed: HTTP 502: upstream died');
    });

    await useAiStore.getState().send('hi');
    const state = useAiStore.getState();
    expect(state.busy).toBe(false);
    expect(state.error).toBeNull();
    // no retry spawned a second request after the stop
    expect(chatMock).toHaveBeenCalledTimes(1);
  });
});
