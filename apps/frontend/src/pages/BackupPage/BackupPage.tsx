import { SettingsLayout } from '@/components/layout/settings-layout';
import { ConfirmAlertDialog } from '@/components/global/common/ConfirmAlertDialog';
import { BackupConnectionCard } from '@/components/global/backup/BackupConnectionCard';
import { BackupOAuthConfig } from '@/components/global/backup/BackupOAuthConfig';
import { BackupStateCard } from '@/components/global/backup/BackupStateCard';
import { BackupImportCard } from '@/components/global/backup/BackupImportCard';
import { BackupScheduleCard } from '@/components/global/backup/BackupScheduleCard';
import { useBackupPage } from '@/hooks/backup/use-backup-page';

/** Route: '/settings/backup'. Google Drive backup — connect once and the app
 *  keeps a single, always-latest archive in the hidden Drive app folder; the
 *  Backup page never lists versions, it shows "backed up" or the action that
 *  gets you there, and offers an import on a fresh install. Uses the shared
 *  settings shell. */
export function BackupPage() {
  const bp = useBackupPage();

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

      {bp.error && (
        <div role="alert" className="mb-4 rounded-lg bg-red-950/60 px-4 py-3 text-sm text-red-300">
          {bp.error}
        </div>
      )}
      {bp.notice && !bp.error && (
        <div className="mb-4 rounded-lg bg-emerald-950/60 px-4 py-3 text-sm text-emerald-300">
          {bp.notice}
        </div>
      )}

      {/* connection */}
      <section className="mb-4 rounded-xl border border-line bg-surface px-5 py-4">
        <BackupConnectionCard
          status={bp.status}
          connected={bp.connected}
          busy={bp.busy}
          onConnect={bp.handleConnect}
          onDisconnect={bp.handleDisconnect}
          onToggleConfig={bp.toggleConfig}
        />
        {bp.showConfig && (
          <BackupOAuthConfig config={bp.config} onSave={bp.handleSaveConfig} />
        )}
      </section>

      <BackupStateCard
        connected={bp.connected}
        backupState={bp.backupState}
        settings={bp.settings}
        busy={bp.busy}
        onBackup={bp.handleBackupNow}
      />

      {bp.showImportCard && (
        <BackupImportCard
          info={bp.driveBackup!}
          busy={bp.busy}
          onImport={() => bp.setImporting(true)}
        />
      )}

      {bp.settingsDraft && (
        <BackupScheduleCard
          settingsDraft={bp.settingsDraft}
          dirty={bp.scheduleDirty}
          onPatch={bp.patchSchedule}
          onSave={bp.handleSaveSettings}
        />
      )}

      <ConfirmAlertDialog
        open={bp.importing}
        onOpenChange={(open) => {
          if (!open) bp.setImporting(false);
        }}
        title="Import your backup?"
        description="This replaces everything on this device — notebooks, chapters, topics, canvases, presets and tags — with the contents of your Google Drive backup. This cannot be undone."
        confirmLabel="Import backup"
        disabled={bp.busy === 'import'}
        confirmBusyLabel={bp.busy === 'import' ? 'Importing…' : undefined}
        keepOpen
        onConfirm={bp.handleImport}
      />
    </SettingsLayout>
  );
}
