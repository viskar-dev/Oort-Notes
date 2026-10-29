import { useEffect, useMemo, useRef, useState } from 'react';
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
import { Check, Image as ImageIcon, X } from 'lucide-react';

// ================= shape =================

export type SvgDiagramShape = TLBaseShape<
  'svg-diagram',
  {
    w: number;
    h: number;
    /** sanitized SVG markup (valid XML, viewBox normalized, 100% sizing) */
    svg: string;
    /** the SVG's aspect ratio (h/w) captured at apply time */
    ratio: number;
    /** raw textarea content from the last apply, so re-editing is lossless */
    draft: string;
  }
>;

const MIN_W = 120;
const MIN_H = 80;

const SAMPLE_SVG = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 320 200">
  <defs>
    <marker id="arrow" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="6" markerHeight="6" orient="auto-start-reverse">
      <path d="M 0 0 L 10 5 L 0 10 z" fill="#a09fab"/>
    </marker>
  </defs>
  <path d="M 20 170 L 290 170 L 290 40 Z" fill="#17161c" stroke="#3f3f46" stroke-width="1.5"/>
  <rect x="196" y="120" width="52" height="38" rx="4" fill="#7c6ee6" opacity="0.85"/>
  <line x1="222" y1="139" x2="222" y2="182" stroke="#f87171" stroke-width="1.5" marker-end="url(#arrow)"/>
  <line x1="222" y1="139" x2="188" y2="117" stroke="#37ba7c" stroke-width="1.5" marker-end="url(#arrow)"/>
  <text x="228" y="180" fill="#f87171" font-family="sans-serif" font-size="13">mg</text>
  <text x="160" y="106" fill="#37ba7c" font-family="sans-serif" font-size="13">N</text>
  <text x="24" y="190" fill="#8b8a96" font-family="sans-serif" font-size="12">θ</text>
</svg>`;

/**
 * Sanitizes pasted SVG and normalizes it to valid XML with a viewBox and
 * 100% sizing. Returns null when the input isn't a usable <svg>.
 * (Exported for the AI's create_svg executor, which shares this pipeline.)
 */
export function prepareSvg(raw: string): { svg: string; ratio: number } | null {
  const trimmed = raw.trim();
  if (!trimmed) return null;

  const clean = DOMPurify.sanitize(trimmed, {
    USE_PROFILES: { svg: true, svgFilters: true },
  });

  const doc = new DOMParser().parseFromString(clean, 'image/svg+xml');
  const svg = doc.documentElement;
  if (!svg || svg.nodeName.toLowerCase() !== 'svg' || doc.querySelector('parsererror')) return null;

  let viewBox = svg.getAttribute('viewBox');
  let ratio: number | null = null;
  if (viewBox) {
    const p = viewBox.split(/[\s,]+/).map(Number);
    if (p.length === 4 && p.every(Number.isFinite) && p[2] > 0 && p[3] > 0) ratio = p[3] / p[2];
  }
  if (ratio === null) {
    const w = parseFloat(svg.getAttribute('width') ?? '');
    const h = parseFloat(svg.getAttribute('height') ?? '');
    if (!(w > 0) || !(h > 0)) return null;
    viewBox = `0 0 ${w} ${h}`;
    ratio = h / w;
  }

  svg.setAttribute('viewBox', viewBox!);
  svg.setAttribute('width', '100%');
  svg.setAttribute('height', '100%');
  svg.setAttribute('preserveAspectRatio', 'xMidYMid meet');
  if (!svg.getAttribute('xmlns')) svg.setAttribute('xmlns', 'http://www.w3.org/2000/svg');

  return { svg: new XMLSerializer().serializeToString(svg), ratio };
}

// ================= view =================

function SvgDiagramView({ shape }: { shape: SvgDiagramShape }) {
  const editor = useEditor();
  const { w, h, svg, draft: savedDraft } = shape.props;

  const editing = useValue('svg diagram editing', () => editor.getEditingShapeId() === shape.id, [
    editor,
    shape.id,
  ]);

  const [draft, setDraft] = useState(savedDraft || svg);
  const [error, setError] = useState<string | null>(null);
  const areaRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    if (!editing) return;
    setDraft(savedDraft || svg);
    setError(null);
    requestAnimationFrame(() => areaRef.current?.focus());
  }, [editing, savedDraft, svg]);

  // Rendered as an <img>: styles and ids inside the SVG can't leak into the
  // page or collide with other diagrams, and no script can run.
  const src = useMemo(() => `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`, [svg]);

  function apply() {
    const prepared = prepareSvg(draft);
    if (!prepared) {
      setError('Invalid SVG: needs a viewBox, or width and height.');
      return;
    }
    editor.updateShape<SvgDiagramShape>({
      id: shape.id,
      type: 'svg-diagram',
      props: {
        svg: prepared.svg,
        ratio: prepared.ratio,
        draft,
        h: Math.max(MIN_H, Math.round(w * prepared.ratio)),
      },
    });
    editor.setEditingShape(null);
  }

  function cancel() {
    editor.setEditingShape(null);
  }

  return (
    <div
      style={{
        width: w,
        height: h,
        boxSizing: 'border-box',
        position: 'relative',
        overflow: 'hidden',
        pointerEvents: 'all',
      }}
    >
      {/* diagram: fills the shape exactly, aspect is locked by the util.
          Own compositor layer (translateZ): the SVG is rasterized once into
          a texture and then only transformed — without it Chromium
          re-rasterizes the SVG on every pan/zoom frame, which both lags and
          flickers (blank flashes while the async re-raster lands).
          decoding=sync: tldraw culls off-screen shapes (display:none) and
          the re-paint on re-entry must not flash blank while decoding. */}
      <img
        src={src}
        alt=""
        draggable={false}
        decoding="sync"
        style={{
          display: 'block',
          width: '100%',
          height: '100%',
          objectFit: 'contain',
          pointerEvents: 'none',
          userSelect: 'none',
          transform: 'translateZ(0)',
        }}
      />

      {editing && (
        <div
          className="absolute inset-0 flex flex-col overflow-hidden rounded-xl border"
          style={{ background: '#0d0d12', borderColor: error ? '#f87171' : '#24232c' }}
        >
          <div
            className="flex shrink-0 items-center gap-2 border-b px-3"
            style={{ height: 30, background: '#111016', borderColor: '#24232c' }}
          >
            <span className="flex items-center gap-1.5 text-xs text-[#a09fab]">
              <ImageIcon className="h-3.5 w-3.5" /> SVG
            </span>
            <span className="flex-1" />
            <span className="text-[11px] text-[#8b8a96]">Ctrl+Enter to apply</span>
            <button
              onPointerDown={stopEventPropagation}
              onClick={apply}
              title="Apply"
              className="rounded-md p-1 text-[#a09fab] hover:bg-[#17161c] hover:text-[#37ba7c]"
            >
              <Check className="h-3.5 w-3.5" />
            </button>
            <button
              onPointerDown={stopEventPropagation}
              onClick={cancel}
              title="Cancel (Esc)"
              className="rounded-md p-1 text-[#a09fab] hover:bg-[#17161c] hover:text-[#f87171]"
            >
              <X className="h-3.5 w-3.5" />
            </button>
          </div>

          <textarea
            ref={areaRef}
            value={draft}
            placeholder="Paste SVG here"
            spellCheck={false}
            wrap="off"
            onChange={(e) => setDraft(e.target.value)}
            onPointerDown={stopEventPropagation}
            onWheel={(e) => e.stopPropagation()}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) {
                e.preventDefault();
                apply();
              } else if (e.key === 'Escape') {
                e.preventDefault();
                cancel();
              }
              e.stopPropagation();
            }}
            className="min-h-0 w-full flex-1 resize-none whitespace-pre bg-transparent px-3 py-2 font-mono text-[12px] leading-[1.5] text-[#c9c9d1] outline-none"
          />

          {error && (
            <div className="border-t px-3 py-1.5 text-xs text-[#f87171]" style={{ borderColor: '#24232c' }}>
              {error}
            </div>
          )}
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
    ratio: T.number,
    draft: T.string,
  };

  override canEdit(): boolean {
    return true;
  }

  // view mode is only the diagram, so w/h == the svg's own ratio: keep it
  override isAspectRatioLocked(): boolean {
    return true;
  }

  override onDoubleClick = (shape: SvgDiagramShape) => {
    this.editor.setEditingShape(shape.id);
  };

  override getDefaultProps(): SvgDiagramShape['props'] {
    const prepared = prepareSvg(SAMPLE_SVG)!;
    return {
      w: 360,
      h: Math.round(360 * prepared.ratio),
      svg: prepared.svg,
      ratio: prepared.ratio,
      draft: '',
    };
  }

  override getGeometry(shape: SvgDiagramShape) {
    return new Rectangle2d({ width: shape.props.w, height: shape.props.h, isFilled: true });
  }

  override onResize = (shape: SvgDiagramShape, info: TLResizeInfo<SvgDiagramShape>) =>
    resizeBox(shape, info, { minWidth: MIN_W, minHeight: MIN_H });

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
