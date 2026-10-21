//! Icon search + icon-set data proxies for the canvas icon finder.
//!
//! The frontend never talks to api.iconify.design directly — everything goes
//! through the note server so the running app stays on one network hop and
//! e2e tests can mock the whole surface locally. Responses are cached in
//! memory: icon data is immutable and repeated queries (every keystroke of a
//! search) would otherwise re-hit the public API.

use std::collections::HashMap;
use std::sync::{Mutex, OnceLock};
use std::time::Duration;

use axum::{
    extract::{Path, Query},
    http::StatusCode,
    routing::get,
    Json, Router,
};
use serde::Deserialize;
use sqlx::SqlitePool;

const ICONIFY: &str = "https://api.iconify.design";
/// generous but binding: the public API normally answers far faster
const TIMEOUT: Duration = Duration::from_secs(10);
/// entries kept in the cache; icon payloads are a few KB each
const CACHE_MAX: usize = 400;

fn cache() -> &'static Mutex<HashMap<String, serde_json::Value>> {
    static CACHE: OnceLock<Mutex<HashMap<String, serde_json::Value>>> = OnceLock::new();
    CACHE.get_or_init(|| Mutex::new(HashMap::new()))
}

fn cached(key: &str) -> Option<serde_json::Value> {
    let map = cache().lock().ok()?;
    map.get(key).cloned()
}

fn cache_put(key: String, value: &serde_json::Value) {
    if let Ok(mut map) = cache().lock() {
        if map.len() >= CACHE_MAX {
            map.clear();
        }
        map.insert(key, value.clone());
    }
}

async fn fetch_iconify_json(
    path: String,
    query: &[(&str, &String)],
) -> Result<serde_json::Value, (StatusCode, String)> {
    let client = reqwest::Client::builder()
        .timeout(TIMEOUT)
        .build()
        .map_err(|e| (StatusCode::INTERNAL_SERVER_ERROR, e.to_string()))?;
    let resp = client
        .get(format!("{ICONIFY}{path}"))
        .query(query)
        .send()
        .await
        .map_err(|e| (StatusCode::BAD_GATEWAY, format!("iconify request failed: {e}")))?;
    if !resp.status().is_success() {
        return Err((
            StatusCode::BAD_GATEWAY,
            format!("iconify returned {}", resp.status()),
        ));
    }
    resp.json()
        .await
        .map_err(|e| (StatusCode::BAD_GATEWAY, format!("iconify body: {e}")))
}

fn is_valid_component(s: &str) -> bool {
    !s.is_empty()
        && s.len() <= 64
        && s.chars().all(|c| c.is_ascii_lowercase() || c.is_ascii_digit() || c == '-')
}

#[derive(Deserialize)]
pub struct SearchQuery {
    q: String,
    /// the iconify search hard-caps at 994 results; pass the cap by default
    limit: Option<u32>,
}

pub async fn search(
    Query(q): Query<SearchQuery>,
) -> Result<Json<serde_json::Value>, (StatusCode, String)> {
    let term = q.q.trim();
    if term.is_empty() {
        return Err((StatusCode::BAD_REQUEST, "empty query".into()));
    }
    let limit = q.limit.unwrap_or(994).clamp(1, 994);
    let key = format!("search|{limit}|{term}");
    if let Some(value) = cached(&key) {
        return Ok(Json(value));
    }
    let limit_s = limit.to_string();
    let term_s = term.to_string();
    let value = fetch_iconify_json("/search".into(), &[("query", &term_s), ("limit", &limit_s)]).await?;
    cache_put(key, &value);
    Ok(Json(value))
}

#[derive(Deserialize)]
pub struct IconDataQuery {
    /// comma-separated icon names; empty = the whole set
    icons: Option<String>,
}

pub async fn icon_data(
    Path(prefix): Path<String>,
    Query(q): Query<IconDataQuery>,
) -> Result<Json<serde_json::Value>, (StatusCode, String)> {
    if !is_valid_component(&prefix) {
        return Err((StatusCode::BAD_REQUEST, "bad prefix".into()));
    }
    let names: Vec<String> = q
        .icons
        .unwrap_or_default()
        .split(',')
        .map(str::trim)
        .filter(|s| !s.is_empty() && is_valid_component(s))
        .map(ToOwned::to_owned)
        .collect();
    if names.len() > 500 {
        return Err((StatusCode::BAD_REQUEST, "too many icons requested".into()));
    }
    let key = format!("data|{prefix}|{}", names.join(","));
    if let Some(value) = cached(&key) {
        return Ok(Json(value));
    }
    let value = if names.is_empty() {
        // no names = the full set: no query params at all
        fetch_iconify_json(format!("/{prefix}.json"), &[]).await?
    } else {
        let names_csv = names.join(",");
        fetch_iconify_json(format!("/{prefix}.json"), &[("icons", &names_csv)]).await?
    };
    cache_put(key, &value);
    Ok(Json(value))
}

pub fn routes() -> Router<SqlitePool> {
    Router::new()
        .route("/api/icons/search", get(search))
        .route("/api/icons/data/{prefix}", get(icon_data))
}
