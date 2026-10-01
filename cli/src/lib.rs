//! Warp CLI library surface.
//!
//! The binary lives in `main.rs`; this lib exists so integration tests can
//! exercise the real modules (signaling client, wire protocol) without
//! spawning the process.

pub mod peer;
pub mod protocol;
pub mod signaling;
pub mod ui;
