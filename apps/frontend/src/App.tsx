import { Suspense, lazy, useEffect } from 'react';
import { BrowserRouter, Navigate, Route, Routes, useNavigate, useParams } from 'react-router-dom';
import { invoke, isTauri } from '@tauri-apps/api/core';
import { api } from '@/lib/ipc';
import { useAiNavigation } from '@/features/ai/use-ai-navigation';
import { RouteErrorBoundary } from '@/pages/route-error-boundary';
import { RouteError } from '@/pages/route-error';
import { Toaster } from '@/components/ui/sonner';
import { TooltipProvider } from '@/components/ui/tooltip';

/** Heavy routes are split with React.lazy: tldraw (the canvas bundle) only
 *  loads when a canvas route is opened, and the settings pages load on
 *  demand too. */
const NotebooksPage = lazy(() =>
  import('@/pages/NotebooksPage').then((m) => ({ default: m.NotebooksPage })),
);
const ChaptersPage = lazy(() =>
  import('@/pages/ChaptersPage').then((m) => ({ default: m.ChaptersPage })),
);
const CanvasPage = lazy(() =>
  import('@/pages/CanvasPage').then((m) => ({ default: m.CanvasPage })),
);
const SettingsPage = lazy(() =>
  import('@/pages/SettingsPage').then((m) => ({ default: m.SettingsPage })),
);
const BackupPage = lazy(() =>
  import('@/pages/BackupPage').then((m) => ({ default: m.BackupPage })),
);
const PresetEditorPage = lazy(() =>
  import('@/pages/PresetEditorPage').then((m) => ({ default: m.PresetEditorPage })),
);

const AiSettingsPage = lazy(() =>
  import('@/features/ai/components/ai-settings-page').then((m) => ({ default: m.AiSettingsPage })),
);

/** Full-page fallback while a split route chunk loads. */
function LoadingScreen() {
  return (
    <div className="flex h-screen items-center justify-center text-muted-foreground">
      Loading…
    </div>
  );
}

/**
 * Deep links: '/t/<topicId>?v=<x>,<y>,<z>' (or '/t/<topicId>') resolve the
 * topic's chapter and hand the entry topic + camera over as search params,
 * which the canvas reads and keeps updated as the camera moves.
 */
function TopicDeepLink() {
  const { topicId } = useParams();
  const navigate = useNavigate();

  useEffect(() => {
    (async () => {
      try {
        const topic = await api.loadTopic(topicId!);
        navigate(
          `/chapters/${topic.chapter_id}?topic=${topicId}`,
          { replace: true },
        );
      } catch (e) {
        navigate('/broken-link', {
          replace: true,
          state: { message: e instanceof Error ? e.message : String(e) },
        });
      }
    })();
  }, [topicId, navigate]);

  return (
    <div className="flex h-screen items-center justify-center text-muted-foreground">
      Opening topic…
    </div>
  );
}

function BrokenLink() {
  const navigate = useNavigate();
  return (
    <RouteError
      title="Link not found"
      message="This link points to a topic that no longer exists. It may have been deleted."
      onBack={() => navigate('/')}
      backLabel="Back to notebooks"
    />
  );
}

/**
 * Routes the app to the canvas the AI's `open_canvas` points at (desktop
 * only; the Rust side pins + emits `ai:open-canvas`). Lives inside the
 * Router context so `useNavigate` works.
 */
function AiRouteBridge() {
  useAiNavigation();
  return null;
}

export default function App() {
  // Native window chrome (tauri-plugin-decoration): the window starts
  // hidden; once the document is live we activate the embedded caption
  // panel and reveal it. Rust-side retries cover the cold-boot activation
  // races; a second chance here covers the rare "fell back to the plain
  // native titlebar" case — re-activating is what a page refresh does, so
  // run it automatically instead of leaving the default header up.
  useEffect(() => {
    if (!isTauri()) return;
    void (async () => {
      for (let attempt = 0; attempt < 3; attempt++) {
        const outcome: string = await invoke<string>('activate_and_show').catch((e) => {
          console.error('[window] caption panel activation attempt failed', e);
          return 'failed';
        });
        if (outcome === 'custom') return;
        await new Promise((resolve) => window.setTimeout(resolve, 700));
      }
    })();
  }, []);

  return (
    <div style={{ width: '100vw', height: '100vh', margin: 0, padding: 0, position: 'relative' }}>
      <BrowserRouter>
        <TooltipProvider delay={300}>
          <Toaster />
          <Suspense fallback={<LoadingScreen />}>
            <AiRouteBridge />
            <Routes>
              <Route path="/" element={<NotebooksPage />} errorElement={<RouteErrorBoundary />} />
              <Route path="/notebooks/:notebookId" element={<ChaptersPage />} errorElement={<RouteErrorBoundary />} />
              <Route path="/chapters/:chapterId" element={<CanvasPage />} errorElement={<RouteErrorBoundary />} />
              <Route path="/t/:topicId" element={<TopicDeepLink />} errorElement={<RouteErrorBoundary />} />
              <Route path="/broken-link" element={<BrokenLink />} errorElement={<RouteErrorBoundary />} />
              <Route path="/settings" element={<SettingsPage />} errorElement={<RouteErrorBoundary />} />
              <Route path="/settings/backup" element={<BackupPage />} errorElement={<RouteErrorBoundary />} />
              <Route path="/settings/ai" element={<AiSettingsPage />} errorElement={<RouteErrorBoundary />} />
              <Route path="/settings/presets/:presetId" element={<PresetEditorPage />} errorElement={<RouteErrorBoundary />} />
              <Route path="*" element={<Navigate to="/" replace />} />
            </Routes>
          </Suspense>
        </TooltipProvider>
      </BrowserRouter>
    </div>
  );
}
