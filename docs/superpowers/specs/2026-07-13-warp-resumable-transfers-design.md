# Warp — Robust Resumable Transfers (tier-C) — Design

**Date:** 2026-07-13
**Status:** Design approved (user: "do all"); Fable adversarial review folded in;
**H6 resolved → A** (Fable's call, delegated by user) — DO reclaim record. Ready for the
implementation plan.
**Scope owner:** engine (`web/src/lib/wrap/*`) + transfer UI (`web/src/transfer/*`) + signaling `server/src/index.js` (H6=A)

## Problem

Transfers "keep stopping / crashing with no fallback resume." The engine is already
partially hardened (signaling auto-reconnect, initiator ICE restart, dead-peer salvage,
wake-lock), but three real gaps remain:

1. **No byte resume.** On any mid-transfer drop the file restarts from byte 0 *and* the
   receiver gets a second accept modal. A large disk-streamed file is worse: the
   `FsWritable` + handle live inside `WrapPeer`, which `salvagePeer` **closes** on a drop,
   so the partial on disk is orphaned and Accept re-prompts a *new* save picker. The code
   carries a `ponytail:` TODO admitting "files restart from byte 0 on re-offer."
   (`useWrapTransfer.ts:464-465`)
2. **Reconnect gives up.** `signaling.ts` hard-fails after 8 attempts (~30 s of outage) →
   terminal `signaling-lost`. A tunnel / elevator / wifi↔cellular handoff kills the session
   permanently. (`signaling.ts:161-173`)
3. **Big in-memory receive OOM-crashes the tab.** On iOS Safari / Firefox (no File System
   Access API) even a multi-GB file buffers fully into one `Blob` → tab crash.
   (`peer.ts:851` in-memory `chunks.push`; hook only routes to disk when the API exists.)

Plus a UX requirement: **the end user must see reconnect/resume happening** — a silent
freeze reads as "crashed."

## Goals (tier-C **+ C+**, agreed with user — "do all")

- Resume an interrupted transfer **from the last byte**, automatically, with **no second
  accept modal** — for both the in-memory path and multi-GB straight-to-disk path — **as
  long as the tab stays alive** (the actual "40% freeze" failure mode). *(core-C)*
- Resume across a **full page reload / tab crash** where the platform allows it (Chromium FS
  Access): persist the `FileSystemFileHandle` in IndexedDB, checkpoint-`close()` to commit,
  reopen with `keepExistingData:true` + `seek()`, re-permission from a user gesture on
  return. *(C+ — see Pillar 6)*
- **Never hard-fail** a live session on a transient network drop; keep reconnecting while
  the tab is open.
- **Never OOM-crash**; fall back gracefully and, where a device genuinely can't hold the
  file, give an honest error (matching the STUN-only NAT honesty ethos).
- **Show the user** live `Reconnecting…` / `Resuming · N%` / `Waiting for <device>` state.

### Sequencing (not scope cuts — all in)

Core-C ships first and stands alone (it fixes the actual "40% freeze"); C+ (Pillar 6) builds
on the same registry/offset machinery and lands as a second increment so reload-resume is
tested against a working core rather than co-developed with it. Both are in scope.

## Research grounding (competitor source read directly)

- **tus.io** — single monotonic `Upload-Offset`; `HEAD` discovers the offset; `PATCH` with
  `Upload-Offset` must equal current offset else `409 Conflict`. Since our SCTP channel is
  reliable+ordered, the received prefix is always contiguous — **we need only tus's single
  offset, not croc's sparse-file bitmap.**
- **croc** — positioned writes + whole-file xxhash; resume handshake re-runs on every
  reconnect; validates `stat.Size()` before trusting a partial. We borrow: size-check guard
  + resume-handshake-on-every-connect.
- **magic-wormhole (Dilation)** — reconnect replays unacked records **from an in-memory
  queue** → impractical for multi-GB. We avoid this: resume is offset-driven and the sender
  re-reads from disk via `file.slice(offset)`, holding **no replay buffer**.
- **FilePizza** — has the exact receiver-driven offset protocol (`Start{fileName, offset}` +
  `validateOffset(offset<=size)` + `ChunkAck{offset,bytesReceived}`) but **hardcodes
  `offset:0`** and leaves resume a `TODO`. We finish what they stubbed.
- **PairDrop / Snapdrop** — 64 KB chunks / 1 MB partition-ACK window; **no** `bufferedAmount`
  backpressure, **no** resume (a `repeatPartition()` that is never called), OOM "solved" by
  refusing >200 MB on iOS. We take their WS-reconnect triggers (`online`/`offline`,
  `navigator.connection` change, `visibilitychange`) and 1%-delta progress throttling.
- **webwormhole** — the reference `bufferedAmount` backpressure (promise gated on
  `onbufferedamountlow`). Our existing `peer.ts:waitForDrain` is already this pattern — keep.
- **File System Access API (MDN)** — `createWritable()` writes to a **swap file, committed
  only on `close()`**. Therefore: on a drop with the tab alive, **do not close** the
  writable — keep it open in the hook and keep appending (no `seek`/`keepExistingData`
  needed). `keepExistingData:true` + `seek(offset)` are only needed for reload-resume (C+).
- **StreamSaver.js — rejected.** Needs a cross-origin service-worker + MITM iframe (fights
  our strict CSP) and is broken on iOS Safari.
- **iOS Safari** — hard ~2 GB/tab memory ceiling with **silent, uncatchable** tab kill.
  Must gate with `navigator.storage.estimate()` and refuse honestly above budget.

## Design — five pillars

### Pillar 1 — Offset-resume wire protocol (`transfer.ts`)

- Add a stable per-file `key` to the offer manifest:
  `key = name + " " + size + " " + lastModified` — stable across re-offers of the same
  `File` object, and enough to catch "peer picked a different file" (name+size+mtime).
- A second field, **`resumeToken`** — a random id the **sender** mints per file at first
  offer and reuses on every re-offer of that file. The receiver stores it with the partial and
  **auto-accepts a re-offer only when the token matches**. Peer-id-agnostic (survives the fresh
  `selfId` a rejoin mints) and unguessable by other room members → kills mesh hijack (Fable H5)
  and makes double-offer dedupe trivial (H3). **Not optional.**
- Control-message changes (JSON frames):
  - `offer` items gain `key` + `resumeToken`.
  - `accept` gains a per-item resume map `{ resume?: { [id]: number } }` — the receiver's
    **durably-written** byte count (see Pillar 2; 0/absent = fresh).
  - **`file-begin` gains `offset`** — the sender echoes the offset it will actually stream
    from (tus's PATCH-offset echo). **Receiver rule:** if `file-begin.offset !== myBytesWritten`,
    do **not** append — restart cleanly (memory/IDB: discard partial + re-init; live-tab disk:
    the open writable can't rewind, so poison the entry + honest error). Neutralizes version
    skew, the spec's own clamp-to-0, and malicious offsets (H2). `finishIncoming`'s completion
    guard changes from `transferred < size` to `transferred !== size` (an over-count must fail,
    not sail through as `done`).
- Sender behavior on accept with `resume[id] = offset`: iterate the sender's **own** item ids
  and read `resume[id]` (never `Object.keys` the received map — prototype-key hazard, L1);
  validate `Number.isInteger(offset) && 0 <= offset <= size` (else offset = 0 = restart — and
  because `file-begin.offset` is echoed, the receiver learns of the restart and discards its
  partial instead of appending onto it). `Blob.slice(-n)` is relative-from-end, so the
  validation is load-bearing. Then set the send item's `transferred/progress` to `offset` and
  stream `file.slice(offset)`. Body frames stay raw ordered ArrayBuffers — **no per-frame offset
  prefix** (SCTP delivers frames atomically on a reliable+ordered channel; the received prefix
  is always contiguous and torn-frame-free).
- `tailHash` (hash of the last 64 KiB) is **required only on the C+ reload path** (Pillar 6),
  where the in-RAM running hash is gone; for the live-tab case `key` + `resumeToken` + the
  identical `File` already guarantee identity, so it's omitted there.
- Frame sizing unchanged (256 KiB target, capped to negotiated SCTP `maxMessageSize`); the
  existing 8 MiB `SEND_HIGH_WATER` backpressure stays.

### Pillar 2 — Receive state survives the peer rebuild (core refactor)

Today `IncomingState` (partial chunks / writable) and `acceptTargets` (handle) live on
`WrapPeer` and die in `salvagePeer`. Move the **durable** parts into a hook-owned registry:

- New `ReceiveRegistry` (owned by the hook, in a ref so it survives peer rebuilds), keyed by
  file `key`, holding: `{ mode, resumeToken, bytesWritten, writeChain, chunks?, writable?,
  handle?, savedName, active, ownerToken, failed }`.
- **`bytesWritten` is counted at *durable* write, not enqueue (Fable H1).** Today `onChunk`
  does `transferred += buf.byteLength` immediately while the disk write is merely *queued*
  (`peer.ts:844-861`) with a `.catch(()=>{})` that **swallows write failures** — with resume
  that's a silent-hole corruption engine. Fix: increment `bytesWritten` **inside** the
  `writeChain`, *after* each `write()` resolves; hoist the **`writeChain` promise itself** into
  the registry so a rebuilt peer chains new writes behind still-pending old ones (an unhoisted
  fresh `Promise.resolve()` chain can reorder writes vs. the async writable-open head). Any
  `write()` rejection **poisons the entry** (`failed = true` → refuse resume, honest error) —
  never swallowed. Memory mode: `sum(chunks[].byteLength)` is exact as-is.
- **Report the resume offset only after the chain is quiescent:** `await entry.writeChain`
  before answering a re-offer, so `resume[id]` = truly-durable `bytesWritten` (one microtask in
  the common case). The sender then echoes it back in `file-begin.offset` (Pillar 1).
- **`ownerToken` guards against a zombie + new peer both writing one key (Fable H4).** A
  half-dead peer whose channel still reads `open` (kept by `peer-left`, `useWrapTransfer.ts:389`)
  can interleave late chunks with the rebuilt peer's resumed stream. Each entry records the
  `ownerToken` of the peer whose `file-begin` currently owns it; `onChunk` from a non-owner is
  dropped; a new peer may claim only after the old owner's channel is closed.
- **`active` + `resumeToken` guard against double-offer (Fable H3/H5).** `salvagePeer` both
  stages files *and* re-offers to open channels (`useWrapTransfer.ts:473-483`) — two offers of
  one key arrive. Auto-accept fires **only when `!active` and the offered `resumeToken` matches**;
  a second offer for an active key is declined. Sender also dedupes by key before offering.
- `WrapPeer` becomes **sink-agnostic**: on `file-begin`/chunk/`file-end` it reads/writes the
  registry entry handed in by the hook rather than one it owns.
- On `salvagePeer` (drop): **do not** close/abort the writable. Leave the registry entry (and
  its open writable) intact; mark `active = false`.
- **Receiver item `transferred` initializes to the resume offset (Fable M5)** — `acceptOffer`
  creates the item with `transferred = resumeOffset` (not 0), else a tail-only resume trips
  `finishIncoming`'s `transferred !== size` guard and destroys a *successful* resume. This is
  also what Pillar 5's "bar continues from N%" reads.
- **Duplicate keys within one batch disable resume for those items (Fable M1).** A batch may
  legally contain two items with identical `name|size|lastModified` (same file picked twice,
  dir dupes). If a manifest has duplicate keys, those items get a fresh start + modal (never
  share one registry entry). Salvage keeps a `Map<itemId, File>` identity map instead of the
  current name+size pool scan (`useWrapTransfer.ts:470`).
- **Cancel deletes the entry and is remembered (Fable M2).** `applyCancel` routes through the
  registry to delete the entry (and abort/close its writable); the hook records cancelled keys
  for the session so a later re-offer of that key surfaces the **modal** rather than
  auto-resurrecting a file the user explicitly killed.
- On genuine completion (`file-end` + `transferred === size`): close writable (disk) / build
  Blob (memory), emit `file-received`, then drop the registry entry.

### Pillar 3 — Never-give-up reconnect (`signaling.ts` + hook)

- `signaling.ts`: remove the terminal give-up while `!closed`. Keep retrying with capped
  exponential backoff (cap ~15 s). Reset the attempt counter on `visibilitychange→visible`
  and `online`. Add `window` `online`/`offline` and `navigator.connection` `change`
  listeners that trigger an immediate reconnect attempt. Only surface `signaling-lost` if the
  socket has *never* joined (bad URL/env), not mid-session.
- **Pause retries while provably offline (Fable M6):** skip attempts entirely when
  `navigator.onLine === false` (each attempt otherwise allocates a WebSocket that fails
  instantly and burns battery); resume immediately on the `online` event.
- **Dual-drop room reclamation (Fable H6) — DECIDED: A (Fable's call, delegated by user).**
  Room state lives in the live sockets' `serializeAttachment`; the 8 s keepalive only flows
  while a socket is up. If **both** devices drop at once (shared Wi-Fi flap, both in a tunnel —
  a *correlated* drop, so this is the *common* dual-drop, not a rare one), the DO hibernates and
  the room is gone in ~10 s → rejoin returns `room-not-found`, the sender mints a *fresh* code
  (receiver's link now permanently wrong) and the receiver hits the terminal
  `fail("signaling", …)` (`useWrapTransfer.ts:409,419`). Fix — a **small, additive, backward-
  compatible server change** (`server/src/index.js`); it stays a dumb relay (a reclaim record
  is room-membership metadata the DO already holds implicitly — it still never sees a file byte)
  and $0 (single-digit bytes of DO storage + one alarm). Mechanics:
  1. **Detect true last-close:** in `webSocketClose`/`webSocketError`, count survivors
     *excluding the closing socket* —
     `ctx.getWebSockets().filter(ws => ws !== closingWs && ws.readyState === WebSocket.OPEN)`.
     Only when empty, write the record. (Don't trust the in-memory peer list — it's rebuilt
     from live attachments.)
  2. **No hibernation race:** the DO isn't evicted while a storage op is in flight (output gate
     holds it in memory until the `put` settles). `await state.storage.put('reclaim',
     { code, members, expiresAt: Date.now() + 180_000 })` — `await` it so the handler doesn't
     return before the put is durable.
  3. **Expire via a DO alarm** (`state.storage.setAlarm(expiresAt)`); the alarm is **GC only** —
     always re-validate on read during a reclaim-join (`if (!rec || rec.expiresAt < Date.now())
     → room-not-found`), since alarms can be delayed/coalesced. Delete the record + cancel the
     alarm when the room goes live again.
  4. **Reclaim-join = re-mint an empty room under the same code; do NOT restore
     `serializeAttachment`** (the old per-socket state died with the sockets — stale selfIds/SDP).
     Admit the joiner as first member, delete the record. Both peers re-handshake fresh; the
     *file* resume is carried entirely by the client registry + `resumeToken`/`file-begin.offset`,
     never by server-side transfer state. The server only owes them the *same rendezvous code*.
  5. **Concurrency is free** (DO event loop is serial): the first reclaim-`join` flips
     reclaim→live atomically and deletes the record; the second peer then sees a live room and
     joins normally.
  6. **Client:** the receiver's `room-not-found` stops being terminal — during the ~3 min window
     a `join{room}` now succeeds, so treat `room-not-found` as retryable inside the never-give-up
     loop and only surface "session lost — reopen link" **after** the window elapses. Keep the
     existing sender re-mint-fresh fallback (`useWrapTransfer.ts:409`) for genuinely post-window
     dead rooms (it now fires far less).
- **Exit for a peer that's gone for good (Fable M6):** with the watchdog neutered, a receiver
  whose sender closed the laptop forever must not spin "reconnecting…" forever (a different
  lie). After `peer-left` + channel-dead + N minutes, show a soft terminal "Other device left —
  waiting for it to return, or start over" that **still self-heals** if the peer returns.
- Hook `RECONNECT_WATCHDOG_MS`: while any item is unfinished, `reconnecting` must **not** flip
  to a terminal error — it stays a persistent, self-healing "reconnecting, will resume" state
  (any channel open clears it). Manual `retry()` remains available. Only `nat-failed` (never
  connected at all) is terminal on the spot.

### Pillar 4 — OOM mitigation / big-file fallback (`peer.ts` + hook)

Accept-time strategy selection (in `useWrapTransfer.accept`):

1. **FS Access present** (Chromium desktop/Android): stream to disk with the hoisted writable
   (Pillar 2). Multi-GB fine. Resume = keep-open-and-append.
2. **No FS Access** (iOS Safari, Firefox): **IndexedDB chunk staging** — write incoming
   chunks as `(fileId, offset)` records (bounded RAM), assemble at the end and anchor-download.
   - **Store `Blob` values, not `ArrayBuffer`s (Fable M3).** Engines keep `Blob`s file-backed,
     so assembling a Blob-of-Blobs is a lazy reference (no RAM copy) and the download streams
     from disk. Storing ArrayBuffers would re-read every byte into RAM at assembly — a multi-GB
     spike on the exact browsers this path exists for.
   - **Resume offset = highest *contiguous committed* record**, recomputed by scanning the
     store at accept time (or read from committed transactions) — never an in-memory counter
     (same enqueue-vs-durable bug as H1). A `QuotaExceededError` mid-write **poisons the entry**
     (honest error), never swallowed.
   - Gate on `navigator.storage.estimate()` before accept; `navigator.storage.persist()`
     best-effort. **GC orphaned staging records at startup** (crashed sessions) so quota doesn't
     leak forever.
3. **Above device budget (Fable M4):** `estimate()` reports *storage*, but the iOS kill is a
   *memory* ceiling (assembly + the fflate `downloadAll` zip path, `useWrapTransfer.ts:648`,
   hold bytes in RAM). So gate on **both** `estimate()` **and** a hard platform cap (refuse
   > ~1 GB on iOS regardless of estimate) → honest "this browser/device can't receive a file
   this large; use a desktop browser." No silent crash. IDB-staged items are **excluded from
   `downloadAll`'s zip** (like `savedToDisk` items already are).
4. Small files keep today's in-memory tray.

Chunk records: few-hundred-KB–1 MB (matches WebRTC chunking); avoid giant IDB values.

### Pillar 5 — Live end-user status UI (`SessionView.tsx` + `TransferFlow.tsx`)

- Per-item resume/reconnect surfacing: while reconnecting, the item holds its last `progress`
  with a `RESUMING`/`RECONNECTING` label + spinner; on resume the bar **continues from the
  offset %, not 0**. Add the needed status/flag to `TransferItem` (a `resuming` boolean or a
  `reconnecting` item-status that renders like `transferring` but labeled).
- Keep and make-honest the existing session banner ("RECONNECTING… TRANSFERS RESUME
  AUTOMATICALLY", `TransferFlow.tsx:169-196`) — it is currently a lie; Pillar 1+2 make it true.
- `Waiting for <device>` copy where a peer is mid-rebuild — also covers the initiator-only
  ICE-restart case (Fable L3): if the initiator's tab is backgrounded, the responder can only
  wait, and never-give-up makes that wait longer, so the copy must explain it.
- **Throttle the UI emits only, not the ledger (Fable L2).** The ~1%-delta throttle applies to
  the `transfer` event to the UI; the registry `bytesWritten` counter must still update per
  chunk, or a resume offset goes stale by up to 1% of the file. (Send side already emits ~per
  4 MiB block.)
- Ensure a `disconnected` mid-session drop routes to the reconnecting banner, **not** the
  terminal "No direct route" `ErrorPanel`, unless it's `nat-failed`.

### Pillar 6 — Resume across page reload / tab crash (C+)

Builds directly on Pillars 1–2. Only the Chromium FS-Access disk path can survive a reload
(a lost in-memory `chunks[]` or an IDB-staged Blob-in-progress can also survive via IDB —
see below); the goal is that closing/reloading the tab mid-transfer and reopening the same
`/r/<code>` link continues the file instead of restarting.

- **Persist the target handle + progress.** On accept-to-disk, store the
  `FileSystemFileHandle`/dir handle (structured-cloneable) in an IndexedDB `resumes` store
  keyed by room `code` + file `key`, alongside `{ name, size, bytesCommitted, savedName }`.
- **Checkpoint-commit — coarse and *time*-based (Fable M7).** FS-Access persists to the real
  file only on `close()`, and each reopen with `keepExistingData:true` recopies the **whole
  committed file** into a fresh swap. Checkpointing every N bytes on a size-S file costs
  ~S²/2N of copy I/O — a 10 GB file checkpointed every 256 MiB ≈ **200 GB** of writes; every
  1 GiB ≈ 50 GB. So checkpoint on a **timer (~60 s) and on `visibilitychange→hidden`**, never
  per-chunk/per-few-MB, and accept that the since-last-checkpoint tail is knowingly lost on a
  crash. After a checkpoint, reopen `createWritable({ keepExistingData:true })` +
  `seek(committedSize)` and continue. **Do not design a checkpoint-at-death path** — an async
  `close()` in `pagehide`/`beforeunload` isn't awaitable and will torn-race.
- **On return (reload).** The receiver page, on mounting `/r/<code>`, checks the `resumes`
  store for that code. If a partial exists it shows a "Resume previous transfer?" prompt; on the
  user's click (required user gesture) it calls `handle.requestPermission({ mode:'readwrite' })`
  and reads the **true on-disk size via `(await handle.getFile()).size`** — the last successful
  `close()` is the only durable truth (croc's stat check); **never trust the persisted
  `bytesCommitted` counter** for the resume offset. Validate `size ≤ manifest.size`, truncate any
  trailing partial frame back to a frame boundary, then reconnect; the handshake reports that
  offset and the sender streams the tail. **Seek trap:** after reopen the cursor is at 0 —
  `seek(offset)` *past EOF* then `write()` **silently zero-fills the gap**, so the offset must be
  the real on-disk size, never a larger counted value. `FsWritable` (`peer.ts:94-98`) gains
  `seek?(pos)` for this path.
- **Boundary integrity (now required).** Reload-resume cannot trust the in-RAM running hash
  (it's gone), so the receiver sends `tailHash` (hash of its last 64 KiB) in `resume`; the
  sender verifies the same window of its `File` before streaming — catches a same-size file
  swapped between sessions. Final whole-file check still gates completion.
- **IDB-staging path reload** (Firefox / small iOS): the staged `(fileId, offset)` chunk
  records already survive a reload; resume offset = highest contiguous staged record. Same
  "Resume previous transfer?" prompt.
- **Cleanup.** Delete the `resumes` entry on completion, on user cancel, and prune entries
  older than a TTL (e.g. 24 h) on load so stale handles don't accumulate.
- **Honesty.** On a browser that can't persist a usable handle (no FS Access and IDB blocked),
  reload simply restarts — surfaced plainly, never a silent wrong-bytes append.

## Files touched

- `web/src/lib/wrap/transfer.ts` — `key` + `resumeToken` on `OfferItem`; `resume?` map on the
  accept message; `offset` on `file-begin`; new item status/flag for `reconnecting`/`resuming`.
- `web/src/lib/wrap/peer.ts` — sink-agnostic receive (read/write hook registry); stream from
  `offset` on send + echo it in `file-begin`; don't create/own the writable; keep-open on drop;
  `bytesWritten` counted inside `writeChain`; poison on write failure; `finishIncoming` guard
  `!== size`; `FsWritable` gains `seek?` (C+).
- `web/src/lib/wrap/useWrapTransfer.ts` — `ReceiveRegistry` ref (bytesWritten, writeChain,
  active, ownerToken, resumeToken, failed); token-gated auto-resume re-accept; `Map<itemId,File>`
  salvage identity; cancelled-keys set; IDB-staging fallback + `storage.estimate`/iOS-cap gate;
  non-terminal reconnecting; wire resume offsets.
- `web/src/lib/wrap/signaling.ts` — capped-backoff reconnect while open, paused when
  `!navigator.onLine`; `online`/`offline`/`connection`-change/`visibility` triggers;
  `room-not-found` handling (per H6 decision); no mid-session terminal.
- `server/src/index.js` — **(H6 = A)** DO writes a `{code, members, expiresAt}` reclaim record
  on true last-socket-drop, a `setAlarm` to GC it, and honors a `join{room}` within ~3 min by
  re-minting the same code (re-validate `expiresAt` on read; delete on go-live).
- `web/src/transfer/SessionView.tsx` — per-item resuming/reconnecting rendering; 1%-delta
  throttle.
- `web/src/transfer/TransferFlow.tsx` — keep reconnecting banner honest; keep drop out of the
  terminal error screen; **(C+)** "Resume previous transfer?" prompt on `/r/<code>` mount.
- (new) `web/src/lib/wrap/idbStage.ts` — tiny IndexedDB helper: chunk-staging (fallback path)
  **and (C+)** the `resumes` store (persisted handle + `bytesCommitted` keyed by code+key).

## Test plan (extends the esbuild-based `*.check.mjs` harnesses)

- **peer.check.mjs additions:** offer carries `key` + `resumeToken`; accept with
  `resume{offset>0}` streams only the tail (`file-begin.offset` echoes it) and the receiver
  reassembles byte-exact; offset `>size` / non-integer → restart from 0 and receiver discards
  its partial (H2); a `file-begin.offset` that disagrees with `bytesWritten` refuses to append;
  disk-target resume continues on the same writable without reopening; a rejected `write()`
  **poisons** the entry and refuses resume (H1); an over-count fails `finishIncoming` (not
  `done`).
- **useWrapTransfer.check.mjs additions:** a simulated drop keeps the registry entry; the auto
  re-offer resumes with the right offset and **no** `incoming-offer` modal for the in-flight
  key; a **second** (duplicate) re-offer for the active key is declined, not double-streamed
  (H3); a re-offer with a **mismatched `resumeToken`** is not auto-accepted (H5); a chunk from a
  **non-owner** peer is dropped (H4); a genuinely new key still emits the modal; a
  **cancelled** key re-offered surfaces the modal, not an auto-resume (M2); duplicate keys in one
  batch fresh-start with a modal (M1); the `storage.estimate`/iOS-cap gate refuses an over-budget
  offer honestly.
- **C+ (idbStage.check.mjs, new):** a persisted `resumes` entry (fake handle) round-trips;
  reload computes the resume offset from on-disk size truncated to a frame boundary; `tailHash`
  mismatch forces a restart; completion/cancel/TTL prune deletes the entry.
- Full `pnpm --filter @warp/web build` (lint + typecheck + vite build) is green before deploy.

## Rollout / risk

- Wire-protocol change adds fields (`key`, `resumeToken` on offer; `resume` map on accept;
  `offset` on `file-begin`). A **stale-bundle sender** that ignores `resume` streams from byte 0
  — but because the receiver now keys off the echoed `file-begin.offset` (H2), it detects the
  0-offset and discards its partial instead of corrupting. So skew degrades to "no resume", not
  "wrong bytes". New sessions on one deploy are atomic; a session spanning a deploy is already
  torn down.
- Riskiest code: durable `bytesWritten`/writeChain accounting + disk-writable survival across
  peer rebuild (Pillar 2), the IDB fallback (Pillar 4), and the C+ checkpoint/seek path
  (Pillar 6). All covered by check-harness tests + a manual two-device run before deploy.
- H6 = A is **one additive, backward-compatible server change** (reclaim record + alarm in
  `server/src/index.js`); the relay still never touches a file byte and stays on CF free. Old
  clients that never hit the reclaim window are unaffected.

## Review history

- **2026-07-13 — Fable adversarial review** (model `claude-fable-5`). Found 5 HIGH
  (H1 enqueue-vs-durable offset → silent corruption; H2 no offset echo → skew corruption;
  H3 double-offer → tail streamed twice; H4 zombie+new peer both write one key; H5 mesh
  key-hijack) + 7 MED + 4 LOW. **All folded in above.** Headline fix per Fable: two wire
  fields (`file-begin.offset` echo + per-file `resumeToken`) close H2–H5 and most of L1 for
  far less than the originally-planned content hash. H6 (dual-drop room reclamation) was
  delegated back to Fable, which chose **A** (small DO reclaim record + alarm) with the exact
  hibernation-safe / alarm-GC mechanics now inlined in Pillar 3.
