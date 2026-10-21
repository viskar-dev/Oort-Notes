use axum::{
    extract::{Path, Query, State},
    http::StatusCode,
    routing::{get, patch, post},
    Json, Router,
};
use note_core::{repo, Chapter, ChapterCanvas, Notebook, PagePreset, Topic, TopicPage, UiPreset};
use serde::Deserialize;
use sqlx::SqlitePool;
use tower_http::cors::{Any, CorsLayer};

pub mod google;
pub mod icons;

pub type ApiResult<T> = Result<Json<T>, (StatusCode, String)>;

pub fn to_status(e: note_core::CoreError) -> (StatusCode, String) {
    let code = match &e {
        note_core::CoreError::NotFound(_) => StatusCode::NOT_FOUND,
        // talking to Google failed — the app is fine, Google (or the network) isn't
        note_core::CoreError::Google(_) | note_core::CoreError::Http(_) => {
            StatusCode::BAD_GATEWAY
        }
        _ => StatusCode::INTERNAL_SERVER_ERROR,
    };
    (code, e.to_string())
}

// ---------- Notebooks ----------

#[derive(Deserialize)]
struct CreateNotebookBody {
    name: String,
    label: Option<String>,
    description: Option<String>,
    icon: Option<String>,
}

#[derive(Debug, Default, Deserialize)]
struct NotebookListQuery {
    filter: Option<String>,  // all | recent | favorites | archived
    sort: Option<String>,    // edited | opened | name
    q: Option<String>,
}

async fn list_notebooks(
    State(pool): State<SqlitePool>,
    Query(q): Query<NotebookListQuery>,
) -> ApiResult<Vec<Notebook>> {
    repo::list_notebooks(
        &pool,
        q.filter.as_deref().unwrap_or("all"),
        q.sort.as_deref().unwrap_or("edited"),
        q.q.as_deref().filter(|s| !s.trim().is_empty()),
    )
    .await
    .map(Json)
    .map_err(to_status)
}

#[derive(Debug, Default, Deserialize)]
struct NotebookFlagsBody {
    name: Option<String>,
    is_favorite: Option<bool>,
    archived: Option<bool>,
}

async fn update_notebook_flags(
    State(pool): State<SqlitePool>,
    Path(id): Path<String>,
    Json(b): Json<NotebookFlagsBody>,
) -> ApiResult<Notebook> {
    repo::update_notebook_flags(
        &pool,
        &id,
        b.name.as_deref(),
        b.is_favorite,
        b.archived,
    )
    .await
    .map(Json)
    .map_err(to_status)
}

async fn create_notebook(
    State(pool): State<SqlitePool>,
    Json(b): Json<CreateNotebookBody>,
) -> ApiResult<Notebook> {
    repo::create_notebook(
        &pool,
        &repo::new_id(),
        &b.name,
        b.label.as_deref(),
        b.description.as_deref(),
        b.icon.as_deref(),
    )
    .await
    .map(Json)
    .map_err(to_status)
}

async fn load_notebook(
    State(pool): State<SqlitePool>,
    Path(id): Path<String>,
) -> ApiResult<Notebook> {
    repo::load_notebook(&pool, &id)
        .await
        .map(Json)
        .map_err(to_status)
}

async fn delete_notebook(
    State(pool): State<SqlitePool>,
    Path(id): Path<String>,
) -> Result<StatusCode, (StatusCode, String)> {
    repo::soft_delete_notebook(&pool, &id)
        .await
        .map(|_| StatusCode::NO_CONTENT)
        .map_err(to_status)
}

// ---------- Chapters ----------

#[derive(Deserialize)]
struct CreateChapterBody {
    notebook_id: String,
    name: String,
    canvas_type: String,
    page_preset_id: Option<String>,
    page_width: Option<i64>,
    page_height: Option<i64>,
    scroll_width: Option<i64>,
    background: Option<String>,
    ui_preset_id: Option<String>,
}

async fn list_chapters(
    State(pool): State<SqlitePool>,
    Path(notebook_id): Path<String>,
) -> ApiResult<Vec<Chapter>> {
    repo::list_chapters(&pool, &notebook_id)
        .await
        .map(Json)
        .map_err(to_status)
}

async fn create_chapter(
    State(pool): State<SqlitePool>,
    Json(b): Json<CreateChapterBody>,
) -> ApiResult<Chapter> {
    repo::create_chapter(
        &pool,
        &repo::new_id(),
        &b.notebook_id,
        &b.name,
        &b.canvas_type,
        b.page_preset_id.as_deref(),
        b.page_width,
        b.page_height,
        b.scroll_width,
        b.background.as_deref(),
        b.ui_preset_id.as_deref(),
    )
    .await
    .map(Json)
    .map_err(to_status)
}

#[derive(Debug, Default, serde::Deserialize)]
struct ChapterUiPresetBody {
    ui_preset_id: Option<String>,
}

async fn set_chapter_ui_preset(
    State(pool): State<SqlitePool>,
    Path(id): Path<String>,
    Json(b): Json<ChapterUiPresetBody>,
) -> ApiResult<Chapter> {
    repo::set_chapter_ui_preset(&pool, &id, b.ui_preset_id.as_deref())
        .await
        .map(Json)
        .map_err(to_status)
}

#[derive(Debug, Default, serde::Deserialize)]
struct ChapterPatchBody {
    name: Option<String>,
}

async fn update_chapter(
    State(pool): State<SqlitePool>,
    Path(id): Path<String>,
    Json(b): Json<ChapterPatchBody>,
) -> ApiResult<Chapter> {
    let name = b
        .name
        .as_deref()
        .map(str::trim)
        .filter(|s| !s.is_empty())
        .ok_or((StatusCode::BAD_REQUEST, "name is required".to_string()))?;
    repo::update_chapter(&pool, &id, name)
        .await
        .map(Json)
        .map_err(to_status)
}

async fn load_chapter(
    State(pool): State<SqlitePool>,
    Path(id): Path<String>,
) -> ApiResult<Chapter> {
    repo::load_chapter(&pool, &id)
        .await
        .map(Json)
        .map_err(to_status)
}

async fn delete_chapter(
    State(pool): State<SqlitePool>,
    Path(id): Path<String>,
) -> Result<StatusCode, (StatusCode, String)> {
    repo::soft_delete_chapter(&pool, &id)
        .await
        .map(|_| StatusCode::NO_CONTENT)
        .map_err(to_status)
}

// ---------- Topics ----------

#[derive(Deserialize)]
struct CreateTopicBody {
    chapter_id: String,
    name: String,
    /// Client-supplied id: tldraw pages and topics share the same uuid
    /// (page record id = 'page:' + topic id). Generated when omitted.
    id: Option<String>,
}

async fn list_topics(
    State(pool): State<SqlitePool>,
    Path(chapter_id): Path<String>,
) -> ApiResult<Vec<Topic>> {
    repo::list_topics(&pool, &chapter_id)
        .await
        .map(Json)
        .map_err(to_status)
}

async fn create_topic(
    State(pool): State<SqlitePool>,
    Json(b): Json<CreateTopicBody>,
) -> ApiResult<Topic> {
    repo::create_topic(&pool, b.id.as_deref().unwrap_or(&repo::new_id()), &b.chapter_id, &b.name)
        .await
        .map(Json)
        .map_err(to_status)
}

async fn load_topic(
    State(pool): State<SqlitePool>,
    Path(id): Path<String>,
) -> ApiResult<Topic> {
    repo::load_topic(&pool, &id).await.map(Json).map_err(to_status)
}

#[derive(Deserialize)]
struct UpdateTopicBody {
    name: Option<String>,
    position: Option<i32>,
}

async fn update_topic(
    State(pool): State<SqlitePool>,
    Path(id): Path<String>,
    Json(b): Json<UpdateTopicBody>,
) -> ApiResult<Topic> {
    repo::update_topic(&pool, &id, b.name.as_deref(), b.position)
        .await
        .map(Json)
        .map_err(to_status)
}

async fn delete_topic(
    State(pool): State<SqlitePool>,
    Path(id): Path<String>,
) -> Result<StatusCode, (StatusCode, String)> {
    repo::soft_delete_topic(&pool, &id)
        .await
        .map(|_| StatusCode::NO_CONTENT)
        .map_err(to_status)
}

// ---------- Topic pages (multi-page topics) ----------

async fn list_topic_pages(
    State(pool): State<SqlitePool>,
    Path(topic_id): Path<String>,
) -> ApiResult<Vec<TopicPage>> {
    repo::list_topic_pages(&pool, &topic_id)
        .await
        .map(Json)
        .map_err(to_status)
}

#[derive(Deserialize)]
struct CreateTopicPageBody {
    name: String,
    /// Client-supplied id: tldraw pages and topic pages share the same uuid.
    id: Option<String>,
}

async fn create_topic_page(
    State(pool): State<SqlitePool>,
    Path(topic_id): Path<String>,
    Json(b): Json<CreateTopicPageBody>,
) -> ApiResult<TopicPage> {
    repo::create_topic_page(
        &pool,
        b.id.as_deref().unwrap_or(&repo::new_id()),
        &topic_id,
        &b.name,
    )
    .await
    .map(Json)
    .map_err(to_status)
}

#[derive(Deserialize)]
struct UpdateTopicPageBody {
    name: Option<String>,
    position: Option<i32>,
}

async fn update_topic_page(
    State(pool): State<SqlitePool>,
    Path(id): Path<String>,
    Json(b): Json<UpdateTopicPageBody>,
) -> ApiResult<TopicPage> {
    repo::update_topic_page(&pool, &id, b.name.as_deref(), b.position)
        .await
        .map(Json)
        .map_err(to_status)
}

async fn delete_topic_page(
    State(pool): State<SqlitePool>,
    Path(id): Path<String>,
) -> Result<StatusCode, (StatusCode, String)> {
    repo::delete_topic_page(&pool, &id)
        .await
        .map(|_| StatusCode::NO_CONTENT)
        .map_err(to_status)
}

// ---------- Chapter canvas ----------

async fn load_chapter_canvas(
    State(pool): State<SqlitePool>,
    Path(chapter_id): Path<String>,
) -> ApiResult<ChapterCanvas> {
    repo::load_chapter_canvas(&pool, &chapter_id)
        .await
        .map(Json)
        .map_err(to_status)
}

#[derive(Deserialize)]
struct SaveCanvasBody {
    snapshot: serde_json::Value,
    tldraw_version: Option<String>,
}

async fn save_chapter_canvas(
    State(pool): State<SqlitePool>,
    Path(chapter_id): Path<String>,
    Json(b): Json<SaveCanvasBody>,
) -> Result<StatusCode, (StatusCode, String)> {
    repo::save_chapter_canvas(&pool, &chapter_id, &b.snapshot, b.tldraw_version.as_deref())
        .await
        .map(|_| StatusCode::NO_CONTENT)
        .map_err(to_status)
}

// ---------- UI presets ----------

#[derive(Debug, serde::Deserialize)]
struct UiPresetBody {
    name: String,
    config: serde_json::Value,
}

#[derive(Debug, Default, serde::Deserialize)]
struct UiPresetPatch {
    name: Option<String>,
    config: Option<serde_json::Value>,
}

async fn list_ui_presets(State(pool): State<SqlitePool>) -> ApiResult<Vec<UiPreset>> {
    repo::list_ui_presets(&pool).await.map(Json).map_err(to_status)
}

async fn create_ui_preset(
    State(pool): State<SqlitePool>,
    Json(b): Json<UiPresetBody>,
) -> ApiResult<UiPreset> {
    repo::create_ui_preset(&pool, &repo::new_id(), &b.name, &b.config)
        .await
        .map(Json)
        .map_err(to_status)
}

async fn load_ui_preset(State(pool): State<SqlitePool>, Path(id): Path<String>) -> ApiResult<UiPreset> {
    repo::load_ui_preset(&pool, &id).await.map(Json).map_err(to_status)
}

async fn update_ui_preset(
    State(pool): State<SqlitePool>,
    Path(id): Path<String>,
    Json(b): Json<UiPresetPatch>,
) -> ApiResult<UiPreset> {
    repo::update_ui_preset(&pool, &id, b.name.as_deref(), b.config.as_ref())
        .await
        .map(Json)
        .map_err(to_status)
}

async fn delete_ui_preset(
    State(pool): State<SqlitePool>,
    Path(id): Path<String>,
) -> Result<StatusCode, (StatusCode, String)> {
    repo::delete_ui_preset(&pool, &id)
        .await
        .map(|_| StatusCode::NO_CONTENT)
        .map_err(to_status)
}

// ---------- Page presets ----------

async fn list_page_presets(State(pool): State<SqlitePool>) -> ApiResult<Vec<PagePreset>> {
    repo::list_page_presets(&pool)
        .await
        .map(Json)
        .map_err(to_status)
}

// ---------- App ----------

/// The complete API surface. Public so tests can drive the router directly.
pub fn build_router(pool: SqlitePool) -> Router {
    let cors = CorsLayer::new()
        .allow_origin(Any)
        .allow_methods(Any)
        .allow_headers(Any);

    // the google/backup routes MUST be merged before the CORS layer:
    // Router::layer only wraps routes added before it, and the browser
    // blocks fetches to routes served without CORS headers
    Router::new()
        .route(
            "/api/ping",
            get(|| async { Json(serde_json::json!({"message": "pong"})) }),
        )
        .route("/api/notebooks", get(list_notebooks).post(create_notebook))
        .route("/api/notebooks/{id}/flags", patch(update_notebook_flags))
        .route(
            "/api/notebooks/{id}",
            get(load_notebook).delete(delete_notebook),
        )
        .route("/api/notebooks/{id}/chapters", get(list_chapters))
        .route("/api/chapters", post(create_chapter))
        .route("/api/chapters/{id}/ui-preset", patch(set_chapter_ui_preset))
        .route(
            "/api/chapters/{id}",
            get(load_chapter).patch(update_chapter).delete(delete_chapter),
        )
        .route("/api/chapters/{id}/topics", get(list_topics))
        .route("/api/topics/{id}/pages", get(list_topic_pages).post(create_topic_page))
        .route(
            "/api/topic-pages/{id}",
            patch(update_topic_page).delete(delete_topic_page),
        )
        .route("/api/topics", post(create_topic))
        .route(
            "/api/topics/{id}",
            get(load_topic).patch(update_topic).delete(delete_topic),
        )
        .route(
            "/api/chapters/{id}/canvas",
            get(load_chapter_canvas).post(save_chapter_canvas),
        )
        .route("/api/page-presets", get(list_page_presets))
        .route("/api/ui-presets", get(list_ui_presets).post(create_ui_preset))
        .route(
            "/api/ui-presets/{id}",
            get(load_ui_preset).patch(update_ui_preset).delete(delete_ui_preset),
        )
        .merge(google::routes())
        .merge(icons::routes())
        .layer(cors)
        .with_state(pool)
}

pub async fn run() {
    tracing_subscriber::fmt::init();

    // development convenience: picks up the repo-root .env (searches cwd and
    // upward). Existing environment variables always win.
    dotenvy::dotenv().ok();

    let db_url = std::env::var("DATABASE_URL").unwrap_or_else(|_| "sqlite:oort.db".to_string());

    let pool = note_core::init_pool(&db_url)
        .await
        .expect("failed to init database");

    // scheduled backups: checks every 15 minutes whether one is due; the
    // refresh token for the web shell lives in the database
    let scheduler_pool = pool.clone();
    tokio::spawn(async move {
        let store = note_core::backup::DbTokenStore::new(scheduler_pool.clone());
        note_core::backup::scheduler_loop(scheduler_pool, std::sync::Arc::new(store)).await;
    });

    let app = build_router(pool);

    let addr = "127.0.0.1:3000";
    let listener = tokio::net::TcpListener::bind(addr).await.unwrap();
    tracing::info!("listening on http://{}", addr);
    axum::serve(listener, app).await.unwrap();
}
