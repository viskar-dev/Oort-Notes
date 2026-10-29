import { useRef } from 'react';
import { isTauri } from '@tauri-apps/api/core';
import type { GoogleConfigView } from '@/lib/ipc';

/* shared spec input/button classes — same tokens as the AI page */
const INPUT_CLS =
  'h-9 rounded-lg border border-white/[0.08] bg-white/[0.03] px-3 text-[13px] text-ink outline-none transition-colors placeholder:text-muted-foreground focus:border-primary';
const GHOST_BTN_CLS =
  'h-8 rounded-md px-3 text-[13px] text-[#c8c8cc] transition-colors hover:bg-white/[0.06] hover:text-ink';

/** The expandable OAuth client section (client id + optional secret). The
 *  inputs are uncontrolled and start from the saved config; they remount
 *  (and re-prefill) whenever the saved values change. */
export function BackupOAuthConfig({
  config,
  onSave,
}: {
  config: GoogleConfigView | null;
  onSave: (clientId: string, clientSecret: string | null) => void;
}) {
  const clientIdRef = useRef<HTMLInputElement>(null);
  const clientSecretRef = useRef<HTMLInputElement>(null);
  const desktop = isTauri();

  const save = () => {
    onSave(
      clientIdRef.current?.value.trim() ?? '',
      clientSecretRef.current?.value.trim() || null,
    );
  };

  return (
    <div className="mt-3">
      <p className="text-[13px] text-muted-foreground">
        {desktop ? (
          <>
            OAuth client of type <strong className="text-ink">Desktop app</strong> (Google Cloud
            Console → OAuth 2.0), sign-in with PKCE in your system browser — no client secret.
          </>
        ) : (
          <>
            OAuth client credentials (Google Cloud Console → OAuth 2.0). Environment variables{' '}
            <code>GOOGLE_CLIENT_ID</code> / <code>GOOGLE_CLIENT_SECRET</code> are used when left
            empty.
          </>
        )}
        {config?.client_id && ` Current: ${config.client_id}`}
      </p>
      <div className="mt-3 flex gap-2">
        <input
          key={`id-${config?.client_id ?? ''}`}
          ref={clientIdRef}
          defaultValue={config?.client_id ?? ''}
          placeholder="Client ID"
          aria-label="Client ID"
          className={`${INPUT_CLS} min-w-0 flex-1`}
        />
        {!desktop && (
          <input
            key={`secret-${config?.has_secret ? 'saved' : 'empty'}`}
            ref={clientSecretRef}
            placeholder={config?.has_secret ? '•••••••• (saved)' : 'Client secret'}
            type="password"
            aria-label="Client secret"
            className={`${INPUT_CLS} min-w-0 flex-1`}
          />
        )}
        <button onClick={save} className={`${GHOST_BTN_CLS} h-9 shrink-0`}>
          Save
        </button>
      </div>
    </div>
  );
}
