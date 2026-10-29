/**
 * Layered layout for `create_diagram`: nodes group into layers by depth from
 * a source (longest-path layering), layers become rows (or columns) along
 * the flow direction, and same-layer nodes stack across the perpendicular
 * axis. Pure functions — the executor turns placements into tldraw shapes.
 *
 * Cycles cannot be laid out; back edges are ignored (with a warning) so a
 * stray loop in the model's output still produces sane geometry.
 */

export interface DiagramNodeSpec {
  id: string;
  label?: string;
  /** 'rect' | 'round' | 'diamond' | 'note' (mapped by the executor). */
  shape?: string;
}

export interface DiagramEdgeSpec {
  from: string;
  to: string;
  label?: string;
}

/** Where to place one node, top-left corner, in canvas/world coordinates. */
export interface DiagramPlacement {
  x: number;
  y: number;
  w: number;
  h: number;
}

export interface DiagramLayout {
  nodes: Map<string, DiagramPlacement>;
  /** All edges resolved against real node ids (duplicates dropped). */
  arrows: Array<{ from: string; to: string; label: string | null }>;
  /** Non-fatal problems: unknown edge endpoints, cycles. */
  warnings: string[];
}

/** Label size estimate in world units: tldraw geo shapes wrap text and grow
 *  vertically on their own, so the height guess only has to be sane. */
export function estimateSize(label: string): { w: number; h: number } {
  const text = label.trim() || ' ';
  const w = Math.min(320, Math.max(170, 44 + text.length * 9));
  const charsPerLine = Math.max(8, Math.floor((w - 44) / 9));
  const rows = Math.max(1, Math.ceil(text.length / charsPerLine));
  const h = Math.min(260, 34 + rows * 30);
  return { w, h };
}

const LAYER_GAP = 90; // along the flow, between two layers
const NODE_GAP = 48; // perpendicular, between two nodes in the same layer

/** Axes for the flow direction: layers advance `along` (with each box's
 *  `alongSize`), boxes in a layer advance `across` (with each box's
 *  `acrossSize`). */
const AXES = {
  down: { along: 'y', alongSize: 'h', across: 'x', acrossSize: 'w', alongGap: LAYER_GAP, acrossGap: NODE_GAP },
  right: { along: 'x', alongSize: 'w', across: 'y', acrossSize: 'h', alongGap: LAYER_GAP, acrossGap: NODE_GAP },
} as const;

/**
 * Layer a DAG by longest-path depth and stack each layer along the
 * perpendicular axis. `origin` is the diagram's top-left in world
 * coordinates.
 */
export function layoutDiagram(
  nodes: DiagramNodeSpec[],
  edges: DiagramEdgeSpec[],
  direction: 'down' | 'right',
  origin: { x: number; y: number },
): DiagramLayout {
  const warnings: string[] = [];
  const placements = new Map<string, DiagramPlacement>();
  const byId = new Map(nodes.map((node) => [node.id, node]));
  const axes = AXES[direction];

  // Dedupe edges; drop unusable ones instead of failing the whole call.
  const arrows: DiagramLayout['arrows'] = [];
  const seen = new Set<string>();
  for (const edge of edges) {
    const key = `${edge.from}\u0000${edge.to}`;
    if (edge.from === edge.to) {
      warnings.push(`skipped self-edge on "${edge.from}"`);
      continue;
    }
    if (!byId.has(edge.from) || !byId.has(edge.to)) {
      warnings.push(`edge ${edge.from} → ${edge.to} references an unknown node`);
      continue;
    }
    if (seen.has(key)) continue;
    seen.add(key);
    arrows.push({ from: edge.from, to: edge.to, label: edge.label?.trim() || null });
  }

  // Longest-path layering by relaxation; converges for DAGs within n passes.
  const level = new Map(nodes.map((node) => [node.id, 0]));
  for (let pass = 0; pass <= nodes.length; pass++) {
    let changed = false;
    for (const arrow of arrows) {
      const next = level.get(arrow.from)! + 1;
      if (next > level.get(arrow.to)!) {
        level.set(arrow.to, next);
        changed = true;
      }
    }
    if (!changed) break;
    if (pass === nodes.length) warnings.push('the diagram has a cycle; arrows may overlap');
  }

  // Group nodes by level; input order inside a layer stays stable.
  const maxLevel = arrows.length === 0 ? 0 : Math.max(...level.values());
  const layers: string[][] = Array.from({ length: maxLevel + 1 }, () => []);
  for (const node of nodes) layers[level.get(node.id)!].push(node.id);

  // Isolated nodes (no edges at all) form their own last layer so they
  // don't collide with the diagram.
  const connected = new Set<string>();
  for (const arrow of arrows) {
    connected.add(arrow.from);
    connected.add(arrow.to);
  }
  const columns = layers.filter((layer) => layer.length > 0);
  const orphans = nodes.filter((node) => !connected.has(node.id)).map((node) => node.id);
  if (orphans.length > 0) columns.push(orphans);

  // Cumulative offsets: each layer starts after the previous layer's
  // tallest (or widest) box plus the gap.
  let along = 0;
  for (const layer of columns) {
    const sizes = layer.map((id) => ({ id, size: estimateSize(byId.get(id)?.label ?? ' ') }));
    const alongSize = Math.max(...sizes.map((entry) => entry.size[axes.alongSize]));

    let across = 0;
    for (const entry of sizes) {
      placements.set(entry.id, {
        x: axes.along === 'x' ? origin.x + along : origin.x + across,
        y: axes.along === 'y' ? origin.y + along : origin.y + across,
        w: entry.size.w,
        h: entry.size.h,
      });
      across += entry.size[axes.acrossSize] + axes.acrossGap;
    }
    along += alongSize + axes.alongGap;
  }

  return { nodes: placements, arrows, warnings };
}
