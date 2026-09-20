// apps/desktop/src-tauri/src/lib.rs

use note_core::{get_note, Note};

#[tauri::command]
async fn get_note_command(id: String) -> Result<Note, String> {
    get_note(&id).await.map_err(|e| e.to_string())
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_sql::Builder::default().build())
        .invoke_handler(tauri::generate_handler![get_note_command])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
