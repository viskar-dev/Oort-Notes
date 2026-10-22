import { describe, expect, it } from 'vitest';
import { buildRichDocument, richTextToPlainText } from './rich-text';

/** Round-trip helper: whatever the builder writes must read back as the
 *  markdown the user sees on the shape. */
const read = (text: string) => richTextToPlainText(buildRichDocument(text));

describe('buildRichDocument', () => {
  it('plain paragraphs stay paragraphs', () => {
    const doc = buildRichDocument('first line\nsecond line');
    expect(doc.type).toBe('doc');
    expect(doc.content).toHaveLength(2);
    expect(doc.content?.[0].type).toBe('paragraph');
  });

  it('bullets and ordered lists become tiptap list nodes', () => {
    const doc = buildRichDocument('- one\n- two\n1. alpha\n2. beta');
    const types = doc.content?.map((node) => node.type);
    expect(types).toEqual(['bulletList', 'orderedList']);
    expect(doc.content?.[0].content?.[0].type).toBe('listItem');
  });

  it('inline math becomes math nodes with latex preserved', () => {
    const runs = buildRichDocument('$E=mc^2$ and $x^2$').content?.[0].content ?? [];
    const math = runs.filter((node) => node.type === 'math');
    expect(math).toHaveLength(2);
    expect(math[0].attrs).toEqual({ latex: 'E=mc^2', display: false });
  });

  it('display math is marked display and survives $$ and \\[ \\]', () => {
    const first = (text: string) =>
      (buildRichDocument(text).content?.[0].content ?? []).find((node) => node.type === 'math');
    expect(first('$$\\int_0^1 x dx$$')).toMatchObject({
      type: 'math',
      attrs: { latex: '\\int_0^1 x dx', display: true },
    });
    expect(first('\\[a^2\\]')?.attrs?.display).toBe(true);
  });

  it('bold, italic and code stay verbatim as marks', () => {
    const runs = buildRichDocument('**bold** and `code` and *it*').content?.[0].content ?? [];
    expect(runs).toContainEqual({ type: 'text', text: 'bold', marks: [{ type: 'bold' }] });
    expect(runs).toContainEqual({ type: 'text', text: 'code', marks: [{ type: 'code' }] });
    expect(runs).toContainEqual({ type: 'text', text: 'it', marks: [{ type: 'italic' }] });
  });

  it('syntax the builder does not know passes through verbatim rather than being eaten', () => {
    expect(read('~~strike~~ and #hashtag done')).toBe('~~strike~~ and #hashtag done');
    expect(read('see [1] and [2]')).toBe('see [1] and [2]');
  });

  it('round-trips with the reader: math survives, marks read as rendered text', () => {
    expect(read('$\\alpha$ work')).toBe('$\\alpha$ work');
    // Marks read as the TEXT the shape shows (rendered bold does not keep
    // its asterisks) — same rule as user-typed rich text.
    expect(read('**heavy** text')).toBe('heavy text');
    expect(read('# not a heading')).toBe('# not a heading');
  });

  it('never emits empty text nodes (tldraw rejects those with "Empty text nodes")', () => {
    const walk = (node: unknown): void => {
      if (Array.isArray(node)) {
        for (const child of node) walk(child);
        return;
      }
      if (node && typeof node === 'object') {
        const record = node as { text?: unknown; content?: unknown; type?: string };
        expect(record.type === 'text' ? typeof record.text === 'string' && record.text.length > 0 : true).toBe(true);
        if (record.content) walk(record.content);
      }
    };
    for (const text of ['**bold** start', '', '   ', '$$x$$', '- \n\n', '**a** and *b* and `c`']) {
      walk(buildRichDocument(text));
    }
  });
});
