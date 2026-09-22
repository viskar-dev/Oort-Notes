use note_core::{init_memory_pool, repo::*, CoreError};

#[tokio::test]
async fn full_hierarchy_roundtrip() {
    let pool = init_memory_pool().await.unwrap();

    let subject = create_subject(&pool, &new_id(), "Math", None, None)
        .await
        .unwrap();
    let notebook = create_notebook(
        &pool,
        &new_id(),
        &subject.id,
        "Algebra",
        None,
        None,
        Some("📐"),
    )
    .await
    .unwrap();
    let topic = create_topic(&pool, &new_id(), &notebook.id, "Linear equations")
        .await
        .unwrap();
    let page = create_page(
        &pool,
        &new_id(),
        &topic.id,
        "First page",
        794.0,
        1123.0,
        "portrait",
    )
    .await
    .unwrap();

    assert_eq!(page.topic_id, topic.id);

    let notebooks = list_notebooks(&pool, &subject.id).await.unwrap();
    assert_eq!(notebooks.len(), 1);
    assert_eq!(notebooks[0].id, notebook.id);

    let topics = list_topics(&pool, &notebook.id).await.unwrap();
    assert_eq!(topics.len(), 1);

    let pages = list_pages(&pool, &topic.id).await.unwrap();
    assert_eq!(pages.len(), 1);

    let loaded = load_page_with_content(&pool, &page.id).await.unwrap();
    assert!(loaded.content.get("layers").is_some());
}

#[tokio::test]
async fn save_and_reload_content() {
    let pool = init_memory_pool().await.unwrap();

    let subject = create_subject(&pool, &new_id(), "S", None, None)
        .await
        .unwrap();
    let notebook = create_notebook(&pool, &new_id(), &subject.id, "N", None, None, None)
        .await
        .unwrap();
    let topic = create_topic(&pool, &new_id(), &notebook.id, "T")
        .await
        .unwrap();
    let page = create_page(&pool, &new_id(), &topic.id, "", 794.0, 1123.0, "portrait")
        .await
        .unwrap();

    let content = serde_json::json!({
        "layers": [{
            "id": "l1",
            "name": "Layer 1",
            "visible": true,
            "locked": false,
            "objects": [{
                "id": "o1",
                "type": "text",
                "x": 100,
                "y": 200,
                "text": "Hello"
            }]
        }]
    });

    save_page_content(&pool, &page.id, &content).await.unwrap();

    let reloaded = load_page_with_content(&pool, &page.id).await.unwrap();
    assert_eq!(reloaded.content["layers"][0]["objects"][0]["text"], "Hello");
}

#[tokio::test]
async fn foreign_key_enforced() {
    let pool = init_memory_pool().await.unwrap();

    let result = create_notebook(
        &pool,
        &new_id(),
        "nonexistent-subject",
        "N",
        None,
        None,
        None,
    )
    .await;

    assert!(result.is_err(), "inserting with bad FK should fail");
}

#[tokio::test]
async fn cascade_on_hard_delete() {
    let pool = init_memory_pool().await.unwrap();

    let subject = create_subject(&pool, &new_id(), "S", None, None)
        .await
        .unwrap();
    let notebook = create_notebook(&pool, &new_id(), &subject.id, "N", None, None, None)
        .await
        .unwrap();

    sqlx::query("DELETE FROM subjects WHERE id = ?")
        .bind(&subject.id)
        .execute(&pool)
        .await
        .unwrap();

    let result = load_notebook(&pool, &notebook.id).await;
    assert!(matches!(result, Err(CoreError::NotFound(_))));
}

#[tokio::test]
async fn soft_delete_hides_from_list() {
    let pool = init_memory_pool().await.unwrap();

    let subject = create_subject(&pool, &new_id(), "S", None, None)
        .await
        .unwrap();
    soft_delete_subject(&pool, &subject.id).await.unwrap();

    let subjects = list_subjects(&pool).await.unwrap();
    assert_eq!(subjects.len(), 0);

    let result = load_subject(&pool, &subject.id).await;
    assert!(matches!(result, Err(CoreError::NotFound(_))));
}
