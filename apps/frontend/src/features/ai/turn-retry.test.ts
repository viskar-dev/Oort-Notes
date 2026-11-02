import { describe, expect, it } from 'vitest';
import { AI_TURN_RETRY_DELAYS_MS, isTransientAiError } from './turn-retry';

/** Messages mirroring the exact strings packages/core/src/ai/llm.rs and
 *  ai_commands.rs produce — the classifier's contract surface. */
describe('isTransientAiError', () => {
  it('retries transport-level provider failures', () => {
    expect(isTransientAiError('model request failed: error sending request for url (http://x)')).toBe(
      true,
    );
    expect(isTransientAiError('model request failed: channel closed')).toBe(true);
    expect(
      isTransientAiError('model request failed: client error (Connect): dns error: name resolution failed'),
    ).toBe(true);
  });

  it('retries our completion timeout and gateway garbage', () => {
    expect(isTransientAiError('the model provider did not answer within 120s')).toBe(true);
    expect(isTransientAiError('model request failed: not JSON: <html>')).toBe(true);
  });

  it('retries rate limiting, request timeouts and 5xx, never 4xx', () => {
    expect(isTransientAiError('model request failed: HTTP 429 Too Many Requests: slow down')).toBe(true);
    expect(isTransientAiError('model request failed: HTTP 408: timed out')).toBe(true);
    expect(isTransientAiError('model request failed: HTTP 502 Bad Gateway: upstream died')).toBe(true);
    // never the config/auth/permission classes — a retry cannot heal them
    expect(isTransientAiError('model request failed: HTTP 401 Unauthorized: bad key')).toBe(false);
    expect(isTransientAiError('model request failed: HTTP 402: credits exhausted')).toBe(false);
    expect(isTransientAiError('model request failed: HTTP 403 forbidden')).toBe(false);
    expect(isTransientAiError('model request failed: HTTP 404 Not Found: no such model')).toBe(false);
  });

  it('never retries determinism or user-intent failures', () => {
    expect(isTransientAiError('no API key set — add one in AI settings first')).toBe(false);
    expect(isTransientAiError('invalid chat request: no content length')).toBe(false);
  });

  it('refuses unknown shapes instead of looping silently', () => {
    expect(isTransientAiError('something completely novel broke')).toBe(false);
  });

  it('backs off with a small ladder (no indefinite retries)', () => {
    expect(AI_TURN_RETRY_DELAYS_MS.length).toBeGreaterThanOrEqual(3);
    expect(AI_TURN_RETRY_DELAYS_MS.every((ms) => ms > 0 && ms <= 10_000)).toBe(true);
  });
});
