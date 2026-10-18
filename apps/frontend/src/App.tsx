import { useEffect } from 'react';
import { BrowserRouter, Navigate, Route, Routes, useNavigate, useParams } from 'react-router-dom';
import { api } from '@/lib/ipc';
import { NotebooksPage } from '@/pages/NotebooksPage';
import { ChaptersPage } from '@/pages/ChaptersPage';
import { CanvasPage } from '@/pages/CanvasPage';
import { SettingsPage } from '@/pages/SettingsPage';
import { BackupPage } from '@/pages/BackupPage';
import { PresetEditorPage } from '@/pages/PresetEditorPage';
import { RouteError } from '@/pages/route-error';

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
        <Routes>
          <Route path="/" element={<NotebooksPage />} />
          <Route path="/notebooks/:notebookId" element={<ChaptersPage />} />
          <Route path="/chapters/:chapterId" element={<CanvasPage />} />
          <Route path="/t/:topicId" element={<TopicDeepLink />} />
          <Route path="/broken-link" element={<BrokenLink />} />
          <Route path="/settings" element={<SettingsPage />} />
          <Route path="/settings/backup" element={<BackupPage />} />
          <Route path="/settings/presets/:presetId" element={<PresetEditorPage />} />
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </BrowserRouter>
    </div>
  );
}
