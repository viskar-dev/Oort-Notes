import { useState, useRef } from 'react';
import {
  TldrawUiButtonIcon,
  TldrawUiToolbarButton,
  GeoShapeGeoStyle,
  preventDefault,
  useEditor,
  useValue,
} from 'tldraw';
import { FloatingPopover } from '@/features/canvas/components/contextual-style-panel';

/** The shapes the menu offers: value = tldraw geo style, icon = stock icon.
 *  The full tldraw geo set (all 20 GeoShapeGeoStyle values), grouped
 *  basic -> polygons -> arrows, so a custom preset offers everything the
 *  stock default toolbar carries. */
const SHAPE_ITEMS: { geo: string; icon: string; label: string }[] = [
  { geo: 'rectangle', icon: 'geo-rectangle', label: 'Rectangle' },
  { geo: 'ellipse', icon: 'geo-ellipse', label: 'Ellipse' },
  { geo: 'triangle', icon: 'geo-triangle', label: 'Triangle' },
  { geo: 'diamond', icon: 'geo-diamond', label: 'Diamond' },
  { geo: 'pentagon', icon: 'geo-pentagon', label: 'Pentagon' },
  { geo: 'hexagon', icon: 'geo-hexagon', label: 'Hexagon' },
  { geo: 'octagon', icon: 'geo-octagon', label: 'Octagon' },
  { geo: 'oval', icon: 'geo-oval', label: 'Oval' },
  { geo: 'rhombus', icon: 'geo-rhombus', label: 'Rhombus' },
  { geo: 'rhombus-2', icon: 'geo-rhombus-2', label: 'Rhombus 2' },
  { geo: 'trapezoid', icon: 'geo-trapezoid', label: 'Trapezoid' },
  { geo: 'star', icon: 'geo-star', label: 'Star' },
  { geo: 'cloud', icon: 'geo-cloud', label: 'Cloud' },
  { geo: 'heart', icon: 'geo-heart', label: 'Heart' },
  { geo: 'x-box', icon: 'geo-x-box', label: 'X box' },
  { geo: 'check-box', icon: 'geo-check-box', label: 'Check box' },
  { geo: 'arrow-left', icon: 'geo-arrow-left', label: 'Arrow left' },
  { geo: 'arrow-up', icon: 'geo-arrow-up', label: 'Arrow up' },
  { geo: 'arrow-down', icon: 'geo-arrow-down', label: 'Arrow down' },
  { geo: 'arrow-right', icon: 'geo-arrow-right', label: 'Arrow right' },
];

/**
 * The toolbar's shape entry: one "shapes" trigger that opens a picker menu;
 * picking a shape activates tldraw's geo tool with that geometry — the same
 * pattern as tldraw's own toolbar (setStyleForNextShapes + setCurrentTool) —
 * so the user draws it at any size and position on the canvas (click for the
 * default size, drag for a custom one), instead of the shape dropping
 * instantly at the viewport center.
 */
export function ShapesToolbarItem() {
  const editor = useEditor();
  const [isOpen, setIsOpen] = useState(false);
  // the geometry the next drag will draw; seeded from the editor's live
  // next-shape style so the icon matches what a draw drag would produce
  const [picked, setPicked] = useState<string>(() => String(editor.getStyleForNextShape(GeoShapeGeoStyle)));
  const triggerRef = useRef<HTMLButtonElement | null>(null);
  // mirrored from tldraw's official external-toolbar example: the entry is
  // active while the geo tool is live AND the staged geometry matches
  const geoToolActive = useValue('geo tool active', () => editor.getCurrentToolId() === 'geo', [editor]);
  const nextGeo = useValue('next geo', () => String(editor.getStyleForNextShape(GeoShapeGeoStyle)), [editor]);
  const staged = geoToolActive && nextGeo === picked;

  const pickGeo = (geo: string) => {
    editor.run(() => {
      editor.setStyleForNextShapes(GeoShapeGeoStyle, geo as typeof GeoShapeGeoStyle.values[number]);
      editor.setCurrentTool('geo');
    });
    setPicked(geo);
    setIsOpen(false);
  };

  return (
    <>
      <TldrawUiToolbarButton
        ref={triggerRef}
        type="tool"
        title="Shapes"
        data-testid="toolbar.shapes"
        isActive={isOpen || staged}
        onPointerDown={preventDefault}
        onClick={() => setIsOpen((open) => !open)}
      >
        <TldrawUiButtonIcon icon={`geo-${picked}` as `${string}`} />
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
              isActive={geoToolActive && nextGeo === item.geo}
              onPointerDown={preventDefault}
              onClick={() => pickGeo(item.geo)}
            >
              <TldrawUiButtonIcon icon={item.icon as `${string}`} />
            </TldrawUiToolbarButton>
          ))}
        </div>
      </FloatingPopover>
    </>
  );
}
