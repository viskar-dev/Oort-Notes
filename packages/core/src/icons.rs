//! Icon search + icon-set data for the canvas icon finder, straight out of
//! the core: the desktop gets icon search without any note server running.
//!
//! The frontend never talks to api.iconify.design directly — everything goes
//! through this module (the desktop's `icon_search` / `icon_set_data` Tauri
//! commands forward invoke calls here; the note server's `/api/icons/*`
//! routes mirror the same contract for the web UI and its e2e mocks).
//! Responses are cached in memory: icon data is immutable and repeated
//! queries (every keystroke of a search) would otherwise re-hit the public
//! API.

use std::collections::HashMap;
use std::sync::{Mutex, OnceLock};
use std::time::Duration;

use crate::error::CoreError;

const ICONIFY: &str = "https://api.iconify.design";
/// generous but binding: the public API normally answers far faster
const TIMEOUT: Duration = Duration::from_secs(10);
/// entries kept in the cache; icon payloads are a few KB each
const CACHE_MAX: usize = 400;
/// the iconify search hard-caps at 994 results
const SEARCH_CAP: u32 = 994;

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

fn client() -> Result<&'static reqwest::Client, CoreError> {
    static CLIENT: OnceLock<reqwest::Client> = OnceLock::new();
    Ok(CLIENT.get_or_init(|| {
        reqwest::Client::builder()
            .timeout(TIMEOUT)
            .build()
            .expect("static iconify http client")
    }))
}

async fn fetch_iconify_json(
    path: String,
    query: &[(&str, &String)],
) -> Result<serde_json::Value, CoreError> {
    let resp = client()?
        .get(format!("{ICONIFY}{path}"))
        .query(query)
        .send()
        .await?;
    if !resp.status().is_success() {
        return Err(CoreError::External(format!(
            "iconify returned {}",
            resp.status()
        )));
    }
    Ok(resp.json::<serde_json::Value>().await?)
}

/// iconify set/component naming: lowercase ascii letters, digits, dashes.
pub fn is_valid_component(s: &str) -> bool {
    !s.is_empty()
        && s.len() <= 64
        && s.chars().all(|c| c.is_ascii_lowercase() || c.is_ascii_digit() || c == '-')
}

/// Trim out every name that's not a valid iconify component — junk entries
/// (stale drag ids, whitespace) are dropped rather than failing the slice.
fn valid_names(names: &[String]) -> Vec<String> {
    names
        .iter()
        .map(|s| s.trim().to_owned())
        .filter(|s| !s.is_empty() && is_valid_component(s))
        .collect()
}

/// Search iconify for icon ids (`prefix:name`) matching the term. `limit`
/// defaults to and clamps into 1..=994 (the public API's own cap).
pub async fn search(query: &str, limit: Option<u32>) -> Result<serde_json::Value, CoreError> {
    let term = query.trim();
    if term.is_empty() {
        return Err(CoreError::External("empty icon search query".into()));
    }
    let limit = limit.unwrap_or(SEARCH_CAP).clamp(1, SEARCH_CAP);
    let key = format!("search|{limit}|{term}");
    if let Some(value) = cached(&key) {
        return Ok(value);
    }
    let value = fetch_iconify_json(
        "/search".into(),
        &[("query", &term.to_string()), ("limit", &limit.to_string())],
    )
    .await?;
    cache_put(key, &value);
    Ok(value)
}

/// Fetch a slice of an iconify set: `prefix` names the set (e.g. `lucide`),
/// `names` the wanted icon list (empty = the whole set).
pub async fn set_data(
    prefix: &str,
    names: &[String],
) -> Result<serde_json::Value, CoreError> {
    if !is_valid_component(prefix) {
        return Err(CoreError::External("bad icon set prefix".into()));
    }
    let names = valid_names(names);
    if names.len() > 500 {
        return Err(CoreError::External("too many icons requested".into()));
    }
    let key = format!("data|{prefix}|{}", names.join(","));
    if let Some(value) = cached(&key) {
        return Ok(value);
    }
    let names_csv = names.join(",");
    let value = if names.is_empty() {
        // no names = the full set: no query params at all
        fetch_iconify_json(format!("/{prefix}.json"), &[]).await?
    } else {
        fetch_iconify_json(format!("/{prefix}.json"), &[("icons", &names_csv)]).await?
    };
    cache_put(key, &value);
    Ok(value)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn component_names_allow_only_lowercase_digits_dashes() {
        assert!(is_valid_component("simple-line"));
        assert!(is_valid_component("v2"));
        assert!(!is_valid_component("Upper"));
        assert!(!is_valid_component("has/slash"));
        assert!(!is_valid_component("has space"));
        assert!(!is_valid_component(""));
        assert!(!is_valid_component(&"a".repeat(65)));
    }

    #[test]
    fn valid_names_filter_trims_and_drops_junk() {
        let names = vec![
            "  arrow-left ".to_owned(),
            String::new(),
            "BAD".to_owned(),
            "star".to_owned(),
        ];
        assert_eq!(valid_names(&names), vec!["arrow-left".to_owned(), "star".to_owned()]);
    }

    #[tokio::test]
    async fn empty_search_query_is_rejected_before_hitting_the_network() {
        let err = search("   ", None).await.unwrap_err();
        assert!(matches!(err, CoreError::External(_)));
    }

    #[tokio::test]
    async fn bad_prefix_is_rejected_before_hitting_the_network() {
        let err = set_data("has/slash", &[]).await.unwrap_err();
        assert!(matches!(err, CoreError::External(_)));
    }
}
