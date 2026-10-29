import { useEffect, useState, type ReactNode } from 'react';
import { Copy, Eye, EyeOff, MoreHorizontal, RotateCcw } from 'lucide-react';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
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
import { normPolicy, useAiPolicyStore } from '@/features/ai/policy-store';
import { toast } from 'sonner';

const INPUT_CLS =
  'h-9 w-full rounded-lg border border-white/[0.08] bg-white/[0.03] px-3 text-[13px] text-ink outline-none transition-colors placeholder:text-muted-foreground focus:border-primary';
const GHOST_BTN_CLS =
  'h-8 shrink-0 rounded-md px-3 text-[13px] text-fg-2 transition-colors hover:bg-white/[0.06] hover:text-ink';
const PRIMARY_BTN_CLS =
  'h-8 shrink-0 rounded-md bg-primary px-4 text-[13px] font-medium text-primary-foreground transition-opacity hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-40';
const ICON_BTN_CLS =
  'flex h-7 w-7 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-white/[0.06] hover:text-ink';

type Config = {
  base_url: string;
  model: string;
  destructive_policy: string;
};

const errMsg = (e: unknown) => (e instanceof Error ? e.message : String(e));

const POLICY_ITEMS: Record<string, string> = {
  ask: 'Ask each time',
  auto_confirm: 'Delete right away',
};

function Section({
  title,
  aside,
  children,
}: {
  title: string;
  aside?: ReactNode;
  children?: ReactNode;
}) {
  return (
    <section className="border-t border-white/[0.06] py-6 first:border-t-0 first:pt-0">
      <div className="mb-3 flex min-h-8 items-center justify-between gap-3">
        <h2 className="text-sm font-medium text-ink">{title}</h2>
        {aside}
      </div>
      {children}
    </section>
  );
}

function KeyInput({
  value,
  onChange,
  onSubmit,
  onCancel,
}: {
  value: string;
  onChange: (v: string) => void;
  onSubmit: () => void;
  onCancel?: () => void;
}) {
  const empty = value.trim().length === 0;
  return (
    <div className="flex items-center gap-2">
      <input
        type="password"
        value={value}
        autoComplete="off"
        autoFocus={Boolean(onCancel)}
        onChange={(e) => onChange(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === 'Enter' && !empty) onSubmit();
        }}
        className={INPUT_CLS}
        placeholder="sk-…"
        aria-label="API key"
      />
      {onCancel && (
        <button onClick={onCancel} className={GHOST_BTN_CLS}>
          Cancel
        </button>
      )}
      <button onClick={onSubmit} disabled={empty} className={PRIMARY_BTN_CLS}>
        Store
      </button>
    </div>
  );
}

export function AiSettingsPage() {
  const tauri = isTauri();
  const [config, setConfig] = useState<Config | null>(null);
  const [savedConfig, setSavedConfig] = useState<Config | null>(null);
  const [hasKey, setHasKey] = useState(false);
  const [keyDraft, setKeyDraft] = useState('');
  const [replacing, setReplacing] = useState(false);
  const [mcp, setMcp] = useState<AiConnectionInfo | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [tokenRevealed, setTokenRevealed] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);

  const mcpUrl = mcp ? `http://127.0.0.1:${mcp.port}/mcp?access_token=${mcp.token}` : '';
  const mcpUrlMasked = mcp
    ? `http://127.0.0.1:${mcp.port}/mcp?access_token=••••••••••••`
    : '';

  const dirty =
    config !== null &&
    savedConfig !== null &&
    (config.base_url !== savedConfig.base_url ||
      config.model !== savedConfig.model ||
      config.destructive_policy !== savedConfig.destructive_policy);

  const canvasName = mcp?.active_canvas?.name;
  const status = !mcp
    ? { dot: 'bg-destructive', text: 'Not running' }
    : canvasName
      ? { dot: 'bg-ok', text: canvasName }
      : { dot: 'bg-amber-500', text: 'No canvas open' };

  useEffect(() => {
    if (!tauri) return;
    let cancelled = false;
    void (async () => {
      try {
        const [cfg, keyHit, mcpInfo] = await Promise.all([aiGetConfig(), aiHasKey(), aiMcpInfo()]);
        if (cancelled) return;
        const loaded = { ...cfg, destructive_policy: normPolicy(cfg.destructive_policy) };
        setConfig(loaded);
        setSavedConfig(loaded);
        setHasKey(keyHit);
        setMcp(mcpInfo);
        useAiPolicyStore.getState().set(loaded.destructive_policy);
      } catch (e) {
        if (!cancelled) setError(errMsg(e));
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [tauri]);

  async function saveConfig() {
    if (!config) return;
    const destructivePolicy = normPolicy(config.destructive_policy);
    const next: Config = {
      base_url: config.base_url.trim(),
      model: config.model.trim(),
      destructive_policy: destructivePolicy,
    };
    setSaving(true);
    try {
      await aiSetConfig(next.base_url, next.model, destructivePolicy);
      useAiPolicyStore.getState().set(destructivePolicy);
      setConfig(next);
      setSavedConfig(next);
      toast.success('Saved');
    } catch (e) {
      toast.error('Could not save', { description: errMsg(e) });
    } finally {
      setSaving(false);
    }
  }

  async function saveKey() {
    const key = keyDraft.trim();
    if (!key) return;
    try {
      await aiSetKey(key);
      setKeyDraft('');
      setHasKey(true);
      setReplacing(false);
      toast.success('API key stored');
    } catch (e) {
      toast.error('Could not store the key', { description: errMsg(e) });
    }
  }

  async function clearKey() {
    try {
      await aiClearKey();
      setHasKey(false);
      toast.success('API key removed');
    } catch (e) {
      toast.error('Could not remove the key', { description: errMsg(e) });
    }
  }

  async function copyUrl() {
    try {
      await navigator.clipboard.writeText(mcpUrl);
      toast.success('Copied');
    } catch {
      toast.error('Copy blocked');
    }
  }

  async function rotateToken() {
    try {
      setMcp(await aiRotateMcpToken());
      setMenuOpen(false);
      toast.success('New token generated', {
        description: 'Update any connector using the old URL.',
      });
    } catch (e) {
      toast.error('Could not rotate the token', { description: errMsg(e) });
    }
  }

  async function refreshMcp() {
    try {
      setMcp(await aiMcpInfo());
    } catch (e) {
      toast.error('Could not refresh', { description: errMsg(e) });
    }
  }

  return (
    <SettingsLayout section="ai">
      <div className="max-w-[640px] pb-16">
        <h1 className="text-xl font-semibold text-ink">AI</h1>

        {!tauri ? (
          <p className="mt-8 text-[13px] text-muted-foreground">
            Available in the desktop app.
          </p>
        ) : (
          <div className="mt-8">
            <Section title="Model provider">
              {config === null ? (
                <p className="text-[13px] text-muted-foreground">Loading…</p>
              ) : (
                <>
                  <div className="grid grid-cols-[3fr_2fr] gap-3">
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

                  <div className="mt-4 flex items-center justify-between gap-6">
                    <label htmlFor="ai-destructive-policy" className="text-[13px] text-ink">
                      MCP deletions
                    </label>
                    <div className="w-56 shrink-0">
                      <Select
                        value={config.destructive_policy}
                        onValueChange={(v) => {
                          if (v) setConfig({ ...config, destructive_policy: String(v) });
                        }}
                        items={POLICY_ITEMS}
                      >
                        <SelectTrigger id="ai-destructive-policy" className="w-full">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          {Object.entries(POLICY_ITEMS).map(([value, label]) => (
                            <SelectItem key={value} value={value} label={label}>
                              {label}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                  </div>

                  <div className="mt-5 flex justify-end">
                    <button
                      onClick={() => void saveConfig()}
                      disabled={!dirty || saving}
                      className={PRIMARY_BTN_CLS}
                    >
                      Save
                    </button>
                  </div>
                </>
              )}
            </Section>

            <Section title="API key">
              {hasKey && !replacing ? (
                <div className="flex items-center gap-2">
                  <div
                    aria-label="API key is stored"
                    className="flex h-9 min-w-0 flex-1 select-none items-center rounded-lg border border-white/[0.08] bg-white/[0.03] px-3 font-mono text-xs tracking-[3px] text-muted-foreground"
                  >
                    ••••••••••••
                  </div>
                  <button onClick={() => setReplacing(true)} className={GHOST_BTN_CLS}>
                    Replace
                  </button>
                  <button
                    onClick={() => void clearKey()}
                    className="h-8 shrink-0 rounded-md px-3 text-[13px] text-destructive transition-colors hover:bg-white/[0.06]"
                  >
                    Remove
                  </button>
                </div>
              ) : (
                <KeyInput
                  value={keyDraft}
                  onChange={setKeyDraft}
                  onSubmit={() => void saveKey()}
                  onCancel={
                    hasKey
                      ? () => {
                          setKeyDraft('');
                          setReplacing(false);
                        }
                      : undefined
                  }
                />
              )}
            </Section>

            <Section
              title="MCP server"
              aside={
                <div className="flex items-center gap-1">
                  <span className="flex min-w-0 items-center gap-2 text-[13px] text-muted-foreground">
                    <span className={`h-1.5 w-1.5 shrink-0 rounded-full ${status.dot}`} />
                    <span className="max-w-[220px] truncate">{status.text}</span>
                  </span>
                  <button
                    onClick={() => void refreshMcp()}
                    title="Refresh"
                    aria-label="Refresh MCP status"
                    className="flex h-8 w-8 items-center justify-center rounded-md text-fg-2 transition-colors hover:bg-white/[0.06] hover:text-ink"
                  >
                    <RotateCcw className="h-3.5 w-3.5" strokeWidth={1.5} />
                  </button>
                </div>
              }
            >
              {mcp && (
                <div className="relative" onMouseLeave={() => setMenuOpen(false)}>
                  <input
                    aria-label="MCP URL"
                    readOnly
                    value={tokenRevealed ? mcpUrl : mcpUrlMasked}
                    onFocus={(e) => e.currentTarget.select()}
                    className={`${INPUT_CLS} pr-[104px] font-mono text-xs`}
                  />
                  <div className="absolute right-1.5 top-1/2 flex -translate-y-1/2 items-center">
                    <button
                      title={tokenRevealed ? 'Hide' : 'Reveal'}
                      aria-label={tokenRevealed ? 'Hide token' : 'Reveal token'}
                      onClick={() => setTokenRevealed((r) => !r)}
                      className={ICON_BTN_CLS}
                    >
                      {tokenRevealed ? (
                        <EyeOff className="h-3.5 w-3.5" strokeWidth={1.5} />
                      ) : (
                        <Eye className="h-3.5 w-3.5" strokeWidth={1.5} />
                      )}
                    </button>
                    <button
                      title="Copy"
                      aria-label="Copy MCP URL"
                      onClick={() => void copyUrl()}
                      className={ICON_BTN_CLS}
                    >
                      <Copy className="h-3.5 w-3.5" strokeWidth={1.5} />
                    </button>
                    <button
                      title="More"
                      aria-label="More MCP actions"
                      aria-expanded={menuOpen}
                      onClick={() => setMenuOpen((open) => !open)}
                      className={ICON_BTN_CLS}
                    >
                      <MoreHorizontal className="h-4 w-4" strokeWidth={1.5} />
                    </button>
                    {menuOpen && (
                      <div className="absolute right-0 top-8 z-10 rounded-lg border border-white/[0.08] bg-raised py-1 shadow-[0_4px_16px_rgba(0,0,0,0.4)]">
                        <button
                          onClick={() => void rotateToken()}
                          className="flex h-8 w-full items-center whitespace-nowrap rounded-md px-3 text-[13px] text-fg-2 transition-colors hover:bg-white/[0.06] hover:text-ink"
                        >
                          New token
                        </button>
                      </div>
                    )}
                  </div>
                </div>
              )}
            </Section>
          </div>
        )}

        {error && (
          <div className="mt-4 rounded-lg bg-destructive/10 px-3 py-2 text-[13px] text-destructive">
            {error}
          </div>
        )}
      </div>
    </SettingsLayout>
  );
}
