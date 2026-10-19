import { Button } from '@/components/ui/button';
import { DialogFooter } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { useRenameForm } from './useRenameForm';

/** Single-field rename form shared by the notebook, chapter and topic rename
 *  dialogs. Enter submits; Cancel and outside clicks close via `onCancel`. */
export function RenameForm({
  id,
  initial,
  label,
  submitLabel = 'Rename',
  onSubmit,
  onCancel,
}: {
  id?: string;
  initial: string;
  label?: string;
  submitLabel?: string;
  onSubmit: (name: string) => Promise<void>;
  onCancel: () => void;
}) {
  const { value, setValue, saving, valid, submit } = useRenameForm({ initial, onSubmit });
  const inputLabel = label ?? submitLabel;

  const submitOnEnter = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      void submit();
    }
  };

  const input = (
    <Input
      id={id}
      value={value}
      onChange={(e) => setValue(e.target.value)}
      aria-label={inputLabel}
      autoFocus
      onKeyDown={submitOnEnter}
    />
  );

  return (
    <>
      {label ? (
        <div className="flex flex-col gap-1.5">
          <label htmlFor={id} className="text-[13px] font-medium text-muted-foreground">
            {label}
          </label>
          {input}
        </div>
      ) : (
        input
      )}
      <DialogFooter>
        <Button variant="ghost" onClick={onCancel}>
          Cancel
        </Button>
        <Button disabled={!valid || saving} onClick={() => void submit()}>
          {submitLabel}
        </Button>
      </DialogFooter>
    </>
  );
}
