import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { Plus, Trash2 } from 'lucide-react';
import { api, type UiPreset } from '@/lib/ipc';
import { SettingsLayout } from '@/components/layout/settings-layout';
import { Empty, EmptyDescription, EmptyHeader, EmptyTitle } from '@/components/ui/empty';
import { errorText } from '@/lib/utils';
import { toast } from 'sonner';

/** Route: '/settings'. Presets section of the settings shell. */
export function SettingsPage() {
  const [presets, setPresets] = useState<UiPreset[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [deleting, setDeleting] = useState<UiPreset | null>(null);
  const [reloadKey, setReloadKey] = useState(0);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const list = await api.listUiPresets();
        if (!cancelled) setPresets(list);
      } catch (e) {
        if (!cancelled) setError(e instanceof Error ? e.message : String(e));
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [reloadKey]);

  async function handleDelete(preset: UiPreset) {
    try {
      await api.deleteUiPreset(preset.id);
      setDeleting(null);
      setReloadKey((k) => k + 1);
      toast.success('Preset deleted', { description: preset.name });
    } catch (e) {
      toast.error('Could not delete preset', { description: errorText(e) });
    }
  }

  return (
    <SettingsLayout section="presets">
      <header className="mb-8 flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Presets</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Create canvas presets toolbar, colors, fonts, sizes and apply
            them when creating chapters.
          </p>
        </div>
        <Link
          to="/settings/presets/new"
          className="flex shrink-0 items-center gap-1.5 rounded-lg bg-primary px-3.5 py-2 text-sm font-medium text-primary-foreground transition-opacity hover:opacity-90"
        >
          <Plus/> New preset
        </Link>
      </header>

      {error && (
        <div className="rounded-lg bg-red-950/60 px-4 py-3 text-sm text-red-300">{error}</div>
      )}

      {presets === null && <p className="text-sm text-muted-foreground">Loading…</p>}

      {presets?.length === 0 && (
        <Empty className="py-14">
          <EmptyHeader>
            <EmptyTitle>No presets yet</EmptyTitle>
            <EmptyDescription>
              Create a preset to customize how your canvases look and feel.
            </EmptyDescription>
          </EmptyHeader>
        </Empty>
      )}

      <div className="flex flex-col gap-2">
        {presets?.map((p) => (
          <Link
            key={p.id}
            to={`/settings/presets/${p.id}`}
            className="group flex items-center justify-between rounded-xl border border-line bg-surface px-5 py-4 transition-colors hover:border-primary/50"
          >
            <div>
              <div className="text-sm font-semibold">{p.name}</div>
              <div className="text-xs text-muted-foreground">
                {new Date(p.updated_at).toLocaleDateString()}
              </div>
            </div>
            <button
              onClick={(e) => {
                e.preventDefault();
                e.stopPropagation();
                setDeleting(p);
              }}
              title="Delete preset"
              className="rounded-md p-1.5 text-muted-foreground opacity-0 transition-all hover:bg-red-950/60 hover:text-red-300 group-hover:opacity-100"
            >
              <Trash2 className="h-4 w-4" />
            </button>
          </Link>
        ))}
      </div>

      <AlertDialog open={deleting !== null} onOpenChange={(open) => !open && setDeleting(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete "{deleting?.name}"?</AlertDialogTitle>
            <AlertDialogDescription>
              Chapters using this preset fall back to Oort's defaults. This
              cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={() => deleting && handleDelete(deleting)}>
              Delete preset
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </SettingsLayout>
  );
}
