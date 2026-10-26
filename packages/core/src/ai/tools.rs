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
            "Read the currently open canvas as a compact outline: every shape's id, type, text content, position and size. Code blocks include their language and code, math blocks their LaTeX, tables their markdown, cards their variant and text. Also reports pages-mode geometry (page size and sheet count). Call this before any edit so you work with real shape ids and real positions.",
            a::GetCanvasArgs, false, false, frontend
        ),
        def!(
            "get_selection",
            "Read the shapes the user currently has selected on the canvas. Empty results mean nothing is selected. Use it for 'tidy up what I selected' style requests.",
            a::GetSelectionArgs, false, false, frontend
        ),
        def!(
            "get_screenshot",
            "Take a screenshot of the current canvas (or of the selection) as an image. Use it only when the text outline is not enough, e.g. for visual layout questions. If the client refuses large images, pass a small max_width such as 768 or 1024. Returns the image directly, not a file path.",
            a::ScreenshotArgs, false, false, frontend
        ),
        def!(
            "create_note",
            "Create a note box whose text supports light markdown and $inline math$ / $$display math$$: paragraphs, '- ' bullets, '1. ' numbered lists, **bold**, *italic*, `code`. Returns the created shape with its final x/y/w/h — chain the next block from those. Without x/y the note is placed below existing content without overlap; with x/y it is honored exactly (top-left corner). Use side for left/right/above.",
            a::CreateNoteArgs, false, false, frontend
        ),
        def!(
            "create_math_block",
            "Create a rendered LaTeX equation block (KaTeX). Argument is \"latex\" — the LaTeX WITHOUT $ delimiters, e.g. \"E = mc^2\". Use it for standalone formulas; inline math inside note/card/table text needs no block. Returns the created shape with its final x/y/w/h.",
            a::CreateMathBlockArgs, false, false, frontend
        ),
        def!(
            "create_code_block",
            "Create a syntax-highlighted code block (shiki). Argument is \"code\" (the source, verbatim) plus optional \"language\": typescript, javascript, rust, python, java, c, cpp, go, html, css, json, bash, sql, plain. Always use this for real code instead of putting code in a note. Returns the created shape with its final x/y/w/h.",
            a::CreateCodeBlockArgs, false, false, frontend
        ),
        def!(
            "create_table",
            "Create a table. Argument is \"markdown\": a GitHub-flavored table (header row, --- delimiter row, rows); cells may contain $inline math$. Use it for any tabular data instead of approximating tables with notes. Returns the created shape with its final x/y/w/h.",
            a::CreateTableArgs, false, false, frontend
        ),
        def!(
            "create_card",
            "Create a callout card: a titled accent-colored highlight box. Argument is \"title\" plus optional \"body\" (same light markdown as notes), \"variant\" (note/info/tip/success/warning/danger), \"icon\" (pin, star, zap…), \"badge\". Use it for warnings, tips, definitions, anything that must stand out. Returns the created shape with its final x/y/w/h.",
            a::CreateCardArgs, false, false, frontend
        ),
        def!(
            "create_svg",
            "Create a diagram block on the canvas that renders complete `<svg>` markup you provide. Keep the SVG self-contained (no external images or fonts). Returns the created shape with its final x/y/w/h.",
            a::CreateSvgArgs, false, false, frontend
        ),
        def!(
            "create_diagram",
            "Create a node/arrow flow diagram from a structural description: nodes {id, label, shape ('rect'|'round'|'diamond'|'note')} and edges {from, to, label}. Layers are laid out automatically. Use it for flowcharts, pipelines, state machines, hierarchies. Returns all created ids with the diagram's x/y/w/h.",
            a::CreateDiagramArgs, false, false, frontend
        ),
        def!(
            "create_shapes",
            "Create one or more basic tldraw shapes from partial shape objects ({\"type\": \"geo\"|\"text\"|\"note\"|\"arrow\"|\"line\"|\"frame\"|\"svg-diagram\", \"x\":, \"y\":, \"props\": {...}}); geo shapes need props with numeric w and h. Entries without x/y are placed deterministically below existing content (use \"side\" for left/right/above) and clamped inside the open page sheet — never pass x/y you did not measure. Entries with explicit x/y are honored exactly. Best for plain geometry and for frames that contain later blocks. Use the dedicated create_* tools for code, math, tables and cards.",
            a::CreateShapesArgs, false, false, frontend
        ),
        def!(
            "update_shapes",
            "Partially update existing shapes by id: each update entry carries \"id\", x/y at the top level and content under \"props\"; for box-type blocks (code-block, math-block, table, callout-card, geo, frame, svg-diagram) a top-level w/h is moved under props for you. Cards keep title/badge/body as rich-text props — prefer deleting and recreating a card to rewriting it. Never invent ids: only update ids a tool returned.",
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

/// Tool names the webview executes (frontend target, internal plumbing
/// included) — the `list_tool_names` command feeds this to the frontend's
/// registry/executor drift check. Rust-target tools run natively in
/// dispatch and must not appear here: flagging them against the frontend
/// executor set would report a false "the AI will fail those tools!".
pub fn frontend_tool_names() -> Vec<&'static str> {
    all_tools()
        .into_iter()
        .filter(|t| t.target == Target::Frontend)
        .map(|t| t.name)
        .collect()
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
