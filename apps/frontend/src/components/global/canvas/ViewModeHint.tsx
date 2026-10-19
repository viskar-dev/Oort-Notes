/** View-mode chrome: a minimal exit hint — the arrow keys flip pages. */
export function ViewModeHint() {
  return (
    <div className="pointer-events-none absolute bottom-6 left-1/2 z-30 -translate-x-1/2">
      <div className="rounded-full bg-surface px-4 py-1.5 text-xs text-muted-foreground shadow-lg">
        View — <kbd className="font-medium text-ink">↑ ↓</kbd> flip pages ·{' '}
        <kbd className="font-medium text-ink">Esc</kbd> exit
      </div>
    </div>
  );
}
