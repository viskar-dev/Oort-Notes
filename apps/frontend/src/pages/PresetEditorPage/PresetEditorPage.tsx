import { Link, useNavigate, useParams } from 'react-router-dom';
import { ArrowLeft } from 'lucide-react';
import { PresetToolbarTab } from '@/components/global/presets/PresetToolbarTab';
import { PresetColorsTab } from '@/components/global/presets/PresetColorsTab';
import { PresetFontsTab } from '@/components/global/presets/PresetFontsTab';
import { PresetSizesTab } from '@/components/global/presets/PresetSizesTab';
import { PresetLivePreview } from '@/components/global/presets/PresetLivePreview';
import { usePresetEditor } from '@/hooks/presets/use-preset-editor';

/** Route: '/settings/presets/:presetId' — 'new' creates a preset. Flat
 *  two-column editor (560px list + 420px sticky preview) on the same
 *  rhythm as the AI and Backup settings pages. */
export function PresetEditorPage() {
  const { presetId } = useParams();
  const navigate = useNavigate();
  const editor = usePresetEditor(presetId);

  if (editor.loading) {
    return <div className="flex min-h-screen items-center justify-center bg-background text-muted-foreground">Loading…</div>;
  }

  return (
    <div className="min-h-screen bg-background text-ink">
      {/* left-aligned, 48px from the window edge (px-12) */}
      <div className="px-12 py-8">
        {/* breadcrumb: muted parents, white current (the preset's name lives
            in the header input, not repeated here); its empty stretch drags
            the undecorated window, and the native caption panel's clearance
            is reserved on the drag rows */}
        <div
          data-tauri-drag-region
          className="flex items-center gap-1.5 text-[13px] text-muted-foreground"
          style={{ paddingRight: 'var(--tauri-plugin-decoration-right-clearance, 0px)' }}
        >
          <Link to="/settings" className="transition-colors hover:text-ink">
            Settings
          </Link>
          <span>/</span>
          <span data-tauri-drag-region className="text-ink">
            Presets
          </span>
        </div>

        <header
          data-tauri-drag-region
          className="mt-8 flex items-center justify-between"
          style={{ paddingRight: 'var(--tauri-plugin-decoration-right-clearance, 0px)' }}
        >
          <div className="flex items-center gap-2">
            <button
              onClick={() => navigate('/settings')}
              title="Back to presets"
              className="flex h-8 w-8 items-center justify-center rounded-md text-[#c8c8cc] transition-colors hover:bg-white/[0.06] hover:text-ink"
            >
              <ArrowLeft className="h-4 w-4" strokeWidth={1.5} />
            </button>
            <input
              value={editor.name}
              onChange={(e) => editor.setName(e.target.value)}
              placeholder="Preset name"
              className="w-64 border-b border-transparent bg-transparent px-1 py-1 text-xl font-semibold tracking-tight outline-none transition-colors placeholder:text-muted-foreground focus:border-primary"
            />
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={editor.discard}
              className="h-8 rounded-md px-3 text-[13px] text-[#c8c8cc] transition-colors hover:bg-white/[0.06] hover:text-ink"
            >
              Discard
            </button>
            <button
              onClick={editor.save}
              disabled={!editor.name.trim() || editor.saving}
              className="h-8 rounded-md bg-primary px-3 text-[13px] font-medium text-primary-foreground transition-opacity hover:opacity-90 disabled:opacity-40"
            >
              {editor.saving ? 'Saving…' : editor.isNew ? 'Create preset' : 'Save preset'}
            </button>
          </div>
        </header>

        {editor.error && (
          <div className="mt-4 rounded-lg bg-red-950/60 px-3 py-2 text-[13px] text-red-300">{editor.error}</div>
        )}

        <div className="mt-8 flex items-start gap-12">
          {/* left: tabs + content (24px below the tab row) */}
          <div className="w-[560px] shrink-0">
            <div className="flex items-center gap-6 border-b border-white/[0.06]">
              {(['toolbar', 'colors', 'fonts', 'sizes'] as const).map((t) => (
                <button
                  key={t}
                  onClick={() => editor.setTab(t)}
                  className={`-mb-px pb-2 text-[13px] capitalize transition-colors ${
                    editor.tab === t
                      ? 'border-b-2 border-white text-ink'
                      : 'text-muted-foreground hover:text-ink'
                  }`}
                >
                  {t}
                </button>
              ))}
            </div>

            <div className="mt-6">
              {editor.tab === 'toolbar' && (
                <PresetToolbarTab
                  config={editor.config}
                  onChange={(toolbar) => editor.patchSection('toolbar', toolbar)}
                />
              )}
              {editor.tab === 'colors' && (
                <PresetColorsTab
                  config={editor.config}
                  onChange={(colors) => editor.patchSection('colors', colors)}
                />
              )}
              {editor.tab === 'fonts' && (
                <PresetFontsTab
                  config={editor.config}
                  onChange={(fonts) => editor.patchSection('fonts', fonts)}
                />
              )}
              {editor.tab === 'sizes' && (
                <PresetSizesTab
                  config={editor.config}
                  onChange={(sizes) => editor.patchSection('sizes', sizes)}
                />
              )}
            </div>
          </div>

          {/* right: live preview, sticky while the list scrolls */}
          <PresetLivePreview config={editor.config} />
        </div>
      </div>
    </div>
  );
}
