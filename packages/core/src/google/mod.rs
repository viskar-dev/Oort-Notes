//! Google OAuth 2.0 (installed-app and web-server flows) and the Drive client
//! used for backups.
//!
//! Shared by both shells of the app:
//!   * desktop (Tauri): loopback redirect + PKCE, system browser, refresh
//!     token in the OS keychain
//!   * web (server): redirect through the note-server callback, refresh token
//!     in the local SQLite database
//!
//! Docs implemented here:
//!   * https://developers.google.com/identity/protocols/oauth2/native-app
//!   * https://developers.google.com/workspace/drive/api/guides/manage-uploads
//!   * https://developers.google.com/workspace/drive/api/guides/appdata
//!
//! Backups use the non-sensitive `drive.appdata` scope (hidden per-app space
//! of the user's Drive) so the app never needs Google verification.

pub mod drive;
pub mod oauth;

pub use drive::{DriveClient, DriveFile};
pub use oauth::{
    build_auth_url, exchange_code, fetch_userinfo_email, refresh_access_token, revoke_token, Pkce,
    TokenResponse,
};

use crate::{error::CoreError, repo};
use sqlx::SqlitePool;

/// The hidden per-app space of the user's Drive: files here are invisible in
/// the Drive UI and can only be reached by this app. Not sensitive, so no
/// Google app-verification review is required.
pub const DRIVE_APPDATA_SCOPE: &str = "https://www.googleapis.com/auth/drive.appdata";

/// Everything the app asks for: identifying the connected account plus the
/// app-data space used for backup archives. All three are non-sensitive.
pub const SCOPES: &str = "openid email https://www.googleapis.com/auth/drive.appdata";

/// Where to talk to Google. Kept in a struct so tests can point the whole
/// flow at a local mock server.
#[derive(Debug, Clone)]
pub struct Endpoints {
    pub auth: String,
    pub token: String,
    pub revoke: String,
    pub userinfo: String,
    pub drive: String,
    pub upload: String,
}

impl Default for Endpoints {
    fn default() -> Self {
        Self {
            auth: "https://accounts.google.com/o/oauth2/v2/auth".to_string(),
            token: "https://oauth2.googleapis.com/token".to_string(),
            revoke: "https://oauth2.googleapis.com/revoke".to_string(),
            userinfo: "https://www.googleapis.com/oauth2/v3/userinfo".to_string(),
            drive: "https://www.googleapis.com/drive/v3".to_string(),
            upload: "https://www.googleapis.com/upload/drive/v3".to_string(),
        }
    }
}

/// OAuth client credentials. The settings table wins over the environment so
/// a value pasted in the Backup tab is used without a restart; the env vars
/// (`GOOGLE_CLIENT_ID` / `GOOGLE_CLIENT_SECRET`) cover deployments.
/// Desktop clients are public and need no secret; web clients do.
#[derive(Debug, Clone)]
pub struct GoogleConfig {
    pub client_id: String,
    pub client_secret: Option<String>,
    pub endpoints: Endpoints,
}

impl GoogleConfig {
    /// Loads credentials from the settings table, falling back to the
    /// environment. `Ok(None)` means "not configured yet".
    pub async fn load(pool: &SqlitePool) -> Result<Option<GoogleConfig>, CoreError> {
        let from_table = |key: &'static str| async move {
            Ok::<Option<String>, CoreError>(
                repo::get_setting(pool, key)
                    .await?
                    .filter(|v| !v.trim().is_empty()),
            )
        };
        let from_env = |key: &str| std::env::var(key).ok().filter(|v| !v.trim().is_empty());

        // Build-time default for shipped builds: `OORT_GOOGLE_CLIENT_ID` set
        // while compiling embeds the Desktop-app client id into the binary,
        // so end users never configure anything. Read last: a value pasted
        // in the UI or a runtime env var always wins over the baked one.
        let baked_client_id = option_env!("OORT_GOOGLE_CLIENT_ID")
            .map(str::trim)
            .filter(|s| !s.is_empty())
            .map(str::to_string);

        let Some(client_id) = from_table("google_client_id")
            .await?
            .or_else(|| from_env("GOOGLE_CLIENT_ID"))
            .or(baked_client_id)
        else {
            return Ok(None);
        };
        let client_secret = from_table("google_client_secret")
            .await?
            .or_else(|| from_env("GOOGLE_CLIENT_SECRET"))
            // normalize: trimmed, and blank collapses to None so the desktop
            // flow (public client + PKCE) never sends a secret at all
            .map(|s| s.trim().to_string())
            .filter(|s| !s.is_empty());

        Ok(Some(GoogleConfig {
            client_id,
            client_secret,
            endpoints: Endpoints::default(),
        }))
    }

    pub fn configured(&self) -> Result<(), CoreError> {
        if self.client_id.trim().is_empty() {
            return Err(CoreError::Internal(
                "google oauth client id is not configured".to_string(),
            ));
        }
        Ok(())
    }
}
