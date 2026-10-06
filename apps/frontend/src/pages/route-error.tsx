/// Friendly full-page error for broken routes (deleted notebook/chapter/topic,
/// stale deep link), instead of a crash or a silent blank screen.

export function RouteError({
  title,
  message,
  onBack,
  backLabel,
}: {
  title: string;
  message: string;
  onBack: () => void;
  backLabel: string;
}) {
  return (
    <div className="flex h-screen flex-col items-center justify-center gap-3 bg-background px-6 text-center">
      <div className="text-3xl">🛰️</div>
      <h1 className="text-lg font-semibold tracking-tight">{title}</h1>
      <p className="max-w-md text-sm text-muted-foreground">{message}</p>
      <button
        onClick={onBack}
        className="mt-2 rounded-lg bg-primary px-4 py-2 text-sm font-medium text-primary-foreground transition-opacity hover:opacity-90"
      >
        {backLabel}
      </button>
    </div>
  );
}
