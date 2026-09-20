// apps/server/src/main.rs
use axum::{http::HeaderValue, routing::get, Json, Router};
use note_core::ping;
use serde_json::{json, Value};
use tower_http::cors::{Any, CorsLayer};

async fn ping_handler() -> Json<Value> {
    match ping().await {
        Ok(msg) => Json(json!({"message": msg})),
        Err(e) => Json(json!({"error": e.to_string()})),
    }
}

#[tokio::main]
async fn main() {
    let cors = CorsLayer::new()
        .allow_origin("http://localhost:1420".parse::<HeaderValue>().unwrap())
        .allow_methods(Any)
        .allow_headers(Any);

    let app = Router::new()
        .route("/api/ping", get(ping_handler))
        .layer(cors);

    let addr = "127.0.0.1:3000";
    let listener = tokio::net::TcpListener::bind(addr).await.unwrap();
    tracing::info!("listing on http://{}", addr);
    axum::serve(listener, app).await.unwrap();
}
