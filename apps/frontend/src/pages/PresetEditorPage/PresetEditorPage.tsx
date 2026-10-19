import { Link, useNavigate, useParams } from 'react-router-dom';
import { ArrowLeft } from 'lucide-react';
import { PresetToolbarTab } from '@/components/global/presets/PresetToolbarTab';
import { PresetColorsTab } from '@/components/global/presets/PresetColorsTab';
import { PresetFontsTab } from '@/components/global/presets/PresetFontsTab';
import { PresetSizesTab } from '@/components/global/presets/PresetSizesTab';
import { PresetLivePreview } from '@/components/global/presets/PresetLivePreview';
import { usePresetEditor } from '@/hooks/presets/use-preset-editor';

/** Route: '/settings/presets/:presetId' — 'new' creates a preset. */
export function PresetEditorPage() {
  const { presetId } = useParams();
  const navigate = useNavigate();
  const editor = usePresetEditor(presetId);

  if (editor.loading) {
    return <div className="flex min-h-screen items-center justify-center bg-background text-muted-foreground">Loading…</div>;
  }

  return (
    <div className="min-h-screen bg-background text-ink">
      <div className="mx-auto max-w-[1100px] px-10 py-8">
        {/* breadcrumb */}
        <div className="mb-4 flex items-center gap-1.5 text-sm text-muted-foreground">
          <Link to="/settings" className="transition-colors hover:text-ink">
            Settings
          </Link>
          <span>/</span>
          <Link to="/settings" className="transition-colors hover:text-ink">
            Presets
          </Link>
          <span>/</span>
          <span className="font-medium text-ink">{editor.name || 'Untitled'}</span>
        </div>

        <header className="mb-6 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <button
              onClick={() => navigate('/settings')}
              title="Back to presets"
              className="rounded-lg border border-line bg-surface p-2 transition-colors hover:bg-raised"
            >
              <ArrowLeft className="h-4 w-4" />
            </button>
            <input
              value={editor.name}
              onChange={(e) => editor.setName(e.target.value)}
              placeholder="Preset name"
              className="w-64 rounded-lg border border-transparent bg-transparent px-2 py-1.5 text-xl font-semibold tracking-tight outline-none transition-colors hover:border-line focus:border-primary"
            />
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={editor.discard}
              className="rounded-lg px-3.5 py-2 text-sm font-medium text-muted-foreground transition-colors hover:bg-raised hover:text-ink"
            >
              Discard
            </button>
            <button
              onClick={editor.save}
              disabled={!editor.name.trim() || editor.saving}
              className="rounded-lg bg-primary px-4 py-2 text-sm font-medium text-primary-foreground transition-opacity hover:opacity-90 disabled:opacity-40"
            >
              {editor.saving ? 'Saving…' : editor.isNew ? 'Create preset' : 'Save preset'}
            </button>
          </div>
        </header>

        {editor.error && (
          <div className="mb-4 rounded-lg bg-red-950/60 px-4 py-3 text-sm text-red-300">{editor.error}</div>
        )}

        <div className="flex gap-8">
          {/* left: tabs + content */}
          <div className="min-w-0 flex-1">
            <div className="mb-5 flex gap-1 rounded-full border border-line bg-surface p-1">
              {(['toolbar', 'colors', 'fonts', 'sizes'] as const).map((t) => (
                <button
                  key={t}
                  onClick={() => editor.setTab(t)}
                  className={`flex-1 rounded-full px-4 py-1.5 text-sm font-medium capitalize transition-colors ${
                    editor.tab === t ? 'bg-raised text-ink' : 'text-muted-foreground hover:text-ink'
                  }`}
                >
                  {t}
                </button>
              ))}
            </div>

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

          {/* right: live preview */}
          <PresetLivePreview config={editor.config} />
        </div>
      </div>
    </div>
  );
}
