use serde::{Deserialize, Serialize};

pub type Id = String;

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Subject {
    pub id: Id,
    pub title: String,
    pub subtitle: Option<String>,
    pub cover: Option<String>,
    pub position: i32,
    pub created_at: i64,
    pub updated_at: i64,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Notebook {
    pub id: Id,
    pub subject_id: Id,
    pub title: String,
    pub subtitle: Option<String>,
    pub cover: Option<String>,
    pub icon: Option<String>,
    pub position: i32,
    pub created_at: i64,
    pub updated_at: i64,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Topic {
    pub id: Id,
    pub notebook_id: Id,
    pub title: String,
    pub position: i32,
    pub created_at: i64,
    pub updated_at: i64,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Page {
    pub id: Id,
    pub topic_id: Id,
    pub title: String,
    pub width: f64,
    pub height: f64,
    pub orientation: String,
    pub position: i32,
    pub created_at: i64,
    pub updated_at: i64,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct PageWithContent {
    #[serde(flatten)]
    pub page: Page,
    pub content: serde_json::Value,
}
