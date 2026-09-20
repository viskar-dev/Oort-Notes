// packages/core/src/lib.rs

use serde::{Deserialize, Serialize};

#[derive(Debug, Serialize, Deserialize)]
pub struct Note {
    pub id: String,
    pub title: String,
    pub content: String,
}

#[derive(Debug, thiserror::Error)]
pub enum CoreError {
    #[error("note not found: {0}")]
    NotFound(String),
    #[error("database error: {0}")]
    Database(String),
}

pub async fn get_note(id: &str) -> Result<Note, CoreError> {
    // Real implementation goes here
    todo!()
}
