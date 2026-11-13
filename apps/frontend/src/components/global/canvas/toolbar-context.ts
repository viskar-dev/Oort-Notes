import { createContext } from 'react';
import type { ReactNode } from 'react';

/** Slot that carries the chapter's zoom menu into the toolbar. tldraw renders
 *  the Toolbar from its components map, so the zoom control travels through a
 *  context rather than a prop: the Toolbar component itself must keep a stable
 *  identity, otherwise React remounts it (and tldraw's whole UI provider) on
 *  every render. */
export const ZoomSlotContext = createContext<ReactNode>(null);

/** Whether the toolbar may fade out while idle. Canvas settings owns the
 *  persisted value; the toolbar reads it through this context so tldraw's
 *  stable components map does not need to change identity. */
export const ToolbarAutoHideContext = createContext(true);
