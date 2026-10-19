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
import { CheckCircle2, CloudUpload, Download, RefreshCw, Settings } from 'lucide-react';
import {
  api,
  type BackupSettings,
  type BackupStatus,
  type DriveBackupInfo,
  type GoogleConfigView,
  type GoogleStatus,
} from '@/lib/ipc';
import { SettingsLayout } from '@/components/layout/settings-layout';

/** Route: '/settings/backup'. Google Drive backup — connect once and the app
 * keeps a single, always-latest archive in the hidden Drive app folder; the
 * Backup page never lists versions, it shows "backed up" or the action that
 * gets you there, and offers an import on a fresh install. Uses the shared
 * settings shell. */
export function BackupPage() {
  const [params, setParams] = useSearchParams();

  const [status, setStatus] = useState<GoogleStatus | null>(null);
  const [config, setConfig] = useState<GoogleConfigView | null>(null);
  const [settings, setSettings] = useState<BackupSettings | null>(null);
  const [settingsDraft, setSettingsDraft] = useState<BackupSettings | null>(null);
  const [backupState, setBackupState] = useState<BackupStatus | null>(null);
  const [driveBackup, setDriveBackup] = useState<DriveBackupInfo | null>(null);

  const [clientIdDraft, setClientIdDraft] = useState('');
  const [clientSecretDraft, setClientSecretDraft] = useState('');
  const [showConfig, setShowConfig] = useState(false);

  const [busy, setBusy] = useState<'connect' | 'backup' | 'import' | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [importing, setImporting] = useState(false);

  const load = useCallback(async () => {
    // fetched individually: a hiccup in one endpoint (or a slow Drive) must
    // never blank out the connection card — it always shows the account truth
    const [s, c, bs, st] = await Promise.all([
      api.googleStatus().catch(() => null),
      api.getGoogleConfig().catch(() => null),
      api.getBackupSettings().catch(() => null),
      api.getBackupStatus().catch(() => null),
    ]);
    if (s) setStatus(s);
    if (c) {
      setConfig(c);
      setClientIdDraft(c.client_id ?? '');
    }
    if (bs) {
      setSettings(bs);
      setSettingsDraft((draft) => draft ?? bs);
    }
    if (st) setBackupState(st);
    if (!s && !c && !bs && !st) setError('Could not reach the server.');
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const connected = status?.connected ?? false;
  const workspaceEmpty = backupState?.workspace_empty ?? false;

  // the import offer needs to know whether a backup exists on Drive; only
  // asked when it can matter (fresh workspace) and a Drive failure just
  // hides the card instead of erroring the page
  useEffect(() => {
    if (!connected || !workspaceEmpty) return;
    let cancelled = false;
    api
      .getDriveBackup()
      .then((info) => {
        if (!cancelled) setDriveBackup(info);
      })
      .catch(() => {
        if (!cancelled) setDriveBackup(null);
      });
    return () => {
      cancelled = true;
    };
  }, [connected, workspaceEmpty]);

  // the server bounces back here after the OAuth round-trip
  useEffect(() => {
    const result = params.get('google');
    if (result === 'connected') {
      setNotice('Google Drive connected. Your backup stays up to date from here on.');
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
    setNotice(null);
    setBusy('backup');
    try {
      const run = await api.runBackup();
      setNotice(run ? 'Backup complete.' : 'Nothing to back up yet.');
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(null);
    }
  }

  async function handleImport() {
    setError(null);
    setNotice(null);
    setBusy('import');
    try {
      const r = await api.importBackup();
      setImporting(false);
      setNotice(
        `Imported ${r.notebooks} notebooks, ${r.chapters} chapters, ${r.topics} topics.`,
      );
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(null);
    }
  }

  const upToDate = backupState !== null && !backupState.dirty && !workspaceEmpty;
  const needsBackup = backupState !== null && !workspaceEmpty && backupState.dirty;
  const showImportCard = connected && workspaceEmpty && driveBackup?.has_backup === true;
  const scheduleDirty =
    settingsDraft !== null &&
    settings !== null &&
    (settingsDraft.enabled !== settings.enabled ||
      settingsDraft.interval_days !== settings.interval_days);

  return (
    <SettingsLayout section="backup">
      <header className="mb-8">
        <h1 className="text-2xl font-semibold tracking-tight">Backup</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Keeps one up-to-date copy of your whole workspace in a hidden Google
          Drive app folder — always the latest, and it can be imported onto a
          new device.
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
              {status?.email ?? 'Sign in to keep your workspace backed up to Drive.'}
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

      {/* backup state: "backed up" or the one action that gets you there */}
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
              {connected &&
                needsBackup &&
                'New changes since your last backup.'}
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
                onClick={handleBackupNow}
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

      {/* import offer, only while the workspace is new */}
      {showImportCard && (
        <section className="mb-4 rounded-xl border border-primary/30 bg-surface px-5 py-4">
          <div className="flex items-center justify-between gap-4">
            <div className="min-w-0">
              <div className="flex items-center gap-2 text-sm font-semibold">
                <Download className="h-4 w-4 text-primary" aria-hidden />
                Import from Google Drive
              </div>
              <div className="mt-0.5 text-xs text-muted-foreground">
                {`Found ${driveBackup?.file_name ?? 'a backup'}`}
                {driveBackup?.created_time
                  ? ` · saved ${formatDate(driveBackup.created_time)}`
                  : ''}
                {driveBackup?.size_bytes ? ` · ${formatSize(driveBackup.size_bytes)}` : ''}
                {'. This restores your whole workspace onto this device.'}
              </div>
            </div>
            <button
              onClick={() => setImporting(true)}
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
      )}

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
            <button
              onClick={handleSaveSettings}
              disabled={!scheduleDirty}
              className="rounded-lg border border-line px-3.5 py-2 text-sm font-medium transition-colors hover:bg-raised disabled:opacity-40"
            >
              Save
            </button>
          </div>
          <p className="mt-3 text-xs text-muted-foreground">
            Each run updates the same backup file in your Drive — there is only
            ever one, and it is always the latest.
          </p>
        </section>
      )}

      <AlertDialog open={importing} onOpenChange={(open) => !open && setImporting(false)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Import your backup?</AlertDialogTitle>
            <AlertDialogDescription>
              This replaces everything on this device — notebooks, chapters,
              topics, canvases, presets and tags — with the contents of your
              Google Drive backup. This cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              disabled={busy === 'import'}
              onClick={(e) => {
                e.preventDefault();
                void handleImport();
              }}
            >
              {busy === 'import' ? 'Importing…' : 'Import backup'}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </SettingsLayout>
  );
}

/** Short relative label for "Backed up …". */
function whenAgo(ms: number): string {
  const minutes = Math.floor((Date.now() - ms) / 60_000);
  if (minutes < 1) return 'just now';
  if (minutes < 60) return `${minutes} min ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours} h ago`;
  const days = Math.floor(hours / 24);
  if (days < 7) return `${days} d ago`;
  return formatDate(new Date(ms));
}

function formatDate(value: Date | string): string {
  const d = value instanceof Date ? value : new Date(value);
  return Number.isNaN(d.getTime()) ? 'earlier' : d.toLocaleDateString();
}

function formatSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}
