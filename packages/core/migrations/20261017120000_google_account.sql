-- Google Drive account link (one row: this app is single-user per device).
--
-- The refresh token is the long-lived credential that lets backups run
-- unattended; everything else here is display metadata.
--   * web mode:  the token lives in this table (server-side storage)
--   * desktop:   the token lives in the OS keychain; the column stays NULL
--                and the app reads it through note_core::backup::KeyringTokenStore

CREATE TABLE google_account (
  id            INTEGER PRIMARY KEY CHECK (id = 1),
  email         TEXT,
  refresh_token TEXT,
  scopes        TEXT NOT NULL DEFAULT '',
  connected_at  INTEGER NOT NULL DEFAULT (CAST((julianday('now') - 2440587.5) * 86400000 AS INTEGER))
);

PRAGMA user_version = 5;   -- increment with every migration
