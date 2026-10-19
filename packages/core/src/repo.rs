use sqlx::SqlitePool;

use crate::error::CoreError;
use crate::models::{
    BackupSettings, Chapter, ChapterCanvas, GoogleAccount, Id, Notebook, PagePreset, Topic,
    TopicPage, UiPreset,
};

pub fn new_id() -> Id {
    uuid::Uuid::now_v7().to_string()
}

fn now_ms() -> i64 {
    std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .unwrap()
        .as_millis() as i64
}

type PresetRow = (
    String,
    String,
    String,
    String,
    i64,
    i64,
    String,
    i64,
    i32,
    i64,
);
type NotebookRow = (
    String,
    String,
    Option<String>,
    Option<String>,
    Option<String>,
    i64,
    i32,
    Option<i64>,
    Option<i64>,
    i64,
    i64,
    i64, // chapters_count
    i64, // topics_count
);
type ChapterRow = (
    String,
    String,
    String,
    String,
    Option<String>,
    Option<i64>,
    Option<i64>,
    Option<i64>,
    String,
    i32,
    i64,
    i64,
    Option<String>, // ui_preset_id
    i64,            // topics_count
);
type TopicRow = (String, String, String, i32, i64, Option<i64>, i64, i64);
type TopicPageRow = (String, String, String, i32, i64, i64);
type CanvasRow = (
    String,
    String,
    i32,
    Option<String>,
    i64,
    i64,
    i64,
);

fn preset_from(r: PresetRow) -> PagePreset {
    PagePreset {
        id: r.0,
        name: r.1,
        category: r.2,
        size_label: r.3,
        width: r.4,
        height: r.5,
        orientation: r.6,
        is_builtin: r.7 != 0,
        sort_order: r.8,
        created_at: r.9,
    }
}

fn notebook_from(r: NotebookRow) -> Notebook {
    Notebook {
        id: r.0,
        name: r.1,
        label: r.2,
        description: r.3,
        icon: r.4,
        is_favorite: r.5 != 0,
        position: r.6,
        last_opened_at: r.7,
        archived_at: r.8,
        created_at: r.9,
        updated_at: r.10,
        chapters_count: r.11,
        topics_count: r.12,
    }
}

fn chapter_from(r: ChapterRow) -> Chapter {
    Chapter {
        id: r.0,
        notebook_id: r.1,
        name: r.2,
        canvas_type: r.3,
        page_preset_id: r.4,
        page_width: r.5,
        page_height: r.6,
        scroll_width: r.7,
        background: r.8,
        ui_preset_id: r.12,
        topics_count: r.13,
        position: r.9,
        created_at: r.10,
        updated_at: r.11,
    }
}

fn topic_from(r: TopicRow) -> Topic {
    Topic {
        id: r.0,
        chapter_id: r.1,
        name: r.2,
        position: r.3,
        is_pinned: r.4 != 0,
        last_opened_at: r.5,
        created_at: r.6,
        updated_at: r.7,
    }
}

fn canvas_from(r: CanvasRow) -> Result<ChapterCanvas, CoreError> {
    let snapshot: serde_json::Value = serde_json::from_str(&r.1)?;
    Ok(ChapterCanvas {
        chapter_id: r.0,
        snapshot,
        snapshot_format: r.2,
        tldraw_version: r.3,
        shape_count: r.4,
        byte_size: r.5,
        saved_at: r.6,
    })
}

// =========================
// Page presets
// =========================

pub async fn list_page_presets(pool: &SqlitePool) -> Result<Vec<PagePreset>, CoreError> {
    let rows = sqlx::query_as::<_, PresetRow>(
        "SELECT id, name, category, size_label, width, height, orientation,
                is_builtin, sort_order, created_at
         FROM page_presets
         ORDER BY category, sort_order",
    )
    .fetch_all(pool)
    .await?;

    Ok(rows.into_iter().map(preset_from).collect())
}

async fn load_preset_size(
    pool: &SqlitePool,
    preset_id: &str,
) -> Result<Option<(i64, i64)>, CoreError> {
    let size: Option<(i64, i64)> =
        sqlx::query_as("SELECT width, height FROM page_presets WHERE id = ?")
            .bind(preset_id)
            .fetch_optional(pool)
            .await?;
    Ok(size)
}

// =========================
// Notebooks
// =========================

pub async fn create_notebook(
    pool: &SqlitePool,
    id: &str,
    name: &str,
    label: Option<&str>,
    description: Option<&str>,
    icon: Option<&str>,
) -> Result<Notebook, CoreError> {
    sqlx::query(
        "INSERT INTO notebooks (id, name, label, description, icon)
         VALUES (?, ?, ?, ?, ?)",
    )
    .bind(id)
    .bind(name)
    .bind(label)
    .bind(description)
    .bind(icon)
    .execute(pool)
    .await?;

    load_notebook(pool, id).await
}

pub async fn load_notebook(pool: &SqlitePool, id: &str) -> Result<Notebook, CoreError> {
    let r = sqlx::query_as::<_, NotebookRow>(
        "SELECT n.id, n.name, n.label, n.description, n.icon, n.is_favorite, n.position,
                n.last_opened_at, n.archived_at, n.created_at, n.updated_at,
                (SELECT COUNT(*) FROM chapters c WHERE c.notebook_id = n.id AND c.deleted_at IS NULL) AS chapters_count,
                (SELECT COUNT(*) FROM topics t
                  JOIN chapters c2 ON t.chapter_id = c2.id
                  WHERE c2.notebook_id = n.id AND t.deleted_at IS NULL AND c2.deleted_at IS NULL) AS topics_count
         FROM notebooks n WHERE n.id = ? AND n.deleted_at IS NULL",
    )
    .bind(id)
    .fetch_optional(pool)
    .await?
    .ok_or_else(|| CoreError::NotFound(format!("notebook {id}")))?;

    Ok(notebook_from(r))
}

/// Filter/sort/search are applied in SQL so the page never loads everything:
/// filter  = all | recent | favorites | archived
/// sort    = edited | opened | name   ('recent' forces 'opened')
/// search  = substring match on name/label/description
pub async fn list_notebooks(
    pool: &SqlitePool,
    filter: &str,
    sort: &str,
    search: Option<&str>,
) -> Result<Vec<Notebook>, CoreError> {
    let where_clause = match filter {
        "recent" => "archived_at IS NULL AND last_opened_at IS NOT NULL",
        "favorites" => "archived_at IS NULL AND is_favorite = 1",
        "archived" => "archived_at IS NOT NULL",
        _ => "archived_at IS NULL",
    };
    let effective_sort = if filter == "recent" { "opened" } else { sort };
    let order_clause = match effective_sort {
        "opened" => "last_opened_at DESC, updated_at DESC",
        "name" => "name COLLATE NOCASE ASC",
        _ => "updated_at DESC",
    };
    let search_clause = if search.is_some() {
        "AND (name LIKE ?1 OR label LIKE ?1 OR description LIKE ?1)"
    } else {
        ""
    };

    let sql = format!(
        "SELECT n.id, n.name, n.label, n.description, n.icon, n.is_favorite, n.position,
                n.last_opened_at, n.archived_at, n.created_at, n.updated_at,
                (SELECT COUNT(*) FROM chapters c WHERE c.notebook_id = n.id AND c.deleted_at IS NULL) AS chapters_count,
                (SELECT COUNT(*) FROM topics t
                  JOIN chapters c2 ON t.chapter_id = c2.id
                  WHERE c2.notebook_id = n.id AND t.deleted_at IS NULL AND c2.deleted_at IS NULL) AS topics_count
         FROM notebooks n
         WHERE n.deleted_at IS NULL {search_clause} AND {where_clause}
         ORDER BY {order_clause}"
    );

    let mut query = sqlx::query_as::<_, NotebookRow>(&sql);
    if let Some(q) = search {
        query = query.bind(format!("%{q}%"));
    }
    let rows = query.fetch_all(pool).await?;

    Ok(rows.into_iter().map(notebook_from).collect())
}

/// PATCH semantics: only supplied keys change. `name` renames the notebook.
pub async fn update_notebook_flags(
    pool: &SqlitePool,
    id: &str,
    name: Option<&str>,
    is_favorite: Option<bool>,
    archived: Option<bool>,
) -> Result<Notebook, CoreError> {
    if let Some(n) = name {
        if n.trim().is_empty() {
            return Err(CoreError::Internal("notebook name cannot be empty".into()));
        }
    }
    let ts = now_ms();
    let result = sqlx::query(
        "UPDATE notebooks
         SET name = COALESCE(?2, name),
             is_favorite = COALESCE(?3, is_favorite),
             archived_at = CASE ?4 WHEN 1 THEN ?5 WHEN 0 THEN NULL ELSE archived_at END,
             updated_at = ?6
         WHERE id = ?1 AND deleted_at IS NULL",
    )
    .bind(id)
    .bind(name.map(|n| n.trim()))
    .bind(is_favorite)
    .bind(archived.map(|a| if a { 1i64 } else { 0i64 }))
    .bind(ts)
    .bind(ts)
    .execute(pool)
    .await?;
    if result.rows_affected() == 0 {
        return Err(CoreError::NotFound(format!("notebook {id}")));
    }
    let r = sqlx::query_as::<_, NotebookRow>(
        "SELECT n.id, n.name, n.label, n.description, n.icon, n.is_favorite, n.position,
                n.last_opened_at, n.archived_at, n.created_at, n.updated_at,
                (SELECT COUNT(*) FROM chapters c WHERE c.notebook_id = n.id AND c.deleted_at IS NULL) AS chapters_count,
                (SELECT COUNT(*) FROM topics t
                  JOIN chapters c2 ON t.chapter_id = c2.id
                  WHERE c2.notebook_id = n.id AND t.deleted_at IS NULL AND c2.deleted_at IS NULL) AS topics_count
         FROM notebooks n WHERE n.id = ?1",
    )
    .bind(id)
    .fetch_one(pool)
    .await?;
    Ok(notebook_from(r))
}

pub async fn soft_delete_notebook(pool: &SqlitePool, id: &str) -> Result<(), CoreError> {
    let ts = now_ms();
    let result = sqlx::query(
        "UPDATE notebooks SET deleted_at = ?, updated_at = ?
         WHERE id = ? AND deleted_at IS NULL",
    )
    .bind(ts)
    .bind(ts)
    .bind(id)
    .execute(pool)
    .await?;

    if result.rows_affected() == 0 {
        return Err(CoreError::NotFound(format!("notebook {id}")));
    }
    Ok(())
}

// =========================
// Chapters
// =========================

const VALID_CANVAS_TYPES: [&str; 3] = ["infinite", "page", "scroll"];

pub async fn create_chapter(
    pool: &SqlitePool,
    id: &str,
    notebook_id: &str,
    name: &str,
    canvas_type: &str,
    page_preset_id: Option<&str>,
    page_width: Option<i64>,
    page_height: Option<i64>,
    scroll_width: Option<i64>,
    background: Option<&str>,
    ui_preset_id: Option<&str>,
) -> Result<Chapter, CoreError> {
    if !VALID_CANVAS_TYPES.contains(&canvas_type) {
        return Err(CoreError::Internal(format!(
            "invalid canvas_type '{canvas_type}' (expected infinite, page or scroll)"
        )));
    }

    // 'page' chapters need a size: either explicit or copied from the preset,
    // so the chapter stays stable even if the preset later changes or dies.
    let (preset_id, width, height) = if canvas_type == "page" {
        match (page_width, page_height) {
            (Some(w), Some(h)) => (page_preset_id, Some(w), Some(h)),
            _ => match page_preset_id {
                Some(pid) => match load_preset_size(pool, pid).await? {
                    Some((w, h)) => (Some(pid), Some(w), Some(h)),
                    None => {
                        return Err(CoreError::NotFound(format!("page preset {pid}")));
                    }
                },
                None => {
                    return Err(CoreError::Internal(
                        "page chapter requires page_preset_id or an explicit width/height"
                            .to_string(),
                    ));
                }
            },
        }
    } else {
        (None, None, None)
    };

    // 'scroll' chapters need a width; fall back to the seeded default.
    let scroll_w = if canvas_type == "scroll" {
        match scroll_width {
            Some(w) => Some(w),
            None => {
                let default: Option<String> =
                    sqlx::query_scalar("SELECT value FROM settings WHERE key = 'default_scroll_width'")
                        .fetch_optional(pool)
                        .await?;
                Some(
                    default
                        .and_then(|v| v.parse::<i64>().ok())
                        .unwrap_or(800),
                )
            }
        }
    } else {
        None
    };

    if let Some(uid) = ui_preset_id {
        load_ui_preset(pool, uid)
            .await
            .map_err(|_| CoreError::NotFound(format!("ui preset {uid}")))?;
    }

    sqlx::query(
        "INSERT INTO chapters
         (id, notebook_id, name, canvas_type, page_preset_id, ui_preset_id,
          page_width, page_height, scroll_width, background)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)",
    )
    .bind(id)
    .bind(notebook_id)
    .bind(name)
    .bind(canvas_type)
    .bind(preset_id)
    .bind(ui_preset_id)
    .bind(width)
    .bind(height)
    .bind(scroll_w)
    .bind(background.unwrap_or("plain"))
    .execute(pool)
    .await?;

    load_chapter(pool, id).await
}

pub async fn load_chapter(pool: &SqlitePool, id: &str) -> Result<Chapter, CoreError> {
    let r = sqlx::query_as::<_, ChapterRow>(
        "SELECT chapters.id, chapters.notebook_id, chapters.name, chapters.canvas_type, chapters.page_preset_id,
                chapters.page_width, chapters.page_height, chapters.scroll_width, chapters.background, chapters.position,
                chapters.created_at, chapters.updated_at, chapters.ui_preset_id,
                (SELECT COUNT(*) FROM topics t WHERE t.chapter_id = chapters.id AND t.deleted_at IS NULL) AS topics_count
         FROM chapters WHERE chapters.id = ? AND chapters.deleted_at IS NULL",
    )
    .bind(id)
    .fetch_optional(pool)
    .await?
    .ok_or_else(|| CoreError::NotFound(format!("chapter {id}")))?;

    Ok(chapter_from(r))
}

pub async fn list_chapters(
    pool: &SqlitePool,
    notebook_id: &str,
) -> Result<Vec<Chapter>, CoreError> {
    let rows = sqlx::query_as::<_, ChapterRow>(
        "SELECT chapters.id, chapters.notebook_id, chapters.name, chapters.canvas_type, chapters.page_preset_id,
                chapters.page_width, chapters.page_height, chapters.scroll_width, chapters.background, chapters.position,
                chapters.created_at, chapters.updated_at, chapters.ui_preset_id,
                (SELECT COUNT(*) FROM topics t WHERE t.chapter_id = chapters.id AND t.deleted_at IS NULL) AS topics_count
         FROM chapters WHERE chapters.notebook_id = ? AND chapters.deleted_at IS NULL
         ORDER BY chapters.position, chapters.created_at",
    )
    .bind(notebook_id)
    .fetch_all(pool)
    .await?;

    Ok(rows.into_iter().map(chapter_from).collect())
}

pub async fn soft_delete_chapter(pool: &SqlitePool, id: &str) -> Result<(), CoreError> {
    let ts = now_ms();
    let result = sqlx::query(
        "UPDATE chapters SET deleted_at = ?, updated_at = ?
         WHERE id = ? AND deleted_at IS NULL",
    )
    .bind(ts)
    .bind(ts)
    .bind(id)
    .execute(pool)
    .await?;

    if result.rows_affected() == 0 {
        return Err(CoreError::NotFound(format!("chapter {id}")));
    }
    Ok(())
}

/// Renames a chapter (title only; canvas configuration is immutable).
pub async fn update_chapter(pool: &SqlitePool, id: &str, name: &str) -> Result<Chapter, CoreError> {
    let result = sqlx::query("UPDATE chapters SET name = ?, updated_at = ? WHERE id = ? AND deleted_at IS NULL")
        .bind(name)
        .bind(now_ms())
        .bind(id)
        .execute(pool)
        .await?;
    if result.rows_affected() == 0 {
        return Err(CoreError::NotFound(format!("chapter {id}")));
    }
    load_chapter(pool, id).await
}

/// Changes the UI preset a chapter uses. Pass None to fall back to tldraw
/// defaults. Validates the preset exists when one is given.
pub async fn set_chapter_ui_preset(
    pool: &SqlitePool,
    id: &str,
    ui_preset_id: Option<&str>,
) -> Result<Chapter, CoreError> {
    if let Some(uid) = ui_preset_id {
        load_ui_preset(pool, uid)
            .await
            .map_err(|_| CoreError::NotFound(format!("ui preset {uid}")))?;
    }
    let result = sqlx::query("UPDATE chapters SET ui_preset_id = ?, updated_at = ? WHERE id = ? AND deleted_at IS NULL")
        .bind(ui_preset_id)
        .bind(now_ms())
        .bind(id)
        .execute(pool)
        .await?;
    if result.rows_affected() == 0 {
        return Err(CoreError::NotFound(format!("chapter {id}")));
    }
    load_chapter(pool, id).await
}

// =========================
// Topics
// =========================

/// Creates a topic. The id is supplied by the caller: tldraw pages and topics
/// share the same uuid (page record id = 'page:' + topic id), so pages created
/// inside the tldraw UI pass their own uuid here.
///
/// Upserts: undo in tldraw can resurrect a page whose topic was already
/// soft-deleted, in which case the existing row is brought back to life.
pub async fn create_topic(
    pool: &SqlitePool,
    id: &str,
    chapter_id: &str,
    name: &str,
) -> Result<Topic, CoreError> {
    sqlx::query(
        "INSERT INTO topics (id, chapter_id, name) VALUES (?, ?, ?)
         ON CONFLICT(id) DO UPDATE SET
             deleted_at = NULL,
             name = excluded.name,
             updated_at = CAST((julianday('now') - 2440587.5) * 86400000 AS INTEGER)",
    )
    .bind(id)
    .bind(chapter_id)
    .bind(name)
    .execute(pool)
    .await?;

    load_topic(pool, id).await
}

pub async fn load_topic(pool: &SqlitePool, id: &str) -> Result<Topic, CoreError> {
    let r = sqlx::query_as::<_, TopicRow>(
        "SELECT id, chapter_id, name, position, is_pinned, last_opened_at, created_at, updated_at
         FROM topics WHERE id = ? AND deleted_at IS NULL",
    )
    .bind(id)
    .fetch_optional(pool)
    .await?
    .ok_or_else(|| CoreError::NotFound(format!("topic {id}")))?;

    Ok(topic_from(r))
}

pub async fn list_topics(pool: &SqlitePool, chapter_id: &str) -> Result<Vec<Topic>, CoreError> {
    let rows = sqlx::query_as::<_, TopicRow>(
        "SELECT id, chapter_id, name, position, is_pinned, last_opened_at, created_at, updated_at
         FROM topics WHERE chapter_id = ? AND deleted_at IS NULL
         ORDER BY position, created_at",
    )
    .bind(chapter_id)
    .fetch_all(pool)
    .await?;

    Ok(rows.into_iter().map(topic_from).collect())
}

pub async fn soft_delete_topic(pool: &SqlitePool, id: &str) -> Result<(), CoreError> {
    let ts = now_ms();
    let result = sqlx::query(
        "UPDATE topics SET deleted_at = ?, updated_at = ?
         WHERE id = ? AND deleted_at IS NULL",
    )
    .bind(ts)
    .bind(ts)
    .bind(id)
    .execute(pool)
    .await?;

    if result.rows_affected() == 0 {
        return Err(CoreError::NotFound(format!("topic {id}")));
    }
    Ok(())
}

/// Renames and/or reorders a topic. Used by the page-sync engine to mirror
/// changes made in the tldraw UI; also revives soft-deleted rows, because a
/// page present in the editor is a topic that exists.
pub async fn update_topic(
    pool: &SqlitePool,
    id: &str,
    name: Option<&str>,
    position: Option<i32>,
) -> Result<Topic, CoreError> {
    let ts = now_ms();
    let result = sqlx::query(
        "UPDATE topics
         SET name = COALESCE(?, name), position = COALESCE(?, position),
             deleted_at = NULL, updated_at = ?
         WHERE id = ?",
    )
    .bind(name)
    .bind(position)
    .bind(ts)
    .bind(id)
    .execute(pool)
    .await?;

    if result.rows_affected() == 0 {
        return Err(CoreError::NotFound(format!("topic {id}")));
    }
    load_topic(pool, id).await
}

// =========================
// Topic pages (multi-page topics in 'page' chapters)
// =========================

fn topic_page_from(r: TopicPageRow) -> TopicPage {
    TopicPage {
        id: r.0,
        topic_id: r.1,
        name: r.2,
        position: r.3,
        created_at: r.4,
        updated_at: r.5,
    }
}

/// Creates a page of a multi-page topic. The caller supplies the id: tldraw
/// page ids map to topic_pages ids ('page:' + topic_page id), so pages created
/// inside the tldraw UI pass their own uuid here. Upserts for the same
/// undo-resurrection reason as topics.
pub async fn create_topic_page(
    pool: &SqlitePool,
    id: &str,
    topic_id: &str,
    name: &str,
) -> Result<TopicPage, CoreError> {
    sqlx::query(
        "INSERT INTO topic_pages (id, topic_id, name) VALUES (?, ?, ?)
         ON CONFLICT(id) DO UPDATE SET
             name = excluded.name,
             updated_at = CAST((julianday('now') - 2440587.5) * 86400000 AS INTEGER)",
    )
    .bind(id)
    .bind(topic_id)
    .bind(name)
    .execute(pool)
    .await?;

    load_topic_page(pool, id).await
}

pub async fn load_topic_page(pool: &SqlitePool, id: &str) -> Result<TopicPage, CoreError> {
    let r = sqlx::query_as::<_, TopicPageRow>(
        "SELECT id, topic_id, name, position, created_at, updated_at
         FROM topic_pages WHERE id = ?",
    )
    .bind(id)
    .fetch_optional(pool)
    .await?
    .ok_or_else(|| CoreError::NotFound(format!("topic page {id}")))?;

    Ok(topic_page_from(r))
}

pub async fn list_topic_pages(
    pool: &SqlitePool,
    topic_id: &str,
) -> Result<Vec<TopicPage>, CoreError> {
    let rows = sqlx::query_as::<_, TopicPageRow>(
        "SELECT id, topic_id, name, position, created_at, updated_at
         FROM topic_pages WHERE topic_id = ?
         ORDER BY position, created_at",
    )
    .bind(topic_id)
    .fetch_all(pool)
    .await?;

    Ok(rows.into_iter().map(topic_page_from).collect())
}

/// Renames and/or reorders a page of a multi-page topic (page-sync mirror).
pub async fn update_topic_page(
    pool: &SqlitePool,
    id: &str,
    name: Option<&str>,
    position: Option<i32>,
) -> Result<TopicPage, CoreError> {
    let ts = now_ms();
    let result = sqlx::query(
        "UPDATE topic_pages
         SET name = COALESCE(?, name), position = COALESCE(?, position), updated_at = ?
         WHERE id = ?",
    )
    .bind(name)
    .bind(position)
    .bind(ts)
    .bind(id)
    .execute(pool)
    .await?;

    if result.rows_affected() == 0 {
        return Err(CoreError::NotFound(format!("topic page {id}")));
    }
    load_topic_page(pool, id).await
}

/// Removes a page of a multi-page topic (tldraw page deleted in the UI).
pub async fn delete_topic_page(pool: &SqlitePool, id: &str) -> Result<(), CoreError> {
    let result = sqlx::query("DELETE FROM topic_pages WHERE id = ?")
        .bind(id)
        .execute(pool)
        .await?;

    if result.rows_affected() == 0 {
        return Err(CoreError::NotFound(format!("topic page {id}")));
    }
    Ok(())
}

// =========================
// Chapter canvas
// =========================

/// Count shapes in a tldraw snapshot without trusting its exact layout:
/// they live under document.store keyed as "shape:<id>".
fn count_shapes(snapshot: &serde_json::Value) -> i64 {
    snapshot
        .get("document")
        .and_then(|d| d.get("store"))
        .and_then(|s| s.as_object())
        .map(|records| {
            records
                .keys()
                .filter(|k| k.starts_with("shape:"))
                .count() as i64
        })
        .unwrap_or(0)
}

/// Returns the chapter's stored editor snapshot, or an empty one if the
/// chapter was never saved (fresh canvas).
pub async fn load_chapter_canvas(
    pool: &SqlitePool,
    chapter_id: &str,
) -> Result<ChapterCanvas, CoreError> {
    let r = sqlx::query_as::<_, CanvasRow>(
        "SELECT chapter_id, snapshot, snapshot_format, tldraw_version, shape_count,
                byte_size, saved_at
         FROM chapter_canvas WHERE chapter_id = ?",
    )
    .bind(chapter_id)
    .fetch_optional(pool)
    .await?;

    match r {
        Some(r) => canvas_from(r),
        None => Ok(ChapterCanvas {
            chapter_id: chapter_id.to_string(),
            snapshot: serde_json::json!({}),
            snapshot_format: 1,
            tldraw_version: None,
            shape_count: 0,
            byte_size: 0,
            saved_at: 0,
        }),
    }
}

pub async fn save_chapter_canvas(
    pool: &SqlitePool,
    chapter_id: &str,
    snapshot: &serde_json::Value,
    tldraw_version: Option<&str>,
) -> Result<(), CoreError> {
    let snapshot_str = serde_json::to_string(snapshot)?;
    let shape_count = count_shapes(snapshot);
    let byte_size = snapshot_str.len() as i64;

    // Upsert: the row is created on first save. The chapter_canvas_touch
    // trigger stamps saved_at and the chapter's and notebook's updated_at.
    sqlx::query(
        "INSERT INTO chapter_canvas
             (chapter_id, snapshot, snapshot_format, tldraw_version, shape_count, byte_size)
         VALUES (?, ?, 1, ?, ?, ?)
         ON CONFLICT(chapter_id) DO UPDATE SET
             snapshot = excluded.snapshot,
             snapshot_format = excluded.snapshot_format,
             tldraw_version = COALESCE(excluded.tldraw_version, chapter_canvas.tldraw_version),
             shape_count = excluded.shape_count,
             byte_size = excluded.byte_size",
    )
    .bind(chapter_id)
    .bind(&snapshot_str)
    .bind(tldraw_version)
    .bind(shape_count)
    .bind(byte_size)
    .execute(pool)
    .await?;

    Ok(())
}

// =========================
// UI presets
// =========================

type UiPresetRow = (String, String, String, i64, i64);

fn ui_preset_from(r: UiPresetRow) -> UiPreset {
    UiPreset {
        id: r.0,
        name: r.1,
        config: serde_json::from_str(&r.2).unwrap_or(serde_json::Value::Null),
        created_at: r.3,
        updated_at: r.4,
    }
}

pub async fn create_ui_preset(
    pool: &SqlitePool,
    id: &str,
    name: &str,
    config: &serde_json::Value,
) -> Result<UiPreset, CoreError> {
    sqlx::query("INSERT INTO ui_presets (id, name, config) VALUES (?, ?, ?)")
        .bind(id)
        .bind(name)
        .bind(config.to_string())
        .execute(pool)
        .await?;
    load_ui_preset(pool, id).await
}

pub async fn load_ui_preset(pool: &SqlitePool, id: &str) -> Result<UiPreset, CoreError> {
    let r = sqlx::query_as::<_, UiPresetRow>(
        "SELECT id, name, config, created_at, updated_at FROM ui_presets WHERE id = ?",
    )
    .bind(id)
    .fetch_optional(pool)
    .await?
    .ok_or_else(|| CoreError::NotFound(format!("ui preset {id}")))?;
    Ok(ui_preset_from(r))
}

pub async fn list_ui_presets(pool: &SqlitePool) -> Result<Vec<UiPreset>, CoreError> {
    let rows = sqlx::query_as::<_, UiPresetRow>(
        "SELECT id, name, config, created_at, updated_at FROM ui_presets ORDER BY created_at",
    )
    .fetch_all(pool)
    .await?;
    Ok(rows.into_iter().map(ui_preset_from).collect())
}

pub async fn update_ui_preset(
    pool: &SqlitePool,
    id: &str,
    name: Option<&str>,
    config: Option<&serde_json::Value>,
) -> Result<UiPreset, CoreError> {
    let result = sqlx::query(
        "UPDATE ui_presets
         SET name = COALESCE(?, name),
             config = COALESCE(?, config),
             updated_at = ?
         WHERE id = ?",
    )
    .bind(name)
    .bind(config.map(|c| c.to_string()))
    .bind(now_ms())
    .bind(id)
    .execute(pool)
    .await?;
    if result.rows_affected() == 0 {
        return Err(CoreError::NotFound(format!("ui preset {id}")));
    }
    load_ui_preset(pool, id).await
}

pub async fn delete_ui_preset(pool: &SqlitePool, id: &str) -> Result<(), CoreError> {
    let result = sqlx::query("DELETE FROM ui_presets WHERE id = ?")
        .bind(id)
        .execute(pool)
        .await?;
    if result.rows_affected() == 0 {
        return Err(CoreError::NotFound(format!("ui preset {id}")));
    }
    Ok(())
}

// ---------------------------------------------------------------------
// Settings (key/value)
// ---------------------------------------------------------------------

pub async fn get_setting(pool: &SqlitePool, key: &str) -> Result<Option<String>, CoreError> {
    let value: Option<String> = sqlx::query_scalar("SELECT value FROM settings WHERE key = ?")
        .bind(key)
        .fetch_optional(pool)
        .await?;
    Ok(value)
}

pub async fn set_setting(pool: &SqlitePool, key: &str, value: &str) -> Result<(), CoreError> {
    sqlx::query(
        "INSERT INTO settings (key, value, updated_at) VALUES (?, ?, ?)
         ON CONFLICT (key) DO UPDATE SET value = excluded.value, updated_at = excluded.updated_at",
    )
    .bind(key)
    .bind(value)
    .bind(now_ms())
    .execute(pool)
    .await?;
    Ok(())
}

// ---------------------------------------------------------------------
// Google account (single row)
// ---------------------------------------------------------------------

type GoogleAccountRow = (Option<String>, Option<String>, String, i64);

fn google_account_from(r: GoogleAccountRow) -> GoogleAccount {
    GoogleAccount {
        email: r.0,
        refresh_token: r.1,
        scopes: r.2,
        connected_at: r.3,
    }
}

pub async fn load_google_account(pool: &SqlitePool) -> Result<Option<GoogleAccount>, CoreError> {
    let row = sqlx::query_as::<_, GoogleAccountRow>(
        "SELECT email, refresh_token, scopes, connected_at FROM google_account WHERE id = 1",
    )
    .fetch_optional(pool)
    .await?;
    Ok(row.map(google_account_from))
}

/// Upserts the single account row. Pass `refresh_token = None` to keep the
/// stored one (desktop mode stores it in the keychain instead).
pub async fn save_google_account(
    pool: &SqlitePool,
    email: Option<&str>,
    refresh_token: Option<&str>,
    scopes: &str,
) -> Result<GoogleAccount, CoreError> {
    sqlx::query(
        "INSERT INTO google_account (id, email, refresh_token, scopes, connected_at)
         VALUES (1, ?, ?, ?, ?)
         ON CONFLICT (id) DO UPDATE SET
           email = excluded.email,
           refresh_token = COALESCE(excluded.refresh_token, google_account.refresh_token),
           scopes = excluded.scopes,
           connected_at = excluded.connected_at",
    )
    .bind(email)
    .bind(refresh_token)
    .bind(scopes)
    .bind(now_ms())
    .execute(pool)
    .await?;
    load_google_account(pool)
        .await?
        .ok_or_else(|| CoreError::Internal("google account upsert failed".to_string()))
}

pub async fn clear_google_account(pool: &SqlitePool) -> Result<(), CoreError> {
    sqlx::query("DELETE FROM google_account WHERE id = 1")
        .execute(pool)
        .await?;
    Ok(())
}

// ---------------------------------------------------------------------
// Backup settings (settings-table view)
// ---------------------------------------------------------------------

pub async fn load_backup_settings(pool: &SqlitePool) -> Result<BackupSettings, CoreError> {
    let enabled = get_setting(pool, "backup_enabled")
        .await?
        .map(|v| v == "1")
        .unwrap_or(true);
    let interval_days = get_setting(pool, "backup_interval_days")
        .await?
        .and_then(|v| v.parse::<u32>().ok())
        .unwrap_or(7)
        .clamp(1, 365);
    let last_backup_at = get_setting(pool, "last_backup_at")
        .await?
        .and_then(|v| v.parse::<i64>().ok());
    Ok(BackupSettings {
        enabled,
        interval_days,
        last_backup_at,
    })
}

pub async fn save_backup_settings(
    pool: &SqlitePool,
    settings: &BackupSettings,
) -> Result<BackupSettings, CoreError> {
    set_setting(pool, "backup_enabled", if settings.enabled { "1" } else { "0" }).await?;
    set_setting(
        pool,
        "backup_interval_days",
        &settings.interval_days.clamp(1, 365).to_string(),
    )
    .await?;
    load_backup_settings(pool).await
}
