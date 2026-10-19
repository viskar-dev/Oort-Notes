//! Minimal Google Drive v3 client for the app-data space, with just the
//! operations backups need: create (upload), overwrite (update), list,
//! download, delete.
//!
//! Upload protocol follows
//! <https://developers.google.com/workspace/drive/api/guides/manage-uploads>:
//! a single multipart request up to 5 MB, and a resumable session above that
//! (the same split applies to content updates).
//! Files are created under the `appDataFolder` parent
//! (<https://developers.google.com/workspace/drive/api/guides/appdata>), the
//! hidden per-app area of the user's Drive.

use std::time::Duration;

use serde::{Deserialize, Serialize};
use tokio::sync::Mutex;

use super::oauth::{refresh_access_token, TokenResponse};
use super::GoogleConfig;
use crate::error::CoreError;

/// Files at or below this size go up in one multipart request; larger ones
/// use a resumable session (the documented 5 MB boundary, with margin).
const MULTIPART_LIMIT: usize = 4 * 1024 * 1024;

const MAX_ATTEMPTS: usize = 3;

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct DriveFile {
    pub id: String,
    #[serde(default)]
    pub name: String,
    /// Drive reports int64 fields as strings.
    #[serde(default)]
    pub size: Option<String>,
    #[serde(default)]
    pub created_time: Option<String>,
    #[serde(default)]
    pub mime_type: Option<String>,
}

impl DriveFile {
    pub fn size_bytes(&self) -> Option<i64> {
        self.size.as_deref().and_then(|s| s.parse::<i64>().ok())
    }
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
struct FileList {
    #[serde(default)]
    files: Vec<DriveFile>,
}

struct CachedAccess {
    token: String,
    expires_at_ms: i64,
}

/// One authenticated session against Drive. Created per backup run (or per
/// connect), scoped to a single stored refresh token.
pub struct DriveClient {
    http: reqwest::Client,
    config: GoogleConfig,
    refresh_token: String,
    access: Mutex<Option<CachedAccess>>,
}

impl DriveClient {
    pub fn new(config: GoogleConfig, refresh_token: String) -> Self {
        Self {
            http: reqwest::Client::new(),
            config,
            refresh_token,
            access: Mutex::new(None),
        }
    }

    /// Mints (and caches) an access token from the refresh token.
    async fn access_token(&self) -> Result<String, CoreError> {
        let mut guard = self.access.lock().await;
        if let Some(cached) = guard.as_ref() {
            if cached.expires_at_ms > now_ms() {
                return Ok(cached.token.clone());
            }
        }
        let fresh = refresh_access_token(&self.http, &self.config, &self.refresh_token).await?;
        let token = fresh.access_token.clone();
        self.store_access(&mut guard, fresh);
        Ok(token)
    }

    fn store_access(&self, guard: &mut Option<CachedAccess>, response: TokenResponse) {
        let expires_at_ms = response.expires_at_ms();
        *guard = Some(CachedAccess {
            token: response.access_token,
            expires_at_ms,
        });
    }

    /// Sends a request with the current access token, refreshing once on a
    /// 401 and retrying with backoff on rate limits and server errors.
    async fn authed_send(
        &self,
        build: impl Fn(&str) -> reqwest::RequestBuilder,
    ) -> Result<reqwest::Response, CoreError> {
        let mut refreshed = false;
        let mut attempt = 0usize;
        loop {
            let token = self.access_token().await?;
            match build(&token).send().await {
                Ok(response) => {
                    let status = response.status();
                    if status == reqwest::StatusCode::UNAUTHORIZED && !refreshed {
                        refreshed = true;
                        *self.access.lock().await = None;
                        continue;
                    }
                    if (status == reqwest::StatusCode::TOO_MANY_REQUESTS
                        || status.is_server_error())
                        && attempt + 1 < MAX_ATTEMPTS
                    {
                        attempt += 1;
                        tokio::time::sleep(backoff(attempt)).await;
                        continue;
                    }
                    return Ok(response);
                }
                Err(e) if (e.is_timeout() || e.is_connect()) && attempt + 1 < MAX_ATTEMPTS => {
                    attempt += 1;
                    tokio::time::sleep(backoff(attempt)).await;
                }
                Err(e) => return Err(e.into()),
            }
        }
    }

    async fn json_or_error<T: serde::de::DeserializeOwned>(
        &self,
        response: reqwest::Response,
        what: &str,
    ) -> Result<T, CoreError> {
        let status = response.status();
        let body = response.text().await?;
        if !status.is_success() {
            return Err(CoreError::Google(format!("{what} failed ({status}): {body}")));
        }
        serde_json::from_str(&body).map_err(CoreError::from)
    }

    /// Uploads a JSON archive into the app data space.
    pub async fn upload_json(&self, name: &str, bytes: Vec<u8>) -> Result<DriveFile, CoreError> {
        if bytes.len() <= MULTIPART_LIMIT {
            self.upload_multipart(name, bytes).await
        } else {
            self.upload_resumable(name, bytes).await
        }
    }

    /// Overwrites an existing file's content, keeping its Drive id. Returns
    /// `Ok(None)` when the file is already gone (404), so callers can fall
    /// back to creating it instead of failing the whole operation.
    pub async fn update_json(
        &self,
        file_id: &str,
        name: &str,
        bytes: Vec<u8>,
    ) -> Result<Option<DriveFile>, CoreError> {
        if bytes.len() <= MULTIPART_LIMIT {
            self.update_multipart(file_id, name, bytes).await
        } else {
            self.update_resumable(file_id, name, bytes).await
        }
    }

    async fn update_multipart(
        &self,
        file_id: &str,
        name: &str,
        bytes: Vec<u8>,
    ) -> Result<Option<DriveFile>, CoreError> {
        let boundary = format!("oort_{}", super::oauth::random_state());
        let metadata = update_metadata(name);
        let body = multipart_body(&boundary, &metadata, &bytes);
        let content_type = format!("multipart/related; boundary={boundary}");
        let url = format!(
            "{}/files/{}?uploadType=multipart&fields=id,name,size,createdTime",
            self.config.endpoints.upload,
            encode_path_segment(file_id)
        );

        let response = self
            .authed_send(|token| {
                self.http
                    .patch(&url)
                    .bearer_auth(token)
                    .header(reqwest::header::CONTENT_TYPE, content_type.clone())
                    .body(body.clone())
            })
            .await?;
        if response.status() == reqwest::StatusCode::NOT_FOUND {
            return Ok(None);
        }
        self.json_or_error(response, "drive update").await.map(Some)
    }

    async fn update_resumable(
        &self,
        file_id: &str,
        name: &str,
        bytes: Vec<u8>,
    ) -> Result<Option<DriveFile>, CoreError> {
        let init_url = format!(
            "{}/files/{}?uploadType=resumable&fields=id,name,size,createdTime",
            self.config.endpoints.upload,
            encode_path_segment(file_id)
        );
        let metadata = update_metadata(name);
        let total = bytes.len();

        // 1. initiate the update session; the Location header is the URI
        let init = self
            .authed_send(|token| {
                self.http
                    .patch(&init_url)
                    .bearer_auth(token)
                    .header(reqwest::header::CONTENT_TYPE, "application/json; charset=UTF-8")
                    .header("X-Upload-Content-Type", "application/json")
                    .header("X-Upload-Content-Length", total.to_string())
                    .body(metadata.clone())
            })
            .await?;
        let status = init.status();
        if status == reqwest::StatusCode::NOT_FOUND {
            return Ok(None);
        }
        if !status.is_success() {
            let body = init.text().await.unwrap_or_default();
            return Err(CoreError::Google(format!(
                "drive update session failed ({status}): {body}"
            )));
        }
        let session_url = init
            .headers()
            .get(reqwest::header::LOCATION)
            .and_then(|v| v.to_str().ok())
            .map(str::to_string)
            .ok_or_else(|| {
                CoreError::Google("drive update session returned no Location".to_string())
            })?;

        // 2. replace the content in one request (the documented fast path)
        let response = self
            .authed_send(|token| {
                self.http
                    .put(&session_url)
                    .bearer_auth(token)
                    .header(reqwest::header::CONTENT_TYPE, "application/json")
                    .body(bytes.clone())
            })
            .await?;
        self.json_or_error(response, "drive update").await.map(Some)
    }

    async fn upload_multipart(&self, name: &str, bytes: Vec<u8>) -> Result<DriveFile, CoreError> {
        let boundary = format!("oort_{}", super::oauth::random_state());
        let metadata = create_metadata(name);
        let body = multipart_body(&boundary, &metadata, &bytes);
        let content_type = format!("multipart/related; boundary={boundary}");
        let url = format!("{}/files?uploadType=multipart&fields=id,name,size,createdTime", self.config.endpoints.upload);

        let response = self
            .authed_send(|token| {
                self.http
                    .post(&url)
                    .bearer_auth(token)
                    .header(reqwest::header::CONTENT_TYPE, content_type.clone())
                    .body(body.clone())
            })
            .await?;
        self.json_or_error(response, "drive upload").await
    }

    async fn upload_resumable(&self, name: &str, bytes: Vec<u8>) -> Result<DriveFile, CoreError> {
        let init_url = format!(
            "{}/files?uploadType=resumable&fields=id,name,size,createdTime",
            self.config.endpoints.upload
        );
        let metadata = create_metadata(name);
        let total = bytes.len();

        // 1. initiate the session; the response's Location header is the URI
        let init = self
            .authed_send(|token| {
                self.http
                    .post(&init_url)
                    .bearer_auth(token)
                    .header(reqwest::header::CONTENT_TYPE, "application/json; charset=UTF-8")
                    .header("X-Upload-Content-Type", "application/json")
                    .header("X-Upload-Content-Length", total.to_string())
                    .body(metadata.clone())
            })
            .await?;
        let status = init.status();
        if !status.is_success() {
            let body = init.text().await.unwrap_or_default();
            return Err(CoreError::Google(format!(
                "drive upload session failed ({status}): {body}"
            )));
        }
        let session_url = init
            .headers()
            .get(reqwest::header::LOCATION)
            .and_then(|v| v.to_str().ok())
            .map(str::to_string)
            .ok_or_else(|| {
                CoreError::Google("drive upload session returned no Location".to_string())
            })?;

        // 2. upload everything in one request (the documented fast path)
        let response = self
            .authed_send(|token| {
                self.http
                    .put(&session_url)
                    .bearer_auth(token)
                    .header(reqwest::header::CONTENT_TYPE, "application/json")
                    .body(bytes.clone())
            })
            .await?;
        self.json_or_error(response, "drive upload").await
    }

    /// Lists the archives in the app data space, newest first.
    pub async fn list_appdata(&self) -> Result<Vec<DriveFile>, CoreError> {
        let mut url = url::Url::parse(&format!("{}/files", self.config.endpoints.drive))
            .map_err(|e| CoreError::Internal(format!("bad drive endpoint: {e}")))?;
        url.query_pairs_mut()
            .append_pair("spaces", "appDataFolder")
            .append_pair("fields", "files(id,name,size,createdTime,mimeType)")
            .append_pair("orderBy", "createdTime desc")
            .append_pair("pageSize", "1000");

        let response = self
            .authed_send(|token| self.http.get(url.clone()).bearer_auth(token))
            .await?;
        let list: FileList = self.json_or_error(response, "drive list").await?;
        Ok(list.files)
    }

    pub async fn download(&self, file_id: &str) -> Result<Vec<u8>, CoreError> {
        let url = format!(
            "{}/files/{}?alt=media",
            self.config.endpoints.drive,
            encode_path_segment(file_id)
        );
        let response = self
            .authed_send(|token| self.http.get(&url).bearer_auth(token))
            .await?;
        let status = response.status();
        if !status.is_success() {
            let body = response.text().await.unwrap_or_default();
            return Err(CoreError::Google(format!(
                "drive download failed ({status}): {body}"
            )));
        }
        Ok(response.bytes().await?.to_vec())
    }

    pub async fn delete(&self, file_id: &str) -> Result<(), CoreError> {
        let url = format!(
            "{}/files/{}",
            self.config.endpoints.drive,
            encode_path_segment(file_id)
        );
        let response = self
            .authed_send(|token| self.http.delete(&url).bearer_auth(token))
            .await?;
        let status = response.status();
        // a file the user already removed in another client is fine
        if !status.is_success() && status != reqwest::StatusCode::NOT_FOUND {
            let body = response.text().await.unwrap_or_default();
            return Err(CoreError::Google(format!(
                "drive delete failed ({status}): {body}"
            )));
        }
        Ok(())
    }
}

fn now_ms() -> i64 {
    std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .map(|d| d.as_millis() as i64)
        .unwrap_or(0)
}

fn backoff(attempt: usize) -> Duration {
    Duration::from_millis(500 * (1 << attempt)) // 1s, 2s, ...
}

/// File metadata for a new archive: named, and parented into the hidden app
/// data folder so it never shows up in the user's Drive browsing.
fn create_metadata(name: &str) -> String {
    serde_json::json!({
        "name": name,
        "parents": ["appDataFolder"],
        "mimeType": "application/json",
    })
    .to_string()
}

/// Metadata for a content update: the file keeps its parent, so only the
/// name is sent.
fn update_metadata(name: &str) -> String {
    serde_json::json!({
        "name": name,
        "mimeType": "application/json",
    })
    .to_string()
}

/// RFC 2387 multipart/related body: metadata part first, then the media.
fn multipart_body(boundary: &str, metadata: &str, media: &[u8]) -> Vec<u8> {
    let mut body = Vec::with_capacity(media.len() + metadata.len() + 256);
    body.extend_from_slice(format!("--{boundary}\r\n").as_bytes());
    body.extend_from_slice(b"Content-Type: application/json; charset=UTF-8\r\n\r\n");
    body.extend_from_slice(metadata.as_bytes());
    body.extend_from_slice(format!("\r\n--{boundary}\r\n").as_bytes());
    body.extend_from_slice(b"Content-Type: application/json\r\n\r\n");
    body.extend_from_slice(media);
    body.extend_from_slice(format!("\r\n--{boundary}--").as_bytes());
    body
}

/// Percent-encodes anything outside the URL-safe set so a hostile file id
/// cannot break out of its path segment.
fn encode_path_segment(segment: &str) -> String {
    let mut out = String::with_capacity(segment.len());
    for byte in segment.bytes() {
        if byte.is_ascii_alphanumeric() || matches!(byte, b'-' | b'_' | b'.' | b'~') {
            out.push(byte as char);
        } else {
            out.push_str(&format!("%{byte:02X}"));
        }
    }
    out
}
