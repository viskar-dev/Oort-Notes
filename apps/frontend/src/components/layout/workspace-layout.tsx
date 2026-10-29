import { useEffect, useRef, useState, type ReactNode } from 'react';
import { Link } from 'react-router-dom';
import { Search, Settings } from 'lucide-react';
import { isTauri } from '@tauri-apps/api/core';

/** Shared width rhythm for the wide inner pages (chapters, settings). */
export const APP_CONTAINER = 'mx-auto w-full max-w-7xl px-6 lg:px-8';

/** Width rhythm of the 2026 notebooks home. */
export const HOME_CONTAINER = 'mx-auto w-full max-w-6xl px-6';

/** window event used to focus the page's search field when the chrome itself
 *  renders no search box (the notebooks home keeps its filter/search input
 *  in the controls row); ⌘K and the top-bar icon both dispatch it. */
export const SEARCH_FOCUS_EVENT = 'oort:search-focus';

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
 * App chrome shared by the notebooks home, the chapters page and the
 * settings section: a translucent sticky navbar (logo, breadcrumb, search,
 * settings) plus, on the wide inner pages, the sync note pinned to the
 * bottom of the viewport. The home opts out of the bottom bar and renders
 * the breadcrumb inline in the navbar instead.
 */
export function WorkspaceLayout({
  search,
  crumbs,
  container = APP_CONTAINER,
  footerNote = 'Last synced just now',
  showFooter = true,
  syncDot = false,
  flat = false,
  children,
}: {
  /** When omitted the navbar renders a search icon button instead of the
   *  full field and ⌘K re-targets whichever input the page provides. */
  search?: LayoutSearch;
  crumbs: Crumb[];
  /** Width rhythm for the navbar and (inner pages) the bottom bar. */
  container?: string;
  footerNote?: string;
  /** The wide inner pages keep the bottom sync bar; the home hides it. */
  showFooter?: boolean;
  /** Fixed bottom-right "Synced just now" chip (notebooks home). */
  syncDot?: boolean;
  /** Flat chrome (settings shell): no bottom border on the navbar, 13px
   *  muted breadcrumb parents with a white current page. UI-only look. */
  flat?: boolean;
  children: ReactNode;
}) {
  const searchRef = useRef<HTMLInputElement>(null);
  // whether the nav search field is expanded (pages that pass `search`)
  const [searchOpen, setSearchOpen] = useState(false);

  // ⌘K opens + focuses the chrome's own field; without one it dispatches the
  // event the page's search input listens for.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (!(e.ctrlKey || e.metaKey) || e.key.toLowerCase() !== 'k') return;
      if (search) {
        e.preventDefault();
        setSearchOpen(true);
      } else {
        window.dispatchEvent(new CustomEvent(SEARCH_FOCUS_EVENT));
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [search]);

  useEffect(() => {
    if (searchOpen) searchRef.current?.focus();
  }, [searchOpen]);

  return (
    <div className="nb-root flex min-h-screen flex-col  ">
      <header
        className={`sticky top-0 z-20 bg-bg/60 backdrop-blur-md ${flat ? '' : 'border-b border-white/[0.06]'}`}
      >
        {/* full-bleed row: the page content keeps the centered container
            rhythm (left spacer mirrors the controls cell so the column stays
            optically centered), while the window controls own the true
            right-hand corner of the window at every width. */}
        <div data-tauri-drag-region className="flex items-stretch">
          {isTauri() && (
            <div
              aria-hidden
              data-tauri-drag-region
              className="hidden h-14 shrink-0 sm:block"
              style={{ width: 'var(--tauri-plugin-decoration-right-clearance, 0px)' }}
            />
          )}
          <div
            data-tauri-drag-region
            className={`${container} flex h-14 min-w-0 flex-1 items-center justify-between`}
          >
            <div data-tauri-drag-region className="flex min-w-0 items-center gap-1.5">
            <Link
              to="/"
              title="Back to notebooks"
              aria-label="Oort Notes home"
              className="flex shrink-0 items-center gap-2"
            >
              {/* Oort mark: the app icon's ring + node dot (the violet art
                  of the final oort-logo.png), minus its black square — same
                  art as public/favicon.svg, cropped to the mark itself. */}
              <svg width="20" height="20" viewBox="323 310 634 634" aria-hidden>
                <defs>
                  <linearGradient id="oort-ring-nav" gradientUnits="userSpaceOnUse" x1="400" y1="310" x2="850" y2="790">
                    <stop offset="0" stopColor="#d9cdff" />
                    <stop offset="0.45" stopColor="#9d7bff" />
                    <stop offset="0.78" stopColor="#7c4dff" />
                    <stop offset="1" stopColor="#6432f0" />
                  </linearGradient>
                </defs>
                <circle cx="627" cy="627" r="269" fill="none" stroke="url(#oort-ring-nav)" strokeWidth="70" />
                <circle cx="912" cy="624" r="45" fill="#ffffff" />
              </svg>
              <span className="text-sm font-medium text-fg-1">Oort Notes</span>
            </Link>
            {crumbs.length > 1 &&
              crumbs.map((crumb, i) => (
                <span key={`${crumb.label}-${i}`} className="flex min-w-0 items-center gap-1.5">
                  <span className={`${flat ? 'text-[13px] text-fg-3' : 'text-sm text-fg-3'}`}>/</span>
                  {crumb.to ? (
                    <Link
                      to={crumb.to}
                      className={`${flat ? 'text-[13px] text-fg-3' : 'text-sm text-fg-2'} truncate transition-colors hover:text-fg-1`}
                    >
                      {crumb.label}
                    </Link>
                  ) : (
                    <span
                      data-tauri-drag-region
                      className={`${flat ? 'text-[13px] text-fg-1' : 'text-sm text-fg-1'} truncate`}
                    >
                      {crumb.label}
                    </span>
                  )}
                </span>
              ))}
          </div>

          <div data-tauri-drag-region className="flex items-center gap-2">
            {search && (searchOpen || search.value.trim() !== '') ? (
              <div className="relative h-9 w-64 rounded-lg border border-white/[0.08] bg-white/[0.03] transition-colors duration-150 focus-within:border-white/[0.12]">
                <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-fg-3" />
                <input
                  ref={searchRef}
                  value={search.value}
                  onChange={(e) => search.onChange(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Escape') setSearchOpen(false);
                  }}
                  onBlur={() => {
                    if (search.value.trim() === '') setSearchOpen(false);
                  }}
                  placeholder={search.placeholder}
                  aria-label={search.placeholder}
                  className="h-full w-full rounded-lg bg-transparent pl-9 pr-16 text-sm text-fg-1 outline-none placeholder:text-fg-3"
                />
                <kbd className="pointer-events-none absolute right-2 top-1/2 hidden h-5 -translate-y-1/2 items-center rounded border border-white/[0.08] px-1.5 font-sans text-[11px] text-fg-2 shadow-[inset_0_1px_0_rgba(255,255,255,0.05)] sm:flex">
                  {isMac() ? '⌘ K' : 'Ctrl K'}
                </kbd>
              </div>
            ) : (
              <>
                <button
                  type="button"
                  onClick={() =>
                    search
                      ? setSearchOpen(true)
                      : window.dispatchEvent(new CustomEvent(SEARCH_FOCUS_EVENT))
                  }
                  aria-label="Search"
                  className="flex h-8 w-8 items-center justify-center rounded-lg text-fg-3 transition-colors duration-150 hover:bg-white/[0.04] hover:text-fg-1"
                >
                  <Search className="h-4 w-4" strokeWidth={1.5} />
                </button>
                <kbd className="hidden h-5 items-center rounded border border-white/[0.08] px-1.5 font-sans text-[11px] text-fg-2 shadow-[inset_0_1px_0_rgba(255,255,255,0.05)] sm:flex">
                  {isMac() ? '⌘ K' : 'Ctrl K'}
                </kbd>
              </>
            )}
            <span aria-hidden className="hidden h-4 w-px bg-white/[0.08] sm:block" />
            <Link
              to="/settings"
              aria-label="Settings"
              className="flex h-8 w-8 items-center justify-center rounded-lg text-fg-2 transition-colors duration-150 hover:bg-white/[0.04] hover:text-fg-1"
            >
              <Settings className="h-4 w-4" strokeWidth={1.5} />
            </Link>
          </div>
          </div>
          {/* native caption panel (tauri-plugin-decoration): the plugin
              overlays its measured controls at the true window corner, so
              the navbar reserves exactly the published right clearance.
              The var is 0px in fullscreen and when the native-fallback
              titlebar is active, so the cell self-collapses. */}
          {isTauri() && (
            <div
              aria-hidden
              className="h-14 shrink-0"
              style={{ width: 'var(--tauri-plugin-decoration-right-clearance, 0px)' }}
            />
          )}
        </div>
      </header>

      <div className="flex min-h-0 flex-1 flex-col">{children}</div>

      {syncDot && (
        <div className="pointer-events-none fixed inset-x-0 bottom-5 z-20">
          <div className={`${container} flex justify-end`}>
            <span className="inline-flex items-center gap-2">
              <span className="h-1.5 w-1.5 rounded-full bg-ok shadow-dot" />
              <span className="text-xs text-fg-3">{footerNote === 'Last synced just now' ? 'Synced just now' : footerNote}</span>
            </span>
          </div>
        </div>
      )}

      {showFooter && (
        <footer className="sticky bottom-0 z-20 mt-auto bg-bg/60 backdrop-blur-md">
          <div className="hairline" aria-hidden />
          <div className={`${container} flex h-10 items-center justify-end text-[13px]`}>
            <span className="text-xs text-fg-3">{footerNote}</span>
          </div>
        </footer>
      )}
    </div>
  );
}
