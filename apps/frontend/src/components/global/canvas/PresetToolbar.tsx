import { createContext, Fragment, useContext, useEffect, useState } from 'react';
import { Blocks } from 'lucide-react';
import {
  AssetToolbarItem,
  ArrowToolbarItem,
  DefaultToolbar,
  DefaultToolbarContent,
  DrawToolbarItem,
  EraserToolbarItem,
  FrameToolbarItem,
  HandToolbarItem,
  HighlightToolbarItem,
  LineToolbarItem,
  NoteToolbarItem,
  SelectToolbarItem,
  TextToolbarItem,
  TldrawUiToolbarButton,
  useEditor,
  useValue,
  DefaultFontStyle,
} from 'tldraw';
import { useViewMode } from '@/features/canvas/view-mode';
import { ShapesToolbarItem } from '@/features/canvas/components/shapes-menu';
import { TEXT_BASE_PX, type ToolId } from '@/constants/presets/catalog';
import { useUiPresetStore } from '@/stores/ui-preset-store';
import { ComponentsMenu } from './ComponentsMenu';

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
  frame: FrameToolbarItem,
};

/**
 * Toolbar override following tldraw's add-tool-to-example. When the
 * chapter has a UI preset, the default tools are replaced by the preset's
 * enabled tools in its saved order; otherwise tldraw's default content
 * renders. The Components button sits at the toolbar's 4th place and the
 * canvas-zoom readout closes the row behind a hairline divider so the whole
 * row stays one pill.
 */
function PresetToolbar({ zoomMenu }: { zoomMenu?: React.ReactNode }) {
  const editor = useEditor();
  const config = useUiPresetStore((s) => s.config);
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

  // apply the preset's defaults: font for new shapes, and M-size for new text
  // (tldraw's text base is 24px, so scale = px / 24)
  useEffect(() => {
    if (!config) return;
    editor.setStyleForNextShapes(DefaultFontStyle, config.fonts.default);
    const off = editor.sideEffects.registerBeforeCreateHandler('shape', (shape) => {
      if (shape.type !== 'text') return shape;
      return { ...shape, props: { ...(shape.props as object), scale: config.sizes.p / TEXT_BASE_PX } };
    });
    return off;
  }, [editor, config]);

  const componentsVisible =
    config ? config.toolbar.find((t) => t.id === 'components')?.visible !== false : true;
  const tools = config
    ? config.toolbar
        .filter((t) => t.visible && TOOL_ITEMS[t.id])
        .map((t) => ({ id: t.id, Item: TOOL_ITEMS[t.id]! }))
    : null;

  const componentsButton = componentsVisible ? (
    <TldrawUiToolbarButton
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

  // the Components entry sits at the 4th place in the toolbar: after the
  // first three tool buttons (preset-ordered); when there are three or fewer
  // preset tools it closes the row. tldraw's default content block cannot be
  // interleaved, so without a preset it lands right after it.
  let toolNodes: React.ReactNode[];
  if (tools) {
    toolNodes = [];
    let componentsPlaced = false;
    tools.forEach(({ id, Item }, i) => {
      if (i === 3 && componentsButton) {
        toolNodes.push(<Fragment key="components">{componentsButton}</Fragment>);
        componentsPlaced = true;
      }
      // keys are the stable tool ids (not list positions), so the buttons
      // keep their tldraw component state while the list reorders
      toolNodes.push(<Item key={id} />);
    });
    if (componentsButton && !componentsPlaced) {
      toolNodes.push(<Fragment key="components">{componentsButton}</Fragment>);
    }
  } else {
    toolNodes = [<DefaultToolbarContent key="default" />, ...(componentsButton ? [<Fragment key="components">{componentsButton}</Fragment>] : [])];
  }

  return (
    <div
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      style={{ opacity: dimmed ? 0.2 : 1, transition: 'opacity 150ms ease-out' }}
    >
      <DefaultToolbar>
        {toolNodes}
        {isActive && componentsButton && <ComponentsMenu />}
        {zoomMenu && (
          <div className="oort-toolbar__zoom">
            <span className="oort-toolbar__zoom-divider" aria-hidden />
            {zoomMenu}
          </div>
        )}
      </DefaultToolbar>
    </div>
  );
}
