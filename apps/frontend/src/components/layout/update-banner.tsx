import { useState } from 'react';
import { X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useAppUpdater } from '@/hooks/use-app-updater';

const NOTES_PREVIEW = 160;

/** Slim notice attached below the navbar when an update is available.
 *  Dismissal lasts for the session only; the lifecycle lives in
 *  useAppUpdater. */
export function UpdateBanner({ container }: { container: string }) {
  const { status, update, progress, error, dismissed, dismiss, install } = useAppUpdater();
  const [expanded, setExpanded] = useState(false);

  if (!update || dismissed) return null;

  const notes = (update.body ?? '').trim();
  const longNotes = notes.length > NOTES_PREVIEW;

  return (
    <div role="status" className="border-b border-white/[0.06] bg-iris/[0.08]">
      <div className={`${container} flex flex-wrap items-center gap-x-3 gap-y-1.5 py-2 text-sm`}>
        <span className="shrink-0 font-medium text-fg-1">
          Version {update.version} is available
        </span>
        {notes && (
          <>
            <span
              className={`min-w-0 flex-1 text-[13px] text-fg-2 ${expanded ? 'whitespace-pre-line' : 'truncate'}`}
              title={expanded ? undefined : notes}
            >
              {expanded || !longNotes ? notes : `${notes.slice(0, NOTES_PREVIEW).trimEnd()}…`}
            </span>
            {longNotes && (
              <button
                type="button"
                onClick={() => setExpanded((v) => !v)}
                className="shrink-0 text-[13px] text-iris transition-colors hover:text-fg-1"
              >
                {expanded ? 'Show less' : 'Show more'}
              </button>
            )}
          </>
        )}
        {status === 'available' && (
          <Button size="sm" onClick={() => void install()}>
            Update now
          </Button>
        )}
        {status === 'downloading' && (
          <span className="flex shrink-0 items-center gap-2 text-[13px] text-fg-2">
            {progress !== null && (
              <span className="h-1 w-28 overflow-hidden rounded-full bg-white/[0.08]">
                <span
                  className="block h-full rounded-full bg-iris transition-[width]"
                  style={{ width: `${Math.round(progress * 100)}%` }}
                />
              </span>
            )}
            {progress !== null ? `${Math.round(progress * 100)}%` : 'Downloading…'}
          </span>
        )}
        {status === 'installing' && (
          <span className="shrink-0 text-[13px] text-fg-2">Installing… the app will restart</span>
        )}
        {status === 'failed' && (
          <span className="flex min-w-0 shrink-0 items-center gap-2 text-[13px]">
            <span className="truncate text-fg-2" title={error ?? undefined}>
              {error}
            </span>
            <Button size="sm" variant="outline" onClick={() => void install()}>
              Retry
            </Button>
          </span>
        )}
        <button
          type="button"
          onClick={dismiss}
          aria-label="Dismiss update notice"
          className="flex h-6 w-6 shrink-0 items-center justify-center rounded-md text-fg-3 transition-colors duration-150 hover:bg-white/[0.04] hover:text-fg-1"
        >
          <X className="h-3.5 w-3.5" strokeWidth={1.5} />
        </button>
      </div>
    </div>
  );
}
