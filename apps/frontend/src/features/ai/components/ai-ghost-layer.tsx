import type { Editor } from 'tldraw';
import { useAiGhostStore } from '../ghost-store';
import { useCameraTick } from '../use-camera-tick';
import { GlareBlock } from './ai-mark';

/**
 * The glowing ghost cards: while the AI produces canvas content, each target
 * box it computed shows as a pulsing "forming here" glow in real canvas
 * coordinates — panning/zooming moves them with the content. Rendered as
 * fixed-position HTML above the canvas (same way the AI-help pill floats);
 * the floating window itself stays minimal (just the spinning mark) —
 * the canvas does the announcing.
 */
export function AiGhostLayer({ getEditor }: { getEditor: () => Editor | null }) {
  useCameraTick(getEditor);
  const ghosts = useAiGhostStore((s) => s.ghosts);
  if (ghosts.length === 0) return null;
  const editor = getEditor();
  if (!editor || typeof editor.pageToScreen !== 'function') return null;

  const zoom = editor.getZoomLevel?.() ?? 1;

  return (
    <div aria-hidden className="pointer-events-none absolute inset-0 z-30">
      {ghosts.map((ghost) => {
        const tl = editor.pageToScreen({ x: ghost.x, y: ghost.y });
        const w = Math.max(ghost.w * zoom, 28);
        const h = Math.max(ghost.h * zoom, 20);
        // Off-screen ghosts don't render (the camera keeps them truthful
        // whenever the user pans back).
        if (tl.x > window.innerWidth || tl.y > window.innerHeight || tl.x + w < 0 || tl.y + h < 0) {
          return null;
        }
        // Fixed + client coords: pageToScreen answers in browser viewport
        // space (exactly how the floating prompt positions itself), so pan
        // and zoom track the content instead of the chrome.
        return (
          <div
            key={ghost.id}
            className="fixed rounded-lg ring-1 ring-[rgba(110,161,255,0.55)] shadow-[0_0_24px_rgba(47,107,255,0.35)] animate-pulse"
            style={{ left: tl.x, top: tl.y, width: w, height: h }}
          >
            <GlareBlock className="h-full w-full rounded-lg" />
          </div>
        );
      })}
    </div>
  );
}
