use sqlx::Row;

#[tokio::test]
async fn migration_applies_and_key_objects_exist() {
    let pool = note_core::init_memory_pool()
        .await
        .expect("migration should apply cleanly");

    let tables: Vec<String> = sqlx::query(
        "SELECT name FROM sqlite_master WHERE type = 'table'
         AND name NOT LIKE 'sqlite_%' AND name NOT LIKE '_sqlx_%' ORDER BY name",
    )
    .fetch_all(&pool)
    .await
    .unwrap()
    .iter()
    .map(|r| r.get::<String, _>("name"))
    .collect();

    for expected in [
        "page_presets",
        "notebooks",
        "chapters",
        "topics",
        "topic_pages",
        "chapter_canvas",
        "tags",
        "topic_tags",
        "settings",
        "backups",
    ] {
        assert!(tables.contains(&expected.to_string()), "missing table {expected}");
    }

    // FTS5 virtual table must exist (proves bundled SQLite has FTS5 enabled)
    let fts: i64 = sqlx::query_scalar("SELECT COUNT(*) FROM sqlite_master WHERE name = 'search_fts'")
        .fetch_one(&pool)
        .await
        .unwrap();
    assert_eq!(fts, 1, "search_fts virtual table missing");

    // the 16 built-in page presets are seeded
    let presets: i64 = sqlx::query_scalar("SELECT COUNT(*) FROM page_presets")
        .fetch_one(&pool)
        .await
        .unwrap();
    assert_eq!(presets, 16);

    // default settings are seeded
    let settings: i64 = sqlx::query_scalar("SELECT COUNT(*) FROM settings")
        .fetch_one(&pool)
        .await
        .unwrap();
    assert_eq!(settings, 8);
}
