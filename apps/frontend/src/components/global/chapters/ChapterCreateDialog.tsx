import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { ChapterCreateForm } from '@/components/forms/ChapterCreateForm';

/** New-chapter dialog; fresh on every open so the form and its preset lists
 *  start clean. */
export function ChapterCreateDialog({
  notebookId,
  onCreated,
  onClose,
}: {
  notebookId: string;
  onCreated: () => void;
  onClose: () => void;
}) {
  return (
    <Dialog open onOpenChange={(next) => !next && onClose()}>
      <DialogContent className="max-h-[85vh] max-w-[440px] m-10  overflow-y-auto">
        <DialogHeader>
          <DialogTitle>New chapter</DialogTitle>
          <DialogDescription>
            Chapters are canvases: free-form (infinite) or fixed paper pages.
          </DialogDescription>
        </DialogHeader>
        <ChapterCreateForm notebookId={notebookId} onCreated={onCreated} onCancel={onClose} />
      </DialogContent>
    </Dialog>
  );
}
