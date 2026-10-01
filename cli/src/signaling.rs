//! WebSocket signaling client — talks to the Cloudflare Worker exactly like
//! the web app's `SignalingClient` (join, signal relay, 8s keepalive ping).

use crate::protocol::{ClientFrame, ServerFrame, SIGNALING_URL};
use anyhow::{Context, Result};
use futures_util::{SinkExt, StreamExt};
use std::sync::Arc;
use std::time::Duration;
use tokio::net::TcpStream;
use tokio::sync::{mpsc, Mutex};
use tokio_tungstenite::tungstenite::client::IntoClientRequest;
use tokio_tungstenite::tungstenite::Message;
use tokio_tungstenite::{MaybeTlsStream, WebSocketStream};

pub type WsStream = WebSocketStream<MaybeTlsStream<TcpStream>>;

/// Split write half, shared so WebRTC callbacks can relay signals too.
pub type Writer = Arc<Mutex<futures_util::stream::SplitSink<WsStream, Message>>>;

/// A connected signaling socket. Read half lives here; the write half is
/// shared. The keepalive ping runs on a spawned task.
pub struct Signaling {
    read: futures_util::stream::SplitStream<WsStream>,
    write: Writer,
}

impl Signaling {
    /// Connect and send the initial join frame. `room: None` creates a room.
    pub async fn connect(
        room: Option<String>,
    ) -> Result<(Signaling, mpsc::UnboundedReceiver<ServerFrame>)> {
        let req = SIGNALING_URL
            .into_client_request()
            .context("build WS request")?;
        let (ws, _resp) = tokio_tungstenite::connect_async(req)
            .await
            .context("connect to signaling server")?;

        let (write, read) = ws.split();
        let write = Arc::new(Mutex::new(write));

        let mut sig = Signaling {
            read,
            write: write.clone(),
        };
        sig.send_frame(&ClientFrame::Join { room }).await?;

        // Keepalive: ping every 8s so the Durable Object never hibernates.
        tokio::spawn(async move {
            loop {
                tokio::time::sleep(Duration::from_secs(8)).await;
                let frame = serde_json::to_string(&ClientFrame::Ping).unwrap();
                if write.lock().await.send(Message::Text(frame)).await.is_err() {
                    break;
                }
            }
        });

        let (_tx, rx) = mpsc::unbounded_channel();
        Ok((sig, rx))
    }

    /// Send one client frame (join/signal/ping) as JSON text.
    pub async fn send_frame(&mut self, frame: &ClientFrame) -> Result<()> {
        let text = serde_json::to_string(frame).context("serialize frame")?;
        self.write
            .lock()
            .await
            .send(Message::Text(text))
            .await
            .context("send frame")
    }

    /// Clone the shared write half (for WebRTC callbacks / peers).
    pub fn clone_writer(&self) -> Writer {
        self.write.clone()
    }

    /// Move the read half onto a task that forwards every frame, so callers
    /// can poll signaling without blocking (e.g. between file chunks). The
    /// channel closes when the socket does.
    pub fn into_channel(mut self) -> mpsc::UnboundedReceiver<ServerFrame> {
        let (tx, rx) = mpsc::unbounded_channel();
        tokio::spawn(async move {
            while let Ok(Some(frame)) = self.next().await {
                if tx.send(frame).is_err() {
                    break;
                }
            }
        });
        rx
    }

    /// Read the next server frame. Returns None on a clean EOF.
    pub async fn next(&mut self) -> Result<Option<ServerFrame>> {
        loop {
            match self.read.next().await {
                Some(Ok(Message::Text(text))) => match serde_json::from_str::<ServerFrame>(&text) {
                    Ok(frame) => return Ok(Some(frame)),
                    Err(e) => eprintln!("[signaling] unparsable frame: {e}"),
                },
                Some(Ok(Message::Ping(_))) | Some(Ok(Message::Pong(_))) => continue,
                Some(Ok(Message::Close(_))) | Some(Err(_)) | None => {
                    return Ok(None);
                }
                Some(Ok(Message::Binary(_))) => continue,
                _ => continue,
            }
        }
    }
}
