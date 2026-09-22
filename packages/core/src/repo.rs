use sqlx::SqlitePool;

use crate::error::CoreError;
use crate::models::{Id, Notebook, Page, PageWithContent, Subject, Topic};

pub fn new_id() -> Id {
    uuid::Uuid::now_v7().to_string()
}

fn now_ms() -> i64 {
    std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .unwrap()
        .as_millis() as i64
}

type SubjectRow = (
    String,
    String,
    Option<String>,
    Option<String>,
    i32,
    i64,
    i64,
);
type NotebookRow = (
    String,
    String,
    String,
    Option<String>,
    Option<String>,
    Option<String>,
    i32,
    i64,
    i64,
);
type TopicRow = (String, String, String, i32, i64, i64);
type PageRow = (String, String, String, f64, f64, String, i32, i64, i64);

// =========================
// Subjects
// =========================

pub async fn create_subject(
    pool: &SqlitePool,
    id: &str,
    title: &str,
    subtitle: Option<&str>,
    cover: Option<&str>,
) -> Result<Subject, CoreError> {
    let ts = now_ms();
    sqlx::query(
        "INSERT INTO subjects (id, title, subtitle, cover, position, created_at, updated_at)
         VALUES (?, ?, ?, ?, 0, ?, ?)",
    )
    .bind(id)
    .bind(title)
    .bind(subtitle)
    .bind(cover)
    .bind(ts)
    .bind(ts)
    .execute(pool)
    .await?;

    load_subject(pool, id).await
}

pub async fn load_subject(pool: &SqlitePool, id: &str) -> Result<Subject, CoreError> {
    let r = sqlx::query_as::<_, SubjectRow>(
        "SELECT id, title, subtitle, cover, position, created_at, updated_at
         FROM subjects WHERE id = ? AND deleted_at IS NULL",
    )
    .bind(id)
    .fetch_optional(pool)
    .await?
    .ok_or_else(|| CoreError::NotFound(format!("subject {id}")))?;

    Ok(Subject {
        id: r.0,
        title: r.1,
        subtitle: r.2,
        cover: r.3,
        position: r.4,
        created_at: r.5,
        updated_at: r.6,
    })
}

pub async fn list_subjects(pool: &SqlitePool) -> Result<Vec<Subject>, CoreError> {
    let rows = sqlx::query_as::<_, SubjectRow>(
        "SELECT id, title, subtitle, cover, position, created_at, updated_at
         FROM subjects WHERE deleted_at IS NULL
         ORDER BY position, created_at",
    )
    .fetch_all(pool)
    .await?;

    Ok(rows
        .into_iter()
        .map(|r| Subject {
            id: r.0,
            title: r.1,
            subtitle: r.2,
            cover: r.3,
            position: r.4,
            created_at: r.5,
            updated_at: r.6,
        })
        .collect())
}

pub async fn soft_delete_subject(pool: &SqlitePool, id: &str) -> Result<(), CoreError> {
    let ts = now_ms();
    let result = sqlx::query(
        "UPDATE subjects SET deleted_at = ?, updated_at = ?
         WHERE id = ? AND deleted_at IS NULL",
    )
    .bind(ts)
    .bind(ts)
    .bind(id)
    .execute(pool)
    .await?;

    if result.rows_affected() == 0 {
        return Err(CoreError::NotFound(format!("subject {id}")));
    }
    Ok(())
}

// =========================
// Notebooks
// =========================

pub async fn create_notebook(
    pool: &SqlitePool,
    id: &str,
    subject_id: &str,
    title: &str,
    subtitle: Option<&str>,
    cover: Option<&str>,
    icon: Option<&str>,
) -> Result<Notebook, CoreError> {
    let ts = now_ms();
    sqlx::query(
        "INSERT INTO notebooks
         (id, subject_id, title, subtitle, cover, icon, position, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, 0, ?, ?)",
    )
    .bind(id)
    .bind(subject_id)
    .bind(title)
    .bind(subtitle)
    .bind(cover)
    .bind(icon)
    .bind(ts)
    .bind(ts)
    .execute(pool)
    .await?;

    load_notebook(pool, id).await
}

pub async fn load_notebook(pool: &SqlitePool, id: &str) -> Result<Notebook, CoreError> {
    let r = sqlx::query_as::<_, NotebookRow>(
        "SELECT id, subject_id, title, subtitle, cover, icon, position, created_at, updated_at
         FROM notebooks WHERE id = ? AND deleted_at IS NULL",
    )
    .bind(id)
    .fetch_optional(pool)
    .await?
    .ok_or_else(|| CoreError::NotFound(format!("notebook {id}")))?;

    Ok(Notebook {
        id: r.0,
        subject_id: r.1,
        title: r.2,
        subtitle: r.3,
        cover: r.4,
        icon: r.5,
        position: r.6,
        created_at: r.7,
        updated_at: r.8,
    })
}

pub async fn list_notebooks(
    pool: &SqlitePool,
    subject_id: &str,
) -> Result<Vec<Notebook>, CoreError> {
    let rows = sqlx::query_as::<_, NotebookRow>(
        "SELECT id, subject_id, title, subtitle, cover, icon, position, created_at, updated_at
         FROM notebooks WHERE subject_id = ? AND deleted_at IS NULL
         ORDER BY position, created_at",
    )
    .bind(subject_id)
    .fetch_all(pool)
    .await?;

    Ok(rows
        .into_iter()
        .map(|r| Notebook {
            id: r.0,
            subject_id: r.1,
            title: r.2,
            subtitle: r.3,
            cover: r.4,
            icon: r.5,
            position: r.6,
            created_at: r.7,
            updated_at: r.8,
        })
        .collect())
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
// Topics
// =========================

pub async fn create_topic(
    pool: &SqlitePool,
    id: &str,
    notebook_id: &str,
    title: &str,
) -> Result<Topic, CoreError> {
    let ts = now_ms();
    sqlx::query(
        "INSERT INTO topics (id, notebook_id, title, position, created_at, updated_at)
         VALUES (?, ?, ?, 0, ?, ?)",
    )
    .bind(id)
    .bind(notebook_id)
    .bind(title)
    .bind(ts)
    .bind(ts)
    .execute(pool)
    .await?;

    load_topic(pool, id).await
}

pub async fn load_topic(pool: &SqlitePool, id: &str) -> Result<Topic, CoreError> {
    let r = sqlx::query_as::<_, TopicRow>(
        "SELECT id, notebook_id, title, position, created_at, updated_at
         FROM topics WHERE id = ? AND deleted_at IS NULL",
    )
    .bind(id)
    .fetch_optional(pool)
    .await?
    .ok_or_else(|| CoreError::NotFound(format!("topic {id}")))?;

    Ok(Topic {
        id: r.0,
        notebook_id: r.1,
        title: r.2,
        position: r.3,
        created_at: r.4,
        updated_at: r.5,
    })
}

pub async fn list_topics(pool: &SqlitePool, notebook_id: &str) -> Result<Vec<Topic>, CoreError> {
    let rows = sqlx::query_as::<_, TopicRow>(
        "SELECT id, notebook_id, title, position, created_at, updated_at
         FROM topics WHERE notebook_id = ? AND deleted_at IS NULL
         ORDER BY position, created_at",
    )
    .bind(notebook_id)
    .fetch_all(pool)
    .await?;

    Ok(rows
        .into_iter()
        .map(|r| Topic {
            id: r.0,
            notebook_id: r.1,
            title: r.2,
            position: r.3,
            created_at: r.4,
            updated_at: r.5,
        })
        .collect())
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

// =========================
// Pages
// =========================

pub async fn create_page(
    pool: &SqlitePool,
    id: &str,
    topic_id: &str,
    title: &str,
    width: f64,
    height: f64,
    orientation: &str,
) -> Result<Page, CoreError> {
    let ts = now_ms();
    let mut tx = pool.begin().await?;

    sqlx::query(
        "INSERT INTO pages
         (id, topic_id, title, width, height, orientation, position, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, 0, ?, ?)",
    )
    .bind(id)
    .bind(topic_id)
    .bind(title)
    .bind(width)
    .bind(height)
    .bind(orientation)
    .bind(ts)
    .bind(ts)
    .execute(&mut *tx)
    .await?;

    sqlx::query("INSERT INTO page_content (page_id, content) VALUES (?, ?)")
        .bind(id)
        .bind(r#"{"layers":[]}"#)
        .execute(&mut *tx)
        .await?;

    tx.commit().await?;

    load_page(pool, id).await
}

pub async fn load_page(pool: &SqlitePool, id: &str) -> Result<Page, CoreError> {
    let r = sqlx::query_as::<_, PageRow>(
        "SELECT id, topic_id, title, width, height, orientation, position, created_at, updated_at
         FROM pages WHERE id = ? AND deleted_at IS NULL",
    )
    .bind(id)
    .fetch_optional(pool)
    .await?
    .ok_or_else(|| CoreError::NotFound(format!("page {id}")))?;

    Ok(Page {
        id: r.0,
        topic_id: r.1,
        title: r.2,
        width: r.3,
        height: r.4,
        orientation: r.5,
        position: r.6,
        created_at: r.7,
        updated_at: r.8,
    })
}

pub async fn load_page_with_content(
    pool: &SqlitePool,
    id: &str,
) -> Result<PageWithContent, CoreError> {
    let page = load_page(pool, id).await?;

    let content_str: String =
        sqlx::query_scalar("SELECT content FROM page_content WHERE page_id = ?")
            .bind(id)
            .fetch_optional(pool)
            .await?
            .ok_or_else(|| CoreError::NotFound(format!("content for page {id}")))?;

    let content: serde_json::Value = serde_json::from_str(&content_str)?;

    Ok(PageWithContent { page, content })
}

pub async fn list_pages(pool: &SqlitePool, topic_id: &str) -> Result<Vec<Page>, CoreError> {
    let rows = sqlx::query_as::<_, PageRow>(
        "SELECT id, topic_id, title, width, height, orientation, position, created_at, updated_at
         FROM pages WHERE topic_id = ? AND deleted_at IS NULL
         ORDER BY position, created_at",
    )
    .bind(topic_id)
    .fetch_all(pool)
    .await?;

    Ok(rows
        .into_iter()
        .map(|r| Page {
            id: r.0,
            topic_id: r.1,
            title: r.2,
            width: r.3,
            height: r.4,
            orientation: r.5,
            position: r.6,
            created_at: r.7,
            updated_at: r.8,
        })
        .collect())
}

pub async fn save_page_content(
    pool: &SqlitePool,
    page_id: &str,
    content: &serde_json::Value,
) -> Result<(), CoreError> {
    let ts = now_ms();
    let content_str = serde_json::to_string(content)?;

    let mut tx = pool.begin().await?;

    let updated = sqlx::query("UPDATE page_content SET content = ? WHERE page_id = ?")
        .bind(&content_str)
        .bind(page_id)
        .execute(&mut *tx)
        .await?;

    if updated.rows_affected() == 0 {
        return Err(CoreError::NotFound(format!("content for page {page_id}")));
    }

    sqlx::query("UPDATE pages SET updated_at = ? WHERE id = ?")
        .bind(ts)
        .bind(page_id)
        .execute(&mut *tx)
        .await?;

    tx.commit().await?;

    Ok(())
}

pub async fn soft_delete_page(pool: &SqlitePool, id: &str) -> Result<(), CoreError> {
    let ts = now_ms();
    let result = sqlx::query(
        "UPDATE pages SET deleted_at = ?, updated_at = ?
         WHERE id = ? AND deleted_at IS NULL",
    )
    .bind(ts)
    .bind(ts)
    .bind(id)
    .execute(pool)
    .await?;

    if result.rows_affected() == 0 {
        return Err(CoreError::NotFound(format!("page {id}")));
    }
    Ok(())
}
