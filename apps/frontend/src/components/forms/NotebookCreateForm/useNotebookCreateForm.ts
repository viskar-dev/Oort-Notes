import { useState } from 'react';

export interface NotebookCreateInput {
  name: string;
  label: string;
  description: string;
}

/** Notebook-create form logic: the three draft fields, the save guard and
 *  the submit contract. */
export function useNotebookCreateForm({
  onSave,
}: {
  onSave: (input: NotebookCreateInput) => Promise<void>;
}) {
  const [draft, setDraft] = useState<NotebookCreateInput>({ name: '', label: '', description: '' });
  const [saving, setSaving] = useState(false);
  const valid = draft.name.trim() !== '';

  const setField = (field: keyof NotebookCreateInput) => (value: string) =>
    setDraft((prev) => ({ ...prev, [field]: value }));

  const submit = async () => {
    if (!valid || saving) return;
    setSaving(true);
    try {
      await onSave({
        name: draft.name.trim(),
        label: draft.label.trim(),
        description: draft.description.trim(),
      });
    } finally {
      setSaving(false);
    }
  };

  return { draft, setField, saving, valid, submit };
}
