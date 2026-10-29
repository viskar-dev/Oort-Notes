import { tipTapDefaultExtensions, type Editor as TldrawEditor } from 'tldraw';
import { MathInline, revealMathAtPoint } from '@/features/canvas/math-extension';
import { labelOwners } from '@/features/canvas/math-extension/label-editor-registry';
import { ColorMark } from '@/features/canvas/color-mark';

/**
 * tldraw's default rich-text extensions plus inline math and per-word color.
 * Module scope so the array identity never changes: tldraw recreates its
 * editor when the `textOptions` prop changes, and a fresh editor on every
 * render leaves the canvas stuck behind its font-loading screen.
 */
export const RICH_TEXT_EXTENSIONS = [...tipTapDefaultExtensions, MathInline, ColorMark];

/**
 * When tldraw begins editing a shape at a click point, and that point lands on
 * a rendered formula in the label, the formula must show its real `$latex$`
 * string right away. The rich text editor mounts a frame or two after
 * `place-caret`, so poll for it briefly before doing the hit test.
 */
export function attachEditReveal(editor: TldrawEditor) {
  let raf = 0;
  editor.on('place-caret', ({ shapeId, point }) => {
    cancelAnimationFrame(raf);
    let tries = 0;
    const tick = () => {
      if (tries++ > 90) return;
      const rte = editor.getRichTextEditor();
      if (!rte) {
        raf = requestAnimationFrame(tick);
        return;
      }
      // Remember which canvas owns this label editor: the math paste hook
      // normalizes the shape's scale/auto-size against it.
      labelOwners.set(rte, editor);
      if (editor.getEditingShapeId() === shapeId) revealMathAtPoint(rte, point);
    };
    raf = requestAnimationFrame(tick);
  });
}
