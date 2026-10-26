import { useEffect, useRef, useState } from 'react';
import type { Editor } from 'tldraw';
import { useAiStore, type ConversationEvent } from '../ai-store';
import { useAiCanvasPromptStore } from '../canvas-prompt-store';
import { outlineShapes } from '../canvas-outline';

/** The assistant's answer text inside a settled event slice. */
function assistantText(events: ConversationEvent[]): string {
  return events
    .filter((event) => event.kind === 'agent' && event.role === 'assistant')
    .map((event) => event.text)
    .join('\n\n');
}

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
  const page = useAiCanvasPromptStore((s) => s.page);
  const selection = useAiCanvasPromptStore((s) => s.selection);
  const [input, setInput] = useState('');
  /** The prompt of the turn this card is waiting on (alive until settled). */
  const [pending, setPending] = useState<string | null>(null);
  /** The latest settled answer shown here (stays until the next request). */
  const [answer, setAnswer] = useState<string | null>(null);
  const sliceStartRef = useRef(0);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  // Live transcript subscription: the answer streams in as the agent
  // reports, before the turn's final (authoritative) settle.
  const events = useAiStore((s) => s.events);

  // Focus when it opens (autofocus collides with the context menu's own
  // teardown — the card mounts after the menu closes).
  useEffect(() => {
    const id = window.setTimeout(() => textareaRef.current?.focus(), 20);
    return () => window.clearTimeout(id);
  }, []);

  // Click elsewhere dismisses (the way every popover in the app behaves).
  // A running turn keeps running — it sets in the transcript too.
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

  if (!page) return null;

  const liveAnswer = assistantText(events.slice(sliceStartRef.current));

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
      `The user anchored this request by right-clicking the canvas. The click landed at canvas position (${page.x}, ${page.y}) — place the shapes the request creates with explicit x/y exactly there (treat it as the top-left of the new content, in the same coordinate space the create tools take). Do not refocus the camera.`,
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

    const startIndex = useAiStore.getState().events.length;
    sliceStartRef.current = startIndex;
    setInput('');
    setPending(text);
    setAnswer(null);
    const settled = useAiStore.getState().send(text, context).then(
      () => {
        // The final list is authoritative; the store's tail (our slice's
        // assistant text, streaming above) is replaced by it via settleTurn.
        const error = useAiStore.getState().error;
        setAnswer(assistantText(useAiStore.getState().events.slice(startIndex)) ||
          (error ? `Request failed: ${error}` : 'No response text — the AI panel has the details.'));
      },
      () => setAnswer('Request failed — the AI panel has the details.'),
    );
    void settled.finally(() => setPending(null));
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
      {(pending !== null || answer !== null) && (
        <div className="max-h-40 overflow-y-auto text-xs leading-relaxed whitespace-pre-wrap text-muted-foreground">
          {pending !== null ? (
            <span className="flex items-start gap-1.5">
              <span className="mt-1 h-1.5 w-1.5 shrink-0 animate-pulse rounded-full bg-primary" />
              {liveAnswer ? <span>{liveAnswer}</span> : <span>Working…</span>}
            </span>
          ) : (
            (answer ?? '')
          )}
        </div>
      )}
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
        {pending !== null
          ? 'working until it settles…'
          : `${selection.length > 0 ? `${selection.length} selected · ` : ''}Enter to create · Esc to close`}
      </div>
    </div>
  );
}
