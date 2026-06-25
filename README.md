<div align="center">
<br/>

<img src="https://warp.ishannaik.com/brand/warp-mark.png" width="80" alt="Warp" />

# WARP

### Send it straight through.

Peer-to-peer file transfer that **never touches a server**. Pick a file, share a code, and your bytes stream **device-to-device** over an encrypted WebRTC channel — no uploads, no accounts, no size limits, no cloud.

<p>
<a href="https://warp.ishannaik.com"><b>⚡ warp.ishannaik.com</b></a>
&nbsp;·&nbsp;
<a href="https://warp.ishannaik.com/how">How it works</a>
&nbsp;·&nbsp;
<a href="https://github.com/Ishannaik/warp/issues">Issues</a>
</p>

[![CI](https://github.com/Ishannaik/warp/actions/workflows/ci.yml/badge.svg)](https://github.com/Ishannaik/warp/actions/workflows/ci.yml)
[![License: MIT](https://img.shields.io/badge/License-MIT-5360ff.svg)](./LICENSE)
![Built with WebRTC](https://img.shields.io/badge/WebRTC-P2P-5360ff)
![Cloudflare](https://img.shields.io/badge/Cloudflare-Pages%20%2B%20Workers-ef6a3d)
![Cost](https://img.shields.io/badge/cost-%240%20%C2%B7%20no%20card-1f9d55)

<br/>

`peer-to-peer` · `end-to-end encrypted` · `no size cap` · `no account` · `multi-device` · `$0`

<br/>

<img src="https://warp.ishannaik.com/og.jpg" width="760" alt="Warp — direct, encrypted transfer queue" />

</div>

---

## Why it's different

- 🔒 **End-to-end encrypted by default** — every transfer rides DTLS on the WebRTC data channel; the keys live only in the two browsers. Your ISP, the café Wi-Fi, and Warp itself all see nothing but ciphertext.
- 🛰️ **No server in the path** — the signaling server only *introduces* two peers, then steps aside. It never sees, stores, or relays a single file byte.
- ⚡ **Fast** — 256 KB SCTP chunks with backpressure push the channel toward your real link rate. Multi-GB games and zips **stream straight to disk** instead of buffering in RAM.
- 🌐 **True multi-device** — a room is a full mesh. **Fan one file out to every device at once**, or send back the other way. The channel stays open for more.
- ✋ **You stay in control** — the receiver gets a **review → accept → tray** flow. Nothing auto-downloads; you choose what to save, per file or as a zip. Cancel mid-transfer and it stops **instantly** (the cancel rides the signaling socket, jumping the byte queue).
- 💸 **$0 and no credit card** — Cloudflare's free tier + public STUN. There's no paid relay anywhere, so nothing can ever bill you.

> 📖 **Want the deep version?** The [**theory page**](https://warp.ishannaik.com/how) walks the whole stack — NAT, STUN, DTLS, chunking, backpressure — then descends layer by layer through *why a relay can never be truly free*, all the way down to thermodynamics. It's the most fun page in the repo.

## How it works

Warp is two small pieces:

- **`web/`** — the app + landing page (Vite + React 19 + TypeScript + Tailwind v4). Runs entirely in the browser.
- **`server/`** — a **Cloudflare Worker + Durable Object** doing WebSocket **signaling**. It brokers the connection handshake and **hibernates when idle** (so it costs nothing between transfers).

```
  Browser A  ──handshake──▶   signaling (introduce only)   ◀──handshake──  Browser B
      └──────────────  encrypted WebRTC data channel · your files  ──────────────┘
```

1. You open a room — the server mints a short code.
2. A friend joins with the code (or scans the QR) — the server introduces you.
3. The browsers connect directly (STUN for NAT discovery) and files stream **peer-to-peer, end-to-end encrypted**.

Devices on the **same network** also discover each other automatically (grouped by public IP, à la Snapdrop). Multiple peers can share one room — a mesh, up to `MAX_PEERS`.

### Deliberate non-goals

- **No TURN relay.** If both peers are behind strict/symmetric NATs and can't punch through, Warp shows an **honest error** instead of quietly paying to relay your bytes. Same Wi-Fi always works; most networks connect fine via STUN.
- **No cloud storage.** Nothing is uploaded — there's nothing to leak, expire, or get billed for.
- **No paid infrastructure.** Signaling is a free hibernating Worker; STUN is public; file bytes go straight peer-to-peer.

## Quickstart

```bash
pnpm install

pnpm dev:server     # signaling (wrangler dev) on :8787
pnpm dev            # web app on :5173
```

```bash
pnpm --filter @warp/web build     # lint + typecheck + production build
pnpm --filter @warp/server test   # signaling e2e
```

## Self-hosting

- **Frontend** → any static host. We ship `web/` to **Cloudflare Pages**:
  ```bash
  cd web && wrangler pages deploy dist --project-name=<your-project>
  ```
- **Signaling** → a **Cloudflare Worker + Durable Object** — genuinely free on the Workers Free plan, no credit card, hibernates when idle:
  ```bash
  pnpm --filter @warp/server run deploy
  ```

Point `VITE_SIGNALING_URL` in the frontend at your signaling server's `wss://` URL.

## Architecture & protocol

See [`server/README.md`](./server/README.md) for the signaling protocol — message contract, room lifecycle, and mesh rules.

## Brand

Logo marks live in [`web/public/brand/`](./web/public/brand) — SVG + PNG, a universal accent tile plus transparent light/dark glyphs.

## Contributing

PRs welcome — see [CONTRIBUTING.md](./CONTRIBUTING.md). Found a security issue? See [SECURITY.md](./SECURITY.md).

## License

[MIT](./LICENSE) © [Ishannaik](https://github.com/Ishannaik)
