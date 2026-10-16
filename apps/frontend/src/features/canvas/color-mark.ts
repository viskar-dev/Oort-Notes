import { Mark } from '@tiptap/core';

/**
 * Per-word text color: the inline equivalent of bold/italic.
 *
 * tldraw's shape-level `props.color` colors a whole text shape; this mark
 * colors any inline range (a word, a sentence) inside one, so it behaves
 * like bold in the rich text toolbar.
 *
 * The raw value is stored on `data-color` — `style.color` normalizes
 * `#e03131` to `rgb(224, 49, 49)`, which would no longer match the toolbar
 * swatches — and the inline style does the actual painting.
 */
export const ColorMark = Mark.create({
  name: 'color',

  addAttributes() {
    return {
      color: {
        default: null,
        parseHTML: (element) =>
          element.getAttribute('data-color') || element.style.color || null,
        renderHTML: (attributes) =>
          attributes.color
            ? { 'data-color': attributes.color, style: `color: ${attributes.color}` }
            : {},
      },
    };
  },

  parseHTML() {
    return [
      { tag: 'span[data-color]' },
      {
        tag: 'span',
        getAttrs: (element) => {
          if (typeof element === 'string') return false;
          const color = element.style.color;
          // `false`, not `null`: a null result is still wrapped into a
          // matching attribute set by tiptap, so the rule would match every
          // span and shadow other span-based parse rules (e.g. math)
          return color ? { color } : false;
        },
      },
    ];
  },

  renderHTML({ HTMLAttributes }) {
    return ['span', HTMLAttributes, 0];
  },
});
