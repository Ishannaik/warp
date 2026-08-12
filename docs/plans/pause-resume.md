# Pause and resume a transfer in flight

## The short version

Most of this already exists. Warp can already stop a file mid-send and pick it
up later from a durable byte offset, because that is what it does when the
network drops. What is missing is a button that triggers the same machinery on
purpose, and a state that says "held by the user" rather than "held by a
failure".

So this is not a new transfer mode. It is a deliberate trigger for the path
`reconnecting` already walks.

## What exists today

| Piece | Where | What it does |
|---|---|---|
| Out-of-band cancel | `peer.ts:853` | `signaling.signal(remoteId, {kind:"cancel", id})` jumps the byte backlog |
| In-band cancel | `peer.ts:856` | `{t:"cancel", id}` on the data channel |
| Pump abort check | `peer.ts:946` | `cancelledIds.has(item.id)` per chunk, exits the loop |
| Offset resume | `transfer.ts:88` | `file-begin` carries `offset`, always in plaintext bytes |
| Durable sink | `receiveController.ts` | bytes count only after the write resolves |
| Auto-resume | `useWarpTransfer.ts:415` | a re-offer with a matching `resumeToken` skips the modal and continues from the durable offset |
| Held state | `transfer.ts:113` | `reconnecting`: "holding progress, will resume" |

The load-bearing detail: **cancel poisons the receive sink** via
`cancelledKeysRef` (`useWarpTransfer.ts:299`) so a later re-offer will not
auto-resume. Pause must do the opposite and leave the sink healthy. That single
difference is most of the correctness of this feature.

## Design

### Sender

Add `pausedIds: Set<string>` beside `cancelledIds`. In the pump loop
(`peer.ts:946`), check it in the same place as the cancel check:

```ts
if (this.pausedIds.has(item.id)) {
  this.pausedIds.delete(item.id);
  return false;                 // leave the loop WITHOUT sending file-end
}
```

Returning without `file-end` is what keeps the receiver's sink open. The
receiver has already written every byte it acknowledged, so its durable offset
is correct with no extra bookkeeping.

`pause(id)` mirrors `cancel(id)`: send `{kind:"pause", id}` out of band so it
beats the byte backlog, and `{t:"pause", id}` in band for ordering. Set status
to `paused`.

### Receiver

On either pause frame, mark the item `paused` and **leave the sink alone**. Do
not add the key to `cancelledKeys`. That is the whole receiver change.

### Resume

`resume(id)` re-offers the file with the same `resumeToken`. The existing
auto-resume path in `useWarpTransfer.ts:415` sees a known key with a healthy
sink and continues from the durable offset. No new protocol.

The one guard needed: a paused item must not be auto-resumed by an unrelated
reconnect. Track paused keys in a `pausedKeysRef` and skip them in the
auto-resume branch until the user asks.

### Status

Add `paused` to `TransferStatus`:

```ts
| "paused"   // held by the user; sink intact, will continue from the durable offset
```

### UI

A pause/resume toggle beside the existing cancel control
(`TransferFlow.tsx:212`). Paused rows keep their progress bar filled to the held
percentage rather than resetting or reading as failed.

Mobile: the control must work at 360px without pushing the row into horizontal
overflow, so it replaces the cancel affordance in a two-button group rather than
adding a third element to the same line.

## Wire protocol

Two new frames, both mirroring cancel exactly:

```ts
| { t: "pause"; id: string }
```

and out of band, `{ kind: "pause", id }`.

Nothing else changes. `file-begin` already carries `offset`, so resume needs no
new frame.

## What could go wrong

**Pausing during the drain wait.** The pump can be parked in
`waitForDrain()` when the pause lands. The check must come after the drain
returns, on the next chunk boundary, not inside the wait. The existing cancel
check has the same shape and is the model.

**Pausing a file the manifest is verifying.** With a piece manifest in play
(`pieceManifest.ts`), the receiver appends only verified pieces. A pause
mid-piece must leave the partial piece unappended, so the durable offset stays
on a piece boundary. This falls out of the existing rule that bytes count only
after the write resolves, but it needs a test.

**Pause then network drop.** The item is already `paused`; a drop must not
flip it to `reconnecting` and silently auto-resume. This is what `pausedKeysRef`
guards.

**Pause on a receive-side item.** Either side can pause. The receiver's pause
must reach the sender to stop the pump, which is why the out-of-band frame
matters: an in-band-only pause would sit behind megabytes of queued file data.

## Tests

In `peer.check.mjs`:
- pause mid-stream stops the pump and sends no `file-end`
- the receiver's sink retains exactly the bytes acknowledged before the pause
- resume continues from that offset and the file completes with correct bytes
- pause during a drain wait takes effect on the next chunk, not mid-chunk

In `useWarpTransfer.check.mjs`:
- a paused key is not auto-resumed by an unrelated reconnect
- an explicit resume clears the paused key and continues
- cancel after pause poisons the sink; resume after that surfaces the modal

## Scope

Out of scope: pausing a whole batch as one action, and persisting a paused state
across a page reload. Both are reasonable follow-ups. Reload already has its own
resume path via the ledger, and mixing the two in one change would make the
failure modes hard to reason about.
