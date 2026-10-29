import { useEffect, useMemo, useRef, useState } from 'react';
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
import { ChevronsUpDown } from 'lucide-react';

// ================= shiki singleton =================

export const CODE_LANGUAGES = [
  'typescript',
  'javascript',
  'rust',
  'python',
  'java',
  'c',
  'cpp',
  'go',
  'html',
  'css',
  'json',
  'bash',
  'sql',
  'plain',
] as const;
export type CodeLanguage = (typeof CODE_LANGUAGES)[number];

type Highlighter = Awaited<ReturnType<(typeof import('shiki'))['createHighlighter']>>;

let highlighter: Highlighter | undefined;
let highlighterPromise: Promise<Highlighter> | undefined;

function loadHighlighter(): Promise<Highlighter> {
  highlighterPromise ??= import('shiki')
    .then(({ createHighlighter }) =>
      createHighlighter({
        themes: ['one-dark-pro'],
        langs: CODE_LANGUAGES.filter((l) => l !== 'plain'),
      }),
    )
    .then((h) => {
      highlighter = h;
      return h;
    })
    .catch((err) => {
      highlighterPromise = undefined; // allow retry
      throw err;
    });
  return highlighterPromise;
}

/** Returns the shared highlighter once loaded. Highlighting itself is then
 * synchronous, so there is never a frame with stale/plain content. */
function useHighlighter(): Highlighter | undefined {
  const [h, setH] = useState<Highlighter | undefined>(highlighter);
  useEffect(() => {
    if (h) return;
    let cancelled = false;
    loadHighlighter()
      .then((loaded) => !cancelled && setH(loaded))
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [h]);
  return h;
}

// ================= shape =================

export type CodeBlockShape = TLBaseShape<
  'code-block',
  {
    w: number;
    h: number;
    code: string;
    language: CodeLanguage;
    /** code font size in px */
    fontSize: number;
    /** height follows content until the user resizes vertically */
    autoHeight: boolean;
  }
>;

// layout constants (border-box): header 25 + body py-3 (24) + root border (2)
const HEADER_H = 25;
const BODY_PAD_Y = 24;
const ROOT_BORDER = 2;
const CHROME_H = HEADER_H + BODY_PAD_Y + ROOT_BORDER;
const MIN_W = 320;
const MIN_H = 120;
const MAX_H = 4000;

const DEFAULT_CODE = `function fibonacci(n: number): number {
  if (n <= 1) return n;
  return fibonacci(n - 1) + fibonacci(n - 2);
}

console.log(fibonacci(10)); // 55
`;

function CodeBlockView({ shape }: { shape: CodeBlockShape }) {
  const editor = useEditor();
  const h = useHighlighter();
  const { code, language, fontSize, autoHeight } = shape.props;

  const html = useMemo(() => {
    if (!h || language === 'plain') return null;
    try {
      return h.codeToHtml(code, { lang: language, theme: 'one-dark-pro' });
    } catch {
      return null;
    }
  }, [h, code, language]);

  const editing = useValue('code block editing', () => editor.getEditingShapeId() === shape.id, [
    editor,
    shape.id,
  ]);
  const contentRef = useRef<HTMLDivElement>(null);

  function setEditing(next: boolean) {
    editor.setEditingShape(next ? shape.id : null);
  }

  // Auto-fit: observe the rendered code CONTENT (never the flex container,
  // which grows with the shape and would loop). Works while typing, after
  // font/language changes, and when the highlighter finishes loading.
  // Skipped mid-resize-drag and once the user has set a manual height.
  useEffect(() => {
    const el = contentRef.current;
    if (!el || !autoHeight) return;

    const fit = () => {
      if (editor.getIsReadonly() || editor.isIn('select.resizing')) return;
      const current = editor.getShape<CodeBlockShape>(shape.id);
      if (!current || !current.props.autoHeight) return;
      const needed = Math.min(Math.max(MIN_H, Math.ceil(el.offsetHeight) + CHROME_H), MAX_H);
      if (Math.abs(needed - current.props.h) > 1) {
        // layout bookkeeping, not a user action: keep it out of undo history
        editor.run(
          () => editor.updateShape({ id: shape.id, type: 'code-block', props: { h: needed } }),
          { history: 'ignore' },
        );
      }
    };

    fit();
    const ro = new ResizeObserver(fit);
    ro.observe(el);
    return () => ro.disconnect();
  }, [editor, shape.id, autoHeight]);

  function update(props: Partial<CodeBlockShape['props']>) {
    editor.updateShape({ id: shape.id, type: 'code-block', props });
  }

  const btn = 'rounded-md p-1 text-[#a09fab] transition-colors hover:bg-[#17161c] hover:text-[#f4f4f6]';

  return (
    <div
      className="flex w-full flex-col overflow-hidden rounded-xl border font-mono text-[13px] leading-[1.55]"
      style={{
        width: shape.props.w,
        height: shape.props.h,
        boxSizing: 'border-box',
        background: '#0d0d12',
        borderColor: '#24232c',
        pointerEvents: 'all',
        boxShadow: '0 8px 24px rgba(0,0,0,0.35)',
      }}
    >
      {/* header */}
      <div
        className="flex shrink-0 items-center gap-2 border-b px-3"
        style={{ background: '#111016', borderColor: '#24232c', height: HEADER_H }}
      >
        <span className="flex gap-1.5">
          {['#f87171', '#fdd935', '#37ba7c'].map((c) => (
            <span key={c} className="h-2 w-2 rounded-full" style={{ background: c, opacity: 0.85 }} />
          ))}
        </span>

        <span className="flex-1" />

        {!autoHeight && (
          <button
            onPointerDown={stopEventPropagation}
            onClick={() => update({ autoHeight: true })}
            title="Fit height to content"
            className={btn}
          >
            <ChevronsUpDown className="h-3.5 w-3.5" />
          </button>
        )}

        {/*<select
          value={fontSize}
          onPointerDown={stopEventPropagation}
          onChange={(e) => update({ fontSize: Number(e.target.value) })}
          title="Code font size"
          className="rounded-md border border-[#24232c] bg-[#17161c] px-1.5 py-0.5 text-[10px] text-[#a09fab] outline-none focus:border-[#7c6ee6]"
        >
          {[11, 12, 13, 14, 16, 18, 20].map((px) => (
            <option key={px} value={px} className="bg-[#111016]">
              {px}px
            </option>
          ))}
        </select>
        <select
          value={language}
          onPointerDown={stopEventPropagation}
          onChange={(e) => update({ language: e.target.value as CodeLanguage })}
          className="rounded-md border border-[#24232c] bg-[#17161c] px-1.5 py-0.5 text-[10px] text-[#a09fab] outline-none focus:border-[#7c6ee6]"
        >
          {CODE_LANGUAGES.map((lang) => (
            <option key={lang} value={lang} className="bg-[#111016]">
              {lang === 'cpp' ? 'C++' : lang === 'plain' ? 'Plain text' : lang}
            </option>
          ))}
        </select>
        <button onPointerDown={stopEventPropagation} onClick={copy} title="Copy code" className={btn}>
          {copied ? <Check className="h-3.5 w-3.5 text-[#37ba7c]" /> : <Copy className="h-3.5 w-3.5" />}
        </button>*/}
      </div>

      {/* body */}
      <div
        className="shiki-body min-h-0 flex-1 overflow-hidden px-4 py-3"
        style={{ '--cb-fs': `${fontSize}px` } as React.CSSProperties}
        onDoubleClick={() => setEditing(true)}
      >
        <div className="relative">
          {/* highlighted layer is always rendered; while editing, a
              transparent-text textarea with identical metrics sits on top */}
          <div ref={contentRef}>
            {html ? (
              <div className="[&_pre]:!bg-transparent [&_pre]:!m-0 [&_pre]:!p-0 [&_pre]:!font-mono [&_pre]:!text-[length:var(--cb-fs)] [&_pre]:!leading-[1.55] [&_code]:!font-mono [&_code]:!text-[length:var(--cb-fs)] [&_code]:!leading-[1.55] [&_pre]:!whitespace-pre">
                <div dangerouslySetInnerHTML={{ __html: html }} />
              </div>
            ) : (
              <pre
                className="m-0 whitespace-pre font-mono text-[#c9c9d1]"
                style={{ fontSize: 'var(--cb-fs)', lineHeight: 1.55 }}
              >
                {code}
              </pre>
            )}
          </div>
          {editing && (
            <textarea
              value={code}
              onChange={(e) => update({ code: e.target.value })}
              onBlur={() => setEditing(false)}
              onPointerDown={stopEventPropagation}
              spellCheck={false}
              wrap="off"
              autoFocus
              className="absolute inset-0 m-0 h-full w-full resize-none overflow-hidden whitespace-pre border-0 bg-transparent p-0 font-mono text-transparent outline-none"
              style={{ caretColor: '#f4f4f6', fontSize: 'var(--cb-fs)', lineHeight: 1.55 }}
            />
          )}
        </div>
      </div>
    </div>
  );
}

// ================= util =================

export class CodeBlockUtil extends BaseBoxShapeUtil<CodeBlockShape> {
  static override type = 'code-block' as const;
  static override props = {
    w: T.number,
    h: T.number,
    code: T.string,
    language: T.literalEnum(...CODE_LANGUAGES),
    fontSize: T.number,
    autoHeight: T.boolean,
  };

  static override migrations = {
    sequenceId: 'com.tldraw.shape.code-block',
    retroactive: true,
    sequence: [
      {
        // v1 stored a filename; v2 replaced it with the font size
        id: 'com.tldraw.shape.code-block/1' as const,
        scope: 'record' as const,
        filter: (record: { type?: string }) => record.type === 'code-block',
        up: (record: { props?: Record<string, unknown> }) => {
          record.props ??= {};
          delete record.props.filename;
          if (typeof record.props.fontSize !== 'number') record.props.fontSize = 13;
          return record;
        },
      },
      {
        // v3: manual-height tracking moved from in-memory sets into props
        id: 'com.tldraw.shape.code-block/2' as const,
        scope: 'record' as const,
        filter: (record: { type?: string }) => record.type === 'code-block',
        up: (record: { props?: Record<string, unknown> }) => {
          record.props ??= {};
          if (typeof record.props.autoHeight !== 'boolean') record.props.autoHeight = true;
          return record;
        },
      },
    ],
  };

  override canEdit(): boolean {
    return true;
  }

  override onDoubleClick = (shape: CodeBlockShape) => {
    this.editor.setEditingShape(shape.id);
  };

  override getDefaultProps(): CodeBlockShape['props'] {
    return { w: 560, h: 200, code: DEFAULT_CODE, language: 'typescript', fontSize: 13, autoHeight: true };
  }

  override getGeometry(shape: CodeBlockShape) {
    return new Rectangle2d({
      width: shape.props.w,
      height: shape.props.h,
      isFilled: true,
    });
  }

  override onResize = (shape: CodeBlockShape, info: TLResizeInfo<CodeBlockShape>) => {
    const resized = resizeBox(shape, info, { minWidth: MIN_W, minHeight: MIN_H });
    // only a drag that moves the top/bottom edge is a manual height choice;
    // width-only drags keep content-hugging height.
    const touchesHeight = info.handle.includes('top') || info.handle.includes('bottom');
    if (!touchesHeight) return resized;
    return { ...resized, props: { ...resized.props, autoHeight: false } };
  };

  // no onResizeStart/End/Cancel needed: the fit effect checks
  // editor.isIn('select.resizing'), and a cancelled gesture restores the
  // initial props (including autoHeight) automatically.

  override component(shape: CodeBlockShape) {
    return (
      <HTMLContainer
            className="code-block-shape"
            style={{
              width: shape.props.w,
              height: shape.props.h,
              pointerEvents: 'all',
              // overflow: 'hidden',
            }}
          >
            <CodeBlockView shape={shape} />
          </HTMLContainer>
    );
  }

  override indicator(shape: CodeBlockShape) {
    return <rect width={shape.props.w} height={shape.props.h} rx={12} />;
  }
}
