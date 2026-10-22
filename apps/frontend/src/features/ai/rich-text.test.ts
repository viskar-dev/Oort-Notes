import { describe, expect, it } from 'vitest';
import { labelFromProps, richTextToPlainText } from './rich-text';

describe('richTextToPlainText', () => {
  it('reads a plain paragraph', () => {
    expect(
      richTextToPlainText({
        type: 'doc',
        content: [
          {
            type: 'paragraph',
            content: [{ type: 'text', text: 'Hello world' }],
          },
        ],
      }),
    ).toBe('Hello world');
  });

  it('joins inline runs without separators', () => {
    expect(
      richTextToPlainText({
        type: 'doc',
        content: [
          {
            type: 'paragraph',
            content: [
              { type: 'text', text: 'To be, or ' },
              { type: 'text', marks: [], text: 'not ' },
              { type: 'text', text: 'to be' },
            ],
          },
        ],
      }),
    ).toBe('To be, or not to be');
  });

  it('separates blocks with newlines', () => {
    expect(
      richTextToPlainText({
        type: 'doc',
        content: [
          { type: 'paragraph', content: [{ type: 'text', text: 'first' }] },
          { type: 'paragraph', content: [{ type: 'text', text: 'second' }] },
        ],
      }),
    ).toBe('first\nsecond');
  });

  it('breaks lines on hardBreak runs', () => {
    expect(
      richTextToPlainText({
        type: 'doc',
        content: [
          {
            type: 'paragraph',
            content: [
              { type: 'text', text: 'one' },
              { type: 'hardBreak' },
              { type: 'text', text: 'two' },
            ],
          },
        ],
      }),
    ).toBe('one\ntwo');
  });

  it('survives non-json input', () => {
    expect(richTextToPlainText(undefined)).toBe('');
    expect(richTextToPlainText(null)).toBe('');
    expect(richTextToPlainText(5)).toBe('');
    expect(richTextToPlainText('just a string')).toBe('just a string');
  });
});

describe('labelFromProps', () => {
  it('prefers richText over plain text', () => {
    expect(
      labelFromProps({
        richText: { type: 'doc', content: [{ type: 'paragraph', content: [{ type: 'text', text: 'rich' }] }] },
        text: 'plain',
      }),
    ).toBe('rich');
  });

  it('falls back to a plain text prop (arrows)', () => {
    expect(labelFromProps({ text: 'arrow label' })).toBe('arrow label');
  });

  it('returns undefined for empty or missing labels', () => {
    expect(labelFromProps(undefined)).toBeUndefined();
    expect(labelFromProps({ text: '' })).toBeUndefined();
    expect(labelFromProps({ richText: null })).toBeUndefined();
    expect(labelFromProps({ richText: 2 })).toBeUndefined();
  });
});
