//! Typed tool arguments. Every struct also drives the JSON Schema the model
//! sees (`schemars`), so the wire format and the validation are one piece.

use schemars::JsonSchema;
use serde::Deserialize;

/// Read the full canvas outline.
#[derive(Debug, Clone, Default, Deserialize, JsonSchema)]
pub struct GetCanvasArgs {}

/// Read the shapes the user currently has selected.
#[derive(Debug, Clone, Default, Deserialize, JsonSchema)]
pub struct GetSelectionArgs {}

/// Read one shape's complete internal state by id.
#[derive(Debug, Clone, Default, Deserialize, JsonSchema)]
pub struct GetShapeArgs {
    /// The shape id, exactly as another tool returned it (starts "shape:").
    pub shape_id: String,
}

/// Screenshot of the canvas (or the selection), as a data URL.
#[derive(Debug, Clone, Default, Deserialize, JsonSchema)]
pub struct ScreenshotArgs {
    /// Screenshot only the selected shapes instead of the whole canvas.
    pub focus_selection: Option<bool>,
    /// Longest image side in px (default 1568).
    pub max_width: Option<u32>,
}

/// Create a labeled note box with the given text.
#[derive(Debug, Clone, Default, Deserialize, JsonSchema)]
pub struct CreateNoteArgs {
    /// Note text. Supports light markdown and inline math: paragraphs, '- '
    /// bulleted lists ('1. ' numbered), **bold**, *italic*, `code`,
    /// $inline math$, and $$display math$$ lines.
    pub text: String,
    /// World x position (unset ⇒ placed automatically beside existing content).
    pub x: Option<f64>,
    /// World y position (unset ⇒ placed automatically below existing content).
    pub y: Option<f64>,
    /// Where to put the block relative to existing content
    /// ('left' | 'right' | 'above' | 'below', default 'below').
    pub side: Option<String>,
    /// Preferred width in world units (default 280).
    pub width: Option<f64>,
}

/// Create a rendered equation block (KaTeX display math).
#[derive(Debug, Clone, Default, Deserialize, JsonSchema)]
pub struct CreateMathBlockArgs {
    /// LaTeX source WITHOUT $ delimiters, e.g. "E = mc^2".
    pub latex: String,
    /// World x position (unset ⇒ placed automatically beside existing content).
    pub x: Option<f64>,
    /// World y position (unset ⇒ placed automatically below existing content).
    pub y: Option<f64>,
    /// Where to put the block relative to existing content
    /// ('left' | 'right' | 'above' | 'below', default 'below').
    pub side: Option<String>,
    /// Preferred width in world units (default 320, minimum 160).
    pub width: Option<f64>,
}

/// Create a syntax-highlighted code block.
#[derive(Debug, Clone, Default, Deserialize, JsonSchema)]
pub struct CreateCodeBlockArgs {
    /// The source code, verbatim.
    pub code: String,
    /// Language id: typescript, javascript, rust, python, java, c, cpp, go,
    /// html, css, json, bash, sql, or plain (default typescript).
    pub language: Option<String>,
    /// World x position (unset ⇒ placed automatically beside existing content).
    pub x: Option<f64>,
    /// World y position (unset ⇒ placed automatically below existing content).
    pub y: Option<f64>,
    /// Where to put the block relative to existing content
    /// ('left' | 'right' | 'above' | 'below', default 'below').
    pub side: Option<String>,
    /// Preferred width in world units (default 560, minimum 320).
    pub width: Option<f64>,
}

/// Create a table from a GitHub-flavored Markdown table.
#[derive(Debug, Clone, Default, Deserialize, JsonSchema)]
pub struct CreateTableArgs {
    /// GFM markdown table with header row and `---` delimiter row, e.g.
    /// "| Name | Value |" then "| --- | --- |" then rows. Cells may contain
    /// inline math in $...$.
    pub markdown: String,
    /// World x position (unset ⇒ placed automatically beside existing content).
    pub x: Option<f64>,
    /// World y position (unset ⇒ placed automatically below existing content).
    pub y: Option<f64>,
    /// Where to put the block relative to existing content
    /// ('left' | 'right' | 'above' | 'below', default 'below').
    pub side: Option<String>,
    /// Preferred width in world units (default auto from column count).
    pub width: Option<f64>,
}

/// Write native single-style text directly on the canvas.
#[derive(Debug, Clone, Default, Deserialize, JsonSchema)]
pub struct CreateTextArgs {
    /// The text to write. Line breaks are kept; markdown is not rendered —
    /// use create_note for formatted prose.
    pub text: String,
    /// Render heading-style (about twice the default size).
    pub heading: Option<bool>,
    /// World x position (unset ⇒ placed automatically beside existing content).
    pub x: Option<f64>,
    /// World y position (unset ⇒ placed automatically beside existing content).
    pub y: Option<f64>,
    /// Where to put the text relative to existing content
    /// ('left' | 'right' | 'above' | 'below', default 'below').
    pub side: Option<String>,
}

/// Create a callout card: a titled highlight box with an accent color and
/// an icon.
#[derive(Debug, Clone, Default, Deserialize, JsonSchema)]
pub struct CreateCardArgs {
    /// Card header (short line).
    pub title: String,
    /// Card body. Supports the same light markdown as notes: lists,
    /// **bold**, `code`, $inline math$.
    pub body: Option<String>,
    /// Accent: note (purple) | info (blue) | tip (teal) | success (green) |
    /// warning (amber) | danger (red). Default note.
    pub variant: Option<String>,
    /// Icon: dot | info | tip | success | warning | danger | pin | star |
    /// bookmark | zap | help. Defaults to the variant's matching icon.
    pub icon: Option<String>,
    /// Optional short badge text shown right of the title.
    pub badge: Option<String>,
    /// World x position (unset ⇒ placed automatically beside existing content).
    pub x: Option<f64>,
    /// World y position (unset ⇒ placed automatically below existing content).
    pub y: Option<f64>,
    /// Where to put the block relative to existing content
    /// ('left' | 'right' | 'above' | 'below', default 'below').
    pub side: Option<String>,
    /// Preferred width in world units (default 460, minimum 220).
    pub width: Option<f64>,
}

/// Create a diagram block that renders raw SVG markup.
#[derive(Debug, Clone, Default, Deserialize, JsonSchema)]
pub struct CreateSvgArgs {
    /// Short label shown for the block.
    pub name: String,
    /// Raw SVG markup (complete `<svg>...</svg>` document). Must be sanitized.
    pub svg: String,
    /// World x position (unset ⇒ placed automatically beside existing content).
    pub x: Option<f64>,
    /// World y position (unset ⇒ placed automatically below existing content).
    pub y: Option<f64>,
    /// Where to put the block relative to existing content
    /// ('left' | 'right' | 'above' | 'below', default 'below').
    pub side: Option<String>,
    /// Preferred render width in world units (default 320).
    pub width: Option<f64>,
}

/// One node of a `create_diagram` call.
#[derive(Debug, Clone, Default, Deserialize, JsonSchema)]
pub struct DiagramNode {
    /// Stable id the edges refer to (not the shape id).
    pub id: String,
    /// Node label text.
    pub label: String,
    /// Optional node kind ('rect' | 'round' | 'diamond' | 'note').
    pub shape: Option<String>,
}

/// One edge of a `create_diagram` call.
#[derive(Debug, Clone, Default, Deserialize, JsonSchema)]
pub struct DiagramEdge {
    pub from: String,
    pub to: String,
    /// Optional label on the arrow.
    pub label: Option<String>,
}

/// Create a flow diagram from a structural description.
#[derive(Debug, Clone, Default, Deserialize, JsonSchema)]
pub struct CreateDiagramArgs {
    /// Diagram title (may be empty).
    pub title: Option<String>,
    /// Node list; ids are edge endpoints, order shows intent.
    pub nodes: Vec<DiagramNode>,
    /// Directed edges; drawn as arrows between the matched nodes.
    pub edges: Vec<DiagramEdge>,
    /// Layout direction ('down' | 'right', default 'down').
    pub direction: Option<String>,
    /// World x position (unset ⇒ placed automatically beside existing content).
    pub x: Option<f64>,
    /// World y position (unset ⇒ placed automatically below existing content).
    pub y: Option<f64>,
    /// Where to put the diagram relative to existing content
    /// ('left' | 'right' | 'above' | 'below', default 'below').
    pub side: Option<String>,
}

/// Create arbitrary tldraw shapes from partial shape objects.
#[derive(Debug, Clone, Default, Deserialize, JsonSchema)]
pub struct CreateShapesArgs {
    /// Partial tldraw shape objects: `{ "type": "geo", "x": 0, "y": 0, "props": { ... } }`.
    pub shapes: Vec<serde_json::Value>,
    /// Where x/y-less shapes are placed relative to existing content
    /// ('left' | 'right' | 'above' | 'below', default 'below'); they are
    /// clamped into the compose region (the open page sheet in pages mode).
    /// Entries with explicit x/y are honored exactly.
    pub side: Option<String>,
}

/// Partially update existing shapes by id.
#[derive(Debug, Clone, Default, Deserialize, JsonSchema)]
pub struct UpdateShapesArgs {
    /// Partial shape updates: every entry must carry the shape `id`.
    pub updates: Vec<serde_json::Value>,
}

/// Delete shapes by id. Destructive: the confirmation lives with the caller
/// (the app's card for the assistant; the MCP client's own conversation for
/// external clients).
#[derive(Debug, Clone, Default, Deserialize, JsonSchema)]
pub struct DeleteShapesArgs {
    pub ids: Vec<String>,
    /// External (MCP) clients' destructive confirmation: the client surfaces
    /// the confirmation in its own UI and re-sends the call with `true`. The
    /// in-app assistant confirms through the app card and never sends this.
    pub confirmed: Option<bool>,
}

/// Move the viewport so the given shapes (or all content) fit on screen.
#[derive(Debug, Clone, Default, Deserialize, JsonSchema)]
pub struct FocusViewportArgs {
    /// Shape ids to focus; empty means all canvas content.
    pub shape_ids: Vec<String>,
    /// Extra margin in world units around the focused content.
    pub padding: Option<f64>,
}

/// Internal: serialize the canvas snapshot for a forced save.
#[derive(Debug, Clone, Default, Deserialize, JsonSchema)]
pub struct SnapshotArgs {}

/// Create a new, empty notebook.
#[derive(Debug, Clone, Default, Deserialize, JsonSchema)]
pub struct CreateNotebookArgs {
    /// The notebook's name (unique among notebooks).
    pub name: String,
    /// Optional one-line description.
    pub description: Option<String>,
}

/// Create a new canvas (chapter) inside an existing notebook.
#[derive(Debug, Clone, Default, Deserialize, JsonSchema)]
pub struct CreateChapterArgs {
    /// The notebook to create the canvas in (from list_canvases or
    /// create_notebook).
    pub notebook_id: String,
    /// The canvas's name (unique among chapters in the notebook).
    pub name: String,
    /// 'infinite' (free whiteboard, default), 'page' (stacked fixed sheets) or
    /// 'scroll' (one long column).
    pub canvas_type: Option<String>,
    /// Pages mode only: custom page width in px (default 800).
    pub page_width: Option<i64>,
    /// Pages mode only: custom page height in px (default 1100).
    pub page_height: Option<i64>,
}

/// Extend a page-type canvas with a new sheet in a topic's stack. The topic
/// is the decision: omit it and the tool answers with the options.
#[derive(Debug, Clone, Default, Deserialize, JsonSchema)]
pub struct AddPageArgs {
    /// The topic whose stack gets the new sheet. Omitted ⇒ the tool returns
    /// `status: "requires_input"` listing the topics (an MCP client surfaces
    /// the choice in its own conversation and re-sends with the id).
    pub topic_id: Option<String>,
}

/// List canvases (chapters) across all notebooks.
#[derive(Debug, Clone, Default, Deserialize, JsonSchema)]
pub struct ListCanvasesArgs {
    /// Optional case-insensitive filter on chapter or notebook name.
    pub query: Option<String>,
    /// Skip this many canvases (newest edit first); used to page past the
    /// result cap together with `limit`.
    pub offset: Option<u32>,
    /// How many canvases to return (default 50, at most 200).
    pub limit: Option<u32>,
}

/// Read the active canvas pointer.
#[derive(Debug, Clone, Default, Deserialize, JsonSchema)]
pub struct GetActiveCanvasArgs {}

/// Force the open canvas to save now.
#[derive(Debug, Clone, Default, Deserialize, JsonSchema)]
pub struct SaveCanvasArgs {}
