import { useEffect, useMemo, useRef, useState } from 'react';
import { Search, Sticker } from 'lucide-react';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import {
  iconView,
  loadIconSet,
  searchIcons,
  type IconSearchResult,
  type IconSetData,
} from '@/features/canvas/icon-finder/icon-data';

/** results shown per collection before a "show more" button */
const PAGE = 96;
/** ms of quiet time after the last keystroke before a search fires */
const DEBOUNCE = 250;

/** starter chips on an empty search: one tap fills the input */
const STARTERS = ['arrow', 'check', 'notification', 'user', 'star', 'folder'];

function IconGlyph({ data, name }: { data: IconSetData; name: string }) {
  const view = useMemo(() => iconView(data, name), [data, name]);
  if (!view) {
    // set data missing this icon (stale search index): quiet fallback tile
    return <span className="block h-5 w-5 rounded-[4px] bg-border/60" />;
  }
  return (
    <svg viewBox={`0 0 ${view.w} ${view.h}`} width={22} height={22} dangerouslySetInnerHTML={{ __html: view.body }} />
  );
}

function IconGroup({
  prefix,
  title,
  names,
  perGroup,
  onMore,
}: {
  prefix: string;
  title: string;
  names: string[];
  perGroup: number;
  onMore: () => void;
}) {
  const [data, setData] = useState<IconSetData | null>(null);
  useEffect(() => {
    let alive = true;
    loadIconSet(prefix, names.slice(0, perGroup))
      .then((d) => alive && setData(d))
      .catch(() => {});
    return () => {
      alive = false;
    };
  }, [prefix, names, perGroup]);

  const shown = names.slice(0, perGroup);

  return (
    <section>
      <header className="flex items-baseline gap-2 px-1 pb-1.5 pt-3 text-xs">
        <span className="text-muted-foreground">{title}</span>
        <span className="text-faint">{prefix}</span>
        <span className="ml-auto text-faint tabular-nums">{names.length}</span>
      </header>
      <div className="grid grid-cols-[repeat(auto-fill,minmax(48px,1fr))] gap-1">
        {shown.map((name) => {
          const id = `${prefix}:${name}`;
          return (
            <button
              key={name}
              title={id}
              data-testid="iconfinder.icon"
              data-icon={id}
              draggable
              onDragStart={(e) => {
                e.dataTransfer.effectAllowed = 'copy';
                e.dataTransfer.setData('application/x-oort-icon', id);
                e.dataTransfer.setData('text/plain', id);
              }}
              className="flex h-12 items-center justify-center rounded-lg text-ink transition-colors hover:bg-raised focus-visible:outline-2 focus-visible:outline-primary"
            >
              {data ? <IconGlyph data={data} name={name} /> : <span className="h-5 w-5 animate-pulse rounded-[4px] bg-border/40" />}
            </button>
          );
        })}
      </div>
      {names.length > shown.length && (
        <button
          data-testid="iconfinder.more"
          onClick={onMore}
          className="mt-2 w-full rounded-lg border border-line px-2 py-1.5 text-xs text-muted-foreground transition-colors hover:bg-raised hover:text-foreground"
        >
          Show {names.length - shown.length} more in {prefix}
        </button>
      )}
    </section>
  );
}

/**
 * The icon finder: searches every iconify set through our backend and
 * renders the results as draggable buttons — drag one straight onto the
 * canvas to drop an icon shape. Non-modal and without a backdrop so the
 * canvas stays interactive behind the dialog while dragging.
 */
export function IconFinder({ open, onClose }: { open: boolean; onClose: () => void }) {
  const [term, setTerm] = useState('');
  const [result, setResult] = useState<IconSearchResult | null>(null);
  const [failed, setFailed] = useState(false);
  const [busy, setBusy] = useState(false);
  const [perGroup, setPerGroup] = useState(PAGE);
  const reqId = useRef(0);

  // reset when the dialog closes
  useEffect(() => {
    if (!open) {
      setTerm('');
      setResult(null);
      setFailed(false);
      setBusy(false);
      setPerGroup(PAGE);
    }
  }, [open]);

  useEffect(() => {
    const q = term.trim();
    if (!q) {
      setResult(null);
      setBusy(false);
      return;
    }
    setBusy(true);
    const id = ++reqId.current;
    const t = setTimeout(() => {
      searchIcons(q)
        .then((r) => {
          if (reqId.current !== id) return;
          setResult(r);
          setFailed(false);
          setBusy(false);
        })
        .catch(() => {
          if (reqId.current !== id) return;
          setFailed(true);
          setBusy(false);
        });
    }, DEBOUNCE);
    return () => clearTimeout(t);
  }, [term]);

  const groups = useMemo(() => {
    if (!result) return [];
    const map = new Map<string, string[]>();
    result.icons.forEach((id) => {
      const idx = id.indexOf(':');
      if (idx <= 0) return;
      const prefix = id.slice(0, idx);
      const name = id.slice(idx + 1);
      if (!name) return;
      const list = map.get(prefix) ?? [];
      list.push(name);
      map.set(prefix, list);
    });
    return [...map.entries()].map(([prefix, names]) => ({ prefix, names }));
  }, [result]);

  const setCount = result ? Object.keys(result.collections ?? {}).length : 0;

  return (
    <Dialog open={open} onOpenChange={(next) => !next && onClose()} modal={false}>
      <DialogContent
        className="flex h-[70vh] max-w-[min(640px,calc(100vw-2rem))] flex-col gap-3 p-4 sm:max-w-[min(640px,calc(100vw-2rem))]"
        showOverlay={false}
      >
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Sticker className="h-4 w-4" /> Icon finder
          </DialogTitle>
          <DialogDescription className="text-xs">
            All of icon-sets.iconify.design, served by the app core. Drag icons straight onto the canvas.
          </DialogDescription>
        </DialogHeader>

        <div className="relative">
          <Search className="pointer-events-none absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-faint" />
          <input
            autoFocus
            data-testid="iconfinder.search"
            value={term}
            onChange={(e) => setTerm(e.target.value)}
            placeholder="Search icons — try 'notification' or '@mdi: settings'"
            className="h-9 w-full rounded-lg border border-line bg-canvas pl-8 pr-3 text-sm text-ink placeholder:text-faint focus:outline-2 focus:outline-primary"
          />
        </div>

        <div className="shrink-0 text-xs text-muted-foreground" data-testid="iconfinder.status">
          {busy
            ? 'Searching…'
            : failed
              ? 'Search failed — check your connection.'
              : result
                ? `${result.total} icons in ${setCount} sets`
                : ''}
        </div>

        <div
          data-testid="iconfinder.results"
          className="min-h-0 flex-1 overflow-y-auto pr-1"
        >
          {!term.trim() && (
            <div className="flex flex-col gap-2 pt-6 text-sm text-muted-foreground">
              <p className="px-1">Search every icon set the iconify registry serves.</p>
              <div className="flex flex-wrap gap-1.5 px-1">
                {STARTERS.map((s) => (
                  <button
                    key={s}
                    onClick={() => setTerm(s)}
                    className="rounded-full border border-line px-2.5 py-1 text-xs transition-colors hover:bg-raised hover:text-foreground"
                  >
                    {s}
                  </button>
                ))}
              </div>
            </div>
          )}

          {groups.map(({ prefix, names }) => (
            <IconGroup
              key={prefix}
              prefix={prefix}
              title={result?.collections?.[prefix]?.name ?? prefix}
              names={names}
              perGroup={perGroup}
              onMore={() => setPerGroup((g) => g + PAGE)}
            />
          ))}

          {result && !busy && groups.length === 0 && (
            <div className="px-1 pt-6 text-sm text-muted-foreground">No icons match “{term.trim()}”.</div>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
