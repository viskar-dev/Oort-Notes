/** Render state of our own floating panels that tldraw's shortcut system
 *  can't see (the canvas settings card is DOM outside tldraw's menu
 *  registry). The window-level capture handlers are the actual source of
 *  truth for the ⌃⌥/⌘⌥ app combos; this mirror just lets the
 *  dialog-registered tldraw actions guard the same conditions. CanvasShell
 *  keeps it in sync. */
export const canvasUiState = { settingsOpen: false };
