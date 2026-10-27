import { Plus } from 'lucide-react';
import { HOME_CONTAINER } from '@/components/layout/workspace-layout';

/** Home page header: title + counters and the ghost "New notebook" action. */
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
    <div className={HOME_CONTAINER}>
      <div className="flex items-center justify-between pt-20 pb-6">
        <div>
          <h1 className="text-[28px] font-semibold leading-[1.1] tracking-[-0.02em] text-fg-1">
            Notebooks
          </h1>
          <p className="mt-2 text-[13px] text-fg-3 tabular-nums">
            {loaded
              ? `${notebookCount} ${notebookCount === 1 ? 'notebook' : 'notebooks'} · ${chapterCount} ${chapterCount === 1 ? 'chapter' : 'chapters'}`
              : 'Loading…'}
          </p>
        </div>
        <button
          onClick={onCreate}
          className="inline-flex h-8 items-center gap-1.5 rounded-lg px-2.5 text-sm text-iris transition-colors duration-150 hover:bg-white/[0.04]"
        >
          <Plus className="h-3.5 w-3.5 " strokeWidth={1.5} aria-hidden /> New notebook
        </button>
      </div>
    </div>
  );
}
