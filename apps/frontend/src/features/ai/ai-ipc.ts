/**
 * AI surface over Tauri invoke. Desktop only — the web build never renders
 * the AI feature, so nothing here runs in a plain browser. Kept separate
 * from the shared `Transport` on purpose: the web API has no AI surface
 * (the local MCP server is a real endpoint; a web client would need real
 * auth, which is out of scope).
 */

import { invoke } from '@tauri-apps/api/core';

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
  args: Record<string, unknown>;
  /** The chapter the call was pinned to (the executor rejects the call if
   *  the user has since switched canvases). */
  canvas_id: string;
}

export interface AiConnectionInfo {
  port: number;
  token: string;
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
  return invoke<AiAgentEvent[]>('ai_chat', { messages, user_message: userMessage });
}

/** Point the AI at this canvas (null clears the pointer). */
export function aiSetActiveCanvas(chapterId: string | null): Promise<void> {
  return invoke<void>('set_active_canvas', { id: chapterId });
}

/** All registry tool names (internal plumbing included), for the startup
 *  check that every one of them has an executor here. */
export function aiListToolNames(): Promise<string[]> {
  return invoke<string[]>('list_tool_names');
}

export function aiGetConfig(): Promise<{ base_url: string; model: string }> {
  return invoke<{ base_url: string; model: string }>('get_ai_config');
}

export function aiSetConfig(baseUrl: string, model: string): Promise<void> {
  return invoke<void>('set_ai_config', { base_url: baseUrl, model });
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
