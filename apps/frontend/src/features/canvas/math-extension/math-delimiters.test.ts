import { describe, expect, it } from 'vitest';
import { splitFormulaRuns, wholeDisplayFormula } from './index';

/** Trim a run list down to plain data for assertions. */
const runs = (text: string) =>
  splitFormulaRuns(text)?.map((r) =>
    'latex' in r ? { latex: r.latex, display: r.display } : { text: r.text },
  ) ?? null;

describe('math delimiter rules', () => {
  it('converts a ChatGPT-style multi-line display formula (the shape complex pastes arrive in)', () => {
    const pasted = '$$\n\\begin{pmatrix} a \\\\ b \\end{pmatrix}\n$$';
    expect(runs(pasted)).toEqual([
      { latex: '\\begin{pmatrix} a \\\\ b \\end{pmatrix}', display: true },
    ]);
  });

  it('accepts padding whitespace inside display delimiters', () => {
    expect(runs('$$ x $$')).toEqual([{ latex: 'x', display: true }]);
    expect(runs('text \\[ E \\] tail')).toEqual(
      expect.arrayContaining([{ latex: 'E', display: true }]),
    );
  });

  it('converts bracket display math spread across lines', () => {
    expect(runs('\\[\n\\int_0^1 x\\,dx\n\\]')).toEqual([
      { latex: '\\int_0^1 x\\,dx', display: true },
    ]);
  });

  it('keeps inline delimiters strict: "$ x $" with padding stays prose', () => {
    expect(runs('$ x $')).toBeNull();
  });

  it('keeps prose dollar amounts intact (the inline false-positive guard)', () => {
    expect(runs('costs $5 and $6')).toBeNull();
  });

  it('converts inline math within surrounding text, in run order', () => {
    expect(runs('a $b$ c')).toEqual([{ text: 'a ' }, { latex: 'b', display: false }, { text: ' c' }]);
    expect(runs('\\(E=mc^2\\)')).toEqual([{ latex: 'E=mc^2', display: false }]);
  });

  it('multiple formulas on one line all convert', () => {
    expect(runs('$$a$$ of $$b$$')).toEqual([
      { latex: 'a', display: true },
      { text: ' of ' },
      { latex: 'b', display: true },
    ]);
  });

  it('a whole multi-line display paste is one math-block candidate', () => {
    const pasted = '$$\n\\begin{aligned}\nx &= 1 + 2 \\\\\n &= 3\n\\end{aligned}\n$$';
    expect(wholeDisplayFormula(pasted)).toBe(
      '\\begin{aligned}\nx &= 1 + 2 \\\\\n &= 3\n\\end{aligned}',
    );
    expect(wholeDisplayFormula('\\[\n\\gamma\n\\]')).toBe('\\gamma');
  });

  it('whole-paste detection leaves prose and mixed content alone', () => {
    expect(wholeDisplayFormula('costs $5 and $6')).toBeNull();
    expect(wholeDisplayFormula('$$a$$ tail')).toBeNull();
    expect(wholeDisplayFormula('head $$a$$')).toBeNull();
  });

  it('gates materialization on KaTeX parsing: unknown macros stay literal text', () => {
    expect(runs('$$ \\fancyunknownmacro $$')).toBeNull();
    expect(runs('$ \\otherunknownmacro $')).toBeNull();
    expect(runs('\\(\\ {}}\\)')).toBeNull();
    // ...but a valid neighbour formula still converts around prose
    expect(runs('see $$x$$ then')).toEqual([
      { text: 'see ' },
      { latex: 'x', display: true },
      { text: ' then' },
    ]);
  });

  it('isRenderableLatex is the exact parse check the gate uses', async () => {
    const { isRenderableLatex } = await import('./index');
    expect(isRenderableLatex('E=mc^2', true)).toBe(true);
    expect(isRenderableLatex('\\begin{pmatrix} a \\end{pmatrix}', true)).toBe(true);
    expect(isRenderableLatex('\\unknownmacro', false)).toBe(false);
    expect(isRenderableLatex('\\frac{1', true)).toBe(false);
    expect(isRenderableLatex('\\begin{pmatrix} a', true)).toBe(false);
  });
});
