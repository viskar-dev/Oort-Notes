import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
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
import { Sigma } from 'lucide-react';
import { renderMathHtml } from './index';

// ================= shape =================

export type MathBlockShape = TLBaseShape<
  'math-block',
  {
    w: number;
    h: number;
    /** bare LaTeX, no delimiters */
    latex: string;
  }
>;

const MIN_W = 160;
const MIN_H = 64;
// card padding around the rendered formula
const PAD_X = 20;
const PAD_Y = 16;
// header + textarea while editing (px)
const EDITOR_H = 132;
const DEFAULT_LATEX = 'E = mc^2';

// ================= view =================

function MathBlockView({ shape }: { shape: MathBlockShape }) {
  const editor = useEditor();
  const { w, h, latex } = shape.props;

  const editing = useValue('math block editing', () => editor.getEditingShapeId() === shape.id, [
    editor,
    shape.id,
  ]);
  const [draft, setDraft] = useState(latex);
  const areaRef = useRef<HTMLTextAreaElement>(null);
  const previewRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (editing) {
      setDraft(latex);
      requestAnimationFrame(() => areaRef.current?.focus());
    }
  }, [editing, latex]);

  const html = useMemo(() => renderMathHtml(editing ? draft : latex, true), [editing, draft, latex]);

  // The card hugs the formula: measure the content (never the card, which
  // grows with the shape and would loop) and grow/shrink the shape to fit.
  // Skipped mid-resize and in read-only mode; the fonts arrive after first
  // paint, so the fit runs again once they are ready.
  useLayoutEffect(() => {
    let cancelled = false;

    const fit = () => {
      if (cancelled || editor.getIsReadonly() || editor.isIn('select.resizing')) return;
      const el = previewRef.current;
      const current = editor.getShape<MathBlockShape>(shape.id);
      if (!el || !current) return;
      const neededW = Math.max(editing ? 280 : MIN_W, Math.ceil(el.offsetWidth) + PAD_X * 2);
      const neededH = Math.max(
        MIN_H,
        Math.ceil(el.offsetHeight) + PAD_Y * 2 + (editing ? EDITOR_H : 0),
      );
      if (Math.abs(neededW - current.props.w) > 1 || Math.abs(neededH - current.props.h) > 1) {
        // layout bookkeeping, not a user action: keep it out of undo history
        editor.run(
          () =>
            editor.updateShape({
              id: shape.id,
              type: 'math-block',
              props: { w: neededW, h: neededH },
            }),
          { history: 'ignore' },
        );
      }
    };

    fit();
    document.fonts?.ready.then(fit).catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [editor, shape.id, editing, html]);

  return (
    <div
      className="flex w-full flex-col overflow-hidden rounded-xl border"
      style={{
        width: w,
        height: h,
        boxSizing: 'border-box',
        background: '#0d0d12',
        borderColor: editing ? '#7c6ee6' : '#24232c',
        pointerEvents: 'all',
        boxShadow: '0 8px 24px rgba(0,0,0,0.35)',
      }}
    >
      {/* rendered equation; the inner element keeps max-content width so the
          measurement reflects the formula, not the card */}
      <div className="flex min-h-0 flex-1 items-center justify-center overflow-hidden px-3 py-2">
        <div
          ref={previewRef}
          className="math-block-preview"
          style={{ width: 'max-content' }}
          dangerouslySetInnerHTML={{ __html: html }}
        />
      </div>

      {editing && (
        <div
          className="shrink-0 border-t"
          style={{ background: '#111016', borderColor: '#24232c' }}
        >
          <div
            className="flex items-center gap-1.5 border-b px-3 text-[#a09fab]"
            style={{ height: 28, borderColor: '#24232c' }}
          >
            <Sigma className="h-3.5 w-3.5" />
            <span className="text-xs">LaTeX</span>
            <span className="flex-1" />
            <span className="text-[11px] text-[#8b8a96]">Esc to finish</span>
          </div>
          <textarea
            ref={areaRef}
            value={draft}
            placeholder="E = mc^2"
            spellCheck={false}
            onChange={(e) => {
              const next = e.target.value;
              setDraft(next);
              // live: the preview above re-renders as you type
              editor.updateShape<MathBlockShape>({
                id: shape.id,
                type: 'math-block',
                props: { latex: next },
              });
            }}
            onPointerDown={stopEventPropagation}
            onWheel={(e) => e.stopPropagation()}
            onKeyDown={(e) => {
              if (e.key === 'Escape' || (e.key === 'Enter' && (e.ctrlKey || e.metaKey))) {
                e.preventDefault();
                editor.setEditingShape(null);
              }
              e.stopPropagation();
            }}
            className="w-full resize-none bg-transparent px-3 py-2 font-mono text-[12px] leading-[1.5] text-[#c9c9d1] outline-none"
            style={{ height: EDITOR_H - 28 }}
          />
        </div>
      )}
    </div>
  );
}

// ================= util =================

export class MathBlockUtil extends BaseBoxShapeUtil<MathBlockShape> {
  static override type = 'math-block' as const;
  static override props = {
    w: T.number,
    h: T.number,
    latex: T.string,
  };

  override canEdit(): boolean {
    return true;
  }

  override onDoubleClick = (shape: MathBlockShape) => {
    this.editor.setEditingShape(shape.id);
  };

  override getDefaultProps(): MathBlockShape['props'] {
    return { w: 260, h: 96, latex: DEFAULT_LATEX };
  }

  override getGeometry(shape: MathBlockShape) {
    return new Rectangle2d({ width: shape.props.w, height: shape.props.h, isFilled: true });
  }

  override onResize = (shape: MathBlockShape, info: TLResizeInfo<MathBlockShape>) =>
    resizeBox(shape, info, { minWidth: MIN_W, minHeight: MIN_H });

  override component(shape: MathBlockShape) {
    return (
      <HTMLContainer
        className="math-block-shape"
        style={{ width: shape.props.w, height: shape.props.h, pointerEvents: 'all' }}
      >
        <MathBlockView shape={shape} />
      </HTMLContainer>
    );
  }

  override indicator(shape: MathBlockShape) {
    return <rect width={shape.props.w} height={shape.props.h} rx={12} />;
  }
}
