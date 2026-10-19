import { useEffect, useRef, type ReactNode } from 'react';
import { Link } from 'react-router-dom';
import { Search, Settings } from 'lucide-react';

/** Shared width rhythm for every centered page container. */
export const APP_CONTAINER = 'mx-auto w-full max-w-7xl px-6 lg:px-8';

export type Crumb = {
  label: string;
  /** When present the crumb renders as a link; the last crumb is the page. */
  to?: string;
};

export type LayoutSearch = {
  value: string;
  onChange: (value: string) => void;
  placeholder: string;
};

function isMac(): boolean {
  return typeof navigator !== 'undefined' && /Mac|iPhone|iPad/.test(navigator.platform ?? navigator.userAgent);
}

/**
 * App chrome shared by the notebooks home, the chapters page and the settings
 * section: a full-bleed sticky navbar (logo, optional search, settings) and a
 * sticky breadcrumb bar pinned to the bottom of the viewport.
 *
 * Both bars are real layout boxes with only horizontal auto margins — no
 * vertical auto margins on the navbar — so the chrome never drifts when the
 * page content grows or shrinks.
 */
export function WorkspaceLayout({
  search,
  crumbs,
  footerNote = 'Last synced just now',
  children,
}: {
  /** When omitted the navbar renders without its search field. */
  search?: LayoutSearch;
  crumbs: Crumb[];
  footerNote?: string;
  children: ReactNode;
}) {
  const searchRef = useRef<HTMLInputElement>(null);

  // Ctrl/Cmd+K focuses the navbar search from anywhere on the page
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (!(e.ctrlKey || e.metaKey) || e.key.toLowerCase() !== 'k') return;
      if (!searchRef.current) return;
      e.preventDefault();
      searchRef.current.focus();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  return (
    <div className="nb-root flex min-h-screen flex-col bg-[#060608]">
      <header className="sticky top-0 z-30 border-b border-[#24232c] bg-[#060608]">
        <div className={`${APP_CONTAINER} flex h-14 items-center justify-between`}>
          <Link to="/" title="Back to notebooks" className="flex items-center gap-2">
            <svg width="20" height="20" viewBox="0 0 22 22" aria-hidden>
              <circle cx="11" cy="11" r="5" fill="var(--text)" />
              <ellipse
                cx="11"
                cy="11"
                rx="9.5"
                ry="4.2"
                fill="none"
                stroke="var(--text-3)"
                strokeWidth="1"
                transform="rotate(-24 11 11)"
              />
            </svg>
            <span className="text-sm font-semibold text-[#f4f4f6]">Oort Notes</span>
          </Link>

          <div className="flex items-center gap-3">
            {search && (
              <div className="relative h-9 w-64 rounded-[10px] border border-[#24232c] bg-[#17161c] focus-within:ring-2 focus-within:ring-[#7c6ee6] focus-within:ring-offset-2 focus-within:ring-offset-[#060608]">
                <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-[#8b8a96]" />
                <input
                  ref={searchRef}
                  value={search.value}
                  onChange={(e) => search.onChange(e.target.value)}
                  placeholder={search.placeholder}
                  className="h-full w-full rounded-[10px] bg-transparent pl-9 pr-16 text-[13px] text-[#f4f4f6] outline-none placeholder:text-[#8b8a96]"
                />
                <kbd className="pointer-events-none absolute right-2 top-1/2 flex h-5 -translate-y-1/2 items-center rounded-md border border-[#24232c] bg-[#060608] px-1.5 font-sans text-[11px] text-[#8b8a96]">
                  {isMac() ? '⌘K' : 'Ctrl K'}
                </kbd>
              </div>
            )}
            <Link
              to="/settings"
              title="Settings"
              className="flex size-8 items-center justify-center rounded-full border border-[#24232c] bg-[#17161c] text-[#a09fab] transition-colors hover:bg-[#1c1b22] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#7c6ee6] focus-visible:ring-offset-2 focus-visible:ring-offset-[#060608]"
            >
              <Settings className="h-4 w-4" />
            </Link>
          </div>
        </div>
      </header>

      <div className="flex min-h-0 flex-1 flex-col">{children}</div>

      <footer className="sticky bottom-0 z-30 mt-auto border-t border-[#24232c] bg-[#060608]">
        <div className={`${APP_CONTAINER} flex h-10 items-center justify-between text-[13px]`}>
          <nav aria-label="Breadcrumb" className="flex items-center gap-1.5">
            {crumbs.map((crumb, i) => (
              <span key={`${crumb.label}-${i}`} className="flex items-center gap-1.5">
                {i > 0 && <span className="text-[#3f3f46]">/</span>}
                {crumb.to ? (
                  <Link to={crumb.to} className="text-[#8b8a96] transition-colors hover:text-[#f4f4f6]">
                    {crumb.label}
                  </Link>
                ) : (
                  <span className="font-medium text-[#f4f4f6]">{crumb.label}</span>
                )}
              </span>
            ))}
          </nav>
          <span className="text-[#8b8a96]">{footerNote}</span>
        </div>
      </footer>
    </div>
  );
}
