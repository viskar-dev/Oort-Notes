import { createContext, Fragment, useContext, useEffect, useRef, useState } from 'react';
import { Blocks, ChevronUp } from 'lucide-react';
import {
  AssetToolbarItem,
  ArrowToolbarItem,
  DrawToolbarItem,
  EraserToolbarItem,
  FrameToolbarItem,
  HandToolbarItem,
  HighlightToolbarItem,
  LaserToolbarItem,
  LineToolbarItem,
  NoteToolbarItem,
  SelectToolbarItem,
  TextToolbarItem,
  TldrawUiMenuContextProvider,
  TldrawUiToolbar,
  TldrawUiToolbarButton,
  preventDefault,
  useEditor,
  usePassThroughWheelEvents,
  useValue,
  DefaultFontStyle,
} from 'tldraw';
import { useViewMode } from '@/features/canvas/view-mode';
import { ShapesToolbarItem } from '@/features/canvas/components/shapes-menu';
import { FloatingPopover } from '@/features/canvas/components/contextual-style-panel';
import { defaultConfig } from '@/lib/preset-config';
import { TEXT_BASE_PX, type ToolId } from '@/constants/presets/catalog';
import { useUiPresetStore } from '@/stores/ui-preset-store';
import { ComponentsMenuContent } from './ComponentsMenu';

/** The toolbar a chapter sees without an assigned preset: the same strip a
 *  fresh preset produces (with the collapsed Shapes picker) rather than
 *  tldraw's raw 28-button content, so both modes look identical. */
const FALLBACK_CONFIG = defaultConfig();

/** How many tool buttons fit the pill; the rest move behind the more button. */
const MAX_STRIP_TOOLS = 10;

/**
 * Slot that carries the chapter's zoom menu into the toolbar. tldraw renders
 * the Toolbar from its components map, so the zoom control travels through a
 * context rather than a prop: the Toolbar component itself must keep a stable
 * identity, otherwise React remounts it (and tldraw's whole UI provider) on
 * every render.
 */
export const ZoomSlotContext = createContext<React.ReactNode>(null);

/** Stable toolbar override; reads the zoom slot and renders the pill. */
export function ToolbarOverride() {
  const zoomMenu = useContext(ZoomSlotContext);
  // view mode: no chrome, just the sheets
  if (useViewMode()) return null;
  return <PresetToolbar zoomMenu={zoomMenu} />;
}

/**
 * The strip's tail overflow: entries that didn't fit the 10-slot cap open
 * behind the zoom readout. The entries are the regular toolbar items, so
 * they activate their tool and light up like anywhere else. The panel keeps
 * a compact grid: up to four columns, shrinking to the entry count so a
 * two-tool or one-tool overflow doesn't leave a half-empty wide card.
 */
function MoreToolsButton({ items }: { items: React.ReactNode[] }) {
  const [isOpen, setIsOpen] = useState(false);
  const triggerRef = useRef<HTMLButtonElement | null>(null);
  const columns = Math.min(4, Math.max(1, items.length));
  return (
    <>
      <TldrawUiToolbarButton
        ref={triggerRef}
        type="tool"
        title="More tools"
        data-testid="toolbar.more"
        isActive={isOpen}
        onPointerDown={preventDefault}
        onClick={() => setIsOpen((open) => !open)}
      >
        <ChevronUp className="h-5 w-5" />
      </TldrawUiToolbarButton>
      <FloatingPopover anchorRef={triggerRef} open={isOpen} onClose={() => setIsOpen(false)} placement="top">
        <div
          className="tlui-menu grid gap-1 p-1"
          style={{ display: 'grid', gridTemplateColumns: `repeat(${columns}, minmax(0, 1fr))` }}
        >
          {items}
        </div>
      </FloatingPopover>
    </>
  );
}

/** Per-tool toolbar buttons, keyed by preset tool id. */
const TOOL_ITEMS: Partial<Record<ToolId, () => React.JSX.Element>> = {
  select: SelectToolbarItem,
  hand: HandToolbarItem,
  draw: DrawToolbarItem,
  eraser: EraserToolbarItem,
  arrow: ArrowToolbarItem,
  text: TextToolbarItem,
  note: NoteToolbarItem,
  image: AssetToolbarItem,
  // one trigger that opens the shape picker (click a shape to create it)
  shape: ShapesToolbarItem,
  line: LineToolbarItem,
  highlight: HighlightToolbarItem,
  laser: LaserToolbarItem,
  frame: FrameToolbarItem,
};

/**
 * Toolbar override following tldraw's add-tool-to-example. When the
 * chapter has a UI preset, the default tools are replaced by the preset's
 * enabled tools in its saved order — the same order the preset editor's
 * toolbar tab shows; otherwise the fresh-preset strip renders. The
 * canvas-zoom readout closes the row behind a hairline divider so the whole
 * row stays one pill.
 */
function PresetToolbar({ zoomMenu }: { zoomMenu?: React.ReactNode }) {
  const editor = useEditor();
  const presetConfig = useUiPresetStore((s) => s.config);
  const config = presetConfig ?? FALLBACK_CONFIG;
  const wheelRef = useRef<HTMLDivElement | null>(null);
  usePassThroughWheelEvents(wheelRef as React.RefObject<HTMLElement>);
  const isActive = useValue(
    'components tool active',
    () => editor.getCurrentToolId() === 'components',
    [editor],
  );
  // idle dimming: the pill fades to 20% unless the pointer is over it or a
  // drawing tool (anything other than select) is active
  const [hovered, setHovered] = useState(false);
  const isSelectTool = useValue(
    'toolbar idle',
    () => editor.getCurrentToolId() === 'select',
    [editor],
  );
  const dimmed = !hovered && !isActive && isSelectTool;

  // apply the preset's defaults: font for new shapes, and M-size for new
  // text (tldraw's text base is 24px, so scale = px / 24). The font always
  // applies — without an assigned preset this sets Oort's default font
  // (sans) instead of leaving tldraw's stock 'draw' as the default; the
  // text-scale side effect stays preset-only (the fallback strip must not
  // touch new-shape sizing).
  useEffect(() => {
    editor.setStyleForNextShapes(
      DefaultFontStyle,
      presetConfig?.fonts.default ?? FALLBACK_CONFIG.fonts.default,
    );
    if (!presetConfig) return;
    const off = editor.sideEffects.registerBeforeCreateHandler('shape', (shape) => {
      if (shape.type !== 'text') return shape;
      return { ...shape, props: { ...(shape.props as object), scale: presetConfig.sizes.p / TEXT_BASE_PX } };
    });
    return off;
  }, [editor, presetConfig]);

  const componentsVisible = config.toolbar.find((t) => t.id === 'components')?.visible !== false;
  const componentsTriggerRef = useRef<HTMLButtonElement | null>(null);
  const componentsButton = componentsVisible ? (
    <TldrawUiToolbarButton
      ref={componentsTriggerRef}
      type="tool"
      title="Components"
      data-testid="toolbar.components"
      isActive={isActive}
      // toggle, reading the live tool id (a captured `isActive` can be stale
      // after Escape closes the menu mid-render)
      onClick={() =>
        editor.setCurrentTool(editor.getCurrentToolId() === 'components' ? 'select' : 'components')
      }
    >
      <Blocks className="h-5 w-5" />
    </TldrawUiToolbarButton>
  ) : null;

  // the strip keeps a fixed 10-slot cap: the first ten configured tools own
  // the pill, everything else (a preset's 11th+ tool, and in defaults mode
  // the tldraw defaults a fresh strip leaves out — line, highlighter, laser,
  // frame) moves to the more panel behind the zoom readout.
  const entries: React.ReactNode[] = [];
  for (const item of config.toolbar) {
    if (item.id === 'components') {
      if (componentsButton) entries.push(<Fragment key="components">{componentsButton}</Fragment>);
      continue;
    }
    const Item = TOOL_ITEMS[item.id];
    if (Item && item.visible) entries.push(<Item key={item.id} />);
  }
  if (!presetConfig) {
    for (const item of FALLBACK_CONFIG.toolbar) {
      const Item = TOOL_ITEMS[item.id];
      if (!item.visible && Item) entries.push(<Item key={item.id} />);
    }
  }
  const inlineNodes = entries.slice(0, MAX_STRIP_TOOLS);
  const overflowNodes = entries.slice(MAX_STRIP_TOOLS);

  return (
    <div
      ref={wheelRef}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      style={{ opacity: dimmed ? 0.2 : 1, transition: 'opacity 150ms ease-out' }}
    >
      <div className="tlui-toolbar">
        <div className="tlui-toolbar__inner">
          <div className="tlui-toolbar__left">
            {/* tldraw's DefaultToolbar wraps children in OverflowingToolbar,
                which hides everything past a hard item-count cap (~9) and
                re-renders duplicates inside a "more" popover — with a
                10-button preset that buried the Shapes trigger (and would
                hit the zoom slot) in a menu whose cloned state breaks the
                picker. Render the same pill classes without any overflow:
                the strip wraps on truly narrow windows instead. */}
            <TldrawUiToolbar className="tlui-toolbar__tools" label="Toolbar">
              <TldrawUiMenuContextProvider type="toolbar" sourceId="toolbar">
                {inlineNodes}
                {/* the components picker opens anchored to its own button —
                    the clean, position-tracked popover the Shapes picker
                    uses (outside clicks deactivate the tool) */}
                {componentsButton && (
                  <FloatingPopover
                    anchorRef={componentsTriggerRef}
                    open={isActive}
                    onClose={() => editor.setCurrentTool('select')}
                    placement="top"
                  >
                    <ComponentsMenuContent />
                  </FloatingPopover>
                )}
                {zoomMenu && (
                  <div className="oort-toolbar__zoom">
                    <span className="oort-toolbar__zoom-divider" aria-hidden />
                    {zoomMenu}
                  </div>
                )}
                {overflowNodes.length > 0 && <MoreToolsButton items={overflowNodes} />}
              </TldrawUiMenuContextProvider>
            </TldrawUiToolbar>
          </div>
        </div>
      </div>
    </div>
  );
}
