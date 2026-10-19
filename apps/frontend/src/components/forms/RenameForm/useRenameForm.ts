import { useCallback, useState } from 'react';

/** All rename-form logic: value, saving guard and the submit contract.
 *  The form may only submit a non-empty, actually-changed name. */
export function useRenameForm({
  initial,
  onSubmit,
}: {
  initial: string;
  onSubmit: (name: string) => Promise<void>;
}) {
  const [value, setValue] = useState(initial);
  const [saving, setSaving] = useState(false);
  const valid = value.trim() !== '' && value.trim() !== initial.trim();

  const submit = useCallback(async () => {
    if (!valid || saving) return;
    setSaving(true);
    try {
      await onSubmit(value.trim());
    } finally {
      setSaving(false);
    }
  }, [valid, saving, value, onSubmit]);

  return { value, setValue, saving, valid, submit };
}
