#[derive(Debug, thiserror::Error)]
pub enum CoreError {
    #[error("not found: {0}")]
    NotFound(String),

    #[error("database error: {0}")]
    Database(#[from] sqlx::Error),

    #[error("migration error: {0}")]
    Migration(#[from] sqlx::migrate::MigrateError),

    #[error("serialization error: {0}")]
    Serialization(#[from] serde_json::Error),

    #

    #

    #[error("internal error: {0}")]
    Internal(String),
}
