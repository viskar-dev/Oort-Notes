import { useEffect, useReducer } from 'react';
import type { Editor } from 'tldraw';

/**
 * Re-render on camera moves (pan / zoom). A tiny tick hook: the AI overlays
 * (the floating prompt after submit, the ghost glow cards) are positioned in
 * canvas coordinates but rendered as fixed-position HTML, so every camera
 * change must bump them to recompute their screen placement.
 *
 * Same camera-record filter the chapter canvas uses: `camera:` keys in the
 * session store's updated set.
 */
export function useCameraTick(getEditor: () => Editor | null): void {
  const [, bump] = useReducer((count: number) => count + 1, 0);

  useEffect(() => {
    const editor = getEditor();
    if (!editor || typeof editor.store.listen !== 'function') return;
    let unlisten: (() => void) | undefined;
    try {
      unlisten = editor.store.listen(
        (changes) => {
          const updated = (changes.changes.updated ?? {}) as Record<string, unknown>;
          if (Object.keys(updated).some((key) => key.startsWith('camera:'))) bump();
        },
        { scope: 'session' },
      );
    } catch {
      // Degradation, not failure: the overlay just stays where it was placed.
    }
    return () => {
      try {
        unlisten?.();
      } catch {
        // Webview teardown races are fine.
      }
    };
  }, [getEditor, bump]);
}
