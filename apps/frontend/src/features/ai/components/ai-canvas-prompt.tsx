import { useEffect, useRef, useState } from 'react';
import type { Editor } from 'tldraw';
import { useAiStore, type ConversationEvent } from '../ai-store';
import { useAiCanvasPromptStore } from '../canvas-prompt-store';
import { outlineShapes } from '../canvas-outline';
import { useCameraTick } from '../use-camera-tick';
import { MessageResponse } from '@/components/ai-elements/message';
import { OortMark } from './ai-mark';

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
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  // Camera moves must re-place the card once it is world-anchored.
  useCameraTick(getEditor);

  // Focus when it opens (autofocus collides with the context menu's own
  // teardown — the card mounts after the menu closes).
  useEffect(() => {
    const id = window.setTimeout(() => textareaRef.current?.focus(), 20);
    return () => window.clearTimeout(id);
  }, []);

  // Click elsewhere dismisses (the way every popover in the app behaves) —
  // but only once a submitted turn has settled. While the card is working
  // (or showing its fresh answer), clicking the canvas keeps it anchored:
  // the turn runs in the background and the answer lands whenever the user
  // comes back. The canvas stays fully interactive meanwhile.
  useEffect(() => {
    const busy = pending !== null;
    const onPointerDown = (event: PointerEvent) => {
      const target = event.target instanceof Element ? event.target : null;
      if (target && target.closest('[data-testid="ai-canvas-prompt"]')) return;
      if (busy) return;
      onClose();
    };
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape' && !busy) onClose();
    };
    document.addEventListener('pointerdown', onPointerDown, true);
    document.addEventListener('keydown', onKeyDown);
    return () => {
      document.removeEventListener('pointerdown', onPointerDown, true);
      document.removeEventListener('keydown', onKeyDown);
    };
  }, [onClose, pending]);

  if (!page) return null;

  const working = pending !== null;
  const expanded = answer !== null;
  const anchored = working || expanded;

  // World anchor: idle the card floats at the right-click's screen position;
  // from submit onwards it is pinned to the canvas position the request was
  // anchored to — pan/zoom moves it with the content, so the user can travel
  // the canvas (chase the ghost glows) while the turn runs.
  let pos = at;
  if (anchored) {
    const editor = getEditor();
    if (editor && typeof editor.pageToScreen === 'function') pos = editor.pageToScreen(page);
  }

  const submit = () => {
    const text = input.trim();
    if (text.length === 0) {
      onClose();
      return;
    }
    if (working) return; // turns queue in the store; one submission at a time here

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
    setInput('');
    setPending(text);
    setAnswer(null);
    const settled = useAiStore.getState().send(text, context).then(
      () => {
        // The final list is authoritative; the store's tail (our slice) is
        // replaced by it via settleTurn.
        const error = useAiStore.getState().error;
        setAnswer(assistantText(useAiStore.getState().events.slice(startIndex)) ||
          (error ? `Request failed: ${error}` : 'No response text — the AI panel has the details.'));
      },
      () => setAnswer('Request failed — the AI panel has the details.'),
    );
    void settled.finally(() => setPending(null));
  };

  const inputRow = (
    <div className="flex items-center gap-2">
      <OortMark working={working} />
      <textarea
        ref={textareaRef}
        rows={1}
        placeholder={working ? 'Working on it…' : 'What should the AI do right here?'}
        className="min-h-5 flex-1 resize-none bg-transparent text-sm outline-none placeholder:text-faint"
        value={input}
        onChange={(e) => setInput(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === 'Enter' && !e.shiftKey) {
            e.preventDefault();
            submit();
          }
        }}
      />
      {!working && selection.length > 0 && (
        <span className="shrink-0 rounded-full bg-foreground/8 px-1.5 py-0.5 text-[10px] text-faint">
          {selection.length}
        </span>
      )}
    </div>
  );

  return (
    <div
      data-testid="ai-canvas-prompt"
      className={[
        'fixed z-50 flex flex-col bg-[#111016] text-[#f4f4f6] ring-1 ring-[#24232c] shadow-lg shadow-black/25',
        expanded
          ? 'w-80 gap-2 rounded-2xl p-2'
          : working
            ? 'h-11 w-11 items-center justify-center rounded-full'
            : 'w-80 flex-row items-center rounded-full py-2 pr-2 pl-3',
      ].join(' ')}
      style={{
        left: Math.min(
          pos.x,
          Math.max(0, window.innerWidth - (expanded ? 344 : 64)),
        ),
        top: Math.min(pos.y, Math.max(0, window.innerHeight - 120)),
      }}
      onPointerDown={(e) => e.stopPropagation()}
    >
      {expanded ? (
        <>
          {/* The settled answer (markdown), pinned to the canvas spot the
              request was anchored to. The live glow state lives on the
              canvas itself — ghost cards at the size of what is created. */}
          <div className="max-h-56 overflow-y-auto px-1 text-xs leading-relaxed">
            <MessageResponse className="text-xs">{answer ?? ''}</MessageResponse>
          </div>
          {inputRow}
        </>
      ) : working ? (
        // Working: ONLY the spinning mark — the glowing ghost cards on the
        // canvas tell the story of what is being produced and where.
        <span aria-hidden className="flex items-center justify-center">
          <OortMark working size={22} />
        </span>
      ) : (
        inputRow
      )}
    </div>
  );
}
