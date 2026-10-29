import { useEffect } from 'react';
import { listen, type UnlistenFn } from '@tauri-apps/api/event';
import { isTauri } from '@tauri-apps/api/core';
import { useNavigate } from 'react-router-dom';

/**
 * Desktop routing for the AI's `open_canvas` tool: the Rust side pins the
 * canvas as active and emits `ai:open-canvas`; this hook navigates the app
 * to it. Mounted once at the router root. No-op in the web build.
 */
export function useAiNavigation(): void {
  const navigate = useNavigate();

  useEffect(() => {
    if (!isTauri()) return;
    let disposed = false;
    let unlisten: UnlistenFn | undefined;
    void (async () => {
      const stop = await listen<{ chapter_id: string }>(
        'ai:open-canvas',
        (event) => {
          navigate(`/chapters/${event.payload.chapter_id}`);
        },
      );
      if (disposed) {
        stop();
      } else {
        unlisten = stop;
      }
    })();
    return () => {
      disposed = true;
      unlisten?.();
    };
  }, [navigate]);
}
