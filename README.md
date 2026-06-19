<div align="center">

# Warp

**Send files directly between devices.** No uploads, no accounts, no size limits — your files stream peer-to-peer over an encrypted WebRTC channel and never touch a server.

[![CI](https://github.com/Ishannaik/warp/actions/workflows/ci.yml/badge.svg)](https://github.com/Ishannaik/warp/actions/workflows/ci.yml)
[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](./LICENSE)

</div>

## How it works

Warp is two small pieces:

- **`web/`** — the app + landing page (Vite + React + Tailwind). Runs entirely in the browser.
- **`server/`** — a stateless WebSocket **signaling** server. It introduces peers and relays their connection handshake. **It never sees a single file byte.**

```
 Browser A  ──handshake──▶   signaling server   ◀──handshake──  Browser B
     └────────────  encrypted WebRTC data channel (your files)  ──────────┘
```

1. You open a room — the server hands back a short code.
2. Your friend joins with the code — the server introduces you.
3. The browsers connect directly (STUN for NAT discovery) and the file streams P2P, encrypted end-to-end.

Multiple people can join one room (mesh) — up to `MAX_PEERS`.

### Deliberate non-goals

- **No TURN relay.** If both peers are behind strict NATs and can't connect directly, Warp shows an honest error instead of paying to relay your bytes. Same Wi-Fi always works; most networks connect fine via STUN.
- **No cloud storage.** Nothing is uploaded; there's nothing to leak, expire, or get billed for.
- **$0 to run.** Signaling is a tiny stateless socket on a free tier; STUN is public infrastructure; file bytes go peer-to-peer.

## Quickstart

```bash
pnpm install

# terminal 1 — signaling server (wrangler dev) on :8787
pnpm dev:server

# terminal 2 — web app on :5173
cp web/.env.example web/.env   # points at ws://localhost:8787
pnpm dev
```

Run the signaling server's tests:

```bash
pnpm --filter @warp/server test
```

## Self-hosting

- **Frontend** → any static host. We deploy `web/` to Vercel (Root Directory `web`, Vite preset).
- **Signaling** → a **Cloudflare Worker + Durable Object** (`pnpm --filter @warp/server run deploy`).
  Genuinely free on the Workers Free plan — no credit card, no cold starts.

Set `VITE_SIGNALING_URL` in the frontend to your signaling server's `wss://` URL.

## Architecture & protocol

See [`server/README.md`](./server/README.md) for the signaling protocol (message contract, room lifecycle, mesh rules).

## Contributing

PRs welcome — see [CONTRIBUTING.md](./CONTRIBUTING.md). Found a security issue? See [SECURITY.md](./SECURITY.md).

## License

[MIT](./LICENSE)
