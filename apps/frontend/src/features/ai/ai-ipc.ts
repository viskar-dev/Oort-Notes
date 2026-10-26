/**
 * AI surface over Tauri invoke. Desktop only — the web build never renders
 * the AI feature, so nothing here runs in a plain browser. Kept separate
 * from the shared `Transport` on purpose: the web API has no AI surface
 * (the local MCP server is a real endpoint; a web client would need real
 * auth, which is out of scope).
 */

import { invoke } from '@tauri-apps/api/core';
import { listen, type UnlistenFn } from '@tauri-apps/api/event';

/** One event of an agent turn, mirroring `note_core::ai::llm::AgentEvent`. */
export interface AiAgentEvent {
  /** 'assistant' (final text), 'tool' (one tool run), 'system' (notes). */
  role: string;
  text: string;
  tool: string | null;
  ok: boolean | null;
  /** Screenshot payload (raw base64 png); never serialized back as text. */
  image_base64: string | null;
}

/** One prior conversation message, mirroring `llm::HistoryMessage`. */
export interface AiHistoryMessage {
  role: string;
  content: string;
}

/** Outgoing canvas tool call, mirroring the desktop `CanvasCall` payload. */
export interface AiCanvasCall {
  id: string;
  name: string;
  args?: Record<string, unknown>;
  /** The chapter the call was pinned to (the executor rejects the call if
   *  the user has since switched canvases). */
  canvas_id: string;
}

export interface AiConnectionInfo {
  port: number;
  token: string;
  /** The canvas the user currently has open (what canvas tools dispatch
   *  against), or null when nothing is pinned — remote calls fail with
   *  "no canvas is open" until they open a chapter in the app. */
  active_canvas: { id: string; name: string; canvas_type: string } | null;
}

/** The webview's answer to a `canvas:call`. Returns whether the pending
 *  call still existed (false ⇒ it timed out on the Rust side already). */
export function answerCanvasCall(
  id: string,
  ok: boolean,
  error: string | null,
  result: Record<string, unknown> | null,
): Promise<boolean> {
  return invoke<boolean>('canvas_result', { id, ok, error, result });
}

/** Run one AI turn (whole conversation in, event list out). */
export function aiChat(
  messages: AiHistoryMessage[],
  userMessage: string,
): Promise<AiAgentEvent[]> {
  return invoke<AiAgentEvent[]>('ai_chat', { messages, userMessage });
}

/** Live agent events while a turn runs (`ai:turn-event`). Events streamed
 *  here are advisory — the turn's final list (returned by `aiChat`) is the
 *  authoritative transcript and is applied on completion. */
export function listenAiTurnEvents(
  handler: (event: AiAgentEvent) => void,
): Promise<UnlistenFn> {
  return listen<AiAgentEvent>('ai:turn-event', (event) => handler(event.payload));
}

/** Point the AI at this canvas (null clears the pointer).
 *
 *  Calls are serialized deliberately: opening a canvas fires `pin(chapterA)`
 *  and React StrictMode's double-mount fires `pin(A) → clear → pin(A)`; if
 *  those invokes raced, a late `clear` could land *after* the re-pin and the
 *  server would end up with no canvas pointed at while one is open. The
 *  promise chain keeps IPC arrival order equal to call order. */
let pinTail: Promise<void> = Promise.resolve();
export function aiSetActiveCanvas(chapterId: string | null): Promise<void> {
  const run = pinTail.then(
    () => invoke<void>('set_active_canvas', { id: chapterId }),
    () => invoke<void>('set_active_canvas', { id: chapterId }),
  );
  pinTail = run.then(
    () => undefined,
    () => undefined,
  );
  return run;
}

/** Tool names the webview executes (frontend target, internal plumbing
 *  included), for the startup check that each one has an executor here. */
export function aiListToolNames(): Promise<string[]> {
  return invoke<string[]>('list_tool_names');
}

export function aiGetConfig(): Promise<{ base_url: string; model: string }> {
  return invoke<{ base_url: string; model: string }>('get_ai_config');
}

export function aiSetConfig(baseUrl: string, model: string): Promise<void> {
  return invoke<void>('set_ai_config', { baseUrl, model });
}

export function aiHasKey(): Promise<boolean> {
  return invoke<boolean>('has_api_key');
}

export function aiSetKey(key: string): Promise<void> {
  return invoke<void>('set_api_key', { key });
}

export function aiClearKey(): Promise<void> {
  return invoke<void>('clear_api_key');
}

export function aiMcpInfo(): Promise<AiConnectionInfo | null> {
  return invoke<AiConnectionInfo | null>('get_mcp_connection_info');
}

/** Generate a new MCP bearer token (invalidate every URL carrying the old
 *  one) and return the fresh connection info. */
export function aiRotateMcpToken(): Promise<AiConnectionInfo> {
  return invoke<AiConnectionInfo>('rotate_mcp_token');
}
