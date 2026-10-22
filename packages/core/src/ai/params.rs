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
    /// Note text (plain text; the canvas renders it as a text shape).
    pub text: String,
    /// World x position (defaults to the current viewport center).
    pub x: Option<f64>,
    /// World y position (defaults to the current viewport center).
    pub y: Option<f64>,
    /// Preferred width in world units (default 280).
    pub width: Option<f64>,
}

/// Create a diagram block that renders raw SVG markup.
#[derive(Debug, Clone, Default, Deserialize, JsonSchema)]
pub struct CreateSvgArgs {
    /// Short label shown for the block.
    pub name: String,
    /// Raw SVG markup (complete `<svg>...</svg>` document). Must be sanitized.
    pub svg: String,
    pub x: Option<f64>,
    pub y: Option<f64>,
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
    /// World space x position (defaults to viewport center).
    pub x: Option<f64>,
    /// World space y position (defaults to viewport center).
    pub y: Option<f64>,
}

/// Create arbitrary tldraw shapes from partial shape objects.
#[derive(Debug, Clone, Default, Deserialize, JsonSchema)]
pub struct CreateShapesArgs {
    /// Partial tldraw shape objects: `{ "type": "geo", "x": 0, "y": 0, "props": { ... } }`.
    pub shapes: Vec<serde_json::Value>,
}

/// Partially update existing shapes by id.
#[derive(Debug, Clone, Default, Deserialize, JsonSchema)]
pub struct UpdateShapesArgs {
    /// Partial shape updates: every entry must carry the shape `id`.
    pub updates: Vec<serde_json::Value>,
}

/// Delete shapes by id.
#[derive(Debug, Clone, Default, Deserialize, JsonSchema)]
pub struct DeleteShapesArgs {
    pub ids: Vec<String>,
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

/// List canvases (chapters) across all notebooks.
#[derive(Debug, Clone, Default, Deserialize, JsonSchema)]
pub struct ListCanvasesArgs {
    /// Optional case-insensitive filter on chapter or notebook name.
    pub query: Option<String>,
}

/// Read the active canvas pointer.
#[derive(Debug, Clone, Default, Deserialize, JsonSchema)]
pub struct GetActiveCanvasArgs {}

/// Force the open canvas to save now.
#[derive(Debug, Clone, Default, Deserialize, JsonSchema)]
pub struct SaveCanvasArgs {}
