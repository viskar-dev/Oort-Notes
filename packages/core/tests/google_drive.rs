//! Drive client + end-to-end backup runs against a local mock of the Google
//! OAuth and Drive APIs (a raw TCP server, so no HTTP framework is needed).
//!
//! Covers: multipart vs resumable upload selection, list/download/delete,
//! 401 → token refresh → retry, the OAuth token forms, and `run_due_backup`
//! including keep-count pruning.

use note_core::backup::{run_backup, run_due_backup};
use note_core::google::{
    exchange_code, fetch_userinfo_email, refresh_access_token, DriveClient, Endpoints, GoogleConfig,
};
use note_core::init_memory_pool;
use note_core::repo::{self, new_id};
use std::net::SocketAddr;
use std::sync::atomic::{AtomicBool, AtomicU64, Ordering};
use std::sync::{Arc, Mutex};
use tokio::io::AsyncReadExt;
use tokio::net::{TcpListener, TcpStream};

// ---------------------------------------------------------------------
// Mock server
// ---------------------------------------------------------------------

#[derive(Debug, Clone)]
struct Recorded {
    method: String,
    path: String,
    auth: Option<String>,
    content_type: Option<String>,
    body: Vec<u8>,
}

#[derive(Debug, Clone)]
struct MockFile {
    id: String,
    name: String,
    bytes: Vec<u8>,
}

#[derive(Default)]
struct MockState {
    requests: Mutex<Vec<Recorded>>,
    files: Mutex<Vec<MockFile>>,
    /// name staged by the resumable-init request, consumed by the session PUT
    pending_name: Mutex<Option<String>>,
    token_calls: std::sync::atomic::AtomicU64,
    file_ids: AtomicU64,
    /// respond 401 to the next drive request (never to /token)
    reject_once: AtomicBool,
}

impl MockState {
    fn record(&self, r: Recorded) {
        self.requests.lock().unwrap().push(r);
    }
    fn next_file_id(&self) -> String {
        let n = self.file_ids.fetch_add(1, Ordering::SeqCst) + 1;
        format!("file-{n}")
    }
    fn requests_snapshot(&self) -> Vec<Recorded> {
        self.requests.lock().unwrap().clone()
    }
    fn files_snapshot(&self) -> Vec<MockFile> {
        self.files.lock().unwrap().clone()
    }
}

fn find_subslice(hay: &[u8], needle: &[u8]) -> Option<usize> {
    if needle.is_empty() || hay.len() < needle.len() {
        return None;
    }
    hay.windows(needle.len()).position(|w| w == needle)
}

async fn read_request(stream: &mut TcpStream) -> Option<Recorded> {
    let mut buf: Vec<u8> = Vec::new();
    let mut chunk = [0u8; 8192];
    let header_end = loop {
        if let Some(pos) = find_subslice(&buf, b"\r\n\r\n") {
            break pos + 4;
        }
        let n = stream.read(&mut chunk).await.ok()?;
        if n == 0 {
            return None;
        }
        buf.extend_from_slice(&chunk[..n]);
    };

    let head = String::from_utf8_lossy(&buf[..header_end]).to_string();
    let mut lines = head.split("\r\n");
    let request_line = lines.next()?;
    let mut parts = request_line.split_whitespace();
    let method = parts.next()?.to_string();
    let path = parts.next()?.to_string();
    let headers: Vec<(String, String)> = lines
        .filter_map(|l| {
            let (k, v) = l.split_once(':')?;
            Some((k.trim().to_ascii_lowercase(), v.trim().to_string()))
        })
        .collect();
    let content_length: usize = headers
        .iter()
        .find(|(k, _)| k == "content-length")
        .and_then(|(_, v)| v.parse().ok())
        .unwrap_or(0);

    let mut body = buf[header_end..].to_vec();
    while body.len() < content_length {
        let n = stream.read(&mut chunk).await.ok()?;
        if n == 0 {
            break;
        }
        body.extend_from_slice(&chunk[..n]);
    }
    body.truncate(content_length);

    let pull = |name: &str| {
        headers
            .iter()
            .find(|(k, _)| k == name)
            .map(|(_, v)| v.clone())
    };
    let auth = pull("authorization");
    let content_type = pull("content-type");

    Some(Recorded {
        method,
        path,
        auth,
        content_type,
        body,
    })
}

async fn write_response(
    stream: &mut TcpStream,
    status: u16,
    reason: &str,
    headers: &[(&str, String)],
    body: &[u8],
) {
    use tokio::io::AsyncWriteExt;
    let mut out = format!(
        "HTTP/1.1 {status} {reason}\r\nContent-Length: {}\r\nConnection: close\r\n",
        body.len()
    );
    for (k, v) in headers {
        out.push_str(&format!("{k}: {v}\r\n"));
    }
    out.push_str("\r\n");
    let _ = stream.write_all(out.as_bytes()).await;
    let _ = stream.write_all(body).await;
    let _ = stream.flush().await;
}

fn file_json(file: &MockFile) -> Vec<u8> {
    format!(
        "{{\"id\":\"{}\",\"name\":\"{}\",\"size\":\"{}\",\"mimeType\":\"application/json\",\"createdTime\":\"2026-01-01T00:00:00.000Z\"}}",
        file.id,
        file.name,
        file.bytes.len()
    )
    .into_bytes()
}

/// Parses `--boundary`-framed multipart/related into (metadata json, media bytes).
fn parse_multipart(content_type: &str, body: &[u8]) -> (String, Vec<u8>) {
    let boundary = content_type
        .split("boundary=")
        .nth(1)
        .unwrap_or_default()
        .trim_matches('"')
        .to_string();
    let sep = format!("--{boundary}");
    let mut parts: Vec<(Vec<u8>, Vec<u8>)> = Vec::new(); // (headers, data)
    let mut rest: &[u8] = body;
    while let Some(pos) = find_subslice(rest, sep.as_bytes()) {
        let after = &rest[pos + sep.len()..];
        if after.starts_with(b"--") {
            break; // closing delimiter
        }
        let after = &after[2..]; // skip \r\n after the boundary line
        let hdr_end = find_subslice(after, b"\r\n\r\n").expect("part headers");
        let headers = after[..hdr_end].to_vec();
        let data_start = hdr_end + 4;
        let data_end = find_subslice(&after[data_start..], sep.as_bytes())
            .expect("closing boundary");
        let mut data = after[data_start..data_start + data_end].to_vec();
        if data.ends_with(b"\r\n") {
            data.pop();
            data.pop();
        }
        parts.push((headers, data));
        rest = &after[data_start + data_end..];
    }
    let metadata = String::from_utf8(parts[0].1.clone()).unwrap();
    (metadata, parts.get(1).map(|p| p.1.clone()).unwrap_or_default())
}

type MockResponse = (u16, Vec<(&'static str, String)>, Vec<u8>);

fn respond(state: &MockState, req: Recorded, addr: SocketAddr) -> MockResponse {
    let (path, query) = match req.path.split_once('?') {
        Some((p, q)) => (p.to_string(), q.to_string()),
        None => (req.path.clone(), String::new()),
    };

    // token endpoint -------------------------------------------------
    if path == "/token" {
        let n = state.token_calls.fetch_add(1, Ordering::SeqCst) + 1;
        let body = format!(
            "{{\"access_token\":\"at-{n}\",\"expires_in\":3600,\"refresh_token\":\"rt-rotated-{n}\",\"scope\":\"openid email\"}}"
        )
        .into_bytes();
        return (200, vec![], body);
    }

    // the 401-refresh test flips this switch
    if state.reject_once.fetch_and(false, Ordering::SeqCst) {
        return (401, vec![], b"{}".to_vec());
    }

    // resumable session PUT ------------------------------------------
    if req.method == "PUT" && path == "/session/1" {
        let name = state.pending_name.lock().unwrap().clone().unwrap_or_default();
        let file = MockFile {
            id: state.next_file_id(),
            name,
            bytes: req.body,
        };
        let body = file_json(&file);
        state.files.lock().unwrap().push(file);
        return (200, vec![], body);
    }

    // uploads --------------------------------------------------------
    if path == "/upload/files" {
        if query.contains("uploadType=resumable") {
            // the init request's body is the plain metadata json
            let name = extract_name(&req.body);
            *state.pending_name.lock().unwrap() = Some(name);
            let location = format!("http://{addr}/session/1");
            return (200, vec![("Location", location)], b"{}".to_vec());
        }
        // multipart: part 0 = metadata json, part 1 = media bytes
        let ct = req.content_type.clone().unwrap_or_default();
        let (metadata, media) = parse_multipart(&ct, &req.body);
        let name = serde_json::from_str::<serde_json::Value>(&metadata)
            .ok()
            .and_then(|v| v["name"].as_str().map(str::to_string))
            .unwrap_or_default();
        let file = MockFile {
            id: state.next_file_id(),
            name,
            bytes: media,
        };
        let body = file_json(&file);
        state.files.lock().unwrap().push(file);
        return (200, vec![], body);
    }

    // list -----------------------------------------------------------
    if req.method == "GET" && path == "/drive/files" {
        let files = state.files_snapshot();
        let list: Vec<String> = files
            .iter()
            .rev() // newest first
            .map(|f| {
                format!(
                    "{{\"id\":\"{}\",\"name\":\"{}\",\"size\":\"{}\",\"createdTime\":\"2026-01-01T00:00:00.000Z\"}}",
                    f.id,
                    f.name,
                    f.bytes.len()
                )
            })
            .collect();
        let body = format!("{{\"files\":[{}]}}", list.join(",")).into_bytes();
        return (200, vec![], body);
    }

    // per-file -------------------------------------------------------
    if let Some(rest) = path.strip_prefix("/drive/files/") {
        let id = rest.to_string();
        let mut files = state.files.lock().unwrap();
        let pos = files.iter().position(|f| f.id == id);
        if req.method == "DELETE" {
            match pos {
                Some(i) => {
                    files.remove(i);
                    (204, vec![], vec![])
                }
                None => (404, vec![], b"{}".to_vec()),
            }
        } else if query.contains("alt=media") {
            match pos {
                Some(i) => {
                    let bytes = files[i].bytes.clone();
                    (200, vec![("Content-Type", "application/json".to_string())], bytes)
                }
                None => (404, vec![], b"{}".to_vec()),
            }
        } else {
            match pos {
                Some(i) => {
                    let body = file_json(&files[i]);
                    (200, vec![], body)
                }
                None => (404, vec![], b"{}".to_vec()),
            }
        }
    } else if path == "/userinfo" {
        (200, vec![], b"{\"email\":\"me@example.com\"}".to_vec())
    } else {
        (404, vec![], b"{}".to_vec())
    }
}

/// Pulls `"name":"..."` out of the resumable-init metadata json body.
fn extract_name(body: &[u8]) -> String {
    serde_json::from_slice::<serde_json::Value>(body)
        .ok()
        .and_then(|v| v["name"].as_str().map(str::to_string))
        .unwrap_or_default()
}

async fn start_mock() -> (SocketAddr, Arc<MockState>) {
    let listener = TcpListener::bind("127.0.0.1:0").await.unwrap();
    let addr = listener.local_addr().unwrap();
    let state = Arc::new(MockState::default());
    let st = state.clone();
    tokio::spawn(async move {
        loop {
            let (mut stream, _) = match listener.accept().await {
                Ok(v) => v,
                Err(_) => break,
            };
            let st = st.clone();
            tokio::spawn(async move {
                if let Some(req) = read_request(&mut stream).await {
                    st.record(req.clone());
                    let (status, headers, body) = respond(&st, req, addr);
                    let reason = if status < 400 { "OK" } else { "Error" };
                    write_response(&mut stream, status, reason, &headers, &body).await;
                }
            });
        }
    });
    (addr, state)
}

fn mock_config(addr: SocketAddr) -> GoogleConfig {
    mock_config_with(addr, Some("test-secret"))
}

fn mock_config_with(addr: SocketAddr, client_secret: Option<&str>) -> GoogleConfig {
    let base = format!("http://{addr}");
    GoogleConfig {
        client_id: "test-client".to_string(),
        client_secret: client_secret.map(str::to_string),
        endpoints: Endpoints {
            auth: format!("{base}/auth"),
            token: format!("{base}/token"),
            revoke: format!("{base}/revoke"),
            userinfo: format!("{base}/userinfo"),
            drive: format!("{base}/drive"),
            upload: format!("{base}/upload"),
        },
    }
}

fn contains(hay: &[u8], needle: &[u8]) -> bool {
    find_subslice(hay, needle).is_some()
}

// ---------------------------------------------------------------------
// Drive client
// ---------------------------------------------------------------------

#[tokio::test]
async fn small_upload_uses_single_multipart_request() {
    let (addr, state) = start_mock().await;
    let client = DriveClient::new(mock_config(addr), "rt-1".to_string());

    let payload = b"{\"app\":\"oort-notes\",\"kind\":\"backup\"}".to_vec();
    let file = client
        .upload_json("oort-backup-20260101-000000.json", payload.clone())
        .await
        .unwrap();
    assert_eq!(file.id, "file-1");
    assert_eq!(file.name, "oort-backup-20260101-000000.json");
    assert_eq!(file.size_bytes(), Some(payload.len() as i64));

    let reqs = state.requests_snapshot();
    assert_eq!(reqs.len(), 2); // one token call + one upload
    let upload = reqs.last().unwrap();
    assert!(upload.path.contains("/upload/files"));
    assert!(upload.path.contains("uploadType=multipart"));
    let ct = upload.content_type.as_deref().unwrap_or_default();
    assert!(ct.starts_with("multipart/related; boundary="), "{ct}");
    assert_eq!(upload.auth.as_deref(), Some("Bearer at-1"));
    // the app-data parent, the file name and the archive bytes all travelled
    assert!(contains(&upload.body, b"appDataFolder"));
    assert!(contains(&upload.body, b"oort-backup-20260101-000000.json"));
    assert!(contains(&upload.body, &payload));
}

#[tokio::test]
async fn large_upload_uses_resumable_session() {
    let (addr, state) = start_mock().await;
    let client = DriveClient::new(mock_config(addr), "rt-1".to_string());

    let mut payload = vec![b'A'; 5 * 1024 * 1024 + 1]; // past the 4 MiB cutoff
    payload.extend_from_slice(b"tail");
    let file = client.upload_json("big.json", payload.clone()).await.unwrap();
    assert_eq!(file.id, "file-1");

    let reqs = state.requests_snapshot();
    assert_eq!(reqs.len(), 3); // token + resumable init + session PUT
    let init = &reqs[1];
    assert!(init.path.contains("uploadType=resumable"));
    assert_eq!(extract_name(&init.body), "big.json");

    let put = &reqs[2];
    assert_eq!(put.method, "PUT");
    assert!(put.path.starts_with("/session/1"));
    assert_eq!(put.body, payload);
}

#[tokio::test]
async fn list_download_delete_roundtrip() {
    let (addr, _state) = start_mock().await;
    let client = DriveClient::new(mock_config(addr), "rt-1".to_string());

    let a = b"archive-1".to_vec();
    let b = b"archive-2".to_vec();
    let fa = client.upload_json("a.json", a.clone()).await.unwrap();
    let fb = client.upload_json("b.json", b.clone()).await.unwrap();

    let listed = client.list_appdata().await.unwrap();
    let ids: Vec<String> = listed.iter().map(|f| f.id.clone()).collect();
    assert_eq!(ids, vec![fb.id.clone(), fa.id.clone()]); // newest first

    let downloaded = client.download(&fa.id).await.unwrap();
    assert_eq!(downloaded, a);

    client.delete(&fa.id).await.unwrap();
    let listed = client.list_appdata().await.unwrap();
    assert_eq!(listed.len(), 1);
    assert_eq!(listed[0].id, fb.id);

    // deleting again is not an error (already gone)
    client.delete(&fa.id).await.unwrap();
}

#[tokio::test]
async fn unauthorized_response_refreshes_token_and_retries() {
    let (addr, state) = start_mock().await;
    state.reject_once.store(true, Ordering::SeqCst);

    let client = DriveClient::new(mock_config(addr), "rt-1".to_string());
    let file = client.upload_json("retry.json", b"{}".to_vec()).await.unwrap();
    assert_eq!(file.id, "file-1");

    // one token call for the first attempt, one for the post-401 refresh
    assert_eq!(state.token_calls.load(Ordering::SeqCst), 2);
    let reqs = state.requests_snapshot();
    assert_eq!(reqs.len(), 4); // token, rejected upload, token, successful upload
    assert_eq!(reqs[1].auth.as_deref(), Some("Bearer at-1"));
    assert_eq!(reqs[3].auth.as_deref(), Some("Bearer at-2"));
}

#[tokio::test]
async fn oauth_token_requests_carry_the_documented_form_fields() {
    let (addr, state) = start_mock().await;
    let config = mock_config(addr);

    let token = exchange_code(&reqwest::Client::new(), &config, "http://127.0.0.1:9/callback", "code-xyz", "verifier-abc")
        .await
        .unwrap();
    assert_eq!(token.access_token, "at-1");
    assert_eq!(token.refresh_token.as_deref(), Some("rt-rotated-1"));

    let refreshed = refresh_access_token(&reqwest::Client::new(), &config, "rt-1")
        .await
        .unwrap();
    assert_eq!(refreshed.access_token, "at-2");

    let email = fetch_userinfo_email(&reqwest::Client::new(), &config, "at-2").await;
    assert_eq!(email.as_deref(), Some("me@example.com"));

    let reqs = state.requests_snapshot();
    let token_reqs: Vec<&Recorded> = reqs.iter().filter(|r| r.path.starts_with("/token")).collect();
    assert_eq!(token_reqs.len(), 2);
    let exchange_body = String::from_utf8_lossy(&token_reqs[0].body);
    for needle in [
        "grant_type=authorization_code",
        "code=code-xyz",
        "code_verifier=verifier-abc",
        "client_id=test-client",
        "client_secret=test-secret",
    ] {
        assert!(exchange_body.contains(needle), "missing {needle}: {exchange_body}");
    }
    let refresh_body = String::from_utf8_lossy(&token_reqs[1].body);
    assert!(refresh_body.contains("grant_type=refresh_token"));
    assert!(refresh_body.contains("refresh_token=rt-1"));
}

/// Desktop apps use a public "Desktop app" OAuth credential: client_secret is
/// optional for both code exchange and refresh
/// (https://developers.google.com/identity/protocols/oauth2/native-app).
/// With `client_secret: None` it must be absent from the request body
/// entirely — never sent as an empty string.
#[tokio::test]
async fn desktop_exchange_and_refresh_omit_client_secret() {
    let (addr, state) = start_mock().await;
    let config = mock_config_with(addr, None);

    let token = exchange_code(
        &reqwest::Client::new(),
        &config,
        "http://127.0.0.1:9/callback",
        "code-desktop",
        "verifier-desktop",
    )
    .await
    .unwrap();
    assert_eq!(token.access_token, "at-1");

    let refreshed = refresh_access_token(&reqwest::Client::new(), &config, "rt-desktop")
        .await
        .unwrap();
    assert_eq!(refreshed.access_token, "at-2");

    let reqs = state.requests_snapshot();
    let token_reqs: Vec<&Recorded> = reqs
        .iter()
        .filter(|r| r.path.starts_with("/token"))
        .collect();
    assert_eq!(token_reqs.len(), 2);
    for r in &token_reqs {
        let body = String::from_utf8_lossy(&r.body);
        assert!(
            !contains(&r.body, b"client_secret"),
            "desktop request must not contain client_secret: {body}"
        );
        assert!(contains(&r.body, b"client_id=test-client"));
    }
    // exchange: PKCE verifier travels instead of a secret
    let exchange_body = String::from_utf8_lossy(&token_reqs[0].body);
    assert!(exchange_body.contains("grant_type=authorization_code"));
    assert!(exchange_body.contains("code_verifier=verifier-desktop"));
    // refresh: grant_type + refresh_token, still no secret
    let refresh_body = String::from_utf8_lossy(&token_reqs[1].body);
    assert!(refresh_body.contains("grant_type=refresh_token"));
    assert!(refresh_body.contains("refresh_token=rt-desktop"));
}

/// A whitespace-only secret (pasted by accident, or an env var set to blanks)
/// must behave exactly like None — nothing is sent.
#[tokio::test]
async fn blank_secret_is_normalized_to_nothing() {
    let (addr, state) = start_mock().await;
    let config = mock_config_with(addr, Some("   "));

    refresh_access_token(&reqwest::Client::new(), &config, "rt-1")
        .await
        .unwrap();

    let reqs = state.requests_snapshot();
    let token_req = reqs
        .iter()
        .find(|r| r.path.starts_with("/token"))
        .expect("token request recorded");
    let body = String::from_utf8_lossy(&token_req.body);
    assert!(
        !contains(&token_req.body, b"client_secret"),
        "blank secret leaked into request: {body}"
    );
}

/// Belt-and-braces for the shell split: the desktop command ignores secrets
/// (see note-desktop google_set_config), and this test pins the core-level
/// contract it relies on — a configured secret IS included for confidential
/// (web) clients. The web presence case is covered by
/// `oauth_token_requests_carry_the_documented_form_fields`.

// ---------------------------------------------------------------------
// Backup run against the mock Drive
// ---------------------------------------------------------------------

#[tokio::test]
async fn scheduled_backup_runs_uploads_and_prunes() {
    let (addr, state) = start_mock().await;
    let pool = init_memory_pool().await.unwrap();

    repo::set_setting(&pool, "google_client_id", "test-client").await.unwrap();
    repo::set_setting(&pool, "google_client_secret", "test-secret").await.unwrap();
    repo::save_google_account(&pool, Some("me@example.com"), Some("rt-db"), "openid email drive.appdata")
        .await
        .unwrap();
    repo::set_setting(&pool, "backup_keep_count", "2").await.unwrap();

    let nb = repo::create_notebook(&pool, &new_id(), "Physics", None, None, None)
        .await
        .unwrap();
    repo::create_chapter(&pool, &new_id(), &nb.id, "Kinematics", "infinite", None, None, None, None, None, None)
        .await
        .unwrap();

    // the store hands the client mock endpoints + the token the DB row holds;
    // this mirrors what DbTokenStore produces in production
    let store = MockStore {
        config: mock_config(addr),
        refresh_token: "rt-db".to_string(),
    };

    let run1 = run_due_backup(&pool, &store).await.unwrap();
    assert!(run1.is_some(), "first backup is due (never ran before)");
    let run1 = run1.unwrap();
    assert_eq!(run1.drive_file_id, "file-1");
    assert_eq!(run1.counts.notebooks, 1);
    assert_eq!(run1.counts.chapters, 1);

    // not due anymore: last_backup_at was just set
    assert!(run_due_backup(&pool, &store).await.unwrap().is_none());

    // force two more runs by resetting the timestamp
    for _ in 0..2 {
        repo::set_setting(&pool, "last_backup_at", "0").await.unwrap();
        run_due_backup(&pool, &store).await.unwrap();
    }

    // keep_count = 2: three uploads happened, the oldest was pruned from
    // Drive and its row marked deleted
    let files = state.files_snapshot();
    assert_eq!(files.len(), 2);
    let uploaded: Vec<String> = files.iter().map(|f| f.id.clone()).collect();
    assert!(!uploaded.contains(&"file-1".to_string()));

    let rows = repo::list_backups(&pool, 100).await.unwrap();
    assert_eq!(rows.iter().filter(|r| r.status == "uploaded").count(), 2);
    assert_eq!(rows.iter().filter(|r| r.status == "deleted").count(), 1);
    let deleted = rows.iter().find(|r| r.status == "deleted").unwrap();
    assert_eq!(deleted.drive_file_id.as_deref(), Some("file-1"));

    // the deleted file is really gone from the mock's storage
    assert!(!files.iter().any(|f| f.id == "file-1"));

    // last_backup_at reflects the most recent run
    let last = repo::get_setting(&pool, "last_backup_at").await.unwrap().unwrap();
    assert_ne!(last, "0");

    // a run against a dead endpoint retries, then fails; the row records it
    let dead = SocketAddr::from(([127, 0, 0, 1], 1));
    let dead_client = DriveClient::new(mock_config(dead), "rt-x".to_string());
    let err = run_backup(&pool, &dead_client, 2).await.unwrap_err();
    let rows = repo::list_backups(&pool, 100).await.unwrap();
    let failed = rows.first().unwrap();
    assert_eq!(failed.status, "failed");
    assert!(failed.error.is_some(), "{err}");
}

// helper types used above ------------------------------------------------

struct MockStore {
    config: GoogleConfig,
    refresh_token: String,
}

impl note_core::backup::RefreshTokenStore for MockStore {
    fn load(
        &self,
    ) -> std::pin::Pin<
        Box<
            dyn std::future::Future<
                    Output = Result<Option<note_core::backup::BackupAuth>, note_core::CoreError>,
                > + Send,
        >,
    > {
        let auth = note_core::backup::BackupAuth {
            config: self.config.clone(),
            refresh_token: self.refresh_token.clone(),
        };
        Box::pin(async move { Ok(Some(auth)) })
    }
}
