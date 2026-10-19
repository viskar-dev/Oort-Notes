import {
  Atom,
  BookOpen,
  Brain,
  Code2,
  Globe,
  Languages,
  type LucideIcon,
  PenLine,
  Sigma,
} from 'lucide-react';

/** Emblem map: notebook.icon -> monochrome Lucide icon (fallback BookOpen,
 *  chosen by `emblem()` below). */
export const EMBLEMS: Record<string, LucideIcon> = {
  atom: Atom,
  code: Code2,
  brain: Brain,
  globe: Globe,
  languages: Languages,
  sigma: Sigma,
  book: BookOpen,
  pen: PenLine,
};

/** Resolve a notebook's emblem icon component, falling back to BookOpen. */
export function emblem(icon: string | null): LucideIcon {
  return (icon && EMBLEMS[icon.toLowerCase()]) || BookOpen;
}
