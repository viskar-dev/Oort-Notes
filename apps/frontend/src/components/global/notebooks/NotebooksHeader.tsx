import { Plus } from 'lucide-react';
import { APP_CONTAINER } from '@/components/layout/workspace-layout';

/** Home page header: title + counters and the "New notebook" action. */
export function NotebooksHeader({
  loaded,
  notebookCount,
  chapterCount,
  onCreate,
}: {
  loaded: boolean;
  notebookCount: number;
  chapterCount: number;
  onCreate: () => void;
}) {
  return (
    <div className={APP_CONTAINER}>
      <div className="flex items-center justify-between pt-12">
        <div>
          <h1 className="text-[32px] font-semibold leading-tight tracking-tight text-[#f4f4f6]">
            Notebooks
          </h1>
          <p className="mt-1 text-sm text-[#8b8a96]">
            {loaded
              ? `${notebookCount} ${notebookCount === 1 ? 'notebook' : 'notebooks'} · ${chapterCount} ${chapterCount === 1 ? 'chapter' : 'chapters'}`
              : 'Loading…'}
          </p>
        </div>
        <button
          onClick={onCreate}
          className="inline-flex h-10 items-center gap-2 rounded-[10px] bg-[#7c6ee6] px-4 text-sm font-medium text-white transition-colors hover:bg-[#8b7ff0] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#7c6ee6] focus-visible:ring-offset-2 focus-visible:ring-offset-[#060608]"
        >
          <Plus className="h-4 w-4" /> New notebook
        </button>
      </div>
    </div>
  );
}
