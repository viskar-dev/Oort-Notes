import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { NotebookCreateForm } from '@/components/forms/NotebookCreateForm';

/** New-notebook dialog; fresh on every open (mounted only while creating). */
export function NotebookCreateDialog({
  onCreate,
  onClose,
}: {
  onCreate: (input: { name: string; label: string; description: string }) => Promise<void>;
  onClose: () => void;
}) {
  return (
    <Dialog open onOpenChange={(next) => !next && onClose()}>
      <DialogContent className="p-4">
        <DialogHeader>
          <DialogTitle>New notebook</DialogTitle>
          <DialogDescription className="text-xs">
            Notebooks hold chapters of topics on their canvases.
          </DialogDescription>
        </DialogHeader>
        <NotebookCreateForm onSave={onCreate} onCancel={onClose} />
      </DialogContent>
    </Dialog>
  );
}
