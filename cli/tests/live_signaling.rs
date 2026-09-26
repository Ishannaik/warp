//! Live integration tests against the Warp signaling server.
//!
//! These hit `wss://warp-signaling.ishannaik7.workers.dev` and require
//! network access. They prove the CLI's signaling client speaks the real
//! protocol (join, room minting, peer discovery) end-to-end.
//!
//! The WebRTC data-plane handshake itself is exercised by the manual E2E
//! (send + receive in two terminals); those need real SDP/ICE and are not
//! practical in CI here.

use warp_cli::protocol::{ClientFrame, ServerFrame};
use warp_cli::signaling::Signaling;

#[tokio::test]
async fn join_mints_a_room_code() {
    let (mut sig, _rx) = Signaling::connect(None).await.expect("connect");
    let frame = sig.next().await.expect("read").expect("frame");
    match frame {
        ServerFrame::Joined { room, .. } => {
            assert_eq!(room.len(), 6, "server mints 6-char codes");
            assert!(
                room.chars()
                    .all(|c| c.is_ascii_uppercase() || c.is_ascii_digit()),
                "code must be uppercase alnum: {room}"
            );
        }
        other => panic!("expected Joined, got {other:?}"),
    }
}

#[tokio::test]
async fn receiver_joins_senders_room() {
    // Sender creates a room (no room arg -> server mints one).
    let (mut sender, _rx1) = Signaling::connect(None).await.expect("sender connect");
    let code = match sender.next().await.expect("read").expect("frame") {
        ServerFrame::Joined { room, .. } => room,
        other => panic!("expected Joined, got {other:?}"),
    };

    // Receiver joins that room.
    let (mut receiver, _rx2) = Signaling::connect(Some(code.clone()))
        .await
        .expect("receiver connect");
    let frame = receiver.next().await.expect("read").expect("frame");
    match frame {
        ServerFrame::Joined { room, peers, .. } => {
            assert_eq!(room, code);
            assert_eq!(peers.len(), 1, "sender must be listed as a peer");
        }
        other => panic!("expected Joined, got {other:?}"),
    }

    // Sender must see peer-joined.
    let frame = sender.next().await.expect("read").expect("frame");
    match frame {
        ServerFrame::PeerJoined { .. } => {}
        other => panic!("expected PeerJoined, got {other:?}"),
    }
}

#[tokio::test]
async fn signaling_relays_signal_between_peers() {
    let (mut sender, _rx1) = Signaling::connect(None).await.expect("sender connect");
    let (sender_id, code) = match sender.next().await.expect("read").expect("frame") {
        ServerFrame::Joined { self_id, room, .. } => (self_id, room),
        other => panic!("expected Joined, got {other:?}"),
    };

    let (mut receiver, _rx2) = Signaling::connect(Some(code.clone()))
        .await
        .expect("receiver connect");
    let receiver_id = match receiver.next().await.expect("read").expect("frame") {
        ServerFrame::Joined { self_id, .. } => self_id,
        other => panic!("expected Joined, got {other:?}"),
    };
    // Sender sees the receiver join.
    let _ = sender.next().await.expect("read").expect("frame");

    // Receiver relays a tiny signal to the sender; sender must receive it.
    let payload = warp_cli::protocol::SignalData::Offer {
        sdp: "v=0\r\nm=application 9 UDP/DTLS/SCTP webrtc-datachannel\r\n".to_string(),
    };
    receiver
        .send_frame(&ClientFrame::Signal {
            to: sender_id.clone(),
            data: payload,
        })
        .await
        .expect("relay signal");

    match sender.next().await.expect("read").expect("frame") {
        ServerFrame::Signal { from, data } => {
            assert_eq!(from, receiver_id);
            match data {
                warp_cli::protocol::SignalData::Offer { sdp } => assert!(sdp.starts_with("v=0")),
                other => panic!("expected Offer, got {other:?}"),
            }
        }
        other => panic!("expected Signal, got {other:?}"),
    }
}
