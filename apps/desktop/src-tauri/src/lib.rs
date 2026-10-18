use note_core::{repo, Chapter, ChapterCanvas, Notebook, PagePreset, Topic, TopicPage, UiPreset};
use sqlx::SqlitePool;
use tauri::Manager;
use tauri::State;

type R<T> = Result<T, String>;

fn map(e: note_core::CoreError) -> String {
    e.to_string()
}

// =========================
// Notebooks
// =========================

#[tauri::command]
async fn create_notebook(
    name: String,
    label: Option<String>,
    description: Option<String>,
    icon: Option<String>,
    pool: State<'_, SqlitePool>,
) -> R<Notebook> {
    repo::create_notebook(
        &pool,
        &repo::new_id(),
        &name,
        label.as_deref(),
        description.as_deref(),
        icon.as_deref(),
    )
    .await
    .map_err(map)
}

#[tauri::command]
async fn list_notebooks(
    filter: Option<String>,
    sort: Option<String>,
    q: Option<String>,
    pool: State<'_, SqlitePool>,
) -> R<Vec<Notebook>> {
    repo::list_notebooks(
        &pool,
        filter.as_deref().unwrap_or("all"),
        sort.as_deref().unwrap_or("edited"),
        q.as_deref().filter(|s| !s.trim().is_empty()),
    )
    .await
    .map_err(map)
}

#[tauri::command]
async fn update_notebook_flags(
    id: String,
    name: Option<String>,
    is_favorite: Option<bool>,
    archived: Option<bool>,
    pool: State<'_, SqlitePool>,
) -> R<Notebook> {
    repo::update_notebook_flags(
        &pool,
        &id,
        name.as_deref(),
        is_favorite,
        archived,
    )
    .await
    .map_err(map)
}

#[tauri::command]
async fn load_notebook(id: String, pool: State<'_, SqlitePool>) -> R<Notebook> {
    repo::load_notebook(&pool, &id).await.map_err(map)
}

#[tauri::command]
async fn delete_notebook(id: String, pool: State<'_, SqlitePool>) -> R<()> {
    repo::soft_delete_notebook(&pool, &id).await.map_err(map)
}

// =========================
// Chapters
// =========================

#[tauri::command]
async fn create_chapter(
    notebook_id: String,
    name: String,
    canvas_type: String,
    page_preset_id: Option<String>,
    page_width: Option<i64>,
    page_height: Option<i64>,
    scroll_width: Option<i64>,
    background: Option<String>,
    ui_preset_id: Option<String>,
    pool: State<'_, SqlitePool>,
) -> R<Chapter> {
    repo::create_chapter(
        &pool,
        &repo::new_id(),
        &notebook_id,
        &name,
        &canvas_type,
        page_preset_id.as_deref(),
        page_width,
        page_height,
        scroll_width,
        background.as_deref(),
        ui_preset_id.as_deref(),
    )
    .await
    .map_err(map)
}

#[tauri::command]
async fn set_chapter_ui_preset(
    id: String,
    ui_preset_id: Option<String>,
    pool: State<'_, SqlitePool>,
) -> R<Chapter> {
    repo::set_chapter_ui_preset(&pool, &id, ui_preset_id.as_deref())
        .await
        .map_err(map)
}

#[tauri::command]
async fn update_chapter(id: String, name: String, pool: State<'_, SqlitePool>) -> R<Chapter> {
    let name = name.trim();
    if name.is_empty() {
        return Err(map(note_core::CoreError::Internal(
            "name is required".to_string(),
        )));
    }
    repo::update_chapter(&pool, &id, name).await.map_err(map)
}

#[tauri::command]
async fn list_chapters(notebook_id: String, pool: State<'_, SqlitePool>) -> R<Vec<Chapter>> {
    repo::list_chapters(&pool, &notebook_id).await.map_err(map)
}

#[tauri::command]
async fn load_chapter(id: String, pool: State<'_, SqlitePool>) -> R<Chapter> {
    repo::load_chapter(&pool, &id).await.map_err(map)
}

#[tauri::command]
async fn delete_chapter(id: String, pool: State<'_, SqlitePool>) -> R<()> {
    repo::soft_delete_chapter(&pool, &id).await.map_err(map)
}

// =========================
// Topics
// =========================

#[tauri::command]
async fn create_topic(
    chapter_id: String,
    name: String,
    id: Option<String>,
    pool: State<'_, SqlitePool>,
) -> R<Topic> {
    repo::create_topic(&pool, id.as_deref().unwrap_or(&repo::new_id()), &chapter_id, &name)
        .await
        .map_err(map)
}

#[tauri::command]
async fn list_topics(chapter_id: String, pool: State<'_, SqlitePool>) -> R<Vec<Topic>> {
    repo::list_topics(&pool, &chapter_id).await.map_err(map)
}

#[tauri::command]
async fn update_topic(
    id: String,
    name: Option<String>,
    position: Option<i32>,
    pool: State<'_, SqlitePool>,
) -> R<Topic> {
    repo::update_topic(&pool, &id, name.as_deref(), position)
        .await
        .map_err(map)
}

#[tauri::command]
async fn load_topic(id: String, pool: State<'_, SqlitePool>) -> R<Topic> {
    repo::load_topic(&pool, &id).await.map_err(map)
}

#[tauri::command]
async fn delete_topic(id: String, pool: State<'_, SqlitePool>) -> R<()> {
    repo::soft_delete_topic(&pool, &id).await.map_err(map)
}

// =========================
// Topic pages (multi-page topics)
// =========================

#[tauri::command]
async fn list_topic_pages(topic_id: String, pool: State<'_, SqlitePool>) -> R<Vec<TopicPage>> {
    repo::list_topic_pages(&pool, &topic_id).await.map_err(map)
}

#[tauri::command]
async fn create_topic_page(
    topic_id: String,
    name: String,
    id: Option<String>,
    pool: State<'_, SqlitePool>,
) -> R<TopicPage> {
    repo::create_topic_page(&pool, id.as_deref().unwrap_or(&repo::new_id()), &topic_id, &name)
        .await
        .map_err(map)
}

#[tauri::command]
async fn update_topic_page(
    id: String,
    name: Option<String>,
    position: Option<i32>,
    pool: State<'_, SqlitePool>,
) -> R<TopicPage> {
    repo::update_topic_page(&pool, &id, name.as_deref(), position)
        .await
        .map_err(map)
}

#[tauri::command]
async fn delete_topic_page(id: String, pool: State<'_, SqlitePool>) -> R<()> {
    repo::delete_topic_page(&pool, &id).await.map_err(map)
}

// =========================
// Chapter canvas
// =========================

#[tauri::command]
async fn load_chapter_canvas(chapter_id: String, pool: State<'_, SqlitePool>) -> R<ChapterCanvas> {
    repo::load_chapter_canvas(&pool, &chapter_id).await.map_err(map)
}

#[tauri::command]
async fn save_chapter_canvas(
    chapter_id: String,
    snapshot: serde_json::Value,
    tldraw_version: Option<String>,
    pool: State<'_, SqlitePool>,
) -> R<()> {
    repo::save_chapter_canvas(&pool, &chapter_id, &snapshot, tldraw_version.as_deref())
        .await
        .map_err(map)
}

// =========================
// Page presets
// =========================

#[tauri::command]
async fn list_page_presets(pool: State<'_, SqlitePool>) -> R<Vec<PagePreset>> {
    repo::list_page_presets(&pool).await.map_err(map)
}

// =========================
// UI presets
// =========================

#[tauri::command]
async fn list_ui_presets(pool: State<'_, SqlitePool>) -> R<Vec<UiPreset>> {
    repo::list_ui_presets(&pool).await.map_err(map)
}

#[tauri::command]
async fn create_ui_preset(
    name: String,
    config: serde_json::Value,
    pool: State<'_, SqlitePool>,
) -> R<UiPreset> {
    repo::create_ui_preset(&pool, &repo::new_id(), &name, &config)
        .await
        .map_err(map)
}

#[tauri::command]
async fn load_ui_preset(id: String, pool: State<'_, SqlitePool>) -> R<UiPreset> {
    repo::load_ui_preset(&pool, &id).await.map_err(map)
}

#[tauri::command]
async fn update_ui_preset(
    id: String,
    name: Option<String>,
    config: Option<serde_json::Value>,
    pool: State<'_, SqlitePool>,
) -> R<UiPreset> {
    repo::update_ui_preset(&pool, &id, name.as_deref(), config.as_ref())
        .await
        .map_err(map)
}

#[tauri::command]
async fn delete_ui_preset(id: String, pool: State<'_, SqlitePool>) -> R<()> {
    repo::delete_ui_preset(&pool, &id).await.map_err(map)
}

// =========================
// Google Drive backup (desktop shell)
// =========================
//
// The desktop flow talks to Google directly: consent screen in the system
// browser, redirect to a loopback listener, PKCE proof, refresh token in the
// OS keychain. All heavy lifting (token exchange, Drive uploads, archives)
// lives in note-core; only the loopback plumbing is here.

use note_core::backup;
use note_core::google::{self, DriveClient, GoogleConfig, Pkce};
use tokio::io::{AsyncReadExt, AsyncWriteExt};

fn browser_tab_html() -> String {
    "<!doctype html><html><head><meta charset=\"utf-8\"><title>Oort Notes</title></head>\
     <body style=\"font-family: sans-serif; text-align: center; padding-top: 4rem\">\
     <h2>You're connected</h2><p>You can close this tab and return to the app.</p>\
     </body></html>"
      .to_string()
}

/// Percent-decoding for the redirect query parameters.
fn urldecode(s: &str) -> String {
    let b = s.as_bytes();
    let mut out: Vec<u8> = Vec::with_capacity(b.len());
    let mut i = 0usize;
    while i < b.len() {
        if b[i] == b'%' && i + 2 < b.len() {
            if let Ok(v) = u8::from_str_radix(std::str::from_utf8(&b[i + 1..i + 3]).unwrap_or(""), 16)
            {
                out.push(v);
                i += 3;
                continue;
            }
        }
        out.push(if b[i] == b'+' { b' ' } else { b[i] });
        i += 1;
    }
    String::from_utf8_lossy(&out).into_owned()
}

/// Serves the loopback redirect: answers every request (so the tab finishes
/// loading) and returns the `code` once the right `state` comes back.
async fn wait_for_code(
    listener: tokio::net::TcpListener,
    expected_state: &str,
) -> Result<String, String> {
    let deadline = std::time::Duration::from_secs(300);
    let mut buf = [0u8; 8192];
    loop {
        let (mut stream, _) = tokio::time::timeout(deadline, listener.accept())
            .await
            .map_err(|_| "timed out waiting for the browser redirect".to_string())?
            .map_err(|e| e.to_string())?;
        let read = tokio::time::timeout(std::time::Duration::from_secs(5), stream.read(&mut buf))
            .await
            .map_err(|_| "browser redirect read timed out".to_string())?
            .map_err(|e| e.to_string())?;
        let text = String::from_utf8_lossy(&buf[..read]);
        let target = text.split_whitespace().nth(1).unwrap_or("").to_string();

        // answer the browser so the tab doesn't hang
        let response = if target.contains("favicon") {
            "HTTP/1.1 404 Not Found\r\nContent-Length: 0\r\nConnection: close\r\n\r\n".to_string()
        } else {
            format!(
                "HTTP/1.1 200 OK\r\nContent-Type: text/html; charset=utf-8\r\nContent-Length: {}\r\nConnection: close\r\n\r\n{}",
                browser_tab_html().len(),
                browser_tab_html()
            )
        };
        let _ = stream.write_all(response.as_bytes()).await;
        let _ = stream.shutdown().await;
        if target.contains("favicon") {
            continue;
        }

        let query = target.split('?').nth(1).unwrap_or("");
        let mut code = None;
        let mut state = None;
        for pair in query.split('&') {
            if let Some(v) = pair.strip_prefix("code=") {
                code = Some(urldecode(v));
            }
            if let Some(v) = pair.strip_prefix("state=") {
                state = Some(urldecode(v));
            }
        }
        if let (Some(c), Some(s)) = (code, state) {
            if s == expected_state {
                return Ok(c);
            }
        }
        // stray request (wrong state) — keep listening
    }
}

#[derive(serde::Serialize)]
struct GoogleStatusView {
    connected: bool,
    email: Option<String>,
    configured: bool,
}

#[tauri::command]
async fn google_status(pool: State<'_, SqlitePool>) -> R<GoogleStatusView> {
    let config = GoogleConfig::load(&pool).await.map_err(map)?;
    let account = repo::load_google_account(&pool).await.map_err(map)?;
    // keychain reads can be slow (Secret Service over dbus); keep them off
    // the async threads, and treat keychain errors as "not connected"
    let token = tokio::task::spawn_blocking(backup::keyring_store::load_refresh_token)
        .await
        .map_err(|e| e.to_string())
        .ok()
        .and_then(|r| r.ok())
        .flatten();
    Ok(GoogleStatusView {
        connected: account.is_some() && token.as_ref().is_some_and(|t| !t.is_empty()),
        email: account.and_then(|a| a.email),
        configured: config.is_some(),
    })
}

#[derive(serde::Serialize)]
struct GoogleConfigView {
    client_id: Option<String>,
    has_secret: bool,
}

#[tauri::command]
async fn google_get_config(pool: State<'_, SqlitePool>) -> R<GoogleConfigView> {
    let config = GoogleConfig::load(&pool).await.map_err(map)?;
    Ok(GoogleConfigView {
        client_id: config.as_ref().map(|c| c.client_id.clone()),
        has_secret: config
            .map(|c| c.client_secret.is_some_and(|s| !s.trim().is_empty()))
            .unwrap_or(false),
    })
}

#[tauri::command]
async fn google_set_config(
    client_id: Option<String>,
    // accepted for transport symmetry with the web shell but ignored:
    // desktop uses a public "Desktop app" OAuth credential (PKCE proves the
    // request), so no secret is required, prompted for, or stored
    _client_secret: Option<String>,
    pool: State<'_, SqlitePool>,
) -> R<()> {
    if let Some(id) = client_id {
        let id = id.trim();
        if id.is_empty() {
            return Err("client id cannot be empty".to_string());
        }
        repo::set_setting(&pool, "google_client_id", id)
            .await
            .map_err(map)?;
    }
    Ok(())
}

/// Loads the stored auth for desktop: credentials from the database, the
/// refresh token from the OS keychain.
async fn desktop_auth(pool: &SqlitePool) -> Result<backup::BackupAuth, String> {
    let Some(config) = GoogleConfig::load(pool).await.map_err(map)? else {
        return Err("google client id is not configured — set it in Settings → Backup".to_string());
    };
    let token = tokio::task::spawn_blocking(backup::keyring_store::load_refresh_token)
        .await
        .map_err(|e| e.to_string())?
        .map_err(map)?
        .filter(|t| !t.is_empty());
    let refresh_token =
        token.ok_or_else(|| "google drive is not connected".to_string())?;
    Ok(backup::BackupAuth {
        config,
        refresh_token,
    })
}

#[tauri::command]
async fn google_connect(pool: State<'_, SqlitePool>) -> R<GoogleStatusView> {
    let config = GoogleConfig::load(&pool)
        .await
        .map_err(map)?
        .ok_or_else(|| "google client id is not configured — set it in Settings → Backup".to_string())?;
    config.configured().map_err(map)?;

    // 1. loopback listener picks a free port; that URL is the redirect_uri
    let listener = tokio::net::TcpListener::bind("127.0.0.1:0")
        .await
        .map_err(|e| e.to_string())?;
    let port = listener.local_addr().map_err(|e| e.to_string())?.port();
    let redirect_uri = format!("http://127.0.0.1:{port}");

    // 2. consent screen in the user's system browser
    let pkce = Pkce::generate();
    let state_param = google::oauth::random_state();
    let url = google::build_auth_url(&config, &redirect_uri, &state_param, &pkce).map_err(map)?;
    tauri_plugin_opener::open_url(&url, None::<&str>)
        .map_err(|e| format!("could not open the browser: {e}"))?;

    // 3. wait for the redirect with the authorization code
    let code = wait_for_code(listener, &state_param).await?;

    // 4. exchange the code; desktop clients prove themselves with PKCE
    let http = reqwest::Client::new();
    let tokens = google::exchange_code(&http, &config, &redirect_uri, &code, &pkce.verifier)
        .await
        .map_err(map)?;
    let refresh_token = tokens
        .refresh_token
        .ok_or_else(|| "google did not return a refresh token".to_string())?;
    let email = google::fetch_userinfo_email(&http, &config, &tokens.access_token).await;

    // 5. refresh token → OS keychain; identity → database (no secret there)
    let token_for_keyring = refresh_token.clone();
    tokio::task::spawn_blocking(move || backup::keyring_store::store_refresh_token(&token_for_keyring))
        .await
        .map_err(|e| e.to_string())?
        .map_err(map)?;
    repo::save_google_account(&pool, email.as_deref(), None, google::SCOPES)
        .await
        .map_err(map)?;

    // 6. first backup right away, so the user sees the pipeline work; a
    // failure lands in the history and the scheduler retries later
    let settings = repo::load_backup_settings(&pool).await.map_err(map)?;
    let client = DriveClient::new(config, refresh_token);
    if let Err(e) = backup::run_backup(&pool, &client, settings.keep_count).await {
        tracing::warn!("first backup after connect failed: {e}");
    }

    Ok(GoogleStatusView {
        connected: true,
        email,
        configured: true,
    })
}

#[tauri::command]
async fn google_disconnect(pool: State<'_, SqlitePool>) -> R<()> {
    // revoke is best-effort: a dead network must not strand the local state
    if let Some(config) = GoogleConfig::load(&pool).await.map_err(map)? {
        if let Ok(Some(token)) = tokio::task::spawn_blocking(backup::keyring_store::load_refresh_token)
            .await
            .map_err(|e| e.to_string())?
        {
            let http = reqwest::Client::new();
            let _ = google::revoke_token(&http, &config, &token).await;
        }
    }
    tokio::task::spawn_blocking(backup::keyring_store::delete_refresh_token)
        .await
        .map_err(|e| e.to_string())?
        .map_err(map)?;
    repo::clear_google_account(&pool).await.map_err(map)?;
    Ok(())
}

#[tauri::command]
async fn get_backup_settings(pool: State<'_, SqlitePool>) -> R<note_core::BackupSettings> {
    repo::load_backup_settings(&pool).await.map_err(map)
}

#[tauri::command]
async fn update_backup_settings(
    settings: note_core::BackupSettings,
    pool: State<'_, SqlitePool>,
) -> R<note_core::BackupSettings> {
    repo::save_backup_settings(&pool, &settings)
        .await
        .map_err(map)
}

#[tauri::command]
async fn run_backup_now(pool: State<'_, SqlitePool>) -> R<backup::BackupRun> {
    let auth = desktop_auth(&pool).await?;
    let settings = repo::load_backup_settings(&pool).await.map_err(map)?;
    let client = DriveClient::new(auth.config, auth.refresh_token);
    backup::run_backup(&pool, &client, settings.keep_count)
        .await
        .map_err(map)
}

#[tauri::command]
async fn list_backups(pool: State<'_, SqlitePool>) -> R<Vec<backup::BackupListEntry>> {
    let client = match desktop_auth(&pool).await {
        Ok(auth) => Some(DriveClient::new(auth.config, auth.refresh_token)),
        Err(_) => None,
    };
    backup::list_merged(&pool, client.as_ref())
        .await
        .map_err(map)
}

#[tauri::command]
async fn restore_backup(
    drive_file_id: String,
    pool: State<'_, SqlitePool>,
) -> R<backup::RestoreResult> {
    let auth = desktop_auth(&pool).await?;
    let client = DriveClient::new(auth.config, auth.refresh_token);
    backup::restore_backup(&pool, &client, &drive_file_id)
        .await
        .map_err(map)
}

// =========================
// App
// =========================

#[tauri::command]
async fn ping() -> R<String> {
    note_core::ping().await.map_err(map)
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    // development convenience: picks up the repo-root .env (searches cwd and
    // upward). Existing environment variables always win.
    dotenvy::dotenv().ok();

    tauri::Builder::default()
        .plugin(tauri_plugin_sql::Builder::default().build())
        .setup(|app| {
            let pool = tauri::async_runtime::block_on(async {
                note_core::init_pool("sqlite:oort.db")
                    .await
                    .expect("failed to init database")
            });
            app.manage(pool.clone());

            // scheduled backups: the refresh token lives in the OS keychain
            let scheduler_pool = pool.clone();
            tauri::async_runtime::spawn(async move {
                let store = backup::keyring_store::KeyringTokenStore::new(scheduler_pool.clone());
                backup::scheduler_loop(scheduler_pool, std::sync::Arc::new(store)).await;
            });
            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            ping,
            create_notebook,
            list_notebooks,
            update_notebook_flags,
            load_notebook,
            delete_notebook,
            create_chapter,
            list_chapters,
            load_chapter,
            delete_chapter,
            set_chapter_ui_preset,
            update_chapter,
            create_topic,
            list_topics,
            load_topic,
            update_topic,
            delete_topic,
            list_topic_pages,
            create_topic_page,
            update_topic_page,
            delete_topic_page,
            load_chapter_canvas,
            save_chapter_canvas,
            list_page_presets,
            list_ui_presets,
            create_ui_preset,
            load_ui_preset,
            update_ui_preset,
            delete_ui_preset,
            google_status,
            google_get_config,
            google_set_config,
            google_connect,
            google_disconnect,
            get_backup_settings,
            update_backup_settings,
            run_backup_now,
            list_backups,
            restore_backup,
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
