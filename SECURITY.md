# Security Policy

Warp moves people's files, so security reports are taken seriously.

## Reporting a vulnerability

**Please do not open a public issue for security problems.**

Use GitHub's [Private Vulnerability Reporting](https://github.com/Ishannaik/warp/security/advisories/new)
(Security tab → "Report a vulnerability"). If that's unavailable, email
**ainewstweets@gmail.com** with details and reproduction steps.

You can expect an initial response within a few days. Please give a reasonable
window to fix the issue before any public disclosure.

## Scope

In scope:
- The signaling server (`server/`) — e.g. cross-room message leakage, DoS, input handling.
- The web app (`web/`) — e.g. XSS, key/secret leakage, weaknesses in the encryption or pairing flow.

Out of scope:
- Inability to connect through restrictive NATs/firewalls — this is a documented
  design limitation (no TURN relay), not a vulnerability.
- Issues requiring a malicious peer you already chose to share a room code with.

## Design notes relevant to security

- File contents travel only over the browsers' encrypted WebRTC data channel; the
  signaling server relays opaque handshake blobs and never sees file bytes.
- Room codes are the only access secret. Treat them like a password — anyone with
  the code can join the room.
