//! Phase 2 AI layer tests: registry shape, dispatch routing with a fake
//! webview bridge, Rust-side canvas tools, and AI config storage.

use std::sync::Mutex;

use note_core::ai::bridge::{events, Bridge, BoxFut};
use note_core::ai::config;
use note_core::ai::dispatch::{dispatch, DispatchCtx};
use note_core::ai::tools;
use note_core::{init_memory_pool, repo::{self, new_id}, Chapter, Notebook};
use serde_json::{json, Value};

// ---------------------------------------------------------------------
// Fake bridge: records every call, answers with a canned result.
// ---------------------------------------------------------------------

struct Recorded {
    name: String,
    args: Value,
    canvas_id: String,
}

struct FakeBridge {
    calls: Mutex<Vec<Recorded>>,
    notifications: Mutex<Vec<String>>,
    result: Value,
}

impl FakeBridge {
    fn new(result: Value) -> Self {
        Self {
            calls: Mutex::new(Vec::new()),
            notifications: Mutex::new(Vec::new()),
            result,
        }
    }

    fn single_call(&self) -> Recorded {
        let calls = self.calls.lock().unwrap();
        assert_eq!(calls.len(), 1, "expected exactly one frontend call");
        // Clone out so the borrow of self ends before dispatch re-enters.
        calls.first().map(|r| Recorded {
            name: r.name.clone(),
            args: r.args.clone(),
            canvas_id: r.canvas_id.clone(),
        })
        .unwrap()
    }
}

impl Bridge for FakeBridge {
    fn call_frontend<'a>(&'a self, name: &'a str, args: Value, canvas_id: &'a str) -> BoxFut<'a> {
        self.calls.lock().unwrap().push(Recorded {
            name: name.to_string(),
            args: args.clone(),
            canvas_id: canvas_id.to_string(),
        });
        let result = self.result.clone();
        Box::pin(async move { Ok(result) })
    }

    fn notify(&self, event: &'static str) {
        self.notifications.lock().unwrap().push(event.to_string());
    }
}

/// Fresh in-memory database with one notebook and one chapter.
async fn seed() -> (sqlx::SqlitePool, Notebook, Chapter) {
    let pool = init_memory_pool().await.unwrap();
    let notebook = repo::create_notebook(&pool, &new_id(), "Physics", None, None, None)
        .await
        .unwrap();
    let chapter = repo::create_chapter(
        &pool,
        &new_id(),
        &notebook.id,
        "Kinematics",
        "page",
        Some("a4-portrait"),
        None,
        None,
        None,
        None,
        None,
    )
    .await
    .unwrap();
    (pool, notebook, chapter)
}

// ---------------------------------------------------------------------
// Registry
// ---------------------------------------------------------------------

#[test]
fn registry_names_are_unique() {
    let names = tools::all_tool_names();
    let mut sorted = names.clone();
    sorted.sort_unstable();
    assert!(
        sorted.windows(2).all(|pair| pair[0] != pair[1]),
        "registry has duplicate tool names"
    );
}

#[test]
fn internal_tools_never_reach_public_surfaces() {
    let public = tools::public_tools();
    assert!(!public.is_empty());
    for def in &public {
        assert!(
            tools::tool_def(&def.name).unwrap().internal == false,
            "{} must be public",
            def.name
        );
    }
    // The snapshot serializer is internal plumbing.
    let snapshot = tools::tool_def("get_snapshot").expect("get_snapshot registered");
    assert!(snapshot.internal);
    assert!(
        !tools::all_tool_names().contains(&"nosuchtool"),
        "all_tool_names returned an unregistered name"
    );
    assert!(tools::tool_def("nosuchtool").is_none());
}

#[test]
fn public_descriptions_are_complete_and_target_agnostic() {
    for def in tools::public_tools() {
        assert!(
            !def.description.trim().is_empty(),
            "{} has an empty description",
            def.name
        );
        let lowered = def.description.to_lowercase();
        for leak in ["frontend-target", "rust-target", "internal:"] {
            assert!(
                !lowered.contains(leak),
                "{} description leaks target plumbing ({leak})",
                def.name
            );
        }
        // Schemas are object schemas: the model may only ever pass one object.
        assert_eq!(
            def.parameters.get("type").and_then(Value::as_str),
            Some("object"),
            "{} schema is not an object schema",
            def.name
        );
    }
}

#[test]
fn destructive_and_mutation_flags() {
    assert!(tools::tool_def("delete_shapes").unwrap().destructive);
    assert!(!tools::tool_def("list_canvases").unwrap().destructive);
    assert!(!tools::tool_def("save_canvas").unwrap().destructive);
}

// ---------------------------------------------------------------------
// Dispatch: frontend routing
// ---------------------------------------------------------------------

/// Helper: dispatch and return the error message (tests panic on Ok).
async fn expect_err(ctx: &DispatchCtx<'_>, name: &str, args: Value) -> String {
    match dispatch(ctx, name, args).await {
        Ok(value) => panic!("{name} unexpectedly succeeded: {value}"),
        Err(e) => e.to_string(),
    }
}

#[tokio::test]
async fn frontend_tools_route_to_open_canvas() {
    let (pool, _, chapter) = seed().await;
    config::set_active_canvas(&pool, Some(&chapter.id))
        .await
        .unwrap();
    let bridge = FakeBridge::new(json!({ "shapes": [] }));
    let ctx = DispatchCtx { pool: &pool, bridge: Some(&bridge) };

    let args = json!({ "focus_selection": true });
    let value = dispatch(&ctx, "get_canvas", args.clone()).await.unwrap();
    assert_eq!(value, json!({ "shapes": [] }), "bridge result returned as-is");

    let call = bridge.single_call();
    assert_eq!(call.name, "get_canvas");
    assert_eq!(call.args, args, "args cross the bridge untouched");
    assert_eq!(
        call.canvas_id, chapter.id,
        "frontend call is pinned to the active canvas"
    );
}

#[tokio::test]
async fn frontend_tools_fail_cleanly_without_canvas() {
    let (pool, _, _) = seed().await;
    // Pointer never set.
    let bridge = FakeBridge::new(json!({}));
    let ctx = DispatchCtx { pool: &pool, bridge: Some(&bridge) };
    let err = expect_err(&ctx, "get_canvas", json!({})).await;
    assert!(err.contains("no canvas"), "got: {err}");
    assert!(bridge.calls.lock().unwrap().is_empty());
}

#[tokio::test]
async fn frontend_tools_fail_cleanly_without_bridge() {
    let (pool, _, chapter) = seed().await;
    config::set_active_canvas(&pool, Some(&chapter.id)).await.unwrap();
    let ctx = DispatchCtx { pool: &pool, bridge: None };
    let err = expect_err(&ctx, "get_canvas", json!({})).await;
    assert!(err.contains("bridge is not running"), "got: {err}");
}

#[tokio::test]
async fn stale_canvas_pointer_resolves_to_none() {
    let (pool, _, _) = seed().await;
    config::set_active_canvas(&pool, Some("deleted-chapter")).await.unwrap();
    let bridge = FakeBridge::new(json!({}));
    let ctx = DispatchCtx { pool: &pool, bridge: Some(&bridge) };
    // A pointer that survived a deleted chapter reads as "no canvas open".
    let err = expect_err(&ctx, "get_canvas", json!({})).await;
    assert!(err.contains("no canvas"), "got: {err}");
}

// ---------------------------------------------------------------------
// Dispatch: validation and unknown tools
// ---------------------------------------------------------------------

#[tokio::test]
async fn invalid_args_are_rejected_before_execution() {
    let (pool, _, chapter) = seed().await;
    config::set_active_canvas(&pool, Some(&chapter.id)).await.unwrap();
    // create_note without the required `text` arg.
    let bridge = FakeBridge::new(json!({}));
    let ctx = DispatchCtx { pool: &pool, bridge: Some(&bridge) };
    let err = expect_err(&ctx, "create_note", json!({ "x": 1.0 })).await;
    assert!(err.contains("invalid arguments"), "got: {err}");
    assert!(bridge.calls.lock().unwrap().is_empty(), "no call on invalid args");
}

#[tokio::test]
async fn unknown_tool_is_not_found() {
    let (pool, _, _) = seed().await;
    let ctx = DispatchCtx { pool: &pool, bridge: None };
    let err = expect_err(&ctx, "delete_everything", json!({})).await;
    assert!(err.contains("no tool named"), "got: {err}");
}

// ---------------------------------------------------------------------
// Dispatch: Rust-side tools
// ---------------------------------------------------------------------

#[tokio::test]
async fn get_active_canvas_reports_the_open_canvas() {
    let (pool, _, chapter) = seed().await;
    config::set_active_canvas(&pool, Some(&chapter.id)).await.unwrap();
    let ctx = DispatchCtx { pool: &pool, bridge: None };

    let value = dispatch(&ctx, "get_active_canvas", json!({})).await.unwrap();
    assert_eq!(
        value,
        json!({
            "active": true,
            "id": chapter.id,
            "name": chapter.name,
            "canvas_type": chapter.canvas_type,
        })
    );

    config::set_active_canvas(&pool, None).await.unwrap();
    let value = dispatch(&ctx, "get_active_canvas", json!({})).await.unwrap();
    assert_eq!(value, json!({ "active": false }));
}

#[tokio::test]
async fn list_canvases_joins_notebook_names() {
    let (pool, notebook, chapter) = seed().await;
    let ctx = DispatchCtx { pool: &pool, bridge: None };

    let value = dispatch(&ctx, "list_canvases", json!({})).await.unwrap();
    let canvases = value["canvases"].as_array().unwrap();
    assert_eq!(canvases.len(), 1);
    assert_eq!(canvases[0]["id"], chapter.id.as_str());
    assert_eq!(canvases[0]["name"], "Kinematics");
    assert_eq!(canvases[0]["notebook"], notebook.name);
    assert_eq!(canvases[0]["canvas_type"], "page");

    // Query filters case-insensitively across chapter and notebook names.
    let value = dispatch(&ctx, "list_canvases", json!({ "query": "KINEM" }))
        .await
        .unwrap();
    assert_eq!(value["canvases"].as_array().unwrap().len(), 1);

    let value = dispatch(&ctx, "list_canvases", json!({ "query": "zebra" }))
        .await
        .unwrap();
    assert!(value["canvases"].as_array().unwrap().is_empty());
}

#[tokio::test]
async fn save_canvas_persists_the_webview_snapshot() {
    let (pool, _, chapter) = seed().await;
    config::set_active_canvas(&pool, Some(&chapter.id)).await.unwrap();
    // What the webview's get_snapshot executor returns.
    let bridge = FakeBridge::new(json!({
        "snapshot": {
            "document": { "store": {
                "shape:a": { "id": "shape:a", "type": "geo" },
                "shape:b": { "id": "shape:b", "type": "note" },
                "asset:1": { "id": "asset:1" },
            } },
            "session": { "pageId": "page:1" },
        },
        "tldraw_version": "3.15.1",
    }));
    let ctx = DispatchCtx { pool: &pool, bridge: Some(&bridge) };

    let value = dispatch(&ctx, "save_canvas", json!({})).await.unwrap();
    assert_eq!(value["saved"], true);
    assert_eq!(value["shape_count"], 2, "only shapes counted, not assets");

    // The snapshot reached the database through the normal save path.
    let canvas = repo::load_chapter_canvas(&pool, &chapter.id).await.unwrap();
    assert_eq!(canvas.shape_count, 2);
    assert_eq!(canvas.tldraw_version.as_deref(), Some("3.15.1"));
    let stored: Value = serde_json::from_str(&canvas.snapshot.to_string()).unwrap();
    assert_eq!(stored["document"]["store"]["shape:a"]["type"], "geo");
}

// ---------------------------------------------------------------------
// AI config
// ---------------------------------------------------------------------

#[tokio::test]
async fn config_roundtrip_with_defaults_and_overrides() {
    let pool = init_memory_pool().await.unwrap();

    // Fresh install: defaults are directly usable.
    let config = config::load_config(&pool).await.unwrap();
    assert_eq!(config.base_url, "https://api.openai.com/v1");
    assert_eq!(config.model, "gpt-4o-mini");

    config::save_config(
        &pool,
        &config::AiConfig {
            base_url: "https://api.openai.com/v1".to_string(),
            model: "gpt-4o-mini".to_string(),
        },
    )
    .await
    .unwrap();
    // Overwritten with a custom provider (OpenRouter etc.).
    config::save_config(
        &pool,
        &config::AiConfig {
            base_url: "https://openrouter.ai/api/v1".to_string(),
            model: "anthropic/claude-sonnet-4".to_string(),
        },
    )
    .await
    .unwrap();
    let loaded = config::load_config(&pool).await.unwrap();
    assert_eq!(loaded.base_url, "https://openrouter.ai/api/v1");
    assert_eq!(loaded.model, "anthropic/claude-sonnet-4");
}

// ---------------------------------------------------------------------
// API key (only buildable when the keyring feature is on; the default
// `cargo test -p note-core` run is feature-less, so this test may not run)
// ---------------------------------------------------------------------

#[cfg(feature = "keyring-store")]
#[test]
fn api_key_set_get_clear() {
    config::set_api_key("sk-test-12345").unwrap();
    assert_eq!(config::get_api_key().unwrap().as_deref(), Some("sk-test-12345"));
    config::clear_api_key().unwrap();
    assert_eq!(config::get_api_key().unwrap(), None);
    // Clearing twice is fine.
    config::clear_api_key().unwrap();
}
