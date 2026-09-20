// apps/server/src/main.rs

use axum::{extract::Path, routing::get, Json, Router};
use note_core::{get_note, Note};

async fn get_note_handler(Path(id): Path<String>) -> Json<Note> {
    Json(get_note(&id).await.unwrap())
}

#[tokio::main]
async fn main() {
    let app = Router::new()
        .route("/api/notes/{id}", get(get_note_handler));

    let listener = tokio::net::TcpListener::bind("0.0.0.0:3000").await.unwrap();
    axum::serve(listener, app).await.unwrap();
}
