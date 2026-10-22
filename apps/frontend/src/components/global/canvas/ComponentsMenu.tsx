import { useEffect } from 'react';
import { createShapeId, useEditor } from 'tldraw';
import { Code, MessageSquareQuote, Sigma, Table as TableIcon, Workflow } from 'lucide-react';

/**
 * The icon-only content of the components picker, shown inside a popover
 * anchored to the Components toolbar button (see PresetToolbar) — the same
 * clean, position-tracked panel the Shapes picker opens. Outside clicks are
 * closed by the popover host (the tool deactivates); Escape exits the tool.
 */

export function ComponentsMenuContent() {
  const editor = useEditor();

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

  /** Icon + creation entry of the picker (sticky note, image and embed were
   *  removed by design — the canvas already carries dedicated tools). */
  const entries = [
    { name: 'Code block', Icon: Code, create: createCodeBlock },
    { name: 'SVG diagram', Icon: Workflow, create: createSvgDiagram },
    { name: 'Table', Icon: TableIcon, create: createTable },
    { name: 'Card', Icon: MessageSquareQuote, create: createCard },
    { name: 'Katex', Icon: Sigma, create: createMathEquation },
  ];

  return (
    <div
      data-testid="components-menu"
      className="tlui-menu flex gap-1 rounded-xl border border-line bg-surface p-1 shadow-xl"
    >
      {entries.map(({ name, Icon, create }) => (
        <button
          key={name}
          title={name}
          onClick={create}
          className="flex items-center justify-center rounded-lg p-2.5 text-muted-foreground transition-colors hover:bg-raised hover:text-ink"
        >
          <Icon className="h-5 w-5" />
        </button>
      ))}
    </div>
  );
}
