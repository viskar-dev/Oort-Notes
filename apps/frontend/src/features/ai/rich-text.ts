/**
 * Shape-label reading and AI-text writing. tldraw 3.x stores every label
 * (text shapes, geo outlines, notes) as tiptap rich text JSON under
 * `props.richText`. The AI reads canvas content as plain text, so this walks
 * the tiptap structure and collects it: leaf `text` runs joined per block,
 * blocks separated by newlines. Writes go the other way through
 * `buildRichDocument`, which turns the model's light markdown (lists, bold,
 * italic, code, $math$) into the same tiptap structure.
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
  if (record.type === 'math') {
    // KaTeX node: reprsent as the $ delimiters the user typed / could type.
    const latex = typeof record.attrs === 'object' && record.attrs !== null
      ? String((record.attrs as Record<string, unknown>).latex ?? '')
      : '';
    const display = Boolean((record.attrs as Record<string, unknown> | undefined)?.display);
    return current + (display ? `$$${latex}$$` : `$${latex}$`);
  }
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

// ---------------------------------------------------------------------------
// writing: light markdown → tiptap JSON
// ---------------------------------------------------------------------------

type JsonNode = { type: string; attrs?: Record<string, unknown>; content?: JsonNode[]; text?: string; marks?: { type: string }[] };

/** The math node the MathInline tiptap extension defines (type `math`). */
const mathNode = (latex: string, display: boolean): JsonNode => ({
  type: 'math',
  attrs: { latex, display },
});

type InlineSeq = JsonNode[];

/** Text run with optional tldraw-recognized marks (bold / italic / code).
 *  Empty runs are dropped: tldraw's rich-text validator rejects "" text
 *  nodes ("Empty text nodes."). */
function run(text: string, marks?: { type: string }[]): JsonNode | null {
  if (text.length === 0) return null;
  return { type: 'text', text, ...(marks ? { marks } : {}) };
}

/** Find math segments then markdown styles inside plain spans. */
function inlineRuns(text: string): InlineSeq {
  const MATH =
    /\$\$([^$\n]+?)\$\$|\\\[([^\\\n]+?)\\\]|\\\(([^\\\n]+?)\\\)|\$([^$\n]+?)\$/g;
  const nodes: InlineSeq = [];
  let last = 0;
  for (let m = MATH.exec(text); m !== null; m = MATH.exec(text)) {
    pushStyled(nodes, text.slice(last, m.index));
    const latex = (m[1] ?? m[2] ?? m[3] ?? m[4] ?? '').trim();
    const display = latex.length > 0 && (m[1] !== undefined || m[2] !== undefined);
    nodes.push(mathNode(latex, display));
    last = m.index + m[0].length;
  }
  pushStyled(nodes, text.slice(last));
  return nodes;
}

/** Markdown-lite styling of a plain span: **bold**, `code`, *italic* (first
 *  match wins at each position; no nesting). */
function pushStyled(out: InlineSeq, text: string): void {
  const STYLE = /(\*\*|__)([^\n]+?)\1|`([^`\n]+?)`|(?<![*\w])\*([^\n*]+?)\*(?![*\w])/g;
  let last = 0;
  for (let m = STYLE.exec(text); m !== null; m = STYLE.exec(text)) {
    push(out, run(text.slice(last, m.index)));
    if (m[2] !== undefined) push(out, run(m[2], [{ type: 'bold' }]));
    else if (m[3] !== undefined) push(out, run(m[3], [{ type: 'code' }]));
    else if (m[4] !== undefined) push(out, run(m[4], [{ type: 'italic' }]));
    last = m.index + m[0].length;
  }
  push(out, run(text.slice(last)));
}

const push = (out: InlineSeq, node: JsonNode | null) => {
  if (node) out.push(node);
};

const LIST_ITEM = /^\s*(-|\*|•)\s+/;
const ORDERED_ITEM = /^\s*(\d{1,3})[.)]\s+/;

/** An inline sequence wrapped as a paragraph (or a bare paragraph when all
 *  content collapsed — never an array containing an empty text node). */
function paragraph(line: string): JsonNode {
  const content = inlineRuns(line);
  return content.length > 0 ? { type: 'paragraph', content } : { type: 'paragraph' };
}

/** Build one block segment from a plain line; the caller merges consecutive
 *  list lines. */
function listBlock(line: string, ordered: boolean): JsonNode {
  const body = ordered ? line.replace(ORDERED_ITEM, '') : line.replace(LIST_ITEM, '');
  return { type: 'listItem', content: [paragraph(body)] };
}

/** The model's light markdown → a tiptap document JSON for `props.richText`.
 *  Supports: empty lines = paragraph split, '- '/'* ' bullets, '1. ' ordered
 *  lists, $inline math$, $$display math$$, \(..\), \[..\], **bold**,
 *  *italic*, `code`. Deliberately NOT a full markdown parser: unknown
 *  syntax passes through verbatim. */
export function buildRichDocument(text: string): JsonNode {
  const content: JsonNode[] = [];
  let pending: { ordered: boolean; items: JsonNode[] } | null = null;

  const flushList = () => {
    if (!pending) return;
    content.push({
      type: pending.ordered ? 'orderedList' : 'bulletList',
      content: pending.items,
    });
    pending = null;
  };

  for (const rawLine of text.replace(/\r\n?/g, '\n').split('\n')) {
    const line = rawLine.trimEnd();
    if (line.trim().length === 0) {
      flushList();
      // Blank line = explicit paragraph break; empty paragraphs are dropped.
      continue;
    }
    const ordered = ORDERED_ITEM.test(line) ? true : false;
    const bullet = ordered ? false : LIST_ITEM.test(line);
    if (ordered || bullet) {
      if (pending && pending.ordered !== ordered) flushList();
      pending ??= { ordered, items: [] };
      pending.items.push(listBlock(line, ordered));
      continue;
    }
    flushList();
    content.push(paragraph(line));
  }
  flushList();
  if (content.length === 0) content.push({ type: 'paragraph' });
  return { type: 'doc', content };
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
