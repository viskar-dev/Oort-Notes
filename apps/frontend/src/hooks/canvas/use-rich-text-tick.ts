import { useEffect, useState } from 'react';
import type { Editor as TiptapEditor } from '@tiptap/core';

/**
 * Re-render on every rich-text transaction/selection change: word colours
 * live in the ProseMirror document, which is invisible to tldraw's reactive
 * `track`, so the toolbars need their own render tick. Shared by the rich
 * text toolbar and the contextual style panel (previously two copies that
 * could drift apart).
 */
export function useRichTextTick(textEditor: TiptapEditor | null | undefined): number {
  const [tick, setTick] = useState(0);

  useEffect(() => {
    if (!textEditor || textEditor.isDestroyed) return;
    const force = () => setTick((t) => t + 1);
    textEditor.on('transaction', force);
    textEditor.on('selectionUpdate', force);
    return () => {
      textEditor.off('transaction', force);
      textEditor.off('selectionUpdate', force);
    };
  }, [textEditor]);

  return tick;
}
