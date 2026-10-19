import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { RenameForm } from '@/components/forms/RenameForm';

/** Rename-notebook dialog; mounted only while renaming so the form starts
 *  from the notebook's current name. */
export function NotebookRenameDialog({
  notebook,
  onRename,
  onClose,
}: {
  notebook: { name: string };
  onRename: (name: string) => Promise<void>;
  onClose: () => void;
}) {
  return (
    <Dialog open onOpenChange={(next) => !next && onClose()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Rename notebook</DialogTitle>
        </DialogHeader>
        <RenameForm
          id="nb-rename-name"
          initial={notebook.name}
          label="Name"
          onSubmit={onRename}
          onCancel={onClose}
        />
      </DialogContent>
    </Dialog>
  );
}
