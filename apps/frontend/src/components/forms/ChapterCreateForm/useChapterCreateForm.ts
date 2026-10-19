import { useEffect, useState } from 'react';
import { useForm } from 'react-hook-form';
import { standardSchemaResolver } from '@hookform/resolvers/standard-schema';
import { api, type CanvasType, type PagePreset, type UiPreset } from '@/lib/ipc';
import { errorText } from '@/lib/utils';
import {
  chapterCreateFormSchema,
  type ChapterCreateFormValues,
} from './chapterCreateForm.schema';

/** Chapter-create form logic: the preset option lists (fetched once per
 *  mount: the dialog mounts fresh on every open), validation via the zod
 *  schema, the create call and its server errors. */
export function useChapterCreateForm({
  notebookId,
  onCreated,
}: {
  notebookId: string;
  onCreated: () => void;
}) {
  const [presets, setPresets] = useState<PagePreset[] | null>(null);
  const [uiPresets, setUiPresets] = useState<UiPreset[]>([]);
  const [optionsError, setOptionsError] = useState<string | null>(null);
  const [serverError, setServerError] = useState<string | null>(null);

  // both lists are independent — fetch them in parallel
  useEffect(() => {
    let cancelled = false;
    void api
      .listPagePresets()
      .then((p) => {
        if (!cancelled) setPresets(p);
      })
      .catch((e) => {
        if (!cancelled) setOptionsError(errorText(e));
      });
    void api
      .listUiPresets()
      .then((p) => {
        if (!cancelled) setUiPresets(p);
      })
      .catch(() => {
        if (!cancelled) setUiPresets([]);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const form = useForm<ChapterCreateFormValues>({
    resolver: standardSchemaResolver(chapterCreateFormSchema),
    defaultValues: { name: '', canvasType: 'infinite', presetId: 'a4-portrait', uiPresetId: '' },
  });

  const canvasType = form.watch('canvasType');
  const name = form.watch('name');
  const uiPresetId = form.watch('uiPresetId');

  const submit = form.handleSubmit(async (values) => {
    setServerError(null);
    try {
      await api.createChapter(notebookId, values.name.trim(), values.canvasType as CanvasType, {
        pagePresetId: values.canvasType === 'page' ? values.presetId : undefined,
        uiPresetId: values.uiPresetId || undefined,
      });
      onCreated();
    } catch (e) {
      setServerError(errorText(e));
    }
  });

  return {
    form,
    canvasType,
    name,
    uiPresetId,
    presets,
    uiPresets,
    optionsError,
    serverError,
    isSubmitting: form.formState.isSubmitting,
    submit,
  };
}
