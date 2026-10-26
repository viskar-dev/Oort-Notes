import { describe, expect, it } from 'vitest';
import { settleTurn, type ConversationEvent } from './ai-store';
import type { AiAgentEvent } from './ai-ipc';

/** Local prompt event; agent events arrive in the store as `{kind:'agent'}`. */
const userEvent: ConversationEvent = { kind: 'user', text: 'make a note' };

function agent(text: string, role = 'tool'): AiAgentEvent {
  return { role, text, tool: role === 'tool' ? 'create_note' : null, ok: true, image_base64: null };
}

describe('settleTurn', () => {
  it('replaces the streamed tail with the authoritative list', () => {
    // The live stream appended two events before the turn resolved.
    const streamed: ConversationEvent[] = [
      userEvent,
      { kind: 'agent', ...agent('created') },
      { kind: 'agent', ...agent('saved the key') },
    ];
    const settled = settleTurn(streamed, [agent('created'), agent('saved the key')]);
    expect(settled).toHaveLength(3);
    expect(settled[0]).toEqual(userEvent);
    expect(settled.slice(1)).toEqual([
      { kind: 'agent', ...agent('created') },
      { kind: 'agent', ...agent('saved the key') },
    ]);
  });

  it('keeps earlier turns and prompts intact when settling', () => {
    const earlier: ConversationEvent[] = [
      userEvent,
      { kind: 'agent', ...agent('done', 'assistant') },
    ];
    const midTurn: ConversationEvent[] = [
      ...earlier,
      { kind: 'user', text: 'again' },
      { kind: 'agent', ...agent('created') },
      { kind: 'agent', ...agent('ok 2') },
    ];
    const settled = settleTurn(midTurn, [agent('created'), agent('done 2', 'assistant')]);
    expect(settled).toHaveLength(5);
    expect(settled.slice(0, 3)).toEqual(earlier.concat([{ kind: 'user', text: 'again' }]));
    expect(settled[3].kind === 'agent' && settled[3].text).toBe('created');
    expect(settled[4].kind === 'agent' && settled[4].text).toBe('done 2');
  });

  it('tolerates an empty turn result', () => {
    const events: ConversationEvent[] = [userEvent, { kind: 'agent', ...agent('x') }];
    expect(settleTurn(events, [])).toEqual(events);
  });
});
