import { useEffect, useMemo, useRef } from 'react';
import {
  atom,
  BaseBoxShapeUtil,
  createShapeId,
  defaultHandleExternalTextContent,
  HTMLContainer,
  Rectangle2d,
  renderHtmlFromRichText,
  renderPlaintextFromRichText,
  resizeBox,
  RichTextArea,
  stopEventPropagation,
  T,
  toRichText,
  useEditor,
  useValue,
  type Editor,
  type TLBaseShape,
  type TLResizeInfo,
  type TLRichText,
  type TLShapeId,
  type VecLike,
} from 'tldraw';

// ================= types =================

export type TableAlign = 'start' | 'middle' | 'end';
/** per-row override; 'auto' defers to the column alignment */
export type RowAlign = TableAlign | 'auto';

type TableProps = {
  w: number;
  h: number;
  /** cells[row][col]; when hasHeader is true, row 0 is the header row */
  cells: TLRichText[][];
  hasHeader: boolean;
  /** one entry per column */
  headerAlign: TableAlign[];
  bodyAlign: TableAlign[];
  /**
   * one entry per row, dominating both per-column alignments for that row;
   * entries are only materialized once a row alignment is set ('auto' elsewhere)
   */
  rowAlign?: RowAlign[];
};

export type TableShape = TLBaseShape<'table', TableProps>;

const MIN_W = 240;
const MIN_H = 60;
const DEFAULT_W = 560;

// ================= editing state =================

type CellRef = { id: TLShapeId; row: number; col: number };

/** the cell whose rich-text editor is mounted (only while the table is being edited) */
const activeCell = atom<CellRef | null>('table active cell', null);
/** the last cell the pointer went down on; decides which cell opens on double-click / Enter */
const lastPressed = atom<CellRef | null>('table last pressed cell', null);
/** row/column the pointer is over (crosshair tint); UI state only */
export const hoverRC = atom<{ id: TLShapeId; row: number | null; col: number | null } | null>(
  'table hovered row/col',
  null,
);
/** clicked row/column: what the contextual panel's single alignment control targets */
export const selRC = atom<{ id: TLShapeId; kind: 'row' | 'col'; index: number } | null>(
  'table selected row/col',
  null,
);

// ================= styles =================

const TABLE_CSS = `
.tl-table-card{box-sizing:border-box;overflow:hidden;border:1px solid var(--tbl-border);border-radius:12px;background:var(--tbl-bg);box-shadow:var(--tbl-shadow);font-family:var(--tl-font-mono,ui-monospace,SFMono-Regular,Menlo,monospace)}
.tl-table{width:100%;border-collapse:collapse;table-layout:fixed;border:0}
.tl-table th,.tl-table td{padding:12px 20px;border:0;vertical-align:middle;overflow-wrap:anywhere}
.tl-table thead th{padding-top:18px;padding-bottom:10px;font-size:11.5px;font-weight:500;letter-spacing:.06em;text-transform:uppercase;color:var(--tbl-head)}
.tl-table tbody td{font-size:13.5px;line-height:1.5;border-bottom:1px solid var(--tbl-divider)}
.tl-table tbody tr:last-child td{border-bottom:0}
.tl-table tbody td:first-child{color:var(--tbl-label)}
.tl-table tbody td:not(:first-child){color:var(--tbl-value);font-weight:600}
.tl-table td.is-active,.tl-table th.is-active{box-shadow:inset 0 0 0 1px var(--tbl-accent)}
/* row/column selection: hover crosshair tint, stronger tint for the selected
   row/column, and slim accent handles on the edges to click-select them */
.tl-table th,.tl-table td{position:relative}
.tl-table td.is-hov,.tl-table th.is-hov{background:color-mix(in srgb,var(--tbl-head) 14%,transparent)}
.tl-table td.is-sel,.tl-table th.is-sel{background:color-mix(in srgb,var(--tbl-accent) 18%,transparent)}
.rc-handle{position:absolute;z-index:2;display:block;background:var(--tbl-accent);border-radius:3px;opacity:0;transition:opacity .12s;cursor:pointer}
.tl-table:hover .rc-handle{opacity:.4}
.rc-handle:hover,.rc-handle.is-on{opacity:1}
/* placed 6px inside so tldraw's 9px selection-resize strips (pointer-events
   all, x -4.5..4.5) don't swallow their clicks */
.rc-row-handle{left:6px;top:6px;width:5px;height:calc(100% - 12px)}
.rc-col-handle{top:6px;left:6px;height:5px;width:calc(100% - 12px)}
/* lists inside cells: Tailwind's preflight strips list-style/padding, so the
   static cell (and the ProseMirror overlay on top of it) needs it back in
   order to look like a real list instead of plain text */
.tl-table-cell ul,.tl-table-cell ol{margin:.2em 0;padding-left:1.4em;text-align:start}
.tl-table-cell ul{list-style:disc}
.tl-table-cell ul ul{list-style:circle}
.tl-table-cell ul ul ul{list-style:square}
.tl-table-cell ol{list-style:decimal}
.tl-table-cell ol ol{list-style:lower-alpha}
.tl-table-cell ol ol ol{list-style:lower-roman}
.tl-table-cell li p{margin:0}
.tl-table-cell-wrap .ProseMirror ul,.tl-table-cell-wrap .ProseMirror ol{margin:.2em 0;padding-left:1.4em;text-align:start}
.tl-table-cell-wrap .ProseMirror ul{list-style:disc}
.tl-table-cell-wrap .ProseMirror ul ul{list-style:circle}
.tl-table-cell-wrap .ProseMirror ol{list-style:decimal}
.tl-table-cell{min-height:1.5em;user-select:none}
.tl-table-cell p{margin:0}
.tl-table-cell-wrap{position:relative;min-height:1.5em}
.tl-table-cell-wrap .ProseMirror{outline:none;user-select:text;white-space:pre-wrap;margin:0}
`;

let stylesInjected = false;
function ensureStyles() {
  if (stylesInjected || typeof document === 'undefined') return;
  stylesInjected = true;
  const el = document.createElement('style');
  el.setAttribute('data-tl-table', '');
  el.textContent = TABLE_CSS;
  document.head.appendChild(el);
}

const DARK_VARS = {
  '--tbl-bg': '#0d0d12',
  '--tbl-border': '#24232c',
  '--tbl-divider': '#1c1b23',
  '--tbl-head': '#8b8a96',
  '--tbl-label': '#a09fab',
  '--tbl-value': '#f4f4f6',
  '--tbl-shadow': '0 8px 24px rgba(0,0,0,0.35)',
  '--tbl-bar-bg': '#17161c',
  '--tbl-bar-border': '#24232c',
  '--tbl-bar-fg': '#a09fab',
  '--tbl-bar-fg-hover': '#f4f4f6',
  '--tbl-accent': '#7c6ee6',
} as const;

const LIGHT_VARS = {
  '--tbl-bg': '#ffffff',
  '--tbl-border': '#e2e2e8',
  '--tbl-divider': '#eeeef2',
  '--tbl-head': '#6b6a75',
  '--tbl-label': '#6b6a75',
  '--tbl-value': '#17161c',
  '--tbl-shadow': '0 4px 16px rgba(0,0,0,0.08)',
  '--tbl-bar-bg': '#ffffff',
  '--tbl-bar-border': '#e2e2e8',
  '--tbl-bar-fg': '#6b6a75',
  '--tbl-bar-fg-hover': '#17161c',
  '--tbl-accent': '#6254d8',
} as const;

const cssAlign = (a: TableAlign): 'left' | 'center' | 'right' =>
  a === 'middle' ? 'center' : a === 'end' ? 'right' : 'left';

// ================= table operations =================

function updateTable(editor: Editor, id: TLShapeId, fn: (p: TableProps) => Partial<TableProps>) {
  const cur = editor.getShape<TableShape>(id);
  if (!cur) return;
  editor.updateShape<TableShape>({ id, type: 'table', props: fn(cur.props) });
}

const setAt = <A,>(arr: A[], i: number, v: A): A[] => arr.map((x, ix) => (ix === i ? v : x));

/** Structure/alignment ops on a table shape; used by the contextual style panel. */
export function tableOps(editor: Editor, id: TLShapeId) {
  const colCount = (p: TableProps) => p.cells[0]?.length ?? 1;
  return {
    addRow: () =>
      updateTable(editor, id, (p) => ({
        cells: [...p.cells, Array.from({ length: colCount(p) }, () => toRichText(''))],
        rowAlign: p.rowAlign ? [...p.rowAlign, 'auto'] : undefined,
      })),
    removeRow: () =>
      updateTable(editor, id, (p) =>
        p.cells.length > (p.hasHeader ? 2 : 1)
          ? {
              cells: p.cells.slice(0, -1),
              rowAlign: p.rowAlign?.slice(0, -1),
            }
          : {},
      ),
    addCol: () =>
      updateTable(editor, id, (p) => ({
        cells: p.cells.map((row) => [...row, toRichText('')]),
        headerAlign: [...p.headerAlign, 'start'],
        bodyAlign: [...p.bodyAlign, 'start'],
      })),
    removeCol: () =>
      updateTable(editor, id, (p) =>
        colCount(p) > 1
          ? {
              cells: p.cells.map((row) => row.slice(0, -1)),
              headerAlign: p.headerAlign.slice(0, -1),
              bodyAlign: p.bodyAlign.slice(0, -1),
            }
          : {},
      ),
    toggleHeader: () => updateTable(editor, id, (p) => ({ hasHeader: !p.hasHeader })),
    setAlign: (kind: 'headerAlign' | 'bodyAlign', col: number, value: TableAlign) =>
      updateTable(editor, id, (p) => {
        const next = [...p[kind]];
        next[col] = value;
        return { [kind]: next } as Partial<TableProps>;
      }),
    /** align every cell of a row (header and body alike); overrides columns */
    /** align every cell of a column (header included) */
    setColAlign: (col: number, value: TableAlign) =>
      updateTable(editor, id, (p) => ({
        headerAlign: setAt(p.headerAlign, col, value),
        bodyAlign: setAt(p.bodyAlign, col, value),
      })),
    /** align every cell of a row (header and body alike); 'auto' restores the column-driven alignment; rows override columns */
    setRowAlign: (row: number, value: RowAlign) =>
      updateTable(editor, id, (p) => {
        const next: RowAlign[] = Array.from(
          { length: p.cells.length },
          (_, r) => p.rowAlign?.[r] ?? 'auto',
        );
        next[row] = value;
        return { rowAlign: next };
      }),
  };
}

// ================= markdown in / out =================

type Json = {
  type: string;
  text?: string;
  attrs?: Record<string, unknown>;
  marks?: { type: string; attrs?: Record<string, unknown> }[];
  content?: Json[];
};

const MATH_RE = /^\$([^\s$](?:[^$]*[^\s$])?)\$/;

function addMark(nodes: Json[], mark: { type: string; attrs?: Record<string, unknown> }): Json[] {
  return nodes.map((n) => (n.type === 'text' ? { ...n, marks: [...(n.marks ?? []), mark] } : n));
}

/** minimal inline markdown: **bold**, *italic*, ~~strike~~, `code`, [link](url), $math$, <br> */
function parseInline(src: string, math: boolean): Json[] {
  const out: Json[] = [];
  let buf = '';
  const flush = () => {
    if (buf) {
      out.push({ type: 'text', text: buf });
      buf = '';
    }
  };
  let i = 0;
  while (i < src.length) {
    const rest = src.slice(i);
    let m: RegExpMatchArray | null;

    if (rest[0] === '\\' && rest.length > 1) {
      buf += rest[1];
      i += 2;
      continue;
    }
    if ((m = rest.match(/^`([^`]+)`/))) {
      flush();
      out.push({ type: 'text', text: m[1], marks: [{ type: 'code' }] });
      i += m[0].length;
      continue;
    }
    if (math && (m = rest.match(MATH_RE))) {
      flush();
      out.push({ type: 'math', attrs: { latex: m[1], display: false } });
      i += m[0].length;
      continue;
    }
    if ((m = rest.match(/^\[([^\]]+)\]\(([^)\s]+)\)/))) {
      flush();
      out.push(...addMark(parseInline(m[1], math), { type: 'link', attrs: { href: m[2] } }));
      i += m[0].length;
      continue;
    }
    if ((m = rest.match(/^(\*\*|__)(?=\S)([\s\S]*?\S)\1/))) {
      flush();
      out.push(...addMark(parseInline(m[2], math), { type: 'bold' }));
      i += m[0].length;
      continue;
    }
    if ((m = rest.match(/^~~(?=\S)([\s\S]*?\S)~~/))) {
      flush();
      out.push(...addMark(parseInline(m[1], math), { type: 'strike' }));
      i += m[0].length;
      continue;
    }
    if (
      (m = rest.match(/^(\*|_)(?=\S)([\s\S]*?\S)\1/)) &&
      (m[1] === '*' || i === 0 || !/\w/.test(src[i - 1]))
    ) {
      flush();
      out.push(...addMark(parseInline(m[2], math), { type: 'italic' }));
      i += m[0].length;
      continue;
    }
    if ((m = rest.match(/^<br\s*\/?>/i))) {
      flush();
      out.push({ type: 'hardBreak' });
      i += m[0].length;
      continue;
    }
    buf += rest[0];
    i++;
  }
  flush();
  return out;
}

function markdownCellToRichText(src: string, math: boolean): TLRichText {
  const nodes = parseInline(src, math);
  const paragraph: Json = nodes.length ? { type: 'paragraph', content: nodes } : { type: 'paragraph' };
  return { type: 'doc', content: [paragraph] } as TLRichText;
}

function splitRow(line: string): string[] {
  let s = line.trim();
  if (s.startsWith('|')) s = s.slice(1);
  if (s.endsWith('|') && !s.endsWith('\\|')) s = s.slice(0, -1);
  const out: string[] = [];
  let cur = '';
  let inCode = false;
  for (let i = 0; i < s.length; i++) {
    const ch = s[i];
    if (ch === '\\' && s[i + 1] === '|') {
      cur += '|';
      i++;
      continue;
    }
    if (ch === '`') inCode = !inCode;
    if (ch === '|' && !inCode) {
      out.push(cur.trim());
      cur = '';
      continue;
    }
    cur += ch;
  }
  out.push(cur.trim());
  return out;
}

export type ParsedMarkdownTable = { header: string[]; aligns: TableAlign[]; rows: string[][] };

const DELIM_CELL = /^:?-+:?$/;

/** Returns null unless the text is a GFM table (header row + delimiter row + optional body rows). */
export function parseMarkdownTable(text: string): ParsedMarkdownTable | null {
  const lines = text
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter(Boolean);
  if (lines.length < 2 || !lines.every((l) => l.includes('|'))) return null;

  const header = splitRow(lines[0]);
  const delim = splitRow(lines[1]);
  if (!delim.every((c) => DELIM_CELL.test(c)) || delim.length !== header.length) return null;

  const aligns = delim.map<TableAlign>((c) =>
    c.startsWith(':') && c.endsWith(':') ? 'middle' : c.endsWith(':') ? 'end' : 'start',
  );
  const rows = lines.slice(2).map((l) => {
    const r = splitRow(l);
    while (r.length < header.length) r.push('');
    return r.slice(0, header.length);
  });
  return { header, aligns, rows };
}

export function createTableFromMarkdown(editor: Editor, md: ParsedMarkdownTable, point?: VecLike) {
  const extensions: any[] = (editor.options as any)?.text?.tipTapConfig?.extensions ?? [];
  const math = extensions.some((e) => e?.name === 'math');
  const toCell = (s: string) => markdownCellToRichText(s, math);

  const rows = md.rows.length ? md.rows : [md.header.map(() => '')];
  const cells = [md.header.map(toCell), ...rows.map((r) => r.map(toCell))];
  const cols = md.header.length;
  const w = Math.min(1000, Math.max(360, cols * 200));
  const center = editor.getViewportPageBounds().center;
  const id = createShapeId();

  editor.createShape<TableShape>({
    id,
    type: 'table',
    x: point ? point.x : center.x - w / 2,
    y: point ? point.y : center.y - 80,
    props: {
      w,
      h: 60 + cells.length * 46, // corrected by the auto-fit observer after first render
      cells,
      hasHeader: true,
      headerAlign: md.aligns,
      bodyAlign: md.aligns,
    },
  });
  editor.select(id);
}

/** Plain/rich text pasted onto the canvas, as delivered by the 'text' handler. */
export type CanvasTextPasteContent = {
  text: string;
  html?: string;
  point?: VecLike;
};

/**
 * Call once from <Tldraw onMount>. Pasted markdown tables become table shapes;
 * everything else goes to `fallback` (defaults to tldraw's plain text handler).
 * Callers that want math detection pass their own fallback.
 */
export function registerTablePaste(
  editor: Editor,
  fallback: (content: CanvasTextPasteContent) => void | Promise<void> = (content) =>
    defaultHandleExternalTextContent(editor, content),
) {
  editor.registerExternalContentHandler('text', async (content) => {
    const parsed = parseMarkdownTable(content.text);
    if (parsed) {
      createTableFromMarkdown(editor, parsed, content.point);
      return;
    }
    await fallback(content);
  });
}

export function tableToMarkdown(editor: Editor, p: TableProps): string {
  const cols = p.cells[0]?.length ?? 0;
  const text = (rt: TLRichText) =>
    renderPlaintextFromRichText(editor, rt).trim().replace(/\|/g, '\\|').replace(/\r?\n/g, '<br>');
  const line = (r: string[]) => `| ${r.join(' | ')} |`;
  const header = p.hasHeader ? p.cells[0].map(text) : Array.from({ length: cols }, () => '');
  const body = (p.hasHeader ? p.cells.slice(1) : p.cells).map((r) => r.map(text));
  const delim = p.bodyAlign.map((a) => (a === 'middle' ? ':---:' : a === 'end' ? '---:' : '---'));
  return [line(header), line(delim), ...body.map(line)].join('\n');
}

// ================= view =================

const rt = (s: string) => toRichText(s);

const DEFAULT_CELLS: TLRichText[][] = [
  [rt('Kinematic motion equations'), rt('')],
  [rt('Velocity-Time:'), rt('v = v₀ + at')],
  [rt('Displacement:'), rt('x = x₀ + v₀t + ½at²')],
  [rt('Torricelli:'), rt('v² = v₀² + 2a(x − x₀)')],
];

function StaticCell({ richText, hidden }: { richText: TLRichText; hidden?: boolean }) {
  const editor = useEditor();
  const html = useMemo(() => renderHtmlFromRichText(editor, richText), [editor, richText]);
  return (
    <div
      className="tl-table-cell"
      style={hidden ? { visibility: 'hidden' } : undefined}
      dangerouslySetInnerHTML={{ __html: html }}
    />
  );
}

function TableView({ shape }: { shape: TableShape }) {
  const editor = useEditor();
  ensureStyles();

  const { w, h, cells, hasHeader, headerAlign, bodyAlign, rowAlign } = shape.props;
  const rows = cells.length;
  const cols = cells[0]?.length ?? 1;
  const ops = useMemo(() => tableOps(editor, shape.id), [editor, shape.id]);
  const innerRef = useRef<HTMLDivElement>(null);

  const isDark = useValue('table dark', () => editor.user.getIsDarkMode(), [editor]);
  const isEditing = useValue('table editing', () => editor.getEditingShapeId() === shape.id, [editor, shape.id]);
  const active = useValue(
    'table active cell for shape',
    () => {
      const a = activeCell.get();
      return a && a.id === shape.id ? a : null;
    },
    [shape.id],
  );
  const selected = useValue('table selected?', () => editor.getSelectedShapeIds().includes(shape.id), [editor, shape.id]);
  const sel = useValue(
    'table row/col selection',
    () => {
      const s = selRC.get();
      return s && s.id === shape.id ? s : null;
    },
    [shape.id],
  );
  const hover = useValue(
    'table row/col hover',
    () => {
      const hv = hoverRC.get();
      return hv && hv.id === shape.id ? hv : null;
    },
    [shape.id],
  );

  // the row/column selection and crosshair only live while the shape is
  // selected and no cell editor is open
  useEffect(() => {
    if (selected && !isEditing) return;
    if (selRC.get()?.id === shape.id) selRC.set(null);
    if (hoverRC.get()?.id === shape.id) hoverRC.set(null);
  }, [selected, isEditing, shape.id]);

  // entering edit mode (double-click, Enter): open the pressed cell, else the first
  useEffect(() => {
    if (!isEditing) {
      if (activeCell.get()?.id === shape.id) activeCell.set(null);
      return;
    }
    if (activeCell.get()?.id !== shape.id) {
      const lp = lastPressed.get();
      activeCell.set(lp && lp.id === shape.id ? lp : { id: shape.id, row: 0, col: 0 });
    }
  }, [isEditing, shape.id, active]);

  // rows/columns removed while a cell was open
  useEffect(() => {
    const a = activeCell.get();
    if (a && a.id === shape.id && (a.row >= rows || a.col >= cols)) {
      activeCell.set({ id: shape.id, row: Math.min(a.row, rows - 1), col: Math.min(a.col, cols - 1) });
    }
  }, [rows, cols, shape.id]);

  // height follows content (wrapping, row count, edits)
  useEffect(() => {
    const el = innerRef.current;
    if (!el) return;
    const fit = () => {
      if (editor.getIsReadonly()) return;
      const cur = editor.getShape<TableShape>(shape.id);
      if (!cur) return;
      const needed = Math.max(MIN_H, Math.ceil(el.offsetHeight) + 2); // + card border
      if (Math.abs(needed - cur.props.h) > 1) {
        editor.run(() => editor.updateShape<TableShape>({ id: shape.id, type: 'table', props: { h: needed } }), {
          history: 'ignore',
        });
      }
    };
    fit();
    const ro = new ResizeObserver(fit);
    ro.observe(el);
    return () => ro.disconnect();
  }, [editor, shape.id]);

  const open = (row: number, col: number) => activeCell.set({ id: shape.id, row, col });

  function renderEditor(row: number, col: number) {
    return (
      <RichTextArea
        shapeId={shape.id}
        richText={cells[row][col]}
        isEditing
        hasCustomTabBehavior
        handleFocus={() => {}}
        handleBlur={() => {}}
        handleDoubleClick={(e: any) => e}
        handleInputPointerDown={(e) => stopEventPropagation(e)}
        handlePaste={(e) => e.stopPropagation()}
        handleChange={({ richText }) => {
          if (!richText) return;
          updateTable(editor, shape.id, (p) => ({
            cells: p.cells.map((r, ri) =>
              ri === row ? r.map((c, ci) => (ci === col ? richText : c)) : r,
            ),
          }));
        }}
        handleKeyDown={(e) => {
          if (e.key === 'Escape' || (e.key === 'Enter' && (e.ctrlKey || e.metaKey))) {
            e.preventDefault();
            editor.setEditingShape(null);
            return;
          }
          if (e.key === 'Tab') {
            e.preventDefault();
            const flat = row * cols + col + (e.shiftKey ? -1 : 1);
            if (flat < 0) return;
            if (flat >= rows * cols) ops.addRow(); // Tab out of the last cell adds a row
            open(Math.floor(flat / cols), flat % cols);
          }
        }}
      />
    );
  }

  function renderRow(row: TLRichText[], r: number, header: boolean) {
    const Cell = header ? 'th' : 'td';
    const aligns = header ? headerAlign : bodyAlign;
    const raw = rowAlign?.[r];
    // an explicit row override dominates the per-column alignment
    const rowOverride: TableAlign | null = raw && raw !== 'auto' ? raw : null;
    const toggleSel = (kind: 'row' | 'col', index: number) => (e: React.PointerEvent) => {
      e.preventDefault();
      e.stopPropagation();
      const s = selRC.get();
      if (s && s.id === shape.id && s.kind === kind && s.index === index) selRC.set(null);
      else selRC.set({ id: shape.id, kind, index });
    };
    return (
      <tr key={r}>
        {row.map((richText, c) => {
          const isActive = isEditing && active?.row === r && active.col === c;
          const align = rowOverride ?? (aligns[c] ?? 'start');
          const cls =
            [
              isActive && 'is-active',
              hover && (hover.row === r || hover.col === c) && 'is-hov',
              sel?.kind === 'row' && sel.index === r && 'is-sel',
              sel?.kind === 'col' && sel.index === c && 'is-sel',
            ]
              .filter(Boolean)
              .join(' ') || undefined;
          return (
            <Cell
              key={c}
              className={cls}
              style={{ textAlign: cssAlign(align) }}
              onPointerDown={(e) => {
                lastPressed.set({ id: shape.id, row: r, col: c });
                // clicking content drops the row/column selection
                const s = selRC.get();
                if (s && s.id === shape.id) selRC.set(null);
                if (isEditing) {
                  stopEventPropagation(e);
                  open(r, c);
                }
              }}
              onMouseEnter={() => hoverRC.set({ id: shape.id, row: r, col: c })}
              onMouseLeave={() => {
                const hv = hoverRC.get();
                if (hv && hv.id === shape.id) hoverRC.set(null);
              }}
            >
              {/* the static content owns the layout; the editor overlays it
                  (position:absolute; inset:0 from tldraw's .tl-text-input),
                  so the caret lands exactly where the text already is */}
              <div className="tl-table-cell-wrap">
                <StaticCell richText={richText} hidden={isActive} />
                {isActive && renderEditor(r, c)}
              </div>
              {/* edge handles: click to select the whole row / column */}
              {c === 0 && (
                <span
                  className={`rc-handle rc-row-handle${sel?.kind === 'row' && sel.index === r ? ' is-on' : ''}`}
                  data-testid={`table.row-handle-${r}`}
                  title="Click to select this row"
                  onPointerDown={toggleSel('row', r)}
                  onMouseEnter={() => hoverRC.set({ id: shape.id, row: r, col: null })}
                />
              )}
              {r === 0 && (
                <span
                  className={`rc-handle rc-col-handle${sel?.kind === 'col' && sel.index === c ? ' is-on' : ''}`}
                  data-testid={`table.col-handle-${c}`}
                  title="Click to select this column"
                  onPointerDown={toggleSel('col', c)}
                  onMouseEnter={() => hoverRC.set({ id: shape.id, row: null, col: c })}
                />
              )}
            </Cell>
          );
        })}
      </tr>
    );
  }

  const vars = (isDark ? DARK_VARS : LIGHT_VARS) as React.CSSProperties;
  const bodyRows = hasHeader ? cells.slice(1) : cells;

  return (
    <HTMLContainer className="tl-table-shape" style={{ ...vars, width: w, height: h, pointerEvents: 'all' }}>
      <div className="tl-table-card" style={{ width: w, height: h }}>
        <div ref={innerRef}>
          <table className="tl-table">
            <colgroup>
              {Array.from({ length: cols }, (_, i) => (
                <col key={i} style={{ width: `${100 / cols}%` }} />
              ))}
            </colgroup>
            {hasHeader && <thead>{renderRow(cells[0], 0, true)}</thead>}
            <tbody>{bodyRows.map((row, i) => renderRow(row, i + (hasHeader ? 1 : 0), false))}</tbody>
          </table>
        </div>
      </div>
    </HTMLContainer>
  );
}

// ================= util =================

const richTextProp = T.object({ type: T.string, content: T.arrayOf(T.unknown), attrs: T.any.optional() });
const alignProp = T.literalEnum('start', 'middle', 'end');
const rowAlignProp = T.arrayOf(T.literalEnum('start', 'middle', 'end', 'auto')).optional();

export class TableUtil extends BaseBoxShapeUtil<TableShape> {
  static override type = 'table' as const;
  static override props = {
    w: T.number,
    h: T.number,
    cells: T.arrayOf(T.arrayOf(richTextProp)),
    hasHeader: T.boolean,
    headerAlign: T.arrayOf(alignProp),
    bodyAlign: T.arrayOf(alignProp),
    rowAlign: rowAlignProp,
  };

  override canEdit(): boolean {
    return true;
  }

  override hideRotateHandle(): boolean {
    return true;
  }

  override onEditEnd = () => {
    activeCell.set(null);
  };

  override getDefaultProps(): TableShape['props'] {
    return {
      w: DEFAULT_W,
      h: 200,
      cells: DEFAULT_CELLS,
      hasHeader: true,
      headerAlign: ['start', 'end'],
      bodyAlign: ['start', 'end'],
    };
  }

  override getGeometry(shape: TableShape) {
    return new Rectangle2d({ width: shape.props.w, height: shape.props.h, isFilled: true });
  }

  // width is user-controlled; height always follows the content
  override onResize = (shape: TableShape, info: TLResizeInfo<TableShape>) => {
    const resized = resizeBox(shape, info, { minWidth: MIN_W, minHeight: 1 });
    return { ...resized, y: shape.y, props: { ...resized.props, h: shape.props.h } };
  };

  override component(shape: TableShape) {
    return <TableView shape={shape} />;
  }

  override indicator(shape: TableShape) {
    return <rect width={shape.props.w} height={shape.props.h} rx={12} />;
  }
}
