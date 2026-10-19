import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { RenameForm } from '@/components/forms/RenameForm';

/** Rename-chapter dialog; mounted only while renaming so the form starts
 *  from the chapter's current name. */
export function ChapterRenameDialog({
  chapter,
  onRename,
  onClose,
}: {
  chapter: { name: string };
  onRename: (name: string) => Promise<void>;
  onClose: () => void;
}) {
  return (
    <Dialog open onOpenChange={(next) => !next && onClose()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Rename chapter</DialogTitle>
        </DialogHeader>
        <RenameForm
          id="chapter-rename-name"
          initial={chapter.name}
          onSubmit={onRename}
          onCancel={onClose}
        />
      </DialogContent>
    </Dialog>
  );
}
