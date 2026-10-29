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

/// Policy value: destructive tool calls from MCP clients must confirm inside
/// the client's own conversation (structured `requires_confirmation` result).
pub const POLICY_ASK: &str = "ask";
/// Policy value: destructive tool calls from MCP clients run right away.
pub const POLICY_AUTO_CONFIRM: &str = "auto_confirm";

/// Legacy `ai_config` rows (written before the policy existed) deserialize
/// with this fallback rather than `String::default()` = "".
fn default_policy() -> String {
    POLICY_ASK.to_string()
}

/// The valid destructive-policy values, for save-time validation.
const POLICIES: [&str; 2] = [POLICY_ASK, POLICY_AUTO_CONFIRM];

/// Where the user's model provider answers. OpenAI-compatible: the base URL
/// switches providers (api.openai.com, OpenRouter, LM Studio, Ollama…)
/// without code changes.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct AiConfig {
    /// Base URL of an OpenAI-compatible `/chat/completions` endpoint.
    pub base_url: String,
    /// Model id requested on every call, e.g. `gpt-4o-mini`.
    pub model: String,
    /// How destructive tool calls (`delete_shapes`) behave for MCP callers
    /// ("ask" → structured `requires_confirmation` result, "auto_confirm" →
    /// run immediately). The in-app assistant always confirms through the
    /// app's own card regardless of this value. Defaults to "ask"; stored
    /// configs written before this field existed load as "ask".
    #[serde(default = "default_policy")]
    pub destructive_policy: String,
}

impl Default for AiConfig {
    fn default() -> Self {
        Self {
            base_url: "https://api.openai.com/v1".to_string(),
            model: "gpt-4o-mini".to_string(),
            destructive_policy: POLICY_ASK.to_string(),
        }
    }
}

/// Validate a user-supplied (or stored) policy value. Unknown values fail:
/// saving junk would silently strand the caller's confirmations.
fn validate_policy(value: &str) -> Result<&str, CoreError> {
    let trimmed = value.trim();
    if POLICIES.contains(&trimmed) {
        Ok(trimmed)
    } else {
        Err(CoreError::Ai(format!(
            "unknown destructive policy {trimmed:?} — expected one of {POLICIES:?}"
        )))
    }
}

/// Clean up a user-pasted base URL. OpenAI-compatible clients attach the
/// endpoint path themselves, so the stored value must be a bare base (e.g.
/// `https://api.groq.com/openai/v1`), yet people habitually paste the full
/// `/chat/completions` URL straight from curl samples — silently producing
/// `.../chat/completions/chat/completions` 404s. Trim whitespace, trailing
/// slashes, and the endpoint suffix; anything else passes through. Idempotent.
pub fn normalize_base_url(input: &str) -> String {
    let mut url = input.trim().trim_end_matches('/').to_string();
    const ENDPOINT: &str = "/chat/completions";
    if url
        .to_lowercase()
        .ends_with(ENDPOINT.to_lowercase().as_str())
    {
        url = url[..url.len() - ENDPOINT.len()].trim_end_matches('/').to_string();
    }
    url
}

/// Load the AI config, falling back to defaults when nothing is stored yet
/// (so a fresh install is immediately usable after it gets an API key).
pub async fn load_config(pool: &SqlitePool) -> Result<AiConfig, CoreError> {
    match repo::get_setting(pool, SETTING_AI_CONFIG).await? {
        Some(json) => {
            let mut parsed: AiConfig = serde_json::from_str(&json)
                .map_err(|e| CoreError::Ai(format!("stored ai config is invalid: {e}")))?;
            parsed.base_url = normalize_base_url(&parsed.base_url);
            // Defensive: an old or hand-edited row must never hard-fail over
            // the policy — unknown/empty falls back to the safe default.
            parsed.destructive_policy =
                if POLICIES.contains(&parsed.destructive_policy.as_str()) {
                    parsed.destructive_policy
                } else {
                    POLICY_ASK.to_string()
                };
            Ok(parsed)
        }
        None => Ok(AiConfig::default()),
    }
}

/// Persist the AI config as one settings row (base URL normalized so a
/// pasted full endpoint URL can't poison every later request; the policy is
/// validated so saving junk can't strand callers later).
pub async fn save_config(pool: &SqlitePool, config: &AiConfig) -> Result<(), CoreError> {
    let normalized = AiConfig {
        base_url: normalize_base_url(&config.base_url),
        model: config.model.trim().to_string(),
        destructive_policy: validate_policy(&config.destructive_policy)?.to_string(),
    };
    let json = serde_json::to_string(&normalized)
        .map_err(|e| CoreError::Ai(format!("cannot serialize ai config: {e}")))?;
    repo::set_setting(pool, SETTING_AI_CONFIG, &json).await
}

/// Point the AI at a (different) canvas. `None` clears the pointer.
pub async fn set_active_canvas(pool: &SqlitePool, chapter_id: Option<&str>) -> Result<(), CoreError> {
    repo::set_setting(pool, SETTING_ACTIVE_CANVAS, chapter_id.unwrap_or("")).await
}

// ---------------------------------------------------------------------
// MCP endpoint persistence (port + token survive app restarts)
// ---------------------------------------------------------------------

/// `settings` row holding the serialized [`McpConfig`].
pub const SETTING_MCP_CONFIG: &str = "mcp_config";

/// The local MCP server's connection info. Persisted (unlike the per-run
/// discovery file it replaces for identity) so external clients and hosted
/// connectors keep working without being reconfigured: the port stays the
/// preferred loopback port as long as it is free and the token stays until
/// the user rotates it.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct McpConfig {
    pub port: u16,
    pub token: String,
}

/// Load the persisted MCP endpoint, `None` on a fresh install.
pub async fn load_mcp_config(pool: &SqlitePool) -> Result<Option<McpConfig>, CoreError> {
    match repo::get_setting(pool, SETTING_MCP_CONFIG).await? {
        Some(json) => serde_json::from_str(&json)
            .map(Some)
            .map_err(|e| CoreError::Ai(format!("stored mcp config is invalid: {e}"))),
        None => Ok(None),
    }
}

/// Persist the MCP endpoint (called after binding settles the port, and by
/// the "new token" action in the UI).
pub async fn save_mcp_config(pool: &SqlitePool, config: &McpConfig) -> Result<(), CoreError> {
    let json = serde_json::to_string(config)
        .map_err(|e| CoreError::Ai(format!("cannot serialize mcp config: {e}")))?;
    repo::set_setting(pool, SETTING_MCP_CONFIG, &json).await
}

/// Fresh 40-character alphanumeric bearer token: the shared generator for
/// first run and user-initiated rotation.
pub fn generate_mcp_token() -> String {
    use rand::distributions::Alphanumeric;
    use rand::Rng;
    rand::thread_rng()
        .sample_iter(&Alphanumeric)
        .take(40)
        .map(char::from)
        .collect()
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

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn generated_tokens_are_alphanumeric_40() {
        let token = generate_mcp_token();
        assert_eq!(token.len(), 40);
        assert!(token.chars().all(|c| c.is_ascii_alphanumeric()));
        // Rotation must actually change something.
        assert_ne!(token, generate_mcp_token());
    }

    #[test]
    fn mcp_config_round_trips_through_json() {
        let config = McpConfig { port: 7866, token: generate_mcp_token() };
        let json = serde_json::to_string(&config).expect("McpConfig must serialize");
        let parsed: McpConfig = serde_json::from_str(&json).expect("stored json must parse");
        assert_eq!(parsed.port, config.port);
        assert_eq!(parsed.token, config.token);
    }

    #[test]
    fn validate_policy_accepts_only_known_values() {
        assert_eq!(validate_policy(POLICY_ASK).expect("ask"), POLICY_ASK);
        assert_eq!(
            validate_policy(" auto_confirm ").expect("trimmed"),
            POLICY_AUTO_CONFIRM
        );
        assert!(validate_policy("").is_err());
        assert!(validate_policy("nuke").is_err());
    }

    #[test]
    fn ai_config_with_policy_round_trips_through_json() {
        let config = AiConfig {
            base_url: "https://api.groq.com/openai/v1".into(),
            model: "llama-3".into(),
            destructive_policy: POLICY_AUTO_CONFIRM.into(),
        };
        let json = serde_json::to_string(&config).expect("AiConfig must serialize");
        let parsed: AiConfig = serde_json::from_str(&json).expect("stored json must parse");
        assert_eq!(parsed.destructive_policy, POLICY_AUTO_CONFIRM);
    }

    #[test]
    fn old_ai_config_json_without_policy_loads_as_ask() {
        // Rows written before the policy existed must keep loading.
        let parsed: AiConfig = serde_json::from_str(
            r#"{"base_url":"https://api.openai.com/v1","model":"gpt-4o-mini"}"#,
        )
        .expect("legacy json must parse");
        assert_eq!(parsed.destructive_policy, POLICY_ASK);
    }

    #[test]
    fn normalize_base_url_strips_pasted_endpoint_paths() {
        // The exact failure the first real user hit (Groq curl sample pasted
        // whole): the library appends /chat/completions itself.
        assert_eq!(
            normalize_base_url("  https://api.groq.com/openai/v1/chat/completions  "),
            "https://api.groq.com/openai/v1"
        );
        assert_eq!(
            normalize_base_url("https://api.openai.com/v1/"),
            "https://api.openai.com/v1"
        );
        // Already-correct values survive untouched.
        assert_eq!(
            normalize_base_url("https://api.openai.com/v1"),
            "https://api.openai.com/v1"
        );
        assert_eq!(
            normalize_base_url("http://127.0.0.1:1234/v1"),
            "http://127.0.0.1:1234/v1"
        );
        // Idempotent: normalizing twice changes nothing.
        let once = normalize_base_url("https://api.groq.com/openai/v1/chat/completions");
        assert_eq!(normalize_base_url(&once), once);
    }
}
