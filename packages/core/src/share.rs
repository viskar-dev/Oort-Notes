//! Shareable single-notebook files (`.oort`).
//!
//! A `.oort` file is a versioned JSON archive containing one notebook and
//! everything that belongs to it: chapters, topics, topic pages, canvas
//! snapshots, referenced UI presets, and tags used by those topics.
//!
//! Importing a share file always creates a copy with fresh ids for the
//! notebook, chapters, topics and topic pages. Canvas snapshots are rewritten
//! so tldraw's `page:<topic-id>` records point at the copied topics.

use std::collections::{BTreeMap, HashMap, HashSet};

use serde::{Deserialize, Serialize};
use sqlx::SqlitePool;

use crate::backup::{export_data, ArchiveCounts, ArchiveData};
use crate::error::CoreError;
use crate::models::Notebook;
use crate::repo;

pub const NOTEBOOK_SHARE_FORMAT: u32 = 1;

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct NotebookShareArchive {
    pub app: String,
    pub kind: String,
    pub format: u32,
    pub created_at: i64,
    pub counts: ArchiveCounts,
    pub data: ArchiveData,
}

fn now_ms() -> i64 {
    std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .map(|d| d.as_millis() as i64)
        .unwrap_or(0)
}

/// Builds a shareable `.oort` archive (JSON string) for one notebook.
pub async fn build_notebook_share(pool: &SqlitePool, notebook_id: &str) -> Result<String, CoreError> {
    let all = export_data(pool).await?;

    let notebook = all
        .notebooks
        .iter()
        .find(|r| r.id == notebook_id && r.deleted_at.is_none())
        .cloned()
        .ok_or_else(|| CoreError::NotFound(format!("notebook {notebook_id}")))?;

    let chapters: Vec<_> = all
        .chapters
        .into_iter()
        .filter(|r| r.notebook_id == notebook_id && r.deleted_at.is_none())
        .collect();
    let chapter_ids: HashSet<String> = chapters.iter().map(|r| r.id.clone()).collect();

    let topics: Vec<_> = all
        .topics
        .into_iter()
        .filter(|r| chapter_ids.contains(&r.chapter_id) && r.deleted_at.is_none())
        .collect();
    let topic_ids: HashSet<String> = topics.iter().map(|r| r.id.clone()).collect();

    let topic_pages: Vec<_> = all
        .topic_pages
        .into_iter()
        .filter(|r| topic_ids.contains(&r.topic_id))
        .collect();

    let chapter_canvas: Vec<_> = all
        .chapter_canvas
        .into_iter()
        .filter(|r| chapter_ids.contains(&r.chapter_id))
        .collect();

    let preset_ids: HashSet<String> = chapters
        .iter()
        .filter_map(|r| r.page_preset_id.clone())
        .chain(chapters.iter().filter_map(|r| r.ui_preset_id.clone()))
        .collect();
    let ui_presets: Vec<_> = all
        .ui_presets
        .into_iter()
        .filter(|r| preset_ids.contains(&r.id))
        .collect();

    let topic_tags: Vec<_> = all
        .topic_tags
        .into_iter()
        .filter(|r| topic_ids.contains(&r.topic_id))
        .collect();
    let tag_ids: HashSet<String> = topic_tags.iter().map(|r| r.tag_id.clone()).collect();
    let tags: Vec<_> = all.tags.into_iter().filter(|r| tag_ids.contains(&r.id)).collect();

    let data = ArchiveData {
        ui_presets,
        notebooks: vec![notebook],
        chapters,
        topics,
        topic_pages,
        chapter_canvas,
        tags,
        topic_tags,
    };
    let counts = ArchiveCounts {
        notebooks: data.notebooks.len(),
        chapters: data.chapters.len(),
        topics: data.topics.len(),
        topic_pages: data.topic_pages.len(),
        chapter_canvas: data.chapter_canvas.len(),
        ui_presets: data.ui_presets.len(),
        tags: data.tags.len(),
        topic_tags: data.topic_tags.len(),
    };
    let archive = NotebookShareArchive {
        app: "oort-notes".to_string(),
        kind: "notebook".to_string(),
        format: NOTEBOOK_SHARE_FORMAT,
        created_at: now_ms(),
        counts,
        data,
    };

    Ok(serde_json::to_string(&archive)?)
}

/// Imports a `.oort` notebook archive as a new notebook. The returned
/// notebook uses fresh ids; `name_override` lets the importer rename it.
pub async fn import_notebook(
    pool: &SqlitePool,
    archive_json: &str,
    name_override: Option<&str>,
) -> Result<Notebook, CoreError> {
    let archive: NotebookShareArchive = serde_json::from_str(archive_json)
        .map_err(|e| CoreError::Internal(format!("not a valid Oort notebook file: {e}")))?;
    if archive.app != "oort-notes" || archive.kind != "notebook" {
        return Err(CoreError::Internal(format!(
            "this file is not an Oort notebook archive (app: '{}', kind: '{}')",
            archive.app, archive.kind
        )));
    }
    if archive.format > NOTEBOOK_SHARE_FORMAT {
        return Err(CoreError::Internal(format!(
            "this notebook file uses format {} but this version only understands up to {NOTEBOOK_SHARE_FORMAT}; update the app to import it",
            archive.format
        )));
    }

    let data = archive.data;
    let source = data
        .notebooks
        .first()
        .ok_or_else(|| CoreError::Internal("this notebook file has no notebook".to_string()))?;
    let imported_name = name_override
        .map(str::trim)
        .filter(|s| !s.is_empty())
        .unwrap_or_else(|| source.name.trim());
    if imported_name.is_empty() {
        return Err(CoreError::Internal("notebook name is required".to_string()));
    }

    // Copy ids: every imported entity gets a fresh id so the same share
    // file can be imported repeatedly without primary-key collisions.
    let notebook_id = repo::new_id();
    let mut chapter_ids: HashMap<String, String> = HashMap::new();
    for r in &data.chapters {
        chapter_ids.insert(r.id.clone(), repo::new_id());
    }
    let mut topic_ids: HashMap<String, String> = HashMap::new();
    for r in &data.topics {
        topic_ids.insert(r.id.clone(), repo::new_id());
    }
    let mut topic_page_ids: HashMap<String, String> = HashMap::new();
    for r in &data.topic_pages {
        topic_page_ids.insert(r.id.clone(), repo::new_id());
    }

    // tldraw page records reference topics/topic-pages directly; rewrite
    // both the bare ids and the `page:<id>` form wherever they appear.
    let mut page_replacements: BTreeMap<String, String> = BTreeMap::new();
    for (old, new) in &topic_ids {
        page_replacements.insert(old.clone(), new.clone());
        page_replacements.insert(format!("page:{old}"), format!("page:{new}"));
    }
    for (old, new) in &topic_page_ids {
        page_replacements.insert(old.clone(), new.clone());
        page_replacements.insert(format!("page:{old}"), format!("page:{new}"));
    }

    let known_presets: HashSet<String> = sqlx::query_scalar("SELECT id FROM page_presets")
        .fetch_all(pool)
        .await?
        .into_iter()
        .collect();

    let mut tx = pool.begin().await?;

    // UI presets are shared by id when possible; existing presets are
    // reused so a chapter never points at a missing row.
    let mut ui_preset_ids: HashMap<String, String> = HashMap::new();
    for r in &data.ui_presets {
        let exists: Option<String> = sqlx::query_scalar("SELECT id FROM ui_presets WHERE id = ?")
            .bind(&r.id)
            .fetch_optional(&mut *tx)
            .await?;
        if exists.is_none() {
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
        ui_preset_ids.insert(r.id.clone(), r.id.clone());
    }

    // Tags are deduplicated by id, then by case-insensitive name.
    let existing_tags: Vec<(String, String)> =
        sqlx::query_as("SELECT id, name FROM tags")
            .fetch_all(&mut *tx)
            .await?;
    let mut tag_ids: HashMap<String, String> = HashMap::new();
    for r in &data.tags {
        if let Some((existing_id, _)) = existing_tags.iter().find(|(id, _)| id == &r.id) {
            tag_ids.insert(r.id.clone(), existing_id.clone());
            continue;
        }
        if let Some((existing_id, _)) = existing_tags
            .iter()
            .find(|(_, name)| name.eq_ignore_ascii_case(&r.name))
        {
            tag_ids.insert(r.id.clone(), existing_id.clone());
            continue;
        }
        sqlx::query("INSERT INTO tags (id, name, created_at) VALUES (?, ?, ?)")
            .bind(&r.id)
            .bind(&r.name)
            .bind(r.created_at)
            .execute(&mut *tx)
            .await?;
        tag_ids.insert(r.id.clone(), r.id.clone());
    }

    sqlx::query(
        "INSERT INTO notebooks (id, name, label, description, icon, is_favorite,
                                position, last_opened_at, archived_at, created_at,
                                updated_at, deleted_at)
         VALUES (?, ?, ?, ?, ?, 0, 0, NULL, NULL, ?, ?, NULL)",
    )
    .bind(&notebook_id)
    .bind(imported_name)
    .bind(&source.label)
    .bind(&source.description)
    .bind(&source.icon)
    .bind(source.created_at)
    .bind(source.updated_at)
    .execute(&mut *tx)
    .await?;

    for r in &data.chapters {
        let new_id = chapter_ids
            .get(&r.id)
            .ok_or_else(|| CoreError::Internal("chapter id map is missing an entry".to_string()))?;
        let page_preset_id = r
            .page_preset_id
            .as_ref()
            .filter(|p| known_presets.contains(*p));
        let ui_preset_id = r.ui_preset_id.as_ref().and_then(|id| ui_preset_ids.get(id));
        sqlx::query(
            "INSERT INTO chapters (id, notebook_id, name, canvas_type, page_preset_id,
                                   page_width, page_height, scroll_width, background,
                                   position, created_at, updated_at, deleted_at, ui_preset_id)
             VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, NULL, ?)",
        )
        .bind(new_id)
        .bind(&notebook_id)
        .bind(&r.name)
        .bind(&r.canvas_type)
        .bind(page_preset_id)
        .bind(r.page_width)
        .bind(r.page_height)
        .bind(r.scroll_width)
        .bind(&r.background)
        .bind(r.position)
        .bind(r.created_at)
        .bind(r.updated_at)
        .bind(ui_preset_id)
        .execute(&mut *tx)
        .await?;
    }

    for r in &data.topics {
        let new_id = topic_ids
            .get(&r.id)
            .ok_or_else(|| CoreError::Internal("topic id map is missing an entry".to_string()))?;
        let new_chapter_id = chapter_ids
            .get(&r.chapter_id)
            .ok_or_else(|| CoreError::Internal("topic references an unknown chapter".to_string()))?;
        sqlx::query(
            "INSERT INTO topics (id, chapter_id, name, position, is_pinned,
                                 last_opened_at, created_at, updated_at, deleted_at)
             VALUES (?, ?, ?, ?, ?, ?, ?, ?, NULL)",
        )
        .bind(new_id)
        .bind(new_chapter_id)
        .bind(&r.name)
        .bind(r.position)
        .bind(r.is_pinned)
        .bind(r.last_opened_at)
        .bind(r.created_at)
        .bind(r.updated_at)
        .execute(&mut *tx)
        .await?;
    }

    for r in &data.topic_pages {
        let new_id = topic_page_ids
            .get(&r.id)
            .ok_or_else(|| CoreError::Internal("topic page id map is missing an entry".to_string()))?;
        let new_topic_id = topic_ids
            .get(&r.topic_id)
            .ok_or_else(|| CoreError::Internal("topic page references an unknown topic".to_string()))?;
        sqlx::query(
            "INSERT INTO topic_pages (id, topic_id, name, position, created_at, updated_at)
             VALUES (?, ?, ?, ?, ?, ?)",
        )
        .bind(new_id)
        .bind(new_topic_id)
        .bind(&r.name)
        .bind(r.position)
        .bind(r.created_at)
        .bind(r.updated_at)
        .execute(&mut *tx)
        .await?;
    }

    for r in &data.chapter_canvas {
        let new_chapter_id = chapter_ids
            .get(&r.chapter_id)
            .ok_or_else(|| CoreError::Internal("canvas references an unknown chapter".to_string()))?;
        let snapshot = rewrite_snapshot(&r.snapshot, &page_replacements)?;
        let byte_size = snapshot.len() as i64;
        sqlx::query(
            "INSERT INTO chapter_canvas (chapter_id, snapshot, snapshot_format,
                                         tldraw_version, shape_count, byte_size, saved_at)
             VALUES (?, ?, ?, ?, ?, ?, ?)",
        )
        .bind(new_chapter_id)
        .bind(&snapshot)
        .bind(r.snapshot_format)
        .bind(&r.tldraw_version)
        .bind(r.shape_count)
        .bind(byte_size)
        .bind(r.saved_at)
        .execute(&mut *tx)
        .await?;
    }

    for r in &data.topic_tags {
        let Some(new_topic_id) = topic_ids.get(&r.topic_id) else {
            continue;
        };
        let Some(new_tag_id) = tag_ids.get(&r.tag_id) else {
            continue;
        };
        sqlx::query("INSERT OR IGNORE INTO topic_tags (topic_id, tag_id) VALUES (?, ?)")
            .bind(new_topic_id)
            .bind(new_tag_id)
            .execute(&mut *tx)
            .await?;
    }

    // Insert triggers bump parent timestamps; restore the archived ones so
    // the copy keeps the source notebook's ordering.
    sqlx::query("UPDATE notebooks SET updated_at = ? WHERE id = ?")
        .bind(source.updated_at)
        .bind(&notebook_id)
        .execute(&mut *tx)
        .await?;
    for r in &data.chapters {
        let new_id = &chapter_ids[&r.id];
        sqlx::query("UPDATE chapters SET updated_at = ? WHERE id = ?")
            .bind(r.updated_at)
            .bind(new_id)
            .execute(&mut *tx)
            .await?;
    }
    for r in &data.topics {
        let new_id = &topic_ids[&r.id];
        sqlx::query("UPDATE topics SET updated_at = ? WHERE id = ?")
            .bind(r.updated_at)
            .bind(new_id)
            .execute(&mut *tx)
            .await?;
    }

    tx.commit().await?;

    repo::load_notebook(pool, &notebook_id).await
}

fn rewrite_snapshot(snapshot: &str, replacements: &BTreeMap<String, String>) -> Result<String, CoreError> {
    let mut value: serde_json::Value = serde_json::from_str(snapshot)?;
    rewrite_value(&mut value, replacements);
    Ok(serde_json::to_string(&value)?)
}

fn rewrite_value(value: &mut serde_json::Value, replacements: &BTreeMap<String, String>) {
    match value {
        serde_json::Value::String(s) => {
            if let Some(new) = replacements.get(s) {
                *s = new.clone();
            }
        }
        serde_json::Value::Array(items) => {
            for item in items {
                rewrite_value(item, replacements);
            }
        }
        serde_json::Value::Object(obj) => {
            let mut new_obj = serde_json::Map::new();
            for (key, mut child) in std::mem::take(obj) {
                rewrite_value(&mut child, replacements);
                let new_key = replacements.get(&key).cloned().unwrap_or(key);
                new_obj.insert(new_key, child);
            }
            *obj = new_obj;
        }
        _ => {}
    }
}
