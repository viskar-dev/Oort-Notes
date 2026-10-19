import { create } from 'zustand';
import type { PresetConfig } from '@/constants/presets/catalog';

/** Canvas-scoped preset store: CanvasPage loads the chapter's preset into it;
 * toolbar/panel components read it inside the editor context. `null` config
 * means "no preset" — everything falls back to tldraw defaults. */
interface UiPresetState {
  config: PresetConfig | null;
  setConfig: (config: PresetConfig | null) => void;
}

export const useUiPresetStore = create<UiPresetState>((set) => ({
  config: null,
  setConfig: (config) => set({ config }),
}));
