// apps/desktop/src-tauri/src/main.rs

// Prevents an additional console window on Windows in release builds.
#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

fn main() {
    note_desktop_lib::run();
}
