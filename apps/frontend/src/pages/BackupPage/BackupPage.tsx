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
 *  gets you there, and offers an import on a fresh install. Flat layout on
 *  the same 640px rhythm as the AI settings page. */
export function BackupPage() {
  const bp = useBackupPage();

  return (
    <SettingsLayout section="backup">
      <div className="max-w-[640px] pb-16">
        <h1 className="text-xl font-semibold text-ink">Backup</h1>
        <p className="mt-2 text-[13px] text-muted-foreground">
          One up-to-date copy of your workspace in a hidden Google Drive folder.
        </p>

        {bp.error && (
          <div role="alert" className="mt-4 rounded-lg bg-red-950/60 px-3 py-2 text-[13px] text-red-300">
            {bp.error}
          </div>
        )}
        {bp.notice && !bp.error && (
          <div className="mt-4 rounded-lg bg-emerald-950/60 px-3 py-2 text-[13px] text-emerald-300">
            {bp.notice}
          </div>
        )}

        <div className="mt-8">
          {/* ── Section 1 · Google Drive (connection + backup state merged) ── */}
          <section>
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
            {/* former “Your backup” card, folded into this section */}
            <BackupStateCard
              connected={bp.connected}
              backupState={bp.backupState}
              settings={bp.settings}
              busy={bp.busy}
              onBackup={bp.handleBackupNow}
            />
          </section>

          {bp.showImportCard && (
            <>
              <hr className="my-5 h-px border-0 bg-white/[0.06]" />
              <section>
                <BackupImportCard
                  info={bp.driveBackup!}
                  busy={bp.busy}
                  onImport={() => bp.setImporting(true)}
                />
              </section>
            </>
          )}

          <hr className="my-5 h-px border-0 bg-white/[0.06]" />

          {/* ── Section 2 · Automatic backups ─────────────────────────── */}
          {bp.settingsDraft && (
            <BackupScheduleCard
              settingsDraft={bp.settingsDraft}
              dirty={bp.scheduleDirty}
              connected={bp.connected}
              onPatch={bp.patchSchedule}
              onSave={bp.handleSaveSettings}
            />
          )}
        </div>
      </div>

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
