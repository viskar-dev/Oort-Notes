import { useEffect, useRef, useState } from 'react';
import { Eraser, X, ExternalLink, ArrowUp, Square } from 'lucide-react';
import { Link } from 'react-router-dom';
import { aiIsReadOnly, useAiStore, type ConversationEvent } from '../ai-store';
import { useAiConfirmStore } from '../confirm-store';
import { Message, MessageContent, MessageResponse } from '@/components/ai-elements/message';
import { Shimmer } from '@/components/ai-elements/shimmer';
import { OortMark } from './ai-mark';

/** Floating AI chat overlay, anchored bottom-right in the canvas area.
 *  Renders the conversation timeline (user prompts, assistant replies,
 *  tool activity with screenshots) and the composer. Escape closes. */
export function AiChatPanel() {
  const open = useAiStore((s) => s.open);
  const setOpen = useAiStore((s) => s.setOpen);
  const events = useAiStore((s) => s.events);
  const busy = useAiStore((s) => s.busy);
  const error = useAiStore((s) => s.error);
  const send = useAiStore((s) => s.send);
  const requestStop = useAiStore((s) => s.requestStop);
  const clear = useAiStore((s) => s.clear);
  const draftRef = useRef<HTMLTextAreaElement>(null);
  const scrollRef = useRef<HTMLDivElement>(null);
  const [hasText, setHasText] = useState(false);
  /** A Stop press is pending: the turn ends at the next tool boundary. */
  const [cancelling, setCancelling] = useState(false);

  // New events keep the transcript pinned to the bottom.
  useEffect(() => {
    const el = scrollRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [events, busy, error]);

  // The turn settling (any way) resets the Stop state.
  useEffect(() => {
    if (!busy) setCancelling(false);
  }, [busy]);

  // reset the draft surface whenever it opens
  useEffect(() => {
    if (open) {
      setHasText(false);
      const input = draftRef.current;
      if (input) {
        input.value = '';
        autoGrow(input);
      }
    }
  }, [open]);

  if (!open) return null;

  const canSend = !busy && !aiIsReadOnly();

  function autoGrow(el: HTMLTextAreaElement) {
    el.style.height = 'auto';
    el.style.height = `${Math.min(el.scrollHeight, 96)}px`;
  }

  function submit() {
    const input = draftRef.current;
    if (!input || !canSend) return;
    void send(input.value);
    input.value = '';
    autoGrow(input);
    setHasText(false);
    input.focus();
  }

  const readOnly = aiIsReadOnly();

  return (
    <div className="absolute bottom-4 right-4 z-40 flex h-[520px] max-h-[calc(100%-2rem)] w-[360px] flex-col overflow-hidden rounded-2xl border border-line bg-surface shadow-2xl">
      <header className="flex h-10 shrink-0 items-center gap-2 border-b border-line px-3">
        <OortMark working={busy} />
        <span className="text-sm font-semibold text-ink">AI assistant</span>
        <span className="flex-1" />
        <button
          title="Clear conversation"
          onClick={clear}
          className="rounded-md p-1.5 text-muted-foreground hover:bg-raised hover:text-foreground"
        >
          <Eraser className="h-4 w-4" />
        </button>
        <Link
          to="/settings/ai"
          title="AI settings"
          className="rounded-md p-1.5 text-muted-foreground hover:bg-raised hover:text-foreground"
        >
          <ExternalLink className="h-4 w-4" />
        </Link>
        <button
          title="Close (Esc)"
          onClick={() => setOpen(false)}
          className="rounded-md p-1.5 text-muted-foreground hover:bg-raised hover:text-foreground"
        >
          <X className="h-4 w-4" />
        </button>
      </header>

      <div ref={scrollRef} className="min-h-0 flex-1 overflow-y-auto px-3 py-2">
        {events.length === 0 && !error && (
          <div className="mt-8 px-4 text-center text-xs text-muted-foreground">
            <div className="mx-auto mb-3 w-fit opacity-70">
              <OortMark size={22} />
            </div>
            Work on the open canvas with me: ask questions about its content, ask for notes,
            diagrams or shapes. I only see and edit the canvas you have open.
          </div>
        )}
        {events.map((event, index) => (
          <TimelineEntry key={index} event={event} />
        ))}
        {busy && (
          // the canvas-agent working state, same as the canvas AI help:
          // spinning mark + shimmer text (streamed events already appear above)
          <div className="flex items-center gap-2 py-2 pl-1">
            <OortMark size={18} working />
            <Shimmer className="text-xs">{cancelling ? 'cancelling…' : 'working…'}</Shimmer>
          </div>
        )}
        {error && (
          <div className="my-2 rounded-lg bg-red-950/80 px-3 py-2 text-xs text-red-300">
            {error}
          </div>
        )}
      </div>

      {/* composer pill: the mark on the front, then the (smarter) input —
          the same shape as the canvas AI-help pill */}
      <footer className="shrink-0 border-t border-line p-2.5">
        <div className="flex items-center gap-2 rounded-full border border-line bg-raised py-1.5 pr-1.5 pl-3">
          <OortMark size={16} working={busy} />
          <textarea
            ref={draftRef}
            rows={1}
            placeholder={readOnly ? 'View mode: read-only questions' : 'Ask about this canvas…'}
            className="max-h-24 min-h-5 flex-1 resize-none bg-transparent text-sm outline-none placeholder:text-muted-foreground"
            onChange={(e) => {
              autoGrow(e.target);
              setHasText(e.target.value.trim().length > 0);
            }}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && !e.shiftKey) {
                e.preventDefault();
                if (canSend) submit();
              } else if (e.key === 'Escape') {
                e.preventDefault();
                setOpen(false);
              }
            }}
          />
          <button
            title={busy ? 'Stop the AI' : 'Send'}
            disabled={busy ? cancelling : !hasText}
            onClick={
              busy
                ? () => {
                    requestStop(); // also flips the backend turn flag
                    setCancelling(true);
                  }
                : submit
            }
            className={`flex h-7 w-7 shrink-0 items-center justify-center rounded-full transition-opacity enabled:hover:opacity-90 disabled:opacity-40 ${
              busy ? 'bg-red-500 text-white' : 'bg-primary text-primary-foreground'
            }`}
          >
            {busy ? <Square className="h-3 w-3 fill-current" /> : <ArrowUp className="h-4 w-4" />}
          </button>
        </div>
        <div className="mt-1 pl-3 text-center text-[10px] text-faint">
          Enter to send · Shift+Enter for a line break
        </div>
      </footer>
    </div>
  );
}

function TimelineEntry({ event }: { event: ConversationEvent }) {
  if (event.kind === 'user') {
    return (
      <Message from="user" className="my-2">
        <MessageContent className="max-w-[92%] gap-1 whitespace-pre-wrap rounded-xl px-3 py-1.5 text-sm group-[.is-user]:bg-secondary">
          {event.text}
        </MessageContent>
      </Message>
    );
  }
  if (event.role === 'tool') {
    return <ToolEntry event={event} />;
  }
  const isNote = event.role === 'system';
  return (
    <Message from="assistant" className="my-2 mr-2">
      <MessageContent className={`gap-1 px-1 ${isNote ? 'text-xs text-muted-foreground' : ''}`}>
        <MessageResponse className={isNote ? 'text-xs text-muted-foreground' : 'text-sm'}>
          {event.text}
        </MessageResponse>
      </MessageContent>
    </Message>
  );
}

function ToolEntry({
  event,
}: {
  event: Extract<ConversationEvent, { kind: 'agent' }>;
}) {
  if (event.role !== 'tool') return null;
  const ok = event.ok !== false;
  const image = event.image_base64;
  return (
    <div className="my-1.5 flex items-start gap-2 pl-1 text-[11px] text-muted-foreground">
      <span
        className={`mt-0.5 inline-block h-1.5 w-1.5 shrink-0 rounded-full ${
          ok ? 'bg-emerald-500' : 'bg-red-500'
        }`}
      />
      <div className="min-w-0">
        <span className="font-mono">{event.tool}</span>
        <span className="text-faint"> {ok ? '' : '· failed'}</span>
        {/* Screenshots show inline, dropped from the stored text. */}
        {image && (
          <img
            src={`data:image/png;base64,${image}`}
            alt="canvas screenshot"
            className="mt-1 w-64 rounded-lg border border-line"
          />
        )}
        {!ok && event.text && (
          <div className="mt-0.5 text-[11px] text-red-500/80">{event.text}</div>
        )}
      </div>
    </div>
  );
}

/** Inline destructive-tool confirmation (delete shapes). Rendered by the
 *  canvas shell (not inside the panel) so it is visible even when the
 *  chat panel is closed while a turn is running. */
export function AiConfirmCard() {
  const request = useAiConfirmStore((s) => s.request);
  const resolve = useAiConfirmStore((s) => s.resolve);
  if (!request) return null;
  return (
    <div className="absolute inset-x-3 top-12 z-50 rounded-xl border border-line bg-raised p-4 shadow-xl">
      <div className="text-sm font-semibold text-ink">{request.title}</div>
      <div className="mt-1 text-xs text-muted-foreground">{request.detail}</div>
      <div className="mt-3 flex justify-end gap-2">
        <button
          onClick={() => resolve(false)}
          className="rounded-lg border border-line bg-surface px-3 py-1.5 text-xs text-ink hover:bg-surface/80"
        >
          Cancel
        </button>
        <button
          onClick={() => resolve(true)}
          className="rounded-lg bg-red-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-red-500"
        >
          Delete
        </button>
      </div>
    </div>
  );
}
