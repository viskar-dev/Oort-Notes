use serde::{Deserialize, Serialize};

pub type Id = String;

/// A predefined page size for chapters with canvas_type = 'page'.
/// Built-in presets are seeded by the migration and protected by triggers.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct PagePreset {
    pub id: Id,
    pub name: String,
    pub category: String, // 'paper' | 'ratio' | 'custom'
    pub size_label: String,
    pub width: i64,
    pub height: i64,
    pub orientation: String, // generated column: 'portrait' | 'landscape' | 'square'
    pub is_builtin: bool,
    pub sort_order: i32,
    pub created_at: i64,
}

/// Top-level container. Hierarchy: Notebook > Chapter > Topic > Canvas.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Notebook {
    pub id: Id,
    pub name: String,
    pub label: Option<String>, // short cover label, e.g. 'PHYSICS'
    pub description: Option<String>,
    pub icon: Option<String>, // icon key from the app's icon set
    pub is_favorite: bool,
    pub position: i32,
    pub last_opened_at: Option<i64>,
    pub archived_at: Option<i64>,
    pub created_at: i64,
    pub updated_at: i64,
    // aggregates filled in by list_notebooks (0 elsewhere)
    pub chapters_count: i64,
    pub topics_count: i64,
}

/// One canvas unit inside a notebook. The canvas type and size live here and
/// are shared by every topic in the chapter; they are locked by a trigger
/// once the chapter has topics.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Chapter {
    pub id: Id,
    pub notebook_id: Id,
    pub name: String,
    pub canvas_type: String, // 'infinite' | 'page' | 'scroll'
    pub page_preset_id: Option<Id>,
    pub ui_preset_id: Option<Id>,
    pub page_width: Option<i64>,
    pub page_height: Option<i64>,
    pub scroll_width: Option<i64>,
    pub background: String, // 'plain' | 'dots' | 'grid' | 'ruled'
    pub position: i32,
    pub created_at: i64,
    pub updated_at: i64,
    // aggregate filled in by the list/load queries (0 elsewhere)
    pub topics_count: i64,
}

/// A row inside a chapter. In the editor every topic is a native tldraw page
/// (page id = 'page:' + topic id); names and order are kept in sync by the app.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Topic {
    pub id: Id,
    pub chapter_id: Id,
    pub name: String,
    pub position: i32,
    pub is_pinned: bool,
    pub last_opened_at: Option<i64>,
    pub created_at: i64,
    pub updated_at: i64,
}

/// One page of a multi-page topic. Only 'page' chapters use these: every
/// tldraw page maps to a topic_pages row (page id = 'page:' + topic_page id),
/// so a topic can hold any number of sheets. 'infinite' chapters keep one
/// tldraw page per topic and never touch this table.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct TopicPage {
    pub id: Id,
    pub topic_id: Id,
    pub name: String,
    pub position: i32,
    pub created_at: i64,
    pub updated_at: i64,
}

/// The tldraw snapshot for a whole chapter: one editor holds one page per
/// topic, so a single store snapshot carries every page, camera and the
/// session state (current page, selection).
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ChapterCanvas {
    pub chapter_id: Id,
    pub snapshot: serde_json::Value, // JSON from getSnapshot(editor.store)
    pub snapshot_format: i32,
    pub tldraw_version: Option<String>,
    pub shape_count: i64,
    pub byte_size: i64,
    pub saved_at: i64,
}

/// A user-created canvas preset made in global settings: toolbar layout,
/// color palette, default fonts and the px meaning of the S/M/L sizes.
/// `config` is a JSON document owned by the frontend.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct UiPreset {
    pub id: Id,
    pub name: String,
    pub config: serde_json::Value,
    pub created_at: i64,
    pub updated_at: i64,
}

// ---------------------------------------------------------------------
// Backups (Google Drive)
// ---------------------------------------------------------------------

/// One row of backup history. The archive itself lives in the connected
/// Google account's hidden app data folder; this row tracks its lifecycle.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Backup {
    pub id: Id,
    pub file_name: String,
    pub drive_file_id: Option<String>,
    pub size_bytes: Option<i64>,
    pub status: String, // 'pending' | 'uploaded' | 'failed' | 'deleted'
    pub error: Option<String>,
    pub created_at: i64,
    pub uploaded_at: Option<i64>,
}

/// The connected Google account (single row; `refresh_token` is only
/// populated in web/server mode — see the google_account migration).
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct GoogleAccount {
    pub email: Option<String>,
    pub refresh_token: Option<String>,
    pub scopes: String,
    pub connected_at: i64,
}

/// User preferences for scheduled backups, mapped onto the `settings` table
/// (keys: backup_enabled, backup_interval_days, backup_keep_count,
/// last_backup_at).
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct BackupSettings {
    pub enabled: bool,
    pub interval_days: u32,
    pub keep_count: u32,
    pub last_backup_at: Option<i64>,
}
