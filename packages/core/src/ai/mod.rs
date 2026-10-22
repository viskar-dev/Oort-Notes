//! Oort AI (desktop): one static tool registry, a `dispatch` that routes each
//! tool to its Rust or frontend implementation, the Rust↔webview canvas
//! bridge contract, the OpenAI-compatible agent loop, and settings/keychain
//! backed AI configuration.
//!
//! Hosting (the MCP server, the OS keychain, Tauri commands) lives in the
//! desktop crate; the web shell does not expose AI at all.

pub mod bridge;
pub mod config;
pub mod dispatch;
pub mod llm;
pub mod params;
pub mod tools;

pub use config::AiConfig;
pub use llm::AgentEvent;
