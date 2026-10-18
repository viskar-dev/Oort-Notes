import { useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
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
import { ChevronLeft, HardDriveDownload, Settings, Sparkles, Trash2 } from 'lucide-react';
import { api, type UiPreset } from '@/lib/ipc';

/** Route: '/settings'. Plain two-column layout (no Sidebar): a settings nav
 * on the left and the section content on the right. */
export function SettingsPage() {
  const navigate = useNavigate();
  const [presets, setPresets] = useState<UiPreset[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [deleting, setDeleting] = useState<UiPreset | null>(null);

  async function load() {
    try {
      setPresets(await api.listUiPresets());
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    }
  }

  useEffect(() => {
    load();
  }, []);

  async function handleDelete(preset: UiPreset) {
    try {
      await api.deleteUiPreset(preset.id);
      setDeleting(null);
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    }
  }

  return (
    <div className="min-h-screen bg-background text-ink">
      <div className="mx-auto flex min-h-screen max-w-[1000px] px-10 py-8">
        {/* settings nav (plain column, no sidebar) */}
        <aside className="w-48 shrink-0 pt-14">
          <button
            onClick={() => navigate('/')}
            className="mb-8 flex items-center gap-1.5 text-sm text-muted-foreground transition-colors hover:text-ink"
          >
            <ChevronLeft className="h-4 w-4" /> Back
          </button>
          <div className="mb-2 px-2 text-[11px] font-semibold tracking-widest text-muted-foreground">
            SETTINGS
          </div>
          <nav className="flex flex-col gap-0.5">
            <button
              disabled
              className="flex items-center gap-2 rounded-lg px-2 py-2 text-left text-sm text-muted-foreground"
              title="Coming soon"
            >
              <Settings className="h-4 w-4" /> General
            </button>
            <div className="flex items-center gap-2 rounded-lg bg-raised px-2 py-2 text-left text-sm font-medium text-primary">
              <Sparkles className="h-4 w-4" /> Presets
            </div>
            <button
              onClick={() => navigate('/settings/backup')}
              className="flex items-center gap-2 rounded-lg px-2 py-2 text-left text-sm text-muted-foreground transition-colors hover:text-ink"
            >
              <HardDriveDownload className="h-4 w-4" /> Backup
            </button>
          </nav>
        </aside>

        {/* presets section */}
        <main className="min-w-0 flex-1 pl-10">
          <header className="mb-8 flex items-center justify-between">
            <div>
              <h1 className="text-2xl font-semibold tracking-tight">Presets</h1>
              <p className="mt-1 text-sm text-muted-foreground">
                Create canvas presets — toolbar, colors, fonts, sizes — and apply
                them when creating chapters.
              </p>
            </div>
            <button
              onClick={() => navigate('/settings/presets/new')}
              className="flex items-center gap-1.5 rounded-lg bg-primary px-3.5 py-2 text-sm font-medium text-primary-foreground transition-opacity hover:opacity-90"
            >
              + New preset
            </button>
          </header>

          {error && (
            <div className="rounded-lg bg-red-950/60 px-4 py-3 text-sm text-red-300">{error}</div>
          )}

          {presets === null && <p className="text-sm text-muted-foreground">Loading…</p>}

          {presets?.length === 0 && (
            <div className="rounded-xl border border-line bg-surface px-6 py-12 text-center">
              <div className="mb-1 text-base font-medium">No presets yet</div>
              <div className="text-sm text-muted-foreground">
                Create a preset to customize how your canvases look and feel.
              </div>
            </div>
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
        </main>
      </div>

      <AlertDialog open={deleting !== null} onOpenChange={(open) => !open && setDeleting(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete "{deleting?.name}"?</AlertDialogTitle>
            <AlertDialogDescription>
              Chapters using this preset fall back to the tldraw defaults. This
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
    </div>
  );
}
