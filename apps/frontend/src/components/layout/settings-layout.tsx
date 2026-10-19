import type { ReactNode } from 'react';
import { Link } from 'react-router-dom';
import { HardDriveDownload, Sparkles, type LucideIcon } from 'lucide-react';
import { APP_CONTAINER, WorkspaceLayout } from '@/components/layout/workspace-layout';

export type SettingsSection = 'presets' | 'backup';

const SECTIONS: { id: SettingsSection; label: string; to: string; icon: LucideIcon }[] = [
  { id: 'presets', label: 'Presets', to: '/settings', icon: Sparkles },
  { id: 'backup', label: 'Backup', to: '/settings/backup', icon: HardDriveDownload },
];

/**
 * Settings shell: the same workspace chrome (navbar + breadcrumb) with a
 * section nav on the left and the section content on the right, both on the
 * shared max-w-7xl rhythm.
 */
export function SettingsLayout({
  section,
  children,
}: {
  section: SettingsSection;
  children: ReactNode;
}) {
  const current = SECTIONS.find((s) => s.id === section)!;
  const crumbs =
    section === 'presets'
      ? [{ label: 'Settings' }]
      : [{ label: 'Settings', to: '/settings' }, { label: current.label }];

  return (
    <WorkspaceLayout crumbs={crumbs}>
      <div className={`${APP_CONTAINER} flex flex-1 items-start gap-10 pb-16 pt-10`}>
        <aside className="w-48 shrink-0" aria-label="Settings">
          <div className="mb-2 px-2 text-[11px] font-semibold tracking-widest text-muted-foreground">
            SETTINGS
          </div>
          <nav className="flex flex-col gap-0.5">
            {SECTIONS.map(({ id, label, to, icon: Icon }) => (
              <Link
                key={id}
                to={to}
                aria-current={id === section ? 'page' : undefined}
                className={
                  id === section
                    ? 'flex items-center gap-2 rounded-lg bg-raised px-2 py-2 text-left text-sm font-medium text-primary'
                    : 'flex items-center gap-2 rounded-lg px-2 py-2 text-left text-sm text-muted-foreground transition-colors hover:text-ink'
                }
              >
                <Icon className="h-4 w-4" /> {label}
              </Link>
            ))}
          </nav>
        </aside>

        <main className="min-w-0 flex-1">{children}</main>
      </div>
    </WorkspaceLayout>
  );
}
