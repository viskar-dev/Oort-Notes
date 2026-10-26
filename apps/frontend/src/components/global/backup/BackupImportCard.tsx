import { Download, RefreshCw } from 'lucide-react';
import type { DriveBackupInfo } from '@/lib/ipc';
import { formatDate, formatSize } from './backup-format';

/** Import offer, only shown while the workspace is fresh and a backup
 *  exists on Drive. Flat row, no card frame — the page owns the layout. */
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
    <div className="flex items-center justify-between gap-4">
      <div className="flex min-w-0 items-center gap-2 text-[13px] text-muted-foreground">
        <Download className="h-4 w-4 shrink-0 text-primary" aria-hidden />
        <span className="truncate">
          {`Found ${info.file_name ?? 'a backup'}`}
          {info.created_time ? ` · saved ${formatDate(info.created_time)}` : ''}
          {info.size_bytes ? ` · ${formatSize(info.size_bytes)}` : ''}
          {'. This restores your whole workspace onto this device.'}
        </span>
      </div>
      <button
        onClick={onImport}
        disabled={busy !== null}
        className="flex h-8 shrink-0 items-center gap-2 rounded-md bg-primary px-4 text-[13px] font-medium text-primary-foreground transition-opacity hover:opacity-90 disabled:opacity-40"
      >
        {busy === 'import' ? (
          <RefreshCw className="h-3.5 w-3.5 animate-spin" />
        ) : (
          <Download className="h-3.5 w-3.5" />
        )}
        {busy === 'import' ? 'Importing…' : 'Import backup'}
      </button>
    </div>
  );
}
