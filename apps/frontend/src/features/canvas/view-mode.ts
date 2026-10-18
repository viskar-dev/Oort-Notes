import { createContext, useContext } from 'react';

/**
 * True while the chapter is in view mode: chrome (top bar, sidebar, toolbar
 * pills) is hidden and the arrow keys flip between sheets. Read by the
 * toolbar and the contextual style panel so they unmount themselves.
 */
export const ViewModeContext = createContext(false);

export function useViewMode(): boolean {
  return useContext(ViewModeContext);
}
