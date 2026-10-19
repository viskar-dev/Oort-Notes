import { CheckCircle2, CloudUpload, RefreshCw } from 'lucide-react';
import type { BackupSettings, BackupStatus } from '@/lib/ipc';
import { whenAgo } from './backup-format';

/** "Your backup": either a green up-to-date row or the one action that gets
 *  the workspace backed up. */
export function BackupStateCard({
  connected,
  backupState,
  settings,
  busy,
  onBackup,
}: {
  connected: boolean;
  backupState: BackupStatus | null;
  settings: BackupSettings | null;
  busy: string | null;
  onBackup: () => void;
}) {
  const workspaceEmpty = backupState?.workspace_empty ?? false;
  const needsBackup = backupState !== null && !workspaceEmpty && backupState.dirty;
  const upToDate = backupState !== null && !workspaceEmpty && !backupState.dirty;

  return (
    <section className="mb-4 rounded-xl border border-line bg-surface px-5 py-4">
      <div className="flex items-center justify-between gap-4">
        <div className="min-w-0">
          <div className="text-sm font-semibold">Your backup</div>
          <div className="mt-0.5 text-xs text-muted-foreground">
            {!connected && 'Connect Google Drive and your workspace is kept up to date automatically.'}
            {connected && backupState === null && 'Checking…'}
            {connected &&
              workspaceEmpty &&
              'Nothing to back up yet — it starts as soon as you create your first notebook.'}
            {connected && needsBackup && 'New changes since your last backup.'}
            {connected &&
              upToDate &&
              `Backed up ${
                settings?.last_backup_at ? whenAgo(settings.last_backup_at) : 'just now'
              } — everything is up to date.`}
          </div>
        </div>
        <div className="flex shrink-0 items-center gap-3">
          {connected && upToDate && (
            <CheckCircle2 className="h-5 w-5 text-emerald-400" aria-hidden />
          )}
          {connected && needsBackup && (
            <button
              onClick={onBackup}
              disabled={busy !== null}
              title="Update the backup in your Google Drive"
              className="flex items-center gap-1.5 rounded-lg bg-primary px-3.5 py-2 text-sm font-medium text-primary-foreground transition-opacity hover:opacity-90 disabled:opacity-40"
            >
              {busy === 'backup' ? (
                <RefreshCw className="h-4 w-4 animate-spin" />
              ) : (
                <CloudUpload className="h-4 w-4" />
              )}
              {busy === 'backup' ? 'Backing up…' : 'Back up now'}
            </button>
          )}
        </div>
      </div>
    </section>
  );
}
