# beam-signaling

Stateless WebRTC **signaling server** for Beam. It puts peers in a room, tells
them about each other, and relays opaque SDP/ICE blobs between them. It never
sees a file byte — all transfers go peer-to-peer over the browsers' encrypted
data channels.

Single file, one dependency (`ws`), no database, no TURN. In-memory room state.

## Run

```bash
npm install
npm start        # listens on :8080 (PORT env to change)
npm test         # spawns the server and runs the e2e check
npm run dev      # auto-restart on change
```

Health check: `GET /health` -> `200 ok`.

## Environment

| Var         | Default | Meaning                          |
|-------------|---------|----------------------------------|
| `PORT`      | `8080`  | Listen port                      |
| `MAX_PEERS` | `8`     | Max peers per room (mesh cap)    |

## Protocol

JSON over WebSocket. The **new peer initiates** WebRTC offers to every existing
peer (glare-free mesh); existing peers wait for an offer.

**Client → server**

| Message | Fields | Effect |
|---|---|---|
| `join` | `room?` | Omit `room` to create a fresh room; pass a code to join one. |
| `signal` | `to`, `data` | Relay `data` (your SDP/ICE) to peer `to` in your room. |

**Server → client**

| Message | Fields | Meaning |
|---|---|---|
| `joined` | `selfId`, `room`, `peers[]` | You're in. Offer to each id in `peers`. |
| `peer-joined` | `peerId` | A new peer joined; expect an offer from it. |
| `peer-left` | `peerId` | A peer disconnected. |
| `signal` | `from`, `data` | A relayed blob. `from` is server-stamped (unforgeable). |
| `error` | `error`, `message?` | `bad-room`, `room-not-found`, `room-full`, `bad-message`, `unknown-type`. |

## Deploy

Needs a host with **persistent WebSocket** support — Vercel serverless does
**not** qualify. Use Fly.io / Render / Railway, or Cloudflare Workers + Durable
Objects. Set `PORT` from the platform; expose `/health` as the health check.

## Deliberate limits

- **No TURN, no relay** — STUN-only on the client. Restrictive NATs get an honest
  error instead of a bandwidth bill. Add coturn if you ever want to pay for it.
- **Single instance** — in-memory rooms. Add Redis pub/sub to scale horizontally.
- **No auth** — room codes are the only secret (6 chars, unguessable enough for
  ephemeral transfers). Add an origin allowlist if you want to stop other sites
  reusing your signaling server.
