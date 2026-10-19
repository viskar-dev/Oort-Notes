import { useRef } from 'react';
import { isTauri } from '@tauri-apps/api/core';
import type { GoogleConfigView } from '@/lib/ipc';

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
    <div className="mt-4 space-y-3 border-t border-line pt-4">
      {desktop ? (
        <p className="text-xs text-muted-foreground">
          Google sign-in uses a "Desktop app" OAuth client with PKCE
          in your system browser — no client secret, ever. If this
          build doesn't already include one, create an OAuth client
          ID of type <strong>Desktop app</strong> in the Google Cloud
          Console and paste it here.
          {config?.client_id && ` Current: ${config.client_id}`}
        </p>
      ) : (
        <p className="text-xs text-muted-foreground">
          OAuth client credentials (Google Cloud Console → OAuth 2.0).
          Environment variables <code>GOOGLE_CLIENT_ID</code> /{' '}
          <code>GOOGLE_CLIENT_SECRET</code> are used when left empty.
          {config?.client_id && ` Current: ${config.client_id}`}
        </p>
      )}
      <div className="flex gap-2">
        <input
          key={`id-${config?.client_id ?? ''}`}
          ref={clientIdRef}
          defaultValue={config?.client_id ?? ''}
          placeholder="Client ID"
          aria-label="Client ID"
          className="min-w-0 flex-1 rounded-lg border border-line bg-raised px-3 py-2 text-sm outline-none focus:border-primary"
        />
        {!desktop && (
          <input
            key={`secret-${config?.has_secret ? 'saved' : 'empty'}`}
            ref={clientSecretRef}
            placeholder={config?.has_secret ? '•••••••• (saved)' : 'Client secret'}
            type="password"
            aria-label="Client secret"
            className="min-w-0 flex-1 rounded-lg border border-line bg-raised px-3 py-2 text-sm outline-none focus:border-primary"
          />
        )}
        <button
          onClick={save}
          className="shrink-0 rounded-lg border border-line px-3.5 py-2 text-sm font-medium transition-colors hover:bg-raised"
        >
          Save
        </button>
      </div>
    </div>
  );
}
