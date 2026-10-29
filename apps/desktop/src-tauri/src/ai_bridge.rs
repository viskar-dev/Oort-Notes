//! The Rust↔webview canvas bridge: implements [note_core::ai::Bridge] by
//! emitting `canvas:call` events at the main window and matching the webview's
//! `canvas_result` command answer back to the pending one-shot channel.

use std::collections::HashMap;
use std::sync::Mutex;

use serde::Serialize;
use serde_json::Value;
use tauri::{AppHandle, Emitter, Manager};
use tokio::sync::oneshot;

use note_core::ai::bridge::{BoxFut, Bridge, CallOrigin};

/// One outgoing tool call, as the webview sees it.
#[derive(Debug, Clone, Serialize)]
pub struct CanvasCall {
    /// Correlation id; the webview answers with it.
    pub id: String,
    pub name: String,
    pub args: Value,
    /// The canvas the call was pinned to (the executor must reject the call
    /// if the user has since switched canvases).
    pub canvas_id: String,
    /// Who is asking ("assistant" | "mcp") — the webview gates destructive
    /// tools per caller (MCP callers confirm in their own client, never via
    /// desktop UI).
    pub origin: String,
}

pub struct DesktopBridge {
    app: AppHandle,
    pending: Mutex<HashMap<String, oneshot::Sender<Result<Value, String>>>>,
}

impl DesktopBridge {
    pub fn new(app: AppHandle) -> Self {
        Self { app, pending: Mutex::new(HashMap::new()) }
    }

    /// Poison-tolerant lock: the map itself is always recoverable.
    fn pending_lock(&self) -> std::sync::MutexGuard<'_, HashMap<String, oneshot::Sender<Result<Value, String>>>> {
        self.pending.lock().unwrap_or_else(|poisoned| poisoned.into_inner())
    }

    fn main_window(&self) -> Option<tauri::WebviewWindow> {
        self.app.get_webview_window("main")
    }

    /// Resolve a pending call from the `canvas_result` command. Returns
    /// whether an answering receiver was found (false ⇒ unknown id, likely
    /// timed out already).
    pub fn resolve(
        &self,
        id: &str,
        ok: bool,
        error: Option<String>,
        result: Option<Value>,
    ) -> bool {
        let sender = self.pending_lock().remove(id);
        match sender {
            Some(sender) => {
                let value = if ok {
                    Ok(result.unwrap_or(Value::Null))
                } else {
                    Err(error.unwrap_or_else(|| "unknown frontend error".into()))
                };
                // The receiver may already have timed out; that is fine.
                sender.send(value).is_ok()
            }
            None => false,
        }
    }

    fn new_call_id() -> String {
        format!("call-{:08x}-{:08x}", rand::random::<u32>(), rand::random::<u32>())
    }
}

impl Bridge for DesktopBridge {
    fn call_frontend<'a>(
        &'a self,
        name: &'a str,
        args: Value,
        canvas_id: &'a str,
        origin: CallOrigin,
    ) -> BoxFut<'a> {
        let call_id = Self::new_call_id();
        let (tx, rx) = oneshot::channel();
        self.pending_lock().insert(call_id.clone(), tx);

        let call = CanvasCall {
            id: call_id,
            name: name.to_string(),
            args,
            canvas_id: canvas_id.to_string(),
            origin: origin.as_str().to_string(),
        };
        match self.main_window() {
            Some(window) => {
                if let Err(e) = window.emit("canvas:call", &call) {
                    // Nobody will answer; fail deterministically.
                    self.resolve(&call.id.clone(), false, Some(format!("emit failed: {e}")), None);
                }
            }
            None => {
                self.resolve(&call.id.clone(), false, Some("no main window".into()), None);
            }
        }

        Box::pin(async move {
            match rx.await {
                Ok(Ok(value)) => Ok(value),
                Ok(Err(err)) => Err(err),
                // The webview never answered the corresponding canvas_result
                // (timeout already resolved the sender side).
                Err(_) => Err("the canvas did not answer the call".to_string()),
            }
        })
    }

    /// Grouped-undo markers: forward to the webview as bare events.
    fn notify(&self, event: &'static str) {
        if let Some(window) = self.main_window() {
            let _ = window.emit(event, ());
        }
    }

    /// `open_canvas`: the router hook in the webview navigates on this.
    fn navigate_to_canvas(&self, canvas_id: &str) {
        if let Some(window) = self.main_window() {
            let _ = window.emit(
                "ai:open-canvas",
                serde_json::json!({ "chapter_id": canvas_id }),
            );
        }
    }
}
