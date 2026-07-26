# Threat Model

This document describes Warp's trust boundaries and what different parts of the system can and cannot access.

## Signaling Server Trust Boundary

### What the signaling server can see

The signaling server only processes the information required to establish a peer-to-peer connection. This includes:

- Room codes
- Peer IDs
- WebRTC signaling data (`signal.data`), including SDP and ICE messages
- Connection and disconnection timing
<<<<<<< HEAD
=======
- The connecting public IP address (grouped to a /64 prefix for IPv6 to support nearby device discovery)

The signaling server relays signaling messages between peers without interpreting or modifying their contents.

### What the signaling server cannot see

The signaling server never receives or stores:

- File bytes
- File contents
- Data transferred over the WebRTC data channel

After the WebRTC connection is established, file data is transferred directly between peers over an encrypted `RTCDataChannel`. The signaling server is not part of the data path and never receives transferred file data.

For additional background on the networking model, see `docs/theory-content.md`.

---

## Malicious Peer

(To be documented.)

## Room Code Entropy

(To be documented.)

## Client-side Attack Surface

(To be documented.)