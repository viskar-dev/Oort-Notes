import { useNavigate } from 'react-router-dom';
import { ChevronRight, PanelLeftOpen, Plus } from 'lucide-react';
import { timeAgo } from '@/lib/canvas';
import type { Chapter, Topic } from '@/lib/ipc';

/** The right column of the notebook screen: the chapter's topic list. The
 *  header block (h-20) holds the chapter name + meta and the ghost "New
 *  topic"; rows are h-11 with the same reserved number/timestamp/chevron
 *  slots on every row. */
export function TopicsPanel({
  chapter,
  topics,
  chapterIndex,
  hasSearch,
  noChapters,
  onCreateTopic,
  collapsed,
  onExpand,
}: {
  chapter: Chapter | null;
  topics: Topic[] | null;
  chapterIndex: number;
  hasSearch: boolean;
  noChapters: boolean;
  onCreateTopic: () => void;
  /** Presentational sidebar state owned by the page. */
  collapsed?: boolean;
  onExpand?: () => void;
}) {
  const navigate = useNavigate();

  if (!chapter) {
    return (
      <section className="flex min-w-0 flex-1 items-center justify-center py-40 text-sm text-fg-3">
        {noChapters ? 'No chapters yet' : 'Select a chapter'}
      </section>
    );
  }

  return (
    <section className="min-w-0">
      {/* header block: same h-20 as the chapters column so first rows align */}
      <div className="flex h-20 items-center justify-between">
        <div className="flex min-w-0 items-center gap-2">
          {collapsed && onExpand && (
            <button
              onClick={onExpand}
              aria-label="Expand sidebar"
              title="Expand sidebar"
              className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg text-fg-3 transition-colors duration-150 hover:bg-white/[0.04] hover:text-fg-1"
            >
              <PanelLeftOpen className="h-3.5 w-3.5" strokeWidth={1.5} />
            </button>
          )}
          <div className="min-w-0">
            <h2 className="truncate text-[16px] font-medium leading-snug tracking-[-0.01em] text-fg-1">
              {chapter.name}
            </h2>
            {/*<p className="mt-0.5 text-[13px] text-fg-3 tabular-nums">
              {chapter.topics_count} {chapter.topics_count === 1 ? 'topic' : 'topics'} · edited{' '}
              {timeAgo(chapter.updated_at)}
            </p>*/}
          </div>
        </div>
        <button
          onClick={onCreateTopic}
          aria-label="New topic"
          className="inline-flex h-8 shrink-0 items-center gap-1.5 rounded-lg px-2.5 text-sm text-iris transition-colors duration-150 hover:bg-white/[0.04]"
        >
          <Plus className="h-3.5 w-3.5" strokeWidth={1.5} /> New topic
        </button>
      </div>

      <div className="pb-24 pt-4">
        {topics === null && <p className="px-3 pt-4 text-sm text-fg-3">Loading…</p>}
        {topics?.length === 0 && (
          <div className="pt-4">
            <div className="flex h-11 items-center gap-3 px-3 text-sm text-fg-3">
              {hasSearch ? 'No topics match' : 'No topics yet'}
            </div>
            {!hasSearch && (
              <button
                onClick={onCreateTopic}
                className="mt-2 ml-3 inline-flex h-8 items-center gap-1.5 rounded-lg px-2.5 text-sm text-iris transition-colors duration-150 hover:bg-white/[0.04]"
              >
                <Plus className="h-3.5 w-3.5" strokeWidth={1.5} /> New topic
              </button>
            )}
          </div>
        )}
        {topics?.map((topic, i) => (
          <button
            key={topic.id}
            onClick={() => navigate(`/chapters/${chapter.id}?topic=${topic.id}`)}
            className="group flex h-11 w-full items-center gap-3 rounded-lg px-3 text-left transition-colors duration-150 hover:bg-white/[0.03] focus-visible:bg-white/[0.03]"
          >
            <span className="w-12 shrink-0 text-xs text-fg-3 tabular-nums">
              {chapterIndex + 1}.{i + 1}
            </span>
            <span className="min-w-0 flex-1 truncate text-sm text-fg-1">{topic.name}</span>
            <span className="w-14 shrink-0 text-right text-xs text-fg-3 tabular-nums">
              {timeAgo(topic.updated_at)}
            </span>
            {/* chevron: reserved w-4 slot, slides 2px into place on hover */}
            <span className="w-4 shrink-0">
              <ChevronRight
                className="h-3.5 w-3.5 text-fg-3 opacity-0 -translate-x-0.5 transition-all duration-150 group-hover:translate-x-0 group-hover:opacity-100"
                strokeWidth={1.5}
              />
            </span>
          </button>
        ))}
      </div>
    </section>
  );
}
