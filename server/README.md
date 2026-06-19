# @warp/server

WebRTC **signaling server** for Warp, as a **Cloudflare Worker + Durable Object**.
It puts peers in a room, tells them about each other, and relays opaque SDP/ICE
blobs between them. It never sees a file byte — transfers go peer-to-peer over the
browsers' encrypted data channels.

Genuinely free to run: the Workers Free plan includes SQLite-backed Durable Objects
(no credit card), and the WebSocket **Hibernation API** means idle connections cost
nothing.

## Run

```bash
pnpm install
pnpm --filter @warp/server dev          # wrangler dev — local workerd on :8787
pnpm --filter @warp/server test         # boots wrangler dev and runs the e2e check
pnpm --filter @warp/server run deploy   # wrangler deploy (needs `wrangler login`; `run` avoids pnpm's deploy builtin)
```

Health check: `GET /health` -> `200 ok`.

## Design (hibernation-safe state)

There is **no `rooms` map**. A Durable Object can be evicted from memory between
messages, so the live WebSockets *are* the room state: each socket carries
`{ peerId, room }` via `serializeAttachment()`, and "who's in room X" is just
`state.getWebSockets().filter(...)`. Nothing to desync.

One Durable Object instance (`idFromName('global')`) holds all rooms — plenty for a
hobby signaling server. Shard by room code later if you ever outgrow a single DO.

## Protocol

JSON over WebSocket. The **new peer initiates** WebRTC offers to every existing peer
(glare-free mesh); existing peers wait for an offer.

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

```bash
wrangler login          # once, interactive
pnpm --filter @warp/server run deploy
```

Gives a `wss://warp-signaling.<your-subdomain>.workers.dev` URL — set it as
`VITE_SIGNALING_URL` in the web app.

## Deliberate limits

- **No TURN, no relay** — STUN-only on the client. Restrictive NATs get an honest
  error instead of a bandwidth bill.
- **One Durable Object** — single instance holds all rooms. Shard by room to scale.
- **No auth** — room codes are the only secret (6 chars, unguessable enough for
  ephemeral transfers).
