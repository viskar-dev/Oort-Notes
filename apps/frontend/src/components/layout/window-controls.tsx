import { useEffect, useState } from 'react';
import { Copy, Minus, Square, X } from 'lucide-react';
import { isTauri } from '@tauri-apps/api/core';
import { getCurrentWindow } from '@tauri-apps/api/window';
import type { UnlistenFn } from '@tauri-apps/api/event';

/* Resolved once at module load: in the browser this stays null and the
 * component below renders nothing — there is no window to control there. */
const appWindow = isTauri() ? getCurrentWindow() : null;

/* Button styling shared with the other header chips. */
const BTN =
  'rounded-md p-1.5 text-muted-foreground transition-colors hover:bg-raised hover:text-foreground';

/** Desktop-only minimize / maximize / close controls for the custom app
 *  header (the native title bar is disabled via `decorations: false` in
 *  tauri.conf.json). Invisible in web builds. */
export function WindowControls({ className = '' }: { className?: string }) {
  /* Tracks window state so maximize swaps to its restore glyph, like the
   * native title bar. Permission `core:window:allow-is-maximized` is part of
   * the window default set, so no extra capability entry is needed. */
  const [maximized, setMaximized] = useState(false);

  useEffect(() => {
    if (!appWindow) return;
    let unlisten: UnlistenFn | undefined;
    let disposed = false;

    appWindow.isMaximized().then((value) => {
      if (!disposed) setMaximized(value);
    });
    /* Size changes are the only way maximize/restore flips. */
    appWindow.onResized(() => {
      appWindow.isMaximized().then((value) => {
        if (!disposed) setMaximized(value);
      });
    }).then((fn) => {
      if (disposed) fn();
      else unlisten = fn;
    });
    return () => {
      disposed = true;
      unlisten?.();
    };
  }, []);

  if (!appWindow) return null;

  return (
    <div className={`flex items-center gap-0.5 ${className}`}>
      <button
        title="Minimize"
        onClick={() => void appWindow.minimize()}
        className={BTN}
      >
        <Minus size={16} />
      </button>
      <button
        title={maximized ? 'Restore' : 'Maximize'}
        onClick={() => void appWindow.toggleMaximize()}
        className={BTN}
      >
        {maximized ? <Copy size={16} /> : <Square size={16} />}
      </button>
      <button
        title="Close"
        onClick={() => void appWindow.close()}
        className={BTN}
      >
        <X size={16} />
      </button>
    </div>
  );
}
