import { useAiBusyStore } from '../busy-store';

/**
 * Canvas-level "AI is working…" pill: visible whenever at least one canvas
 * tool call executes — the in-app turn or an external MCP client. Purely an
 * indicator (pointer-events-none, never blocks input), so long wait states
 * like destructive-action confirms stay usable underneath.
 */
export function AiBusyPill() {
  const calls = useAiBusyStore((s) => s.calls);
  const busy = calls > 0;

  return (
    <div
      aria-live="polite"
      aria-hidden={!busy}
      className={`pointer-events-none fixed bottom-6 left-1/2 z-40 -translate-x-1/2 transition-opacity duration-150 ${
        busy ? 'opacity-100' : 'opacity-0'
      }`}
    >
      <span className="flex items-center gap-2 rounded-lg border border-[#24232c] bg-[#111016] px-3 py-1.5 text-xs text-[#a09fab] shadow-[0_4px_14px_rgba(0,0,0,0.4)]">
        <span
          aria-hidden
          className="h-3 w-3 shrink-0 animate-spin rounded-full border border-[#24232c] border-t-[#7c6ee6]"
        />
        AI is working…
      </span>
    </div>
  );
}
