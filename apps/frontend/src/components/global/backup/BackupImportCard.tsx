import { Download, RefreshCw } from 'lucide-react';
import type { DriveBackupInfo } from '@/lib/ipc';
import { formatDate, formatSize } from './backup-format';

/** Import offer, only shown while the workspace is fresh and a backup
 *  exists on Drive. */
export function BackupImportCard({
  info,
  busy,
  onImport,
}: {
  info: DriveBackupInfo;
  busy: string | null;
  onImport: () => void;
}) {
  return (
    <section className="mb-4 rounded-xl border border-primary/30 bg-surface px-5 py-4">
      <div className="flex items-center justify-between gap-4">
        <div className="min-w-0">
          <div className="flex items-center gap-2 text-sm font-semibold">
            <Download className="h-4 w-4 text-primary" aria-hidden />
            Import from Google Drive
          </div>
          <div className="mt-0.5 text-xs text-muted-foreground">
            {`Found ${info.file_name ?? 'a backup'}`}
            {info.created_time ? ` · saved ${formatDate(info.created_time)}` : ''}
            {info.size_bytes ? ` · ${formatSize(info.size_bytes)}` : ''}
            {'. This restores your whole workspace onto this device.'}
          </div>
        </div>
        <button
          onClick={onImport}
          disabled={busy !== null}
          className="flex shrink-0 items-center gap-1.5 rounded-lg bg-primary px-3.5 py-2 text-sm font-medium text-primary-foreground transition-opacity hover:opacity-90 disabled:opacity-40"
        >
          {busy === 'import' ? (
            <RefreshCw className="h-4 w-4 animate-spin" />
          ) : (
            <Download className="h-4 w-4" />
          )}
          {busy === 'import' ? 'Importing…' : 'Import backup'}
        </button>
      </div>
    </section>
  );
}
