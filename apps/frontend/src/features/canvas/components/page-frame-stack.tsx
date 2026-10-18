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
  useValue('screenBounds', () => editor.getViewportScreenBounds(), [editor]);

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
  const toRectStyle = (x: number, y: number) => {
    const p = toRect(x, y);
    return { left: p.x, top: p.y };
  };
  const dimColor = 'rgba(5,5,6,0.93)';

  const stackH = count > 0 ? count * (height + gap) - gap : height;
  const stackTop = toRect(0, 0);
  const stackBottom = toRect(width, stackH);

  // the four dim bands around the stack (top / bottom / left / right)
  const dims = [
    // above the stack
    { ...toRectStyle(-100000, -100000), width: width + 200000, height: 100000 + stackTop.y },
    // below the stack
    { ...toRectStyle(-100000, stackH), width: width + 200000, height: 200000 },
    // left of the stack
    { left: 0, top: stackTop.y, width: Math.max(stackTop.x, 0), height: stackBottom.y - stackTop.y },
    // right of the stack
    { left: stackBottom.x, top: stackTop.y, width: 100000, height: stackBottom.y - stackTop.y },
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
