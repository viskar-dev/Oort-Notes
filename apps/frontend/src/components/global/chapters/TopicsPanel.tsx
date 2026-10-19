import { useNavigate } from 'react-router-dom';
import { ChevronRight, Infinity as InfinityIcon, FileText, Plus } from 'lucide-react';
import { CANVAS_TYPE_LABEL } from '@/constants/chapters/canvas-types';
import { timeAgo } from '@/lib/canvas';
import type { Chapter, Topic } from '@/lib/ipc';

/** The main panel for the selected chapter: header with its canvas-type
 *  badge and "New topic", then the topic list. */
export function TopicsPanel({
  chapter,
  topics,
  chapterIndex,
  hasSearch,
  noChapters,
  onCreateTopic,
}: {
  chapter: Chapter | null;
  topics: Topic[] | null;
  chapterIndex: number;
  hasSearch: boolean;
  noChapters: boolean;
  onCreateTopic: () => void;
}) {
  const navigate = useNavigate();

  if (!chapter) {
    return (
      <section className="min-w-0 flex-1 rounded-xl border border-[#24232c] bg-[#111016]">
        <div className="flex h-full min-h-[420px] items-center justify-center text-sm text-[#8b8a96]">
          {noChapters ? 'Create a chapter to get started' : 'Select a chapter'}
        </div>
      </section>
    );
  }

  return (
    <section className="min-w-0 flex-1 rounded-xl border border-[#24232c] bg-[#111016]">
      <div className="flex items-center justify-between border-b border-[#24232c] px-6 py-4">
        <div className="min-w-0">
          <div className="flex items-center gap-2.5">
            <h2 className="truncate text-[22px] font-semibold leading-tight tracking-tight text-[#f4f4f6]">
              {chapter.name}
            </h2>
            <span className="flex h-[22px] shrink-0 items-center gap-1 rounded-md border border-[#24232c] bg-[#17161c] px-2 text-[11px] text-[#a09fab]">
              {chapter.canvas_type === 'infinite' ? (
                <InfinityIcon className="h-3 w-3" />
              ) : (
                <FileText className="h-3 w-3" />
              )}
              {CANVAS_TYPE_LABEL[chapter.canvas_type]}
            </span>
          </div>
          <p className="mt-0.5 text-[13px] text-[#8b8a96]">
            {chapter.topics_count} {chapter.topics_count === 1 ? 'topic' : 'topics'} · Edited{' '}
            {timeAgo(chapter.updated_at)}
          </p>
        </div>
        <div className="flex shrink-0 items-center gap-2">
          <button
            onClick={onCreateTopic}
            className="inline-flex h-9 items-center gap-2 rounded-[10px] bg-[#7c6ee6] px-3.5 text-[13px] font-medium text-white transition-colors hover:bg-[#8b7ff0] shadow-[inset_0_1px_0_rgba(255,255,255,0.28),inset_0_-1px_0_rgba(0,0,0,0.22),0_1px_2px_rgba(6,6,8,0.45),0_4px_14px_-2px_rgba(124,110,230,0.45)] ring-1 ring-inset ring-white/10 active:shadow-[inset_0_1px_2px_rgba(0,0,0,0.25),0_1px_2px_rgba(6,6,8,0.4)] active:translate-y-px"
          >
            <Plus className="h-4 w-4" /> New topic
          </button>
        </div>
      </div>

      <div>
        {topics === null && <p className="px-6 py-6 text-sm text-[#8b8a96]">Loading…</p>}
        {topics?.length === 0 && (
          <p className="px-6 py-6 text-sm text-[#8b8a96]">
            {hasSearch ? 'No topics match' : 'No topics yet — create one to start writing.'}
          </p>
        )}
        {topics?.map((topic, i) => (
          <button
            key={topic.id}
            onClick={() => navigate(`/chapters/${chapter.id}?topic=${topic.id}`)}
            className="group flex h-12 w-full items-center gap-3 border-b border-[#1c1b22] px-6 text-left transition-colors last:border-b-0 hover:bg-[#17161c]"
          >
            <span className="w-8 text-[11px] text-[#8b8a96]">
              {chapterIndex + 1}.{i + 1}
            </span>
            <span className="flex-1 truncate text-[13px] font-medium text-[#f4f4f6]">
              {topic.name}
            </span>
            <span className="text-[13px] text-[#8b8a96]">
              Edited {timeAgo(topic.updated_at)}
            </span>
            <ChevronRight className="h-4 w-4 text-[#6c6c78] transition-colors group-hover:text-[#a09fab]" />
          </button>
        ))}
      </div>
    </section>
  );
}
