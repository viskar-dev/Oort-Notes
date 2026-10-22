//! AI configuration.
//!
//! Settings live in the shared `settings` key/value table (like Google's
//! client id and backup settings) — one JSON row for the model config and one
//! plain value for the active canvas pointer. The API key never touches the
//! database or the webview: it goes to the OS keychain, behind the same
//! `keyring-store` cargo feature the Google refresh token uses.

use serde::{Deserialize, Serialize};
use sqlx::SqlitePool;

use crate::error::CoreError;
use crate::repo;

/// `settings` row holding the serialized [`AiConfig`].
pub const SETTING_AI_CONFIG: &str = "ai_config";
/// `settings` row holding the id of the canvas the AI currently works on.
pub const SETTING_ACTIVE_CANVAS: &str = "ai_active_canvas";

/// Where the user's model provider answers. OpenAI-compatible: the base URL
/// switches providers (api.openai.com, OpenRouter, LM Studio, Ollama…)
/// without code changes.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct AiConfig {
    /// Base URL of an OpenAI-compatible `/chat/completions` endpoint.
    pub base_url: String,
    /// Model id requested on every call, e.g. `gpt-4o-mini`.
    pub model: String,
}

impl Default for AiConfig {
    fn default() -> Self {
        Self {
            base_url: "https://api.openai.com/v1".to_string(),
            model: "gpt-4o-mini".to_string(),
        }
    }
}

/// Load the AI config, falling back to defaults when nothing is stored yet
/// (so a fresh install is immediately usable after it gets an API key).
pub async fn load_config(pool: &SqlitePool) -> Result<AiConfig, CoreError> {
    match repo::get_setting(pool, SETTING_AI_CONFIG).await? {
        Some(json) => {
            let parsed: AiConfig = serde_json::from_str(&json)
                .map_err(|e| CoreError::Ai(format!("stored ai config is invalid: {e}")))?;
            Ok(parsed)
        }
        None => Ok(AiConfig::default()),
    }
}

/// Persist the AI config as one settings row.
pub async fn save_config(pool: &SqlitePool, config: &AiConfig) -> Result<(), CoreError> {
    let json = serde_json::to_string(config)
        .map_err(|e| CoreError::Ai(format!("cannot serialize ai config: {e}")))?;
    repo::set_setting(pool, SETTING_AI_CONFIG, &json).await
}

/// Point the AI at a (different) canvas. `None` clears the pointer.
pub async fn set_active_canvas(pool: &SqlitePool, chapter_id: Option<&str>) -> Result<(), CoreError> {
    repo::set_setting(pool, SETTING_ACTIVE_CANVAS, chapter_id.unwrap_or("")).await
}

// ---------------------------------------------------------------------
// API key in the OS keychain (desktop; mirrors backup::keyring_store)
// ---------------------------------------------------------------------

/// Same service namespace as the Google refresh token; distinct user key so
/// clearing the Google token never touches AI settings.
#[cfg(feature = "keyring-store")]
const SERVICE: &str = "com.oort.desktop";
#[cfg(feature = "keyring-store")]
const USER: &str = "ai-api-key";

#[cfg(feature = "keyring-store")]
fn to_core_error(e: keyring::Error) -> CoreError {
    CoreError::Keyring(e.to_string())
}

/// Store the model-provider API key in the OS keychain. Sync (keychain calls
/// can block); callers should wrap it in `spawn_blocking`.
#[cfg(feature = "keyring-store")]
pub fn set_api_key(api_key: &str) -> Result<(), CoreError> {
    keyring::Entry::new(SERVICE, USER)
        .map_err(to_core_error)?
        .set_password(api_key)
        .map_err(to_core_error)
}

/// Load the stored API key, `None` when none is stored.
#[cfg(feature = "keyring-store")]
pub fn get_api_key() -> Result<Option<String>, CoreError> {
    match keyring::Entry::new(SERVICE, USER)
        .map_err(to_core_error)?
        .get_password()
    {
        Ok(key) => Ok(Some(key)),
        Err(keyring::Error::NoEntry) => Ok(None),
        Err(e) => Err(to_core_error(e)),
    }
}

/// Remove the stored API key. Absent entries are fine (already cleared).
#[cfg(feature = "keyring-store")]
pub fn clear_api_key() -> Result<(), CoreError> {
    match keyring::Entry::new(SERVICE, USER)
        .map_err(to_core_error)?
        .delete_credential()
    {
        Ok(()) => Ok(()),
        Err(keyring::Error::NoEntry) => Ok(()),
        Err(e) => Err(to_core_error(e)),
    }
}

// Without the keyring-store feature the AI key has nowhere to live.
#[cfg(not(feature = "keyring-store"))]
pub fn set_api_key(_api_key: &str) -> Result<(), CoreError> {
    Err(CoreError::Ai(
        "API key storage is not available: build with the keyring-store feature".into(),
    ))
}

#[cfg(not(feature = "keyring-store"))]
pub fn get_api_key() -> Result<Option<String>, CoreError> {
    Err(CoreError::Ai(
        "API key storage is not available: build with the keyring-store feature".into(),
    ))
}

#[cfg(not(feature = "keyring-store"))]
pub fn clear_api_key() -> Result<(), CoreError> {
    Err(CoreError::Ai(
        "API key storage is not available: build with the keyring-store feature".into(),
    ))
}
