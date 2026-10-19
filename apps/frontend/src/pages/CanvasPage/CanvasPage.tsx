import { useNavigate, useParams } from 'react-router-dom';
import { SidebarProvider } from '@/components/ui/sidebar';
import 'tldraw/tldraw.css';
import { RouteError } from '@/pages/route-error';
import { CanvasShell } from './CanvasShell';
import { useChapterLoader } from '@/hooks/canvas/use-chapter-loader';

/** Route: '/chapters/:chapterId'. Loads the chapter and its notebook (and the
 *  UI preset the chapter was created with), then mounts the canvas shell.
 *  Deep-link entry params ('topic', 'v') come from the search string and are
 *  written back as the camera moves. */
export function CanvasPage() {
  const { chapterId } = useParams();
  const navigate = useNavigate();
  const { loaded, error } = useChapterLoader(chapterId);

  if (error) {
    return (
      <RouteError
        title="Chapter not found"
        message={error}
        onBack={() => navigate('/')}
        backLabel="Back to notebooks"
      />
    );
  }
  if (!loaded) {
    return <div className="flex h-screen items-center justify-center text-muted-foreground">Loading…</div>;
  }
  // the provider must wrap the shell: CanvasShell reads useSidebar to re-fit
  // the sheets when the sidebar toggles
  return (
    <SidebarProvider>
      <CanvasShell key={loaded.chapter.id} notebook={loaded.notebook} chapter={loaded.chapter} />
    </SidebarProvider>
  );
}
