import type { Editor } from 'tldraw';
import { useAiGhostStore } from '../ghost-store';
import { useCameraTick } from '../use-camera-tick';
import { GlareBlock } from './ai-mark';

/**
 * The shimmer layer over the canvas, in real canvas coordinates (pan/zoom
 * moves the glows with the content; rendered as fixed-position HTML above
 * the canvas, the same way the AI-help pill floats — the floating window
 * itself stays minimal, the canvas does the announcing):
 *
 * - 'create' ghosts are FILLED "something is forming here" cards at the
 *   exact box the executor computed for the shapes that will land there.
 * - 'edit' ghosts lay the shimmer ON the shapes being transformed — a
 *   see-through dashed card per selected shape, the original visibly alive
 *   underneath while it converts.
 */
export function AiGhostLayer({ getEditor }: { getEditor: () => Editor | null }) {
  useCameraTick(getEditor);
  const ghosts = useAiGhostStore((s) => s.ghosts);
  if (ghosts.length === 0) return null;
  const editor = getEditor();
  if (!editor || typeof editor.pageToScreen !== 'function') {
    return null;
  }

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
            className={
              ghost.kind === 'edit'
                ? // Transforming: dashed card ON the shape — the shape stays
                  // visible, the sweep reads "this is being worked on".
                  'fixed rounded-lg border border-dashed border-[rgba(157,123,255,0.75)] shadow-[0_0_18px_rgba(124,77,255,0.25)]'
                : // Forming: a filled card — something gets generated here.
                  'fixed overflow-hidden rounded-lg bg-[rgba(23,22,28,0.94)] ring-1 ring-[rgba(157,123,255,0.55)] shadow-[0_0_24px_rgba(124,77,255,0.35)] animate-pulse'
            }
            style={{ left: tl.x, top: tl.y, width: w, height: h }}
          >
            <GlareBlock faint={ghost.kind === 'edit'} className="h-full w-full rounded-lg" />
          </div>
        );
      })}
    </div>
  );
}
