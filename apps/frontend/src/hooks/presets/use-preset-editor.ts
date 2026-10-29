import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { api, type UiPreset } from '@/lib/ipc';
import { defaultConfig, normalizeConfig } from '@/lib/preset-config';
import type { PresetConfig } from '@/constants/presets/catalog';
import { errorText } from '@/lib/utils';
import { toast } from 'sonner';

export type PresetEditorTab = 'toolbar' | 'colors' | 'fonts' | 'sizes';

/** The preset-editor data: name + config draft, the active tab, load /
 *  discard / save. Config edits go through `patchSection` so the tabs never
 *  touch the whole document. */
export function usePresetEditor(presetId: string | undefined) {
  const navigate = useNavigate();
  const isNew = presetId === 'new';

  const [name, setName] = useState('');
  const [config, setConfig] = useState<PresetConfig>(defaultConfig);
  const [tab, setTab] = useState<PresetEditorTab>('toolbar');
  const [loading, setLoading] = useState(!isNew);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (isNew) return;
    let cancelled = false;
    const id = presetId;
    void api
      .loadUiPreset(id!)
      .then((p: UiPreset) => {
        if (!cancelled) {
          setName(p.name);
          setConfig(normalizeConfig(p.config));
          setLoading(false);
        }
      })
      .catch((e) => {
        if (!cancelled) {
          setError(errorText(e));
          setLoading(false);
        }
      });
    return () => {
      cancelled = true;
    };
  }, [presetId, isNew]);

  const discard = () => {
    if (isNew) {
      setName('');
      setConfig(defaultConfig());
    } else {
      setLoading(true);
      void api
        .loadUiPreset(presetId!)
        .then((p: UiPreset) => {
          setName(p.name);
          setConfig(normalizeConfig(p.config));
          setLoading(false);
        })
        .catch(() => setLoading(false));
    }
  };

  const save = async () => {
    if (!name.trim() || saving) return;
    setSaving(true);
    setError(null);
    try {
      if (isNew) {
        const created = await api.createUiPreset(name.trim(), config as unknown as Record<string, unknown>);
        navigate(`/settings/presets/${created.id}`, { replace: true });
      } else {
        await api.updateUiPreset(presetId!, { name: name.trim(), config });
      }
      toast.success('Preset saved', { description: name.trim() });
      navigate('/settings');
    } catch (e) {
      setError(errorText(e));
      setSaving(false);
    }
  };

  const patchSection = <K extends 'toolbar' | 'colors' | 'fonts' | 'sizes'>(
    key: K,
    value: PresetConfig[K],
  ) => {
    setConfig((prev) => ({ ...prev, [key]: value }));
  };

  return {
    isNew,
    name,
    setName,
    config,
    tab,
    setTab,
    loading,
    saving,
    error,
    discard,
    save,
    patchSection,
  };
}
