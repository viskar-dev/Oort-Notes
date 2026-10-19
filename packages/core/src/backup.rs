//! Backup archives: snapshot the whole database into one versioned JSON
//! document and keep it up to date in the connected Google Drive app-data
//! space, as a single file that every run overwrites. A workspace that is
//! empty (fresh install) is never uploaded — it must not clobber a real
//! backup the user may want to import from first.
//!
//! Used by both shells: the web server runs [`scheduler_loop`] with
//! [`DbTokenStore`], the desktop app with [`KeyringTokenStore`] (feature
//! `keyring-store`) so the refresh token never touches the database file.
//!
//! Archive contents are the user data tables only — every row including
//! trashed ones, with ids and timestamps preserved, so restore is faithful.
//! `settings` (which stores the backup state, see [`workspace_fingerprint`]),
//! the legacy `backups` history table and the search index are deliberately
//! not part of an archive.

use std::future::Future;
use std::pin::Pin;
use std::sync::Arc;
use std::time::Duration;

use serde::{Deserialize, Serialize};
use sqlx::SqlitePool;

use crate::error::CoreError;
use crate::google::{DriveClient, DriveFile, GoogleConfig};
use crate::repo;

/// Bumped when the archive shape changes incompatibly. Restores of newer
/// formats are rejected with a clear message instead of corrupting data.
pub const ARCHIVE_FORMAT: u32 = 1;

const SCHEDULER_TICK: Duration = Duration::from_secs(15 * 60);

fn now_ms() -> i64 {
    std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .map(|d| d.as_millis() as i64)
        .unwrap_or(0)
}

// ---------------------------------------------------------------------
// Archive document
// ---------------------------------------------------------------------

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ArchiveCounts {
    pub notebooks: usize,
    pub chapters: usize,
    pub topics: usize,
    pub topic_pages: usize,
    pub chapter_canvas: usize,
    pub ui_presets: usize,
    pub tags: usize,
    pub topic_tags: usize,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct BackupArchive {
    pub app: String,
    pub kind: String,
    pub format: u32,
    pub created_at: i64,
    pub counts: ArchiveCounts,
    pub data: ArchiveData,
}

#[derive(Debug, Clone, Default, Serialize, Deserialize)]
pub struct ArchiveData {
    #[serde(default)]
    pub ui_presets: Vec<UiPresetRow>,
    #[serde(default)]
    pub notebooks: Vec<NotebookRow>,
    #[serde(default)]
    pub chapters: Vec<ChapterRow>,
    #[serde(default)]
    pub topics: Vec<TopicRow>,
    #[serde(default)]
    pub topic_pages: Vec<TopicPageRow>,
    #[serde(default)]
    pub chapter_canvas: Vec<ChapterCanvasRow>,
    #[serde(default)]
    pub tags: Vec<TagRow>,
    #[serde(default)]
    pub topic_tags: Vec<TopicTagRow>,
}

// Plain database rows; column order mirrors the migrations so the archive is
// trivially inspectable and restore is a straight insert.

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct UiPresetRow {
    pub id: String,
    pub name: String,
    pub config: String,
    pub created_at: i64,
    pub updated_at: i64,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct NotebookRow {
    pub id: String,
    pub name: String,
    pub label: Option<String>,
    pub description: Option<String>,
    pub icon: Option<String>,
    pub is_favorite: i64,
    pub position: i64,
    pub last_opened_at: Option<i64>,
    pub archived_at: Option<i64>,
    pub created_at: i64,
    pub updated_at: i64,
    pub deleted_at: Option<i64>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ChapterRow {
    pub id: String,
    pub notebook_id: String,
    pub name: String,
    pub canvas_type: String,
    pub page_preset_id: Option<String>,
    pub page_width: Option<i64>,
    pub page_height: Option<i64>,
    pub scroll_width: Option<i64>,
    pub background: String,
    pub position: i64,
    pub created_at: i64,
    pub updated_at: i64,
    pub deleted_at: Option<i64>,
    pub ui_preset_id: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct TopicRow {
    pub id: String,
    pub chapter_id: String,
    pub name: String,
    pub position: i64,
    pub is_pinned: i64,
    pub last_opened_at: Option<i64>,
    pub created_at: i64,
    pub updated_at: i64,
    pub deleted_at: Option<i64>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct TopicPageRow {
    pub id: String,
    pub topic_id: String,
    pub name: String,
    pub position: i64,
    pub created_at: i64,
    pub updated_at: i64,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ChapterCanvasRow {
    pub chapter_id: String,
    /// `getSnapshot(editor.store)` JSON, embedded as text for a lossless
    /// round-trip (tldraw migrates old snapshot versions itself on load).
    pub snapshot: String,
    pub snapshot_format: i64,
    pub tldraw_version: Option<String>,
    pub shape_count: i64,
    pub byte_size: i64,
    pub saved_at: i64,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct TagRow {
    pub id: String,
    pub name: String,
    pub created_at: i64,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct TopicTagRow {
    pub topic_id: String,
    pub tag_id: String,
}

impl ArchiveCounts {
    fn of(data: &ArchiveData) -> Self {
        Self {
            notebooks: data.notebooks.len(),
            chapters: data.chapters.len(),
            topics: data.topics.len(),
            topic_pages: data.topic_pages.len(),
            chapter_canvas: data.chapter_canvas.len(),
            ui_presets: data.ui_presets.len(),
            tags: data.tags.len(),
            topic_tags: data.topic_tags.len(),
        }
    }

    /// True when the archive holds workspace content worth keeping. Guards
    /// the single backup file: a fresh install (or one with nothing but
    /// presets) must never overwrite a real backup with an empty archive.
    pub fn has_content(&self) -> bool {
        self.notebooks + self.chapters + self.topics + self.topic_pages + self.chapter_canvas > 0
    }
}

// ---------------------------------------------------------------------
// Export
// ---------------------------------------------------------------------

type PresetTuple = (String, String, String, i64, i64);
type NotebookTuple = (
    String,
    String,
    Option<String>,
    Option<String>,
    Option<String>,
    i64,
    i64,
    Option<i64>,
    Option<i64>,
    i64,
    i64,
    Option<i64>,
);
type ChapterTuple = (
    String,
    String,
    String,
    String,
    Option<String>,
    Option<i64>,
    Option<i64>,
    Option<i64>,
    String,
    i64,
    i64,
    i64,
    Option<i64>,
    Option<String>,
);
type TopicTuple = (
    String,
    String,
    String,
    i64,
    i64,
    Option<i64>,
    i64,
    i64,
    Option<i64>,
);
type TopicPageTuple = (String, String, String, i64, i64, i64);
type CanvasTuple = (String, String, i64, Option<String>, i64, i64, i64);
type TagTuple = (String, String, i64);

pub async fn export_data(pool: &SqlitePool) -> Result<ArchiveData, CoreError> {
    let ui_presets = sqlx::query_as::<_, PresetTuple>(
        "SELECT id, name, config, created_at, updated_at FROM ui_presets ORDER BY created_at",
    )
    .fetch_all(pool)
    .await?
    .into_iter()
    .map(|r| UiPresetRow {
        id: r.0,
        name: r.1,
        config: r.2,
        created_at: r.3,
        updated_at: r.4,
    })
    .collect();

    let notebooks = sqlx::query_as::<_, NotebookTuple>(
        "SELECT id, name, label, description, icon, is_favorite, position,
                last_opened_at, archived_at, created_at, updated_at, deleted_at
         FROM notebooks ORDER BY created_at",
    )
    .fetch_all(pool)
    .await?
    .into_iter()
    .map(|r| NotebookRow {
        id: r.0,
        name: r.1,
        label: r.2,
        description: r.3,
        icon: r.4,
        is_favorite: r.5,
        position: r.6,
        last_opened_at: r.7,
        archived_at: r.8,
        created_at: r.9,
        updated_at: r.10,
        deleted_at: r.11,
    })
    .collect();

    let chapters = sqlx::query_as::<_, ChapterTuple>(
        "SELECT id, notebook_id, name, canvas_type, page_preset_id, page_width,
                page_height, scroll_width, background, position, created_at,
                updated_at, deleted_at, ui_preset_id
         FROM chapters ORDER BY created_at",
    )
    .fetch_all(pool)
    .await?
    .into_iter()
    .map(|r| ChapterRow {
        id: r.0,
        notebook_id: r.1,
        name: r.2,
        canvas_type: r.3,
        page_preset_id: r.4,
        page_width: r.5,
        page_height: r.6,
        scroll_width: r.7,
        background: r.8,
        position: r.9,
        created_at: r.10,
        updated_at: r.11,
        deleted_at: r.12,
        ui_preset_id: r.13,
    })
    .collect();

    let topics = sqlx::query_as::<_, TopicTuple>(
        "SELECT id, chapter_id, name, position, is_pinned, last_opened_at,
                created_at, updated_at, deleted_at
         FROM topics ORDER BY created_at",
    )
    .fetch_all(pool)
    .await?
    .into_iter()
    .map(|r| TopicRow {
        id: r.0,
        chapter_id: r.1,
        name: r.2,
        position: r.3,
        is_pinned: r.4,
        last_opened_at: r.5,
        created_at: r.6,
        updated_at: r.7,
        deleted_at: r.8,
    })
    .collect();

    let topic_pages = sqlx::query_as::<_, TopicPageTuple>(
        "SELECT id, topic_id, name, position, created_at, updated_at
         FROM topic_pages ORDER BY created_at",
    )
    .fetch_all(pool)
    .await?
    .into_iter()
    .map(|r| TopicPageRow {
        id: r.0,
        topic_id: r.1,
        name: r.2,
        position: r.3,
        created_at: r.4,
        updated_at: r.5,
    })
    .collect();

    let chapter_canvas = sqlx::query_as::<_, CanvasTuple>(
        "SELECT chapter_id, snapshot, snapshot_format, tldraw_version,
                shape_count, byte_size, saved_at
         FROM chapter_canvas ORDER BY chapter_id",
    )
    .fetch_all(pool)
    .await?
    .into_iter()
    .map(|r| ChapterCanvasRow {
        chapter_id: r.0,
        snapshot: r.1,
        snapshot_format: r.2,
        tldraw_version: r.3,
        shape_count: r.4,
        byte_size: r.5,
        saved_at: r.6,
    })
    .collect();

    let tags = sqlx::query_as::<_, TagTuple>("SELECT id, name, created_at FROM tags ORDER BY created_at")
        .fetch_all(pool)
        .await?
        .into_iter()
        .map(|r| TagRow {
            id: r.0,
            name: r.1,
            created_at: r.2,
        })
        .collect();

    let topic_tags = sqlx::query_as::<_, (String, String)>(
        "SELECT topic_id, tag_id FROM topic_tags ORDER BY topic_id, tag_id",
    )
    .fetch_all(pool)
    .await?
    .into_iter()
    .map(|r| TopicTagRow {
        topic_id: r.0,
        tag_id: r.1,
    })
    .collect();

    Ok(ArchiveData {
        ui_presets,
        notebooks,
        chapters,
        topics,
        topic_pages,
        chapter_canvas,
        tags,
        topic_tags,
    })
}

/// Serializes the whole database into archive bytes (JSON, format-versioned).
pub async fn build_archive(pool: &SqlitePool) -> Result<(Vec<u8>, ArchiveCounts), CoreError> {
    let data = export_data(pool).await?;
    let counts = ArchiveCounts::of(&data);
    let archive = BackupArchive {
        app: "oort-notes".to_string(),
        kind: "backup".to_string(),
        format: ARCHIVE_FORMAT,
        created_at: now_ms(),
        counts: counts.clone(),
        data,
    };
    Ok((serde_json::to_vec(&archive)?, counts))
}

/// The one backup file in the app data folder; every run overwrites it, so
/// the user never has to pick between versions.
pub const BACKUP_FILE_NAME: &str = "oort-backup.json";

/// Files from the older multi-backup scheme (`oort-backup-<utc>.json`).
/// Still recognized on import and cleaned up after a single-file backup
/// succeeds, so an upgrading install converges on one archive.
fn is_legacy_backup_name(name: &str) -> bool {
    name.starts_with("oort-backup-") && name.ends_with(".json")
}

// ---------------------------------------------------------------------
// Restore
// ---------------------------------------------------------------------

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct RestoreResult {
    pub notebooks: usize,
    pub chapters: usize,
    pub topics: usize,
    pub topic_pages: usize,
    pub chapter_canvas: usize,
    pub ui_presets: usize,
    pub tags: usize,
    pub topic_tags: usize,
}

/// Replaces the entire workspace with the archive's contents in one
/// transaction: any failure leaves the current data untouched.
pub async fn restore_archive(pool: &SqlitePool, bytes: &[u8]) -> Result<RestoreResult, CoreError> {
    let archive: BackupArchive = serde_json::from_slice(bytes)
        .map_err(|e| CoreError::Internal(format!("not a valid backup archive: {e}")))?;
    if archive.app != "oort-notes" || archive.kind != "backup" {
        return Err(CoreError::Internal(format!(
            "this file is not an Oort backup archive (app: '{}', kind: '{}')",
            archive.app, archive.kind
        )));
    }
    if archive.format > ARCHIVE_FORMAT {
        return Err(CoreError::Internal(format!(
            "this archive uses format {} but this version only understands up to {ARCHIVE_FORMAT}; update the app to restore it",
            archive.format
        )));
    }
    let data = archive.data;

    // chapter presets referenced by the archive must exist locally or the
    // foreign keys reject the insert; the app never invents preset ids, so
    // unknown ones (from a much newer version) are dropped to NULL instead
    let known_presets: Vec<String> = sqlx::query_scalar("SELECT id FROM page_presets")
        .fetch_all(pool)
        .await?;
    let known_presets: std::collections::HashSet<String> = known_presets.into_iter().collect();

    let mut tx = pool.begin().await?;

    // children first so foreign keys stay satisfied throughout
    for table in [
        "topic_tags",
        "tags",
        "chapter_canvas",
        "topic_pages",
        "topics",
        "chapters",
        "notebooks",
        "ui_presets",
    ] {
        sqlx::query(&format!("DELETE FROM {table}")).execute(&mut *tx).await?;
    }

    for r in &data.ui_presets {
        sqlx::query(
            "INSERT INTO ui_presets (id, name, config, created_at, updated_at)
             VALUES (?, ?, ?, ?, ?)",
        )
        .bind(&r.id)
        .bind(&r.name)
        .bind(&r.config)
        .bind(r.created_at)
        .bind(r.updated_at)
        .execute(&mut *tx)
        .await?;
    }
    for r in &data.notebooks {
        sqlx::query(
            "INSERT INTO notebooks (id, name, label, description, icon, is_favorite,
                                    position, last_opened_at, archived_at, created_at,
                                    updated_at, deleted_at)
             VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)",
        )
        .bind(&r.id)
        .bind(&r.name)
        .bind(&r.label)
        .bind(&r.description)
        .bind(&r.icon)
        .bind(r.is_favorite)
        .bind(r.position)
        .bind(r.last_opened_at)
        .bind(r.archived_at)
        .bind(r.created_at)
        .bind(r.updated_at)
        .bind(r.deleted_at)
        .execute(&mut *tx)
        .await?;
    }
    for r in &data.chapters {
        let preset = r
            .page_preset_id
            .as_ref()
            .filter(|p| known_presets.contains(*p));
        sqlx::query(
            "INSERT INTO chapters (id, notebook_id, name, canvas_type, page_preset_id,
                                   page_width, page_height, scroll_width, background,
                                   position, created_at, updated_at, deleted_at, ui_preset_id)
             VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)",
        )
        .bind(&r.id)
        .bind(&r.notebook_id)
        .bind(&r.name)
        .bind(&r.canvas_type)
        .bind(preset)
        .bind(r.page_width)
        .bind(r.page_height)
        .bind(r.scroll_width)
        .bind(&r.background)
        .bind(r.position)
        .bind(r.created_at)
        .bind(r.updated_at)
        .bind(r.deleted_at)
        .bind(&r.ui_preset_id)
        .execute(&mut *tx)
        .await?;
    }
    for r in &data.topics {
        sqlx::query(
            "INSERT INTO topics (id, chapter_id, name, position, is_pinned,
                                 last_opened_at, created_at, updated_at, deleted_at)
             VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)",
        )
        .bind(&r.id)
        .bind(&r.chapter_id)
        .bind(&r.name)
        .bind(r.position)
        .bind(r.is_pinned)
        .bind(r.last_opened_at)
        .bind(r.created_at)
        .bind(r.updated_at)
        .bind(r.deleted_at)
        .execute(&mut *tx)
        .await?;
    }
    for r in &data.topic_pages {
        sqlx::query(
            "INSERT INTO topic_pages (id, topic_id, name, position, created_at, updated_at)
             VALUES (?, ?, ?, ?, ?, ?)",
        )
        .bind(&r.id)
        .bind(&r.topic_id)
        .bind(&r.name)
        .bind(r.position)
        .bind(r.created_at)
        .bind(r.updated_at)
        .execute(&mut *tx)
        .await?;
    }
    for r in &data.chapter_canvas {
        sqlx::query(
            "INSERT INTO chapter_canvas (chapter_id, snapshot, snapshot_format,
                                         tldraw_version, shape_count, byte_size, saved_at)
             VALUES (?, ?, ?, ?, ?, ?, ?)",
        )
        .bind(&r.chapter_id)
        .bind(&r.snapshot)
        .bind(r.snapshot_format)
        .bind(&r.tldraw_version)
        .bind(r.shape_count)
        .bind(r.byte_size)
        .bind(r.saved_at)
        .execute(&mut *tx)
        .await?;
    }
    for r in &data.tags {
        sqlx::query("INSERT INTO tags (id, name, created_at) VALUES (?, ?, ?)")
            .bind(&r.id)
            .bind(&r.name)
            .bind(r.created_at)
            .execute(&mut *tx)
            .await?;
    }
    for r in &data.topic_tags {
        sqlx::query("INSERT INTO topic_tags (topic_id, tag_id) VALUES (?, ?)")
            .bind(&r.topic_id)
            .bind(&r.tag_id)
            .execute(&mut *tx)
            .await?;
    }

    // the insert triggers bump parent `updated_at` to "now"; re-apply the
    // archived timestamps so "last edited" ordering survives a restore
    for r in &data.notebooks {
        sqlx::query("UPDATE notebooks SET updated_at = ? WHERE id = ?")
            .bind(r.updated_at)
            .bind(&r.id)
            .execute(&mut *tx)
            .await?;
    }
    for r in &data.chapters {
        sqlx::query("UPDATE chapters SET updated_at = ? WHERE id = ?")
            .bind(r.updated_at)
            .bind(&r.id)
            .execute(&mut *tx)
            .await?;
    }
    for r in &data.topics {
        sqlx::query("UPDATE topics SET updated_at = ? WHERE id = ?")
            .bind(r.updated_at)
            .bind(&r.id)
            .execute(&mut *tx)
            .await?;
    }

    tx.commit().await?;

    Ok(RestoreResult {
        notebooks: data.notebooks.len(),
        chapters: data.chapters.len(),
        topics: data.topics.len(),
        topic_pages: data.topic_pages.len(),
        chapter_canvas: data.chapter_canvas.len(),
        ui_presets: data.ui_presets.len(),
        tags: data.tags.len(),
        topic_tags: data.topic_tags.len(),
    })
}

// ---------------------------------------------------------------------
// Backup runs
// ---------------------------------------------------------------------

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct BackupRun {
    pub file_name: String,
    pub drive_file_id: String,
    pub size_bytes: i64,
    pub counts: ArchiveCounts,
}

/// Cheap existence check for workspace content, run before building an
/// archive: an empty workspace is never uploaded.
async fn has_workspace_content(pool: &SqlitePool) -> Result<bool, CoreError> {
    let n: i64 = sqlx::query_scalar(
        "SELECT (SELECT COUNT(*) FROM notebooks) + (SELECT COUNT(*) FROM chapters)
              + (SELECT COUNT(*) FROM topics) + (SELECT COUNT(*) FROM topic_pages)
              + (SELECT COUNT(*) FROM chapter_canvas)",
    )
    .fetch_one(pool)
    .await?;
    Ok(n > 0)
}

/// Builds an archive and writes it to the single backup file in the app
/// data folder, replacing whatever the previous run left there. `Ok(None)`
/// means the workspace is still empty — uploading it with nothing would
/// clobber a real backup, which is exactly what the import offer on a new
/// device protects.
pub async fn run_backup(
    pool: &SqlitePool,
    client: &DriveClient,
) -> Result<Option<BackupRun>, CoreError> {
    if !has_workspace_content(pool).await? {
        return Ok(None);
    }
    // fingerprint before the snapshot: a change racing this run then reads
    // as "something new", never as "already backed up"
    let fingerprint = workspace_fingerprint(pool).await?;
    let (bytes, counts) = build_archive(pool).await?;
    if !counts.has_content() {
        return Ok(None);
    }
    let size_bytes = bytes.len() as i64;

    let files = client.list_appdata().await?;
    let existing = files
        .iter()
        .find(|f| f.name == BACKUP_FILE_NAME)
        .map(|f| f.id.clone());
    let file = match existing {
        Some(id) => match client.update_json(&id, BACKUP_FILE_NAME, bytes.clone()).await? {
            Some(file) => file,
            // vanished between listing and update — make it anew
            None => client.upload_json(BACKUP_FILE_NAME, bytes).await?,
        },
        None => client.upload_json(BACKUP_FILE_NAME, bytes).await?,
    };

    repo::set_setting(pool, "last_backup_at", &now_ms().to_string()).await?;
    repo::set_setting(pool, "backup_fingerprint", &fingerprint).await?;

    // converge on a single archive: clear out the old multi-backup files
    // (best effort — a failed delete must not fail the backup)
    for legacy in files.iter().filter(|f| is_legacy_backup_name(&f.name)) {
        if let Err(e) = client.delete(&legacy.id).await {
            tracing::warn!("could not remove legacy backup {}: {e}", legacy.name);
        }
    }

    Ok(Some(BackupRun {
        file_name: BACKUP_FILE_NAME.to_string(),
        drive_file_id: file.id,
        size_bytes,
        counts,
    }))
}

/// Downloads the Drive backup and replaces the local workspace with it.
/// Offered on a fresh install; afterwards the workspace mirrors the backup
/// exactly, so it is marked clean.
pub async fn import_backup(
    pool: &SqlitePool,
    client: &DriveClient,
) -> Result<RestoreResult, CoreError> {
    let files = client.list_appdata().await?;
    let file = pick_backup_file(&files)
        .ok_or_else(|| CoreError::Internal("no backup found in your Google Drive".to_string()))?;
    let bytes = client.download(&file.id).await?;
    let result = restore_archive(pool, &bytes).await?;
    repo::set_setting(pool, "last_backup_at", &now_ms().to_string()).await?;
    repo::set_setting(pool, "backup_fingerprint", &workspace_fingerprint(pool).await?).await?;
    Ok(result)
}

// ---------------------------------------------------------------------
// Backup state (what the UI shows: "backed up" vs "back up")
// ---------------------------------------------------------------------

/// Drives the backup card: `workspace_empty` offers the import flow on a
/// fresh install, `dirty` means something changed since the last upload.
/// Computed from local data only — never blocked by a Drive hiccup.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct BackupStatus {
    pub workspace_empty: bool,
    pub dirty: bool,
}

/// The archive that sits in the app data space, for the import offer.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct DriveBackupInfo {
    pub has_backup: bool,
    pub file_name: Option<String>,
    pub size_bytes: Option<i64>,
    pub created_time: Option<String>,
}

/// Stable summary of everything a backup protects. Row counts catch
/// creations and deletions, newest timestamps catch edits, and tag
/// assignments are compared as content (they carry no timestamps). Stored
/// in settings after every upload; any difference means "back up again".
pub async fn workspace_fingerprint(pool: &SqlitePool) -> Result<String, CoreError> {
    let mut parts: Vec<serde_json::Value> = Vec::new();
    for (table, column) in [
        ("notebooks", "updated_at"),
        ("chapters", "updated_at"),
        ("topics", "updated_at"),
        ("topic_pages", "updated_at"),
        ("chapter_canvas", "saved_at"),
        ("ui_presets", "updated_at"),
        ("tags", "created_at"),
    ] {
        let (count, newest): (i64, i64) =
            sqlx::query_as(&format!("SELECT COUNT(*), COALESCE(MAX({column}), 0) FROM {table}"))
                .fetch_one(pool)
                .await?;
        parts.push(serde_json::json!([table, count, newest]));
    }
    let pairs: String = sqlx::query_scalar(
        "SELECT COALESCE(GROUP_CONCAT(pair, '|'), '') FROM (
             SELECT topic_id || ':' || tag_id AS pair FROM topic_tags ORDER BY topic_id, tag_id
         )",
    )
    .fetch_one(pool)
    .await?;
    parts.push(serde_json::json!(["topic_tags", pairs]));
    Ok(serde_json::Value::Array(parts).to_string())
}

pub async fn status(pool: &SqlitePool) -> Result<BackupStatus, CoreError> {
    let live_notebooks: i64 =
        sqlx::query_scalar("SELECT COUNT(*) FROM notebooks WHERE deleted_at IS NULL")
            .fetch_one(pool)
            .await?;
    let dirty = match repo::get_setting(pool, "backup_fingerprint").await? {
        Some(stored) => stored != workspace_fingerprint(pool).await?,
        None => true, // never backed up
    };
    Ok(BackupStatus {
        workspace_empty: live_notebooks == 0,
        dirty,
    })
}

pub async fn drive_backup_info(client: &DriveClient) -> Result<DriveBackupInfo, CoreError> {
    let files = client.list_appdata().await?;
    Ok(match pick_backup_file(&files) {
        Some(file) => {
            let size_bytes = file.size_bytes();
            DriveBackupInfo {
                has_backup: true,
                file_name: Some(file.name.clone()),
                size_bytes,
                created_time: file.created_time.clone(),
            }
        }
        None => DriveBackupInfo {
            has_backup: false,
            file_name: None,
            size_bytes: None,
            created_time: None,
        },
    })
}

/// The Drive file the app treats as "the backup": the single overwritten
/// file, or — until one exists — the newest archive from the old
/// multi-backup scheme. Relies on the newest-first Drive listing.
fn pick_backup_file(files: &[DriveFile]) -> Option<DriveFile> {
    files
        .iter()
        .find(|f| f.name == BACKUP_FILE_NAME)
        .or_else(|| files.iter().find(|f| is_legacy_backup_name(&f.name)))
        .cloned()
}

// ---------------------------------------------------------------------
// Scheduler
// ---------------------------------------------------------------------

/// What the scheduler needs from the shell: where the refresh token lives.
pub struct BackupAuth {
    pub config: GoogleConfig,
    pub refresh_token: String,
}

/// The refresh token lives in different places per shell (database for the
/// web server, OS keychain for the desktop app); this is the seam.
pub trait RefreshTokenStore: Send + Sync + 'static {
    fn load(
        &self,
    ) -> Pin<Box<dyn Future<Output = Result<Option<BackupAuth>, CoreError>> + Send>>;
}

/// Web-server mode: the token is a column of the single `google_account` row.
pub struct DbTokenStore {
    pool: SqlitePool,
}

impl DbTokenStore {
    pub fn new(pool: SqlitePool) -> Self {
        Self { pool }
    }
}

impl RefreshTokenStore for DbTokenStore {
    fn load(&self) -> Pin<Box<dyn Future<Output = Result<Option<BackupAuth>, CoreError>> + Send>> {
        let pool = self.pool.clone();
        Box::pin(async move {
            let Some(config) = GoogleConfig::load(&pool).await? else {
                return Ok(None);
            };
            let Some(account) = repo::load_google_account(&pool).await? else {
                return Ok(None);
            };
            let Some(refresh_token) = account.refresh_token.filter(|t| !t.is_empty()) else {
                return Ok(None);
            };
            Ok(Some(BackupAuth {
                config,
                refresh_token,
            }))
        })
    }
}

/// OS keychain helpers for desktop mode (Windows Credential Manager / macOS
/// Keychain / Secret Service).
#[cfg(feature = "keyring-store")]
pub mod keyring_store {
    use super::*;

    pub const SERVICE: &str = "com.oort.desktop";
    pub const USER: &str = "google-refresh-token";

    fn to_core_error(e: keyring::Error) -> CoreError {
        CoreError::Internal(format!("os keychain: {e}"))
    }

    pub fn store_refresh_token(token: &str) -> Result<(), CoreError> {
        keyring::Entry::new(SERVICE, USER)
            .map_err(to_core_error)?
            .set_password(token)
            .map_err(to_core_error)
    }

    pub fn load_refresh_token() -> Result<Option<String>, CoreError> {
        match keyring::Entry::new(SERVICE, USER)
            .map_err(to_core_error)?
            .get_password()
        {
            Ok(token) => Ok(Some(token)),
            Err(keyring::Error::NoEntry) => Ok(None),
            Err(e) => Err(to_core_error(e)),
        }
    }

    pub fn delete_refresh_token() -> Result<(), CoreError> {
        match keyring::Entry::new(SERVICE, USER)
            .map_err(to_core_error)?
            .delete_credential()
        {
            Ok(()) => Ok(()),
            Err(keyring::Error::NoEntry) => Ok(()),
            Err(e) => Err(to_core_error(e)),
        }
    }

    /// Desktop token store: credentials from the database, the token itself
    /// from the OS keychain.
    pub struct KeyringTokenStore {
        pool: SqlitePool,
    }

    impl KeyringTokenStore {
        pub fn new(pool: SqlitePool) -> Self {
            Self { pool }
        }
    }

    impl RefreshTokenStore for KeyringTokenStore {
        fn load(
            &self,
        ) -> Pin<Box<dyn Future<Output = Result<Option<BackupAuth>, CoreError>> + Send>> {
            let pool = self.pool.clone();
            Box::pin(async move {
                let Some(config) = GoogleConfig::load(&pool).await? else {
                    return Ok(None);
                };
                // keychain reads can be slow (Secret Service over dbus on
                // Linux); keep them off the async runtime threads
                let token = tokio::task::spawn_blocking(load_refresh_token)
                    .await
                    .map_err(|e| CoreError::Internal(format!("keychain task: {e}")))??;
                let Some(refresh_token) = token.filter(|t| !t.is_empty()) else {
                    return Ok(None);
                };
                Ok(Some(BackupAuth {
                    config,
                    refresh_token,
                }))
            })
        }
    }
}

/// True when the next scheduled backup is due (or none ever ran).
fn is_due(last_backup_at: Option<i64>, interval_days: u32, now: i64) -> bool {
    match last_backup_at {
        None => true,
        Some(last) => now - last >= interval_days as i64 * 86_400_000,
    }
}

/// One scheduler pass: runs a backup when automation is enabled, an account
/// is connected, and the interval has elapsed. `Ok(None)` means "nothing to
/// do" (not due, not connected, or an empty workspace); used by the
/// scheduler loop and safe to call from tests.
pub async fn run_due_backup(
    pool: &SqlitePool,
    store: &dyn RefreshTokenStore,
) -> Result<Option<BackupRun>, CoreError> {
    let settings = repo::load_backup_settings(pool).await?;
    if !settings.enabled || !is_due(settings.last_backup_at, settings.interval_days, now_ms()) {
        return Ok(None);
    }
    let Some(auth) = store.load().await? else {
        return Ok(None); // not connected
    };
    let client = DriveClient::new(auth.config, auth.refresh_token);
    run_backup(pool, &client).await
}

/// Background loop shared by both shells; checks every 15 minutes whether a
/// scheduled backup is due. Runs forever — spawned, not awaited.
pub async fn scheduler_loop(pool: SqlitePool, store: Arc<dyn RefreshTokenStore>) {
    let mut tick = tokio::time::interval(SCHEDULER_TICK);
    tick.set_missed_tick_behavior(tokio::time::MissedTickBehavior::Skip);
    loop {
        tick.tick().await;
        match run_due_backup(&pool, store.as_ref()).await {
            Ok(Some(run)) => tracing::info!(
                "scheduled backup uploaded: {} ({} bytes)",
                run.file_name,
                run.size_bytes
            ),
            Ok(None) => {}
            Err(e) => tracing::warn!("scheduled backup failed: {e}"),
        }
    }
}
