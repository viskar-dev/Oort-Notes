import type { Editor as TiptapEditor } from '@tiptap/core';
import type { Editor as TldrawEditor } from 'tldraw';

/**
 * Which tldraw canvas owns a shape label's rich text editor.
 *
 * The math paste hook only sees the label's tiptap editor, but "paste makes
 * the shape fit its content, not the other way round" (the expandable-not-
 * shrinkable rule) needs the owning tldraw editor to normalize the shape's
 * scale and auto-size after wide KaTeX content lands. `rich-text-setup`
 * registers the pair when the label editor mounts.
 */
export const labelOwners = new WeakMap<TiptapEditor, TldrawEditor>();
