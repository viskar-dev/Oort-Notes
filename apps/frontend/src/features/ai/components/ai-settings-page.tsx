import { useEffect, useState } from 'react';
import { Cloud, KeyRound, RotateCcw, Server } from 'lucide-react';
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

/** Route: '/settings/ai' — desktop only (the AI features themselves run
 *  inside the local desktop app). Provider/model config in the settings
 *  table, the API key in the OS keychain:
 *  - config rows never contain the key,
 *  - the key input is write-only (type=password, never fetched back),
 *  - the MCP URL (endpoint + token) is shown and copyable; token rotation is
 *    a button next to it. The endpoint persists across app restarts. */
export function AiSettingsPage() {
  const [config, setConfig] = useState<{ base_url: string; model: string } | null>(null);
  const [hasKey, setHasKey] = useState(false);
  const [keyDraft, setKeyDraft] = useState('');
  const [mcp, setMcp] = useState<AiConnectionInfo | null>(null);
  const [tokenRotated, setTokenRotated] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [status, setStatus] = useState<string | null>(null);

  /** The one URL hosted connectors (and readers of this panel) need: the
   *  endpoint path plus the token, which the wizard cannot send in a
   *  header. Rotating the token changes every URL below. */
  const mcpUrl = mcp
    ? `http://127.0.0.1:${mcp.port}/mcp?access_token=${mcp.token}`
    : '';

  useEffect(() => {
    if (!isTauri()) return;
    let cancelled = false;
    void (async () => {
      try {
        const [cfg, keyHit, mcpInfo] = await Promise.all([aiGetConfig(), aiHasKey(), aiMcpInfo()]);
        if (cancelled) return;
        setConfig(cfg);
        setHasKey(keyHit);
        setMcp(mcpInfo);
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
    try {
      await aiSetConfig(config.base_url.trim(), config.model.trim());
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
        <SectionCard icon={<Cloud className="h-4 w-4" />} title="AI assistant">
          <p className="text-sm text-muted-foreground">
            The AI assistant runs inside the Oort desktop app. Open AI settings in the desktop
            build to configure it.
          </p>
        </SectionCard>
      ) : (
        <div className="flex flex-col gap-6">
          <SectionCard
            icon={<Cloud className="h-4 w-4" />}
            title="Model provider"
            detail="Any OpenAI-compatible endpoint: OpenAI, OpenRouter, LM Studio, Ollama…"
          >
            {config === null ? (
              <p className="text-sm text-muted-foreground">Loading…</p>
            ) : (
              <div className="flex flex-col gap-3">
                <label className="flex flex-col gap-1 text-xs text-muted-foreground">
                  Base URL
                  <input
                    value={config.base_url}
                    onChange={(e) => setConfig({ ...config, base_url: e.target.value })}
                    className="rounded-lg border border-line bg-raised px-3 py-2 text-sm text-ink focus:outline-none focus:ring-1 focus:ring-primary"
                    placeholder="https://api.openai.com/v1"
                  />
                </label>
                <label className="flex flex-col gap-1 text-xs text-muted-foreground">
                  Model
                  <input
                    value={config.model}
                    onChange={(e) => setConfig({ ...config, model: e.target.value })}
                    className="rounded-lg border border-line bg-raised px-3 py-2 text-sm text-ink focus:outline-none focus:ring-1 focus:ring-primary"
                    placeholder="gpt-4o-mini"
                  />
                </label>
                <button
                  onClick={() => void saveConfig()}
                  className="w-fit rounded-lg bg-primary px-3 py-1.5 text-sm font-medium text-primary-foreground"
                >
                  Save
                </button>
              </div>
            )}
          </SectionCard>

          <SectionCard
            icon={<KeyRound className="h-4 w-4" />}
            title="API key"
            detail="Stored in the OS keychain. It is never shown again, never logged, and never sent anywhere except the configured provider."
          >
            <div className="flex items-center gap-2 text-xs text-muted-foreground">
              <span
                className={`inline-block h-2 w-2 rounded-full ${hasKey ? 'bg-emerald-500' : 'bg-faint bg-red-500'}`}
              />
              {hasKey ? 'A key is stored' : 'No key stored — the assistant cannot start without one.'}
            </div>
            <div className="mt-3 flex items-end gap-2">
              <label className="flex flex-1 flex-col gap-1 text-xs text-muted-foreground">
                New key
                <input
                  type="password"
                  value={keyDraft}
                  autoComplete="off"
                  onChange={(e) => setKeyDraft(e.target.value)}
                  className="rounded-lg border border-line bg-raised px-3 py-2 text-sm text-ink focus:outline-none focus:ring-1 focus:ring-primary"
                  placeholder="sk-…"
                />
              </label>
              <button
                onClick={() => void saveKey()}
                disabled={keyDraft.trim().length === 0}
                className="rounded-lg bg-primary px-3 py-1.5 text-sm font-medium text-primary-foreground disabled:opacity-40"
              >
                Store
              </button>
              {hasKey && (
                <button
                  onClick={() => void clearKey()}
                  className="rounded-lg border border-line px-3 py-1.5 text-sm text-muted-foreground hover:text-ink"
                >
                  Remove
                </button>
              )}
            </div>
          </SectionCard>

          <SectionCard
            icon={<Server className="h-4 w-4" />}
            title="MCP server (for external AI clients)"
            detail="The same tools the in-app assistant uses, served on loopback. The address and token are saved and stay the same across app restarts (new only when the port is taken)."
          >
            {mcp ? (
              <div className="flex flex-col gap-3 text-sm">
                <div className="flex items-center gap-2 text-xs text-muted-foreground">
                  <span
                    className={`inline-block h-2 w-2 shrink-0 rounded-full ${mcp.active_canvas ? 'bg-emerald-500' : 'bg-red-500'}`}
                  />
                  <span className="flex-1">
                    {mcp.active_canvas
                      ? `Canvas open: “${mcp.active_canvas.name}” — canvas tools run against it`
                      : 'No canvas is open in the desktop app — canvas tools (get_canvas, notes, diagrams…) fail until you open a chapter page here.'}
                  </span>
                  <button
                    onClick={() => void refreshMcp()}
                    title="Re-check the canvas pin and token"
                    className="shrink-0 rounded-lg border border-line px-2 py-1 text-xs text-muted-foreground hover:text-ink"
                  >
                    Refresh
                  </button>
                </div>
                <label className="flex flex-col gap-1 text-xs text-muted-foreground">
                  Full MCP URL (ChatGPT / Claude connectors — authentication: “No authentication”)
                  <div className="flex items-center gap-2">
                    <input
                      readOnly
                      value={`http://127.0.0.1:${mcp.port}/mcp?access_token=${mcp.token}`}
                      onFocus={(e) => e.currentTarget.select()}
                      className="min-w-0 flex-1 rounded-lg border border-line bg-raised px-3 py-2 font-mono text-xs text-ink"
                    />
                    <button
                      onClick={() => void copy(mcpUrl, 'MCP URL copied')}
                      className="rounded-lg border border-line px-3 py-2 text-sm text-muted-foreground hover:text-ink"
                    >
                      Copy
                    </button>
                  </div>
                </label>
                <div className="flex items-start gap-2 text-xs text-muted-foreground">
                  <span>
                    For remote clients (ChatGPT apps, Claude connectors), tunnel the port first —
                    e.g. <code className="text-ink">ngrok http {mcp.port}</code> — and swap{' '}
                    <code className="text-ink">127.0.0.1:{mcp.port}</code> in the copied URL for
                    your tunnel domain, keeping <code className="text-ink">/mcp?access_token=…</code>.
                    Local editors (VS Code, Zed, Inspector) can use the loopback URL as-is.
                  </span>
                  <button
                    onClick={() => void rotateToken()}
                    title="Generate a new token (invalidates every URL with the old one)"
                    className="flex shrink-0 items-center gap-1 rounded-lg border border-line px-2 py-1 text-xs text-muted-foreground hover:text-ink"
                  >
                    <RotateCcw className="h-3 w-3" />
                    New token
                  </button>
                </div>
                {tokenRotated && (
                  <div className="rounded-lg bg-red-950/60 px-3 py-2 text-xs text-red-300">
                    Token rotated — update every connector (ChatGPT, Claude, editors) with the URL
                    shown above; URLs and configs with the old token no longer work.
                  </div>
                )}
              </div>
            ) : (
              <p className="text-sm text-muted-foreground">
                Not running — it starts with the app; reopen Oort if this stays empty.
              </p>
            )}
          </SectionCard>
        </div>
      )}

      {status && (
        <div className="mt-4 rounded-lg bg-emerald-950/70 px-3 py-2 text-xs text-emerald-300">
          {status}
        </div>
      )}
      {error && (
        <div className="mt-4 rounded-lg bg-red-950/80 px-3 py-2 text-xs text-red-300">{error}</div>
      )}
    </SettingsLayout>
  );
}

function SectionCard({
  icon,
  title,
  detail,
  children,
}: {
  icon: React.ReactNode;
  title: string;
  detail?: string;
  children: React.ReactNode;
}) {
  return (
    <section className="rounded-xl border border-line bg-surface p-5">
      <header className="mb-3 flex items-center gap-2">
        <span className="text-muted-foreground">{icon}</span>
        <h2 className="text-sm font-semibold text-ink">{title}</h2>
      </header>
      {detail && <p className="mb-3 text-xs text-muted-foreground">{detail}</p>}
      {children}
    </section>
  );
}
