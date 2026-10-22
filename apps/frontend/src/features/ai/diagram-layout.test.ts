import { describe, expect, it } from 'vitest';
import { estimateSize, layoutDiagram } from './diagram-layout';

describe('estimateSize', () => {
  it('stays within its documented bounds', () => {
    for (const label of ['', 'X', 'lorem ipsum dolor sit amet'.repeat(10)]) {
      const { w, h } = estimateSize(label);
      expect(w).toBeGreaterThanOrEqual(170);
      expect(w).toBeLessThanOrEqual(320);
      expect(h).toBeGreaterThanOrEqual(34);
      expect(h).toBeLessThanOrEqual(260);
    }
  });

  it('gives longer labels wider boxes', () => {
    expect(estimateSize('A').w).toBeLessThan(estimateSize('Long label here').w);
  });
});

describe('layoutDiagram', () => {
  it('lays a straight chain in flow order', () => {
    const layout = layoutDiagram(
      [
        { id: 'a', label: 'Start' },
        { id: 'b', label: 'Middle' },
        { id: 'c', label: 'End' },
      ],
      [
        { from: 'a', to: 'b' },
        { from: 'b', to: 'c' },
      ],
      'down',
      { x: 100, y: 200 },
    );
    const a = layout.nodes.get('a')!;
    const b = layout.nodes.get('b')!;
    const c = layout.nodes.get('c')!;
    expect(a.y).toBeLessThan(b.y);
    expect(b.y).toBeLessThan(c.y);
    expect(a.x).toBe(b.x); // same column, centered by input order
    expect(b.x).toBe(c.x);
    expect(layout.arrows).toEqual([
      { from: 'a', to: 'b', label: null },
      { from: 'b', to: 'c', label: null },
    ]);
    expect(layout.warnings).toEqual([]);
    // Origin anchors the whole diagram.
    expect(a.x).toBe(100);
    expect(a.y).toBe(200);
  });

  it('spreads branches side by side, then merges', () => {
    const layout = layoutDiagram(
      [
        { id: 'a', label: 'root' },
        { id: 'b', label: 'left branch' },
        { id: 'c', label: 'right branch' },
        { id: 'd', label: 'end' },
      ],
      [
        { from: 'a', to: 'b' },
        { from: 'a', to: 'c' },
        { from: 'b', to: 'd' },
        { from: 'c', to: 'd' },
      ],
      'down',
      { x: 0, y: 0 },
    );
    const b = layout.nodes.get('b')!;
    const c = layout.nodes.get('c')!;
    expect(b.y).toBe(c.y); // same layer
    expect(b.x).toBeLessThan(c.x); // side by side
    const d = layout.nodes.get('d')!;
    expect(d.y).toBeGreaterThan(Math.max(b.y, c.y));
  });

  it('handles the right direction by swapping axes', () => {
    const layout = layoutDiagram(
      [
        { id: 'a', label: 'A' },
        { id: 'b', label: 'B' },
        { id: 'c', label: 'C' },
      ],
      [{ from: 'a', to: 'b' }, { from: 'b', to: 'c' }],
      'right',
      { x: 40, y: 50 },
    );
    const a = layout.nodes.get('a')!;
    const c = layout.nodes.get('c')!;
    expect(a.x).toBeLessThan(c.x); // flow advances along x
    expect(a.y).toBe(c.y);
    expect(a.x).toBe(40);
    expect(a.y).toBe(50);
  });

  it('warns on cycles instead of hanging', () => {
    const layout = layoutDiagram(
      [
        { id: 'a', label: 'A' },
        { id: 'b', label: 'B' },
      ],
      [
        { from: 'a', to: 'b' },
        { from: 'b', to: 'a' },
      ],
      'down',
      { x: 0, y: 0 },
    );
    expect(layout.warnings.some((w) => w.includes('cycle'))).toBe(true);
    // Both nodes still got placements.
    expect(layout.nodes.has('a')).toBe(true);
    expect(layout.nodes.has('b')).toBe(true);
  });

  it('warns and skips edges with unknown endpoints', () => {
    const layout = layoutDiagram(
      [{ id: 'a', label: 'A' }],
      [{ from: 'a', to: 'ghost' }],
      'down',
      { x: 0, y: 0 },
    );
    expect(layout.warnings.some((w) => w.includes('unknown node'))).toBe(true);
    expect(layout.arrows).toEqual([]);
  });

  it('skips self-edges and duplicate edges', () => {
    const layout = layoutDiagram(
      [
        { id: 'a', label: 'A' },
        { id: 'b', label: 'B' },
      ],
      [
        { from: 'a', to: 'a' },
        { from: 'a', to: 'b' },
        { from: 'a', to: 'b' },
      ],
      'down',
      { x: 0, y: 0 },
    );
    expect(layout.arrows).toEqual([{ from: 'a', to: 'b', label: null }]);
  });

  it('keeps edge labels', () => {
    const layout = layoutDiagram(
      [
        { id: 'a', label: 'A' },
        { id: 'b', label: 'B' },
      ],
      [{ from: 'a', to: 'b', label: ' then ' }],
      'down',
      { x: 0, y: 0 },
    );
    expect(layout.arrows[0].label).toBe('then');
  });

  it('puts isolated nodes in their own trailing layer', () => {
    const layout = layoutDiagram(
      [
        { id: 'a', label: 'A' },
        { id: 'b', label: 'B' },
        { id: 'lonely', label: 'L' },
      ],
      [{ from: 'a', to: 'b' }],
      'down',
      { x: 0, y: 0 },
    );
    const lonely = layout.nodes.get('lonely')!;
    expect(lonely.y).toBeGreaterThan(layout.nodes.get('b')!.y);
  });
});
