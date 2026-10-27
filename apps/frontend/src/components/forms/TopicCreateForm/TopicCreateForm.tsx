import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { useTopicCreateForm } from './useTopicCreateForm';

/** New-topic dialog; mounted only while open, so the draft starts empty.
 *  The page supplies `onCreate` (which appends + reloads) and rejects to
 *  keep the dialog open with its error. */
export function TopicCreateForm({
  open,
  onOpenChange,
  onCreate,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onCreate: (name: string) => Promise<void>;
}) {
  const { name, setName, valid, saving, serverError, handleCreate } = useTopicCreateForm({
    onCreate,
    onClose: () => onOpenChange(false),
  });

  return (
    <Dialog open={open} onOpenChange={(next) => !saving && onOpenChange(next)}>
      <DialogContent className="max-w-[440px]">
        <DialogHeader>
          <DialogTitle>New topic</DialogTitle>
        </DialogHeader>
        <form onSubmit={handleCreate} className="flex flex-col gap-4" noValidate>
          <div>
            <label htmlFor="topic-create-name" className="mb-1.5 block text-[13px] font-medium text-faint">
              Name
            </label>
            <Input
              id="topic-create-name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              autoFocus
              placeholder="e.g. Kosaraju's Two-Pass Algorithm"

            />
          </div>

          {serverError && (
            <div role="alert" className="rounded-lg border border-line bg-surface px-4 py-3 text-sm text-destructive">
              {serverError}
            </div>
          )}

          <div className="mt-2 flex w-full justify-end items-center">
            <Button type="button" variant="ghost" onClick={() => onOpenChange(false)}>
              Cancel
            </Button>
            <Button type="submit" disabled={!valid || saving}>
              {saving ? 'Creating…' : 'Create'}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}
