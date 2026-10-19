import { useEffect, useRef } from 'react';
import { createPortal } from 'react-dom';
import { useEditor } from 'tldraw';
import { createShapeId } from 'tldraw';
import { Code, Globe, Image as ImageIcon, MessageSquareQuote, Sigma, StickyNote, Table as TableIcon, Workflow } from 'lucide-react';

/**
 * The components picker, shown while the Components tool is active. Escape
 * or clicking anywhere outside the menu (or picking any other tool)
 * deactivates the tool and closes the picker.
 */
export function ComponentsMenu() {
  const editor = useEditor();
  const menuRef = useRef<HTMLDivElement | null>(null);

  // close on outside clicks: deactivate the tool so the menu unmounts
  useEffect(() => {
    const onPointerDown = (e: PointerEvent) => {
      const target = e.target as Element | null;
      if (!target) return;
      if (menuRef.current?.contains(target)) return;
      // the toolbar's own toggle button handles itself
      if (target.closest?.('[data-testid="toolbar.components"]')) return;
      editor.setCurrentTool('select');
    };
    document.addEventListener('pointerdown', onPointerDown, true);
    return () => document.removeEventListener('pointerdown', onPointerDown, true);
  }, [editor]);

  // Escape exits the tool (closes the menu)
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') editor.setCurrentTool('select');
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [editor]);

  /// Drop a code block at the center of the current viewport.
  function createCodeBlock() {
    const bounds = editor.getViewportPageBounds();
    editor.run(() => {
      editor.createShape({
        type: 'code-block',
        x: Math.round(bounds.center.x - 280),
        y: Math.round(bounds.center.y - 100),
      });
    });
    editor.setCurrentTool('select');
  }

  /// Drop an SVG diagram at the center of the current viewport.
  function createSvgDiagram() {
    const bounds = editor.getViewportPageBounds();
    editor.run(() => {
      editor.createShape({
        type: 'svg-diagram',
        x: Math.round(bounds.center.x - 180),
        y: Math.round(bounds.center.y - 112),
      });
    });
    editor.setCurrentTool('select');
  }

  /// Drop an equation at the center of the viewport and open its LaTeX editor.
  function createMathEquation() {
    const bounds = editor.getViewportPageBounds();
    const id = createShapeId();
    editor.run(() => {
      editor.createShape({
        id,
        type: 'math-block',
        x: Math.round(bounds.center.x - 140),
        y: Math.round(bounds.center.y - 60),
      });
      editor.select(id);
    });
    editor.setCurrentTool('select');
    editor.setEditingShape(id);
  }

  /// Drop a table at the center of the current viewport.
  function createTable() {
    const bounds = editor.getViewportPageBounds();
    editor.run(() => {
      editor.createShape({
        type: 'table',
        x: Math.round(bounds.center.x - 280),
        y: Math.round(bounds.center.y - 100),
      });
    });
    editor.setCurrentTool('select');
  }

  /// Drop a callout card at the center of the current viewport.
  function createCard() {
    const bounds = editor.getViewportPageBounds();
    editor.run(() => {
      editor.createShape({
        type: 'callout-card',
        x: Math.round(bounds.center.x - 230),
        y: Math.round(bounds.center.y - 65),
      });
    });
    editor.setCurrentTool('select');
  }

  return createPortal(
    <div
      ref={menuRef}
      data-testid="components-menu"
      className="tlui-menu absolute bottom-16 z-10 rounded-xl border border-line bg-surface p-1 shadow-xl"
      style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 4, width: 240, left: 'calc(50% + 170px)' }}
    >
      {(
        [
          ['Sticky note', false],
          ['Code block', true],
          ['SVG diagram', true],
          ['Table', true],
          ['Card', true],
          ['Image', false],
          ['Embed', false],
          ['Katex', true],
        ] as const
      ).map(([name, enabled]) => {
        const Icon = {
          'Sticky note': StickyNote,
          'Code block': Code,
          'SVG diagram': Workflow,
          Table: TableIcon,
          Card: MessageSquareQuote,
          Image: ImageIcon,
          Embed: Globe,
          Katex: Sigma,
        }[name];
        return (
          <button
            key={name}
            disabled={!enabled}
            title={enabled ? name : 'Coming soon'}
            onClick={() => {
              if (name === 'Code block') createCodeBlock();
              else if (name === 'SVG diagram') createSvgDiagram();
              else if (name === 'Katex') createMathEquation();
              else if (name === 'Table') createTable();
              else if (name === 'Card') createCard();
            }}
            className="flex flex-col items-center gap-1 rounded-lg px-2 py-3 text-xs text-muted-foreground enabled:text-ink enabled:hover:bg-raised disabled:cursor-not-allowed"
          >
            <Icon className="h-5 w-5" />
            {name}
          </button>
        );
      })}
    </div>,
    editor.getContainer(),
  );
}
