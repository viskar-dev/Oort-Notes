import {
  ArrangeMenuSubmenu,
  ClipboardMenuGroup,
  ColorSchemeMenu,
  CopyAsMenuGroup,
  EditMenuSubmenu,
  EditSubmenu,
  ExtrasGroup,
  KeyboardShortcutsMenuItem,
  LanguageMenu,
  MoveToPageMenu,
  ReorderMenuSubmenu,
  SelectAllMenuItem,
  ToggleDebugModeItem,
  ToggleDynamicSizeModeItem,
  ToggleEdgeScrollingItem,
  ToggleFocusModeItem,
  ToggleGridItem,
  ToggleKeyboardShortcutsItem,
  TogglePasteAtCursorItem,
  ToggleReduceMotionItem,
  ToggleSnapModeItem,
  ToggleToolLockItem,
  ToggleWrapModeItem,
  TldrawUiMenuActionItem,
  TldrawUiMenuCheckboxItem,
  TldrawUiMenuGroup,
  TldrawUiMenuItem,
  TldrawUiMenuSubmenu,
  ToggleTransparentBgMenuItem,
  ViewSubmenu,
  useEditor,
  useValue,
} from 'tldraw';
import { isMac } from '@/lib/platform';
import { useExportStore } from '@/stores/export-store';
import { useViewModeStore } from '@/stores/view-mode-store';

/**
 * PDF export injection into tldraw's stock "Export as" submenus.
 *
 * tldraw already ships those submenus (main menu "Export as" and the canvas
 * context menu's "Export as", each with SVG / PNG / Transparent). The stock
 * groups are not injectable, so the menus render byte-identical copies of
 * their stock composition — same group ids, same action ids, same labels —
 * with one extra PDF row appended. The stock rows keep going through
 * tldraw's own action registry, untouched.
 */

/** The injected PDF row: whole-topic export (the open topic's sheet stack
 *  as a PDF, mirroring what the old top-bar chip did). Renders nothing
 *  where export is unavailable (infinite chapters) and disables while an
 *  export is in flight. */
export function PdfExportMenuItem() {
  const enabled = useExportStore((s) => s.enabled);
  const busy = useExportStore((s) => s.busy);
  const run = useExportStore((s) => s.run);
  if (!enabled || !run) return null;
  return <TldrawUiMenuItem id="oort-export-pdf" label="PDF" disabled={busy} onSelect={run} />;
}

/** tldraw's `DownloadOriginalMenuItem` (not part of its public surface):
 *  same display predicate — image/video shapes with an asset — same stock
 *  action. */
function DownloadOriginalMenuItem() {
  const editor = useEditor();
  const shouldDisplay = useValue(
    'should display download original option',
    () => {
      const selectedShapes = editor.getSelectedShapes();
      if (selectedShapes.length === 0) return false;
      return selectedShapes.some((shape) => {
        const isMedia =
          editor.isShapeOfType(shape, 'image') || editor.isShapeOfType(shape, 'video');
        return isMedia && 'assetId' in shape.props && !!shape.props.assetId;
      });
    },
    [editor],
  );
  if (!shouldDisplay) return null;
  return <TldrawUiMenuActionItem actionId="download-original" />;
}

/** Byte-identical copy of tldraw's `ConversionsMenuGroup` (context menu)
 *  with the PDF row appended to the "Export as" group. */
export function ConversionsMenuGroupWithPdf() {
  const editor = useEditor();
  const atLeastOneShapeOnPage = useValue(
    'atLeastOneShapeOnPage',
    () => editor.getCurrentPageShapeIds().size > 0,
    [editor],
  );
  if (!atLeastOneShapeOnPage) return null;
  return (
    <TldrawUiMenuGroup id="conversions">
      <CopyAsMenuGroup />
      <TldrawUiMenuSubmenu id="export-as" label="context-menu.export-as" size="small">
        <TldrawUiMenuGroup id="export-as-group">
          <TldrawUiMenuActionItem actionId="export-as-svg" />
          <TldrawUiMenuActionItem actionId="export-as-png" />
          <PdfExportMenuItem />
        </TldrawUiMenuGroup>
        <TldrawUiMenuGroup id="export-as-bg">
          <ToggleTransparentBgMenuItem />
        </TldrawUiMenuGroup>
      </TldrawUiMenuSubmenu>
      <DownloadOriginalMenuItem />
    </TldrawUiMenuGroup>
  );
}

/** The View mode row (Preferences submenu, right below Focus mode with the
 *  Ctrl+Alt+V shortcut — ⌥⌘V on mac): covers page chapters in the
 *  chrome-less reading mode. Self-hides outside page chapters. */
export function ViewModeMenuItem() {
  const enabled = useViewModeStore((s) => s.enabled);
  const on = useViewModeStore((s) => s.on);
  const toggle = useViewModeStore((s) => s.toggle);
  if (!enabled || !toggle) return null;
  return (
    <TldrawUiMenuCheckboxItem
      id="oort-view-mode"
      label="View mode"
      kbd={isMac() ? 'cmd+alt+v' : 'ctrl+alt+v'}
      checked={on}
      onSelect={toggle}
    />
  );
}

/** Byte-identical copy of tldraw's `PreferencesGroup` with the View mode row
 *  inserted directly below "Focus mode" (page chapters only). */
export function PreferencesGroupWithViewMode() {
  return (
    <TldrawUiMenuGroup id="preferences">
      <TldrawUiMenuSubmenu id="preferences" label="menu.preferences">
        <TldrawUiMenuGroup id="preferences-actions">
          <ToggleSnapModeItem />
          <ToggleToolLockItem />
          <ToggleGridItem />
          <ToggleWrapModeItem />
          <ToggleFocusModeItem />
          <ViewModeMenuItem />
          <ToggleEdgeScrollingItem />
          <ToggleReduceMotionItem />
          <ToggleKeyboardShortcutsItem />
          <ToggleDynamicSizeModeItem />
          <TogglePasteAtCursorItem />
          <ToggleDebugModeItem />
        </TldrawUiMenuGroup>
        <TldrawUiMenuGroup id="color-scheme">
          <ColorSchemeMenu />
        </TldrawUiMenuGroup>
      </TldrawUiMenuSubmenu>
      <LanguageMenu />
      <KeyboardShortcutsMenuItem />
    </TldrawUiMenuGroup>
  );
}

/** Byte-identical copy of tldraw's `DefaultMainMenuContent` with the PDF row
 *  appended to the "Export as" submenu's export group, and View mode inside
 *  the Preferences submenu. */
export function MainMenuContentWithPdf() {
  return (
    <>
      <TldrawUiMenuGroup id="basic">
        <EditSubmenu />
        <ViewSubmenu />
        <TldrawUiMenuSubmenu id="export-all-as" label="context-menu.export-all-as" size="small">
          <TldrawUiMenuGroup id="export-all-as-group">
            <TldrawUiMenuActionItem actionId="export-all-as-svg" />
            <TldrawUiMenuActionItem actionId="export-all-as-png" />
            <PdfExportMenuItem />
          </TldrawUiMenuGroup>
          <TldrawUiMenuGroup id="export-all-as-bg">
            <ToggleTransparentBgMenuItem />
          </TldrawUiMenuGroup>
        </TldrawUiMenuSubmenu>
        <ExtrasGroup />
      </TldrawUiMenuGroup>
      <PreferencesGroupWithViewMode />
    </>
  );
}

/** Byte-identical copy of tldraw's `DefaultContextMenuContent` wired to the
 *  extended conversions group (minus the collaboration cursor-chat row,
 *  which this app never renders). */
export function OortContextMenuContentWithPdf() {
  const editor = useEditor();
  const selectToolActive = useValue(
    'isSelectToolActive',
    () => editor.getCurrentToolId() === 'select',
    [editor],
  );
  const isSinglePageMode = useValue(
    'isSinglePageMode',
    () => editor.options.maxPages <= 1,
    [editor],
  );
  if (!selectToolActive) return null;
  return (
    <>
      <TldrawUiMenuGroup id="modify">
        <EditMenuSubmenu />
        <ArrangeMenuSubmenu />
        <ReorderMenuSubmenu />
        {!isSinglePageMode && <MoveToPageMenu />}
      </TldrawUiMenuGroup>
      <ClipboardMenuGroup />
      <ConversionsMenuGroupWithPdf />
      <TldrawUiMenuGroup id="select-all">
        <SelectAllMenuItem />
      </TldrawUiMenuGroup>
    </>
  );
}
