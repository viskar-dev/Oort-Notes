pub mod backup;
pub mod db;
pub mod error;
pub mod google;
pub mod models;
pub mod repo;

pub use db::{init_memory_pool, init_pool};
pub use error::CoreError;
pub use models::*;
pub async fn ping() -> Result<String, CoreError> {
    Ok("pong".to_string())
}
