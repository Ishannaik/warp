//! WebRTC peer — STUN-only `RTCPeerConnection` + a single ordered `warp`
//! data channel, mirroring `web/src/lib/warp/peer.ts`.
//!
//! Glare-free role assignment:
//!   - The NEW peer (joined with an existing `peers` list) is the initiator:
//!     creates the data channel + sends the SDP offer.
//!   - Existing peers are responders: wait for the offer + `datachannel` event.
//!
//! Browser interop details that bit us:
//!   - Chrome hides host candidates behind `<uuid>.local` mDNS names, so remote
//!     mDNS candidates must be resolved (`MulticastDnsMode::QueryOnly`) or two
//!     devices on one LAN never connect.
//!   - Local candidates are emitted while `set_local_description` runs, i.e.
//!     BEFORE our offer is relayed, and the remote's can race ahead of theirs.
//!     Candidates that arrive before the remote description are queued.
//!   - webrtc-rs's built-in `on_message` loop reads into a 65,535-byte buffer,
//!     one byte short of Chrome's 64 KiB default chunk, and a longer message
//!     kills the channel. The channel is detached and read with our own buffer.

use crate::protocol::{ClientFrame, SignalData};
use crate::signaling::Writer;
use anyhow::{anyhow, Context, Result};
use bytes::Bytes;
use futures_util::SinkExt;
use std::sync::Arc;
use std::time::Duration;
use tokio::sync::{mpsc, Mutex};
use tokio_tungstenite::tungstenite::Message;
use webrtc::api::setting_engine::SettingEngine;
use webrtc::api::APIBuilder;
use webrtc::data::data_channel::DataChannel;
use webrtc::data_channel::data_channel_init::RTCDataChannelInit;
use webrtc::data_channel::RTCDataChannel;
use webrtc::ice::mdns::MulticastDnsMode;
use webrtc::ice_transport::ice_candidate::RTCIceCandidateInit;
use webrtc::ice_transport::ice_server::RTCIceServer;
use webrtc::peer_connection::configuration::RTCConfiguration;
use webrtc::peer_connection::peer_connection_state::RTCPeerConnectionState;
use webrtc::peer_connection::sdp::session_description::RTCSessionDescription;
use webrtc::peer_connection::RTCPeerConnection;

/// Google's public STUN servers — same list as the web app. No TURN, ever.
const ICE_SERVERS: [&str; 2] = [
    "stun:stun.l.google.com:19302",
    "stun:stun1.l.google.com:19302",
];

pub const CHANNEL_LABEL: &str = "warp";

/// Largest message we send. webrtc-rs's SCTP association rejects anything
/// above 65,536 bytes regardless of what the remote advertises.
pub const MAX_SEND_MESSAGE: usize = 64 * 1024;

/// Read buffer for inbound messages. A browser re-sends a bad piece as ONE
/// binary frame of `pieceSize` (up to 4 MiB for a 2 GiB file), so leave room.
const READ_BUFFER: usize = 8 * 1024 * 1024;

/// Pause sending while this much is queued in the SCTP send buffer. Without
/// it, `send()` accepts a whole multi-GB file into memory.
const SEND_HIGH_WATER: usize = 4 * 1024 * 1024;

/// The open channel: the RTCDataChannel (for `buffered_amount`) and its
/// detached raw half (for reads and writes). None until it opens.
type ChannelSlot = Arc<Mutex<Option<(Arc<RTCDataChannel>, Arc<DataChannel>)>>>;

pub enum PeerEvent {
    /// The data channel is open and detached; sends are safe.
    Connected,
    Control(String),
    Binary(Vec<u8>),
    Disconnected,
}

pub struct WarpPeer {
    pc: Arc<RTCPeerConnection>,
    channel: ChannelSlot,
    pending_ice: Mutex<Vec<RTCIceCandidateInit>>,
    pub events: mpsc::UnboundedReceiver<PeerEvent>,
    pub remote_id: String,
    writer: Writer,
}

impl WarpPeer {
    pub async fn new(remote_id: String, initiator: bool, writer: Writer) -> Result<WarpPeer> {
        let mut s = SettingEngine::default();
        s.detach_data_channels();
        s.set_ice_multicast_dns_mode(MulticastDnsMode::QueryOnly);
        let api = APIBuilder::new().with_setting_engine(s).build();

        let config = RTCConfiguration {
            ice_servers: ICE_SERVERS
                .iter()
                .map(|u| RTCIceServer {
                    urls: vec![u.to_string()],
                    ..Default::default()
                })
                .collect(),
            ..Default::default()
        };
        let pc = Arc::new(
            api.new_peer_connection(config)
                .await
                .context("create peer connection")?,
        );
        let (ev_tx, events) = mpsc::unbounded_channel();
        let channel: ChannelSlot = Arc::new(Mutex::new(None));

        {
            let writer = writer.clone();
            let remote_id = remote_id.clone();
            pc.on_ice_candidate(Box::new(
                move |c: Option<webrtc::ice_transport::ice_candidate::RTCIceCandidate>| {
                    let writer = writer.clone();
                    let remote_id = remote_id.clone();
                    Box::pin(async move {
                        let Some(c) = c else { return };
                        let Ok(init) = c.to_json() else { return };
                        debug(format!("local candidate: {}", init.candidate));
                        let frame = ClientFrame::Signal {
                            to: remote_id,
                            data: SignalData::Ice {
                                candidate: crate::protocol::IceCandidate {
                                    candidate: init.candidate,
                                    sdp_mid: init.sdp_mid,
                                    sdp_mline_index: init.sdp_mline_index,
                                    username_fragment: init.username_fragment,
                                },
                            },
                        };
                        if let Ok(text) = serde_json::to_string(&frame) {
                            let _ = writer.lock().await.send(Message::Text(text)).await;
                        }
                    })
                },
            ));
        }

        pc.on_ice_connection_state_change(Box::new(|s| {
            debug(format!("ice state: {s}"));
            Box::pin(async {})
        }));
        {
            let ev_tx = ev_tx.clone();
            pc.on_peer_connection_state_change(Box::new(move |s| {
                let ev_tx = ev_tx.clone();
                Box::pin(async move {
                    debug(format!("connection state: {s}"));
                    if matches!(
                        s,
                        RTCPeerConnectionState::Failed | RTCPeerConnectionState::Closed
                    ) {
                        let _ = ev_tx.send(PeerEvent::Disconnected);
                    }
                })
            }));
        }

        if initiator {
            let init = RTCDataChannelInit {
                ordered: Some(true),
                ..Default::default()
            };
            let dc = pc
                .create_data_channel(CHANNEL_LABEL, Some(init))
                .await
                .context("create data channel")?;
            attach_channel(dc, channel.clone(), ev_tx.clone());
        } else {
            let channel = channel.clone();
            pc.on_data_channel(Box::new(move |dc: Arc<RTCDataChannel>| {
                attach_channel(dc, channel.clone(), ev_tx.clone());
                Box::pin(async {})
            }));
        }

        Ok(WarpPeer {
            pc,
            channel,
            pending_ice: Mutex::new(Vec::new()),
            events,
            remote_id,
            writer,
        })
    }

    /// Apply one relayed handshake message. Out-of-band cancel/pause/resume
    /// are the caller's business and ignored here.
    pub async fn handle_signal(&self, data: SignalData) -> Result<()> {
        match data {
            SignalData::Offer { sdp } => {
                let desc = RTCSessionDescription::offer(sdp).context("parse offer")?;
                self.pc
                    .set_remote_description(desc)
                    .await
                    .context("set remote offer")?;
                self.flush_pending_ice().await;
                let answer = self.pc.create_answer(None).await.context("create answer")?;
                self.pc
                    .set_local_description(answer.clone())
                    .await
                    .context("set local answer")?;
                self.relay(SignalData::Answer { sdp: answer.sdp }).await?;
            }
            SignalData::Answer { sdp } => {
                let desc = RTCSessionDescription::answer(sdp).context("parse answer")?;
                self.pc
                    .set_remote_description(desc)
                    .await
                    .context("set remote answer")?;
                self.flush_pending_ice().await;
            }
            SignalData::Ice { candidate } => {
                debug(format!("remote candidate: {}", candidate.candidate));
                let init = RTCIceCandidateInit {
                    candidate: candidate.candidate,
                    sdp_mid: candidate.sdp_mid,
                    sdp_mline_index: candidate.sdp_mline_index,
                    username_fragment: candidate.username_fragment,
                };
                if self.pc.remote_description().await.is_none() {
                    self.pending_ice.lock().await.push(init);
                } else if let Err(e) = self.pc.add_ice_candidate(init).await {
                    // One bad candidate must not kill the handshake; ICE
                    // still has the others.
                    eprintln!("  ice: skipped a candidate ({e})");
                }
            }
            SignalData::Cancel { .. } | SignalData::Pause { .. } | SignalData::Resume { .. } => {}
        }
        Ok(())
    }

    async fn flush_pending_ice(&self) {
        let queued = std::mem::take(&mut *self.pending_ice.lock().await);
        for init in queued {
            if let Err(e) = self.pc.add_ice_candidate(init).await {
                eprintln!("  ice: skipped a candidate ({e})");
            }
        }
    }

    /// Initiator only: create and relay the SDP offer.
    pub async fn create_offer(&self) -> Result<()> {
        let offer = self.pc.create_offer(None).await.context("create offer")?;
        self.pc
            .set_local_description(offer.clone())
            .await
            .context("set local offer")?;
        self.relay(SignalData::Offer { sdp: offer.sdp }).await
    }

    async fn raw(&self) -> Result<(Arc<RTCDataChannel>, Arc<DataChannel>)> {
        self.channel
            .lock()
            .await
            .clone()
            .ok_or_else(|| anyhow!("data channel not open"))
    }

    pub async fn send_control(&self, msg: &crate::protocol::ControlMessage) -> Result<()> {
        let text = serde_json::to_string(msg).context("serialize control")?;
        let (_, raw) = self.raw().await?;
        raw.write_data_channel(&Bytes::from(text), true)
            .await
            .context("send control frame")?;
        Ok(())
    }

    /// Send one binary message (at most MAX_SEND_MESSAGE bytes), waiting first
    /// while the send buffer is above the high-water mark.
    pub async fn send_bytes(&self, bytes: &[u8]) -> Result<()> {
        let (dc, raw) = self.raw().await?;
        while dc.buffered_amount().await + bytes.len() > SEND_HIGH_WATER {
            tokio::time::sleep(Duration::from_millis(2)).await;
        }
        raw.write_data_channel(&Bytes::copy_from_slice(bytes), false)
            .await
            .context("send bytes")?;
        Ok(())
    }

    /// Wait for the SCTP send buffer to empty. `send()` only queues bytes, and
    /// tearing the connection down early truncates the tail of the last file.
    pub async fn wait_drained(&self, timeout: Duration) -> Result<()> {
        let (dc, _) = self.raw().await?;
        let deadline = tokio::time::Instant::now() + timeout;
        loop {
            let buffered = dc.buffered_amount().await;
            if buffered == 0 {
                return Ok(());
            }
            if tokio::time::Instant::now() >= deadline {
                return Err(anyhow!(
                    "timed out waiting for send buffer to drain ({buffered} bytes left)"
                ));
            }
            tokio::time::sleep(Duration::from_millis(50)).await;
        }
    }

    pub async fn close(&self) {
        let _ = self.pc.close().await;
    }

    async fn relay(&self, data: SignalData) -> Result<()> {
        let frame = ClientFrame::Signal {
            to: self.remote_id.clone(),
            data,
        };
        let text = serde_json::to_string(&frame).context("serialize signal")?;
        self.writer
            .lock()
            .await
            .send(Message::Text(text))
            .await
            .context("relay signal")?;
        Ok(())
    }
}

/// On open: detach the channel, store both halves, and pump inbound messages
/// into the event queue with a buffer big enough for any browser frame.
fn attach_channel(
    dc: Arc<RTCDataChannel>,
    slot: ChannelSlot,
    ev_tx: mpsc::UnboundedSender<PeerEvent>,
) {
    let dc2 = dc.clone();
    dc.on_open(Box::new(move || {
        Box::pin(async move {
            let raw = match dc2.detach().await {
                Ok(raw) => raw,
                Err(e) => {
                    eprintln!("  data channel: detach failed ({e})");
                    let _ = ev_tx.send(PeerEvent::Disconnected);
                    return;
                }
            };
            *slot.lock().await = Some((dc2.clone(), raw.clone()));
            let _ = ev_tx.send(PeerEvent::Connected);
            tokio::spawn(async move {
                let mut buf = vec![0u8; READ_BUFFER];
                loop {
                    match raw.read_data_channel(&mut buf).await {
                        Ok((0, _)) | Err(_) => {
                            let _ = ev_tx.send(PeerEvent::Disconnected);
                            break;
                        }
                        Ok((n, true)) => {
                            let text = String::from_utf8_lossy(&buf[..n]).into_owned();
                            let _ = ev_tx.send(PeerEvent::Control(text));
                        }
                        Ok((n, false)) => {
                            let _ = ev_tx.send(PeerEvent::Binary(buf[..n].to_vec()));
                        }
                    }
                }
            });
        })
    }));
}

/// `WARP_DEBUG=1` prints the ICE handshake, for "why won't it connect".
fn debug(msg: String) {
    if std::env::var_os("WARP_DEBUG").is_some() {
        eprintln!("  [debug] {msg}");
    }
}
