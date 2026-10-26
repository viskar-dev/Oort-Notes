import { Settings } from 'lucide-react';
import type { GoogleStatus } from '@/lib/ipc';
import { GoogleDriveIcon } from './GoogleDriveIcon';

/** Inner block of the connection row: Drive logo, name, dot status and the
 *  connect/disconnect plus gear actions. The former "not connected" pill is
 *  now a dot + plain muted text (no background). */
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
    <div className="flex items-center justify-between gap-4">
      <div className="flex min-w-0 items-center gap-3">
        <GoogleDriveIcon size={20} />
        <span className="text-sm font-medium text-ink">Google Drive</span>
        <span className="flex items-center gap-2 text-[13px] text-muted-foreground">
          <span
            className={`inline-block h-1.5 w-1.5 rounded-full ${connected ? 'bg-emerald-500' : 'bg-red-500'}`}
          />
          {connected ? 'Connected' : status?.configured ? 'Not connected' : 'Not configured'}
          {connected && status?.email ? ` — ${status.email}` : ''}
        </span>
      </div>
      <div className="flex shrink-0 items-center gap-1">
        {connected ? (
          <button
            onClick={onDisconnect}
            className="h-8 rounded-md px-3 text-[13px] text-[#c8c8cc] transition-colors hover:bg-white/[0.06] hover:text-ink"
          >
            Disconnect
          </button>
        ) : (
          <button
            onClick={onConnect}
            disabled={busy !== null}
            className="flex h-8 items-center gap-2 rounded-md bg-primary px-4 text-[13px] font-medium text-primary-foreground transition-opacity hover:opacity-90 disabled:opacity-40"
          >
            <GoogleDriveIcon size={16} />
            {busy === 'connect' ? 'Connecting…' : 'Connect'}
          </button>
        )}
        <button
          onClick={onToggleConfig}
          title="OAuth client settings"
          aria-label="OAuth client settings"
          className="flex h-8 w-8 items-center justify-center rounded-md text-[#c8c8cc] transition-colors hover:bg-white/[0.06] hover:text-ink"
        >
          <Settings className="h-4 w-4" strokeWidth={1.5} />
        </button>
      </div>
    </div>
  );
}
