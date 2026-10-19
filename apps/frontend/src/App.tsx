import { Suspense, lazy, useEffect } from 'react';
import { BrowserRouter, Navigate, Route, Routes, useNavigate, useParams } from 'react-router-dom';
import { api } from '@/lib/ipc';
import { RouteErrorBoundary } from '@/pages/route-error-boundary';
import { RouteError } from '@/pages/route-error';

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

export default function App() {
  return (
    <div style={{ width: '100vw', height: '100vh', margin: 0, padding: 0, position: 'relative' }}>
      <BrowserRouter>
        <Suspense fallback={<LoadingScreen />}>
          <Routes>
            <Route path="/" element={<NotebooksPage />} errorElement={<RouteErrorBoundary />} />
            <Route path="/notebooks/:notebookId" element={<ChaptersPage />} errorElement={<RouteErrorBoundary />} />
            <Route path="/chapters/:chapterId" element={<CanvasPage />} errorElement={<RouteErrorBoundary />} />
            <Route path="/t/:topicId" element={<TopicDeepLink />} errorElement={<RouteErrorBoundary />} />
            <Route path="/broken-link" element={<BrokenLink />} errorElement={<RouteErrorBoundary />} />
            <Route path="/settings" element={<SettingsPage />} errorElement={<RouteErrorBoundary />} />
            <Route path="/settings/backup" element={<BackupPage />} errorElement={<RouteErrorBoundary />} />
            <Route path="/settings/presets/:presetId" element={<PresetEditorPage />} errorElement={<RouteErrorBoundary />} />
            <Route path="*" element={<Navigate to="/" replace />} />
          </Routes>
        </Suspense>
      </BrowserRouter>
    </div>
  );
}
