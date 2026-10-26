//! AI dispatch: the single entry point that routes a tool call to its
//! implementation. Rust-target tools run here natively (database access);
//! frontend-target tools cross the webview bridge with the resolution of the
//! active canvas pinned. Callers never see which target a tool uses.

use serde_json::Value;
use sqlx::SqlitePool;

use crate::error::CoreError;
use crate::repo;

use super::bridge::{self, Bridge, CallOrigin};
use super::config;
use super::params;
use super::tools::{self, Target};

/// The canvas dispatch is pinned to. Resolved from the `ai_active_canvas`
/// setting, validated against the database so a deleted chapter never counts.
#[derive(Debug, Clone)]
pub struct ActiveCanvas {
    pub id: String,
    pub name: String,
    pub canvas_type: String,
}

/// What dispatch needs to run: the shared database and, when a webview bridge
/// is installed (desktop), the frontend canvas.
pub struct DispatchCtx<'a> {
    pub pool: &'a SqlitePool,
    /// `None` in hosts without a canvas bridge (e.g. the web shell) —
    /// frontend tools then fail cleanly instead of half-working.
    pub bridge: Option<&'a dyn Bridge>,
    /// Who is calling (the in-app assistant or a connected MCP client). The
    /// webview gates destructive tools per caller: MCP callers confirm in
    /// their own client conversation and must never trigger desktop UI.
    pub origin: CallOrigin,
}

impl DispatchCtx<'_> {
    /// The canvas the AI works on right now, if the user has one open.
    pub async fn active_canvas(&self) -> Result<Option<ActiveCanvas>, CoreError> {
        let Some(id) = repo::get_setting(self.pool, config::SETTING_ACTIVE_CANVAS)
            .await?
            .filter(|s| !s.trim().is_empty())
        else {
            return Ok(None);
        };
        match repo::load_chapter(self.pool, &id).await {
            Ok(chapter) => Ok(Some(ActiveCanvas {
                id: chapter.id,
                name: chapter.name,
                canvas_type: chapter.canvas_type,
            })),
            // The pointer survived a deleted chapter: treat as no canvas.
            Err(CoreError::NotFound(_)) => Ok(None),
            Err(e) => Err(e),
        }
    }
}

/// Run one tool call by name. `args` must be the tool's argument object; it is
/// validated against the registry schema (via the typed args structs) before
/// anything executes. Internal tools are callable only through here — external
/// surfaces (MCP, the model's tool list) never offer them.
pub async fn dispatch(ctx: &DispatchCtx<'_>, name: &str, args: Value) -> Result<Value, CoreError> {
    let def = tools::tool_def(name)
        .ok_or_else(|| CoreError::NotFound(format!("no tool named {name}")))?;

    validate_args(name, args.clone())?;

    match def.target {
        Target::Rust => rust_tool(ctx, name, args).await,
        Target::Frontend => frontend_tool(ctx, name, args).await,
    }
}

/// Enforce the argument schema: parse the raw value into the tool's typed
/// args struct. Unknown fields are rejected by serde, which keeps sloppy
/// model output from silently no-opping.
fn validate_args(name: &str, args: Value) -> Result<(), CoreError> {
    use params as a;
    let err = |e: serde_json::Error| CoreError::Ai(format!("invalid arguments for {name}: {e}"));
    let checked = match name {
        "get_canvas" | "get_selection" | "get_snapshot" => {
            serde_json::from_value::<a::GetCanvasArgs>(args).map(|_| ())
        }
        "get_shape" => serde_json::from_value::<a::GetShapeArgs>(args).map(|_| ()),
        "get_screenshot" => serde_json::from_value::<a::ScreenshotArgs>(args).map(|_| ()),
        "create_note" => serde_json::from_value::<a::CreateNoteArgs>(args).map(|_| ()),
        "create_text" => serde_json::from_value::<a::CreateTextArgs>(args).map(|_| ()),
        "create_math_block" => serde_json::from_value::<a::CreateMathBlockArgs>(args).map(|_| ()),
        "create_code_block" => serde_json::from_value::<a::CreateCodeBlockArgs>(args).map(|_| ()),
        "create_table" => serde_json::from_value::<a::CreateTableArgs>(args).map(|_| ()),
        "create_card" => serde_json::from_value::<a::CreateCardArgs>(args).map(|_| ()),
        "create_svg" => serde_json::from_value::<a::CreateSvgArgs>(args).map(|_| ()),
        "create_diagram" => serde_json::from_value::<a::CreateDiagramArgs>(args).map(|_| ()),
        "create_shapes" => serde_json::from_value::<a::CreateShapesArgs>(args).map(|_| ()),
        "add_page" => serde_json::from_value::<a::AddPageArgs>(args).map(|_| ()),
        "update_shapes" => serde_json::from_value::<a::UpdateShapesArgs>(args).map(|_| ()),
        "delete_shapes" => serde_json::from_value::<a::DeleteShapesArgs>(args).map(|_| ()),
        "focus_viewport" => serde_json::from_value::<a::FocusViewportArgs>(args).map(|_| ()),
        "create_notebook" => serde_json::from_value::<a::CreateNotebookArgs>(args).map(|_| ()),
        "create_chapter" => serde_json::from_value::<a::CreateChapterArgs>(args).map(|_| ()),
        "list_canvases" => serde_json::from_value::<a::ListCanvasesArgs>(args).map(|_| ()),
        "get_active_canvas" => serde_json::from_value::<a::GetActiveCanvasArgs>(args).map(|_| ()),
        "save_canvas" => serde_json::from_value::<a::SaveCanvasArgs>(args).map(|_| ()),
        _ => Ok(()),
    };
    checked.map_err(err)
}

/// Frontend-target tool: requires a bridge AND an open canvas, then crosses
/// the webview boundary with the canvas pinned.
async fn frontend_tool(
    ctx: &DispatchCtx<'_>,
    name: &str,
    args: Value,
) -> Result<Value, CoreError> {
    let Some(bridge) = ctx.bridge else {
        return Err(CoreError::Ai(
            "the AI canvas bridge is not running (desktop only feature)".into(),
        ));
    };
    let active = ctx
        .active_canvas()
        .await?
        .ok_or_else(|| CoreError::Ai("no canvas is open — open a canvas in the app first".into()))?;
    bridge::call_frontend_tool(bridge, name, args, &active.id, ctx.origin).await
}

/// Rust-target tools, implemented against the database (and, for save_canvas,
/// the open canvas through the bridge).
async fn rust_tool(ctx: &DispatchCtx<'_>, name: &str, args: Value) -> Result<Value, CoreError> {
    match name {
        "get_active_canvas" => {
            let _: params::GetActiveCanvasArgs = tools::parse_args(name, args)?;
            match ctx.active_canvas().await? {
                Some(c) => Ok(serde_json::json!({
                    "active": true,
                    "id": c.id,
                    "name": c.name,
                    "canvas_type": c.canvas_type,
                })),
                None => Ok(serde_json::json!({ "active": false })),
            }
        }

        "create_notebook" => {
            let args: params::CreateNotebookArgs = tools::parse_args(name, args)?;
            let name = args.name.trim();
            if name.is_empty() {
                return Err(CoreError::Ai("notebook name must not be empty".into()));
            }
            let notebook = repo::create_notebook(
                ctx.pool,
                &repo::new_id(),
                name,
                None,
                args.description.as_deref().map(str::trim).filter(|d| !d.is_empty()),
                None,
            )
            .await?;
            Ok(serde_json::json!({
                "id": notebook.id,
                "name": notebook.name,
                "description": notebook.description,
                "created": true,
            }))
        }

        "create_chapter" => {
            let args: params::CreateChapterArgs = tools::parse_args(name, args)?;
            let name = args.name.trim();
            if name.is_empty() {
                return Err(CoreError::Ai("canvas name must not be empty".into()));
            }
            let canvas_type = args
                .canvas_type
                .as_deref()
                .map(str::trim)
                .filter(|t| !t.is_empty())
                .unwrap_or("infinite");
            for (field, v) in [
                ("page_width", args.page_width),
                ("page_height", args.page_height),
            ] {
                if let Some(v) = v {
                    if v <= 0 || v > 20000 {
                        return Err(CoreError::Ai(format!(
                            "{field} must be between 1 and 20000 (pixels)"
                        )));
                    }
                }
            }
            // A missing notebook is a clean, readable model error — not a
            // foreign-key leak.
            repo::load_notebook(ctx.pool, &args.notebook_id).await?;
            let chapter = repo::create_chapter(
                ctx.pool,
                &repo::new_id(),
                &args.notebook_id,
                name,
                canvas_type,
                None,
                args.page_width,
                args.page_height,
                None,
                None,
                None,
            )
            .await?;
            Ok(serde_json::json!({
                "id": chapter.id,
                "name": chapter.name,
                "notebook_id": chapter.notebook_id,
                "canvas_type": chapter.canvas_type,
                "created": true,
            }))
        }

        "list_canvases" => {
            let args: params::ListCanvasesArgs = tools::parse_args(name, args)?;
            let pattern = args
                .query
                .as_deref()
                .map(|q| format!("%{}%", q.trim().to_lowercase()))
                .unwrap_or_else(|| "%".to_string());
            let limit = args.limit.unwrap_or(50).clamp(1, 200);
            let offset = args.offset.unwrap_or(0);
            let rows: Vec<(String, String, String, i64, String, String, i64, i64)> = sqlx::query_as(
                "SELECT c.id, c.name, c.canvas_type, c.updated_at, n.id, n.name,
                  (SELECT COUNT(*) FROM topics t
                     WHERE t.chapter_id = c.id AND t.deleted_at IS NULL) AS topic_count,
                  (SELECT COUNT(*) FROM topic_pages p JOIN topics t2 ON t2.id = p.topic_id
                     WHERE t2.chapter_id = c.id AND t2.deleted_at IS NULL) AS page_count
                 FROM chapters c JOIN notebooks n ON n.id = c.notebook_id
                 WHERE c.deleted_at IS NULL AND n.deleted_at IS NULL
                   AND (lower(c.name) LIKE ?1 OR lower(n.name) LIKE ?1)
                 ORDER BY c.updated_at DESC
                 LIMIT ?2 OFFSET ?3",
            )
            .bind(&pattern)
            .bind(limit)
            .bind(offset)
            .fetch_all(ctx.pool)
            .await?;
            let canvases: Vec<Value> = rows
                .into_iter()
                .map(
                    |(id, name, canvas_type, updated_at, notebook_id, notebook, topic_count, page_count)| {
                        serde_json::json!({
                            "id": id,
                            "name": name,
                            "notebook": notebook,
                            "notebook_id": notebook_id,
                            "canvas_type": canvas_type,
                            "updated_at": updated_at,
                            "topic_count": topic_count,
                            "page_count": page_count,
                        })
                    },
                )
                .collect();
            Ok(serde_json::json!({ "canvases": canvases }))
        }

        "save_canvas" => {
            let _: params::SaveCanvasArgs = tools::parse_args(name, args)?;
            let bridge = ctx.bridge.ok_or_else(|| {
                CoreError::Ai("cannot save without an open canvas bridge (desktop only)".into())
            })?;
            let active = ctx.active_canvas().await?.ok_or_else(|| {
                CoreError::Ai("no canvas is open — open a canvas in the app first".into())
            })?;
            // The open webview owns the live snapshot; Rust persists it.
            let snapshot = bridge::call_frontend_tool(
                bridge,
                "get_snapshot",
                serde_json::json!({}),
                &active.id,
                ctx.origin,
            )
            .await?;
            crate::repo::save_chapter_canvas(
                ctx.pool,
                &active.id,
                &snapshot["snapshot"],
                snapshot["tldraw_version"].as_str(),
            )
            .await?;
            // Same counting rule as the repo layer (whatever snapshot layout
            // tldraw currently uses).
            let shape_count = crate::repo::count_shapes(&snapshot["snapshot"]);
            let saved_at = std::time::SystemTime::now()
                .duration_since(std::time::UNIX_EPOCH)
                .map(|d| d.as_millis() as i64)
                .unwrap_or(0);
            Ok(serde_json::json!({
                "saved": true,
                "shape_count": shape_count,
                "saved_at": saved_at,
            }))
        }

        _ => Err(CoreError::NotFound(format!("no tool named {name}"))),
    }
}
