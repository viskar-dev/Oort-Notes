/**
 * The pure core of the AI tool bridge. `use-ai-bridge.ts` wires Tauri's
 * `listen` to `handleCanvasCall`; the handler is kept dependency-free so
 * routing rules (canvas pinning, error plumbing) are unit-testable.
 */

import type { AiCanvasCall } from './ai-ipc';

export type BridgeToolRunner = (
  name: string,
  args: Record<string, unknown>,
) => Promise<Record<string, unknown>>;

export type BridgeAnswer = (
  id: string,
  ok: boolean,
  error: string | null,
  result: Record<string, unknown> | null,
) => Promise<void>;

export interface BridgeIo {
  /** Where the calls belong: the chapter this shell renders. */
  chapterId: () => string;
  /** Tool executors (executors.ts). */
  runTool: BridgeToolRunner;
  /** Answer over the Tauri command channel. */
  answer: BridgeAnswer;
}

/** Error text for the model: honest but short. */
function errorMessage(error: unknown): string {
  if (error instanceof Error) return error.message;
  if (typeof error === 'string') return error;
  try {
    return JSON.stringify(error);
  } catch {
    return String(error);
  }
}

/**
 * Handle one `canvas:call`. The call is rejected up front when the user has
 * switched canvases since it was pinned — a tool executed against the wrong
 * canvas is worse than one that fails.
 */
export async function handleCanvasCall(io: BridgeIo, call: AiCanvasCall): Promise<void> {
  if (call.canvas_id !== io.chapterId()) {
    await io.answer(call.id, false, 'the open canvas changed while the AI was working', null);
    return;
  }
  try {
    const result = await io.runTool(call.name, call.args ?? {});
    await io.answer(call.id, true, null, result);
  } catch (error) {
    await io.answer(call.id, false, errorMessage(error), null);
  }
}

/** Tool names executors.ts implements. Checked against the Rust registry at
 *  startup (below) so a registry/executor mismatch is loud. */
export const EXECUTED_TOOLS = [
  'get_canvas',
  'get_selection',
  'get_snapshot',
  'get_screenshot',
  'create_note',
  'create_math_block',
  'create_code_block',
  'create_table',
  'create_card',
  'create_svg',
  'create_diagram',
  'create_shapes',
  'update_shapes',
  'delete_shapes',
  'focus_viewport',
] as const;

/** Names in the registry that have no executor here (must be empty).
 *  `get_snapshot` is internal plumbing yet still executed here for
 *  save_canvas, so it counts as covered. */
export function missingExecutors(registryNames: string[]): string[] {
  const known = new Set<string>(EXECUTED_TOOLS);
  return registryNames.filter((name) => !known.has(name));
}
