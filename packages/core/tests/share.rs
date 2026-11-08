//! Round-trip tests for single-notebook `.oort` share files: export one
//! notebook, import it as a copy with fresh ids, and prove the canvas
//! page references were rewritten to the copied topic ids.

use note_core::repo::*;
use note_core::share::{build_notebook_share, import_notebook};
use note_core::init_memory_pool;
use serde_json::{json, Value};
use sqlx::SqlitePool;

async fn seed(pool: &SqlitePool) -> (String, String, String, Value) {
    let ui = create_ui_preset(pool, &new_id(), "Focus", &json!({"zen": true}))
        .await
        .unwrap();

    let notebook = create_notebook(pool, &new_id(), "Physics", Some("PHYS"), Some("Mechanics 101"), Some("atom"))
        .await
        .unwrap();
    let chapter = create_chapter(
        pool,
        &new_id(),
        &notebook.id,
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
    let topic = create_topic(pool, &new_id(), &chapter.id, "Free fall").await.unwrap();
    let page = create_topic_page(pool, &new_id(), &topic.id, "Page 1").await.unwrap();

    let snapshot = json!({
        "document": {
            "store": {
                format!("page:{}", topic.id): { "id": format!("page:{}", topic.id), "name": "Free fall" },
                format!("page:{}", page.id): { "id": format!("page:{}", page.id), "name": "Page 1" },
                "shape:s1": { "id": "shape:s1", "type": "geo", "parentId": format!("page:{}", topic.id) }
            }
        },
        "session": { "currentPageId": format!("page:{}", topic.id) }
    });
    save_chapter_canvas(pool, &chapter.id, &snapshot, Some("3.0.0"))
        .await
        .unwrap();

    (notebook.id, chapter.id, topic.id, snapshot)
}

#[tokio::test]
async fn notebook_share_roundtrip_creates_a_copy() {
    let source = init_memory_pool().await.unwrap();
    let (notebook_id, chapter_id, topic_id, _snapshot) = seed(&source).await;

    let archive = build_notebook_share(&source, &notebook_id).await.unwrap();
    let parsed: Value = serde_json::from_str(&archive).unwrap();
    assert_eq!(parsed["kind"], "notebook");
    assert_eq!(parsed["data"]["notebooks"][0]["name"], "Physics");
    assert_eq!(parsed["data"]["notebooks"].as_array().unwrap().len(), 1);

    let target = init_memory_pool().await.unwrap();
    let imported = import_notebook(&target, &archive, Some("Physics copy"))
        .await
        .unwrap();

    assert_ne!(imported.id, notebook_id);
    assert_eq!(imported.name, "Physics copy");
    assert_eq!(imported.chapters_count, 1);
    assert_eq!(imported.topics_count, 1);

    // The copied notebook has fresh chapter/topic ids, and the canvas page
    // records now reference the copied topics.
    let chapters = list_chapters(&target, &imported.id).await.unwrap();
    assert_eq!(chapters.len(), 1);
    assert_ne!(chapters[0].id, chapter_id);
    assert_eq!(chapters[0].ui_preset_id, Some(list_ui_presets(&target).await.unwrap()[0].id.clone()));

    let topics = list_topics(&target, &chapters[0].id).await.unwrap();
    assert_eq!(topics.len(), 1);
    assert_ne!(topics[0].id, topic_id);
    assert_eq!(topics[0].name, "Free fall");

    let canvas = load_chapter_canvas(&target, &chapters[0].id).await.unwrap();
    let store = &canvas.snapshot["document"]["store"];
    let page_key = format!("page:{}", topics[0].id);
    assert!(store.get(&page_key).is_some(), "canvas should reference the copied topic");
    assert_eq!(canvas.snapshot["session"]["currentPageId"], page_key);
    assert!(store.get(&format!("page:{}", topic_id)).is_none(), "old topic id must not remain in the copy");

    // The same file can be imported again with a different name.
    let second = import_notebook(&target, &archive, Some("Physics second copy"))
        .await
        .unwrap();
    assert_ne!(second.id, imported.id);
    assert_eq!(second.name, "Physics second copy");
}

#[tokio::test]
async fn notebook_share_rejects_foreign_files() {
    let pool = init_memory_pool().await.unwrap();
    let result = import_notebook(&pool, r#"{"app":"other","kind":"notebook","format":1,"created_at":1,"counts":{"notebooks":0,"chapters":0,"topics":0,"topic_pages":0,"chapter_canvas":0,"ui_presets":0,"tags":0,"topic_tags":0},"data":{"ui_presets":[],"notebooks":[],"chapters":[],"topics":[],"topic_pages":[],"chapter_canvas":[],"tags":[],"topic_tags":[]}}"#, None).await;
    assert!(result.is_err());
}
