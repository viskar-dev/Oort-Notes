import type { TLUiOverrides } from 'tldraw';
import { isTauri } from '@tauri-apps/api/core';
import { useIconFinderStore } from '@/stores/icon-finder-store';
import { useViewModeStore } from '@/stores/view-mode-store';
import { useAiStore } from '@/features/ai/ai-store';
import { canvasUiState } from '@/features/canvas/canvas-ui-state';

/**
 * Oort's canvas app shortcuts registered as tldraw actions. Two dividends:
 * they appear in tldraw's keyboard-shortcuts dialog and its menu-item hint
 * layer renders the ⌘/⌥ or Ctrl+Alt form per platform automatically, while
 * the `cmd+…,ctrl+…` dual binding means both modifiers fire on every OS.
 *
 * The binding behavior itself stays with CanvasShell's window-level capture
 * handlers (they run before tldraw's own dispatch and keep the settings-card
 * guard), so these actions are the dialog presence + a safe toggle-net: onSelect
 * performs the same toggle the handler would, and keeps a `listener-or-action`
 * single fire by NOT binding any menu row.
 *
 * Modifier tokens follow tldraw's binding grammar ('alt' includes the macOS
 * Option key; see the Actions doc). No tldraw default action collides — its
 * alt bindings are the numeric zoom-tool entries (alt+1..9) and ours are the
 * alt+letter A/I/V combos.
 */
export const oortShortcutOverrides: TLUiOverrides = {
  actions(_editor, actions) {
    return {
      ...actions,
      'oort-icon-finder': {
        id: 'oort-icon-finder',
        label: 'Icon finder',
        kbd: 'cmd+alt+i,ctrl+alt+i',
        onSelect() {
          if (canvasUiState.settingsOpen) return;
          const { open, setOpen } = useIconFinderStore.getState();
          setOpen(!open);
        },
      },
      'oort-page-view': {
        id: 'oort-page-view',
        label: 'Page view mode',
        kbd: 'cmd+alt+v,ctrl+alt+v',
        onSelect() {
          const { enabled, toggle } = useViewModeStore.getState();
          if (enabled && toggle) toggle();
        },
      },
      'oort-ai-assistant': {
        id: 'oort-ai-assistant',
        label: 'AI assistant',
        kbd: 'cmd+alt+a,ctrl+alt+a',
        onSelect() {
          if (!isTauri()) return;
          useAiStore.getState().toggle();
        },
      },
    };
  },
};
