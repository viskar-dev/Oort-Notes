import { useEffect, useState } from 'react';
import { api, type Chapter, type UiPreset } from '@/lib/ipc';
import { normalizeConfig } from '@/lib/preset-config';
import { useUiPresetStore } from '@/stores/ui-preset-store';

/** The chapter's UI preset in the canvas settings card: the preset list
 *  (loaded whenever the panel opens), the chapter's current assignment and
 *  the live-apply action (also persisted for future sessions). */
export function useChapterPreset(chapter: Chapter, settingsOpen: boolean) {
  const [uiPresets, setUiPresets] = useState<UiPreset[]>([]);
  const [chapterPresetId, setChapterPresetId] = useState(chapter.ui_preset_id ?? '');
  const setPresetConfig = useUiPresetStore((st) => st.setConfig);

  useEffect(() => {
    if (!settingsOpen) return;
    let cancelled = false;
    void api
      .listUiPresets()
      .then((list) => {
        if (!cancelled) setUiPresets(list);
      })
      .catch(() => {
        if (!cancelled) setUiPresets([]);
      });
    return () => {
      cancelled = true;
    };
  }, [settingsOpen]);

  const applyPreset = async (id: string) => {
    setChapterPresetId(id);
    if (!id) {
      setPresetConfig(null);
    } else {
      const preset = await api.loadUiPreset(id);
      setPresetConfig(normalizeConfig(preset.config));
    }
    void api
      .setChapterUiPreset(chapter.id, id || null)
      .catch((e) => console.error('preset apply failed', e));
  };

  return { uiPresets, chapterPresetId, applyPreset };
}
