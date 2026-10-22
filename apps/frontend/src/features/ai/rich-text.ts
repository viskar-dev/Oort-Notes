/**
 * Shape-label reading. tldraw 3.x stores every label (text shapes, geo
 * outlines, notes) as tiptap rich text JSON under `props.richText`. The AI
 * reads canvas content as plain text, so this walks the tiptap structure and
 * collects it: leaf `text` runs joined per block, blocks separated by
 * newlines. Writes go the other way through tldraw's `toRichText`.
 */

/** Collect `text` runs from a tiptap doc/paragraph/heading node into lines. */
function collect(node: unknown, lines: string[], current: string): string {
  if (node == null) return current;
  if (typeof node === 'string') return current + node;
  if (Array.isArray(node)) {
    let acc = current;
    for (const child of node) acc = collect(child, lines, acc);
    return acc;
  }
  if (typeof node !== 'object') return current;
  const record = node as Record<string, unknown>;
  if ('text' in record) {
    const text = record.text as unknown;
    if (typeof text === 'string') return current + text;
  }
  if (record.type === 'hardBreak') {
    // tiptap renders an explicit line break inside a block.
    return flush(lines, current);
  }
  if ('content' in record) {
    // Block-level nodes (paragraph/heading/…) start a new line.
    const isBlock =
      typeof record.type === 'string' &&
      !record.type.endsWith('Inline') &&
      record.type !== 'blockquote' &&
      record.type !== 'listItem' &&
      record.type !== 'bulletList' &&
      record.type !== 'orderedList';
    let acc = isBlock ? flush(lines, current) : current;
    acc = collect(record.content, lines, acc);
    return isBlock ? flush(lines, acc) : acc;
  }
  return current;
}

function flush(lines: string[], current: string): string {
  if (current.length > 0) lines.push(current);
  return '';
}

/** Tiptyap rich text JSON → the text the user actually sees. */
export function richTextToPlainText(richText: unknown): string {
  const lines: string[] = [];
  const rest = collect(richText, lines, '');
  return [...lines, rest].filter((line) => line.length > 0).join('\n');
}

/** A shape's label from its props: rich text first, legacy plain `text`
 *  second (arrows keep a plain `text` prop in tldraw 3). */
export function labelFromProps(props: Record<string, unknown> | undefined): string | undefined {
  if (!props) return undefined;
  if ('richText' in props) {
    const text = richTextToPlainText(props.richText);
    return text.length > 0 ? text : undefined;
  }
  if (typeof props.text === 'string' && props.text.length > 0) return props.text;
  return undefined;
}
