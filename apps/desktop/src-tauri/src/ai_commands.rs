//! Tauri commands for the AI surface (desktop only). Registered alongside the
//! flat command list in `lib.rs`; this module keeps them out of the way.
//!
//! The model-provider API key never crosses back into the webview: commands
//! either store it in the OS keychain or report presence as a boolean.

use serde_json::Value;
use tauri::State;
use sqlx::SqlitePool;

use note_core::ai::{self, dispatch::DispatchCtx, llm};

use crate::ai_bridge::DesktopBridge;
use crate::ai_mcp::McpState;

type R<T> = Result<T, String>;

fn map(e: note_core::CoreError) -> String {
    e.to_string()
}

// ---------------------------------------------------------------------
// Canvas pinning
// ---------------------------------------------------------------------

/// Point the AI at this canvas (or clear the pointer with `None`). Called by
/// the frontend whenever the user opens/switches a canvas.
#[tauri::command]
pub async fn set_active_canvas(
    id: Option<String>,
    pool: State<'_, SqlitePool>,
) -> R<()> {
    ai::config::set_active_canvas(&pool, id.as_deref())
        .await
        .map_err(map)
}

// ---------------------------------------------------------------------
// Provider configuration (model + base url in settings, key in keychain)
// ---------------------------------------------------------------------

#[tauri::command]
pub async fn get_ai_config(pool: State<'_, SqlitePool>) -> R<ai::AiConfig> {
    ai::config::load_config(&pool).await.map_err(map)
}

#[tauri::command]
pub async fn set_ai_config(
    base_url: String,
    model: String,
    pool: State<'_, SqlitePool>,
) -> R<()> {
    let config = ai::AiConfig { base_url, model };
    ai::config::save_config(&pool, &config).await.map_err(map)
}

/// Store the model-provider API key in the OS keychain. Value intentionally
/// has no reading side across invoke.
#[tauri::command]
pub async fn set_api_key(key: String) -> R<()> {
    tauri::async_runtime::spawn_blocking(move || ai::config::set_api_key(&key))
        .await
        .unwrap_or_else(|e| Err(note_core::CoreError::Ai(format!("keychain task panicked: {e}"))))
        .map_err(map)
}

#[tauri::command]
pub async fn has_api_key() -> R<bool> {
    tauri::async_runtime::spawn_blocking(|| ai::config::get_api_key().map(|key| key.is_some()))
        .await
        .unwrap_or_else(|e| Err(note_core::CoreError::Ai(format!("keychain task panicked: {e}"))))
        .map_err(map)
}

#[tauri::command]
pub async fn clear_api_key() -> R<()> {
    tauri::async_runtime::spawn_blocking(ai::config::clear_api_key)
        .await
        .unwrap_or_else(|e| Err(note_core::CoreError::Ai(format!("keychain task panicked: {e}"))))
        .map_err(map)
}

// ---------------------------------------------------------------------
// Tools
// ---------------------------------------------------------------------

/// All registry tool names, including internal plumbings — the frontend uses
/// this at startup to prove its executors cover the registry.
#[tauri::command]
pub async fn list_tool_names() -> R<Vec<String>> {
    Ok(note_core::ai::tools::all_tool_names()
        .into_iter()
        .map(String::from)
        .collect())
}

/// Where external MCP clients can reach this app right now.
#[tauri::command]
pub async fn get_mcp_connection_info(state: State<'_, McpState>) -> R<Option<Value>> {
    Ok(state
        .connection_info()
        .map(|info| serde_json::to_value(info).unwrap_or(Value::Null)))
}

// ---------------------------------------------------------------------
// Agent turn
// ---------------------------------------------------------------------

/// Run one AI turn with the whole conversation. Returns the ordered event
/// list for the chat UI. Requires a stored API key.
#[tauri::command]
pub async fn ai_chat(
    messages: Vec<llm::HistoryMessage>,
    user_message: String,
    pool: State<'_, SqlitePool>,
    bridge: State<'_, std::sync::Arc<DesktopBridge>>,
) -> R<Vec<llm::AgentEvent>> {
    let config = ai::config::load_config(&pool).await.map_err(map)?;
    let api_key = tauri::async_runtime::spawn_blocking(ai::config::get_api_key)
        .await
        .unwrap_or_else(|e| Err(note_core::CoreError::Ai(format!("keychain task panicked: {e}"))))
        .map_err(map)?
        .ok_or_else(|| "no API key set — add one in AI settings first".to_string())?;

    let client = llm::LlmClient::new(&config.base_url, &config.model, &api_key);
    let ctx = DispatchCtx { pool: &pool, bridge: Some(bridge.as_ref()) };
    llm::run_agent(&client, &ctx, &messages, &user_message)
        .await
        .map_err(map)
}

// ---------------------------------------------------------------------
// Bridge answers
// ---------------------------------------------------------------------

/// The webview's answer to a `canvas:call`. Resolves the pending one-shot;
/// `ok=false` carries the executor's error message.
#[tauri::command]
pub async fn canvas_result(
    id: String,
    ok: bool,
    error: Option<String>,
    result: Option<Value>,
    bridge: State<'_, std::sync::Arc<DesktopBridge>>,
) -> R<bool> {
    Ok(bridge.resolve(&id, ok, error, result))
}
