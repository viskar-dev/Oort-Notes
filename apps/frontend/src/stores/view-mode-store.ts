import { create } from 'zustand';

/** The page view mode now lives in the ⋮ menu's Preferences submenu (right
 *  below Focus mode, Ctrl+Alt+V). Like the export context, tldraw's menu
 *  components can't receive chapter props, so the capability travels
 *  through this store; `enabled` is nonzero only on page chapters. */
interface ViewModeStoreState {
  enabled: boolean;
  /** whether chrome-less view mode is currently active. */
  on: boolean;
  toggle: (() => void) | null;
  setContext: (context: { on: boolean; toggle: () => void } | null) => void;
}

export const useViewModeStore = create<ViewModeStoreState>((set) => ({
  enabled: false,
  on: false,
  toggle: null,
  setContext: (context) =>
    context
      ? set({ enabled: true, on: context.on, toggle: context.toggle })
      : set({ enabled: false, on: false, toggle: null }),
}));
