import type { LucideIcon } from 'lucide-react';
import {
  ArrowUpRight,
  Blocks,
  Eraser,
  Frame,
  Hand,
  Highlighter,
  Image as ImageIcon,
  Minus,
  MousePointer2,
  Pencil,
  RadioTower,
  Square,
  StickyNote,
  Type,
} from 'lucide-react';
import type { ToolId } from './catalog';

/** Toolbar/menu icon per tool id, shared by the editor tabs and the canvas
 *  preset toolbar. */
export const TOOL_ICONS: Record<ToolId, LucideIcon> = {
  select: MousePointer2,
  hand: Hand,
  draw: Pencil,
  eraser: Eraser,
  arrow: ArrowUpRight,
  text: Type,
  note: StickyNote,
  image: ImageIcon,
  shape: Square,
  line: Minus,
  highlight: Highlighter,
  laser: RadioTower,
  frame: Frame,
  components: Blocks,
};
