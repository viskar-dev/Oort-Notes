//! Google Drive connect + backup endpoints (web shell).
//!
//! The OAuth dance runs through this server: `/api/google/connect` redirects
//! the browser to Google's consent screen, `/api/google/callback` receives
//! the code and stores the refresh token in the local database. The desktop
//! shell performs its own loopback flow in `apps/desktop/src-tauri`.

use axum::{
    extract::{Query, State},
    http::StatusCode,
    response::Redirect,
    routing::{get, post},
    Json, Router,
};
use note_core::backup::{self, DbTokenStore, RefreshTokenStore};
use note_core::google::{self, DriveClient, GoogleConfig, Pkce};
use note_core::models::BackupSettings;
use note_core::repo;
use serde::{Deserialize, Serialize};
use sqlx::SqlitePool;
use std::collections::HashMap;
use std::sync::{Mutex, OnceLock};
use std::time::{SystemTime, UNIX_EPOCH};

use crate::{to_status, ApiResult};

fn now_ms() -> i64 {
    SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map(|d| d.as_millis() as i64)
        .unwrap_or(0)
}

fn redirect_base() -> String {
    std::env::var("GOOGLE_REDIRECT_BASE").unwrap_or_else(|_| "http://localhost:3000".to_string())
}

fn web_url() -> String {
    std::env::var("APP_WEB_URL").unwrap_or_else(|_| "http://localhost:1420".to_string())
}

// ---------------------------------------------------------------------
// Pending authorization requests (connect → callback hand-off)
// ---------------------------------------------------------------------

/// state → (pkce verifier, created_at ms). In-memory on purpose: a server
/// restart between connect and callback just means the user clicks again.
fn pending() -> &'static Mutex<HashMap<String, (String, i64)>> {
    static PENDING: OnceLock<Mutex<HashMap<String, (String, i64)>>> = OnceLock::new();
    PENDING.get_or_init(|| Mutex::new(HashMap::new()))
}

fn remember_pending(state: &str, verifier: String) {
    let mut map = pending().lock().unwrap();
    let cutoff = now_ms() - 10 * 60 * 1000; // drop stale entries
    map.retain(|_, (_, created)| *created > cutoff);
    map.insert(state.to_string(), (verifier, now_ms()));
}

fn take_pending(state: &str) -> Option<String> {
    pending().lock().unwrap().remove(state).map(|(v, _)| v)
}

// ---------------------------------------------------------------------
// Google connection
// ---------------------------------------------------------------------

/// Never returns the refresh token to the client.
#[derive(Serialize)]
pub struct GoogleStatus {
    pub connected: bool,
    pub email: Option<String>,
    pub configured: bool,
}

pub async fn status(State(pool): State<SqlitePool>) -> ApiResult<GoogleStatus> {
    let config = GoogleConfig::load(&pool).await.map_err(to_status)?;
    let account = repo::load_google_account(&pool).await.map_err(to_status)?;
    Ok(Json(GoogleStatus {
        connected: account
            .as_ref()
            .is_some_and(|a| a.refresh_token.is_some()),
        email: account.and_then(|a| a.email),
        configured: config.is_some(),
    }))
}

/// Starts the OAuth flow: 302 to the Google consent screen.
pub async fn connect(State(pool): State<SqlitePool>) -> Result<Redirect, (StatusCode, String)> {
    let fail = |reason: &str| {
        Redirect::to(&format!(
            "{}/settings/backup?google=error&reason={reason}",
            web_url()
        ))
    };
    let Some(config) = GoogleConfig::load(&pool).await.map_err(to_status)? else {
        return Ok(fail("not_configured"));
    };

    let pkce = Pkce::generate();
    let state_param = google::oauth::random_state();
    let redirect_uri = format!("{}/api/google/callback", redirect_base());
    let url = google::build_auth_url(&config, &redirect_uri, &state_param, &pkce)
        .map_err(to_status)?;
    remember_pending(&state_param, pkce.verifier);
    Ok(Redirect::to(&url))
}

#[derive(Debug, Deserialize)]
pub struct CallbackQuery {
    pub code: Option<String>,
    pub state: Option<String>,
    pub error: Option<String>,
}

pub async fn callback(State(pool): State<SqlitePool>, Query(q): Query<CallbackQuery>) -> Redirect {
    let fail = |reason: &str| {
        Redirect::to(&format!(
            "{}/settings/backup?google=error&reason={reason}",
            web_url()
        ))
    };
    if q.error.is_some() {
        return fail("denied");
    }
    let (Some(code), Some(state)) = (q.code, q.state) else {
        return fail("missing_parameters");
    };
    let Some(verifier) = take_pending(&state) else {
        return fail("unknown_state");
    };

    let Some(config) = GoogleConfig::load(&pool).await.unwrap_or(None) else {
        return fail("not_configured");
    };
    let http = reqwest::Client::new();
    let redirect_uri = format!("{}/api/google/callback", redirect_base());
    let tokens =
        match google::exchange_code(&http, &config, &redirect_uri, &code, &verifier).await {
            Ok(t) => t,
            Err(e) => {
                tracing::warn!("google token exchange failed: {e}");
                return fail("token_exchange");
            }
        };
    let Some(refresh_token) = tokens.refresh_token else {
        return fail("no_refresh_token");
    };
    let email = google::fetch_userinfo_email(&http, &config, &tokens.access_token).await;
    if let Err(e) = repo::save_google_account(&pool, email.as_deref(), Some(&refresh_token), google::SCOPES)
        .await
    {
        tracing::warn!("saving google account failed: {e}");
        return fail("storage");
    }

    // kick off the first backup right away; if it fails the row lands in the
    // history and the scheduler picks the retry up within 15 minutes
    let pool2 = pool.clone();
    tokio::spawn(async move {
        let Ok(Some(auth)) = DbTokenStore::new(pool2.clone()).load().await else {
            return;
        };
        let settings = match repo::load_backup_settings(&pool2).await {
            Ok(s) => s,
            Err(_) => return,
        };
        let client = DriveClient::new(auth.config, auth.refresh_token);
        if let Err(e) = backup::run_backup(&pool2, &client, settings.keep_count).await {
            tracing::warn!("first backup after connect failed: {e}");
        }
    });

    Redirect::to(&format!("{}/settings/backup?google=connected", web_url()))
}

pub async fn disconnect(State(pool): State<SqlitePool>) -> Result<StatusCode, (StatusCode, String)> {
    // revoke is best-effort: a dead network must not strand the local state
    if let Some(config) = GoogleConfig::load(&pool).await.unwrap_or(None) {
        if let Ok(Some(account)) = repo::load_google_account(&pool).await {
            if let Some(token) = account.refresh_token {
                let http = reqwest::Client::new();
                if let Err(e) = google::revoke_token(&http, &config, &token).await {
                    tracing::warn!("token revocation failed (ignoring): {e}");
                }
            }
        }
    }
    repo::clear_google_account(&pool)
        .await
        .map_err(to_status)?;
    Ok(StatusCode::NO_CONTENT)
}

// ---------------------------------------------------------------------
// OAuth client configuration (UI fields; env vars remain the fallback)
// ---------------------------------------------------------------------

#[derive(Serialize)]
pub struct GoogleConfigView {
    pub client_id: Option<String>,
    pub has_secret: bool,
}

pub async fn get_config(State(pool): State<SqlitePool>) -> ApiResult<GoogleConfigView> {
    let config = GoogleConfig::load(&pool).await.map_err(to_status)?;
    Ok(Json(GoogleConfigView {
        // show the stored value, or the env value it will fall back to
        client_id: config.as_ref().map(|c| c.client_id.clone()),
        has_secret: config
            .map(|c| c.client_secret.is_some_and(|s| !s.trim().is_empty()))
            .unwrap_or(false),
    }))
}

#[derive(Debug, Deserialize)]
pub struct GoogleConfigBody {
    pub client_id: Option<String>,
    pub client_secret: Option<String>,
}

pub async fn put_config(
    State(pool): State<SqlitePool>,
    Json(body): Json<GoogleConfigBody>,
) -> ApiResult<GoogleConfigView> {
    // empty string means "clear" (GoogleConfig::load treats it as unset)
    if let Some(id) = body.client_id {
        repo::set_setting(&pool, "google_client_id", id.trim())
            .await
            .map_err(to_status)?;
    }
    if let Some(secret) = body.client_secret {
        repo::set_setting(&pool, "google_client_secret", secret.trim())
            .await
            .map_err(to_status)?;
    }
    get_config(State(pool)).await
}

// ---------------------------------------------------------------------
// Backup settings / runs
// ---------------------------------------------------------------------

pub async fn get_backup_settings(State(pool): State<SqlitePool>) -> ApiResult<BackupSettings> {
    repo::load_backup_settings(&pool).await.map(Json).map_err(to_status)
}

pub async fn update_backup_settings(
    State(pool): State<SqlitePool>,
    Json(settings): Json<BackupSettings>,
) -> ApiResult<BackupSettings> {
    repo::save_backup_settings(&pool, &settings)
        .await
        .map(Json)
        .map_err(to_status)
}

/// Loads the stored auth, mapped to a 409 when Drive is not connected.
async fn require_auth(pool: &SqlitePool) -> Result<backup::BackupAuth, (StatusCode, String)> {
    DbTokenStore::new(pool.clone())
        .load()
        .await
        .map_err(to_status)?
        .ok_or((StatusCode::CONFLICT, "google drive is not connected".to_string()))
}

pub async fn run_backup_now(State(pool): State<SqlitePool>) -> ApiResult<backup::BackupRun> {
    let auth = require_auth(&pool).await?;
    let settings = repo::load_backup_settings(&pool).await.map_err(to_status)?;
    let client = DriveClient::new(auth.config, auth.refresh_token);
    backup::run_backup(&pool, &client, settings.keep_count)
        .await
        .map(Json)
        .map_err(to_status)
}

/// Works even when Drive is not connected: the local history still shows,
/// minus the live Drive merge.
pub async fn list_backups(State(pool): State<SqlitePool>) -> ApiResult<Vec<backup::BackupListEntry>> {
    let client = match require_auth(&pool).await {
        Ok(auth) => Some(DriveClient::new(auth.config, auth.refresh_token)),
        // not connected / not configured: plain history rows
        Err((StatusCode::CONFLICT, _)) => None,
        Err(e) => return Err(e),
    };
    backup::list_merged(&pool, client.as_ref())
        .await
        .map(Json)
        .map_err(to_status)
}

#[derive(Debug, Deserialize)]
pub struct RestoreBody {
    pub drive_file_id: String,
}

pub async fn restore(
    State(pool): State<SqlitePool>,
    Json(body): Json<RestoreBody>,
) -> ApiResult<backup::RestoreResult> {
    let auth = require_auth(&pool).await?;
    let client = DriveClient::new(auth.config, auth.refresh_token);
    backup::restore_backup(&pool, &client, &body.drive_file_id)
        .await
        .map(Json)
        .map_err(to_status)
}

pub fn routes() -> Router<SqlitePool> {
    Router::new()
        .route("/api/google/status", get(status))
        .route("/api/google/connect", get(connect))
        .route("/api/google/callback", get(callback))
        .route("/api/google/disconnect", post(disconnect))
        .route("/api/google/config", get(get_config).put(put_config))
        .route(
            "/api/backup/settings",
            get(get_backup_settings).put(update_backup_settings),
        )
        .route("/api/backup/run", post(run_backup_now))
        .route("/api/backup/list", get(list_backups))
        .route("/api/backup/restore", post(restore))
}
