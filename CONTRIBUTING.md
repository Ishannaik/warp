# Contributing to Warp

First off — thanks! Warp is a small, deliberately-lean project, and that's exactly what makes it a great place to contribute: you can hold the whole thing in your head in an afternoon, and a single well-placed PR genuinely improves the product.

Never contributed to open source before? Warp is a friendly place to start. Read the ["Your first PR"](#your-first-pr-a-walkthrough) walkthrough below, pick a [`good first issue`](https://github.com/Ishannaik/warp/issues?q=is:open+label:%22good%20first%20issue%22), and don't be shy about opening a draft PR early — we'd rather help you mid-flight than review a finished thing that went sideways.

## What Warp is

Peer-to-peer file transfer in the browser. Pick a file, share a 6-character code, and bytes stream device-to-device over an encrypted WebRTC data channel. **No uploads, no accounts, no size limits, no cloud** — and no server ever touches a file byte.

Two workspaces in a pnpm monorepo:

| Package | Path | What it is |
|---|---|---|
| `@warp/web` | [`web/`](./web) | The app + landing page. Vite + React 19 + TypeScript + Tailwind v4. Runs entirely in the browser. |
| `@warp/server` | [`server/`](./server) | The signaling server. A Cloudflare **Worker + Durable Object** speaking JSON over WebSocket, with hibernation so it costs $0 when idle. |

### The engine (where the interesting code lives)

The WebRTC transfer engine is `web/src/lib/warp/` — plain TypeScript, UI-free, each module with a heavily-commented header explaining its invariants:

- [`signaling.ts`](./web/src/lib/warp/signaling.ts) — typed WebSocket client for the signaling server. Auto-reconnects with backoff, rejoins its room, pauses while offline, and keeps an 8-second keepalive ping so the Durable Object never hibernates under a waiting room.
- [`peer.ts`](./web/src/lib/warp/peer.ts) — `WarpPeer`: one `RTCPeerConnection` + reliable data channel per remote device. STUN-only ICE, glare-free offer roles, the backpressured send pump, ICE-restart recovery, and the review-before-receive offer/accept gating.
- [`transfer.ts`](./web/src/lib/warp/transfer.ts) — the wire protocol: control-frame types (`offer` / `accept` / `decline` / `file-begin` / `file-end` / `cancel` / `text`), the `TransferItem` state surfaced to the UI, and the resume-identity helpers (`fileKey`, `newResumeToken`).
- [`receiveController.ts`](./web/src/lib/warp/receiveController.ts) — `ReceiveSink`: the durable-write accumulator (memory or straight-to-disk). Its invariant — *bytes only count after the write resolves* — is what makes resume safe instead of silently corrupting.
- [`useWarpTransfer.ts`](./web/src/lib/warp/useWarpTransfer.ts) — the React hook that orchestrates everything: the signaling socket, one `WarpPeer` per remote device (full mesh), the transfer tray, accept/decline, disk streaming for large files, and cross-reconnect resume.

Plus two supporting modules: [`idbStage.ts`](./web/src/lib/warp/idbStage.ts) (IndexedDB staging for big receives on browsers without the File System Access API) and [`useNearby.ts`](./web/src/lib/warp/useNearby.ts) (same-network device discovery).

For the full picture — handshake sequence, wire protocol, resume design, mesh rules — read [`docs/ARCHITECTURE.md`](./docs/ARCHITECTURE.md). The server's protocol contract is in [`server/README.md`](./server/README.md).

## Dev setup

You need **Node >= 22** and **pnpm** (the repo pins `pnpm@10.27.0` via `packageManager`; `corepack enable` gets you the right one).

```bash
git clone https://github.com/Ishannaik/warp.git
cd warp
pnpm install

pnpm dev:server   # signaling server (wrangler dev, local workerd) on :8787
pnpm dev          # web app (vite) on :5173
```

Open `http://localhost:5173` in **two browser tabs** (or two devices on your LAN) to try a transfer end-to-end. By default the web app talks to the live signaling server. To point it at your local `pnpm dev:server` instead, copy [`web/.env.example`](./web/.env.example) to `web/.env` (or set `VITE_SIGNALING_URL=ws://localhost:8787`) and restart `pnpm dev` — Vite inlines `import.meta.env` at startup.

### Checks — run these before every PR

```bash
pnpm lint                          # eslint (all packages)
pnpm typecheck                     # tsc --noEmit (all packages)
pnpm --filter @warp/web build      # production build must stay green
pnpm --filter @warp/server test    # signaling e2e: boots wrangler dev, drives real WebSockets
```

CI (`.github/workflows/ci.yml`) runs exactly these, path-filtered — only the package you touched is built/tested.

### The engine check harnesses

The engine has runnable, dependency-free checks next to each module — no test runner, just `node` and small stubs for the browser globals (a fake `RTCDataChannel`, etc.):

```bash
cd web
node src/lib/warp/signaling.check.mjs          # reconnect/backoff behaviour
node src/lib/warp/peer.check.mjs               # offer -> accept -> stream -> received round-trip, decline, cancel
node src/lib/warp/transfer.check.mjs           # resume identity helpers
node src/lib/warp/receiveController.check.mjs  # durable-write sink invariants
node src/lib/warp/useWarpTransfer.check.mjs    # hook orchestration / salvage-on-reconnect
node src/lib/warp/idbStage.check.mjs           # IDB staging sink
```

**If you touch a file in `web/src/lib/warp/`, run its `.check.mjs` — and extend it to cover your change.** These harnesses are the engine's regression net.

## Hard constraints (the soul of the project)

These are non-negotiable. A PR that violates one will be asked to change, no matter how nice the feature is — so check here *before* you build.

1. **$0 and no credit card, forever.** No paid infrastructure of any kind: no TURN relay, no database, no object storage, no paid API. Everything runs on Cloudflare's free tier + public STUN. If your idea needs a paid service, open an issue to discuss first — there's usually a free-tier-shaped version of it.
2. **STUN-only — no relay, ever.** If two peers can't hole-punch (strict/symmetric NAT on both sides), Warp shows an **honest `nat-failed` error**. It never silently routes file bytes through a server. This is a feature, not a bug.
3. **The signaling server stays a dumb relay.** It introduces peers and forwards opaque SDP/ICE blobs. It must never read, store, log, or understand file contents, filenames, or manifests. Data-plane logic belongs in the browser.
4. **Mobile-first, always.** Every UI must work at **~360–430px wide with zero horizontal overflow**. Branch layout with `useIsMobile()` (`web/src/lib/useIsMobile.ts`) — the design was ported from a desktop export, so any new component **must** include the mobile branch. Verify at phone width (DevTools device toolbar) before opening the PR.
5. **Match the design tokens exactly.** bg `#121110`, ink `#efe9da`, body `#a8a293`, muted `#6f6a5d`, accent `var(--acc)` `#5360ff`, amber `var(--amb)` `#ef6a3d`. Fonts: Bricolage Grotesque (display), Archivo (body), JetBrains Mono (mono/UI chrome). Hairlines `rgba(239,233,218,.12–.16)`. Components are deliberately inline-`style`-heavy (a faithful design port) — **keep that style**; don't refactor to utility classes or CSS modules in passing.
6. **`SEND_HIGH_WATER` (in `peer.ts`) must stay well below 16 MiB.** Chrome's SCTP send buffer hard-caps at 16 MiB and `bufferedAmount` can never exceed it — a ≥16 MiB high-water mark disables backpressure entirely and large transfers die mid-send. It's 8 MiB today, and the backpressure check counts the chunk about to be sent. Don't "tune" this upward.
7. **Transfers must survive drops.** Signaling auto-reconnects and rejoins; the initiator ICE-restarts; unfinished sends are re-offered after a peer rebuild. Don't turn transient network blips back into terminal errors. Related: **never remove the 8s keepalive ping** (the Durable Object hibernates after 10s idle and drops waiting rooms) and **never mint room codes on the client** (the server owns codes; the creator joins with no code and uses `joined.room`).

## Finding something to work on

- **[`good first issue`](https://github.com/Ishannaik/warp/issues?q=is:open+label:%22good%20first%20issue%22)** — scoped, self-contained, and picked because you can land them without knowing the whole codebase. Start here.
- **[`help wanted`](https://github.com/Ishannaik/warp/issues?q=is:open+label:%22help%20wanted%22)** — bigger or fuzzier, but we actively want a hand.
- A good first issue for *you* is one where you can (a) reproduce or visualize the current behaviour locally in under 15 minutes, and (b) point at the one or two files involved. If an issue looks interesting but you can't tell where to start, **comment on it and ask** — getting a pointer is what the comments are for.
- Comment "I'd like to take this" before starting so two people don't build the same thing. No formal assignment needed.
- Want to propose something new? Open a feature request issue first for anything non-trivial — a 5-minute design chat beats a rewritten PR.

Docs, typo fixes, and accessibility improvements are real contributions too, and they're reviewed with the same care.

## Branch, commit & PR conventions

- **Branch from `main`**, named like `feat/qr-share-sheet`, `fix/ios-progress-bar`, `docs/architecture-typos`.
- **Conventional Commits** for messages: `feat:`, `fix:`, `docs:`, `chore:`, `refactor:`, `test:`, `perf:`. Example: `fix(peer): count pending chunk in backpressure check`.
- **No rebasing shared branches** — the repo history uses merge commits.
- Keep PRs focused: one logical change per PR. Small PRs get reviewed fast; 1000-line PRs get reviewed slowly and grumpily.
- Fill in the PR template — especially the mobile-width check and the constraints checklist.
- CI must be green. It runs lint + typecheck + build for `web/` changes and the e2e test for `server/` changes.

## Your first PR: a walkthrough

1. **Fork** the repo on GitHub and clone your fork:
   ```bash
   git clone https://github.com/<you>/warp.git && cd warp
   pnpm install
   ```
2. **Pick an issue** from the [`good first issue` list](https://github.com/Ishannaik/warp/issues?q=is:open+label:%22good%20first%20issue%22) and comment that you're on it.
3. **Branch:**
   ```bash
   git checkout -b fix/my-first-fix
   ```
4. **Run the app** (`pnpm dev`, plus `pnpm dev:server` if you're touching signaling) and reproduce the issue so you know what "fixed" looks like.
5. **Make the change.** Keep it small. Match the surrounding style — including the inline styles in components.
6. **Verify:**
   - `pnpm lint && pnpm typecheck && pnpm --filter @warp/web build`
   - the relevant `node src/lib/warp/*.check.mjs` harness(es) if you touched the engine
   - `pnpm --filter @warp/server test` if you touched the server
   - **at ~390px width** in DevTools if you touched any UI — no horizontal scroll allowed
7. **Commit** with a conventional message and push:
   ```bash
   git commit -m "fix(receive): keep progress bar inside viewport at 360px"
   git push -u origin fix/my-first-fix
   ```
8. **Open the PR** against `Ishannaik/warp` `main`, fill the template, link the issue (`Closes #123`). A draft PR is welcome if you want early feedback.
9. **Respond to review.** Push follow-up commits to the same branch — no force-pushing needed. Once approved, we merge it. 🎉

That's it — you're a Warp contributor.

## Reporting bugs & security issues

- Bugs → [open an issue](https://github.com/Ishannaik/warp/issues/new/choose) with the bug template (browser, device, where it happened, console errors).
- Questions and ideas → [Discussions](https://github.com/Ishannaik/warp/discussions).
- Security vulnerabilities → **do not open a public issue**; see [SECURITY.md](./SECURITY.md).

## Code of Conduct

Everyone interacting in this project is expected to follow the [Code of Conduct](./CODE_OF_CONDUCT.md). Be kind; we're all here to move bytes and have fun.
