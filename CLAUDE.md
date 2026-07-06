# CLAUDE.md — Warp

Peer-to-peer WebRTC file transfer. Brand is **Warp** (user-facing), matching the repo `Ishannaik/warp`. The Cloudflare **Pages project is still named `wrap`** internally — deploy uses `--project-name=wrap` and its Pages host is `wrap-3qq.pages.dev` (do not rename it). Live at https://warp.ishannaik.com and https://warp.pixalabs.net.

## Golden rules

- **Mobile-first, always.** Every UI must work at ~360–430px with zero horizontal overflow. Branch layout with `useIsMobile()` (`web/src/lib/useIsMobile.ts`). The design was ported from a desktop export, so any new component MUST add the mobile branch. Verify at phone width before shipping.
- **$0 and no credit card.** No paid infrastructure. Everything runs on Cloudflare free (Pages + Workers + Durable Objects) — no card on the account, so nothing can ever bill. **No TURN relay by default** (STUN-only) — restrictive/cross-network NAT gets an honest error, never a silent paid relay. If a relay is ever added it must be unmetered/no-bill (self-hosted coturn, or CF TURN with no card).
- **Verify pricing before recommending any host.** Check the provider's *current* free tier + "credit card" against live sources first. (We got burned assuming Koyeb/Fly were free; both now need a card.)
- **The signaling server is a dumb relay.** It brokers the WebRTC handshake and never sees, stores, or understands a file byte. Keep it that way.

## Stack & layout

- `web/` — Vite + React 19 + TypeScript + Tailwind v4 (`@tailwindcss/vite`, CSS-first `@theme`). pnpm workspace `@warp/web`. Client router in `src/router.tsx` (`navigate`, `useRoute`). Routes: `/` landing, `/send` + `/r/:code` transfer flow, `/receive` code entry, `/how` theory.
- `server/` — Cloudflare **Worker + Durable Object** signaling server (`src/index.js`), WebSocket Hibernation, `@warp/server`. One DO via `idFromName('global')` holds all rooms; room state lives in the live sockets' `serializeAttachment` (hibernation-safe).
- `web/src/lib/wrap/` — the WebRTC engine: `signaling.ts` (WS client), `peer.ts` (`RTCPeerConnection` + data channel, STUN-only), `transfer.ts` (wire protocol), `useWrapTransfer.ts` (orchestration).

## Design tokens (match exactly)

bg `#121110`, ink `#efe9da`, body `#a8a293`, muted `#6f6a5d`, accent `var(--acc)` `#5360ff`, amber `var(--amb)` `#ef6a3d`. Fonts: **Bricolage Grotesque** (display), **Archivo** (body), **JetBrains Mono** (mono/UI chrome). Hairlines `rgba(239,233,218,.12–.16)`. Components are inline-`style`-heavy (faithful design port) — keep that style; use CSS vars for accent.

## Signaling protocol (gotchas baked in)

client→server: `{type:'join'}` (server mints the code) · `{type:'join',room}` · `{type:'signal',to,data}` · `{type:'ping'}` (keepalive).
server→client: `{type:'joined',selfId,room,peers[]}` · `{type:'peer-joined'}` · `{type:'peer-left'}` · `{type:'signal',from,data}` · `{type:'error',error}`.

- **`SEND_HIGH_WATER` (peer.ts) must stay well BELOW 16 MiB.** Chrome's SCTP send buffer hard-caps at 16 MiB and `bufferedAmount` can never exceed it — a ≥16 MiB high-water mark disables backpressure entirely and every large transfer dies mid-send (~40% of a 50 MB file). It's 8 MiB now; the check also counts the chunk about to be sent.
- **Transfers must survive drops.** Signaling auto-reconnects + rejoins; ICE restarts (initiator-only); `peer-left` keeps a peer whose channel is still open; a dead peer is salvaged (unfinished send files auto re-offered on reconnect). Don't turn transient drops back into terminal errors.
- **Never mint room codes on the client.** The server owns codes (6 chars, `^[A-HJ-KM-NP-Z2-9]{6}$`). The sender connects with NO room and uses `joined.room`. (A local `WRAP-…` code got rejected as `bad-room` and broke every transfer.)
- **Keep the keepalive ping (every 8s).** Without it the DO hibernates after 10s idle and drops a waiting room before the peer joins. Don't remove it.

## Commands

```bash
pnpm install
pnpm dev                              # web on :5173
pnpm dev:server                       # wrangler dev on :8787
pnpm --filter @warp/web build         # always lint + typecheck + build before deploy
pnpm --filter @warp/server test       # signaling e2e

# deploy (Cloudflare) — a stale CLOUDFLARE_API_TOKEN in the env 403s; strip it so
# wrangler uses the OAuth login (which auto-refreshes): prefix with `env -u CLOUDFLARE_API_TOKEN`
cd web && env -u CLOUDFLARE_API_TOKEN wrangler pages deploy dist --project-name=wrap --branch=main --commit-dirty=true
pnpm --filter @warp/server run deploy  # `run` avoids pnpm's `deploy` builtin
```

Custom domains are on Namecheap (CNAME `warp` → `wrap-3qq.pages.dev`); `pixalabs.net` also carries live Zoho email — when touching its DNS, preserve every existing record (Namecheap `setHosts` replaces all).
