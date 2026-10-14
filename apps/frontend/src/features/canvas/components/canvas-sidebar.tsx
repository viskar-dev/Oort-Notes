import {
  Sidebar,
  SidebarContent,
  SidebarGroup,
  SidebarGroupAction,
  SidebarGroupContent,
  SidebarGroupLabel,
  SidebarHeader,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarSeparator,
} from '@/components/ui/sidebar';
import {
  TopicMenu,
  type TopicMenuAction,
} from '@/features/canvas/components/topic-menu';
import type { Notebook, Topic } from '@/lib/ipc';
import { Clock, FileText, Plus, Search, Sparkle, SquarePen } from 'lucide-react';

interface RecentItem {
  id: string;
  name: string;
  time: string; // e.g. "2h", "1d"
}

interface CanvasSidebarProps {
  notebook: Notebook;
  topics: Topic[];
  recent?: RecentItem[];
  activeTopicId: string | null;
  canDeleteTopic: boolean;
  onSelectTopic: (topic: Topic) => void;
  onSelectRecent?: (item: RecentItem) => void;
  onCreateTopic: () => void;
  onTopicAction: (topic: Topic, action: TopicMenuAction) => void;
  onSearch?: () => void;
  onBack: () => void;
}

export function CanvasSidebar({
  topics,
  recent = [],
  activeTopicId,
  canDeleteTopic,
  onSelectTopic,
  onSelectRecent,
  onCreateTopic,
  onTopicAction,
  onSearch,
  onBack,
}: CanvasSidebarProps) {
  return (
    <Sidebar collapsible="offcanvas">
      <SidebarHeader className="gap-4 p-4">
        {/* Brand + edit button */}
        <div className="flex items-center justify-between">
          <button onClick={onBack} className="flex items-center gap-2">
            <Sparkle className="size-6 fill-current text-primary" />
            <span className="text-xl font-semibold">Oort</span>
          </button>
          <button
            onClick={onCreateTopic}
            className="flex size-9 items-center justify-center rounded-lg bg-primary text-primary-foreground transition-opacity hover:opacity-85"
          >
            <SquarePen className="size-4" />
          </button>
        </div>

        {/* Search */}
        <button
          onClick={onSearch}
          className="flex h-11 w-full items-center gap-2 rounded-lg border px-3 text-left text-sm text-muted-foreground transition-colors hover:text-foreground"
        >
          <Search className="size-4" />
          <span className="flex-1">Search</span>
          <kbd className="rounded-md border px-1.5 py-0.5 text-xs">⌘ K</kbd>
        </button>
      </SidebarHeader>

      <SidebarContent className="px-2">
        {/* Recent */}
        <SidebarGroup>
          <SidebarGroupLabel>Recent</SidebarGroupLabel>
          <SidebarGroupContent>
            <SidebarMenu>
              {recent.map((item) => (
                <SidebarMenuItem key={item.id}>
                  <SidebarMenuButton onClick={() => onSelectRecent?.(item)}>
                    <Clock />
                    <span className="flex-1 truncate">{item.name}</span>
                    <span className="text-xs text-muted-foreground">{item.time}</span>
                  </SidebarMenuButton>
                </SidebarMenuItem>
              ))}
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>

        <SidebarSeparator className="mx-0" />

        {/* Topics */}
        <SidebarGroup>
          <SidebarGroupLabel>Topics</SidebarGroupLabel>
          <SidebarGroupAction
            onClick={onCreateTopic}
            title="New topic"
            className="size-7 rounded-full bg-sidebar-accent"
          >
            <Plus />
          </SidebarGroupAction>
          <SidebarGroupContent>
            <SidebarMenu>
              {topics.map((topic) => {
                const active = topic.id === activeTopicId;
                return (
                  <SidebarMenuItem key={topic.id} className="group/topic relative">
                    <SidebarMenuButton
                      isActive={active}
                      onClick={() => onSelectTopic(topic)}
                      className={
                        active
                          ? 'relative before:absolute before:-left-2 before:top-0 before:h-full before:w-1 before:rounded-full before:bg-primary'
                          : ''
                      }
                    >
                      <FileText />
                      <span className="flex-1 truncate">{topic.name}</span>
                      {/* adjust field name to match your Topic type */}
                      <span className="text-xs text-muted-foreground group-hover/topic:invisible">
                        {(topic as any).count ?? 0}
                      </span>
                    </SidebarMenuButton>
                    <div className="absolute right-1.5 top-1/2 -translate-y-1/2 opacity-0 transition-opacity group-hover/topic:opacity-100">
                      <TopicMenu
                        canDelete={canDeleteTopic}
                        onSelect={(action) => onTopicAction(topic, action)}
                      />
                    </div>
                  </SidebarMenuItem>
                );
              })}
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>
      </SidebarContent>
    </Sidebar>
  );
}
