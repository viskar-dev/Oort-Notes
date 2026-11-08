import { useEditor, useValue } from 'tldraw';

/**
 * PDF-style sheet stack for 'page' chapters: one rounded frame per sheet
 * region (vertical stack, world-space positions), with the outside dimmed.
 * Re-renders on every camera change so the frames stay glued to the sheets.
 */
export function PageFrameStack({
  width,
  height,
  gap,
  count,
}: {
  width: number;
  height: number;
  gap: number;
  count: number;
}) {
  const editor = useEditor();
  useValue('camera', () => editor.getCamera(), [editor]);
  const viewport = useValue('screenBounds', () => editor.getViewportScreenBounds(), [editor]);

  // pageToScreen returns window coordinates; the frames are positioned
  // relative to the editor container, so subtract its offset
  const containerRect = editor.getContainer().getBoundingClientRect();
  const toRect = (x: number, y: number) => {
    const p = editor.pageToScreen({ x, y });
    return { x: p.x - containerRect.x, y: p.y - containerRect.y };
  };

  // elevation: sheets float above the dimmed canvas. Four solid rectangles
  // dim everything outside the stack — a giant 3000px box-shadow repaints on
  // every camera frame (paint storm + visible flicker over the diagrams on
  // real GPUs); solid rects composite for free.
  const dimColor = 'rgba(5,5,6,0.93)';

  const stackH = count > 0 ? count * (height + gap) - gap : height;
  const stackTop = toRect(0, 0);
  const stackBottom = toRect(width, stackH);

  // The bands are screen-space overlays. Clamp them to the viewport and to
  // the visible sheet edges: a fixed world-space origin (the old -100000
  // trick) drifts above the viewport as the camera zooms out, so the "above"
  // band grew over the entire sheet and the canvas went black below fit zoom.
  const vw = viewport.w;
  const vh = viewport.h;
  const top = Math.max(0, Math.min(stackTop.y, vh));
  const bottom = Math.max(0, Math.min(stackBottom.y, vh));
  const left = Math.max(0, Math.min(stackTop.x, vw));
  const right = Math.max(0, Math.min(stackBottom.x, vw));

  // the four dim bands around the stack (top / bottom / left / right)
  const dims = [
    { left: 0, top: 0, width: vw, height: top },
    { left: 0, top: bottom, width: vw, height: Math.max(0, vh - bottom) },
    { left: 0, top, width: left, height: Math.max(0, bottom - top) },
    { left: right, top, width: Math.max(0, vw - right), height: Math.max(0, bottom - top) },
  ];

  return (
    <>
      {/* dim everything outside the stack */}
      {dims.map((d, i) => (
        <div
          key={`dim-${i}`}
          className="pointer-events-none absolute z-10"
          style={{ ...d, background: dimColor }}
        />
      ))}
      {Array.from({ length: count }, (_, i) => {
        const top = toRect(0, i * (height + gap));
        const bottom = toRect(width, i * (height + gap) + height);
        return (
          <div
            key={i}
            className="pointer-events-none absolute z-10 rounded-2xl border border-white/10"
            style={{
              left: top.x,
              top: top.y,
              width: bottom.x - top.x,
              height: bottom.y - top.y,
              // small per-sheet elevation shadow (cheap: page-sized, not
              // viewport-sized)
              boxShadow: '0 12px 32px rgba(0,0,0,0.5), 0 3px 10px rgba(0,0,0,0.4)',
            }}
          >
            {/* solid background on purpose: backdrop-blur re-filters the canvas
                behind it on every camera frame (flicker + GPU cost) */}
            <span className="absolute -top-7 right-2 rounded-md bg-surface px-2 py-0.5 text-xs font-medium text-muted-foreground">
              {i + 1}
            </span>
          </div>
        );
      })}
    </>
  );
}
