import { useState, useRef } from 'react';
import {
  TldrawUiButtonIcon,
  TldrawUiToolbarButton,
  createShapeId,
  preventDefault,
  useEditor,
} from 'tldraw';
import { FloatingPopover } from '@/features/canvas/components/contextual-style-panel';

/** The shapes the menu offers: value = tldraw geo style, icon = stock icon. */
const SHAPE_ITEMS: { geo: string; icon: string; label: string }[] = [
  { geo: 'rectangle', icon: 'geo-rectangle', label: 'Rectangle' },
  { geo: 'ellipse', icon: 'geo-ellipse', label: 'Ellipse' },
  { geo: 'triangle', icon: 'geo-triangle', label: 'Triangle' },
  { geo: 'diamond', icon: 'geo-diamond', label: 'Diamond' },
  { geo: 'pentagon', icon: 'geo-pentagon', label: 'Pentagon' },
  { geo: 'hexagon', icon: 'geo-hexagon', label: 'Hexagon' },
  { geo: 'octagon', icon: 'geo-octagon', label: 'Octagon' },
  { geo: 'star', icon: 'geo-star', label: 'Star' },
  { geo: 'heart', icon: 'geo-heart', label: 'Heart' },
  { geo: 'cloud', icon: 'geo-cloud', label: 'Cloud' },
  { geo: 'x-box', icon: 'geo-x-box', label: 'X box' },
  { geo: 'check-box', icon: 'geo-check-box', label: 'Check box' },
];

/**
 * The toolbar's shape entry: one "shapes" trigger that opens a picker menu;
 * picking a shape drops it at the center of the viewport, selected and
 * ready. Replaces the old live rectangle tool item (which required a drag
 * and only made rectangles).
 */
export function ShapesToolbarItem() {
  const editor = useEditor();
  const [isOpen, setIsOpen] = useState(false);
  const triggerRef = useRef<HTMLButtonElement | null>(null);

  const createGeo = (geo: string) => {
    const bounds = editor.getViewportPageBounds();
    const id = createShapeId();
    editor.run(() => {
      editor.createShape({
        id,
        type: 'geo',
        x: Math.round(bounds.center.x - 100),
        y: Math.round(bounds.center.y - 70),
        props: { geo, w: 200, h: 140 },
      });
      editor.select(id);
    });
    editor.setCurrentTool('select');
    setIsOpen(false);
  };

  return (
    <>
      <TldrawUiToolbarButton
        ref={triggerRef}
        type="tool"
        title="Shapes"
        data-testid="toolbar.shapes"
        isActive={isOpen}
        onPointerDown={preventDefault}
        onClick={() => setIsOpen((open) => !open)}
      >
        <TldrawUiButtonIcon icon="geo-rectangle" />
      </TldrawUiToolbarButton>
      <FloatingPopover anchorRef={triggerRef} open={isOpen} onClose={() => setIsOpen(false)} placement="top">
        <div
          className="tlui-menu grid gap-1 p-1"
          style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(4, minmax(0, 1fr))',
          }}
        >
          {SHAPE_ITEMS.map((item) => (
            <TldrawUiToolbarButton
              key={item.geo}
              type="icon"
              title={item.label}
              data-testid={`shapes.${item.geo}`}
              onPointerDown={preventDefault}
              onClick={() => createGeo(item.geo)}
            >
              <TldrawUiButtonIcon icon={item.icon as `${string}`} />
            </TldrawUiToolbarButton>
          ))}
        </div>
      </FloatingPopover>
    </>
  );
}
