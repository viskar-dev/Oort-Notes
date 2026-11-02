/**
 * Quiet internal retries for AI turns. When a turn's model request fails
 * transiently (network drop, rate limit, provider 5xx, completion timeout),
 * the store retries silently behind the panel's "working…" shimmer instead
 * of flashing an error card — only after the retry budget is exhausted does
 * the failure surface.
 *
 * Classification runs on the error TEXT the desktop bridge produces, so it
 * must track the message formats in packages/core/src/ai/llm.rs:
 *   'model request failed: HTTP {status}: {detail}'   (provider_error)
 *   'the model provider did not answer within 120s'   (completion timeout)
 *   'model request failed: {e}'                       (reqwest transport)
 *   'model request failed: not JSON: {e}'             (gateway garbage)
 *   'invalid chat request: {e}'                       (our serialization)
 *   'no API key set — add one in AI settings first'   (command guard)
 */

/** Backoff sleeps between attempts: the FIRST attempt gets this budget. */
export const AI_TURN_RETRY_DELAYS_MS = [800, 2500, 6000];

/** Whether a turn failure is worth another quiet attempt. Anything that
 *  retries cannot fix (auth, bad request, cancelled by the user, budget
 *  exhausted) answers false — unknown shapes also refuse, so a new failure
 *  class is never masked by an indefinite silent loop. */
export function isTransientAiError(message: string): boolean {
  const text = message.toLowerCase();
  if (
    /no api key|invalid api key|unauthorized|forbidden|cancelled|invalid chat request/.test(
      text,
    )
  ) {
    return false;
  }
  // explicit HTTP status: only gateway/transient classes are worth retrying
  const status = text.match(/\bhttp (\d{3})\b/);
  if (status) {
    const code = Number(status[1]);
    return code === 408 || code === 429 || code >= 500;
  }
  // transport + provider-layer failures: dropped sockets, DNS, TLS, our own
  // 120s completion timeout, and HTML error pages that cargo as "not JSON"
  return /error sending request|network|connection|dns|timed? out|did not answer within|not json|channel closed|unexpected eof|tls|http2/.test(
    text,
  );
}
