import {
  InputRule,
  Node,
  nodePasteRule,
  type Editor as TipTapEditor,
} from '@tiptap/core';
import type { Node as PMNode, NodeType } from '@tiptap/pm/model';
import { Plugin, TextSelection, type EditorState, type Transaction } from '@tiptap/pm/state';
import type { EditorView } from '@tiptap/pm/view';
import katex from 'katex';
import {
  createShapeId,
  defaultHandleExternalTextContent,
  type Editor as TldrawEditor,
  type VecLike,
} from 'tldraw';
import type { MathBlockShape } from './math-block-shape';
import 'katex/dist/katex.min.css';

/**
 * Math for tldraw rich text (text, note, geo and arrow labels).
 *
 * Typing and pasting:
 *   $E = mc^2$         -> inline math
 *   $$\int_0^1 x\,dx$$ -> display-style math
 *   \(E = mc^2\)       -> inline math (LaTeX/MathJax delimiter)
 *   \[\int_0^1 x\,dx\] -> display-style math (LaTeX/MathJax delimiter)
 *
 * Editing: clicking a rendered formula (or Backspace/Delete right next to it)
 * turns it back into `$latex$` text with the caret inside. The text becomes a
 * formula again as soon as the caret leaves it, the editor loses focus, Escape
 * ends editing, or the closing `$` is re-typed.
 *
 * Pasting onto the canvas (see `pasteTextWithMath`): a paste that is nothing
 * but one display formula creates a math-block shape, anything else lands in a
 * text shape with every formula converted; KaTeX/MathJax renders on the
 * clipboard (ChatGPT, docs sites) are recognized by their hidden TeX source.
 *
 * Rules to avoid false positives like "costs $5 and $6": no whitespace is
 * allowed right after the opening `$` or right before the closing `$`, and
 * `\$` is an escape (both for LaTeX's own `\$` and for the opening delimiter).
 * The bracket delimiters `\( \)` and `\[ \]` are never mistaken for prose.
 */

/** KaTeX HTML for a formula. Never throws: bad LaTeX renders as red text. */
export function renderMathHtml(latex: string, display: boolean): string {
  try {
    return katex.renderToString(latex, {
      displayMode: display,
      throwOnError: false,
      // html only: the default also emits hidden MathML, which skews
      // tldraw's text measurement
      output: 'html',
      strict: 'ignore',
      trust: false,
    });
  } catch {
    return escapeHtml(latex);
  }
}

function escapeHtml(text: string): string {
  return text
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;');
}

/**
 * The span that represents one formula in the editor, in the static (non
 * editing) label, in measurement and in export. Returning a DOM node from
 * the tiptap `renderHTML` hook means the same KaTeX output is used in all of
 * them (ProseMirror's DOMSerializer accepts a single element as a spec).
 */
export function toMathElement(latex: string, display: boolean): HTMLElement {
  const el = document.createElement('span');
  el.className = display ? 'tl-math tl-math-display' : 'tl-math';
  el.setAttribute('data-latex', latex);
  if (display) el.setAttribute('data-display', 'true');
  // keep the caret out of the rendered formula
  el.contentEditable = 'false';
  el.innerHTML = renderMathHtml(latex, display);
  return el;
}

/** Plain-text form of a formula, used for copy/cut, search and export-text. */
export function mathToPlainText(latex: string, display: boolean): string {
  return display ? `$$${latex}$$` : `$${latex}$`;
}

// A formula body: starts and ends with a non-whitespace, non-`$` character and
// may not span lines. `\$` is kept inside the body as a pair so LaTeX's
// escaped dollar signs don't end the formula early.
const FIRST = String.raw`(?:\\\$|[^\s$])`;
const MIDDLE = String.raw`(?:\\\$|[^$\n])*`;
const LAST = String.raw`(?:\\\$|[^\s$])`;
const BODY = String.raw`(${FIRST}(?:${MIDDLE}${LAST})?)`;
// input rules are anchored at the end: tiptap hands us the text before the
// cursor, so the closing delimiter must be the last thing typed
const DISPLAY_RE = new RegExp(String.raw`\$\$${BODY}\$\$$`);
const INLINE_RE = new RegExp(String.raw`(?<![$\\])\$${BODY}\$$`);
// paste and healing scan text that may carry a neighbour on either side (a
// pasted range, a formula mid-paragraph), so these only use lookarounds, and
// they are global so every formula in the run converts at once
const DISPLAY_SCAN_RE = new RegExp(String.raw`(?<!\$)\$\$${BODY}\$\$`, 'g');
const INLINE_SCAN_RE = new RegExp(String.raw`(?<![$\\])\$${BODY}\$`, 'g');
// LaTeX/MathJax bracket delimiters, as emitted by ChatGPT's copy button,
// MathJax and LaTeX tooling. `\[...\]` is display, `\(...\)` is inline; a
// preceding backslash escapes the opener. No whitespace rules are needed here:
// nobody writes `\(` in prose, so a match is always a formula.
const DISPLAY_BRACKET_RE = new RegExp(String.raw`(?<!\\)\\\[([^\n]+?)\\\]`);
const INLINE_PAREN_RE = new RegExp(String.raw`(?<!\\)\\\(([^\n]+?)\\\)`);
const DISPLAY_BRACKET_SCAN_RE = new RegExp(String.raw`(?<!\\)\\\[([^\n]+?)\\\]`, 'g');
const INLINE_PAREN_SCAN_RE = new RegExp(String.raw`(?<!\\)\\\(([^\n]+?)\\\)`, 'g');

interface Point {
  x: number;
  y: number;
}

interface FormulaMatch {
  from: number;
  to: number;
  latex: string;
  display: boolean;
}

/** Is the point inside the rendered DOM of the node at `pos`? */
function pointInNodeDom(view: EditorView, pos: number, point: Point): boolean {
  const dom = view.nodeDOM(pos);
  const elements = Array.isArray(dom) ? dom : dom ? [dom] : [];
  for (const el of elements) {
    if (!(el instanceof HTMLElement)) continue;
    const rect = el.getBoundingClientRect();
    if (point.x >= rect.left && point.x <= rect.right && point.y >= rect.top && point.y <= rect.bottom) {
      return true;
    }
  }
  return false;
}

/** Replace a formula atom with its `$latex$` text, caret before the closing delimiter. */
function revealMathTr(state: EditorState, atomPos: number, atom: PMNode): Transaction {
  const display = Boolean(atom.attrs.display);
  const text = mathToPlainText(String(atom.attrs.latex ?? ''), display);
  const tr = state.tr.replaceWith(atomPos, atomPos + atom.nodeSize, state.schema.text(text));
  tr.setSelection(TextSelection.create(tr.doc, atomPos + text.length - (display ? 2 : 1)));
  tr.scrollIntoView();
  return tr;
}

/**
 * If `point` sits on a rendered formula next to `pos`, swap it for editable
 * `$latex$` text. The formula only reveals when the pointer is inside its own
 * box, so clicking just before/after a formula to place the caret there still
 * works.
 */
function tryRevealAt(
  view: EditorView,
  pos: number,
  point: Point,
  extra?: { pos: number; node: PMNode },
): boolean {
  const { state } = view;
  const $pos = state.doc.resolve(pos);
  const candidates: { pos: number; node: PMNode }[] = [];
  if (extra && extra.node.type.name === 'math') candidates.push(extra);
  if ($pos.nodeAfter) candidates.push({ pos, node: $pos.nodeAfter });
  if ($pos.nodeBefore) candidates.push({ pos: pos - $pos.nodeBefore.nodeSize, node: $pos.nodeBefore });
  const seen = new Set<number>();
  for (const candidate of candidates) {
    if (candidate.node.type.name !== 'math' || seen.has(candidate.pos)) continue;
    seen.add(candidate.pos);
    if (!pointInNodeDom(view, candidate.pos, point)) continue;
    view.dispatch(revealMathTr(state, candidate.pos, candidate.node));
    return true;
  }
  return false;
}

/**
 * Called when tldraw begins editing a shape at a screen point: if that point
 * lands on a formula in the label, reveal it so the very first click already
 * shows the real `$latex$` string.
 */
export function revealMathAtPoint(editor: TipTapEditor, point: Point): boolean {
  if (editor.isDestroyed) return false;
  const hit = editor.view.posAtCoords({ left: point.x, top: point.y });
  if (!hit) return false;
  return tryRevealAt(editor.view, hit.pos, point);
}

function collectFormulaMatches(state: EditorState): FormulaMatch[] {
  const out: FormulaMatch[] = [];
  state.doc.descendants((node, pos) => {
    if (!node.isTextblock || node.type.spec.code) return;
    node.forEach((child, offset) => {
      if (!child.isText || !child.text) return;
      const base = pos + 1 + offset;
      scanFormulas(child.text, base, DISPLAY_SCAN_RE, true, out);
      scanFormulas(child.text, base, DISPLAY_BRACKET_SCAN_RE, true, out);
      scanFormulas(child.text, base, INLINE_SCAN_RE, false, out);
      scanFormulas(child.text, base, INLINE_PAREN_SCAN_RE, false, out);
    });
  });
  return out;
}

function scanFormulas(text: string, base: number, re: RegExp, display: boolean, out: FormulaMatch[]) {
  re.lastIndex = 0;
  let match: RegExpExecArray | null;
  while ((match = re.exec(text)) !== null) {
    if (match[1]) {
      out.push({
        from: base + match.index,
        to: base + match.index + match[0].length,
        latex: match[1],
        display,
      });
    }
    if (match[0].length === 0) re.lastIndex += 1;
  }
}

// ================= canvas paste =================

type TextRun = { text: string } | { latex: string; display: boolean };

/** Split a plain string into literal runs and formula runs; null when no formula. */
function splitFormulaRuns(text: string): TextRun[] | null {
  const matches: FormulaMatch[] = [];
  scanFormulas(text, 0, DISPLAY_SCAN_RE, true, matches);
  scanFormulas(text, 0, DISPLAY_BRACKET_SCAN_RE, true, matches);
  scanFormulas(text, 0, INLINE_SCAN_RE, false, matches);
  scanFormulas(text, 0, INLINE_PAREN_SCAN_RE, false, matches);
  if (!matches.length) return null;
  // longest first wins where matches share a start; the rest is overlap-skipped
  matches.sort((a, b) => a.from - b.from || b.to - a.to);
  const runs: TextRun[] = [];
  let pos = 0;
  for (const m of matches) {
    if (m.from < pos) continue;
    if (m.from > pos) runs.push({ text: text.slice(pos, m.from) });
    runs.push({ latex: m.latex, display: m.display });
    pos = m.to;
  }
  if (pos < text.length) runs.push({ text: text.slice(pos) });
  return runs;
}

function runsToFragment(runs: TextRun[], doc: Document): DocumentFragment {
  const fragment = doc.createDocumentFragment();
  for (const run of runs) {
    if ('latex' in run) fragment.append(toMathElement(run.latex, run.display));
    else fragment.append(doc.createTextNode(run.text));
  }
  return fragment;
}

/** The latex of a formula that is the entire (trimmed) string, else null. */
function wholeFormula(text: string, scan: RegExp): string | null {
  const trimmed = text.trim();
  if (!trimmed || trimmed.includes('\n')) return null;
  scan.lastIndex = 0;
  const match = scan.exec(trimmed);
  if (!match?.[1] || match.index !== 0 || match[0].length !== trimmed.length) return null;
  return match[1];
}

/**
 * `<p>` markup for plain text, one paragraph per line (the same structure
 * `toRichText` would create), with formulas as math spans. Null when the text
 * has no formula: the plain-text default path is already correct then.
 */
function mathHtmlFromText(text: string): string | null {
  const lines = text.replace(/\r\n?/g, '\n').split('\n');
  const runsPerLine = lines.map(splitFormulaRuns);
  if (!runsPerLine.some(Boolean)) return null;
  const doc = document.implementation.createHTMLDocument('');
  return lines
    .map((line, i) => {
      const p = doc.createElement('p');
      p.setAttribute('dir', 'auto');
      const runs = runsPerLine[i];
      if (runs) p.append(runsToFragment(runs, doc));
      else p.textContent = line;
      return p.outerHTML;
    })
    .join('');
}

/**
 * Recognized wrapped math in clipboard HTML and rewrite it into the
 * `span[data-latex]` form the rich text schema parses:
 *  - KaTeX renders carry their TeX source in a hidden `annotation` element
 *  - MathJax v2 renders use `<script type="math/tex">`
 *  - remaining text keeps delimiter-based detection
 * Returns null when nothing changed.
 */
function enhanceMathHtml(html: string): string | null {
  const doc = new DOMParser().parseFromString(html, 'text/html');
  let changed = false;

  for (const annotation of Array.from(
    doc.querySelectorAll('annotation[encoding="application/x-tex"]'),
  )) {
    const latex = annotation.textContent ?? '';
    if (!latex.trim()) continue;
    const display = !!annotation.closest('.katex-display');
    const host = annotation.closest('.katex-display') ?? annotation.closest('.katex');
    if (!host) continue;
    host.replaceWith(toMathElement(latex, display));
    changed = true;
  }

  for (const script of Array.from(doc.querySelectorAll('script[type^="math/tex"]'))) {
    const latex = script.textContent ?? '';
    if (!latex.trim()) continue;
    const display = (script.getAttribute('type') ?? '').includes('mode=display');
    script.replaceWith(toMathElement(latex, display));
    changed = true;
  }

  const walker = doc.createTreeWalker(doc.body, NodeFilter.SHOW_TEXT);
  const textNodes: Text[] = [];
  while (walker.nextNode()) {
    const node = walker.currentNode as Text;
    const parent = node.parentElement;
    // `pre`/`code` are skipped: a `$...$` pair in code is almost certainly
    // real code, not a formula
    if (
      !parent ||
      !/[$\\]/.test(node.data) ||
      parent.closest('style,script,pre,code,[data-latex]')
    )
      continue;
    textNodes.push(node);
  }
  for (const node of textNodes) {
    const runs = splitFormulaRuns(node.data);
    if (!runs) continue;
    node.replaceWith(runsToFragment(runs, doc));
    changed = true;
  }

  return changed ? doc.body.innerHTML : null;
}

/** Plain/rich text pasted onto the canvas (not into an editing text shape). */
export interface CanvasTextPaste {
  text: string;
  html?: string;
  point?: VecLike;
}

/**
 * Canvas paste entry point, wired as the fallback of the text external content
 * handler. A paste that is exactly one display formula becomes a math-block
 * shape ("the component"); every other paste becomes a text shape whose
 * formulas turn into math atoms, inline or display depending on the
 * delimiters the source used.
 */
export async function pasteTextWithMath(
  editor: TldrawEditor,
  content: CanvasTextPaste,
): Promise<void> {
  const displayLatex =
    wholeFormula(content.text, DISPLAY_SCAN_RE) ??
    wholeFormula(content.text, DISPLAY_BRACKET_SCAN_RE);

  if (displayLatex) {
    const point =
      content.point ??
      (editor.inputs.shiftKey
        ? editor.inputs.currentPagePoint
        : editor.getViewportPageBounds().center);
    const defaults = editor.getShapeUtil<MathBlockShape>('math-block').getDefaultProps();
    const id = createShapeId();
    editor.createShape<MathBlockShape>({
      id,
      type: 'math-block',
      // center the block on the paste point, like a pasted text shape
      x: point.x - defaults.w / 2,
      y: point.y - defaults.h / 2,
      props: { latex: displayLatex },
    });
    editor.select(id);
    return;
  }

  const html = content.html ? enhanceMathHtml(content.html) : mathHtmlFromText(content.text);
  await defaultHandleExternalTextContent(editor, html ? { ...content, html } : content);
}

/**
 * Turn `$...$` text back into formula atoms. With `force` (blur, Escape) every
 * formula converts; otherwise any run overlapping the selection is left alone,
 * which is how a formula the caret just left re-renders while the one being
 * edited stays as text. The transaction is outside history: healing should be
 * invisible to undo.
 */
function rerenderMathText(state: EditorState, type: NodeType, force: boolean): Transaction | null {
  const matches = collectFormulaMatches(state);
  if (!matches.length) return null;
  const { selection } = state;
  const eligible = matches.filter(
    (m) => force || !(selection.to > m.from && selection.from < m.to),
  );
  if (!eligible.length) return null;
  // apply right to left so earlier positions stay valid; skip any match that
  // overlaps one already replaced
  eligible.sort((a, b) => b.from - a.from);
  const tr = state.tr;
  let limit = Infinity;
  for (const m of eligible) {
    if (m.to > limit) continue;
    tr.replaceWith(m.from, m.to, type.create({ latex: m.latex, display: m.display }));
    limit = m.from;
  }
  if (!tr.docChanged) return null;
  tr.setMeta('addToHistory', false);
  tr.scrollIntoView();
  return tr;
}

function heal(view: EditorView, type: NodeType, force: boolean) {
  if (view.isDestroyed) return;
  const tr = rerenderMathText(view.state, type, force);
  if (tr) view.dispatch(tr);
}

/** Backspace after (or Delete before) a formula reveals its full `$latex$`. */
function revealAdjacentMath(editor: TipTapEditor, side: 'before' | 'after'): boolean {
  const { selection } = editor.state;
  if (!selection.empty) return false;
  const node = side === 'before' ? selection.$from.nodeBefore : selection.$from.nodeAfter;
  if (node?.type.name !== 'math') return false;
  const from = side === 'before' ? selection.from - node.nodeSize : selection.from;
  const display = Boolean(node.attrs.display);
  const text = mathToPlainText(String(node.attrs.latex ?? ''), display);
  const caret = from + text.length - (display ? 2 : 1);
  return editor
    .chain()
    .insertContentAt({ from, to: from + node.nodeSize }, { type: 'text', text })
    .setTextSelection(caret)
    .run();
}

export const MathInline = Node.create({
  name: 'math',
  group: 'inline',
  inline: true,
  atom: true,
  selectable: true,

  addAttributes() {
    return {
      latex: { default: '' },
      display: { default: false },
    };
  },

  parseHTML() {
    return [
      {
        // priority 60 keeps the data-latex span out of reach of generic
        // `span` parse rules (mark rules sort before node rules at the
        // default priority); this path matters for HTML paste and for
        // renderRichTextFromHTML, where no paste/append plugins run
        tag: 'span[data-latex]',
        priority: 60,
        getAttrs: (el) => ({
          latex: (el as HTMLElement).getAttribute('data-latex') ?? '',
          display: (el as HTMLElement).getAttribute('data-display') === 'true',
        }),
      },
    ];
  },

  // Returning a DOM node means the same KaTeX output is used by the editor,
  // the static (non-editing) label, measurement and export.
  renderHTML({ node }) {
    return toMathElement(node.attrs.latex, node.attrs.display);
  },

  // plaintext serializers skip leaf nodes without `toText`: copy, cut and
  // "select all then copy" would silently drop the formula
  renderText({ node }) {
    return mathToPlainText(node.attrs.latex, node.attrs.display);
  },

  addInputRules() {
    const type = this.type;
    const make = (find: RegExp, display: boolean) =>
      new InputRule({
        find,
        handler: ({ state, range, match }) => {
          const latex = match[1];
          if (!latex) return;
          const tr = state.tr.replaceWith(range.from, range.to, type.create({ latex, display }));
          tr.scrollIntoView();
        },
      });
    return [
      make(DISPLAY_RE, true),
      make(INLINE_RE, false),
      make(DISPLAY_BRACKET_RE, true),
      make(INLINE_PAREN_RE, false),
    ];
  },

  // pasting `$E=mc^2$`, `\(E=mc^2\)` or a whole paragraph of formulas converts
  // just like typing it: the rule matches over the pasted range, whatever
  // delimiters the source used
  addPasteRules() {
    const type = this.type;
    const make = (find: RegExp, display: boolean) =>
      nodePasteRule({
        find,
        type,
        getAttributes: (match) => (match[1] ? { latex: match[1], display } : null),
      });
    return [
      make(DISPLAY_SCAN_RE, true),
      make(INLINE_SCAN_RE, false),
      make(DISPLAY_BRACKET_SCAN_RE, true),
      make(INLINE_PAREN_SCAN_RE, false),
    ];
  },

  addKeyboardShortcuts() {
    return {
      Backspace: ({ editor }) => revealAdjacentMath(editor, 'before'),
      Delete: ({ editor }) => revealAdjacentMath(editor, 'after'),
    };
  },

  addProseMirrorPlugins() {
    const type = this.type;
    const revealOnPointer = (
      view: EditorView,
      pos: number,
      event: MouseEvent,
      extra?: { pos: number; node: PMNode },
    ) => tryRevealAt(view, pos, { x: event.clientX, y: event.clientY }, extra);
    return [
      new Plugin({
        props: {
          // clipboard HTML (ChatGPT, docs) is rewritten before the schema
          // parses it: KaTeX/MathJax renders become data-latex spans, so the
          // formulas survive the trip as atoms instead of collapsed text
          transformPastedHTML: (html: string) => enhanceMathHtml(html) ?? html,
          handleClickOn(view, pos, node, nodePos, event) {
            return revealOnPointer(
              view,
              pos,
              event,
              node.type.name === 'math' ? { pos: nodePos, node } : undefined,
            );
          },
          handleDoubleClickOn(view, pos, node, nodePos, event) {
            return revealOnPointer(
              view,
              pos,
              event,
              node.type.name === 'math' ? { pos: nodePos, node } : undefined,
            );
          },
          // leaving the editor (Escape, Cmd+Enter) must re-render even the
          // formula the caret is still sitting in: after this the editor is
          // gone, so there is no later chance to heal the text
          handleKeyDown(view, event) {
            const leaving =
              event.key === 'Escape' || (event.key === 'Enter' && (event.metaKey || event.ctrlKey));
            if (leaving) heal(view, type, true);
            return false;
          },
          handleDOMEvents: {
            blur(view) {
              heal(view, type, true);
              return false;
            },
          },
        },
        // any caret move or edit re-renders revealed formulas the caret has
        // left; the selection check keeps the one being edited as text
        appendTransaction(_transactions, _oldState, newState) {
          return rerenderMathText(newState, type, false);
        },
      }),
    ];
  },
});
