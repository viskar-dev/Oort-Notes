import { useEffect, useState } from 'react';
import {
  ChevronRight,
  Copy,
  Eye,
  EyeOff,
  Info,
  MoreHorizontal,
  RotateCcw,
} from 'lucide-react';
import { SettingsLayout } from '@/components/layout/settings-layout';
import { isTauri } from '@tauri-apps/api/core';
import {
  aiClearKey,
  aiGetConfig,
  aiHasKey,
  aiMcpInfo,
  aiRotateMcpToken,
  aiSetConfig,
  aiSetKey,
  type AiConnectionInfo,
} from '@/features/ai/ai-ipc';
import { type AiDestructivePolicy, useAiPolicyStore } from '@/features/ai/policy-store';

/* shared input/button classes for the flat settings look:
   inputs are the only bordered elements on the page */
const INPUT_CLS =
  'h-9 w-full rounded-lg border border-white/[0.08] bg-white/[0.03] px-3 text-[13px] text-ink outline-none transition-colors placeholder:text-muted-foreground focus:border-primary';
const GHOST_BTN_CLS =
  'h-8 rounded-md px-3 text-[13px] text-[#c8c8cc] transition-colors hover:bg-white/[0.06] hover:text-ink';

/** Route: '/settings/ai' — desktop only (the AI features themselves run
 *  inside the local desktop app). Provider/model config in the settings
 *  table, the API key in the OS keychain:
 *  - config rows never contain the key,
 *  - the key input is write-only (type=password, never fetched back),
 *  - the MCP URL (endpoint + token) is shown and copyable; token rotation is
 *    behind the ⋯ menu. The endpoint persists across app restarts. */
export function AiSettingsPage() {
  const [config, setConfig] = useState<{
    base_url: string;
    model: string;
    destructive_policy: string;
  } | null>(null);
  const [hasKey, setHasKey] = useState(false);
  const [keyDraft, setKeyDraft] = useState('');
  const [mcp, setMcp] = useState<AiConnectionInfo | null>(null);
  const [tokenRotated, setTokenRotated] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [status, setStatus] = useState<string | null>(null);
  /** UI-only locals for the flat look: token reveal, replace-key input,
   *  remote-setup expander and the ⋯ menu. */
  const [tokenRevealed, setTokenRevealed] = useState(false);
  const [keyInputOpen, setKeyInputOpen] = useState(false);
  const [remoteOpen, setRemoteOpen] = useState(false);
  const [mcpMenuOpen, setMcpMenuOpen] = useState(false);

  /** The one URL hosted connectors (and readers of this panel) need: the
   *  endpoint path plus the token, which the wizard cannot send in a
   *  header. Rotating the token changes every URL below. */
  const mcpUrl = mcp
    ? `http://127.0.0.1:${mcp.port}/mcp?access_token=${mcp.token}`
    : '';
  const mcpUrlMasked = mcp
    ? `http://127.0.0.1:${mcp.port}/mcp?access_token=••••••••••••`
    : '';

  useEffect(() => {
    if (!isTauri()) return;
    let cancelled = false;
    void (async () => {
      try {
        const [cfg, keyHit, mcpInfo] = await Promise.all([aiGetConfig(), aiHasKey(), aiMcpInfo()]);
        if (cancelled) return;
        setConfig({ ...cfg, destructive_policy: normPolicy(cfg.destructive_policy) });
        setHasKey(keyHit);
        setMcp(mcpInfo);
        // Keep the live executors in sync with the stored policy.
        useAiPolicyStore.getState().set(normPolicy(cfg.destructive_policy));
      } catch (e) {
        if (!cancelled) setError(e instanceof Error ? e.message : String(e));
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  function flash(message: string) {
    setStatus(message);
    setTimeout(() => setStatus((current) => (current === message ? null : current)), 2500);
  }

  async function saveConfig() {
    if (!config) return;
    const policy = normPolicy(config.destructive_policy);
    try {
      await aiSetConfig(config.base_url.trim(), config.model.trim(), policy);
      // No remount happens after a save; the live store carries it into the
      // running canvas executors immediately.
      useAiPolicyStore.getState().set(policy);
      flash('Saved');
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    }
  }

  async function saveKey() {
    if (keyDraft.trim().length === 0) return;
    try {
      await aiSetKey(keyDraft.trim());
      setKeyDraft('');
      setHasKey(true);
      setKeyInputOpen(false);
      flash('API key stored in the keychain');
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    }
  }

  async function clearKey() {
    try {
      await aiClearKey();
      setHasKey(false);
      flash('API key removed');
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    }
  }

  async function copy(text: string, message: string) {
    try {
      await navigator.clipboard.writeText(text);
      flash(message);
    } catch {
      flash('Copy blocked — select the URL text instead');
    }
  }

  async function rotateToken() {
    try {
      const info = await aiRotateMcpToken();
      setMcp(info);
      setTokenRotated(true);
      setMcpMenuOpen(false);
      flash('New MCP token generated');
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    }
  }

  /** Re-read the connection info — mainly to refresh the canvas-pin status
   *  after opening or leaving a canvas while this page is up. */
  async function refreshMcp() {
    try {
      setMcp(await aiMcpInfo());
      flash('Status refreshed');
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    }
  }

  return (
    <SettingsLayout section="ai">
      {!isTauri() ? (
        <div className="max-w-[640px]">
          <h1 className="text-xl font-semibold text-ink">AI</h1>
          <p className="mt-8 max-w-[640px] text-[13px] text-muted-foreground">
            The AI assistant runs inside the Oort desktop app. Open AI settings in the desktop
            build to configure it.
          </p>
        </div>
      ) : (
        <div className="max-w-[640px] pb-16">
          <h1 className="text-xl font-semibold text-ink">AI</h1>

          <div className="mt-8">
            {/* ── Section 1 · Model provider ─────────────────────────── */}
            <section>
              <h2 className="text-sm font-medium text-ink">Model provider</h2>
              {config === null ? (
                <p className="mt-3 text-[13px] text-muted-foreground">Loading…</p>
              ) : (
                <>
                  <div className="mt-3 grid grid-cols-2 gap-3">
                    <label className="flex flex-col gap-1.5">
                      <span className="text-xs text-muted-foreground">Base URL</span>
                      <input
                        value={config.base_url}
                        onChange={(e) => setConfig({ ...config, base_url: e.target.value })}
                        className={INPUT_CLS}
                        placeholder="https://api.openai.com/v1"
                      />
                    </label>
                    <label className="flex flex-col gap-1.5">
                      <span className="text-xs text-muted-foreground">Model</span>
                      <input
                        value={config.model}
                        onChange={(e) => setConfig({ ...config, model: e.target.value })}
                        className={INPUT_CLS}
                        placeholder="gpt-4o-mini"
                      />
                    </label>
                  </div>
                  <div className="mt-4 grid grid-cols-2 gap-3">
                    <label className="flex flex-col gap-1.5">
                      <span className="text-xs text-muted-foreground">
                        Destructive tools (MCP clients)
                      </span>
                      <select
                        value={config.destructive_policy}
                        onChange={(e) =>
                          setConfig({ ...config, destructive_policy: e.target.value })
                        }
                        className={INPUT_CLS}
                      >
                        <option value="ask" className="bg-[#111016]">
                          Ask in the client each time
                        </option>
                        <option value="auto_confirm" className="bg-[#111016]">
                          Delete right away
                        </option>
                      </select>
                    </label>
                    <div />
                  </div>
                  {/* no “Test connection”: the current UI has no such control
                      and inventing a stub is out of scope */}
                  <div className="mt-4 flex items-center gap-2">
                    <button
                      onClick={() => void saveConfig()}
                      className="h-8 rounded-md bg-primary px-4 text-[13px] font-medium text-primary-foreground transition-opacity hover:opacity-90"
                    >
                      Save
                    </button>
                    <span className="text-xs text-muted-foreground">
                      Applies to external MCP clients. The in-app assistant
                      always confirms before deleting.
                    </span>
                  </div>
                </>
              )}
            </section>

            <hr className="my-5 h-px border-0 bg-white/[0.06]" />

            {/* ── Section 2 · API key ────────────────────────────────── */}
            <section>
              <div className="flex items-center gap-1.5">
                <h2 className="text-sm font-medium text-ink">API key</h2>
                <span
                  title="Never shown again, never logged, never sent anywhere except the configured provider."
                  className="inline-flex h-4 w-4 items-center justify-center rounded-full text-muted-foreground hover:text-ink"
                  aria-label="Never shown again, never logged, never sent anywhere except the configured provider."
                  role="note"
                >
                  <Info className="h-3.5 w-3.5" strokeWidth={1.5} />
                </span>
              </div>
              <p className="mt-3 text-[13px] text-muted-foreground">Stored in your OS keychain.</p>

              {hasKey ? (
                <div className="mt-3 flex items-center">
                  <span
                    aria-label="API key is stored"
                    className="select-none font-mono text-xs tracking-[3px] text-muted-foreground"
                  >
                    ••••••••••••
                  </span>
                  <span className="ml-4 flex items-center gap-2 text-[13px] text-muted-foreground">
                    <span className="inline-block h-1.5 w-1.5 rounded-full bg-emerald-500" />
                    Stored
                  </span>
                  <div className="ml-auto flex items-center gap-1">
                    <button onClick={() => setKeyInputOpen((open) => !open)} className={GHOST_BTN_CLS}>
                      {keyInputOpen ? 'Cancel' : 'Replace'}
                    </button>
                    <button
                      onClick={() => void clearKey()}
                      className="h-8 rounded-md px-3 text-[13px] text-red-400/80 transition-colors hover:bg-white/[0.06] hover:text-red-300"
                    >
                      Remove
                    </button>
                  </div>
                </div>
              ) : (
                /* no key yet: the input flow shows directly (same as before) */
                <div className="mt-3 flex items-center gap-2">
                  <input
                    type="password"
                    value={keyDraft}
                    autoComplete="off"
                    onChange={(e) => setKeyDraft(e.target.value)}
                    className={INPUT_CLS}
                    placeholder="sk-…"
                    aria-label="New key"
                  />
                  <button
                    onClick={() => void saveKey()}
                    disabled={keyDraft.trim().length === 0}
                    className="h-8 shrink-0 rounded-md bg-primary px-4 text-[13px] font-medium text-primary-foreground transition-opacity hover:opacity-90 disabled:opacity-40"
                  >
                    Store
                  </button>
                </div>
              )}

              {hasKey && keyInputOpen && (
                /* Replace flow: same storeKey handler, entered from Replace */
                <div className="mt-3 flex items-center gap-2">
                  <input
                    type="password"
                    value={keyDraft}
                    autoComplete="off"
                    autoFocus
                    onChange={(e) => setKeyDraft(e.target.value)}
                    className={INPUT_CLS}
                    placeholder="sk-…"
                    aria-label="New key"
                  />
                  <button
                    onClick={() => void saveKey()}
                    disabled={keyDraft.trim().length === 0}
                    className="h-8 shrink-0 rounded-md bg-primary px-4 text-[13px] font-medium text-primary-foreground transition-opacity hover:opacity-90 disabled:opacity-40"
                  >
                    Store
                  </button>
                </div>
              )}
            </section>

            <hr className="my-5 h-px border-0 bg-white/[0.06]" />

            {/* ── Section 3 · MCP server ─────────────────────────────── */}
            <section>
              <div className="flex items-center">
                <h2 className="text-sm font-medium text-ink">MCP server</h2>
                <div className="ml-auto flex items-center gap-1">
                  {mcp && mcp.active_canvas ? (
                    <span className="flex items-center gap-2 text-[13px] text-muted-foreground">
                      <span className="inline-block h-1.5 w-1.5 rounded-full bg-emerald-500" />
                      {`Canvas open: “${mcp.active_canvas.name}”`}
                    </span>
                  ) : mcp ? (
                    <span
                      title="No canvas is open in the desktop app — canvas tools (get_canvas, notes, diagrams…) fail until you open a chapter page here."
                      className="flex items-center gap-2 text-[13px] text-muted-foreground"
                    >
                      <span className="inline-block h-1.5 w-1.5 rounded-full bg-red-500" />
                      No canvas open
                    </span>
                  ) : (
                    <span
                      title="Not running — it starts with the app; reopen Oort if this stays empty."
                      className="flex items-center gap-2 text-[13px] text-muted-foreground"
                    >
                      <span className="inline-block h-1.5 w-1.5 rounded-full bg-red-500" />
                      Not running
                    </span>
                  )}
                  <button
                    onClick={() => void refreshMcp()}
                    title="Re-check the canvas pin and token"
                    aria-label="Refresh MCP status"
                    className="flex h-8 w-8 items-center justify-center rounded-md text-[#c8c8cc] transition-colors hover:bg-white/[0.06] hover:text-ink"
                  >
                    <RotateCcw className="h-3.5 w-3.5" strokeWidth={1.5} />
                  </button>
                </div>
              </div>

              {mcp ? (
                <>
                  {/* url field: reveal / copy / ⋯ live inside the field, no
                      dividers; the ⋯ holds the existing New token action */}
                  <div className="relative mt-3" onMouseLeave={() => setMcpMenuOpen(false)}>
                    <input
                      aria-label="MCP URL"
                      readOnly
                      value={tokenRevealed ? mcpUrl : mcpUrlMasked}
                      onFocus={(e) => e.currentTarget.select()}
                      className={`${INPUT_CLS} pr-[104px] font-mono text-xs`}
                    />
                    <div className="absolute right-1.5 top-1/2 flex -translate-y-1/2 items-center">
                      <button
                        title={tokenRevealed ? 'Hide token' : 'Reveal token'}
                        aria-label={tokenRevealed ? 'Hide token' : 'Reveal token'}
                        onClick={() => setTokenRevealed((r) => !r)}
                        className="flex h-7 w-7 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-white/[0.06] hover:text-ink"
                      >
                        {tokenRevealed ? (
                          <EyeOff className="h-3.5 w-3.5" strokeWidth={1.5} />
                        ) : (
                          <Eye className="h-3.5 w-3.5" strokeWidth={1.5} />
                        )}
                      </button>
                      <button
                        title="Copy MCP URL"
                        aria-label="Copy MCP URL"
                        onClick={() => void copy(mcpUrl, 'MCP URL copied')}
                        className="flex h-7 w-7 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-white/[0.06] hover:text-ink"
                      >
                        <Copy className="h-3.5 w-3.5" strokeWidth={1.5} />
                      </button>
                      <button
                        title="More actions"
                        aria-label="More MCP actions"
                        aria-expanded={mcpMenuOpen}
                        onClick={() => setMcpMenuOpen((open) => !open)}
                        className="flex h-7 w-7 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-white/[0.06] hover:text-ink"
                      >
                        <MoreHorizontal className="h-4 w-4" strokeWidth={1.5} />
                      </button>
                      {mcpMenuOpen && (
                        <div className="absolute right-0 top-8 z-10 rounded-lg border border-white/[0.08] bg-raised py-1 shadow-[0_4px_16px_rgba(0,0,0,0.4)]">
                          <button
                            title="Generate a new token (invalidates every URL with the old one)"
                            onClick={() => void rotateToken()}
                            className="flex h-8 w-full items-center whitespace-nowrap rounded-md px-3 text-[13px] text-[#c8c8cc] transition-colors hover:bg-white/[0.06] hover:text-ink"
                          >
                            New token
                          </button>
                        </div>
                      )}
                    </div>
                  </div>

                  {tokenRotated && (
                    <p className="mt-3 text-[13px] text-red-300/90">
                      Token rotated — update every connector (ChatGPT, Claude, editors) with the
                      URL shown above; URLs and configs with the old token no longer work.
                    </p>
                  )}

                  {/* remote setup: collapsed one-liner expander, dynamic port */}
                  <div className="mt-3">
                    <button
                      onClick={() => setRemoteOpen((open) => !open)}
                      aria-expanded={remoteOpen}
                      className="-ml-3 flex h-8 items-center gap-1 rounded-md px-3 text-[13px] text-muted-foreground transition-colors hover:bg-white/[0.06] hover:text-ink"
                    >
                      <ChevronRight
                        className={`h-3 w-3 transition-transform ${remoteOpen ? 'rotate-90' : ''}`}
                        strokeWidth={1.5}
                      />
                      Remote setup
                    </button>
                    {remoteOpen && (
                      <p className="mt-1 text-[13px] text-muted-foreground">
                        Run <code className="text-ink">ngrok http {mcp.port}</code>, then replace{' '}
                        <code className="text-ink">127.0.0.1:{mcp.port}</code> in the URL with your
                        tunnel domain.
                      </p>
                    )}
                  </div>
                </>
              ) : (
                <p className="mt-3 text-[13px] text-muted-foreground">
                  It starts with the app; reopen Oort if this stays empty.
                </p>
              )}
            </section>
          </div>
        </div>
      )}

      {status && (
        <div className="mt-4 rounded-lg bg-emerald-950/70 px-3 py-2 text-[13px] text-emerald-300">
          {status}
        </div>
      )}
      {error && (
        <div className="mt-4 rounded-lg bg-red-950/80 px-3 py-2 text-[13px] text-red-300">{error}</div>
      )}
    </SettingsLayout>
  );
}
