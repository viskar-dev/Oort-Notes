import { create } from 'zustand';

/** What the canvas can export right now: the PDF of the open topic's sheet
 *  stack. It feeds the PDF row tldraw's stock "Export as" submenus get (see
 *  ExportAsMenu) — tldraw's menu components mount inside the editor where no
 *  chapter props reach, so the export context travels through this store. */
interface ExportStoreState {
  /** nonzero only on page chapters that can export. */
  enabled: boolean;
  /** an export is in flight; the menu item disables against it. */
  busy: boolean;
  /** runs the export of the open topic. */
  run: (() => void) | null;
  setContext: (context: { enabled: boolean; run: () => void } | null) => void;
  setBusy: (busy: boolean) => void;
}

export const useExportStore = create<ExportStoreState>((set) => ({
  enabled: false,
  busy: false,
  run: null,
  setContext: (context) =>
    context ? set({ enabled: true, run: context.run }) : set({ enabled: false, run: null }),
  setBusy: (busy) => set({ busy }),
}));
