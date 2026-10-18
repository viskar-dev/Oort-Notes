//! Round-trip tests for the backup archive: export → restore into a fresh
//! database, replace-restore into a used one, and the guards (foreign
//! archives, newer formats, unknown presets).

use note_core::backup::{backup_file_name, build_archive, restore_archive};
use note_core::repo::*;
use note_core::init_memory_pool;
use serde_json::{json, Value};
use sqlx::SqlitePool;

struct Seed {
    ui_id: String,
    nb_a: String,
    ch_page: String,
    ch_inf: String,
    t1: String,
    page1: String,
    canvas_snapshot: Value,
}

async fn seed(pool: &SqlitePool) -> Seed {
    let ui = create_ui_preset(pool, &new_id(), "Focus", &json!({"zen": true}))
        .await
        .unwrap();

    let nb_a = create_notebook(pool, &new_id(), "Physics", Some("PHYS"), Some("Mechanics 101"), Some("atom"))
        .await
        .unwrap();
    let nb_b = create_notebook(pool, &new_id(), "Chemistry", None, None, None)
        .await
        .unwrap();

    let ch_page = create_chapter(
        pool,
        &new_id(),
        &nb_a.id,
        "Kinematics",
        "page",
        Some("a4-portrait"),
        None,
        None,
        None,
        Some("grid"),
        Some(&ui.id),
    )
    .await
    .unwrap();
    let ch_inf = create_chapter(
        pool,
        &new_id(),
        &nb_b.id,
        "Whiteboard",
        "infinite",
        None,
        None,
        None,
        None,
        None,
        None,
    )
    .await
    .unwrap();

    let t1 = create_topic(pool, &new_id(), &ch_page.id, "Free fall")
        .await
        .unwrap();
    let t2 = create_topic(pool, &new_id(), &ch_page.id, "Deprecated topic")
        .await
        .unwrap();
    soft_delete_topic(pool, &t2.id).await.unwrap();

    let page1 = create_topic_page(pool, &new_id(), &t1.id, "Page 1")
        .await
        .unwrap();

    let canvas_snapshot = json!({
        "document": {"store": {"shape:s1": {"id": "shape:s1", "type": "text"}}}
    });
    save_chapter_canvas(pool, &ch_inf.id, &canvas_snapshot, Some("3.0.0"))
        .await
        .unwrap();

    // tags have no repo helpers yet — straight SQL
    sqlx::query("INSERT INTO tags (id, name, created_at) VALUES (?, ?, ?)")
        .bind(&new_id())
        .bind("important")
        .bind(1_700_000_000_000i64)
        .execute(pool)
        .await
        .unwrap();
    sqlx::query("INSERT INTO tags (id, name, created_at) VALUES (?, ?, ?)")
        .bind(&new_id())
        .bind("draft")
        .bind(1_700_000_100_000i64)
        .execute(pool)
        .await
        .unwrap();
    sqlx::query("INSERT INTO topic_tags (topic_id, tag_id) SELECT ?, id FROM tags WHERE name = 'important'")
        .bind(&t1.id)
        .execute(pool)
        .await
        .unwrap();

    Seed {
        ui_id: ui.id,
        nb_a: nb_a.id,
        ch_page: ch_page.id,
        ch_inf: ch_inf.id,
        t1: t1.id,
        page1: page1.id,
        canvas_snapshot,
    }
}

/// Distinct fixed timestamps so we can prove restore preserves them even
/// though insert-time triggers clobber the parents' `updated_at`.
async fn stamp_fixed_timestamps(pool: &SqlitePool, seed: &Seed) {
    sqlx::query("UPDATE notebooks SET updated_at = 1234567890123, created_at = 1234567890000 WHERE id = ?")
        .bind(&seed.nb_a)
        .execute(pool)
        .await
        .unwrap();
    sqlx::query("UPDATE topics SET updated_at = 1234567890456, created_at = 1234567890400 WHERE id = ?")
        .bind(&seed.t1)
        .execute(pool)
        .await
        .unwrap();
    sqlx::query("UPDATE topic_pages SET updated_at = 1234567890789 WHERE id = ?")
        .bind(&seed.page1)
        .execute(pool)
        .await
        .unwrap();
}

async fn exported_data(pool: &SqlitePool) -> Value {
    // rebuild the archive's data section via a restore-pool roundtrip helper:
    // build_archive gives us bytes, parse them back to a Value.
    let (bytes, _) = build_archive(pool).await.unwrap();
    let archive: Value = serde_json::from_slice(&bytes).unwrap();
    archive["data"].clone()
}

#[tokio::test]
async fn archive_roundtrip_restores_everything() {
    let pool_a = init_memory_pool().await.unwrap();
    let s = seed(&pool_a).await;
    stamp_fixed_timestamps(&pool_a, &s).await;

    let (bytes, counts) = build_archive(&pool_a).await.unwrap();
    assert_eq!(counts.notebooks, 2);
    assert_eq!(counts.chapters, 2);
    assert_eq!(counts.topics, 2); // soft-deleted included
    assert_eq!(counts.topic_pages, 1);
    assert_eq!(counts.chapter_canvas, 1);
    assert_eq!(counts.ui_presets, 1);
    assert_eq!(counts.tags, 2);
    assert_eq!(counts.topic_tags, 1);

    let pool_b = init_memory_pool().await.unwrap();
    let result = restore_archive(&pool_b, &bytes).await.unwrap();
    assert_eq!(result.notebooks, 2);
    assert_eq!(result.topics, 2);
    assert_eq!(result.topic_tags, 1);

    // the re-exported data is byte-for-byte identical to the source's
    assert_eq!(exported_data(&pool_b).await, exported_data(&pool_a).await);

    // spot checks: soft-deleted rows survived, canvas payload intact,
    // trigger-clobbered parent timestamps were re-applied
    let deleted: i64 = sqlx::query_scalar("SELECT COUNT(*) FROM topics WHERE deleted_at IS NOT NULL")
        .fetch_one(&pool_b)
        .await
        .unwrap();
    assert_eq!(deleted, 1);

    let (snapshot, shape_count): (String, i64) = sqlx::query_as(
        "SELECT snapshot, shape_count FROM chapter_canvas WHERE chapter_id = ?",
    )
    .bind(&s.ch_inf)
    .fetch_one(&pool_b)
    .await
    .unwrap();
    assert_eq!(snapshot, s.canvas_snapshot.to_string());
    assert_eq!(shape_count, 1);

    let nb_updated: i64 = sqlx::query_scalar("SELECT updated_at FROM notebooks WHERE id = ?")
        .bind(&s.nb_a)
        .fetch_one(&pool_b)
        .await
        .unwrap();
    assert_eq!(nb_updated, 1234567890123);

    let topic_updated: i64 = sqlx::query_scalar("SELECT updated_at FROM topics WHERE id = ?")
        .bind(&s.t1)
        .fetch_one(&pool_b)
        .await
        .unwrap();
    assert_eq!(topic_updated, 1234567890456);

    // ui preset link survived
    let ui_ref: Option<String> = sqlx::query_scalar("SELECT ui_preset_id FROM chapters WHERE id = ?")
        .bind(&s.ch_page)
        .fetch_one(&pool_b)
        .await
        .unwrap();
    assert_eq!(ui_ref, Some(s.ui_id.clone()));
}

#[tokio::test]
async fn restore_replaces_existing_data() {
    let pool_a = init_memory_pool().await.unwrap();
    let _s = seed(&pool_a).await;
    let (bytes, _) = build_archive(&pool_a).await.unwrap();

    let pool_b = init_memory_pool().await.unwrap();
    let old_nb = create_notebook(&pool_b, &new_id(), "Old notebook", None, None, None)
        .await
        .unwrap();
    let old_chapter = create_chapter(
        &pool_b,
        &new_id(),
        &old_nb.id,
        "Old chapter",
        "infinite",
        None,
        None,
        None,
        None,
        None,
        None,
    )
    .await
    .unwrap();

    restore_archive(&pool_b, &bytes).await.unwrap();

    let notebooks: Vec<String> =
        sqlx::query_scalar("SELECT name FROM notebooks ORDER BY name")
            .fetch_all(&pool_b)
            .await
            .unwrap();
    assert_eq!(notebooks, vec!["Chemistry".to_string(), "Physics".to_string()]);
    assert!(sqlx::query("SELECT 1 FROM notebooks WHERE id = ?")
        .bind(&old_nb.id)
        .fetch_optional(&pool_b)
        .await
        .unwrap()
        .is_none());
    assert!(sqlx::query("SELECT 1 FROM chapters WHERE id = ?")
        .bind(&old_chapter.id)
        .fetch_optional(&pool_b)
        .await
        .unwrap()
        .is_none());
}

#[tokio::test]
async fn restore_rejects_foreign_and_newer_archives() {
    let pool = init_memory_pool().await.unwrap();
    let (bytes, _) = build_archive(&pool).await.unwrap();

    // not a backup archive at all
    let err = restore_archive(&pool, br#"{"hello": "world"}"#)
        .await
        .unwrap_err();
    assert!(err.to_string().to_lowercase().contains("backup"), "{err}");

    // wrong app id
    let mut foreign: Value = serde_json::from_slice(&bytes).unwrap();
    foreign["app"] = json!("some-other-app");
    let err = restore_archive(&pool, &serde_json::to_vec(&foreign).unwrap())
        .await
        .unwrap_err();
    assert!(err.to_string().contains("some-other-app"), "{err}");

    // format from the future
    let mut newer: Value = serde_json::from_slice(&bytes).unwrap();
    newer["format"] = json!(99);
    let err = restore_archive(&pool, &serde_json::to_vec(&newer).unwrap())
        .await
        .unwrap_err();
    assert!(err.to_string().contains("99"), "{err}");

    // the database is untouched after the failed restores
    let data = exported_data(&pool).await;
    assert_eq!(data["notebooks"].as_array().unwrap().len(), 0);
}

#[tokio::test]
async fn restore_scrubs_unknown_page_preset() {
    let pool_a = init_memory_pool().await.unwrap();
    seed(&pool_a).await;
    let (bytes, _) = build_archive(&pool_a).await.unwrap();

    // a backup taken on a newer app version can reference a page preset the
    // current install has never heard of — the restore must survive it
    let mut edited: Value = serde_json::from_slice(&bytes).unwrap();
    edited["data"]["chapters"][0]["page_preset_id"] = json!("preset-from-the-future");
    let bytes = serde_json::to_vec(&edited).unwrap();

    let pool_b = init_memory_pool().await.unwrap();
    restore_archive(&pool_b, &bytes).await.unwrap();

    let presets: Vec<Option<String>> =
        sqlx::query_scalar("SELECT page_preset_id FROM chapters WHERE page_preset_id IS NOT NULL")
            .fetch_all(&pool_b)
            .await
            .unwrap();
    assert!(presets.iter().all(|p| p.as_deref() != Some("preset-from-the-future")));
}

#[tokio::test]
async fn backup_file_names_are_utc_timestamps() {
    assert_eq!(backup_file_name(0), "oort-backup-1970-01-01-000000.json");
    assert_eq!(
        backup_file_name(1_700_000_000_000),
        "oort-backup-2023-11-14-221320.json"
    );
    assert_eq!(
        backup_file_name(1_709_164_800_000),
        "oort-backup-2024-02-29-000000.json"
    );
}
