  import { Button } from '@/components/ui/button';
  import { Input } from '@/components/ui/input';
  import { useNotebookCreateForm, type NotebookCreateInput } from './useNotebookCreateForm';

  /** Notebook-create form body: name, optional label and description plus the
   *  Cancel/Create footer. The dialog shell around it lives with the page. */
  export function NotebookCreateForm({
    onSave,
    onCancel,
  }: {
    onSave: (input: NotebookCreateInput) => Promise<void>;
    onCancel: () => void;
  }) {
    const { draft, setField, saving, valid, submit } = useNotebookCreateForm({ onSave });

    return (
      <>
        <div className="flex flex-col gap-1.5 ">
          <label htmlFor="nb-create-name" className="text-xs font-medium text-muted-foreground">
            Name
          </label>
          <Input
            id="nb-create-name"
            value={draft.name}
            onChange={(e) => setField('name')(e.target.value)}
            placeholder="e.g. Physics"
            aria-label="Name"
            autoFocus
            className='placeholder:text-xs border border-line rounded-sm'
          />
        </div>
        <div className="flex flex-col gap-1.5">
          <label htmlFor="nb-create-label" className="text-xs font-medium text-muted-foreground">
            Label (optional tag on the card)
          </label>
          <Input
            id="nb-create-label"
            value={draft.label}
            onChange={(e) => setField('label')(e.target.value)}
            placeholder="e.g. PHYS"
            aria-label="Label (optional tag on the card)"
            className='placeholder:text-xs border-line rounded-sm'
          />
        </div>
        <div className="flex flex-col gap-1.5">
          <label htmlFor="nb-create-description" className="text-xs font-medium text-muted-foreground">
            Description
          </label>
          <Input
            id="nb-create-description"
            value={draft.description}
            onChange={(e) => setField('description')(e.target.value)}
            placeholder="Optional"
            aria-label="Description"
            className='placeholder:text-xs border-line rounded-sm'
          />
        </div>
        <div className='w-full flex justify-end items-center mt-4 p-2 border-t-1 border-line'>
          <Button variant="ghost" onClick={onCancel}>
            Cancel
          </Button>
          <Button  disabled={!valid || saving} onClick={() => void submit()}>
            {saving ? 'Creating…' : 'Create'}
          </Button>
        </div>
      </>
    );
  }
