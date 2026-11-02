import { useEffect } from 'react';
import { create } from 'zustand';
import { isTauri } from '@tauri-apps/api/core';
import { check, type Update } from '@tauri-apps/plugin-updater';
import { relaunch } from '@tauri-apps/plugin-process';

type UpdaterStatus = 'available' | 'downloading' | 'installing' | 'failed';

type UpdaterState = {
  status: UpdaterStatus;
  update: Update | null;
  /** download fraction 0..1, null until the size is known */
  progress: number | null;
  error: string | null;
  dismissed: boolean;
  dismiss: () => void;
  install: () => Promise<void>;
};

const useUpdaterStore = create<UpdaterState>((set, get) => ({
  status: 'available',
  update: null,
  progress: null,
  error: null,
  dismissed: false,
  dismiss: () => set({ dismissed: true }),
  install: async () => {
    const { update } = get();
    if (!update) return;
    set({ status: 'downloading', progress: null, error: null });
    let contentLength = 0;
    let downloaded = 0;
    try {
      await update.downloadAndInstall((event) => {
        switch (event.event) {
          case 'Started':
            contentLength = event.data.contentLength ?? 0;
            break;
          case 'Progress':
            downloaded += event.data.chunkLength;
            set({
              progress: contentLength > 0 ? Math.min(downloaded / contentLength, 1) : null,
            });
            break;
          case 'Finished':
            set({ status: 'installing', progress: null });
            break;
        }
      });
      await relaunch();
    } catch (error) {
      set({
        status: 'failed',
        error: error instanceof Error ? error.message : String(error),
      });
    }
  },
}));

// one check per app session, not per layout mount
let checked = false;

/**
 * Auto-update lifecycle behind the update banner: checks once per session
 * (skipped in dev and outside the desktop shell), reports failures silently.
 * State lives in a module store so dismissal and progress survive page
 * navigation.
 */
export function useAppUpdater() {
  const state = useUpdaterStore();

  useEffect(() => {
    if (checked || import.meta.env.DEV || !isTauri()) return;
    checked = true;
    check()
      .then((update) => {
        if (update) useUpdaterStore.setState({ update });
      })
      .catch((error) => console.warn('update check failed:', error));
  }, []);

  return state;
}
