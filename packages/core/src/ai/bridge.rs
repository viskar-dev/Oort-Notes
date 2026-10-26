//! The Rust → webview bridge used by frontend-target tools.
//!
//! Core only defines the seam: an async `call_frontend(name, args, canvas_id)`
//! with a hard timeout, plus an optional notification channel the agent loop
//! uses for grouped undo (`canvas:begin` / `canvas:end`). The Tauri crate
//! implements `Bridge` by emitting `canvas:call` to the webview and matching
//! the result against pending one-shot channels resolved by `canvas_result`.

use std::future::Future;
use std::pin::Pin;
use std::time::Duration;

use serde_json::Value;

use crate::error::CoreError;

/// How long a frontend tool may take before dispatch gives up (the canvas
/// might be closed or the tab frozen).
pub const TOOL_TIMEOUT: Duration = Duration::from_secs(60);

/// Result of a frontend tool call: `Ok(json value)` or the webview's error
/// message. Strings on purpose — the error crosses the webview boundary as
/// plain text.
pub type BridgeResult = Result<Value, String>;

pub type BoxFut<'a> = Pin<Box<dyn Future<Output = BridgeResult> + Send + 'a>>;

/// Who is calling a frontend tool. The webview gates destructive tools
/// per caller: the in-app assistant confirms through the app's own card,
/// while external (MCP) callers confirm inside their client conversation —
/// no confirmation UI may pop up on the desktop for them.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum CallOrigin {
    /// Oort's built-in chat panel.
    Assistant,
    /// A connected MCP client (server or shim REST).
    Mcp,
}

impl CallOrigin {
    pub fn as_str(&self) -> &'static str {
        match self {
            CallOrigin::Assistant => "assistant",
            CallOrigin::Mcp => "mcp",
        }
    }
}

/// Notification events the bridge may forward. Kept symbolic so the webview
/// contract stays in one place.
pub mod events {
    /// A batch of mutating frontend tool calls is about to start: the frontend
    /// can bundle the following changes into one undo entry.
    pub const BEGIN: &str = "canvas:begin";
    /// The batch finished (successfully or not): close the undo bundle.
    pub const END: &str = "canvas:end";
}

pub trait Bridge: Send + Sync {
    /// Run a frontend tool on the currently open canvas. `canvas_id` pins the
    /// call to the canvas dispatch resolved — the executor must reject the
    /// call if the user has since switched canvases. `origin` tells the
    /// webview who is asking (destructive-tool confirmation differs).
    fn call_frontend<'a>(
        &'a self,
        name: &'a str,
        args: Value,
        canvas_id: &'a str,
        origin: CallOrigin,
    ) -> BoxFut<'a>;

    /// Emit a lifecycle notification (grouped undo markers). Optional.
    fn notify(&self, _event: &'static str) {}

    /// Point the desktop app at a canvas after `open_canvas` pinned it.
    /// Optional and desktop-specific: hosts without routing do nothing —
    /// the pin makes the canvas the AI's target even if no view switches.
    fn navigate_to_canvas(&self, _canvas_id: &str) {}
}

/// Run one frontend tool with the shared timeout, normalizing every failure
/// into `CoreError::Ai` with a human-readable message.
pub async fn call_frontend_tool(
    bridge: &dyn Bridge,
    name: &str,
    args: Value,
    canvas_id: &str,
    origin: CallOrigin,
) -> Result<Value, CoreError> {
    let fut = bridge.call_frontend(name, args, canvas_id, origin);
    match tokio::time::timeout(TOOL_TIMEOUT, fut).await {
        Ok(Ok(value)) => Ok(value),
        Ok(Err(err)) => Err(CoreError::Ai(format!("{name} failed: {err}"))),
        Err(_) => Err(CoreError::Ai(format!(
            "{name} timed out after 60s: the canvas did not answer (is a canvas open?)"
        ))),
    }
}
