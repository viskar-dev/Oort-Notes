import { useCallback, useEffect, useState } from 'react';
import { isTauri } from '@tauri-apps/api/core';
import { useSearchParams } from 'react-router-dom';
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
import { CloudUpload, Download, RefreshCw, Settings } from 'lucide-react';
import {
  api,
  type BackupEntry,
  type BackupSettings,
  type GoogleConfigView,
  type GoogleStatus,
} from '@/lib/ipc';
import { SettingsLayout } from '@/components/layout/settings-layout';

/** Route: '/settings/backup'. Google Drive backup — connect, schedule,
 * back up now, and restore. Uses the shared settings shell. */
export function BackupPage() {
  const [params, setParams] = useSearchParams();

  const [status, setStatus] = useState<GoogleStatus | null>(null);
  const [config, setConfig] = useState<GoogleConfigView | null>(null);
  const [settings, setSettings] = useState<BackupSettings | null>(null);
  const [settingsDraft, setSettingsDraft] = useState<BackupSettings | null>(null);
  const [backups, setBackups] = useState<BackupEntry[] | null>(null);

  const [clientIdDraft, setClientIdDraft] = useState('');
  const [clientSecretDraft, setClientSecretDraft] = useState('');
  const [showConfig, setShowConfig] = useState(false);

  const [busy, setBusy] = useState<'connect' | 'backup' | 'restore' | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [restoring, setRestoring] = useState<BackupEntry | null>(null);

  const load = useCallback(async () => {
    try {
      const [s, c, bs, list] = await Promise.all([
        api.googleStatus(),
        api.getGoogleConfig(),
        api.getBackupSettings(),
        api.listBackups(),
      ]);
      setStatus(s);
      setConfig(c);
      setClientIdDraft(c.client_id ?? '');
      setSettings(bs);
      setSettingsDraft(bs);
      setBackups(list);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  // the server bounces back here after the OAuth round-trip
  useEffect(() => {
    const result = params.get('google');
    if (result === 'connected') {
      setNotice('Google Drive connected. Your first backup is on its way.');
    } else if (result === 'error') {
      const reason = params.get('reason');
      setNotice(
        reason === 'not_configured'
          ? 'Google is not configured yet — fill in the client ID below and try again.'
          : 'Google sign-in did not complete. Please try again.',
      );
    }
    if (result) setParams({}, { replace: true });
  }, [params, setParams]);

  async function handleConnect() {
    setError(null);
    setBusy('connect');
    try {
      const result = await api.googleConnect();
      // desktop resolves here; web navigates away and never returns
      if (result.connected) {
        setNotice(`Connected to ${result.email ?? 'Google Drive'}.`);
      }
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(null);
    }
  }

  async function handleDisconnect() {
    setError(null);
    try {
      await api.googleDisconnect();
      setNotice('Google Drive disconnected.');
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    }
  }

  async function handleSaveConfig() {
    setError(null);
    try {
      await api.setGoogleConfig(clientIdDraft.trim(), clientSecretDraft.trim() || null);
      setShowConfig(false);
      setClientSecretDraft('');
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    }
  }

  async function handleSaveSettings() {
    if (!settingsDraft) return;
    setError(null);
    try {
      const saved = await api.updateBackupSettings(settingsDraft);
      setSettings(saved);
      setSettingsDraft(saved);
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    }
  }

  async function handleBackupNow() {
    setError(null);
    setBusy('backup');
    try {
      const run = await api.runBackup();
      setNotice(`Backup uploaded — ${run.file_name}`);
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(null);
    }
  }

  const handleRestore = useCallback(async (entry: BackupEntry) => {
    if (!entry.drive_file_id) return;
    setError(null);
    setBusy('restore');
    try {
      const r = await api.restoreBackup(entry.drive_file_id);
      setRestoring(null);
      setNotice(
        `Restored ${r.notebooks} notebooks, ${r.chapters} chapters, ${r.topics} topics.`,
      );
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(null);
    }
  }, [load]);

  const connected = status?.connected ?? false;
  const dirty =
    settingsDraft !== null &&
    settings !== null &&
    (settingsDraft.enabled !== settings.enabled ||
      settingsDraft.interval_days !== settings.interval_days ||
      settingsDraft.keep_count !== settings.keep_count);

  return (
    <SettingsLayout section="backup">
      <header className="mb-8">
            <h1 className="text-2xl font-semibold tracking-tight">Backup</h1>
            <p className="mt-1 text-sm text-muted-foreground">
              Archives your whole workspace to a hidden Google Drive app folder
              on a schedule, and restores it on any device.
            </p>
          </header>

          {error && (
            <div className="mb-4 rounded-lg bg-red-950/60 px-4 py-3 text-sm text-red-300">
              {error}
            </div>
          )}
          {notice && !error && (
            <div className="mb-4 rounded-lg bg-emerald-950/60 px-4 py-3 text-sm text-emerald-300">
              {notice}
            </div>
          )}

          {/* connection */}
          <section className="mb-4 rounded-xl border border-line bg-surface px-5 py-4">
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
                  {status?.email ?? 'Sign in to back up to your Drive app-data folder.'}
                </div>
              </div>
              <div className="flex shrink-0 items-center gap-2">
                <button
                  onClick={() => setShowConfig((v) => !v)}
                  title="OAuth client settings"
                  className="rounded-md p-1.5 text-muted-foreground transition-colors hover:bg-raised hover:text-ink"
                >
                  <Settings className="h-4 w-4" />
                </button>
                {connected ? (
                  <button
                    onClick={handleDisconnect}
                    className="rounded-lg border border-line px-3.5 py-2 text-sm font-medium transition-colors hover:bg-raised"
                  >
                    Disconnect
                  </button>
                ) : (
                  <button
                    onClick={handleConnect}
                    disabled={busy !== null}
                    className="rounded-lg bg-primary px-3.5 py-2 text-sm font-medium text-primary-foreground transition-opacity hover:opacity-90 disabled:opacity-50"
                  >
                    {busy === 'connect' ? 'Connecting…' : 'Connect Google Drive'}
                  </button>
                )}
              </div>
            </div>

            {showConfig && (
              <div className="mt-4 space-y-3 border-t border-line pt-4">
                {isTauri() ? (
                  <p className="text-xs text-muted-foreground">
                    Google sign-in uses a "Desktop app" OAuth client with PKCE
                    in your system browser — no client secret, ever. If this
                    build doesn't already include one, create an OAuth client
                    ID of type <strong>Desktop app</strong> in the Google Cloud
                    Console and paste it here.
                    {config?.client_id && ` Current: ${config.client_id}`}
                  </p>
                ) : (
                  <p className="text-xs text-muted-foreground">
                    OAuth client credentials (Google Cloud Console → OAuth 2.0).
                    Environment variables <code>GOOGLE_CLIENT_ID</code> /{' '}
                    <code>GOOGLE_CLIENT_SECRET</code> are used when left empty.
                    {config?.client_id && ` Current: ${config.client_id}`}
                  </p>
                )}
                <div className="flex gap-2">
                  <input
                    value={clientIdDraft}
                    onChange={(e) => setClientIdDraft(e.target.value)}
                    placeholder="Client ID"
                    className="min-w-0 flex-1 rounded-lg border border-line bg-raised px-3 py-2 text-sm outline-none focus:border-primary"
                  />
                  {!isTauri() && (
                    <input
                      value={clientSecretDraft}
                      onChange={(e) => setClientSecretDraft(e.target.value)}
                      placeholder={config?.has_secret ? '•••••••• (saved)' : 'Client secret'}
                      type="password"
                      className="min-w-0 flex-1 rounded-lg border border-line bg-raised px-3 py-2 text-sm outline-none focus:border-primary"
                    />
                  )}
                  <button
                    onClick={handleSaveConfig}
                    className="shrink-0 rounded-lg border border-line px-3.5 py-2 text-sm font-medium transition-colors hover:bg-raised"
                  >
                    Save
                  </button>
                </div>
              </div>
            )}
          </section>

          {/* schedule */}
          {settingsDraft && (
            <section className="mb-4 rounded-xl border border-line bg-surface px-5 py-4">
              <div className="text-sm font-semibold">Automatic backups</div>
              <div className="mt-3 flex flex-wrap items-center gap-4">
                <label className="flex items-center gap-2 text-sm">
                  <input
                    type="checkbox"
                    checked={settingsDraft.enabled}
                    onChange={(e) =>
                      setSettingsDraft({ ...settingsDraft, enabled: e.target.checked })
                    }
                    className="h-4 w-4 accent-primary"
                  />
                  Enabled
                </label>
                <label className="flex items-center gap-2 text-sm">
                  every
                  <input
                    type="number"
                    min={1}
                    max={365}
                    value={settingsDraft.interval_days}
                    onChange={(e) =>
                      setSettingsDraft({
                        ...settingsDraft,
                        interval_days: Number(e.target.value) || 1,
                      })
                    }
                    className="w-16 rounded-lg border border-line bg-raised px-2 py-1.5 text-sm outline-none focus:border-primary"
                  />
                  days
                </label>
                <label className="flex items-center gap-2 text-sm">
                  keep
                  <input
                    type="number"
                    min={1}
                    max={100}
                    value={settingsDraft.keep_count}
                    onChange={(e) =>
                      setSettingsDraft({
                        ...settingsDraft,
                        keep_count: Number(e.target.value) || 1,
                      })
                    }
                    className="w-16 rounded-lg border border-line bg-raised px-2 py-1.5 text-sm outline-none focus:border-primary"
                  />
                  backups
                </label>
                <button
                  onClick={handleSaveSettings}
                  disabled={!dirty}
                  className="rounded-lg border border-line px-3.5 py-2 text-sm font-medium transition-colors hover:bg-raised disabled:opacity-40"
                >
                  Save
                </button>
              </div>
              {settings?.last_backup_at && (
                <p className="mt-3 text-xs text-muted-foreground">
                  Last backup:{' '}
                  {new Date(settings.last_backup_at).toLocaleString()}
                </p>
              )}
            </section>
          )}

          {/* actions */}
          <div className="mb-6 flex items-center justify-between">
            <h2 className="text-sm font-semibold tracking-widest text-muted-foreground">
              BACKUPS
            </h2>
            <button
              onClick={handleBackupNow}
              disabled={!connected || busy !== null}
              title={connected ? 'Create and upload a backup now' : 'Connect Google Drive first'}
              className="flex items-center gap-1.5 rounded-lg bg-primary px-3.5 py-2 text-sm font-medium text-primary-foreground transition-opacity hover:opacity-90 disabled:opacity-40"
            >
              {busy === 'backup' ? (
                <RefreshCw className="h-4 w-4 animate-spin" />
              ) : (
                <CloudUpload className="h-4 w-4" />
              )}
              {busy === 'backup' ? 'Uploading…' : 'Back up now'}
            </button>
          </div>

          {backups === null && <p className="text-sm text-muted-foreground">Loading…</p>}
          {backups?.length === 0 && (
            <div className="rounded-xl border border-line bg-surface px-6 py-12 text-center">
              <div className="mb-1 text-base font-medium">No backups yet</div>
              <div className="text-sm text-muted-foreground">
                Connect Google Drive and press “Back up now”.
              </div>
            </div>
          )}
          <div className="flex flex-col gap-2">
            {backups?.map((b, i) => (
              <div
                key={`${b.drive_file_id ?? b.file_name}-${i}`}
                className="flex items-center justify-between rounded-xl border border-line bg-surface px-5 py-3.5"
              >
                <div className="min-w-0">
                  <div className="truncate text-sm font-medium">{b.file_name}</div>
                  <div className="text-xs text-muted-foreground">
                    {formatWhen(b)} · {formatSize(b.size_bytes)}
                  </div>
                  {b.error && <div className="text-xs text-red-400">{b.error}</div>}
                </div>
                <div className="flex shrink-0 items-center gap-3">
                  <StatusBadge status={b.status} />
                  {b.status === 'uploaded' || b.status === 'drive' ? (
                    <button
                      onClick={() => setRestoring(b)}
                      disabled={busy !== null}
                      title="Replace this device's workspace with this backup"
                      className="flex items-center gap-1.5 rounded-lg border border-line px-3 py-1.5 text-xs font-medium transition-colors hover:bg-raised disabled:opacity-40"
                    >
                      <Download className="h-3.5 w-3.5" /> Restore
                    </button>
                  ) : null}
                </div>
              </div>
            ))}
          </div>

      <AlertDialog
        open={restoring !== null}
        onOpenChange={(open) => !open && setRestoring(null)}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Restore “{restoring?.file_name}”?</AlertDialogTitle>
            <AlertDialogDescription>
              This replaces everything on this device — notebooks, chapters,
              topics, canvases, presets and tags — with the backup's content.
              This cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={() => restoring && handleRestore(restoring)}>
              Replace everything
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </SettingsLayout>
  );
}

function StatusBadge({ status }: { status: BackupEntry['status'] }) {
  const styles: Record<BackupEntry['status'], string> = {
    uploaded: 'bg-emerald-950/80 text-emerald-300',
    pending: 'bg-raised text-muted-foreground',
    failed: 'bg-red-950/80 text-red-300',
    deleted: 'bg-raised text-muted-foreground',
    drive: 'bg-sky-950/80 text-sky-300',
  };
  return (
    <span
      className={`rounded-full px-2 py-0.5 text-[11px] font-medium ${styles[status]}`}
    >
      {status}
    </span>
  );
}

function formatSize(bytes: number | null): string {
  if (bytes === null || bytes === undefined) return '';
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function formatWhen(entry: BackupEntry): string {
  const ts = entry.uploaded_at ?? entry.created_at;
  if (ts) return new Date(ts).toLocaleString();
  if (entry.drive_created_time) {
    const d = new Date(entry.drive_created_time);
    if (!Number.isNaN(d.getTime())) return d.toLocaleString();
  }
  return '';
}
