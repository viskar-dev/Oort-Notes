import { useEffect, useState } from 'react';
import { api, type Chapter, type Notebook } from '@/lib/ipc';
import { normalizeConfig } from '@/lib/preset-config';
import { useUiPresetStore } from '@/stores/ui-preset-store';
import { errorText } from '@/lib/utils';

export interface ChapterLoad {
  notebook: Notebook;
  chapter: Chapter;
}

/** Route loader for the canvas: the chapter and its notebook, plus the UI
 *  preset the chapter was created with (pushed into the shared store). */
export function useChapterLoader(chapterId: string | undefined) {
  const [loaded, setLoaded] = useState<ChapterLoad | null>(null);
  const [error, setError] = useState<string | null>(null);
  const setPresetConfig = useUiPresetStore((s) => s.setConfig);

  useEffect(() => {
    let cancelled = false;
    setLoaded(null);
    setError(null);
    setPresetConfig(null);
    (async () => {
      try {
        const chapter = await api.loadChapter(chapterId!);
        const notebook = await api.loadNotebook(chapter.notebook_id);
        if (cancelled) return;
        setLoaded({ notebook, chapter });
        if (chapter.ui_preset_id) {
          const preset = await api.loadUiPreset(chapter.ui_preset_id);
          if (!cancelled) setPresetConfig(normalizeConfig(preset.config));
        }
      } catch (e) {
        if (!cancelled) setError(errorText(e));
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [chapterId, setPresetConfig]);

  return { loaded, error };
}
