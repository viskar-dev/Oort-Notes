import { create } from 'zustand';

/** Dialog-open state for the icon finder: the components picker opens it,
 *  CanvasShell renders it — zustand instead of prop-drilling through the
 *  tldraw components map (whose entries must keep stable identities). */
interface IconFinderState {
  open: boolean;
  setOpen: (open: boolean) => void;
}

export const useIconFinderStore = create<IconFinderState>((set) => ({
  open: false,
  setOpen: (open) => set({ open }),
}));
