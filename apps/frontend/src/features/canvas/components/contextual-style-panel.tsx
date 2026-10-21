import { useEffect, useLayoutEffect, useRef, useState, type MouseEvent, type ReactNode, type RefObject } from 'react';
import { createPortal } from 'react-dom';
import type { Editor as TiptapEditor } from '@tiptap/core';
import {
  AlignCenterHorizontal,
  AlignCenterVertical,
  AlignEndHorizontal,
  AlignEndVertical,
  AlignHorizontalDistributeCenter,
  AlignStartHorizontal,
  AlignStartVertical,
  AlignVerticalDistributeCenter,
  Droplet,
  Eye,
  EyeOff,
  FlipHorizontal2,
  FlipVertical2,
  Minimize2,
  PanelTop,
  StretchHorizontal,
  StretchVertical,
  Tag,
  WandSparkles,
  type LucideIcon,
} from 'lucide-react';
import {
  ArrowShapeArrowheadEndStyle,
  ArrowShapeArrowheadStartStyle,
  ArrowShapeKindStyle,
  Box,
  DefaultColorStyle,
  DefaultDashStyle,
  DefaultFillStyle,
  DefaultFontStyle,
  DefaultHorizontalAlignStyle,
  DefaultSizeStyle,
  DefaultTextAlignStyle,
  DefaultVerticalAlignStyle,
  GeoShapeGeoStyle,
  getDefaultColorTheme,
  LineShapeSplineStyle,
  tlmenus,
  useContainer,
  TldrawUiButton,
  TldrawUiButtonIcon,
  TldrawUiContextualToolbar,
  preventDefault,
  TldrawUiPopover,
  TldrawUiPopoverContent,
  TldrawUiPopoverTrigger,
  TldrawUiToolbarButton,
  track,
  useEditor,
  useTranslation,
  useValue,
  type Editor,
  type SharedStyle,
  type StyleProp,
  type StyleValuesForUi,
  type TLUiIconType,
} from 'tldraw';
import { useRichTextTick } from '@/hooks/canvas/use-rich-text-tick';
import { useUiPresetStore } from '@/stores/ui-preset-store';
import { useViewMode } from '@/features/canvas/view-mode';
import { tableOps, selRC, type TableAlign, type TableShape } from '@/features/canvas/table-shape';
import {
  ICON_ORDER,
  IconSvg,
  updateCard,
  VARIANTS,
  type CalloutCardShape,
  type CalloutVariant,
} from '@/features/canvas/card';

// Static value/icon lists matching what the docked panel offers on tldraw
// 3.15 (where the example's getColorStyleItems/getFontStyleItems helpers and
// defaultGeoTypeDefinitions don't exist yet — these mirror its internal
// STYLES table, so the icon names are guaranteed to resolve).

const COLOR_ITEMS: StyleValuesForUi<string> = [
  'black',
  'grey',
  'light-violet',
  'violet',
  'blue',
  'light-blue',
  'yellow',
  'orange',
  'green',
  'light-green',
  'light-red',
  'red',
].map((value) => ({ value, icon: 'color' as const }))

const FILL_ITEMS: StyleValuesForUi<string> = [
  { value: 'none', icon: 'fill-none' },
  { value: 'semi', icon: 'fill-semi' },
  { value: 'solid', icon: 'fill-solid' },
  { value: 'pattern', icon: 'fill-pattern' },
]

const DASH_ITEMS: StyleValuesForUi<string> = [
  { value: 'draw', icon: 'dash-draw' },
  { value: 'dashed', icon: 'dash-dashed' },
  { value: 'dotted', icon: 'dash-dotted' },
  { value: 'solid', icon: 'dash-solid' },
]

const SIZE_ITEMS: StyleValuesForUi<string> = [
  { value: 's', icon: 'size-small' },
  { value: 'm', icon: 'size-medium' },
  { value: 'l', icon: 'size-large' },
  { value: 'xl', icon: 'size-extra-large' },
]

const FONT_ITEMS: StyleValuesForUi<string> = [
  { value: 'draw', icon: 'font-draw' },
  { value: 'sans', icon: 'font-sans' },
  { value: 'serif', icon: 'font-serif' },
  { value: 'mono', icon: 'font-mono' },
]

const GEO_ITEMS: StyleValuesForUi<string> = [
  { value: 'rectangle', icon: 'geo-rectangle' },
  { value: 'ellipse', icon: 'geo-ellipse' },
  { value: 'triangle', icon: 'geo-triangle' },
  { value: 'diamond', icon: 'geo-diamond' },
  { value: 'star', icon: 'geo-star' },
  { value: 'pentagon', icon: 'geo-pentagon' },
  { value: 'hexagon', icon: 'geo-hexagon' },
  { value: 'octagon', icon: 'geo-octagon' },
  { value: 'rhombus', icon: 'geo-rhombus' },
  { value: 'rhombus-2', icon: 'geo-rhombus-2' },
  { value: 'oval', icon: 'geo-oval' },
  { value: 'trapezoid', icon: 'geo-trapezoid' },
  { value: 'arrow-left', icon: 'geo-arrow-left' },
  { value: 'arrow-up', icon: 'geo-arrow-up' },
  { value: 'arrow-down', icon: 'geo-arrow-down' },
  { value: 'arrow-right', icon: 'geo-arrow-right' },
  { value: 'cloud', icon: 'geo-cloud' },
  { value: 'x-box', icon: 'geo-x-box' },
  { value: 'check-box', icon: 'geo-check-box' },
  { value: 'heart', icon: 'geo-heart' },
]

const ARROW_KIND_ITEMS: StyleValuesForUi<string> = [
  { value: 'arc', icon: 'arrow-arc' },
  { value: 'elbow', icon: 'arrow-elbow' },
]

const ARROWHEAD_ITEMS: StyleValuesForUi<string> = [
  { value: 'none', icon: 'arrowhead-none' },
  { value: 'arrow', icon: 'arrowhead-arrow' },
  { value: 'triangle', icon: 'arrowhead-triangle' },
  { value: 'square', icon: 'arrowhead-square' },
  { value: 'dot', icon: 'arrowhead-dot' },
  { value: 'diamond', icon: 'arrowhead-diamond' },
  { value: 'inverted', icon: 'arrowhead-triangle-inverted' },
  { value: 'bar', icon: 'arrowhead-bar' },
]

const SPLINE_ITEMS: StyleValuesForUi<string> = [
  { value: 'line', icon: 'spline-line' },
  { value: 'cubic', icon: 'spline-cubic' },
]

const TEXT_ALIGN_ITEMS: StyleValuesForUi<string> = [
  { value: 'start', icon: 'text-align-left' },
  { value: 'middle', icon: 'text-align-center' },
  { value: 'end', icon: 'text-align-right' },
]

const LABEL_ALIGN_ITEMS: StyleValuesForUi<string> = [
  { value: 'start', icon: 'horizontal-align-start' },
  { value: 'middle', icon: 'horizontal-align-middle' },
  { value: 'end', icon: 'horizontal-align-end' },
]

const VERTICAL_ALIGN_ITEMS: StyleValuesForUi<string> = [
  { value: 'start', icon: 'vertical-align-start' },
  { value: 'middle', icon: 'vertical-align-middle' },
  { value: 'end', icon: 'vertical-align-end' },
]

export function getColorValue(editor: Editor, value: string): string {
  const theme = getDefaultColorTheme({ isDarkMode: editor.user.getIsDarkMode() });
  const entry = theme[value as keyof typeof theme] as { solid: string } | undefined;
  return entry?.solid ?? '#000000';
}

/**
 * A popover anchored to a trigger button that portals directly into the
 * editor container: unlike `TldrawUiPopover` it never registers in tldraw's
 * menu registry, so opening it does not call `editor.complete()` — which
 * would exit the rich text editor and unmount the toolbar mid-click.
 *
 * Pointer presses inside the content (and on the trigger) do not reach the
 * canvas, so the text selection being styled is never blurred out.
 */
export function FloatingPopover({
  anchorRef,
  open,
  onClose,
  children,
  keepTextFocus = true,
  placement = 'bottom',
}: {
  anchorRef: RefObject<HTMLElement | null>;
  open: boolean;
  onClose: () => void;
  children: ReactNode;
  /**
   * Swallow pointer presses inside the content so the rich text editor being
   * styled never blurs / loses its selection. Set false for content that
   * needs native pointer behavior itself — e.g. the link input, where clicks
   * must be able to place the caret.
   */
  keepTextFocus?: boolean;
  /**
   * 'bottom' (default) opens under the anchor; 'top' opens above it — for
   * anchors at the screen's bottom edge (the toolbar pill), where a
   * below-anchored popover would land outside the viewport.
   */
  placement?: 'bottom' | 'top';
}) {
  const container = useContainer();
  const contentRef = useRef<HTMLDivElement | null>(null);
  const [pos, setPos] = useState<{ left: number; top: number } | null>(null);

  useLayoutEffect(() => {
    // only measured while open: while closed the component renders nothing,
    // so a stale position is never painted (layout effect runs before paint)
    if (!open) return;
    const anchor = anchorRef.current;
    if (!container || !anchor) return;
    const hostRect = container.getBoundingClientRect();
    const anchorRect = anchor.getBoundingClientRect();
    const centerX = anchorRect.left - hostRect.left + anchorRect.width / 2;
    setPos({
      left: Math.min(Math.max(centerX, 100), Math.max(hostRect.width - 100, 100)),
      top:
        placement === 'top'
          ? anchorRect.top - hostRect.top - 8
          : anchorRect.bottom - hostRect.top + 8,
    });
  }, [open, container, anchorRef, placement]);

  useEffect(() => {
    if (!open) return;
    const handlePointerDown = (event: PointerEvent) => {
      const target = event.target as Node | null;
      if (contentRef.current?.contains(target)) return;
      if (anchorRef.current?.contains(target)) return;
      onClose();
    };
    document.addEventListener('pointerdown', handlePointerDown, true);
    return () => document.removeEventListener('pointerdown', handlePointerDown, true);
  }, [open, onClose, anchorRef]);

  if (!open || !pos) return null;
  return createPortal(
    <div
      ref={contentRef}
      onPointerDown={keepTextFocus ? (e) => e.preventDefault() : undefined}
      style={{
        position: 'absolute',
        left: pos.left,
        top: pos.top,
        transform: placement === 'top' ? 'translate(-50%, -100%)' : 'translateX(-50%)',
        zIndex: 'var(--layer-menus)',
      }}
    >
      {children}
    </div>,
    container,
  );
}

/**
 * While a text selection is active in the rich text editor, the colour group
 * shows the selection's own colour instead of the whole string's: a uniform
 * word colour resolves to its palette id, mixed word colours show `mixed`,
 * and an uncolored selection keeps inheriting the shape colour.
 */
export function wordColorValue(
  textEditor: TiptapEditor | null,
  shapeColor: SharedStyle<string>,
  idForHex: (hex: string) => string | undefined,
): SharedStyle<string> {
  if (!textEditor || textEditor.isDestroyed) return shapeColor;
  const { from, to } = textEditor.state.selection;
  if (from === to) return shapeColor;
  let sawMark = false;
  let uniform = true;
  let hex: string | undefined;
  textEditor.state.doc.nodesBetween(from, to, (node) => {
    if (!node.isText || !node.text) return;
    const mark = node.marks.find((m) => m.type.name === 'color');
    const value = mark ? ((mark.attrs.color as string | null) ?? undefined) : undefined;
    if (!value) {
      if (sawMark) uniform = false;
      return;
    }
    if (!sawMark) {
      sawMark = true;
      hex = value;
    } else if (hex !== value) {
      uniform = false;
    }
  });
  if (!sawMark) return shapeColor;
  if (!uniform) return { type: 'mixed' };
  const id = hex ? idForHex(hex) : undefined;
  return id ? { type: 'shared', value: id } : { type: 'mixed' };
}

/**
 * True while the open rich-text editor has a non-empty selection — a word,
 * several words, or the whole string (select-all). An empty caret returns
 * false.
 *
 * This is the "content" context: any text selection swaps the visible menus
 * so ONLY the content edit bar (rich text toolbar) shows — the contextual
 * style panel (element/main option bar) steps aside. Without a selection
 * (caret, or just selecting the shape) the main panel is the one that shows.
 */
export function hasActiveTextSelection(textEditor: TiptapEditor | null): boolean {
  if (!textEditor || textEditor.isDestroyed) return false;
  const { from, to } = textEditor.state.selection;
  return from !== to;
}

interface StylePickerProps<T extends string> {
  uiType: string;
  style: StyleProp<T>;
  value: SharedStyle<T>;
  items: StyleValuesForUi<T>;
  /** Defaults to `style-panel.<uiType>`. Pass this when the two don't line up. */
  labelKey?: string;
  getItemColor?(value: T): string;
}

function StylePicker<T extends string>({
  uiType,
  style,
  value,
  items,
  labelKey,
  getItemColor,
}: StylePickerProps<T>) {
  const editor = useEditor();
  const msg = useTranslation();
  const triggerRef = useRef<HTMLButtonElement | null>(null);
  const [isOpen, setIsOpen] = useState(false);

  const label = msg(labelKey ?? `style-panel.${uiType}`);
  const icon =
    value.type === 'mixed'
      ? 'mixed'
      : (items.find((item) => item.value === value.value)?.icon ?? items[0]?.icon);

  const handleSelect = (next: T) => {
    // with a text selection in the open rich text editor, a colour choice
    // paints the selected words (one group, replacing any mixed word
    // colours) instead of the whole string
    if (uiType === 'color') {
      const textEditor = editor.getRichTextEditor();
      const hex = getItemColor?.(next);
      if (textEditor && !textEditor.isDestroyed && !textEditor.state.selection.empty && hex) {
        textEditor.chain().focus().setMark('color', { color: hex }).run();
        setIsOpen(false);
        return;
      }
    }
    editor.markHistoryStoppingPoint('contextual style panel');
    editor.run(() => {
      editor.setStyleForSelectedShapes(style, next);
      editor.setStyleForNextShapes(style, next);
    });
    setIsOpen(false);
  };

  return (
    <>
      <TldrawUiToolbarButton
        ref={triggerRef}
        type="icon"
        title={label}
        data-testid={`style-picker.${uiType}`}
        style={value.type === 'shared' ? { color: getItemColor?.(value.value) } : undefined}
        // pointer-down guard: without it the trigger press blurs the rich text
        // editor, tiptap syncs the collapsed DOM selection, and a colour pick
        // would style the whole shape instead of the selected words
        onPointerDown={preventDefault}
        onClick={() => setIsOpen((open) => !open)}
      >
        <TldrawUiButtonIcon icon={icon as TLUiIconType} />
      </TldrawUiToolbarButton>
      <FloatingPopover anchorRef={triggerRef} open={isOpen} onClose={() => setIsOpen(false)}>
        <div
          className="tlui-menu grid gap-1 p-1"
          style={{
            display: 'grid',
            gridTemplateColumns: `repeat(${Math.min(4, items.length)}, minmax(0, 1fr))`,
          }}
        >
          {items.map((item) => (
            <TldrawUiToolbarButton
              key={item.value}
              type="icon"
              title={msg(`${uiType}-style.${item.value}`)}
              data-testid={`style-picker.${uiType}.${item.value}`}
              isActive={value.type === 'shared' && value.value === item.value}
              style={{ color: getItemColor?.(item.value) }}
              onClick={() => handleSelect(item.value)}
            >
              <TldrawUiButtonIcon icon={item.icon as TLUiIconType} />
            </TldrawUiToolbarButton>
          ))}
        </div>
      </FloatingPopover>
    </>
  );
}

interface AlignAction {
  icon: LucideIcon;
  label: string;
  run: (editor: Editor) => void;
}

const ALIGN_ACTIONS: AlignAction[] = [
  { icon: AlignStartVertical, label: 'Align left', run: (e) => e.alignShapes(e.getSelectedShapeIds(), 'left') },
  { icon: AlignCenterVertical, label: 'Align horizontal centers', run: (e) => e.alignShapes(e.getSelectedShapeIds(), 'center-horizontal') },
  { icon: AlignEndVertical, label: 'Align right', run: (e) => e.alignShapes(e.getSelectedShapeIds(), 'right') },
  { icon: AlignHorizontalDistributeCenter, label: 'Distribute horizontally', run: (e) => e.distributeShapes(e.getSelectedShapeIds(), 'horizontal') },
  { icon: AlignStartHorizontal, label: 'Align top', run: (e) => e.alignShapes(e.getSelectedShapeIds(), 'top') },
  { icon: AlignCenterHorizontal, label: 'Align vertical centers', run: (e) => e.alignShapes(e.getSelectedShapeIds(), 'center-vertical') },
  { icon: AlignEndHorizontal, label: 'Align bottom', run: (e) => e.alignShapes(e.getSelectedShapeIds(), 'bottom') },
  { icon: AlignVerticalDistributeCenter, label: 'Distribute vertically', run: (e) => e.distributeShapes(e.getSelectedShapeIds(), 'vertical') },
  { icon: StretchHorizontal, label: 'Stretch horizontally', run: (e) => e.stretchShapes(e.getSelectedShapeIds(), 'horizontal') },
  { icon: StretchVertical, label: 'Stretch vertically', run: (e) => e.stretchShapes(e.getSelectedShapeIds(), 'vertical') },
  { icon: FlipHorizontal2, label: 'Flip horizontally', run: (e) => e.flipShapes(e.getSelectedShapeIds(), 'horizontal') },
  { icon: FlipVertical2, label: 'Flip vertically', run: (e) => e.flipShapes(e.getSelectedShapeIds(), 'vertical') },
];

/** Alignment / distribute / flip grid, shown when 2+ shapes are selected. */
function AlignmentMenu() {
  const editor = useEditor();
  const [isOpen, setIsOpen] = useState(false);
  const popoverId = 'contextual alignment tools';

  const handleAction = (action: AlignAction) => {
    editor.markHistoryStoppingPoint('contextual alignment');
    editor.run(() => action.run(editor));
    tlmenus.deleteOpenMenu(popoverId, editor.contextId);
    setIsOpen(false);
  };

  return (
    <TldrawUiPopover id={popoverId} open={isOpen} onOpenChange={setIsOpen}>
      <TldrawUiPopoverTrigger>
        <TldrawUiToolbarButton type="icon" title="Align and distribute">
          <AlignCenterVertical className="h-4 w-4" />
        </TldrawUiToolbarButton>
      </TldrawUiPopoverTrigger>
      <TldrawUiPopoverContent side="bottom" align="center" sideOffset={8}>
        <div className="tlui-menu grid grid-cols-4 gap-1 p-1" style={{ display: 'grid' }}>
          {ALIGN_ACTIONS.map((action) => (
            <button
              key={action.label}
              title={action.label}
              onClick={() => handleAction(action)}
              className="flex h-10 w-10 items-center justify-center rounded-md text-ink transition-colors hover:bg-raised"
            >
              <action.icon className="h-4.5 w-4.5" />
            </button>
          ))}
        </div>
      </TldrawUiPopoverContent>
    </TldrawUiPopover>
  );
}

/** Doc-style text sizes, mapped to the text shape's scale prop. The base
 * font is ~24px at 100% zoom, so these read as proper heading sizes. */
/** tldraw's text base is 24px at scale 1; px sizes come from the chapter's
 * UI preset (defaults approximate the doc-style hierarchy). */
const TEXT_BASE_PX = 24;
function getTextPresets(sizes?: { h1: number; h2: number; h3: number; p: number }) {
  const h1 = sizes?.h1 ?? 48;
  const h2 = sizes?.h2 ?? 36;
  const h3 = sizes?.h3 ?? 29;
  const p = sizes?.p ?? 24;
  return [
    { label: 'H1', scale: h1 / TEXT_BASE_PX, title: `Heading 1 (${h1}px)`, size: Math.min(18, Math.max(10, h1 / 3)) },
    { label: 'H2', scale: h2 / TEXT_BASE_PX, title: `Heading 2 (${h2}px)`, size: Math.min(16, Math.max(10, h2 / 3)) },
    { label: 'H3', scale: h3 / TEXT_BASE_PX, title: `Heading 3 (${h3}px)`, size: Math.min(14, Math.max(10, h3 / 3)) },
    { label: 'P', scale: p / TEXT_BASE_PX, title: `Paragraph (${p}px)`, size: 11 },
  ];
}

/** Text-style dropdown, shown when every selected shape is a text shape.
 * Follows the same picker pattern as the color/size pickers; P is default. */
function TextStylePicker() {
  const editor = useEditor();
  const [isOpen, setIsOpen] = useState(false);
  const popoverId = 'contextual text sizes';
  const presetSizes = useUiPresetStore((st) => st.config?.sizes);
  const textPresets = getTextPresets(presetSizes);

  const scales = editor
    .getSelectedShapes()
    .filter((s) => s.type === 'text')
    .map((s) => (s.props as { scale: number }).scale);
  const allSame = scales.length > 0 && scales.every((v) => Math.abs(v - scales[0]) < 0.01);
  const current = allSame
    ? (textPresets.find((p) => Math.abs(p.scale - scales[0]) < 0.01) ?? null)
    : null;

  const apply = (preset: (typeof textPresets)[number]) => {
    editor.markHistoryStoppingPoint('contextual text size');
    editor.run(() => {
      for (const shape of editor.getSelectedShapes()) {
        if (shape.type === 'text') {
          editor.updateShape({ id: shape.id, type: 'text', props: { scale: preset.scale } });
        }
      }
    });
    // closing immediately keeps the toolbar clickable (see StylePicker)
    tlmenus.deleteOpenMenu(popoverId, editor.contextId);
    setIsOpen(false);
  };

  return (
    <TldrawUiPopover id={popoverId} open={isOpen} onOpenChange={setIsOpen}>
      <TldrawUiPopoverTrigger>
        <TldrawUiToolbarButton type="icon" title="Text style">
          <span className="font-semibold leading-none" style={{ fontSize: current?.size ?? 11 }}>
            {current?.label ?? 'P'}
          </span>
        </TldrawUiToolbarButton>
      </TldrawUiPopoverTrigger>
      <TldrawUiPopoverContent side="bottom" align="center" sideOffset={8}>
        <div className="tlui-menu grid grid-cols-4 gap-1 p-1" style={{ display: 'grid' }}>
          {textPresets.map((preset) => (
            <TldrawUiToolbarButton
              key={preset.label}
              type="icon"
              title={preset.title}
              isActive={current?.label === preset.label}
              onClick={() => apply(preset)}
            >
              <span className="font-semibold leading-none" style={{ fontSize: preset.size }}>
                {preset.label}
              </span>
            </TldrawUiToolbarButton>
          ))}
        </div>
      </TldrawUiPopoverContent>
    </TldrawUiPopover>
  );
}

// ================= table & card groups =================

/** Prevents a panel click from blurring the rich-text cell/field being edited. */
const keepCellFocus = (e: MouseEvent) => e.preventDefault();

const TABLE_ALIGN_ITEMS: { value: TableAlign; icon: TLUiIconType }[] = [
  { value: 'start', icon: 'text-align-left' },
  { value: 'middle', icon: 'text-align-center' },
  { value: 'end', icon: 'text-align-right' },
];

function AlignTrio({
  current,
  onPick,
  testid,
}: {
  /** null shows no active alignment (e.g. a row that follows its columns) */
  current: TableAlign | null;
  onPick: (a: TableAlign) => void;
  testid: string;
}) {
  return (
    <>
      {TABLE_ALIGN_ITEMS.map((it) => (
        <TldrawUiButton
          key={it.value}
          type="low"
          title={`Align ${it.value}`}
          data-testid={`${testid}.${it.value}`}
          isActive={current === it.value}
          onMouseDown={keepCellFocus}
          onClick={() => onPick(it.value)}
        >
          <TldrawUiButtonIcon icon={it.icon} />
        </TldrawUiButton>
      ))}
    </>
  );
}

/** tiny stroke glyphs that read as "row/column +/−" at a glance — lucide has no
 *  insert/remove row/column pair, so these mirror its stroke style (24-box,
 *  width 2, round caps): bars = the axis, ⊕/⊖ badge bottom-right = the op */
function StructureGlyph({ op }: { op: 'add-row' | 'remove-row' | 'add-col' | 'remove-col' }) {
  const isRow = op.endsWith('row');
  const add = op.startsWith('add');
  return (
    <svg
      className="h-4 w-4"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      {isRow ? (
        <>
          <path d="M3 6h13" />
          <path d="M3 12h13" />
          <path d="M3 18h13" />
        </>
      ) : (
        <>
          <path d="M6 3v13" />
          <path d="M12 3v13" />
          <path d="M18 3v13" />
        </>
      )}
      {add ? <path d="M20 17v6M17 20h6" /> : <path d="M17 20h6" />}
    </svg>
  );
}

/** icon-only contextual toolbar: uniform square buttons, no visible text
 *  labels (all meaning moves to `title` tooltips) — mirrors the native
 *  rich-text option bar look. Idempotent, injected once per page. */
let panelStylesInjected = false;
function ensurePanelStyles() {
  if (panelStylesInjected || typeof document === 'undefined') return;
  panelStylesInjected = true;
  const el = document.createElement('style');
  el.setAttribute('data-tl-table-panel', '');
  el.textContent = `
.tlui-contextual-toolbar .tlui-button{width:32px;height:32px;padding:0;display:inline-flex;align-items:center;justify-content:center}
.tlui-contextual-toolbar .tlui-button svg{width:16px;height:16px;flex:none}
.tlui-contextual-toolbar .tlui-button__label{display:none}
`;
  document.head.appendChild(el);
}

/** Table structure / header / alignment controls — shown when one table is selected. */
function TableControlsGroup({ shape }: { shape: TableShape }) {
  const editor = useEditor();
  const { cells, hasHeader, bodyAlign, rowAlign } = shape.props;
  const rows = cells.length;
  const cols = cells[0]?.length ?? 1;
  const ops = tableOps(editor, shape.id);

  // the clicked row/column (set via the table's edge handles) decides what
  // the alignment control affects; without one it aligns the whole table
  const sel = useValue(
    'table rc selection for panel',
    () => {
      const s = selRC.get();
      return s && s.id === shape.id ? s : null;
    },
    [shape.id],
  );

  const act = (label: string, fn: () => void) => {
    editor.markHistoryStoppingPoint(label);
    fn();
  };
  const targetTitle = !sel
    ? 'Aligning whole table'
    : sel.kind === 'row'
      ? hasHeader && sel.index === 0
        ? 'Aligning header row'
        : `Aligning row ${hasHeader ? sel.index : sel.index + 1}`
      : `Aligning column ${sel.index + 1}`;
  // rows without an explicit override show no active alignment: they follow
  // their columns until one is picked here
  const currentAlign: TableAlign | null = !sel
    ? (bodyAlign[0] ?? 'start')
    : sel.kind === 'row'
      ? (() => {
          const ro = rowAlign?.[sel.index];
          return ro && ro !== 'auto' ? ro : null;
        })()
      : (bodyAlign[sel.index] ?? 'start');
  const applyAlign = (a: TableAlign) => {
    if (!sel) {
      act('table align all', () => {
        for (let c = 0; c < cols; c++) ops.setColAlign(c, a);
      });
    } else if (sel.kind === 'row') {
      act(`table row ${sel.index + 1} align`, () => ops.setRowAlign(sel.index, a));
    } else {
      act(`table col ${sel.index + 1} align`, () => ops.setColAlign(sel.index, a));
    }
  };

  return (
    <>
      <TldrawUiButton
        type="low"
        title="Add row"
        data-testid="style-picker.table.add-row"
        onMouseDown={keepCellFocus}
        onClick={() => act('table add row', ops.addRow)}
      >
        <StructureGlyph op="add-row" />
      </TldrawUiButton>
      <TldrawUiButton
        type="low"
        title="Remove last row"
        data-testid="style-picker.table.remove-row"
        disabled={rows <= (hasHeader ? 2 : 1)}
        onMouseDown={keepCellFocus}
        onClick={() => act('table remove row', ops.removeRow)}
      >
        <StructureGlyph op="remove-row" />
      </TldrawUiButton>
      <TldrawUiButton
        type="low"
        title="Add column"
        data-testid="style-picker.table.add-col"
        onMouseDown={keepCellFocus}
        onClick={() => act('table add col', ops.addCol)}
      >
        <StructureGlyph op="add-col" />
      </TldrawUiButton>
      <TldrawUiButton
        type="low"
        title="Remove last column"
        data-testid="style-picker.table.remove-col"
        disabled={cols <= 1}
        onMouseDown={keepCellFocus}
        onClick={() => act('table remove col', ops.removeCol)}
      >
        <StructureGlyph op="remove-col" />
      </TldrawUiButton>
      <TldrawUiButton
        type="low"
        title="Toggle header row"
        data-testid="style-picker.table.header"
        isActive={hasHeader}
        onMouseDown={keepCellFocus}
        onClick={() => act('table toggle header', ops.toggleHeader)}
      >
        <PanelTop className="h-3.5 w-3.5" />
      </TldrawUiButton>

      <div
        className="flex items-center gap-1"
        data-testid="style-picker.table.align-group"
        title={targetTitle}
      >
        <AlignTrio current={currentAlign} testid="style-picker.table.align" onPick={applyAlign} />
        {sel?.kind === 'row' && (
          <TldrawUiButton
            type="low"
            title="Follow column alignment"
            data-testid="style-picker.table.align.auto"
            isActive={rowAlign?.[sel.index] === 'auto'}
            onMouseDown={keepCellFocus}
            onClick={() => act(`table row ${sel.index + 1} align auto`, () => ops.setRowAlign(sel.index, 'auto'))}
          >
            <WandSparkles className="h-4 w-4" />
          </TldrawUiButton>
        )}
      </div>
    </>
  );
}

/** Variant / icon / toggle controls — shown when one callout card is selected. */
function CardControlsGroup({ shape }: { shape: CalloutCardShape }) {
  const editor = useEditor();
  const { variant, icon, showIcon, showBadge, tinted, collapsed } = shape.props;
  const isDark = useValue('callout card dark', () => editor.user.getIsDarkMode(), [editor]);
  const [variantOpen, setVariantOpen] = useState(false);
  const [iconOpen, setIconOpen] = useState(false);

  const set = (label: string, props: Parameters<typeof updateCard>[2]) => {
    editor.markHistoryStoppingPoint(label);
    updateCard(editor, shape.id, props);
  };
  const closePop = (id: string, setOpen: (open: boolean) => void) => {
    tlmenus.deleteOpenMenu(id, editor.contextId);
    setOpen(false);
  };

  return (
    <>
      <TldrawUiPopover id="contextual card variant" open={variantOpen} onOpenChange={setVariantOpen}>
        <TldrawUiPopoverTrigger>
          <TldrawUiToolbarButton
            type="icon"
            title={`Variant: ${VARIANTS[variant].label}`}
            data-testid="style-picker.card.variant"
            onMouseDown={keepCellFocus}
          >
            <span
              className="inline-block h-3 w-3 rounded-full"
              style={{ background: isDark ? VARIANTS[variant].dark : VARIANTS[variant].light }}
            />
          </TldrawUiToolbarButton>
        </TldrawUiPopoverTrigger>
        <TldrawUiPopoverContent side="bottom" align="center" sideOffset={8}>
          <div className="tlui-menu grid gap-1 p-1" style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)' }}>
            {(Object.keys(VARIANTS) as CalloutVariant[]).map((v) => (
              <TldrawUiButton
                key={v}
                type="low"
                title={VARIANTS[v].label}
                data-testid={`style-picker.card.variant.${v}`}
                isActive={variant === v}
                onMouseDown={keepCellFocus}
                onClick={() => {
                  set(`card variant ${v}`, { variant: v, icon: VARIANTS[v].icon });
                  closePop('contextual card variant', setVariantOpen);
                }}
              >
                <span
                  className="mr-1.5 inline-block h-2.5 w-2.5 rounded-full"
                  style={{ background: isDark ? VARIANTS[v].dark : VARIANTS[v].light }}
                />
                {VARIANTS[v].label}
              </TldrawUiButton>
            ))}
          </div>
        </TldrawUiPopoverContent>
      </TldrawUiPopover>

      <TldrawUiPopover id="contextual card icon" open={iconOpen} onOpenChange={setIconOpen}>
        <TldrawUiPopoverTrigger>
          <TldrawUiToolbarButton
            type="icon"
            title="Icon"
            data-testid="style-picker.card.icon-picker"
            onMouseDown={keepCellFocus}
          >
            <IconSvg name={icon} size={14} />
          </TldrawUiToolbarButton>
        </TldrawUiPopoverTrigger>
        <TldrawUiPopoverContent side="bottom" align="center" sideOffset={8}>
          <div className="tlui-menu grid grid-cols-6 gap-1 p-1" style={{ display: 'grid' }}>
            {ICON_ORDER.map((name) => (
              <TldrawUiToolbarButton
                key={name}
                type="icon"
                title={name}
                data-testid={`style-picker.card.icon.${name}`}
                isActive={icon === name}
                onMouseDown={keepCellFocus}
                onClick={() => set(`card icon ${name}`, { icon: name, showIcon: true })}
              >
                <IconSvg name={name} size={14} />
              </TldrawUiToolbarButton>
            ))}
          </div>
        </TldrawUiPopoverContent>
      </TldrawUiPopover>

      <TldrawUiToolbarButton
        type="icon"
        title={showIcon ? 'Hide icon' : 'Show icon'}
        data-testid="style-picker.card.toggle.icon"
        isActive={showIcon}
        onMouseDown={keepCellFocus}
        onClick={() => set('card toggle icon', { showIcon: !showIcon })}
      >
        {showIcon ? <Eye className="h-4 w-4" /> : <EyeOff className="h-4 w-4" />}
      </TldrawUiToolbarButton>
      <TldrawUiToolbarButton
        type="icon"
        title="Badge"
        data-testid="style-picker.card.toggle.badge"
        isActive={showBadge}
        onMouseDown={keepCellFocus}
        onClick={() => set('card toggle badge', { showBadge: !showBadge })}
      >
        <Tag className="h-4 w-4" />
      </TldrawUiToolbarButton>
      <TldrawUiToolbarButton
        type="icon"
        title="Tint"
        data-testid="style-picker.card.toggle.tint"
        isActive={tinted}
        onMouseDown={keepCellFocus}
        onClick={() => set('card toggle tint', { tinted: !tinted })}
      >
        <Droplet className="h-4 w-4" />
      </TldrawUiToolbarButton>
      <TldrawUiToolbarButton
        type="icon"
        title="Collapse"
        data-testid="style-picker.card.toggle.collapse"
        isActive={collapsed}
        onMouseDown={keepCellFocus}
        onClick={() => set('card toggle collapse', { collapsed: !collapsed })}
      >
        <Minimize2 className="h-4 w-4" />
      </TldrawUiToolbarButton>
    </>
  );
}

// `track` re-renders when the reactive editor state it reads changes — that
// is what makes the toolbar follow the selection.
export const ContextualStylePanel = track(() => {
  const editor = useEditor();
  // view mode: no chrome, just the sheets (the flag is read through a hook
  // up here — early returns must come after every hook call)
  const viewMode = useViewMode();
  // hooks must run on every render: the component early-returns below
  const presetColors = useUiPresetStore((st) => st.config?.colors);
  const hiddenColors = presetColors?.hidden;
  const colorItems = hiddenColors?.length
    ? COLOR_ITEMS.filter((i) => !hiddenColors.includes(i.value))
    : COLOR_ITEMS;
  const msg = useTranslation();
  // word colours live in the rich text editor, which is not part of tldraw's
  // reactive state: re-render on its transactions so the colour group's
  // active swatch follows the text selection
  const textEditor = editor.getRichTextEditor();
  useRichTextTick(textEditor);
  // icon-only uniform square buttons across the contextual toolbar (all groups)
  useEffect(() => ensurePanelStyles(), []);

  const styles = editor.getSharedStyles();
  // view mode: no chrome, just the sheets
  if (viewMode) return null;
  // stays visible while a text shape is being edited: the colour group then
  // paints the selected words (StylePicker.handleSelect / wordColorValue)
  if (
    (!editor.isIn('select.idle') && !editor.isIn('select.editing_shape')) ||
    editor.getSelectedShapeIds().length === 0
  )
    return null;

  const allText =
    editor.getSelectedShapes().length > 0 &&
    editor.getSelectedShapes().every((s) => s.type === 'text');
  const multipleSelected = editor.getSelectedShapeIds().length >= 2;
  // table & card carry their own control groups instead of tldraw styles
  const selectedShapes = editor.getSelectedShapes();
  const onlyTable =
    selectedShapes.length === 1 && selectedShapes[0].type === 'table' ? (selectedShapes[0] as TableShape) : null;
  const onlyCard =
    selectedShapes.length === 1 && selectedShapes[0].type === 'callout-card'
      ? (selectedShapes[0] as CalloutCardShape)
      : null;
  // text-selection context (word or select-all): the main option bar steps
  // aside so only the content edit bar shows; table/card structure
  // groups are not string styling and stay put
  if (hasActiveTextSelection(textEditor) && !onlyTable && !onlyCard) return null;

  const color = styles.get(DefaultColorStyle);
  const fill = styles.get(DefaultFillStyle);
  const dash = styles.get(DefaultDashStyle);
  const size = styles.get(DefaultSizeStyle);
  const font = styles.get(DefaultFontStyle);
  const geo = styles.get(GeoShapeGeoStyle);
  const arrowKind = styles.get(ArrowShapeKindStyle);
  const arrowheadStart = styles.get(ArrowShapeArrowheadStartStyle);
  const arrowheadEnd = styles.get(ArrowShapeArrowheadEndStyle);
  const spline = styles.get(LineShapeSplineStyle);
  const textAlign = styles.get(DefaultTextAlignStyle);
  const labelAlign = styles.get(DefaultHorizontalAlignStyle);
  const verticalAlign = styles.get(DefaultVerticalAlignStyle);

  // getSelectionBounds collapses the rotated bounds to zero height so the
  // toolbar sits just above the top edge of the selection. Tables float
  // their column ticks in a ~18px band above that edge: lift the toolbar
  // past the band so it never covers (and never swallows clicks on) them.
  const onlyTableLift = onlyTable ? 24 : 0;
  const getSelectionBounds = () => {
    const bounds = editor.getSelectionRotatedScreenBounds();
    if (!bounds) return undefined;
    return new Box(bounds.x, bounds.y - onlyTableLift, bounds.width, 0);
  };

  return (
    <TldrawUiContextualToolbar
      getSelectionBounds={getSelectionBounds}
      label={msg('style-panel.title')}
    >
      {allText && <TextStylePicker />}
      {multipleSelected && <AlignmentMenu />}
      {onlyTable && <TableControlsGroup shape={onlyTable} />}
      {onlyCard && <CardControlsGroup shape={onlyCard} />}
      {color && (
        <StylePicker
          uiType="color"
          style={DefaultColorStyle}
          value={wordColorValue(textEditor, color, (hex) =>
            colorItems.find(
              (i) => (presetColors?.overrides?.[i.value] ?? getColorValue(editor, i.value)) === hex,
            )?.value,
          )}
          items={colorItems}
          getItemColor={(value) => presetColors?.overrides?.[value] ?? getColorValue(editor, value)}
        />
      )}
      {fill && <StylePicker uiType="fill" style={DefaultFillStyle} value={fill} items={FILL_ITEMS} />}
      {dash && <StylePicker uiType="dash" style={DefaultDashStyle} value={dash} items={DASH_ITEMS} />}
      {/* text shapes carry tldraw's generic S/M/L size style; the H1–H3/P
          presets replace it, so hide the small/medium/large picker for text */}
      {size && !allText && <StylePicker uiType="size" style={DefaultSizeStyle} value={size} items={SIZE_ITEMS} />}
      {font && <StylePicker uiType="font" style={DefaultFontStyle} value={font} items={FONT_ITEMS} />}
      {geo && <StylePicker uiType="geo" style={GeoShapeGeoStyle} value={geo} items={GEO_ITEMS} />}
      {arrowKind && (
        <StylePicker uiType="arrow-kind" style={ArrowShapeKindStyle} value={arrowKind} items={ARROW_KIND_ITEMS} />
      )}
      {arrowheadStart && (
        <StylePicker
          uiType="arrowheadStart"
          labelKey="style-panel.arrowhead-start"
          style={ArrowShapeArrowheadStartStyle}
          value={arrowheadStart}
          items={ARROWHEAD_ITEMS}
        />
      )}
      {arrowheadEnd && (
        <StylePicker
          uiType="arrowheadEnd"
          labelKey="style-panel.arrowhead-end"
          style={ArrowShapeArrowheadEndStyle}
          value={arrowheadEnd}
          items={ARROWHEAD_ITEMS}
        />
      )}
      {spline && (
        <StylePicker uiType="spline" style={LineShapeSplineStyle} value={spline} items={SPLINE_ITEMS} />
      )}
      {textAlign && (
        <StylePicker uiType="align" style={DefaultTextAlignStyle} value={textAlign} items={TEXT_ALIGN_ITEMS} />
      )}
      {labelAlign && (
        <StylePicker
          uiType="align"
          labelKey="style-panel.label-align"
          style={DefaultHorizontalAlignStyle}
          value={labelAlign}
          items={LABEL_ALIGN_ITEMS}
        />
      )}
      {verticalAlign && (
        <StylePicker
          uiType="verticalAlign"
          labelKey="style-panel.vertical-align"
          style={DefaultVerticalAlignStyle}
          value={verticalAlign}
          items={VERTICAL_ALIGN_ITEMS}
        />
      )}
    </TldrawUiContextualToolbar>
  );
});
