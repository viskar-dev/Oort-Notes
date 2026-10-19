import type { BackupSettings } from '@/lib/ipc';

/** The automatic-backup schedule: enabled checkbox, interval days and a
 *  save that only lights up once the draft differs from what's stored. */
export function BackupScheduleCard({
  settingsDraft,
  dirty,
  onPatch,
  onSave,
}: {
  settingsDraft: BackupSettings;
  dirty: boolean;
  onPatch: (patch: Partial<BackupSettings>) => void;
  onSave: () => void;
}) {
  return (
    <section className="mb-4 rounded-xl border border-line bg-surface px-5 py-4">
      <div className="text-sm font-semibold">Automatic backups</div>
      <div className="mt-3 flex flex-wrap items-center gap-4">
        <label className="flex items-center gap-2 text-sm">
          <input
            type="checkbox"
            checked={settingsDraft.enabled}
            onChange={(e) => onPatch({ enabled: e.target.checked })}
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
              onPatch({ interval_days: Number(e.target.value) || 1 })
            }
            className="w-16 rounded-lg border border-line bg-raised px-2 py-1.5 text-sm outline-none focus:border-primary"
          />
          days
        </label>
        <button
          onClick={onSave}
          disabled={!dirty}
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
  );
}
