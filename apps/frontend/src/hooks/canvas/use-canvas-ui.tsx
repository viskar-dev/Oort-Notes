import { useCallback, useMemo, useRef } from 'react';
import {
  DefaultMainMenu,
  DefaultPageMenu,
  DefaultZoomMenu,
  DefaultZoomMenuContent,
  TldrawUiMenuGroup,
  TldrawUiMenuItem,
} from 'tldraw';
import { ContextualStylePanel } from '@/features/canvas/components/contextual-style-panel';
import { CanvasRichTextToolbar } from '@/features/canvas/canvas-rich-text-toolbar';
import { MainMenuContentWithPdf } from '@/components/global/canvas/ExportAsMenu';
import { PortalSlot } from '@/features/canvas/components/portal-slot';
import { RICH_TEXT_EXTENSIONS } from '@/features/canvas/rich-text-setup';
import { StableContextMenu } from '@/components/global/canvas/StableContextMenu';
import { ToolbarOverride } from '@/components/global/canvas/PresetToolbar';
import type { FitMode } from '@/hooks/canvas/use-chapter-canvas';

/** tldraw UI wiring for the canvas shell: the top-bar menu slots, the zoom
 *  readout slot (page chapters get "Fit page"/"Fit screen" entries; the
 *  navigation-panel zoom menu itself is switched off so there is only one
 *  zoom control), the stable rich-text options and the components map. The
 *  components map must keep a stable identity: tldraw keys its editor on
 *  these props, so every entry below is module scope or ref-based. */
export function useCanvasUi({
  isPageChapter,
  applyFitMode,
}: {
  isPageChapter: boolean;
  applyFitMode: (mode: FitMode) => void;
}) {
  const pageMenuSlotRef = useRef<HTMLDivElement | null>(null);
  const mainMenuSlotRef = useRef<HTMLDivElement | null>(null);

  const ZoomMenu = useCallback(() => {
    if (!isPageChapter) return <DefaultZoomMenu />;
    return (
      <DefaultZoomMenu>
        <DefaultZoomMenuContent />
        <TldrawUiMenuGroup id="oort-fit-group">
          <TldrawUiMenuItem
            id="oort-fit-screen"
            label="Fit screen"
            onSelect={() => applyFitMode('screen')}
            noClose
          />
          <TldrawUiMenuItem
            id="oort-fit-page"
            label="Fit page"
            onSelect={() => applyFitMode('page')}
            noClose
          />
        </TldrawUiMenuGroup>
      </DefaultZoomMenu>
    );
  }, [isPageChapter, applyFitMode]);

  // the zoom readout lives inside the toolbar pill (handed over through
  // ZoomSlotContext — see PresetToolbar)
  const zoomSlot = useMemo(() => <ZoomMenu />, [ZoomMenu]);

  // stable identity: tldraw keys its editor on this prop
  const textOptions = useMemo(
    () => ({ tipTapConfig: { extensions: RICH_TEXT_EXTENSIONS } }),
    [],
  );

  const components = useMemo(
    () => ({
      MenuPanel: () => (
        <>
          <PortalSlot slotRef={mainMenuSlotRef}>
            <DefaultMainMenu>
              {/* stock content with the PDF row inside the stock
                  "Export as" submenu (see ExportAsMenu) */}
              <MainMenuContentWithPdf />
            </DefaultMainMenu>
          </PortalSlot>
          <PortalSlot slotRef={pageMenuSlotRef}>
            <DefaultPageMenu />
          </PortalSlot>
        </>
      ),
      ContextMenu: StableContextMenu,
      StylePanel: null,
      InFrontOfTheCanvas: ContextualStylePanel,
      RichTextToolbar: CanvasRichTextToolbar,
      Toolbar: ToolbarOverride,
      ZoomMenu: null,
    }),
    [],
  );

  return { pageMenuSlotRef, mainMenuSlotRef, zoomSlot, textOptions, components };
}
