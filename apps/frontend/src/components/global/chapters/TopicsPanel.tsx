import { useNavigate } from 'react-router-dom';
import { MoreVertical, PanelLeftOpen, Plus } from 'lucide-react';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { timeAgo } from '@/lib/canvas';
import { CanvasTypeIcon } from './CanvasTypeIcon';
import { Empty, EmptyContent, EmptyHeader, EmptyMedia, EmptyTitle, EmptyDescription } from '@/components/ui/empty';
import type { Chapter, Topic } from '@/lib/ipc';

/** The right column of the notebook screen: the chapter's topic list. The
 *  header block (h-20) holds the chapter name + meta and the ghost "New
 *  topic"; rows are h-11 with the same reserved number/timestamp/menu slots
 *  on every row. */
export function TopicsPanel({
  chapter,
  topics,
  chapterIndex,
  hasSearch,
  noChapters,
  onCreateTopic,
  onRenameTopic,
  onDeleteTopic,
  collapsed,
  onExpand,
}: {
  chapter: Chapter | null;
  topics: Topic[] | null;
  chapterIndex: number;
  hasSearch: boolean;
  noChapters: boolean;
  onCreateTopic: () => void;
  onRenameTopic: (topic: Topic) => void;
  onDeleteTopic: (topic: Topic) => void;
  /** Presentational sidebar state owned by the page. */
  collapsed?: boolean;
  onExpand?: () => void;
}) {
  const navigate = useNavigate();

  if (!chapter) {
    return (
      <section className="flex min-w-0 flex-1 items-center justify-center py-24">
        <Empty className="max-w-xs border-none bg-transparent p-4">
          <EmptyHeader>
            <EmptyMedia variant="icon">
              <PanelLeftOpen strokeWidth={1.5} />
            </EmptyMedia>
            <EmptyTitle>{noChapters ? 'No chapters yet' : 'Select a chapter'}</EmptyTitle>
            <EmptyDescription>
              {noChapters
                ? 'Create one to open your first canvas.'
                : 'Pick a chapter on the left to see its topics.'}
            </EmptyDescription>
          </EmptyHeader>
        </Empty>
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
            <div className="flex min-w-0 pl-2 items-center gap-1.5">
              <div className="bg-canvas border rounded-full p-1 flex items-center justify-center">
                <CanvasTypeIcon type={chapter.canvas_type} className='text-primary'  />

              </div>
              <h2 className="truncate text-[16px] font-medium leading-snug tracking-[-0.01em] text-fg-1">
                {chapter.name}
              </h2>
            </div>
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
            <Empty className="p-6">
              <EmptyHeader>
                <EmptyTitle>{hasSearch ? 'No topics match' : 'No topics yet'}</EmptyTitle>
                <EmptyDescription>
                  {hasSearch ? 'Try a different search.' : 'Topics are the pages of this canvas.'}
                </EmptyDescription>
              </EmptyHeader>
              {!hasSearch && (
                <EmptyContent>
                  <button
                    onClick={onCreateTopic}
                    className="inline-flex h-8 items-center gap-1.5 rounded-lg px-2.5 text-sm text-fg-2 transition-colors duration-150 hover:bg-white/[0.04] hover:text-fg-1"
                  >
                    <Plus className="h-3.5 w-3.5" strokeWidth={1.5} /> New topic
                  </button>
                </EmptyContent>
              )}
            </Empty>
          </div>
        )}
        {topics?.map((topic, i) => {
          const openTopic = () => navigate(`/chapters/${chapter.id}?topic=${topic.id}`);
          return (
            <div
              key={topic.id}
              role="button"
              tabIndex={0}
              title={topic.name}
              onClick={openTopic}
              onKeyDown={(e) => {
                if (e.key === 'Enter' || e.key === ' ') {
                  e.preventDefault();
                  openTopic();
                }
              }}
              className="group flex h-11 w-full cursor-pointer items-center gap-3 rounded-lg px-3 text-left transition-colors duration-150 hover:bg-white/[0.03] focus-visible:bg-white/[0.03]"
            >
              <span className="w-12 shrink-0 text-xs text-fg-3 tabular-nums">
                {chapterIndex + 1}.{i + 1}
              </span>
              <span className="min-w-0 flex-1 truncate text-sm text-fg-1">{topic.name}</span>
              <span className="w-14 shrink-0 text-right text-xs text-fg-3 tabular-nums">
                {timeAgo(topic.updated_at)}
              </span>
              {/* ⋯ menu: reserved slot, revealed on hover/focus like the
                  chapter rows; the row itself still opens the topic */}
              <span
                className="grid h-7 w-7 shrink-0 place-items-center opacity-0 transition-opacity duration-100 group-hover:opacity-100 group-focus-within:opacity-100"
                onClick={(e) => e.stopPropagation()}
                onKeyDown={(e) => e.stopPropagation()}
              >
                <DropdownMenu>
                  <DropdownMenuTrigger
                    render={
                      <button
                        aria-label={`Options for ${topic.name}`}
                        title="Topic options"
                        className="flex h-7 w-7 items-center justify-center rounded-lg text-fg-3 transition-colors duration-150 hover:bg-white/[0.04] hover:text-fg-1"
                      >
                        <MoreVertical className="h-3.5 w-3.5" strokeWidth={1.5} />
                      </button>
                    }
                  />
                  <DropdownMenuContent
                    align="end"
                    className="w-40 rounded-lg border border-white/[0.08] bg-[#0F0F12] p-1"
                  >
                    <DropdownMenuItem
                      onClick={() => onRenameTopic(topic)}
                      className="h-8 rounded-md hover:bg-white/[0.04] text-[13px]"
                    >
                      Rename
                    </DropdownMenuItem>
                    <DropdownMenuItem
                      variant="destructive"
                      onClick={() => onDeleteTopic(topic)}
                      className="h-8 rounded-md text-[13px]"
                    >
                      Delete
                    </DropdownMenuItem>
                  </DropdownMenuContent>
                </DropdownMenu>
              </span>
            </div>
          );
        })}
      </div>
    </section>
  );
}
