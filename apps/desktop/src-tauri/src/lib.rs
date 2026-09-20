// apps/desktop/src-tauri/src/lib.rs

use note_core::{ping, CoreError};

#[tauri::command]
async fn ping_command() -> Result<String, String> {
    ping().await.map_err(|e| e.to_string())
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_sql::Builder::default().build())
        .invoke_handler(tauri::generate_handler![ping_command])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
