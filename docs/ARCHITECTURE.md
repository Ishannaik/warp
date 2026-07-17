# Warp architecture

How a file gets from one browser to another without any server ever touching it. This is the deep tour for new contributors — everything here cites the real files and functions, so you can read along in the code.

**The one-paragraph version:** a tiny Cloudflare Worker introduces two browsers to each other over WebSocket (the *signaling* plane), the browsers negotiate a direct, encrypted WebRTC data channel (the *data* plane), and files stream peer-to-peer over that channel using a small JSON-control + binary-chunk wire protocol with backpressure, accept-gating, instant cancel, and byte-exact resume. The server never sees a file byte — it can't, by construction.

```
  Browser A ──ws──▶ ┌───────────────────────────┐ ◀──ws── Browser B
                    │  signaling (CF Worker+DO) │
                    │  "dumb relay": join codes │
                    │  + opaque SDP/ICE blobs   │
                    └───────────────────────────┘
       │                                              │
       └────────── encrypted RTCDataChannel ──────────┘
                 (DTLS/SCTP, your file bytes)
```

## Repo map

| Layer | Where | What |
|---|---|---|
| Signaling server | [`server/src/index.js`](../server/src/index.js) | Cloudflare Worker + one Durable Object. Rooms, codes, opaque relay, LAN discovery, hibernation. |
| Signaling client | [`web/src/lib/warp/signaling.ts`](../web/src/lib/warp/signaling.ts) | `SignalingClient` — typed WS client with reconnect/rejoin/keepalive. |
| Peer + channel | [`web/src/lib/warp/peer.ts`](../web/src/lib/warp/peer.ts) | `WarpPeer` — one `RTCPeerConnection` + data channel per remote device; send pump; ICE-restart recovery. |
| Wire protocol | [`web/src/lib/warp/transfer.ts`](../web/src/lib/warp/transfer.ts) | Control-frame types, `TransferItem` UI state, resume identity helpers. |
| Receive sinks | [`web/src/lib/warp/receiveController.ts`](../web/src/lib/warp/receiveController.ts) | `ReceiveSink` — durable-write accumulators (memory / disk). |
| IDB staging | [`web/src/lib/warp/idbStage.ts`](../web/src/lib/warp/idbStage.ts) | Large receives on browsers without the File System Access API. |
| Orchestration | [`web/src/lib/warp/useWarpTransfer.ts`](../web/src/lib/warp/useWarpTransfer.ts) | The React hook: mesh of peers, tray state, accept/decline, resume registry. |
| LAN discovery | [`web/src/lib/warp/useNearby.ts`](../web/src/lib/warp/useNearby.ts) | Same-network device radar riding the same signaling socket. |
| UI | `web/src/{transfer,receive,hero,nearby,...}` | React 19 + Tailwind v4 pages; routes in `web/src/router.tsx`. |

The engine (`web/src/lib/warp/`) is deliberately UI-free TypeScript. Each module has a runnable, dependency-free check harness next to it (`*.check.mjs`, run with plain `node`) that stubs the browser globals and asserts the module's invariants.

---

## 1. The signaling plane

### The server is a dumb relay — on purpose

[`server/src/index.js`](../server/src/index.js) is ~220 lines. The Worker's `fetch` upgrades WebSocket requests and hands every one of them to a **single Durable Object** (`env.SIGNALING.idFromName('global')`) — one DO instance holds all rooms, which is plenty at hobby scale (shard by room code if that ever changes).

The DO (`SignalingRoom`) uses the **WebSocket Hibernation API**, and this drives its most interesting design decision: **there is no `rooms` map**. A hibernated DO can be evicted from memory between messages, so any in-memory map would silently desync. Instead, *the live sockets are the room state* — each socket carries `{ ip, peerId, room }` via `serializeAttachment()` (which survives hibernation), and "who is in room X" is computed on demand: `state.getWebSockets().filter(...)` (see `sockets()` / `roomExists()`).

Room codes are 6 characters from `ABCDEFGHJKMNPQRSTUVWXYZ23456789` (no ambiguous 0/O/1/I/L), minted with `crypto.getRandomValues` in `makeCode()`. **The server owns codes** — clients never mint one. The creator joins with *no* code and reads the minted one from the `joined` reply.

The protocol (also documented in [`server/README.md`](../server/README.md)):

| Direction | Message | Meaning |
|---|---|---|
| C→S | `{type:'join'}` | Create a fresh room; server mints the code. |
| C→S | `{type:'join', room}` | Join an existing room by code. |
| C→S | `{type:'signal', to, data}` | Relay opaque `data` to peer `to`. |
| C→S | `{type:'ping'}` | Keepalive (see below). |
| C→S | `{type:'announce', name}` | LAN discovery: become discoverable on your public IP. |
| S→C | `{type:'joined', selfId, room, peers[]}` | You're in; `peers` = who was already there. |
| S→C | `{type:'peer-joined', peerId}` / `{type:'peer-left', peerId}` | Membership changes. |
| S→C | `{type:'signal', from, data}` | A relayed blob. `from` is **server-stamped** — unforgeable. |
| S→C | `{type:'nearby', selfId, devices[]}` | Discovery snapshot for your public-IP group. |
| S→C | `{type:'error', error}` | `bad-room`, `room-not-found`, `room-full`, `bad-message`, `unknown-type`. |

Three server behaviours worth knowing:

- **The keepalive matters.** A hibernating DO drops idle WebSockets after ~10s, which used to kill a waiting room before the second peer could join. The client pings every 8s (`signaling.ts`, in the socket `open` handler); the server's only handling of `ping` is *receiving it*, which resets the idle clock. Don't remove either side.
- **Room reclaim (`RECLAIM_MS = 3 min`).** When the *last* socket in a room drops, `handleGone()` writes a `reclaim:<code>` record to DO storage. If both devices dropped at once (shared tunnel, train Wi-Fi), a rejoin within 3 minutes resurrects the **same code** — `handleJoin()` checks the reclaim record before returning `room-not-found`. The server restores no transfer state; it only owes the same rendezvous point (the clients carry the resume state — see §4).
- **`MAX_PEERS = 8`.** A room is a full mesh, and mesh connections grow O(n²); 8 is the honest cap.

### The client: `SignalingClient`

[`signaling.ts`](../web/src/lib/warp/signaling.ts) wraps all of this in a typed event emitter (`joined`, `peer-joined`, `peer-left`, `signal`, `error`, `close`, `open`). The interesting part is failure handling:

- **Auto-reconnect with rejoin** (`openSocket` / `scheduleReconnect`): an unexpected close schedules a capped exponential backoff (settling at ~15s) and rejoins the same room. The policy is *never-give-up once joined* — a session that has ever been in a room retries for the life of the tab; only a socket that never joined (bad URL) gives up honestly with `signaling-lost` after 8 attempts.
- **Offline-aware**: while `navigator.onLine === false`, reconnect attempts pause (each doomed socket costs battery); `online` / `visibilitychange` / connection-change events call `wake()`, which resets the backoff and reconnects immediately.
- **A rejoin gets a fresh `selfId`** — the mesh layer treats the rejoiner as a new device and rebuilds channels; resume (§4) is what makes that invisible.
- The `SignalData` union it relays is opaque to the server: `offer` / `answer` / `ice` — plus **`cancel`**, an out-of-band fast path explained in §3.

---

## 2. The data plane: from code to open channel

[`peer.ts`](../web/src/lib/warp/peer.ts) owns one `RTCPeerConnection` + one reliable, ordered `RTCDataChannel` (named `"warp"`) per remote device.

### STUN-only, and honest about it

`ICE_SERVERS` lists two public Google STUN servers and **no TURN**. STUN lets a browser discover its public address to hole-punch through NAT; TURN would *relay bytes through a server* — which costs money and puts a middleman in the file path, both of which Warp forbids. If both peers sit behind NATs that can't be punched (rare; same-network always works), `WarpPeer` emits an honest `nat-failed` error rather than degrading silently. The `everConnected` flag separates that genuine never-connected failure from a mid-session drop, which is treated as recoverable (§4).

### Glare-free role assignment

WebRTC "glare" is both sides sending an offer at once. Warp sidesteps it structurally:

- The **new** peer — the one whose `joined` reply contained a non-empty `peers[]` list — is the **initiator** toward each existing peer: it constructs `WarpPeer(..., initiator: true)`, which calls `createDataChannel()`, then `start()` sends the SDP offer.
- Each **existing** peer saw `peer-joined` and constructs a **responder** `WarpPeer`: it never offers, just waits for the incoming offer and the `datachannel` event.

Exactly one side offers per pair, so collisions can't happen — the same rule that makes ICE restarts safe later (only the initiator renegotiates).

The SDP/ICE handshake flows through `WarpPeer.handleSignal()` — offers get answered, answers applied, ICE candidates added (tolerating out-of-order arrival). Once DTLS + SCTP come up, the channel's `open` event fires `connected`, and everything from here on rides the encrypted channel.

---

## 3. The wire protocol

Defined in [`transfer.ts`](../web/src/lib/warp/transfer.ts), spoken by `WarpPeer`. The channel carries exactly two kinds of frames:

- **JSON strings** — control frames (`ControlMessage`).
- **ArrayBuffers** — the raw bytes of the *single file currently in flight*.

Because the channel is reliable **and ordered**, framing is trivial: every binary frame between a `file-begin` and its `file-end` belongs to that file. No per-chunk headers, no sequence numbers — SCTP already guarantees order and delivery.

### Review-before-receive

Nothing auto-downloads. A send is *gated*:

```
sender                                  receiver
  │ {t:"offer", batchId, items[]}  ───▶  │  (accept modal shown to the user)
  │                                      │
  │ ◀───  {t:"accept", batchId, resume?} │   ...or {t:"decline", batchId}
  │                                      │
  │ {t:"file-begin", id, offset}   ───▶  │
  │ ████ binary chunks ████        ───▶  │
  │ {t:"file-end", id}             ───▶  │
  │        (repeat per file in batch)    │
```

`offerFiles()` builds the manifest (`OfferItem[]`: id, name, size, mime, best-effort image thumbnail, plus the resume identity fields — see §4), creates local "offered" tray items, and **awaits** the receiver's response; on `decline` nothing is ever sent. The channel **stays open** after a batch — either side can offer again, in either direction, without re-pairing. Text snippets (`{t:"text"}`) skip the gate and land directly in the tray.

### The send pump: chunk sizes and backpressure

`streamFile()` is where throughput lives, and it's tuned by four constants at the top of `peer.ts`:

- `READ_BLOCK = 4 MiB` — the file is read via `blob.arrayBuffer()` in 4 MiB gulps: one `await` per ~4 MiB instead of one per chunk.
- `TARGET_SEND_CHUNK = 256 KiB` — each gulp is sliced into SCTP messages of this size, capped at the *negotiated* `pc.sctp.maxMessageSize` (`sendChunkSize()`; a too-big message closes the channel) and floored at `MIN_SEND_CHUNK = 16 KiB`.
- `SEND_HIGH_WATER = 8 MiB` / `LOW_WATER_MARK = 1 MiB` — classic high/low-water backpressure on `channel.bufferedAmount`: above high water the pump parks on `waitForDrain()`; `bufferedamountlow` (threshold = low water) resumes it.

**Why 8 MiB is load-bearing:** Chrome's SCTP send buffer hard-caps at 16 MiB, and `bufferedAmount` *can never exceed it* — `send()` throws first. A high-water mark ≥ 16 MiB therefore never triggers, backpressure never engages, and every large transfer deterministically dies mid-send once the file outpaces the link (the historical "frozen at 40%" bug). The check also counts the chunk *about to be sent* (`bufferedAmount + sendChunk > SEND_HIGH_WATER`) so the buffer can't be pushed toward the cap. Relatedly, `waitForDrain()` also resolves on channel `close`/`error` — a channel that dies mid-drain must fail loudly, not park the pump forever.

### Cancel: instant, from either side

Cancel is announced **two ways** (`WarpPeer.cancel()`):

1. **Out-of-band** over the always-open signaling socket (`SignalData` `{kind:"cancel", id}`) — this jumps past up to 16 MiB of queued file bytes on the data channel and reaches the other side within a network RTT.
2. **In-band** as `{t:"cancel", id}` on the data channel — survives a dropped socket.

Both land in `applyCancel()`, which is idempotent (the duplicate is a no-op): the sender's pump checks `cancelledIds` per chunk and stops; the receiver aborts its sink so no partial file dangles.

---

## 4. Receiving, durability, and resume

This is the most invariant-dense part of the engine.

### `ReceiveSink`: bytes only count when they're durable

[`receiveController.ts`](../web/src/lib/warp/receiveController.ts) defines the accumulator for one incoming file. The core invariant:

> `bytesWritten` advances **only after the underlying write resolves** — never at enqueue time.

Why so strict? Because `bytesWritten` doubles as the **resume offset** the receiver reports. An earlier design counted bytes on arrival while disk writes were queued behind a swallowed `.catch()` — with resume, that's a silent-corruption engine: a failed write (disk full, revoked permission) kept the counter advancing, and a later resume told the sender to skip bytes that never hit the disk, punching a hole in a file that still finished "done". Now a write failure **poisons** the sink (`failed = true`); a poisoned sink stops counting, refuses to resume, and surfaces an honest error.

Three sink implementations:

- `memorySink()` — array of ArrayBuffers, finalized into one `Blob`. For small files; writes are synchronous so the count is trivially exact.
- `diskSink(open)` — streams straight to a File System Access API writable, opened lazily as the head of a promise chain so every `append()` is ordered behind it. Used when the user accepts a **large** batch (≥ 256 MiB total or any single file, `LARGE_THRESHOLD` in the hook) — the save-location picker is opened *from the accept gesture* (browsers require a user gesture), and multi-GB files never exist in RAM.
- `idbSink()` ([`idbStage.ts`](../web/src/lib/warp/idbStage.ts)) — the fallback for large receives on browsers *without* the FS Access API (iOS Safari, Firefox): chunks are staged as Blob rows in IndexedDB keyed `(fileId, offset)` (engines keep Blobs file-backed, so final assembly is a lazy Blob-of-Blobs, not a RAM copy). Its companion `estimateFits()` is a pre-accept gate that refuses offers that won't fit — combining the storage-quota estimate with a hard ~1 GiB iOS memory cap, because iOS kills the tab with no catchable error. An honest refusal beats a silent crash.

On `file-end`, `completeIncoming()` quiesces the sink and demands `bytesWritten === item.size` **exactly** — over, under, or poisoned all fail rather than fake "done".

### Resume: surviving anything short of both users giving up

Every layer assumes the network will betray it, and each has a recovery story:

| Failure | Detected by | Recovery |
|---|---|---|
| Signaling socket drops | `close` event | `SignalingClient` reconnects + rejoins (never-give-up); room survives server-side while any member is connected — or via the 3-min reclaim record if *everyone* dropped. |
| ICE drops mid-transfer (Wi-Fi flap, locked phone) | `connectionstatechange` → `disconnected`/`failed` | `attemptRestart()`: 3s grace for `disconnected` to self-heal, then the **initiator** does `restartIce()` + re-offer (responder just waits — no glare), up to `MAX_ICE_RESTARTS = 3`. The send pump simply stalls on backpressure and resumes byte-exact — SCTP is reliable, nothing is lost. |
| SCTP channel actually closes | channel `close` event | Not revivable by ICE restart. The peer emits `disconnected`; the hook **salvages**: tears the peer down, keeps tray items, and re-offers unfinished send files automatically when the peer rebuilds. |
| Peer rebuilt with a fresh `selfId` | `peer-left` + re-`peer-joined` | This is where the resume design earns its keep — read on. |

The resume handshake rides the ordinary offer/accept flow, tus-style:

1. **Identity.** Each offered file carries a stable `key` — `fileKey()` = `name␟size␟mtime` (the `␟` unit-separator can't appear in filenames, so fields can't bleed) — and a random 16-char `resumeToken` minted by the sender (`newResumeToken()`) and **reused on every re-offer of that file**.
2. **Ownership outside the peer.** The hook — not the peer — owns receive state, in a registry of `RxEntry` records keyed by file `key` ([`useWarpTransfer.ts`](../web/src/lib/warp/useWarpTransfer.ts)); `WarpPeer` is sink-agnostic and asks its injected `ReceiveHost` for sinks. So when a peer object is torn down and rebuilt, the partial file's sink — and its durable `bytesWritten` — survive.
3. **Re-offer matching.** When a re-offer arrives, the hook matches `key` *and* `resumeToken` against the registry. The token check means only the original sender can resume a partial — another device in a mesh room can't hijack it with a guessable name+size, and a fresh `selfId` doesn't break matching.
4. **Offset agreement.** The receiver's `accept` carries `resume: { fileId: bytesWritten }`. The sender validates it with `clampOffset()` (non-integer, negative, or >size falls back to 0 — guarding `Blob.slice(-n)`'s from-the-end semantics against garbage or hostile peers) and **echoes the offset it will actually stream from** in `file-begin`. In `startIncoming()`, the receiver requires that echo to equal its durable count exactly; a mismatch (stale sender restarting at 0, wrong file) refuses to append onto the partial rather than corrupt it.

Progress bars continue from N%, not 0 — a `reconnecting` status item is a paused transfer, not a failed one. The IDB staging rows even survive a full page reload (rows are keyed by offset; `gcOrphanStaging()` prunes rows from genuinely dead sessions at startup).

---

## 5. The mesh and the hook

[`useWarpTransfer.ts`](../web/src/lib/warp/useWarpTransfer.ts) is the single React hook both `/send` and `/receive` flows use (pass `joinCode` to be the joiner). A room holds up to 8 devices in a **full mesh**: the hook keeps one `WarpPeer` per remote in a `Map`, applies the initiator/responder rule per pair, and:

- **Fans out** — `sendFiles()` offers to *every* connected device, each gated by that device's own accept; files picked before anyone connects are staged and offered as each channel opens.
- **Stamps provenance** — every event is tagged with the emitting peer (`item.peerId`, `incoming.peerId`) so the tray can show which device sent what, and `cancel(id)` routes to the right peer.
- Surfaces one `WarpStatus` for the UI: `idle → connecting → waiting → connected`, with `reconnecting` during recovery — plus the tray `items[]`, the pending `incoming` offer, and download helpers (single file via anchor; `downloadAll()` zips in-memory files with `fflate`).

[`useNearby.ts`](../web/src/lib/warp/useNearby.ts) is the code-free path: it holds a persistent signaling socket, sends `{type:'announce', name}`, and renders the server's `nearby` snapshots — devices grouped by public IP (IPv6 grouped by /64 prefix, since every LAN device has its own full address). Privacy guardrail: a group larger than 8 sockets means a shared IP (CGNAT, campus Wi-Fi), so the server hides the list entirely rather than show strangers. Transfers to a nearby device reuse the exact same `WarpPeer` machinery — the discovery `peerId`s ride the same `signal` relay, no room needed.

---

## 6. Constraints that shape everything

If a design choice above seems odd, one of these is usually why. They're hard requirements, not preferences (see [CONTRIBUTING.md](../CONTRIBUTING.md#hard-constraints-the-soul-of-the-project)):

1. **$0, no credit card, forever** → Cloudflare free tier, hibernation, one DO, no TURN, no storage.
2. **No server in the file path** → STUN-only with an honest `nat-failed`; signaling relays opaque blobs and stamps `from` server-side but never inspects `data`.
3. **Honesty over magic** → refuse-don't-crash (iOS size gate), error-don't-corrupt (poisoned sinks, offset echo), fail-don't-fake (exact byte-count check at `file-end`).
4. **Assume the network flakes** → every layer reconnects, and resume is byte-exact.
5. **Mobile-first UI** → everything works at ~360px; engine events are throttled (~1% progress deltas, one UI emit per 4 MiB block) so re-renders don't melt phones.

## Verifying changes

```bash
pnpm lint && pnpm typecheck && pnpm --filter @warp/web build   # web
pnpm --filter @warp/server test                                # boots wrangler dev, drives real WebSockets end-to-end
cd web && node src/lib/warp/peer.check.mjs                     # …and the other *.check.mjs harnesses
```

The check harnesses are the executable form of this document: `peer.check.mjs` wires two `WarpPeer`s over fake channels and asserts the offer→accept→stream→received round-trip, decline gating, and cancel; `signaling.check.mjs` asserts the never-give-up reconnect policy; `receiveController.check.mjs` asserts the durable-count/poisoning invariants. If you change behaviour described here, change the matching harness too.
