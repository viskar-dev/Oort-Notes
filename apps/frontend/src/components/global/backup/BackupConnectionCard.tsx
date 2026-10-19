import { Settings } from 'lucide-react';
import type { GoogleStatus } from '@/lib/ipc';

/** Inner block of the connection card: Google account, connected badge and
 *  the connect/disconnect buttons. The badge span keeps the
 *  `section span.rounded-full` selector shape used by the e2e flows. */
export function BackupConnectionCard({
  status,
  connected,
  busy,
  onConnect,
  onDisconnect,
  onToggleConfig,
}: {
  status: GoogleStatus | null;
  connected: boolean;
  busy: string | null;
  onConnect: () => void;
  onDisconnect: () => void;
  onToggleConfig: () => void;
}) {
  return (
    <div className="flex items-center justify-between">
      <div className="min-w-0">
        <div className="flex items-center gap-2 text-sm font-semibold">
          Google Drive
          <span
            className={
              connected
                ? 'rounded-full bg-emerald-950/80 px-2 py-0.5 text-[11px] font-medium text-emerald-300'
                : 'rounded-full bg-raised px-2 py-0.5 text-[11px] font-medium text-muted-foreground'
            }
          >
            {connected ? 'connected' : status?.configured ? 'not connected' : 'not configured'}
          </span>
        </div>
        <div className="mt-0.5 truncate text-xs text-muted-foreground">
          {status?.email ?? 'Sign in to keep your workspace backed up to Drive.'}
        </div>
      </div>
      <div className="flex shrink-0 items-center gap-2">
        <button
          onClick={onToggleConfig}
          title="OAuth client settings"
          className="rounded-md p-1.5 text-muted-foreground transition-colors hover:bg-raised hover:text-ink"
        >
          <Settings className="h-4 w-4" />
        </button>
        {connected ? (
          <button
            onClick={onDisconnect}
            className="rounded-lg border border-line px-3.5 py-2 text-sm font-medium transition-colors hover:bg-raised"
          >
            Disconnect
          </button>
        ) : (
          <button
            onClick={onConnect}
            disabled={busy !== null}
            className="rounded-lg bg-primary px-3.5 py-2 text-sm font-medium text-primary-foreground transition-opacity hover:opacity-90 disabled:opacity-50"
          >
            {busy === 'connect' ? 'Connecting…' : 'Connect Google Drive'}
          </button>
        )}
      </div>
    </div>
  );
}
