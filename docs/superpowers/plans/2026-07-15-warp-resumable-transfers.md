# Warp Resumable Transfers — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make Warp transfers survive network drops and page reloads by resuming from the last durable byte (in-memory + straight-to-disk), never hard-failing a live session, never OOM-crashing, and showing the user live reconnect/resume status.

**Architecture:** Extend the data-channel wire protocol with a per-file `key` + `resumeToken` + a `file-begin.offset` echo (tus-style single-offset resume over the reliable+ordered SCTP channel). Move receive bookkeeping out of `WrapPeer` into a hook-owned `ReceiveController` (injected into `WrapPeer` so it survives peer rebuilds and stays unit-testable), counting `bytesWritten` at *durable* write and poisoning on failure. Harden `signaling.ts` into a never-give-up reconnect loop and add a Durable-Object reclaim record so a both-sides drop can rejoin the same code. Add an IndexedDB fallback (staging + persisted handles) for no-FS-Access browsers and reload-resume.

**Tech Stack:** Vite + React 19 + TypeScript (web), Cloudflare Worker + Durable Object (server), no test runner — `*.check.mjs` harnesses transpiled on the fly with esbuild (now a `@warp/web` devDependency).

**Design spec:** `docs/superpowers/specs/2026-07-13-warp-resumable-transfers-design.md` (read it — every task traces to a pillar there).

## Global Constraints

- **Mobile-first:** every UI branch must work at 360–430px with zero horizontal overflow; branch with `useIsMobile()`. Match existing inline-`style` design tokens (bg `#121110`, ink `#efe9da`, accent `var(--acc)`, amber `var(--amb)`, fonts Bricolage/Archivo/JetBrains Mono).
- **$0 / no card:** Cloudflare free only. No TURN. STUN-only. The server stays a **dumb relay** — never sees/stores/understands a file byte. The DO reclaim record is room-membership metadata only.
- **`SEND_HIGH_WATER` stays 8 MiB** (well below Chrome's 16 MiB SCTP cap). Do not touch backpressure sizing.
- **Never mint room codes on the client.** Server owns codes (`^[A-HJ-KM-NP-Z2-9]{6}$`). Sender joins with NO room and uses `joined.room`.
- **Keep the 8s keepalive ping.**
- **Commit style:** `git -c user.name="Ishan" -c user.email="ishannaik7@gmail.com" commit`, end message with `Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>`. Commit + push to `main` after each task (Ishan follows from GitHub). Never rebase.
- **Verify gate before deploy:** `pnpm --filter @warp/web build` (runs tsc + vite) and `pnpm --filter @warp/server test` green; both `*.check.mjs` harnesses green.

**Increment boundaries:** Tasks 1–9 = core-C (ship + deploy after Task 9). Tasks 10–12 = C+ reload resume. Task 8 = server (H6=A). Do core-C end-to-end before C+.

---

## File structure

| File | Responsibility | Tasks |
|---|---|---|
| `web/src/lib/wrap/transfer.ts` | wire types + `fileKey`/`newResumeToken` helpers + statuses | 1 |
| `web/src/lib/wrap/receiveController.ts` (new) | hook-owned durable receive sink (memory/disk), `bytesWritten`, poison, finalize | 2 |
| `web/src/lib/wrap/peer.ts` | sink-agnostic receive via injected controller; offset-aware send; `file-begin.offset` echo | 3,4 |
| `web/src/lib/wrap/useWrapTransfer.ts` | own the `ReceiveController` registry; token-gated auto-resume; salvage identity map; cancelled-keys; non-terminal reconnect; strategy select | 5,6,9 |
| `web/src/lib/wrap/signaling.ts` | never-give-up reconnect; online/offline/visibility triggers; retryable `room-not-found` | 7 |
| `server/src/index.js` | DO reclaim record + alarm (H6=A) | 8 |
| `web/src/transfer/SessionView.tsx` + `TransferFlow.tsx` | live resuming/reconnecting UI, honest banner | 9 |
| `web/src/lib/wrap/idbStage.ts` (new) | IDB chunk staging + persisted `resumes` handle store | 6,10,11 |
| `web/src/lib/wrap/*.check.mjs` | two-peer + controller + idb harness tests | all |

---

## Task 1: Wire-protocol types & identity helpers (`transfer.ts`)

**Files:**
- Modify: `web/src/lib/wrap/transfer.ts`
- Test: `web/src/lib/wrap/transfer.check.mjs` (new)

**Interfaces:**
- Produces: `fileKey(file: {name:string;size:number;lastModified:number}): string`; `newResumeToken(): string`; `OfferItem` gains `key: string; resumeToken: string`; new control messages `{t:"accept";batchId;resume?:Record<string,number>}`, `{t:"file-begin";id;offset:number}`; `TransferStatus` gains `"reconnecting"`.

- [ ] **Step 1: Write the failing test** — `web/src/lib/wrap/transfer.check.mjs`

```js
import assert from "node:assert";
import { fileKey, newResumeToken } from "./transfer.ts"; // esbuild transpiles (see peer.check.mjs pattern)
// NOTE: run via the esbuild-transpile shim; if importing .ts directly fails, mirror peer.check.mjs's build step.

const a = { name: "clip.mp4", size: 1234, lastModified: 42 };
assert.equal(fileKey(a), fileKey({ ...a }), "fileKey is stable for identical name+size+mtime");
assert.notEqual(fileKey(a), fileKey({ ...a, lastModified: 43 }), "mtime change → different key");
assert.notEqual(fileKey(a), fileKey({ ...a, size: 9999 }), "size change → different key");
const t1 = newResumeToken(), t2 = newResumeToken();
assert.ok(/^[a-z0-9]{8,}$/.test(t1), "token is a non-trivial id");
assert.notEqual(t1, t2, "tokens are unique per call");
console.log("OK: transfer.ts identity helpers");
```

Because `transfer.ts` is pure TS, use the same esbuild transpile shim `peer.check.mjs` uses (copy its `try { import('esbuild') … }` block, entry = `transfer.ts`). Keep it dependency-free.

- [ ] **Step 2: Run to verify it fails** — `cd web && node src/lib/wrap/transfer.check.mjs` → FAIL (`fileKey` not exported).

- [ ] **Step 3: Implement** in `transfer.ts`:

```ts
/** Stable per-file identity for resume matching (name + size + mtime). */
export function fileKey(f: { name: string; size: number; lastModified: number }): string {
  return `${f.name}␟${f.size}␟${f.lastModified}`; // U+241F (symbol) avoids collision with names containing spaces
}
/** Random, unguessable per-file token minted by the sender; gates auto-resume. */
export function newResumeToken(): string {
  return Math.random().toString(36).slice(2, 10) + Math.random().toString(36).slice(2, 10);
}
```

Add `key: string;` and `resumeToken: string;` to `OfferItem`. Add `resume?: Record<string, number>;` to the `{ t: "accept" }` variant and `offset: number;` to the `{ t: "file-begin" }` variant of `ControlMessage`. Add `"reconnecting"` to `TransferStatus`.

- [ ] **Step 4: Run to verify it passes** — `node src/lib/wrap/transfer.check.mjs` → `OK`.

- [ ] **Step 5: Commit** — `feat(wrap): resume wire-protocol types + fileKey/resumeToken helpers`.

---

## Task 2: `ReceiveController` — durable receive sink (`receiveController.ts`)

The single most correctness-critical unit (Fable H1). Owns one in-flight file's bytes; counts `bytesWritten` **after** each write resolves; poisons on failure. Memory and disk modes.

**Files:**
- Create: `web/src/lib/wrap/receiveController.ts`
- Test: `web/src/lib/wrap/receiveController.check.mjs` (new)

**Interfaces:**
- Produces:
```ts
export interface ReceiveSink {
  readonly bytesWritten: number;        // durable count (post-resolve)
  readonly failed: boolean;
  append(buf: ArrayBuffer): void;       // enqueues; updates bytesWritten after resolve
  quiesce(): Promise<void>;             // resolves when all queued writes settle
  finalize(): Promise<Blob | null>;     // memory → Blob; disk → null (closes writable)
  abort(): Promise<void>;               // discard partial (cancel)
}
export function memorySink(): ReceiveSink;
export function diskSink(open: () => Promise<FsWritable>): ReceiveSink; // opens lazily as chain head
```

- [ ] **Step 1: Write the failing test** — `receiveController.check.mjs` (esbuild shim; entry `receiveController.ts`):

```js
import assert from "node:assert";
import { memorySink, diskSink } from "./receiveController.ts";
const buf = (s) => new TextEncoder().encode(s).buffer;

// memory sink: bytesWritten is exact, finalize reassembles
const m = memorySink();
m.append(buf("hello ")); m.append(buf("world"));
await m.quiesce();
assert.equal(m.bytesWritten, 11, "memory bytesWritten counts all appended bytes");
const blob = await m.finalize();
assert.equal(await blob.text(), "hello world", "memory finalize reassembles");

// disk sink: writes go to the writable in order; bytesWritten counts AFTER resolve
const written = [];
let closed = false;
const d = diskSink(async () => ({
  async write(chunk){ await Promise.resolve(); written.push(Buffer.from(chunk)); },
  async close(){ closed = true; },
}));
d.append(buf("AB")); d.append(buf("CD"));
await d.quiesce();
assert.equal(Buffer.concat(written).toString(), "ABCD", "disk writes land in order");
assert.equal(d.bytesWritten, 4, "disk bytesWritten counts durable bytes");
await d.finalize();
assert.equal(closed, true, "disk finalize closes the writable");

// poison: a rejecting write flips failed and stops advancing bytesWritten
const bad = diskSink(async () => ({ async write(){ throw new Error("disk full"); }, async close(){} }));
bad.append(buf("XYZ"));
await bad.quiesce();
assert.equal(bad.failed, true, "a rejected write poisons the sink");
assert.equal(bad.bytesWritten, 0, "poisoned sink does not advance bytesWritten");
console.log("OK: receiveController durable-write accounting");
```

- [ ] **Step 2: Run to verify it fails** — `node src/lib/wrap/receiveController.check.mjs` → FAIL (module missing).

- [ ] **Step 3: Implement** `receiveController.ts`:

```ts
import type { FsWritable } from "./peer";

export interface ReceiveSink {
  readonly bytesWritten: number;
  readonly failed: boolean;
  append(buf: ArrayBuffer): void;
  quiesce(): Promise<void>;
  finalize(): Promise<Blob | null>;
  abort(): Promise<void>;
}

export function memorySink(): ReceiveSink {
  const chunks: ArrayBuffer[] = [];
  let bytes = 0;
  return {
    get bytesWritten() { return bytes; },
    get failed() { return false; },
    append(buf) { chunks.push(buf); bytes += buf.byteLength; },
    async quiesce() {},
    async finalize() { return new Blob(chunks); },
    async abort() { chunks.length = 0; },
  };
}

export function diskSink(open: () => Promise<FsWritable>): ReceiveSink {
  let bytes = 0;
  let failed = false;
  let writable: FsWritable | undefined;
  // Chain head opens the writable; every append chains behind it. bytesWritten is
  // incremented ONLY after write() resolves (Fable H1) so a resumed offset is durable.
  let chain: Promise<void> = (async () => { writable = await open(); })().catch((e) => { failed = true; throw e; });
  return {
    get bytesWritten() { return bytes; },
    get failed() { return failed; },
    append(buf) {
      chain = chain.then(async () => {
        if (failed || !writable) return;
        await writable.write(buf);
        bytes += buf.byteLength; // durable: after resolve
      }).catch(() => { failed = true; }); // poison; never swallow silently upstream reads `failed`
    },
    async quiesce() { try { await chain; } catch { /* failed flag already set */ } },
    async finalize() { await this.quiesce(); if (!failed) await writable?.close(); return null; },
    async abort() { try { await chain; } catch {} try { await (writable?.abort ? writable.abort() : writable?.close()); } catch {} },
  };
}
```

- [ ] **Step 4: Run to verify it passes** — `node src/lib/wrap/receiveController.check.mjs` → `OK`.

- [ ] **Step 5: Commit** — `feat(wrap): ReceiveSink with durable-write accounting + poison-on-failure`.

---

## Task 3: `WrapPeer` receives through an injected sink (`peer.ts`)

Make receive bookkeeping sink-agnostic so the hook can own it across rebuilds. `WrapPeer` gets a `ReceiveHost` callback set: `beginReceive(key, item, target?) → ReceiveSink`, `sinkFor(id) → ReceiveSink | undefined`. Keep the standalone default (a per-peer map of memory/disk sinks) so `peer.check.mjs` still passes without a hook.

**Files:**
- Modify: `web/src/lib/wrap/peer.ts` (`startIncoming` 813-842, `onChunk` 844-861, `finishIncoming` 874-916, `acceptOffer` 532-563, `applyCancel` 600-621)
- Test: `web/src/lib/wrap/peer.check.mjs` (existing — must stay green)

**Interfaces:**
- Consumes: `ReceiveSink`, `memorySink`, `diskSink` (Task 2).
- Produces: `WrapPeer` constructor gains optional 4th arg `host?: ReceiveHost` where
```ts
export interface ReceiveHost {
  begin(key: string, id: string, item: TransferItem, target?: AcceptTarget): ReceiveSink;
  get(id: string): ReceiveSink | undefined;
  end(id: string): void;
}
```
When `host` is absent, `WrapPeer` uses an internal `DefaultReceiveHost` (memory/disk sinks keyed by id) preserving today's behavior.

- [ ] **Step 1: Add a failing assertion to `peer.check.mjs`** — after the existing disk-stream block, assert `bytesWritten`-based reassembly still exact AND that an offset accept works (deferred to Task 4; here just keep parity). Add:

```js
// sink parity: the in-memory round-trip still reassembles byte-exact after refactor
assert.equal(text, "hello wrap world", "post-sink-refactor in-memory reassembly is byte-exact");
```

(The existing asserts already cover this; Step 1 is really "run the existing harness after refactor.")

- [ ] **Step 2: Run existing harness to establish red/green baseline** — `node src/lib/wrap/peer.check.mjs`. Expected: PASS *before* refactor; you're refactoring without breaking it.

- [ ] **Step 3: Implement** — replace the direct `inc.chunks`/`inc.writable` bookkeeping in `startIncoming`/`onChunk`/`finishIncoming` with calls through the host:
  - `startIncoming(id)`: `const sink = this.host.begin(key, id, item, target)` (compute `key` from the item — carry `key` onto the receive `TransferItem` in `acceptOffer` from the offer manifest). Store `{item, sink}` as `this.incoming`.
  - `onChunk(buf)`: `inc.sink.append(buf); inc.item.transferred = resumeBase + inc.sink.bytesWritten;` (see Task 4 for `resumeBase`). Emit throttled (Task 9).
  - `finishIncoming(id)`: `await inc.sink.quiesce(); if (inc.item.transferred !== inc.item.size || inc.sink.failed) { … mark error; sink.abort(); return; } const blob = await inc.sink.finalize();` then emit `file-received` (blob for memory, `savedToDisk` for disk — `finalize` returns null for disk).
  - `applyCancel`: route the abort through `this.host.get(id)?.abort()` and `this.host.end(id)`.
  - Add `DefaultReceiveHost` implementing `ReceiveHost` with `memorySink()` / `diskSink(() => target…createWritable())` and the `uniqueName` de-dupe (moved from peer into the default host).

- [ ] **Step 4: Run harness** — `node src/lib/wrap/peer.check.mjs` → all existing asserts PASS (offer/accept/decline/disk/cancel round-trip unchanged).

- [ ] **Step 5: Commit** — `refactor(wrap): WrapPeer receives through an injectable ReceiveHost/Sink`.

---

## Task 4: Offset-resume send + `file-begin.offset` echo (`peer.ts`)

**Files:**
- Modify: `web/src/lib/wrap/peer.ts` (`offerFiles` 405-494, `streamFile` 647-687, `onControl` accept 750-758, `startIncoming`)
- Test: `web/src/lib/wrap/peer.check.mjs`

**Interfaces:**
- Consumes: Task 1 protocol, Task 3 host.
- Produces: `offerFiles` stamps `key`+`resumeToken` per item; on `accept` it reads `msg.resume?.[id]`, sends `{t:"file-begin", id, offset}`, streams `file.slice(offset)`, inits send-item `transferred=offset`. Receiver: on `file-begin` with `offset`, sets `resumeBase=offset` for the item; if `offset !== sink.bytesWritten` for an existing partial, it must NOT append (error the entry).

- [ ] **Step 1: Write failing test** in `peer.check.mjs` — resume streams only the tail:

```js
// --- resume: an accept carrying resume{offset} streams only the tail ---
const big = new Blob(["ABCDEFGHIJ"], { type: "text/plain" }); // 10 bytes
big.name = "ten.txt"; big.slice = Blob.prototype.slice;
const oSeen = waitFor(receiver, "incoming-offer");
const sendR = sender.offerFiles([big]);
const o = await oSeen;
assert.ok(o.items[0].key && o.items[0].resumeToken, "offer carries key + resumeToken");
// Simulate the receiver already holding 6 bytes: accept with resume offset 6.
let beganOffset = -1;
const origHandle = receiver.onControl?.bind(receiver);
// capture file-begin offset via a transfer spy instead (public surface):
const gotR = waitFor(receiver, "file-received");
receiver.acceptOffer(o.batchId, undefined, { [o.items[0].id]: 6 }); // NEW 3rd arg: resume map
const recv = await gotR;
// The receiver only received bytes from offset 6 → "GHIJ" appended to its 6 preloaded bytes.
// For this unit test we preload the sink; assert the sender sent exactly the 4-byte tail:
```

Because the two-peer harness doesn't preload receiver bytes, assert at the **sender** boundary instead: spy `sCh.send` to capture binary payload total and assert it equals `size - offset`. Add before `offerFiles`:

```js
let sentBinary = 0;
const origSend = sCh.send.bind(sCh);
sCh.send = (d) => { if (d instanceof ArrayBuffer) sentBinary += d.byteLength; return origSend(d); };
```
then after `await sendR`: `assert.equal(sentBinary, big.size - 6, "resume streamed only the 4-byte tail");`

- [ ] **Step 2: Run to verify it fails** — `acceptOffer` has no 3rd arg / offset ignored → sends 10 bytes. FAIL.

- [ ] **Step 3: Implement**:
  - `offerFiles`: `const resumeToken = newResumeToken();` per file; include `key: fileKey(file), resumeToken` in each manifest item; store token on the outgoing batch.
  - Accept handling: extend the awaited accept to carry `resume` map; when streaming file `i`, `const offset = clampOffset(resume?.[id], file.size); item.transferred = offset; this.send(ch, {t:"file-begin", id, offset}); await this.streamFile(ch, file, item, offset);` where `clampOffset(v,size) = Number.isInteger(v) && v>=0 && v<=size ? v : 0`.
  - `streamFile(ch, file, item, offset=0)`: `let pos = offset` initial; read from `offset`; progress `Math.round((offset+sent)/size*100)`.
  - `acceptOffer(batchId, target?, resume?)`: pass `resume` back in the `{t:"accept", batchId, resume}` control frame; set each receive item's `transferred` to `resume?.[id] ?? 0`.
  - Receiver `startIncoming`/`file-begin`: set `resumeBase = msg.offset`; if a pre-existing sink's `bytesWritten !== msg.offset`, emit error for the item and `host.end(id)` (H2). `onChunk`: `item.transferred = resumeBase + sink.bytesWritten`.

- [ ] **Step 4: Run to verify it passes** — resume streams only the tail. PASS. Also add an assert: `acceptOffer(..., { [id]: 999 })` (offset>size) restarts at 0 (sender sends full size).

- [ ] **Step 5: Commit** — `feat(wrap): offset-resume send + file-begin offset echo (tus-style)`.

---

## Task 5: Hook-owned `ReceiveController` registry + token-gated auto-resume (`useWrapTransfer.ts`)

**Files:**
- Modify: `web/src/lib/wrap/useWrapTransfer.ts` (add registry ref; `bindPeer` host; `salvagePeer` 443-501; `accept` 545-585; `incoming-offer` handling; cancel)
- Test: `web/src/lib/wrap/useWrapTransfer.check.mjs`

**Interfaces:**
- Consumes: Task 2 sinks, Task 3 `ReceiveHost`, Task 4 resume map.
- Produces: `receiveReg: Map<key, { sink, item, size, resumeToken, active, ownerToken, target? }>`; `cancelledKeys: Set<key>`; a `ReceiveHost` per peer that reads/writes `receiveReg`; auto-accept a re-offer only when the key is in `receiveReg`, `!active`, `resumeToken` matches, and key ∉ `cancelledKeys`.

- [ ] **Step 1: Write failing test** in `useWrapTransfer.check.mjs` — simulate drop → registry keeps entry → re-offer with matching token auto-resumes with **no** modal; mismatched token does NOT:

```js
// After a drop mid-file, re-offer with the same key+token auto-accepts (no incoming-offer),
// resuming from the durable bytesWritten; a mismatched token surfaces the modal instead.
// (Drive via the fake signaling + two hook instances as the existing harness does.)
```
Follow the existing harness's mesh-hook simulation style; assert: (a) after a mid-file drop, `receiveReg` has the key with `bytesWritten>0`; (b) a re-offer with `{key, resumeToken:SAME}` produces NO `incoming` state and an `accept` with `resume[id]===bytesWritten`; (c) a re-offer with a different `resumeToken` DOES set `incoming` (modal).

- [ ] **Step 2: Run to verify it fails** — no registry yet. FAIL.

- [ ] **Step 3: Implement**:
  - Add `const receiveReg = useRef(new Map())` and `const cancelledKeys = useRef(new Set())`.
  - `makeHost(peerId, ownerToken)`: returns a `ReceiveHost` whose `begin` creates-or-reuses a `receiveReg` entry keyed by `key`; sets `active=true`, `ownerToken`; `get(id)` maps id→entry.sink; a chunk arriving for an entry whose `ownerToken !== this peer's` is dropped (H4 — enforce in `begin`/`get`).
  - `bindPeer` passes `makeHost(...)` into new `WrapPeer(...)`.
  - `incoming-offer` handler: for each offered item, if `receiveReg` has its `key` with `!active` and matching `resumeToken` and key ∉ `cancelledKeys` → auto `peer.acceptOffer(batchId, entry.target, { [id]: entry.sink.bytesWritten })` (await `entry.sink.quiesce()` first) and do NOT `setIncoming`. Duplicate keys within the offer (M1) → force fresh + modal. Otherwise `setIncoming` as today.
  - `salvagePeer`: keep the `receiveReg` entries (do **not** clear); set their `active=false`; keep sinks/writables open. Replace the name+size pool scan with a `Map<itemId,File>` identity map for send re-staging.
  - `cancel`/`applyCancel` path: delete the `receiveReg` entry, `sink.abort()`, add key to `cancelledKeys`.

- [ ] **Step 4: Run to verify it passes** — `node src/lib/wrap/useWrapTransfer.check.mjs` → new asserts PASS; existing PASS.

- [ ] **Step 5: Commit** — `feat(wrap): hook-owned receive registry + token-gated auto-resume (no 2nd modal)`.

---

## Task 6: OOM fallback — IndexedDB staging + `storage.estimate`/iOS cap (`idbStage.ts`, `useWrapTransfer.ts`)

**Files:**
- Create: `web/src/lib/wrap/idbStage.ts`
- Modify: `web/src/lib/wrap/useWrapTransfer.ts` (`accept` strategy select), `receiveController.ts` (add `idbSink`)
- Test: `web/src/lib/wrap/idbStage.check.mjs` (new, uses `fake-indexeddb` — **do not add a dep**; instead unit-test the pure offset/gate logic and stub IDB)

**Interfaces:**
- Produces: `estimateFits(sizeBytes): Promise<{ok:boolean; reason?:string}>` (checks `navigator.storage.estimate()` AND a hard iOS cap ~1 GiB via UA sniff); `idbSink(fileId): ReceiveSink` storing **Blob** values `(fileId, offset)`; `assembleIdb(fileId): Promise<Blob>` (Blob-of-Blobs, lazy); `gcOrphanStaging(): Promise<void>`.

- [ ] **Step 1: Write failing test** — `idbStage.check.mjs`: `estimateFits` refuses when `estimate()` quota-usage < size, and refuses > cap on a faked iOS UA; the offset for a staged file = highest contiguous record boundary. Stub `navigator.storage.estimate` and a minimal in-memory IDB shim.

- [ ] **Step 2: Run to verify it fails.**

- [ ] **Step 3: Implement** `idbStage.ts` (a tiny promisified IDB wrapper, one DB `warp`, stores `staging` and `resumes`), `idbSink` storing Blob values, `estimateFits` with the iOS cap, `gcOrphanStaging` (delete staging groups older than TTL). In `accept`: strategy order = FS-Access disk → `estimateFits` ok? IDB staging : honest refuse (set `error` with a clear message) → tiny files in-memory.

- [ ] **Step 4: Run to verify it passes.**

- [ ] **Step 5: Commit** — `feat(wrap): IndexedDB staging fallback + storage/iOS-cap gate (no OOM)`.

---

## Task 7: Never-give-up reconnect (`signaling.ts`)

**Files:**
- Modify: `web/src/lib/wrap/signaling.ts` (`scheduleReconnect` 161-173, `openSocket` triggers, `dispatch` room-not-found)
- Test: `web/src/lib/wrap/signaling.check.mjs` (new; stub `WebSocket`)

**Interfaces:**
- Produces: reconnect never terminal while `!closed`; capped backoff 15s; paused when `navigator.onLine===false`; `online`/`offline`/`visibilitychange`/`connection.change` listeners force an attempt; `signaling-lost` only emitted if never joined.

- [ ] **Step 1: Write failing test** — with a stubbed always-failing `WebSocket`, assert `scheduleReconnect` keeps scheduling past attempt 8 (no `signaling-lost` once `room` is set) and that a fake `online` event triggers an immediate attempt. Assert it does NOT schedule while `navigator.onLine===false`.

- [ ] **Step 2: Run to verify it fails.**

- [ ] **Step 3: Implement** — remove the `>= 8 → signaling-lost` terminal when `this.room` is set (joined at least once); keep it only for the never-joined case. Cap backoff at 15s (`Math.min(500*2**n, 15000)`), and pause when `!navigator.onLine`. Add window listeners in `openSocket`/constructor (`online`, `visibilitychange→visible`, `navigator.connection?.addEventListener('change')`) that reset attempts and call `openSocket` if `!this.ws`. Remove listeners in `close()`.

- [ ] **Step 4: Run to verify it passes.**

- [ ] **Step 5: Commit** — `feat(wrap): never-give-up signaling reconnect (online/visibility triggers, offline pause)`.

---

## Task 8: DO reclaim record (H6=A) (`server/src/index.js`)

**Files:**
- Modify: `server/src/index.js` (webSocketClose/error handler; join handler; add `alarm()`)
- Test: `server/test.js` (existing e2e — extend)

**Interfaces:**
- Produces: on true last-close, `await state.storage.put('reclaim:'+code, {code, members, expiresAt: Date.now()+180000})` + `setAlarm`; a `join{room}` for a non-live room with a valid unexpired reclaim record re-mints the room under the same code and deletes the record; `alarm()` GCs expired records; re-validate `expiresAt` on read.

- [ ] **Step 1: Write failing test** in `server/test.js` — two clients join a room; both disconnect; a third `join{room}` within the window gets `joined` with the SAME code (not `room-not-found`). (Use the existing test harness's WS client helper.)

- [ ] **Step 2: Run to verify it fails** — `pnpm --filter @warp/server test` → the reclaim-join gets `room-not-found`. FAIL.

- [ ] **Step 3: Implement** per spec Pillar 3 mechanics: last-close detection excluding the closing socket (`ctx.getWebSockets().filter(ws => ws !== closingWs && ws.readyState === 1)`), awaited `put`, `setAlarm`, reclaim-join branch (re-mint empty room under the code, delete record, cancel/ignore alarm), `alarm()` deletes expired records. Never restore `serializeAttachment`.

- [ ] **Step 4: Run to verify it passes** — `pnpm --filter @warp/server test` green.

- [ ] **Step 5: Commit** — `feat(server): DO reclaim record so a dual-drop rejoins the same code (H6=A)`.

---

## Task 9: Live status UI + non-terminal reconnect wiring (`useWrapTransfer.ts`, `SessionView.tsx`, `TransferFlow.tsx`)

**Files:**
- Modify: `useWrapTransfer.ts` (RECONNECT_WATCHDOG non-terminal; item `reconnecting` status; room-not-found retryable; 1%-delta receive throttle in `peer.ts` onChunk emit), `SessionView.tsx` (`STATUS_COPY`/`statusColor` for `reconnecting`; RESUMING label; bar holds), `TransferFlow.tsx` (banner honest; drop stays in session; soft "other device left" terminal after window)
- Test: manual two-device + build

**Interfaces:**
- Consumes: all prior. Produces: user-visible `Resuming · N%`, `Reconnecting…`, `Waiting for <device>`; a `disconnected` drop never routes to the terminal `ErrorPanel` (except `nat-failed`).

- [ ] **Step 1:** Add `reconnecting: "RESUMING"` to `STATUS_COPY` and a color in `statusColor`; render the progress bar for `transferring || reconnecting`, holding `progress` when `reconnecting`. (`SessionView.tsx:88-102,199,298`.)
- [ ] **Step 2:** In `peer.ts` `onChunk`, throttle the `transfer` emit to ~1% deltas (keep the byte counter per-chunk; only emit when `progress` changed).
- [ ] **Step 3:** In `useWrapTransfer.ts`, make the reconnect watchdog non-terminal while items are unfinished (persistent `reconnecting`); route `disconnected`/`channel-error` to salvage (already) and never to `fail` except `nat-failed`; add the soft "other device left" state after peer-left + channel-dead + window.
- [ ] **Step 4:** `pnpm --filter @warp/web build` green (tsc + vite); then a manual two-browser run (see Task-12 verify checklist) to watch a mid-transfer drop resume with the live banner.
- [ ] **Step 5: Commit** — `feat(wrap/ui): live resuming/reconnecting status + non-terminal reconnect`. **Deploy core-C** (see verify checklist) after this task.

---

## Task 10: C+ — persist FS-Access handle + checkpoint-commit (`idbStage.ts`, `receiveController.ts`)

**Files:**
- Modify: `idbStage.ts` (`resumes` store: put/get/del handle + `{code,key,name,size,bytesCommitted,savedName}`), `receiveController.ts` (disk sink: coarse time-based checkpoint-close + reopen `keepExistingData:true`+`seek`), `peer.ts` (`FsWritable` gains `seek?(pos)`)
- Test: `idbStage.check.mjs` (extend), `receiveController.check.mjs` (extend — fake writable records `seek`)

**Interfaces:**
- Produces: `saveResume(code,key,handle,progress)`, `loadResumes(code)`, `dropResume(code,key)`; disk sink checkpoints on a ~60s timer + `visibilitychange→hidden`, reopening with `keepExistingData` + `seek(committedSize)`; NO `pagehide` close.

- [ ] Steps 1–5 (TDD): test that the disk sink, after a checkpoint, reopens with `keepExistingData:true` and `seek(committedSize)` (fake writable asserts the option + seek arg); that `saveResume`/`loadResume` round-trip a fake handle; commit `feat(wrap): C+ persist disk handle + coarse checkpoint-commit`.

---

## Task 11: C+ — reload resume flow (`useWrapTransfer.ts`, `TransferFlow.tsx`)

**Files:**
- Modify: `useWrapTransfer.ts` (on `/r/:code` mount, `loadResumes(code)`; expose `resumable` + `resumePrevious()`), `TransferFlow.tsx` ("Resume previous transfer?" prompt), `transfer.ts` (`tailHash` on resume), `peer.ts` (sender verifies tail window before streaming)
- Test: `idbStage.check.mjs` + manual reload

**Interfaces:**
- Produces: on mount with a stored partial, show a resume prompt; on click → `requestPermission({mode:'readwrite'})`, `size=(await handle.getFile()).size` truncated to frame boundary, reconnect, resume-offset = that size; receiver sends `tailHash`(last 64 KiB) in `resume`; sender verifies same window else restart.

- [ ] Steps 1–5 (TDD where unit-testable: `tailHash` compute + boundary-truncate math; the permission/getFile path is manual): commit `feat(wrap): C+ reload-resume prompt + tailHash boundary check`.

---

## Task 12: Full verify + deploy

- [ ] `pnpm --filter @warp/web build` (tsc + vite) green.
- [ ] `pnpm --filter @warp/web` run all `*.check.mjs` harnesses green: `for f in web/src/lib/wrap/*.check.mjs; do node "$f" || exit 1; done`.
- [ ] `pnpm --filter @warp/server test` green.
- [ ] **Manual two-device run** (headless VPS: use two Chromium contexts or describe to Ishan): send a ~200 MB file desktop→desktop, kill Wi-Fi mid-transfer, confirm banner shows RESUMING and the bar continues from the drop %, file arrives byte-identical (`sha256sum` both sides). Repeat with a >256 MB straight-to-disk file. Reload the receiver tab mid-transfer → resume prompt → continues.
- [ ] Deploy: `cd web && env -u CLOUDFLARE_API_TOKEN wrangler pages deploy dist --project-name=wrap --branch=main --commit-dirty=true`; `pnpm --filter @warp/server run deploy`.
- [ ] Commit any final touch; push `main`.

---

## Self-review notes (author)

- Spec coverage: Pillars 1(T1,4)/2(T2,3,5)/3(T7,8,9)/4(T6)/5(T9)/6(T10,11) all mapped; Fable H1(T2)/H2(T4)/H3,H5(T5)/H4(T5)/H6(T8)/M1,M2(T5)/M3,M4(T6)/M5(T4)/M6(T7,9)/M7(T10) mapped.
- Type consistency: `ReceiveSink`/`ReceiveHost` names used identically T2→T3→T5; `resume` map `Record<string,number>` consistent T1/T4/T5; `fileKey`/`newResumeToken` T1 used in T4/T5.
- Deploy only after Task 9 (core-C) and again after Task 12 (C+).
