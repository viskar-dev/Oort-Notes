//! Tauri commands for the canvas icon finder (desktop only). The iconify
//! proxy itself lives in note-core (`icons.rs`) so the running app needs no
//! note server for icon search; these wrappers just translate invoke calls.

use note_core::icons;
use serde_json::Value;

type R<T> = Result<T, String>;

/// Icon search: returns iconify's search payload (`icons`, `total`,
/// `collections`, …) for the user's term.
#[tauri::command]
pub async fn icon_search(q: String, limit: Option<u32>) -> R<Value> {
    icons::search(&q, limit).await.map_err(|e| e.to_string())
}

/// Icon set slices: returns iconify's set payload for `prefix` restricted to
/// the comma-sent icon names (empty list = the whole set).
#[tauri::command]
pub async fn icon_set_data(prefix: String, icons: Option<Vec<String>>) -> R<Value> {
    let names = icons.as_deref().unwrap_or(&[]);
    icons::set_data(&prefix, names)
        .await
        .map_err(|e| e.to_string())
}
