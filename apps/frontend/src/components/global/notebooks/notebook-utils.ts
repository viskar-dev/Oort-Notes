/** Notebook flattering answers shared by the list row and the grid card:
 *  the relative timestamp and the per-notebook accent strength that used to
 *  vary the book spine. */

/** "7h ago"-style relative time for a row/card's right edge. */
export function timeAgo(ts: number | null): string {
  if (!ts) return 'never';
  const s = Math.floor((Date.now() - ts) / 1000);
  const m = Math.floor(s / 60);
  if (m < 1) return 'just now';
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ago`;
  const d = Math.floor(h / 24);
  if (d < 7) return `${d}d ago`;
  if (d < 30) return `${Math.floor(d / 7)}w ago`;
  return `${Math.floor(d / 30)}mo ago`;
}

/** deterministic accent opacity from the notebook id (kept from the spine) */
export function accentOpacity(id: string): number {
  let hash = 0;
  for (let i = 0; i < id.length; i++) hash = (hash * 31 + id.charCodeAt(i)) | 0;
  return [1, 0.7, 0.5, 0.35][Math.abs(hash) % 4];
}

/** "2 chapters · 2 topics" meta line under a notebook name. */
export function countLine(chapters: number, topics: number): string {
  return chapters === 0 && topics === 0
    ? 'No chapters yet'
    : `${chapters} ${chapters === 1 ? 'chapter' : 'chapters'} · ${topics} ${topics === 1 ? 'topic' : 'topics'}`;
}
