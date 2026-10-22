import { useEffect, useRef } from 'react';
import { Eraser, Loader2, Sparkles, X, ExternalLink } from 'lucide-react';
import { Link } from 'react-router-dom';
import { aiIsReadOnly, useAiStore, type ConversationEvent } from '../ai-store';
import { useAiConfirmStore } from '../confirm-store';

/** Floating AI chat overlay, anchored bottom-right in the canvas area.
 *  Renders the conversation timeline (user prompts, assistant replies, tool
 *  activity with screenshots) and the composer. Escape closes. */
export function AiChatPanel() {
  const open = useAiStore((s) => s.open);
  const setOpen = useAiStore((s) => s.setOpen);
  const events = useAiStore((s) => s.events);
  const busy = useAiStore((s) => s.busy);
  const error = useAiStore((s) => s.error);
  const send = useAiStore((s) => s.send);
  const clear = useAiStore((s) => s.clear);
  const draftRef = useRef<HTMLTextAreaElement>(null);
  const scrollRef = useRef<HTMLDivElement>(null);

  // New events keep the transcript pinned to the bottom.
  useEffect(() => {
    const el = scrollRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [events, busy, error]);

  if (!open) return null;

  const canSend = !busy && !aiIsReadOnly();

  function submit() {
    const input = draftRef.current;
    if (!input) return;
    void send(input.value);
    input.value = '';
    input.focus();
  }

  return (
    <div className="absolute bottom-4 right-4 z-40 flex h-[520px] max-h-[calc(100%-2rem)] w-[360px] flex-col overflow-hidden rounded-xl border border-line bg-surface shadow-2xl">
      <header className="flex h-10 shrink-0 items-center gap-2 border-b border-line px-3">
        <Sparkles className="h-4 w-4 text-primary" />
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
            <Sparkles className="mx-auto mb-3 h-6 w-6 text-faint" />
            Work on the open canvas with me: ask questions about its content, ask for notes,
            diagrams or shapes. I only see and edit the canvas you have open.
          </div>
        )}
        {events.map((event, index) => (
          <TimelineEntry key={index} event={event} />
        ))}
        {busy && (
          <div className="flex items-center gap-2 py-2 pl-1 text-xs text-muted-foreground">
            <Loader2 className="h-3.5 w-3.5 animate-spin" /> working…
          </div>
        )}
        {error && (
          <div className="my-2 rounded-lg bg-red-950/80 px-3 py-2 text-xs text-red-300">
            {error}
          </div>
        )}
      </div>

      <footer className="shrink-0 border-t border-line p-2">
        <textarea
          ref={draftRef}
          rows={2}
          placeholder={aiIsReadOnly() ? 'View mode: read-only questions' : 'Ask about this canvas…'}
          className="block w-full resize-none rounded-lg border border-line bg-raised px-3 py-2 text-sm text-ink placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-primary"
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
        <div className="mt-1.5 flex items-center justify-between px-1">
          <span className="text-[10px] text-faint">Enter to send · Shift+Enter for a line break</span>
          <button
            title="Send"
            disabled={!canSend}
            onClick={submit}
            className="rounded-md bg-primary px-3 py-1 text-xs font-medium text-primary-foreground disabled:opacity-40"
          >
            Send
          </button>
        </div>
      </footer>
    </div>
  );
}

function TimelineEntry({ event }: { event: ConversationEvent }) {
  if (event.kind === 'user') {
    return (
      <div className="my-2 ml-8 rounded-xl bg-raised px-3 py-2 text-sm whitespace-pre-wrap text-ink">
        {event.text}
      </div>
    );
  }
  if (event.role === 'tool') {
    return <ToolEntry event={event} />;
  }
  const isNote = event.role === 'system';
  return (
    <div
      className={`my-2 mr-4 whitespace-pre-wrap text-sm ${
        isNote ? 'pl-1 text-xs text-muted-foreground' : 'text-ink'
      }`}
    >
      {event.text}
    </div>
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
