import type { ReactElement } from 'react';
import { MoreVertical } from 'lucide-react';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';

export const TOPIC_RENAME = 'rename';
export const TOPIC_DUPLICATE = 'duplicate';
export const TOPIC_DELETE = 'delete';

export type TopicMenuAction =
  | typeof TOPIC_RENAME
  | typeof TOPIC_DUPLICATE
  | typeof TOPIC_DELETE;

interface TopicMenuProps {
  canDelete: boolean;
  onSelect: (action: TopicMenuAction) => void;
  /** Optional custom trigger element; defaults to the "⋯" kebab icon. */
  children?: ReactElement;
}

/** The tldraw-style dropdown for a topic: rename, duplicate, delete. */
export function TopicMenu({ canDelete, onSelect, children }: TopicMenuProps) {
  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        render={
          children ?? (
            <button
              title="Topic options"
              className="rounded-md p-1 text-faint transition-colors hover:bg-raised hover:text-ink"
            >
              <MoreVertical className="h-4 w-4" />
            </button>
          )
        }
      />
      <DropdownMenuContent align="start" className="w-44">
        <DropdownMenuItem onClick={() => onSelect(TOPIC_RENAME)}>
          Rename
        </DropdownMenuItem>
        <DropdownMenuItem onClick={() => onSelect(TOPIC_DUPLICATE)}>
          Duplicate
        </DropdownMenuItem>
        <DropdownMenuItem
          variant="destructive"
          disabled={!canDelete}
          onClick={() => canDelete && onSelect(TOPIC_DELETE)}
        >
          Delete
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
