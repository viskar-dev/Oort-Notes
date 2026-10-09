import { useMemo, useState } from 'react';
import DOMPurify from 'dompurify';
import {
  BaseBoxShapeUtil,
  HTMLContainer,
  Rectangle2d,
  resizeBox,
  stopEventPropagation,
  T,
  useEditor,
  useValue,
  type TLBaseShape,
  type TLResizeInfo,
} from 'tldraw';

// ================= svg helpers =================

interface PreparedSvg {
  html: string;
  /** width / height of the viewBox */
  aspect: number;
}

/**
 * Sanitizes raw SVG and normalizes it so it scales with the shape:
 * - strips scripts / event handlers (DOMPurify)
 * - guarantees a viewBox (derived from width/height if missing)
 * - replaces fixed width/height with 100%
 * Returns null if the input is not a valid <svg>.
 */
function prepareSvg(raw: string): PreparedSvg | null {
  const trimmed = raw.trim();
  if (!trimmed) return null;

  const clean = DOMPurify.sanitize(trimmed, {
    USE_PROFILES: { svg: true, svgFilters: true },
  });

  const doc = new DOMParser().parseFromString(clean, 'image/svg+xml');
  const svg = doc.documentElement;
  if (!svg || svg.nodeName.toLowerCase() !== 'svg' || doc.querySelector('parsererror')) {
    return null;
  }

  let vb = svg
    .getAttribute('viewBox')
    ?.split(/[\s,]+/)
    .map(Number);

  if (!vb || vb.length !== 4 || vb.some((n) => !Number.isFinite(n))) {
    const w = parseFloat(svg.getAttribute('width') ?? '');
    const h = parseFloat(svg.getAttribute('height') ?? '');
    if (!(w > 0) || !(h > 0)) return null;
    vb = [0, 0, w, h];
    svg.setAttribute('viewBox', `0 0 ${w} ${h}`);
  }

  svg.setAttribute('width', '100%');
  svg.setAttribute('height', '100%');
  if (!svg.getAttribute('preserveAspectRatio')) {
    svg.setAttribute('preserveAspectRatio', 'xMidYMid meet');
  }
  if (!svg.getAttribute('xmlns')) {
    svg.setAttribute('xmlns', 'http://www.w3.org/2000/svg');
  }

  const aspect = vb[2] > 0 && vb[3] > 0 ? vb[2] / vb[3] : 1;
  return { html: new XMLSerializer().serializeToString(svg), aspect };
}

// ================= shape =================

export type SvgDiagramShape = TLBaseShape<
  'svg-diagram',
  {
    w: number;
    h: number;
    svg: string;
  }
>;

const MIN_W = 80;
const MIN_H = 60;

const DEFAULT_SVG = `<svg viewBox="0 0 400 260" xmlns="http://www.w3.org/2000/svg" fill="none" stroke="#e5e5ea" stroke-width="2">
  <defs>
    <marker id="a" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse">
      <path d="M0 0 L10 5 L0 10 z" fill="#f87171" stroke="none"/>
    </marker>
  </defs>
  <path d="M30 220 L370 220 L370 70 Z" fill="#1a1922"/>
  <g transform="translate(200 145) rotate(-23.8)">
    <rect x="-30" y="-40" width="60" height="40" fill="#2c2b36"/>
  </g>
  <line x1="200" y1="125" x2="200" y2="200" stroke="#f87171" marker-end="url(#a)"/>
  <text x="208" y="195" fill="#e5e5ea" stroke="none" font-size="14">mg</text>
  <text x="300" y="212" fill="#e5e5ea" stroke="none" font-size="14">θ</text>
</svg>`;

function SvgDiagramView({ shape }: { shape: SvgDiagramShape }) {
  const editor = useEditor();
  const { svg, w, h } = shape.props;
  const [draft, setDraft] = useState(svg);

  const editing = useValue('svg diagram editing', () => editor.getEditingShapeId() === shape.id, [
    editor,
    shape.id,
  ]);

  const prepared = useMemo(() => prepareSvg(svg), [svg]);
  const draftValid = useMemo(() => (editing ? prepareSvg(draft) !== null : true), [editing, draft]);

  function commit() {
    const next = prepareSvg(draft);
    if (next) {
      // keep width, adopt the svg's aspect ratio
      editor.updateShape<SvgDiagramShape>({
        id: shape.id,
        type: 'svg-diagram',
        props: { svg: draft, h: Math.max(MIN_H, Math.round(w / next.aspect)) },
      });
    }
    editor.setEditingShape(null);
  }

  return (
    <div
      style={{
        width: w,
        height: h,
        boxSizing: 'border-box',
        pointerEvents: 'all',
        overflow: 'hidden',
        position: 'relative',
      }}
      onDoubleClick={() => {
        setDraft(svg);
        editor.setEditingShape(shape.id);
      }}
    >
      {prepared ? (
        <div
          style={{ width: '100%', height: '100%' }}
          dangerouslySetInnerHTML={{ __html: prepared.html }}
        />
      ) : (
        <div
          style={{
            width: '100%',
            height: '100%',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            color: '#a09fab',
            font: '12px monospace',
            border: '1px dashed #24232c',
            borderRadius: 8,
          }}
        >
          Invalid or empty SVG. Double-click to edit.
        </div>
      )}

      {editing && (
        <div
          style={{
            position: 'absolute',
            inset: 0,
            display: 'flex',
            flexDirection: 'column',
            background: '#0d0d12',
            border: `1px solid ${draftValid ? '#24232c' : '#f87171'}`,
            borderRadius: 8,
          }}
        >
          <textarea
            value={draft}
            autoFocus
            spellCheck={false}
            placeholder="Paste SVG here"
            onChange={(e) => setDraft(e.target.value)}
            onPointerDown={stopEventPropagation}
            onKeyDown={(e) => {
              if (e.key === 'Escape') editor.setEditingShape(null);
              if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) commit();
            }}
            style={{
              flex: 1,
              minHeight: 0,
              resize: 'none',
              background: 'transparent',
              color: '#c9c9d1',
              border: 'none',
              outline: 'none',
              padding: 10,
              font: '12px/1.5 ui-monospace, monospace',
              whiteSpace: 'pre',
            }}
          />
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: 8,
              padding: '6px 10px',
              borderTop: '1px solid #24232c',
              font: '11px ui-monospace, monospace',
              color: '#a09fab',
            }}
          >
            <span style={{ flex: 1 }}>{draftValid ? 'Ctrl/Cmd+Enter to apply, Esc to cancel' : 'Not valid SVG'}</span>
            <button
              onPointerDown={stopEventPropagation}
              onClick={commit}
              disabled={!draftValid}
              style={{
                padding: '2px 10px',
                borderRadius: 6,
                border: '1px solid #24232c',
                background: '#17161c',
                color: draftValid ? '#f4f4f6' : '#6b6a75',
                cursor: draftValid ? 'pointer' : 'default',
              }}
            >
              Apply
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

// ================= util =================

export class SvgDiagramUtil extends BaseBoxShapeUtil<SvgDiagramShape> {
  static override type = 'svg-diagram' as const;
  static override props = {
    w: T.number,
    h: T.number,
    svg: T.string,
  };

  override canEdit(): boolean {
    return true;
  }

  override getDefaultProps(): SvgDiagramShape['props'] {
    return { w: 400, h: 260, svg: DEFAULT_SVG };
  }

  override getGeometry(shape: SvgDiagramShape) {
    return new Rectangle2d({
      width: shape.props.w,
      height: shape.props.h,
      isFilled: true,
    });
  }

  override onDoubleClick = (shape: SvgDiagramShape) => {
    this.editor.setEditingShape(shape.id);
  };

  override onResize = (shape: SvgDiagramShape, info: TLResizeInfo<SvgDiagramShape>) => {
    return resizeBox(shape, info, { minWidth: MIN_W, minHeight: MIN_H });
  };

  override component(shape: SvgDiagramShape) {
    return (
      <HTMLContainer
        className="svg-diagram-shape"
        style={{ width: shape.props.w, height: shape.props.h, pointerEvents: 'all' }}
      >
        <SvgDiagramView shape={shape} />
      </HTMLContainer>
    );
  }

  override indicator(shape: SvgDiagramShape) {
    return <rect width={shape.props.w} height={shape.props.h} rx={8} />;
  }
}
