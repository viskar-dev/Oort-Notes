import { Toaster as Sonner, type ToasterProps } from 'sonner';

/**
 * The app-wide toast surface (shadcn's sonner wrapper, adapted: Oort has no
 * theme switcher — it is always the chrome dark palette, so no next-themes).
 *
 * Nothing here is hand-painted: every sonner palette slot points at the SAME
 * shadcn tokens the rest of the UI reads (`--popover`, `--border`,
 * `--foreground`, `--primary`, `--destructive`), so theming the tokens in
 * index.css themes every toast automatically. `richColors` is not enabled —
 * its semantic surfaces are mapped anyway so the variant colors can't drift
 * back to sonner's stock values.
 */
const Toaster = ({ ...props }: ToasterProps) => (
  <Sonner
    theme="dark"
    className="toaster group"
    // Top-right, offset below the overlay titlebar band: the bottom corners
    // belong to canvas UI (pager chip, working pill) and must stay clear.
    position="top-right"
    offset={{ top: 52, right: 16 }}
    style={
      {
        // main surface (theme="dark" sets stock blacks below this — the
        // inline style always wins on the root element)
        '--normal-bg': 'var(--popover)',
        '--normal-bg-hover': 'var(--accent)',
        '--normal-text': 'var(--popover-foreground)',
        '--normal-border': 'var(--border)',
        '--normal-border-hover':
          'color-mix(in oklab, var(--muted-foreground) 35%, var(--popover))',

        // semantic variants, tokens not hexes: success rides the theme's ok
        // green, info the iris accent, error/warning the destructive red —
        // each as a quiet tinted fill on the popover surface.
        '--success-bg': 'color-mix(in oklab, var(--color-ok) 12%, var(--popover))',
        '--success-border': 'color-mix(in oklab, var(--color-ok) 30%, transparent)',
        '--success-text': 'var(--color-ok)',
        '--info-bg': 'color-mix(in oklab, var(--primary) 12%, var(--popover))',
        '--info-border': 'color-mix(in oklab, var(--primary) 30%, transparent)',
        '--info-text': 'var(--primary)',
        '--warning-bg': 'color-mix(in oklab, var(--destructive) 10%, var(--popover))',
        '--warning-border': 'color-mix(in oklab, var(--destructive) 26%, transparent)',
        '--warning-text': 'var(--destructive)',
        '--error-bg': 'color-mix(in oklab, var(--destructive) 12%, var(--popover))',
        '--error-border': 'color-mix(in oklab, var(--destructive) 30%, transparent)',
        '--error-text': 'var(--destructive)',

        '--border-radius': 'var(--radius-lg, 10px)',
      } as React.CSSProperties
    }
    {...props}
  />
);

export { Toaster };
