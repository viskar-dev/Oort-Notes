import { CheckCircle2, CloudUpload, RefreshCw } from 'lucide-react';
import type { BackupSettings, BackupStatus } from '@/lib/ipc';
import { whenAgo } from './backup-format';

/** Backup state row, merged into the Google Drive section: either a green
 *  up-to-date indicator or the one action that gets the workspace backed
 *  up. Renders bare (no section frame) so the page owns the layout. */
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

  if (!connected) return null;

  return (
    <div className="mt-3 flex items-center justify-between gap-4">
      <div className="flex min-w-0 items-center gap-2 text-[13px] text-muted-foreground">
        {upToDate && <CheckCircle2 className="h-4 w-4 shrink-0 text-emerald-400" aria-hidden />}
        <span className="truncate">
          {backupState === null && 'Checking…'}
          {workspaceEmpty &&
            'Nothing to back up yet — it starts as soon as you create your first notebook.'}
          {needsBackup && 'New changes since your last backup.'}
          {upToDate &&
            `Backed up ${
              settings?.last_backup_at ? whenAgo(settings.last_backup_at) : 'just now'
            }`}
        </span>
      </div>
      {needsBackup && (
        <button
          onClick={onBackup}
          disabled={busy !== null}
          title="Update the backup in your Google Drive"
          className="flex h-8 shrink-0 items-center gap-2 rounded-md bg-primary px-4 text-[13px] font-medium text-primary-foreground transition-opacity hover:opacity-90 disabled:opacity-40"
        >
          {busy === 'backup' ? (
            <RefreshCw className="h-3.5 w-3.5 animate-spin" />
          ) : (
            <CloudUpload className="h-3.5 w-3.5" />
          )}
          {busy === 'backup' ? 'Backing up…' : 'Back up now'}
        </button>
      )}
    </div>
  );
}
