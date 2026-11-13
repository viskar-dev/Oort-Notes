import { useRef, useState } from 'react';
import { invoke, isTauri } from '@tauri-apps/api/core';
import { open as tauriOpen } from '@tauri-apps/plugin-dialog';
import { Upload } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { NotebookCreateForm } from '@/components/forms/NotebookCreateForm';
import { errorText } from '@/lib/utils';

type CreateMode = 'create' | 'import';

function suggestedName(archive: string): string | null {
  try {
    const parsed = JSON.parse(archive) as { data?: { notebooks?: Array<{ name?: unknown }> } };
    const name = parsed.data?.notebooks?.[0]?.name;
    return typeof name === 'string' && name.trim() ? name : null;
  } catch {
    return null;
  }
}

function NotebookImportPanel({
  onImport,
  onCancel,
}: {
  onImport: (archive: string, name: string) => Promise<void>;
  onCancel: () => void;
}) {
  const fileRef = useRef<HTMLInputElement>(null);
  const [archive, setArchive] = useState('');
  const [fileName, setFileName] = useState('');
  const [name, setName] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [importing, setImporting] = useState(false);
  const valid = archive !== '' && name.trim() !== '' && !importing;

  const applyArchive = (text: string, label: string) => {
    const suggested = suggestedName(text);
    if (!suggested) throw new Error('This file does not contain an Oort notebook.');
    setArchive(text);
    setFileName(label);
    setName(suggested);
  };

  const chooseFile = async (file: File | undefined) => {
    if (!file) return;
    setError(null);
    try {
      applyArchive(await file.text(), file.name);
    } catch (e) {
      setArchive('');
      setFileName('');
      setName('');
      setError(errorText(e));
    }
  };

  const chooseNativeFile = async () => {
    setError(null);
    try {
      const path = await tauriOpen({
        multiple: false,
        filters: [{ name: 'Oort notebook', extensions: ['oort'] }],
      });
      if (!path) return;
      const selected = Array.isArray(path) ? path[0] : path;
      if (!selected) return;
      const text = await invoke<string>('read_oort_import', { path: selected });
      applyArchive(text, selected.split(/[\\/]/).pop() ?? selected);
    } catch (e) {
      setArchive('');
      setFileName('');
      setName('');
      setError(errorText(e));
    }
  };

  const submit = async () => {
    if (!valid) return;
    setImporting(true);
    setError(null);
    try {
      await onImport(archive, name.trim());
    } catch (e) {
      setError(errorText(e));
    } finally {
      setImporting(false);
    }
  };

  return (
    <>
      <div className="flex flex-col gap-3">
        <input
          ref={fileRef}
          type="file"
          accept=".oort,application/json,.json"
          className="hidden"
          onChange={(e) => void chooseFile(e.target.files?.[0])}
        />
        <Button
          type="button"
          variant="outline"
          onClick={() => (isTauri() ? void chooseNativeFile() : fileRef.current?.click())}
          className="h-20 border-dashed"
        >
          <span className="flex flex-col items-center gap-1.5">
            <Upload className="h-4 w-4 text-muted-foreground" />
            <span className="text-sm">{fileName || 'Choose a .oort notebook file'}</span>
            <span className="text-xs text-muted-foreground">The notebook is copied with fresh ids</span>
          </span>
        </Button>

        <div className="flex flex-col gap-1.5">
          <label htmlFor="nb-import-name" className="text-xs font-medium text-muted-foreground">
            Import as
          </label>
          <Input
            id="nb-import-name"
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="Notebook name"
            disabled={!archive}
            className="border border-line rounded-sm placeholder:text-xs"
          />
        </div>

        {error && (
          <p role="alert" className="text-xs text-red-400">
            {error}
          </p>
        )}
      </div>

      <div className="mt-4 flex w-full items-center justify-end border-t border-line p-2">
        <Button variant="ghost" onClick={onCancel}>
          Cancel
        </Button>
        <Button disabled={!valid} onClick={() => void submit()}>
          {importing ? 'Importing…' : 'Import notebook'}
        </Button>
      </div>
    </>
  );
}

/** New-notebook dialog; fresh on every open (mounted only while creating). */
export function NotebookCreateDialog({
  onCreate,
  onImport,
  onClose,
}: {
  onCreate: (input: { name: string; label: string; description: string }) => Promise<void>;
  onImport: (archive: string, name: string) => Promise<void>;
  onClose: () => void;
}) {
  const [mode, setMode] = useState<CreateMode>('create');

  return (
    <Dialog open onOpenChange={(next) => !next && onClose()}>
      <DialogContent className="p-4">
        <DialogHeader>
          <DialogTitle>{mode === 'create' ? 'New notebook' : 'Import notebook'}</DialogTitle>
          <DialogDescription className="text-xs">
            {mode === 'create'
              ? 'Notebooks hold chapters of topics on their canvases.'
              : 'Import a shared .oort notebook and give the copy any name.'}
          </DialogDescription>
        </DialogHeader>

        <div className="grid grid-cols-2 rounded-lg border border-line bg-white/[0.02] p-1 text-sm">
          <button
            type="button"
            onClick={() => setMode('create')}
            aria-pressed={mode === 'create'}
            className={`rounded-md px-3 py-1.5 text-muted-foreground transition-colors ${
              mode === 'create' ? 'bg-white/[0.06] text-foreground' : 'hover:text-foreground'
            }`}
          >
            Create
          </button>
          <button
            type="button"
            onClick={() => setMode('import')}
            aria-pressed={mode === 'import'}
            className={`rounded-md px-3 py-1.5 text-muted-foreground transition-colors ${
              mode === 'import' ? 'bg-white/[0.06] text-foreground' : 'hover:text-foreground'
            }`}
          >
            Import .oort
          </button>
        </div>

        {mode === 'create' ? (
          <NotebookCreateForm onSave={onCreate} onCancel={onClose} />
        ) : (
          <NotebookImportPanel onImport={onImport} onCancel={onClose} />
        )}
      </DialogContent>
    </Dialog>
  );
}
