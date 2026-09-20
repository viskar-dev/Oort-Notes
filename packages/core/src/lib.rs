use serde::{Deserialize, Serialize};

#[derive(Debug, thiserror::Error)]
pub enum CoreError {
    #[error("not found: {0}")]
    NotFound(String),
    #[error("not found: {0}")]
    Databse(String),
    #[error("not found: {0}")]
    Internal(String),
}

pub async fn ping() -> Result<String, CoreError> {
    Ok("Pong".to_string())
}
