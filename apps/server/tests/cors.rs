//! Regression test for the CORS-on-merged-routes bug: `Router::layer` only
//! wraps routes added before it, so the google/backup routes must be merged
//! BEFORE `.layer(cors)` — otherwise the browser blocks every BackupPage
//! fetch with "No 'Access-Control-Allow-Origin' header is present on the
//! requested resource".

use axum::http::{Request, StatusCode};
use http_body_util::BodyExt;
use tower::ServiceExt;

#[tokio::test]
async fn cors_headers_cover_google_and_backup_routes() {
    let pool = note_core::init_memory_pool().await.unwrap();
    let app = note_server::build_router(pool);

    for path in [
        // the routes that used to be served without CORS headers
        "/api/google/status",
        "/api/google/config",
        "/api/backup/settings",
        "/api/backup/status",
        // a pre-existing route, as a control
        "/api/ping",
    ] {
        let request = Request::get(path)
            .header("origin", "http://localhost:1420")
            .body(axum::body::Body::empty())
            .unwrap();
        let response = app.clone().oneshot(request).await.unwrap();
        assert_eq!(response.status(), StatusCode::OK, "{path}");
        let acao = response
            .headers()
            .get("access-control-allow-origin")
            .map(|v| v.to_str().unwrap().to_string());
        assert_eq!(
            acao.as_deref(),
            Some("*"),
            "{path} is missing Access-Control-Allow-Origin — was it merged after the CORS layer?"
        );
        // drain the body so each oneshot request completes cleanly
        let _ = response.into_body().collect().await;
    }
}
