import { useEffect, useRef, useState } from 'react';
import type { Editor } from 'tldraw';
import { useAiStore } from '../ai-store';
import { useAiCanvasPromptStore } from '../canvas-prompt-store';
import { outlineShapes } from '../canvas-outline';

/** Renders nothing while closed (mounted unconditionally from CanvasShell). */
export function AiCanvasPrompt({ getEditor }: { getEditor: () => Editor | null }) {
  const open = useAiCanvasPromptStore((s) => s.open);
  const at = useAiCanvasPromptStore((s) => s.at);
  const close = useAiCanvasPromptStore((s) => s.close);

  // Right-click geometry capture: runs on every canvas right-click (before
  // tldraw opens its menu), one tick later so the editor has already
  // processed tldraw's own selection side effects of that same right-click.
  useEffect(() => {
    let timer: number | undefined;
    const onContextMenu = (event: MouseEvent) => {
      if (event.button !== 2) return;
      const { clientX, clientY } = event;
      // After tldraw handled the same event: selection then reflects the
      // click (a right-click on a shape selects that shape).
      timer = window.setTimeout(() => {
        const editor = getEditor();
        if (editor) useAiCanvasPromptStore.getState().capture(editor, clientX, clientY);
      }, 0);
    };
    window.addEventListener('contextmenu', onContextMenu);
    return () => {
      window.removeEventListener('contextmenu', onContextMenu);
      if (timer !== undefined) window.clearTimeout(timer);
    };
  }, [getEditor]);

  if (!open || !at) return null;
  return <AiCanvasPromptCard getEditor={getEditor} onClose={close} at={at} />;
}

function AiCanvasPromptCard({
  getEditor,
  onClose,
  at,
}: {
  getEditor: () => Editor | null;
  onClose: () => void;
  at: { x: number; y: number };
}) {
  const world = useAiCanvasPromptStore((s) => s.world);
  const selection = useAiCanvasPromptStore((s) => s.selection);
  const [input, setInput] = useState('');
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  // Focus when it opens (autofocus collides with the context menu's own
  // teardown — the card mounts after the menu closes).
  useEffect(() => {
    const id = window.setTimeout(() => textareaRef.current?.focus(), 20);
    return () => window.clearTimeout(id);
  }, []);

  // Click elsewhere dismisses (the way every popover in the app behaves).
  useEffect(() => {
    const onPointerDown = (event: PointerEvent) => {
      const target = event.target instanceof Element ? event.target : null;
      if (target && target.closest('[data-testid="ai-canvas-prompt"]')) return;
      onClose();
    };
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose();
    };
    document.addEventListener('pointerdown', onPointerDown, true);
    document.addEventListener('keydown', onKeyDown);
    return () => {
      document.removeEventListener('pointerdown', onPointerDown, true);
      document.removeEventListener('keydown', onKeyDown);
    };
  }, [onClose]);

  if (!world) return null;

  const submit = () => {
    const text = input.trim();
    if (text.length === 0) {
      onClose();
      return;
    }

    // The anchor context stays out of the transcript: it ships as per-turn
    // system context. New shapes go exactly under the right-click point;
    // selected shapes arrive as real outlines so "tidy this up" works.
    const contextParts = [
      `The user anchored this request by right-clicking the canvas at world position (${world.x}, ${world.y}). Place the shapes the request creates with explicit x/y there (treat it as the top-left of the new content, exactly as the create tools take coordinates). Do not refocus the camera.`,
    ];
    if (selection.length > 0) {
      const editor = getEditor();
      // outlineShapes skips stale/missing ids on its own.
      const shapes = editor ? outlineShapes(editor, selection) : [];
      // The outline already reports the full readable state (types, text,
      // codes, positions): updates need no extra tool call to understand it.
      if (shapes.length > 0) {
        contextParts.push(
          `The user had these shapes selected when the request was made — they are fair game to update, move or build on:` +
            JSON.stringify(shapes),
        );
      }
    }
    const context = contextParts.join('\n\n');

    setInput('');
    onClose();
    void useAiStore.getState().send(text, context);
  };

  return (
    <div
      data-testid="ai-canvas-prompt"
      className="fixed z-50 flex w-72 flex-col gap-1 rounded-xl bg-popover p-2 text-popover-foreground ring-1 ring-foreground/10 shadow-lg"
      style={{
        left: Math.min(at.x, window.innerWidth - 320),
        top: Math.min(at.y, window.innerHeight - 96),
      }}
      onPointerDown={(e) => e.stopPropagation()}
    >
      <textarea
        ref={textareaRef}
        rows={2}
        placeholder="What should the AI do right here?"
        className="resize-none bg-transparent text-sm outline-none placeholder:text-faint"
        value={input}
        onChange={(e) => setInput(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === 'Enter' && !e.shiftKey) {
            e.preventDefault();
            submit();
          }
        }}
      />
      <div className="text-right text-[10px] text-faint">
        {selection.length > 0 ? `${selection.length} selected · ` : ''}
        Enter to create · Esc to close
      </div>
    </div>
  );
}
