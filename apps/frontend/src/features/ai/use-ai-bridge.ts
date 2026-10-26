import { useEffect, useRef } from 'react';
import { listen, type UnlistenFn } from '@tauri-apps/api/event';
import { isTauri } from '@tauri-apps/api/core';
import type { Editor } from 'tldraw';
import {
  aiListToolNames,
  aiSetActiveCanvas,
  answerCanvasCall,
  type AiCanvasCall,
} from './ai-ipc';
import { missingExecutors, handleCanvasCall, type BridgeIo } from './bridge';
import { executeAiTool, type AiExecutorDeps, type AiPagesCapability } from './executors';
import { useAiConfirmStore } from './confirm-store';
import { useViewModeStore } from '@/stores/view-mode-store';

/**
 * Canvas-shell side of the AI bridge (desktop only):
 * 1. pins this chapter as the AI's active canvas while it is open,
 * 2. answers `canvas:call` events by running the matching executor,
 * 3. marks grouped-undo anchors on `canvas:begin`,
 * 4. on first mount, checks the Rust registry against the executor list
 *    (dev-time loudness for a registry/executor drift).
 */
export function useAiBridge(
  chapterId: string,
  getEditor: () => Editor | null,
  /** Chapter rendering context (pages-mode geometry) for the executors. */
  getContext?: () => {
    canvas_type: string;
    page: { width: number; height: number; gap: number; count: number } | null;
  },
  /** Pages-mode capability (topics + addPage) for the add_page executor. */
  getPages?: () => AiPagesCapability | null,
): void {
  // Shared, chapter-independent executor deps; only `editor` is fresh per call.
  // getContext goes through a ref so the context stays live (sheet count etc).
  const contextRef = useRef(getContext);
  contextRef.current = getContext;
  const pagesRef = useRef(getPages);
  pagesRef.current = getPages;
  const depsRef = useRef<Omit<AiExecutorDeps, 'editor'>>({
    context: () =>
      contextRef.current?.() ?? { canvas_type: 'infinite', page: null },
    pages: () => pagesRef.current?.() ?? null,
    confirm: (title, detail) =>
      useAiConfirmStore.getState().requestConfirm(title, detail),
    readOnly: () => useViewModeStore.getState().on,
  });

  useEffect(() => {
    if (!isTauri()) return;
    let disposed = false;
    let listeners: UnlistenFn[] = [];

    const io: BridgeIo = {
      chapterId: () => chapterId,
      runTool: (name, args, origin) => {
        const editor = getEditor();
        if (!editor) throw new Error('the canvas editor is not ready yet');
        return executeAiTool({ ...depsRef.current, editor, origin }, name, args);
      },
      answer: async (id, ok, error, result) => {
        await answerCanvasCall(id, ok, error, result);
      },
    };

    void (async () => {
      // Pin this canvas for the AI (backend treats an absent pointer as "no
      // canvas open"); a failure here must not break the canvas itself.
      void aiSetActiveCanvas(chapterId).catch(() => undefined);

      // One-time registry/executor drift check.
      try {
        const names = await aiListToolNames();
        const missing = missingExecutors(names);
        if (missing.length > 0) {
          console.error(
            `[ai] registry tools without executors: ${missing.join(', ')} — the AI will fail those tools!`,
          );
        }
      } catch {
        /* informational only */
      }

      const callListener = await listen<AiCanvasCall>('canvas:call', (event) => {
        void handleCanvasCall(io, event.payload);
      });
      if (disposed) {
        callListener();
        return;
      }
      const beginListener = await listen('canvas:begin', () => {
        // One undo anchor per mutating batch (the anchor set here makes the
        // whole batch a single Ctrl+Z step).
        getEditor()?.mark('ai-batch');
      });
      const endListener = await listen('canvas:end', () => {
        // Nothing to do; the anchor mark already closed the group.
      });
      listeners = [callListener, beginListener, endListener];
    })();

    return () => {
      disposed = true;
      const old = [...listeners];
      listeners = [];
      // The AI must not keep working on a closed canvas: clear the pointer.
      void aiSetActiveCanvas(null).catch(() => undefined);
      for (const unlisten of old) {
        try {
          unlisten();
        } catch {
          // Webview teardown racing the unlisten: nothing to do.
        }
      }
    };
  }, [chapterId, getEditor]);
}
