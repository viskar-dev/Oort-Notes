import type { ReactNode } from 'react';
import { Link } from 'react-router-dom';
import { HardDriveDownload, Sparkles, type LucideIcon } from 'lucide-react';
import { isTauri } from '@tauri-apps/api/core';
import { Bot } from 'lucide-react';
import { APP_CONTAINER, WorkspaceLayout } from '@/components/layout/workspace-layout';

export type SettingsSection = 'presets' | 'backup' | 'ai';

const SECTIONS: { id: SettingsSection; label: string; to: string; icon: LucideIcon }[] = [
  { id: 'presets', label: 'Presets', to: '/settings', icon: Sparkles },
  { id: 'ai', label: 'AI', to: '/settings/ai', icon: Bot },
  { id: 'backup', label: 'Backup', to: '/settings/backup', icon: HardDriveDownload },
];

/** Sections available for this build: AI lives in the desktop app only. */
function visibleSections(): typeof SECTIONS {
  return SECTIONS.filter(
    (section) => section.id !== 'ai' || isTauri(),
  );
}

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
      : [{ label: 'Settings', to: '/settings' }, { label: current.label }];  return (
    <WorkspaceLayout crumbs={crumbs} flat>
      <div className={`${APP_CONTAINER} flex flex-1 items-start gap-12 pb-16 pt-10`}>
        <aside className="w-48 shrink-0" aria-label="Settings">
          <div className="mb-2 px-3 text-xs font-medium tracking-widest text-muted-foreground">
            SETTINGS
          </div>
          {/* 32px rows, 13px text, 2px gaps, no border/accent bar — active
              gets a faint fill with the accent on the icon only */}
          <nav className="flex flex-col gap-[2px]">
            {visibleSections().map(({ id, label, to, icon: Icon }) => (
              <Link
                key={id}
                to={to}
                aria-current={id === section ? 'page' : undefined}
                className={
                  id === section
                    ? 'flex h-8 items-center gap-2.5 rounded-md bg-white/[0.05] px-3 text-left text-[13px] text-ink'
                    : 'flex h-8 items-center gap-2.5 rounded-md px-3 text-left text-[13px] text-muted-foreground transition-colors hover:text-ink'
                }
              >
                <Icon
                  className={`h-4 w-4 ${id === section ? 'text-primary' : 'text-muted-foreground'}`}
                  strokeWidth={1.5}
                />
                {label}
              </Link>
            ))}
          </nav>
        </aside>

        <main className="min-w-0 flex-1">{children}</main>
      </div>
    </WorkspaceLayout>
  );
}
