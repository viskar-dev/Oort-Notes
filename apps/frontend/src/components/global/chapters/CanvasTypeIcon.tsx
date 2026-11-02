import { FileText, Infinity as InfinityIcon, Rows3 } from 'lucide-react';
import type { CanvasType } from '@/lib/ipc';

/** A tiny, dim type chip for a chapter's canvas mode: page / infinite /
 *  scroll. Deliberately quiet — fg-3 at reduced opacity, no color fill. */
export function CanvasTypeIcon({ type, className }: { type: CanvasType; className?: string }) {
  const Icon = type === 'page' ? FileText : type === 'infinite' ? InfinityIcon : Rows3;
  const label = type === 'page' ? 'Page canvas' : type === 'infinite' ? 'Infinite canvas' : 'Scroll canvas';
  return (
    <span
      role="img"
      aria-label={label}
      title={label}
      className={`shrink-0 text-fg-3 opacity-70 ${className ?? ''}`}
    >
      <Icon className="h-3 w-3" strokeWidth={1.75} />
    </span>
  );
}
