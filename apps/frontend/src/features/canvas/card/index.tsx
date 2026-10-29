import { useEffect, useMemo, useRef } from 'react';
import {
  atom,
  BaseBoxShapeUtil,
  HTMLContainer,
  Rectangle2d,
  renderHtmlFromRichText,
  renderPlaintextFromRichText,
  resizeBox,
  RichTextArea,
  stopEventPropagation,
  T,
  toRichText,
  useEditor,
  useValue,
  type Editor,
  type TLBaseShape,
  type TLResizeInfo,
  type TLRichText,
  type TLShapeId,
} from 'tldraw';

// ================= types =================

export type CalloutVariant = 'note' | 'info' | 'tip' | 'success' | 'warning' | 'danger';
export type CalloutIcon =
  | 'dot'
  | 'info'
  | 'tip'
  | 'success'
  | 'warning'
  | 'danger'
  | 'pin'
  | 'star'
  | 'bookmark'
  | 'zap'
  | 'help';
type Field = 'title' | 'badge' | 'body';

type CalloutProps = {
  w: number;
  h: number;
  variant: CalloutVariant;
  icon: CalloutIcon;
  title: TLRichText;
  badge: TLRichText;
  body: TLRichText;
  showIcon: boolean;
  showBadge: boolean;
  /** accent-tinted background and border */
  tinted: boolean;
  /** hides the body, keeps the header */
  collapsed: boolean;
};

export type CalloutCardShape = TLBaseShape<'callout-card', CalloutProps>;

const MIN_W = 220;
const MIN_H = 48;

export const VARIANTS: Record<
  CalloutVariant,
  { label: string; icon: CalloutIcon; dark: string; light: string }
> = {
  note: { label: 'Note', icon: 'dot', dark: '#7c6ee6', light: '#6254d8' },
  info: { label: 'Info', icon: 'info', dark: '#4f9cf9', light: '#2f7de1' },
  tip: { label: 'Tip', icon: 'tip', dark: '#2dd4bf', light: '#0f9f90' },
  success: { label: 'Success', icon: 'success', dark: '#37ba7c', light: '#1f9d62' },
  warning: { label: 'Warning', icon: 'warning', dark: '#fbbf24', light: '#c98a05' },
  danger: { label: 'Danger', icon: 'danger', dark: '#f87171', light: '#dc4a4a' },
};

// ================= icons (inline, no icon-library dependency) =================

const ICONS: Record<CalloutIcon, React.ReactNode> = {
  dot: <circle cx="12" cy="12" r="6" fill="currentColor" stroke="none" />,
  info: (
    <>
      <circle cx="12" cy="12" r="10" />
      <path d="M12 16v-4M12 8h.01" />
    </>
  ),
  tip: (
    <>
      <path d="M15 14c.2-1 .7-1.7 1.5-2.5 1-.9 1.5-2.2 1.5-3.5A6 6 0 0 0 6 8c0 1 .2 2.2 1.5 3.5.7.7 1.3 1.5 1.5 2.5" />
      <path d="M9 18h6M10 22h4" />
    </>
  ),
  success: (
    <>
      <circle cx="12" cy="12" r="10" />
      <path d="m9 12 2 2 4-4" />
    </>
  ),
  warning: (
    <>
      <path d="m21.73 18-8-14a2 2 0 0 0-3.48 0l-8 14A2 2 0 0 0 4 21h16a2 2 0 0 0 1.73-3" />
      <path d="M12 9v4M12 17h.01" />
    </>
  ),
  danger: (
    <>
      <circle cx="12" cy="12" r="10" />
      <path d="m15 9-6 6M9 9l6 6" />
    </>
  ),
  pin: (
    <>
      <path d="M12 17v5" />
      <path d="M9 10.76a2 2 0 0 1-1.11 1.79l-1.78.9A2 2 0 0 0 5 15.24V16a1 1 0 0 0 1 1h12a1 1 0 0 0 1-1v-.76a2 2 0 0 0-1.11-1.79l-1.78-.9A2 2 0 0 1 15 10.76V7a1 1 0 0 1 1-1 2 2 0 0 0 0-4H8a2 2 0 0 0 0 4 1 1 0 0 1 1 1z" />
    </>
  ),
  star: <path d="M12 2l3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01L12 2z" />,
  bookmark: <path d="m19 21-7-4-7 4V5a2 2 0 0 1 2-2h10a2 2 0 0 1 2 2v16z" />,
  zap: <polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2" />,
  help: (
    <>
      <circle cx="12" cy="12" r="10" />
      <path d="M9.09 9a3 3 0 0 1 5.83 1c0 2-3 3-3 3M12 17h.01" />
    </>
  ),
};

export const ICON_ORDER = Object.keys(ICONS) as CalloutIcon[];

export function IconSvg({ name, size = 18 }: { name: CalloutIcon; size?: number }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={2}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      {ICONS[name]}
    </svg>
  );
}

// ================= editing state =================

type FieldRef = { id: TLShapeId; field: Field };
const activeField = atom<FieldRef | null>('callout active field', null);
const lastPressed = atom<FieldRef | null>('callout last pressed field', null);

// ================= styles =================

const CSS = `
.tl-cc-card{box-sizing:border-box;overflow:hidden;border:1px solid var(--cb-border);border-radius:14px;background:var(--cb-bg);box-shadow:var(--cb-shadow);font-family:var(--tl-font-sans,system-ui,sans-serif)}
.tl-cc-card.is-tinted{background:color-mix(in srgb,var(--cb-accent) 9%,var(--cb-bg));border-color:color-mix(in srgb,var(--cb-accent) 35%,var(--cb-border))}
.tl-cc-inner{padding:16px 20px}
.tl-cc-head{display:flex;align-items:center;gap:10px}
.tl-cc-icon{flex:none;display:inline-flex;color:var(--cb-accent)}
.tl-cc-title{flex:1;min-width:0;font-size:15px;font-weight:600;line-height:1.4;color:var(--cb-strong)}
.tl-cc-badge{flex:none;max-width:40%;font-size:13px;line-height:1.4;color:var(--cb-muted);text-align:right}
.tl-cc-body{margin-top:10px;font-size:13.5px;line-height:1.6;color:var(--cb-muted)}
.tl-cc-card code{font-family:var(--tl-font-mono,ui-monospace,monospace);font-size:.92em;color:var(--cb-strong);background:none;padding:0}
.tl-cc-field{position:relative;min-height:1.4em;user-select:none;border-radius:4px}
.tl-cc-field p{margin:0}
.tl-cc-field .ProseMirror{outline:none;user-select:text;white-space:pre-wrap;margin:0}
.tl-cc-placeholder{opacity:.4}
`;

let stylesInjected = false;
function ensureStyles() {
  if (stylesInjected || typeof document === 'undefined') return;
  stylesInjected = true;
  const el = document.createElement('style');
  el.setAttribute('data-tl-callout', '');
  el.textContent = CSS;
  document.head.appendChild(el);
}

const DARK = {
  '--cb-bg': '#111016',
  '--cb-border': '#24232c',
  '--cb-strong': '#f4f4f6',
  '--cb-muted': '#a09fab',
  '--cb-shadow': '0 8px 24px rgba(0,0,0,0.35)',
  '--cb-bar-bg': '#17161c',
  '--cb-bar-border': '#24232c',
  '--cb-bar-fg': '#a09fab',
  '--cb-bar-fg-hover': '#f4f4f6',
} as const;

const LIGHT = {
  '--cb-bg': '#ffffff',
  '--cb-border': '#e2e2e8',
  '--cb-strong': '#17161c',
  '--cb-muted': '#55545f',
  '--cb-shadow': '0 4px 16px rgba(0,0,0,0.08)',
  '--cb-bar-bg': '#ffffff',
  '--cb-bar-border': '#e2e2e8',
  '--cb-bar-fg': '#6b6a75',
  '--cb-bar-fg-hover': '#17161c',
} as const;

// ================= ops =================

export function updateCard(editor: Editor, id: TLShapeId, props: Partial<CalloutProps>) {
  if (!editor.getShape(id)) return;
  editor.updateShape<CalloutCardShape>({ id, type: 'callout-card', props });
}

// ================= view =================

function StaticField({
  richText,
  placeholder,
  hidden,
}: {
  richText: TLRichText;
  placeholder: string;
  hidden?: boolean;
}) {
  const editor = useEditor();
  const html = useMemo(() => renderHtmlFromRichText(editor, richText), [editor, richText]);
  const empty = useMemo(() => renderPlaintextFromRichText(editor, richText).trim() === '', [editor, richText]);
  return (
    <div style={hidden ? { visibility: 'hidden' } : undefined}>
      {empty ? (
        editor.getIsReadonly() ? (
          <p />
        ) : (
          <p className="tl-cc-placeholder">{placeholder}</p>
        )
      ) : (
        <div dangerouslySetInnerHTML={{ __html: html }} />
      )}
    </div>
  );
}

function CalloutView({ shape }: { shape: CalloutCardShape }) {
  const editor = useEditor();
  ensureStyles();

  const { w, h, variant, icon, showIcon, showBadge, tinted, collapsed } = shape.props;
  const innerRef = useRef<HTMLDivElement>(null);

  const isDark = useValue('callout dark', () => editor.user.getIsDarkMode(), [editor]);
  const isEditing = useValue('callout editing', () => editor.getEditingShapeId() === shape.id, [editor, shape.id]);
  const active = useValue(
    'callout active field for shape',
    () => {
      const a = activeField.get();
      return a && a.id === shape.id ? a : null;
    },
    [shape.id],
  );

  const order: Field[] = ['title', ...(showBadge ? (['badge'] as Field[]) : []), ...(collapsed ? [] : (['body'] as Field[]))];

  // entering edit mode: open the pressed field, else the title
  useEffect(() => {
    if (!isEditing) {
      if (activeField.get()?.id === shape.id) activeField.set(null);
      return;
    }
    if (activeField.get()?.id !== shape.id) {
      const lp = lastPressed.get();
      activeField.set(lp && lp.id === shape.id ? lp : { id: shape.id, field: 'title' });
    }
  }, [isEditing, shape.id, active]);

  // a field was hidden (badge off, collapsed) while open
  useEffect(() => {
    const a = activeField.get();
    if (a && a.id === shape.id && !order.includes(a.field)) activeField.set({ id: shape.id, field: 'title' });
  }, [showBadge, collapsed, shape.id]); // eslint-disable-line react-hooks/exhaustive-deps

  // height follows content
  useEffect(() => {
    const el = innerRef.current;
    if (!el) return;
    const fit = () => {
      if (editor.getIsReadonly()) return;
      // a zero-ish measurement means the container isn't laid out yet (font
      // gate, editor recreation, culling remount): writing would collapse
      // the stored height to the minimum and the selection box with it
      if (el.offsetHeight <= 0) return;
      const cur = editor.getShape<CalloutCardShape>(shape.id);
      if (!cur) return;
      const needed = Math.max(MIN_H, Math.ceil(el.offsetHeight) + 2); // + card border
      if (Math.abs(needed - cur.props.h) > 1) {
        editor.run(
          () => editor.updateShape<CalloutCardShape>({ id: shape.id, type: 'callout-card', props: { h: needed } }),
          { history: 'ignore' },
        );
      }
    };
    fit();
    const ro = new ResizeObserver(fit);
    ro.observe(el);
    return () => ro.disconnect();
  }, [editor, shape.id]);

  function renderField(field: Field, className: string, placeholder: string) {
    const isActive = isEditing && active?.field === field;
    return (
      <div
        className={`tl-cc-field ${className}${isActive ? ' is-active' : ''}`}
        onPointerDown={(e) => {
          lastPressed.set({ id: shape.id, field });
          if (isEditing) {
            stopEventPropagation(e);
            activeField.set({ id: shape.id, field });
          }
        }}
      >
        {/* the static content owns the layout; the editor overlays it
            (position:absolute; inset:0 from tldraw's .tl-text-input), so the
            caret lands exactly where the text already is */}
        <StaticField richText={shape.props[field]} placeholder={placeholder} hidden={isActive} />
        {isActive && (
          <RichTextArea
            shapeId={shape.id}
            richText={shape.props[field]}
            isEditing
            hasCustomTabBehavior
            handleFocus={() => {}}
            handleBlur={() => {}}
            handleDoubleClick={(e: any) => e}
            handleInputPointerDown={(e) => stopEventPropagation(e)}
            handlePaste={(e) => e.stopPropagation()}
            handleChange={({ richText }) => {
              if (richText) updateCard(editor, shape.id, { [field]: richText } as Partial<CalloutProps>);
            }}
            handleKeyDown={(e) => {
              if (e.key === 'Escape' || (e.key === 'Enter' && (e.ctrlKey || e.metaKey))) {
                e.preventDefault();
                editor.setEditingShape(null);
                return;
              }
              if (e.key === 'Tab') {
                e.preventDefault();
                const next = order[order.indexOf(field) + (e.shiftKey ? -1 : 1)];
                if (next) activeField.set({ id: shape.id, field: next });
              }
            }}
          />
        )}
      </div>
    );
  }

  const vars = {
    ...(isDark ? DARK : LIGHT),
    '--cb-accent': isDark ? VARIANTS[variant].dark : VARIANTS[variant].light,
  } as React.CSSProperties & Record<`--${string}`, string>;

  return (
    <HTMLContainer className="tl-cc-shape" style={{ ...vars, width: w, height: h, pointerEvents: 'all' }}>
      <div className={`tl-cc-card${tinted ? ' is-tinted' : ''}`} style={{ width: w, height: h }}>
        <div ref={innerRef} className="tl-cc-inner">
          <div className="tl-cc-head">
            {showIcon && (
              <span className="tl-cc-icon">
                <IconSvg name={icon} size={icon === 'dot' ? 20 : 18} />
              </span>
            )}
            {renderField('title', 'tl-cc-title', 'Title')}
            {showBadge && renderField('badge', 'tl-cc-badge', 'Badge')}
          </div>
          {!collapsed && renderField('body', 'tl-cc-body', 'Write something…')}
        </div>
      </div>
    </HTMLContainer>
  );
}

// ================= util =================

const text = (t: string) => ({ type: 'text', text: t });
const code = (t: string) => ({ type: 'text', text: t, marks: [{ type: 'code' }] });

const DEFAULT_BODY = {
  type: 'doc',
  content: [
    {
      type: 'paragraph',
      content: [
        text('Air resistance is assumed to be negligible ('),
        code('F_drag ≈ 0'),
        text('). Gravitational acceleration is modeled uniformly downwards at '),
        code('g = 9.80665 m/s²'),
        text('.'),
      ],
    },
  ],
} as TLRichText;

const richTextProp = T.object({ type: T.string, content: T.arrayOf(T.unknown), attrs: T.any.optional() });

export class CalloutCardUtil extends BaseBoxShapeUtil<CalloutCardShape> {
  static override type = 'callout-card' as const;
  static override props = {
    w: T.number,
    h: T.number,
    variant: T.literalEnum('note', 'info', 'tip', 'success', 'warning', 'danger'),
    icon: T.literalEnum('dot', 'info', 'tip', 'success', 'warning', 'danger', 'pin', 'star', 'bookmark', 'zap', 'help'),
    title: richTextProp,
    badge: richTextProp,
    body: richTextProp,
    showIcon: T.boolean,
    showBadge: T.boolean,
    tinted: T.boolean,
    collapsed: T.boolean,
  };

  override canEdit(): boolean {
    return true;
  }

  override hideRotateHandle(): boolean {
    return true;
  }

  override onEditEnd = () => {
    activeField.set(null);
  };

  override getDefaultProps(): CalloutCardShape['props'] {
    return {
      w: 460,
      h: 130,
      variant: 'note',
      icon: 'dot',
      title: toRichText('Note: Assumption Bounds'),
      badge: toRichText('Pinned'),
      body: DEFAULT_BODY,
      showIcon: true,
      showBadge: true,
      tinted: false,
      collapsed: false,
    };
  }

  override getGeometry(shape: CalloutCardShape) {
    return new Rectangle2d({ width: shape.props.w, height: shape.props.h, isFilled: true });
  }

  // width is user-controlled; height always follows the content
  override onResize = (shape: CalloutCardShape, info: TLResizeInfo<CalloutCardShape>) => {
    const resized = resizeBox(shape, info, { minWidth: MIN_W, minHeight: 1 });
    return { ...resized, y: shape.y, props: { ...resized.props, h: shape.props.h } };
  };

  override component(shape: CalloutCardShape) {
    return <CalloutView shape={shape} />;
  }

  override indicator(shape: CalloutCardShape) {
    return <rect width={shape.props.w} height={shape.props.h} rx={14} />;
  }
}
