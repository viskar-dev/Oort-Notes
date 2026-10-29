import type { BackupSettings } from '@/lib/ipc';

/** The automatic-backup schedule: a visual toggle switch (the same bound
 *  checkbox underneath), interval days and a save that only lights up once
 *  the draft differs from what's stored. When Google Drive is not
 *  connected the row is visually disabled — pure styling, the stored
 *  values are untouched. */
export function BackupScheduleCard({
  settingsDraft,
  dirty,
  connected,
  onPatch,
  onSave,
}: {
  settingsDraft: BackupSettings;
  dirty: boolean;
  /** UI-only: not connected ⇒ the row renders disabled (visual only). */
  connected: boolean;
  onPatch: (patch: Partial<BackupSettings>) => void;
  onSave: () => void;
}) {
  return (
    <section>
      <h2 className="text-sm font-medium text-ink">Automatic backups</h2>
      <div className="mt-3">
        <div
          aria-disabled={!connected}
          className={`flex flex-wrap items-center gap-3 ${connected ? '' : 'pointer-events-none opacity-50'}`}
        >
          {/* same bound checkbox, now styled as a switch */}
          <label className="relative inline-flex cursor-pointer items-center">
            <input
              type="checkbox"
              aria-label="Enabled"
              checked={settingsDraft.enabled}
              onChange={(e) => onPatch({ enabled: e.target.checked })}
              className="peer sr-only"
            />
            <span
              className={`relative h-5 w-9 rounded-full bg-white/[0.08] transition-colors peer-checked:bg-primary ${connected ? '' : 'grayscale'}`}
            >
              <span
                className={`absolute left-0.5 top-1/2 h-4 w-4 -translate-y-1/2 rounded-full bg-white transition-transform ${
                  settingsDraft.enabled ? 'translate-x-4' : ''
                }`}
              />
            </span>
          </label>
          <label className="flex items-center gap-2 text-[13px] text-ink">
            Every
            <input
              type="number"
              min={1}
              max={365}
              value={settingsDraft.interval_days}
              onChange={(e) =>
                onPatch({ interval_days: Number(e.target.value) || 1 })
              }
              className={`w-16 rounded-lg border px-2 outline-none transition-colors [appearance:textfield] [&::-webkit-inner-spin-button]:appearance-none [&::-webkit-outer-spin-button]:appearance-none ${
                connected
                  ? 'h-8 border-white/[0.08] bg-white/[0.03] text-[13px] text-ink focus:border-primary'
                  : 'h-8 border-white/[0.08] bg-transparent text-[13px] text-muted-foreground'
              }`}
            />
            days
          </label>
          <button
            onClick={onSave}
            disabled={!dirty}
            className="ml-auto h-8 rounded-md px-3 text-[13px] text-[#c8c8cc] transition-colors hover:bg-white/[0.06] hover:text-ink disabled:opacity-40 disabled:hover:bg-transparent"
          >
            Save
          </button>
        </div>
        {!connected && (
          <p className="mt-2 text-[13px] text-muted-foreground">
            Connect Google Drive to enable.
          </p>
        )}
      </div>
    </section>
  );
}
