import { useCallback, useEffect, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import {
  api,
  type BackupSettings,
  type BackupStatus,
  type DriveBackupInfo,
  type GoogleConfigView,
  type GoogleStatus,
} from '@/lib/ipc';
import { errorText } from '@/lib/utils';

export type BackupBusyAction = 'connect' | 'backup' | 'import';

/** Message for the oauth redirect params (?google=connected|error). */
function noticeFromParams(params: URLSearchParams): string | null {
  const result = params.get('google');
  if (result === 'connected') {
    return 'Google Drive connected. Your backup stays up to date from here on.';
  }
  if (result === 'error') {
    const reason = params.get('reason');
    return reason === 'not_configured'
      ? 'Google is not configured yet — fill in the client ID below and try again.'
      : 'Google sign-in did not complete. Please try again.';
  }
  return null;
}

/** Backup page data and actions. Each status endpoint is fetched
 *  independently, so a hiccup in one (or a slow Drive) can never blank the
 *  connection card — it always shows the account truth. */
export function useBackupPage() {
  const [searchParams, setSearchParams] = useSearchParams();

  const [status, setStatus] = useState<GoogleStatus | null>(null);
  const [config, setConfig] = useState<GoogleConfigView | null>(null);
  const [settings, setSettings] = useState<BackupSettings | null>(null);
  const [settingsDraft, setSettingsDraft] = useState<BackupSettings | null>(null);
  const [backupState, setBackupState] = useState<BackupStatus | null>(null);
  const [driveBackup, setDriveBackup] = useState<DriveBackupInfo | null>(null);

  const [clientSecretDraft, setClientSecretDraft] = useState('');
  const [showConfig, setShowConfig] = useState(false);
  const [busy, setBusy] = useState<BackupBusyAction | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [importing, setImporting] = useState(false);

  // the server bounces back here after the OAuth round-trip: the notice is
  // derived once at mount and the params are wiped from the URL right after
  const [notice, setNotice] = useState<string | null>(() => noticeFromParams(searchParams));

  const load = useCallback(async () => {
    const [s, c, bs, st] = await Promise.all([
      api.googleStatus().catch(() => null),
      api.getGoogleConfig().catch(() => null),
      api.getBackupSettings().catch(() => null),
      api.getBackupStatus().catch(() => null),
    ]);
    if (s) setStatus(s);
    if (c) setConfig(c);
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

  // consume the redirect params: the notice lives in state, the URL is clean
  useEffect(() => {
    if (searchParams.has('google')) {
      setSearchParams({}, { replace: true });
    }
  }, [searchParams, setSearchParams]);

  const handleConnect = async () => {
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
      setError(errorText(e));
    } finally {
      setBusy(null);
    }
  };

  const handleDisconnect = async () => {
    setError(null);
    try {
      await api.googleDisconnect();
      setNotice('Google Drive disconnected.');
      await load();
    } catch (e) {
      setError(errorText(e));
    }
  };

  const handleSaveConfig = async (clientId: string, clientSecret: string | null) => {
    setError(null);
    try {
      await api.setGoogleConfig(clientId, clientSecret);
      setShowConfig(false);
      setClientSecretDraft('');
      await load();
    } catch (e) {
      setError(errorText(e));
    }
  };

  const handleSaveSettings = async () => {
    if (!settingsDraft) return;
    setError(null);
    try {
      const saved = await api.updateBackupSettings(settingsDraft);
      setSettings(saved);
      setSettingsDraft(saved);
      await load();
    } catch (e) {
      setError(errorText(e));
    }
  };

  const handleBackupNow = async () => {
    setError(null);
    setNotice(null);
    setBusy('backup');
    try {
      const run = await api.runBackup();
      setNotice(run ? 'Backup complete.' : 'Nothing to back up yet.');
      await load();
    } catch (e) {
      setError(errorText(e));
    } finally {
      setBusy(null);
    }
  };

  const handleImport = async () => {
    setError(null);
    setNotice(null);
    setBusy('import');
    try {
      const r = await api.importBackup();
      setImporting(false);
      setNotice(`Imported ${r.notebooks} notebooks, ${r.chapters} chapters, ${r.topics} topics.`);
      await load();
    } catch (e) {
      setError(errorText(e));
    } finally {
      setBusy(null);
    }
  };

  // the schedule section edits a draft; Save flips it over at once
  const patchSchedule = (patch: Partial<BackupSettings>) => {
    setSettingsDraft((draft) => (draft ? { ...draft, ...patch } : draft));
  };

  const scheduleDirty =
    settingsDraft !== null &&
    settings !== null &&
    (settingsDraft.enabled !== settings.enabled ||
      settingsDraft.interval_days !== settings.interval_days);

  return {
    status,
    config,
    settings,
    settingsDraft,
    backupState,
    driveBackup,
    connected,
    workspaceEmpty,
    showImportCard: connected && workspaceEmpty && driveBackup?.has_backup === true,
    scheduleDirty,
    showConfig,
    clientSecretDraft,
    setClientSecretDraft,
    busy,
    error,
    notice,
    importing,
    setImporting,
    patchSchedule,
    toggleConfig: () => setShowConfig((v) => !v),
    handleConnect,
    handleDisconnect,
    handleSaveConfig,
    handleSaveSettings,
    handleBackupNow,
    handleImport,
  };
}
