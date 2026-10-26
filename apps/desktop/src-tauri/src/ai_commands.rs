//! Tauri commands for the AI surface (desktop only). Registered alongside the
//! flat command list in `lib.rs`; this module keeps them out of the way.
//!
//! The model-provider API key never crosses back into the webview: commands
//! either store it in the OS keychain or report presence as a boolean.

use serde_json::Value;
use tauri::{Emitter, State};
use sqlx::SqlitePool;

use note_core::ai::{self, dispatch::DispatchCtx, llm};
use note_core::ai::bridge::CallOrigin;

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

/// Tool names the webview executes (frontend target, internal plumbing
/// included) — the frontend checks this at startup against its executor
/// set. Rust-target tools are native dispatch handlers; listing them here
/// would report executors missing that no executor is needed for.
#[tauri::command]
pub async fn list_tool_names() -> R<Vec<String>> {
    Ok(note_core::ai::tools::frontend_tool_names()
        .into_iter()
        .map(String::from)
        .collect())
}

/// Connection info serialized, then augmented with the canvas pin the AI
/// would dispatch against right now — the settings card uses it to surface
/// "is a canvas actually open" without a round-trip through MCP itself.
async fn mcp_info_value(pool: &SqlitePool, info: crate::ai_mcp::McpConnectionInfo) -> Option<Value> {
    let mut value = serde_json::to_value(info).ok()?;
    let canvas = DispatchCtx { pool, bridge: None, origin: CallOrigin::Assistant }
        .active_canvas()
        .await
        .ok()
        .flatten();
    value["active_canvas"] = match canvas {
        Some(canvas) => serde_json::json!({
            "id": canvas.id,
            "name": canvas.name,
            "canvas_type": canvas.canvas_type,
        }),
        None => Value::Null,
    };
    Some(value)
}

/// Where external MCP clients can reach this app right now. Stable across
/// restarts (the port and token are persisted in the settings table).
/// `active_canvas` reports the pinned canvas (`null` ⇒ none is open, and
/// frontend-target tools will fail until the user opens one).
#[tauri::command]
pub async fn get_mcp_connection_info(
    pool: State<'_, SqlitePool>,
    state: State<'_, McpState>,
) -> R<Option<Value>> {
    match state.connection_info() {
        Some(info) => Ok(mcp_info_value(&pool, info).await),
        None => Ok(None),
    }
}

/// Rotate the MCP bearer token. Takes effect immediately — after this, the
/// old token (and any connector URL embedding it) stops working, and the
/// connection info this returns must find its way to every client.
#[tauri::command]
pub async fn rotate_mcp_token(
    pool: State<'_, SqlitePool>,
    state: State<'_, McpState>,
) -> R<Option<Value>> {
    let info = state
        .rotate(&pool, note_core::ai::config::generate_mcp_token())
        .await
        .map_err(map)?;
    Ok(mcp_info_value(&pool, info).await)
}

// ---------------------------------------------------------------------
// Agent turn
// ---------------------------------------------------------------------

/// Run one AI turn with the whole conversation. `context` carries per-turn
/// situational data (canvas anchoring, the selection) that stays out of the
/// transcript. Returns the ordered event
/// list for the chat UI — the authoritative result — while streaming each
/// event to the webview (`ai:turn-event`) as it happens, so long turns
/// render progressively. Requires a stored API key.
#[tauri::command]
pub async fn ai_chat(
    messages: Vec<llm::HistoryMessage>,
    user_message: String,
    context: Option<String>,
    app: tauri::AppHandle,
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
    let ctx = DispatchCtx {
        pool: &pool,
        bridge: Some(bridge.as_ref()),
        // The in-app assistant confirms destructive tools via the app's card.
        origin: CallOrigin::Assistant,
    };
    let emitter = app.clone();
    ai::llm::run_agent_with_sink(
        &client,
        &ctx,
        &messages,
        &user_message,
        context.as_deref(),
        Some(Box::new(move |event| {
            // A webview without the listener (or mid-teardown) simply misses
            // it; the final list is the turn's authority.
            let _ = emitter.emit("ai:turn-event", &event);
        })),
    )
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
