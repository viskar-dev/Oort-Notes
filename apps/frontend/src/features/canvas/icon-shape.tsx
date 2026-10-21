import {
  BaseBoxShapeUtil,
  HTMLContainer,
  Rectangle2d,
  resizeBox,
  T,
  type Editor,
  type TLBaseShape,
  type TLResizeInfo,
} from 'tldraw';
import { buildIconSvg, findCachedIconData } from './icon-finder/icon-data';

// ================= shape =================

/** A dropped icon-finder icon: a self-contained, sanitized inline SVG. */
export type IconShape = TLBaseShape<
  'icon',
  {
    prefix: string;
    name: string;
    w: number;
    h: number;
    /** h/w from the icon's natural size (square sets: 1); kept for reference */
    ratio: number;
    /** the full <svg> element markup */
    svg: string;
  }
>;

const DEFAULT_W = 56;
const MIN_W = 24;

// ================= util =================

export class IconUtil extends BaseBoxShapeUtil<IconShape> {
  static override type = 'icon' as const;
  static override props = {
    prefix: T.string,
    name: T.string,
    w: T.number,
    h: T.number,
    ratio: T.number,
    svg: T.string,
  };

  /** icons never change proportions */
  override isAspectRatioLocked(): boolean {
    return true;
  }

  override getDefaultProps(): IconShape['props'] {
    return { prefix: '', name: '', w: DEFAULT_W, h: DEFAULT_W, ratio: 1, svg: '' };
  }

  override getGeometry(shape: IconShape) {
    return new Rectangle2d({ width: shape.props.w, height: shape.props.h, isFilled: true });
  }

  override onResize = (shape: IconShape, info: TLResizeInfo<IconShape>) =>
    resizeBox(shape, info, { minWidth: MIN_W, minHeight: MIN_W });

  override component(shape: IconShape) {
    return (
      <HTMLContainer
        style={{
          width: shape.props.w,
          height: shape.props.h,
          pointerEvents: 'none',
        }}
      >
        <div
          style={{ width: '100%', height: '100%', color: 'var(--color-text-1, #a09fab)' }}
          className="[&>svg]:block [&>svg]:h-full [&>svg]:w-full [&>svg]:pointer-events-none"
          dangerouslySetInnerHTML={{ __html: shape.props.svg }}
        />
      </HTMLContainer>
    );
  }

  override indicator(shape: IconShape) {
    return <rect width={shape.props.w} height={shape.props.h} rx={8} />;
  }
}

// ================= drop handling =================

/**
 * Creates an icon shape at a page point from a `prefix:name` icon id. Uses
 * the set data already loaded by the icon finder (drop = drag from its
 * dialog, so the data must be cache-hot); returns whether it went through.
 */
export function createIconShapeAt(
  editor: Editor,
  id: string,
  at: { x: number; y: number },
): boolean {
  const [prefix, name] = id.split(':');
  if (!prefix || !name) return false;
  const data = findCachedIconData(prefix, name);
  if (!data) return false;
  const built = buildIconSvg(data, name);
  if (!built) return false;
  const h = Math.round(DEFAULT_W * built.ratio);
  editor.run(() => {
    editor.createShape<IconShape>({
      type: 'icon',
      x: at.x - DEFAULT_W / 2,
      y: at.y - h / 2,
      props: { prefix, name, w: DEFAULT_W, h, ratio: built.ratio, svg: built.svg },
    });
  });
  return true;
}
