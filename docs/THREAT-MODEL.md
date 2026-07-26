# Threat Model
## Signaling Server Trust Boundary

### What the signaling server can see

The signaling server only processes the information required to establish a peer-to-peer connection. This includes:

- Room codes
- Peer IDs
- WebRTC signaling data (`signal.data`), including SDP and ICE messages
- Connection and disconnection timing
- The connecting public IP address (grouped to a /64 prefix for IPv6 to support nearby device discovery)
- Device display names (when devices use nearby discovery)
The signaling server relays signaling messages between peers without interpreting or modifying their contents.

### What the signaling server cannot see

After the WebRTC connection is established, file data is transferred directly between peers over an encrypted `RTCDataChannel`. The signaling server is not part of the data path and never receives or stores transferred file bytes.

As a result, the signaling server cannot inspect:

- File bytes
- File contents
- Data transferred over the WebRTC data channel

For additional background on the networking model, see [theory-content.md](./theory-content.md).

---

## Malicious Peer

(To be documented.)

## Room Code Entropy

(To be documented.)

## Client-side Attack Surface

(To be documented.)