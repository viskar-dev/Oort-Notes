import { useState } from 'react';
import { errorText } from '@/lib/utils';
import { toast } from 'sonner';
import { topicCreateFormSchema } from './topicCreateForm.schema';

/** Topic-create form logic: name draft, validation through the zod schema,
 *  the save guard and the parent's create call with its error display. */
export function useTopicCreateForm({
  onCreate,
  onClose,
}: {
  onCreate: (name: string) => Promise<void>;
  onClose: () => void;
}) {
  const [name, setName] = useState('');
  const [saving, setSaving] = useState(false);
  const [serverError, setServerError] = useState<string | null>(null);

  const valid = topicCreateFormSchema.safeParse({ name }).success;

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim() || saving) return;
    setSaving(true);
    setServerError(null);
    try {
      await onCreate(name.trim());
      setName('');
      onClose();
      toast.success('Topic created', { description: name.trim() });
    } catch (err) {
      setServerError(errorText(err));
    } finally {
      setSaving(false);
    }
  };

  return { name, setName, valid, saving, serverError, handleCreate };
}
