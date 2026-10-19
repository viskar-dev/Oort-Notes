import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { RenameForm } from '@/components/forms/RenameForm';
import type { Topic } from '@/lib/ipc';

/** Rename-topic dialog; mounted only while renaming so the form starts from
 *  the topic's current name. `onRename` is fire-and-forget (the canvas hook
 *  owns errors), so the promise resolves right away. */
export function TopicRenameDialog({
  topic,
  onRename,
  onClose,
}: {
  topic: Topic;
  onRename: (name: string) => Promise<void>;
  onClose: () => void;
}) {
  return (
    <Dialog open onOpenChange={(next) => !next && onClose()}>
      <DialogContent className="sm:max-w-[400px]">
        <DialogHeader>
          <DialogTitle>Rename topic</DialogTitle>
        </DialogHeader>
        <RenameForm id="topic-rename-name" initial={topic.name} onSubmit={onRename} onCancel={onClose} />
      </DialogContent>
    </Dialog>
  );
}
