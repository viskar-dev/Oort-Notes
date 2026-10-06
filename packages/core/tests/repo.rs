use note_core::{init_memory_pool, repo::*, CoreError};
use serde_json::json;

#[tokio::test]
async fn full_hierarchy_roundtrip() {
    let pool = init_memory_pool().await.unwrap();

    let notebook = create_notebook(&pool, &new_id(), "Physics", Some("PHYS"), Some("Mechanics 101"), Some("atom"))
        .await
        .unwrap();
    let chapter = create_chapter(
        &pool,
        &new_id(),
        &notebook.id,
        "Kinematics",
        "page",
        Some("a4-portrait"),
        None,
        None,
        None,
        Some("grid"),
        None,
    )
    .await
    .unwrap();
    let topic = create_topic(&pool, &new_id(), &chapter.id, "Free fall")
        .await
        .unwrap();

    assert_eq!(chapter.notebook_id, notebook.id);
    assert_eq!(chapter.canvas_type, "page");
    assert_eq!(chapter.page_width, Some(794));
    assert_eq!(chapter.page_height, Some(1123));
    assert_eq!(chapter.background, "grid");
    assert_eq!(topic.chapter_id, chapter.id);

    let notebooks = list_notebooks(&pool, "all", "edited", None).await.unwrap();
    assert_eq!(notebooks.len(), 1);

    let chapters = list_chapters(&pool, &notebook.id).await.unwrap();
    assert_eq!(chapters.len(), 1);

    let topics = list_topics(&pool, &chapter.id).await.unwrap();
    assert_eq!(topics.len(), 1);

    // a chapter with no saved editor snapshot reads as a fresh canvas
    let canvas = load_chapter_canvas(&pool, &chapter.id).await.unwrap();
    assert_eq!(canvas.chapter_id, chapter.id);
    assert_eq!(canvas.snapshot, json!({}));
    assert_eq!(canvas.shape_count, 0);
}

#[tokio::test]
async fn canvas_save_and_reload() {
    let pool = init_memory_pool().await.unwrap();

    let notebook = create_notebook(&pool, &new_id(), "N", None, None, None)
        .await
        .unwrap();
    let chapter = create_chapter(&pool, &new_id(), &notebook.id, "C", "infinite", None, None, None, None, None, None)
        .await
        .unwrap();
    create_topic(&pool, &new_id(), &chapter.id, "T").await.unwrap();

    let before = load_notebook(&pool, &notebook.id).await.unwrap().updated_at;
    tokio::time::sleep(std::time::Duration::from_millis(2)).await;

    // getSnapshot(editor.store) shape: { document: { store: { ...records } }, session: {...} }
    let snapshot = json!({
        "document": { "store": {
            "page:abc": { "id": "page:abc", "name": "Topic 1" },
            "shape:abc:1": { "type": "geo" },
            "shape:abc:2": { "type": "text" },
            "camera:page:abc": { "x": 120.5, "y": -40.0, "z": 0.75 }
        }},
        "session": { "currentPageId": "page:abc" }
    });
    save_chapter_canvas(&pool, &chapter.id, &snapshot, Some("3.15.6"))
        .await
        .unwrap();

    let canvas = load_chapter_canvas(&pool, &chapter.id).await.unwrap();
    assert_eq!(
        canvas.snapshot["document"]["store"]["shape:abc:2"]["type"],
        "text"
    );
    assert_eq!(canvas.shape_count, 2);
    assert_eq!(canvas.byte_size, snapshot.to_string().len() as i64);
    assert_eq!(canvas.tldraw_version.as_deref(), Some("3.15.6"));
    assert!(canvas.saved_at > 0);

    // the chapter_canvas_touch trigger must bump the whole ancestry
    let after = load_notebook(&pool, &notebook.id).await.unwrap().updated_at;
    assert!(after > before, "saving the canvas should touch the notebook");

    // a second save upserts instead of failing
    save_chapter_canvas(&pool, &chapter.id, &json!({ "document": { "store": {} } }), None)
        .await
        .unwrap();
    let canvas = load_chapter_canvas(&pool, &chapter.id).await.unwrap();
    assert_eq!(canvas.shape_count, 0);
    assert_eq!(canvas.tldraw_version.as_deref(), Some("3.15.6"));
}

#[tokio::test]
async fn topic_updates_mirror_page_changes() {
    let pool = init_memory_pool().await.unwrap();

    let notebook = create_notebook(&pool, &new_id(), "N", None, None, None)
        .await
        .unwrap();
    let chapter = create_chapter(&pool, &new_id(), &notebook.id, "C", "infinite", None, None, None, None, None, None)
        .await
        .unwrap();
    let topic = create_topic(&pool, &new_id(), &chapter.id, "Topic 1")
        .await
        .unwrap();

    let renamed = update_topic(&pool, &topic.id, Some("Kinematics"), Some(3))
        .await
        .unwrap();
    assert_eq!(renamed.name, "Kinematics");
    assert_eq!(renamed.position, 3);

    let listed = list_topics(&pool, &chapter.id).await.unwrap();
    assert_eq!(listed[0].name, "Kinematics");
    assert_eq!(listed[0].position, 3);

    let missing = update_topic(&pool, &new_id(), Some("X"), None).await;
    assert!(matches!(missing, Err(CoreError::NotFound(_))));
}

#[tokio::test]
async fn chapter_canvas_rules() {
    let pool = init_memory_pool().await.unwrap();

    // page chapter without preset or explicit size is rejected
    let notebook = create_notebook(&pool, &new_id(), "N", None, None, None)
        .await
        .unwrap();
    let result = create_chapter(&pool, &new_id(), &notebook.id, "Bad", "page", None, None, None, None, None, None).await;
    assert!(matches!(result, Err(CoreError::Internal(_))));

    // scroll chapters fall back to the seeded default width
    let scroll = create_chapter(&pool, &new_id(), &notebook.id, "S", "scroll", None, None, None, None, None, None)
        .await
        .unwrap();
    assert_eq!(scroll.scroll_width, Some(800));

    // infinite chapters carry no page geometry at all
    let infinite = create_chapter(&pool, &new_id(), &notebook.id, "I", "infinite", Some("a4-portrait"), None, None, None, None, None)
        .await
        .unwrap();
    assert_eq!(infinite.page_preset_id, None);
    assert_eq!(infinite.page_width, None);
    assert_eq!(infinite.scroll_width, None);

    // canvas type and size lock as soon as the chapter has a topic
    create_topic(&pool, &new_id(), &infinite.id, "T").await.unwrap();
    let result = sqlx::query("UPDATE chapters SET canvas_type = 'page' WHERE id = ?")
        .bind(&infinite.id)
        .execute(&pool)
        .await;
    assert!(result.is_err(), "canvas type should be locked once topics exist");

    // renaming the chapter (not a locked column) still works
    sqlx::query("UPDATE chapters SET name = 'Renamed' WHERE id = ?")
        .bind(&infinite.id)
        .execute(&pool)
        .await
        .unwrap();
}

#[tokio::test]
async fn foreign_key_enforced() {
    let pool = init_memory_pool().await.unwrap();

    let result = create_chapter(&pool, &new_id(), "nonexistent-notebook", "C", "infinite", None, None, None, None, None, None).await;
    assert!(result.is_err(), "inserting with bad FK should fail");
}

#[tokio::test]
async fn notebook_names_unique_case_insensitive() {
    let pool = init_memory_pool().await.unwrap();

    create_notebook(&pool, &new_id(), "Physics", None, None, None)
        .await
        .unwrap();
    let dup = create_notebook(&pool, &new_id(), "PHYSICS", None, None, None).await;
    assert!(dup.is_err(), "duplicate (case-insensitive) notebook names should fail");
}

#[tokio::test]
async fn cascade_on_hard_delete() {
    let pool = init_memory_pool().await.unwrap();

    let notebook = create_notebook(&pool, &new_id(), "N", None, None, None)
        .await
        .unwrap();
    let chapter = create_chapter(&pool, &new_id(), &notebook.id, "C", "infinite", None, None, None, None, None, None)
        .await
        .unwrap();
    let topic = create_topic(&pool, &new_id(), &chapter.id, "T").await.unwrap();
    save_chapter_canvas(&pool, &chapter.id, &json!({ "document": { "store": {} } }), None)
        .await
        .unwrap();

    sqlx::query("DELETE FROM notebooks WHERE id = ?")
        .bind(&notebook.id)
        .execute(&pool)
        .await
        .unwrap();

    let chapters: i64 = sqlx::query_scalar("SELECT COUNT(*) FROM chapters")
        .fetch_one(&pool)
        .await
        .unwrap();
    let topics: i64 = sqlx::query_scalar("SELECT COUNT(*) FROM topics")
        .fetch_one(&pool)
        .await
        .unwrap();
    let canvases: i64 = sqlx::query_scalar("SELECT COUNT(*) FROM chapter_canvas")
        .fetch_one(&pool)
        .await
        .unwrap();
    assert_eq!((chapters, topics, canvases), (0, 0, 0));
    assert!(matches!(load_topic(&pool, &topic.id).await, Err(CoreError::NotFound(_))));
}

#[tokio::test]
async fn soft_delete_hides_from_list() {
    let pool = init_memory_pool().await.unwrap();

    let notebook = create_notebook(&pool, &new_id(), "N", None, None, None)
        .await
        .unwrap();
    soft_delete_notebook(&pool, &notebook.id).await.unwrap();

    let notebooks = list_notebooks(&pool, "all", "edited", None).await.unwrap();
    assert_eq!(notebooks.len(), 0);

    let result = load_notebook(&pool, &notebook.id).await;
    assert!(matches!(result, Err(CoreError::NotFound(_))));
}

#[tokio::test]
async fn resurrecting_a_soft_deleted_topic() {
    let pool = init_memory_pool().await.unwrap();

    let notebook = create_notebook(&pool, &new_id(), "N", None, None, None)
        .await
        .unwrap();
    let chapter = create_chapter(&pool, &new_id(), &notebook.id, "C", "infinite", None, None, None, None, None, None)
        .await
        .unwrap();

    // tldraw undo can bring back a page whose topic was already soft-deleted:
    // the sync re-creates with the same uuid, so it must resurrect the row
    let id = new_id();
    create_topic(&pool, &id, &chapter.id, "Topic 1").await.unwrap();
    soft_delete_topic(&pool, &id).await.unwrap();
    assert!(matches!(load_topic(&pool, &id).await, Err(CoreError::NotFound(_))));

    let revived = create_topic(&pool, &id, &chapter.id, "Topic 1").await.unwrap();
    assert_eq!(revived.name, "Topic 1");

    let renamed = update_topic(&pool, &id, Some("Renamed"), Some(2)).await.unwrap();
    assert_eq!(renamed.name, "Renamed");
    assert_eq!(renamed.position, 2);

    let listed = list_topics(&pool, &chapter.id).await.unwrap();
    assert_eq!(listed.len(), 1);
}

#[tokio::test]
async fn topic_pages_crud_and_cascade() {
    let pool = init_memory_pool().await.unwrap();

    let notebook = create_notebook(&pool, &new_id(), "N", None, None, None)
        .await
        .unwrap();
    let chapter = create_chapter(&pool, &new_id(), &notebook.id, "C", "page", Some("a4-portrait"), None, None, None, None, None)
        .await
        .unwrap();
    let topic = create_topic(&pool, &new_id(), &chapter.id, "Doc").await.unwrap();

    let p1 = create_topic_page(&pool, &new_id(), &topic.id, "Page 1")
        .await
        .unwrap();
    let p2 = create_topic_page(&pool, &new_id(), &topic.id, "Page 2")
        .await
        .unwrap();

    let listed = list_topic_pages(&pool, &topic.id).await.unwrap();
    assert_eq!(listed.len(), 2);
    assert_eq!(listed[0].name, "Page 1");

    let renamed = update_topic_page(&pool, &p2.id, Some("Diagram"), Some(0))
        .await
        .unwrap();
    assert_eq!(renamed.name, "Diagram");
    assert_eq!(renamed.position, 0);

    // resurrect on re-create (tldraw undo) like topics
    delete_topic_page(&pool, &p1.id).await.unwrap();
    let revived = create_topic_page(&pool, &p1.id, &topic.id, "Page 1")
        .await
        .unwrap();
    assert_eq!(revived.name, "Page 1");

    // deleting the topic cascades its pages away
    sqlx::query("DELETE FROM topics WHERE id = ?")
        .bind(&topic.id)
        .execute(&pool)
        .await
        .unwrap();
    let remaining: i64 = sqlx::query_scalar("SELECT COUNT(*) FROM topic_pages")
        .fetch_one(&pool)
        .await
        .unwrap();
    assert_eq!(remaining, 0);
}

#[tokio::test]
async fn builtin_presets_are_listed_and_protected() {
    let pool = init_memory_pool().await.unwrap();

    let presets = list_page_presets(&pool).await.unwrap();
    assert!(presets.len() >= 16);
    let a4 = presets.iter().find(|p| p.id == "a4-portrait").unwrap();
    assert_eq!((a4.width, a4.height), (794, 1123));
    assert_eq!(a4.orientation, "portrait");
    assert!(a4.is_builtin);

    let result = sqlx::query("UPDATE page_presets SET name = 'Hacked' WHERE id = 'a4-portrait'")
        .execute(&pool)
        .await;
    assert!(result.is_err(), "built-in presets must not be editable");
}
