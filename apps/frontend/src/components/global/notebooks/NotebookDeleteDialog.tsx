import { ConfirmAlertDialog } from '@/components/global/common/ConfirmAlertDialog';

/** Delete-notebook confirm. */
export function NotebookDeleteDialog({
  notebook,
  onDelete,
  onClose,
}: {
  notebook: { name: string };
  onDelete: () => void;
  onClose: () => void;
}) {
  return (
    <ConfirmAlertDialog
      open
      onOpenChange={(next) => !next && onClose()}
      title={`Delete "${notebook.name}"?`}
      description="This permanently removes the notebook and all of its chapters and topics. This cannot be undone."
      confirmLabel="Delete"
      onConfirm={onDelete}
    />
  );
}
