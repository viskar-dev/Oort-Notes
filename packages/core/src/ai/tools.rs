//! The single static tool registry.
//!
//! One place defines every tool the AI can use: name, model-facing
//! description, argument schema (generated from the typed structs in
//! `params::`), a `destructive` flag (gated behind a user confirmation on the
//! frontend) and a `target` that says whether the implementation is a Rust
//! handler or a frontend canvas executor.
//!
//! `dispatch` never leaks the target to callers, and descriptions are written
//! for the model (what it does, not where it runs).

use crate::error::CoreError;
use crate::ai::params;
use serde::{Deserialize, Serialize};
use serde_json::Value;

/// Which side implements a tool. Internal only — callers get the same
/// `dispatch` API regardless.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum Target {
    /// Handled natively in Rust (database access).
    Rust,
    /// Handled in the webview on the open canvas (tldraw editor access).
    Frontend,
}

/// One registry entry. `parameters` is the tool's JSON Schema object
/// (`{"type":"object", "properties": {...}, ...}`).
#[derive(Debug, Clone)]
pub struct ToolDef {
    pub name: &'static str,
    pub description: &'static str,
    pub parameters: Value,
    /// Deleting (or otherwise destroying) user content: the frontend must
    /// confirm with the user before running these.
    pub destructive: bool,
    /// Tools the frontend executes but that are not offered to models or MCP
    /// clients (plumbing used by Rust handlers).
    pub internal: bool,
    pub target: Target,
}

/// JSON Schema for a tool's argument type, as a serde_json Value.
fn schema<T: schemars::JsonSchema>() -> Value {
    serde_json::to_value(schemars::schema_for!(T))
        .unwrap_or_else(|_| serde_json::json!({ "type": "object", "properties": {} }))
}

/// Uniquely named tool definitions. Ordering here is the ordering models and
/// MCP clients see.
pub fn all_tools() -> Vec<ToolDef> {
    use params as a;

    macro_rules! def {
        ($id:literal, $desc:literal, $ty:ty, $destructive:literal, $internal:literal, $target:expr) => {
            ToolDef {
                name: $id,
                description: $desc,
                parameters: schema::<$ty>(),
                destructive: $destructive,
                internal: $internal,
                target: $target,
            }
        };
    }

    let rust = Target::Rust;
    let frontend = Target::Frontend;

    vec![
        def!(
            "get_canvas",
            "Read the currently open canvas as a compact outline: every shape's id, type, text content and geometry. Call this before editing so you work with real shape ids.",
            a::GetCanvasArgs, false, false, frontend
        ),
        def!(
            "get_selection",
            "Read the shapes the user currently has selected on the canvas. Empty results mean nothing is selected.",
            a::GetSelectionArgs, false, false, frontend
        ),
        def!(
            "get_screenshot",
            "Take a screenshot of the current canvas (or of the selection) as an image. Use it only when the text outline is not enough, e.g. for visual layout questions. Returns the image directly, not a file path.",
            a::ScreenshotArgs, false, false, frontend
        ),
        def!(
            "create_note",
            "Create a note on the canvas: a box that shows the given text. Returns the new shape id. Prefer this for plain text blocks.",
            a::CreateNoteArgs, false, false, frontend
        ),
        def!(
            "create_svg",
            "Create a diagram block on the canvas that renders complete `<svg>` markup you provide. Keep the SVG self-contained (no external images or fonts). Returns the new shape id.",
            a::CreateSvgArgs, false, false, frontend
        ),
        def!(
            "create_diagram",
            "Create a node/arrow flow diagram on the canvas from a structural description. Layers are laid out automatically. Returns the new shape id.",
            a::CreateDiagramArgs, false, false, frontend
        ),
        def!(
            "create_shapes",
            "Create one or more tldraw shapes from partial shape objects ({\"type\": \"geo\"|\"text\"|\"arrow\"|..., \"x\":, \"y\":, \"props\": {...}}). Use only known shape types and props. Returns the created ids.",
            a::CreateShapesArgs, false, false, frontend
        ),
        def!(
            "update_shapes",
            "Partially update existing shapes by id: each update entry is {\"id\": \"...\", ...partial shape or props}. Never lists ids you did not receive from a tool result.",
            a::UpdateShapesArgs, false, false, frontend
        ),
        def!(
            "delete_shapes",
            "Delete shapes by id. Destructive: the user must confirm. Never lists ids you did not receive from a tool result.",
            a::DeleteShapesArgs, true, false, frontend
        ),
        def!(
            "focus_viewport",
            "Move the canvas viewport so the given shapes (or all content when the list is empty) fit nicely on screen.",
            a::FocusViewportArgs, false, false, frontend
        ),
        // Rust side
        def!(
            "list_canvases",
            "List the user's canvases (chapters) across notebooks: id, name, notebook, canvas type and last edit time. Use it to find which canvas the user is talking about.",
            a::ListCanvasesArgs, false, false, rust
        ),
        def!(
            "get_active_canvas",
            "Get the canvas the user currently has open: id, name and type.",
            a::GetActiveCanvasArgs, false, false, rust
        ),
        def!(
            "save_canvas",
            "Force the currently open canvas to save immediately (normally it autosaves a moment after each change).",
            a::SaveCanvasArgs, false, false, rust
        ),
        // Internal plumbing (hidden from models and MCP clients)
        def!(
            "get_snapshot",
            "Internal: serialize the open canvas snapshot for persistence.",
            a::SnapshotArgs, false, true, frontend
        ),
    ]
}

/// Registry entry lookup by tool name.
pub fn tool_def(name: &str) -> Option<ToolDef> {
    all_tools().into_iter().find(|t| t.name == name)
}

/// All tool names, internal ones included (used by the `list_tool_names`
/// command that checks registry vs frontend implementation coverage).
pub fn all_tool_names() -> Vec<&'static str> {
    all_tools().iter().map(|t| t.name).collect()
}

/// Tools advertised to models / MCP clients (internal plumbing excluded).
pub fn public_tools() -> Vec<ToolDef> {
    all_tools().into_iter().filter(|t| !t.internal).collect()
}

/// Deserialize a tool's raw arguments into its typed struct: the shape of the
/// schema is enforced here before anything runs.
pub fn parse_args<T: for<'de> Deserialize<'de>>(name: &str, args: Value) -> Result<T, CoreError> {
    serde_json::from_value(args)
        .map_err(|e| CoreError::Ai(format!("invalid arguments for {name}: {e}")))
}
