# Threat Model
## Signaling Server Trust Boundary

### What the signaling server can see

The signaling server only processes the information required to establish a peer-to-peer connection. This includes:

- Room codes
- Peer IDs
- WebRTC signaling data (`signal.data`), including SDP and ICE messages
- Connection and disconnection timing
- The connecting public IP address (grouped to a /64 prefix for IPv6 to support nearby device discovery)
- Device display names (when devices use nearby discovery)
The signaling server relays signaling messages between peers without interpreting or modifying their contents.

### What the signaling server cannot see

After the WebRTC connection is established, file data is transferred directly between peers over an encrypted `RTCDataChannel`. The signaling server is not part of the data path and never receives or stores transferred file bytes.

As a result, the signaling server cannot inspect:

- File bytes
- File contents
- Data transferred over the WebRTC data channel

For additional background on the networking model, see [theory-content.md](./theory-content.md).

---

## Malicious Peer

A malicious peer is anyone who has the room code, whether they got it legitimately and turned hostile or just guessed/intercepted it (see Room Code Entropy below for how hard that is). Once joined, they are indistinguishable from any other peer at the protocol level — Warp has no separate notion of "trusted" vs "untrusted" member of a room.

### What they can do

- **Send offers, chunks, and control frames on the data channel.** `peer.ts` and `transfer.ts` don't check who's on the other end before accepting a `ControlMessage` (`offer`, `accept`, `decline`, `file-begin`, `file-end`, `cancel`, `text`) — any peer with an open channel can send any of these at any time. A malicious peer can offer a file named to look benign, cancel a transfer mid-stream, or send unsolicited text snippets.
- **Occupy a mesh slot.** Joining at all takes one of the `MAX_PEERS = 8` (`server/src/index.js:5`) slots in the room, which is a capacity cap, not a trust boundary — the server doesn't distinguish the room owner from anyone else who joined with the code.
- **Relay through the signaling server like any other peer.** `handleSignal` (`server/src/index.js:161-175`) forwards `signal` messages to whichever peer `msg.to` names, scoped to the sender's own room or discoverable network; `from` is stamped by the server from the sender's own `peerId`, so a peer cannot spoof being someone else in the relay.

### What they cannot do

- **Write file data without the receiver's explicit accept.** An `offer` only shows a modal (`useWarpTransfer.ts` `accept()`, around line 730 onward); file data does not stream until the receiving user clicks Accept. Decline (or just ignoring the offer) means zero file bytes are written, in memory or to disk — though a `text` control frame is a separate case: it's stored and surfaced without any accept step at all (see "What they can do" above).
- **Escalate through the server.** The signaling relay (`server/src/index.js`) grants no peer any privilege beyond passing messages — no admin peer, no moderator role, nothing a malicious peer could claim to get more access than a normal one.
- **Read or tamper with another peer's files in flight.** The data channel is direct and encrypted (DTLS-SRTP under WebRTC); a peer only sees the bytes offered to it, not what other peers in the room are sending each other.
- **Force their way past a receiver who declines or never accepts.** There's no separate "push" path that bypasses the offer/accept handshake.

### The gate is the room code, and it's a weak one

None of this depends on strong authentication, because there isn't any — the 6-character room code is the only thing standing between a stranger and being treated as a legitimate peer. See Room Code Entropy below for the actual math (≈29.7 bits, online-guessable, no rate limiting today per [#31](https://github.com/Ishannaik/warp/issues/31)). The honest summary: a peer inside the room has real capabilities, bounded by the receiver's own decision to accept, and getting into the room in the first place is not as hard as the bit count alone suggests.

## Room Code Entropy

The room code is the system's front-door secret: it is what stands between an outsider and being treated as a legitimate peer in someone else's room, so its resistance to guessing is the whole story for room access. It is not the system's only secret. The sender also mints a per-file `resumeToken` (`newResumeToken()`, `web/src/lib/warp/transfer.ts:180`), which authorizes resuming an already-accepted transfer so that a device already inside a mesh room cannot hijack a partial file (`docs/ARCHITECTURE.md:182`, `:184`). That token guards resumption, not entry, and its own strength is out of scope here. This section does the room-code arithmetic from the source and states the result plainly.

### The alphabet and the code

`server/src/index.js:7-8` defines both halves:

```js
const CODE_ALPHABET = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';   // no ambiguous 0/O/1/I/L
const CODE_LEN = 6;
```

The alphabet is **31 symbols**: 23 letters (A-Z minus `I`, `L` and `O`) plus 8 digits (`2`-`9`). The excluded characters are the ones that read alike when a code is spoken aloud or copied off a screen, so the exclusions buy usability and cost entropy. The server's authoritative `ROOM_RE` is built from those same two constants (`server/src/index.js:9`), and `web/src/lib/warp/roomCode.ts:10` mirrors the set client-side as `/^[A-HJ-KM-NP-Z2-9]{6}$/` for fast format checks only.

Six independent characters drawn from 31 symbols gives:

- Combinations: `31^6 = 887,503,681`
- Bits: `log2(31^6) = 6 * log2(31) = 6 * 4.9542 = 29.7252`

A Warp room code therefore carries about **29.7 bits** of entropy. State that plainly: 29.7 bits is not a strong secret. It is a rendezvous token that has to survive being read aloud over a phone call, and it should be judged against how long a room stays open, not against a password or a key.

### Where the bits come from, and the modulo bias

`makeCode()` (`server/src/index.js:61-69`) draws six bytes from the platform CSPRNG and folds each one into the alphabet:

```js
const bytes = crypto.getRandomValues(new Uint8Array(CODE_LEN));
code = '';
for (let i = 0; i < CODE_LEN; i++) code += CODE_ALPHABET[bytes[i] % CODE_ALPHABET.length];
```

`crypto.getRandomValues` is the correct source, and the `do...while (this.roomExists(code))` loop at `:63-67` only rerolls on a collision with a live room, so it does not narrow the space in any attacker-useful way.

The reduction on line 66 is where a small flaw enters. A byte holds 256 values and 256 is not a multiple of 31:

```text
256 = 8 * 31 + 8
```

Those eight leftover values fall on the first eight symbols of the alphabet, making `A` through `H` slightly more likely than the other 23:

| Symbols | Byte values mapping to it | Probability per character |
| --- | --- | --- |
| `ABCDEFGH` (8 symbols) | 9 | `9/256` = 3.5156% |
| `JKMNPQRSTUVWXYZ23456789` (23 symbols) | 8 | `8/256` = 3.1250% |
| uniform, for reference | - | `1/31` = 3.2258% |

An `A` is 1.125 times as likely as a `J`.

**Does the bias matter at this bit count? No.** Shannon entropy under that skew is 4.95221 bits per character against 4.95420 for a uniform draw, so a code lands at **29.7133 bits instead of 29.7252**, a loss of about **0.012 bits** across the whole code. For an attacker ordering guesses by likelihood, the single most probable code (all six characters drawn from `A`-`H`) is only 1.68 times more likely than any code under a uniform draw. Stated as min-entropy, the strict worst case an attacker can aim at, that is 28.98 bits against the 29.73-bit uniform figure: an advantage of about 0.75 bits. Rejection sampling (redraw when a byte lands in the ragged tail above 247) would remove the bias cleanly, and it would change the practical security of the code by roughly nothing. The bias is worth knowing about and worth fixing on style grounds. It is not what makes a 6-character code weak.

### What a brute-force attempt looks like

Guessing a code is an **online attack against the signaling server**. There is no offline component: no hash to crack, no token to grind at local CPU speed. Every guess costs one `join` message on a WebSocket (`server/src/index.js:83`, handled at `:89`), and the reply tells the attacker exactly what happened:

| Reply | Meaning | Source |
| --- | --- | --- |
| `bad-room` | Malformed code, did not match `ROOM_RE` | `:96-97` |
| `room-not-found` | Well-formed, but no live room and no unexpired reservation | `:98`, `:105-108` |
| `room-full` | **Correct code**, but the room already holds `MAX_PEERS` (8) | `:110-111`, `:5` |
| `joined` | **Correct code**, and the sender is now a peer in the mesh | `:119-120` |

Two properties make this cheap for an attacker:

1. **Every guess gets an unambiguous answer.** There is no generic failure. `room-full` even confirms a hit on a room the attacker cannot enter.
2. **A failed guess costs nothing.** The error paths return without closing the socket and without clearing the socket's attachment, and `webSocketMessage` (`server/src/index.js:76-87`) keeps no attempt counter, no backoff, and no per-IP accounting. One connection can carry an unbounded run of guesses.

The number that actually governs risk is not 887,503,681. An attacker is not searching for one fixed secret; they are searching for **any room that happens to be open right now**. With `n` rooms live concurrently, each guess succeeds with probability `n / 887,503,681`, and the expected work drops in direct proportion to how busy the service is:

| Live rooms | Probability per guess | Guesses for a 50% chance of one hit |
| --- | --- | --- |
| 1 | 1.13e-9 | ~615,000,000 |
| 10 | 1.13e-8 | ~61,500,000 |
| 100 | 1.13e-7 | ~6,150,000 |
| 1,000 | 1.13e-6 | ~615,000 |

At 100 guesses per second, sweeping the full space takes about 103 days, and the 50% mark against one live room arrives at about 71 days (615,000,000 / 100 = 6,150,000 seconds). Neither figure describes a real attack, because no room survives long enough to absorb it: a code is guessable only for its live session plus the three-minute reclaim window below. What an attacker actually accumulates is guesses against whatever set of rooms happens to be open while they are guessing, so exposure grows with concurrent rooms, room lifetime, and attacker guess rate.

The two caps in the file are not defenses against this. `MAX_PEERS = 8` (`:5`) bounds mesh size per room, and `MAX_DISCOVER = 8` (`:6`) is a privacy guardrail on nearby-device listing. Neither one limits how many codes a client may try.

### The reclaim window widens the target

`RECLAIM_MS = 3 * 60 * 1000` (`server/src/index.js:10`) reserves a code for **three minutes** after its last socket drops. `handleGone()` writes a `reclaim:<code>` record when the room empties (`:190-193`), and `handleJoin()` checks that record before answering `room-not-found` (`:105-108`).

This exists so two devices that drop together, on a shared tunnel or train Wi-Fi, can rejoin the same rendezvous point and resume. It also means a code stays guessable for three minutes after everyone has left it. Two consequences follow:

- A code's guessable lifetime is its live session plus three minutes, so every room contributes more exposure than its actual use.
- The first reclaim-join wins and deletes the record (`:109`), and the same join turns the code back into a live room. An attacker who guesses a code inside that window gains unauthorized membership of the rendezvous point the legitimate peers were returning to. Those peers are not locked out by that alone — they still reach the room by the ordinary live-room path (`:98`, `:110-111`, `:119`) and find the attacker already inside. Denying them the rendezvous takes a further act: filling the room to `MAX_PEERS` (8) or otherwise disrupting it.

The record is best-effort GC'd by an alarm (`:203-209`), and reads re-validate expiry, so the three-minute bound holds even when the alarm is delayed. No transfer state is restored on reclaim; the server only owes the same code back.

What a successful guess gets an attacker, and what a peer inside a room can then do, belongs to the Malicious Peer section above.

### What throttles guessing today

**Nothing in this repository.** There is no per-IP join limit, no per-connection attempt cap, and no backoff on repeated `room-not-found` replies anywhere in `server/src/index.js`. The signaling server accepts guesses as fast as a client can send them, bounded only by the hosting platform's general service protections, which are not a control tuned for this.

[Issue #31](https://github.com/Ishannaik/warp/issues/31), "Rate-limit join attempts per IP in the signaling Durable Object", tracks the fix. It is **open and unmerged as of this writing**, so it is a known gap, not a shipped mitigation. Reading this doc and expecting rate limiting to be in place would be wrong.

Given that, the honest summary of the room code's strength is:

- 29.7 bits, minus a rounding error of bias, against an online-only attacker.
- Adequate for a short-lived rendezvous between two people who already trust each other.
- Not adequate as a durable secret, not a substitute for verifying who joined, and weaker in aggregate the more rooms are open at once.
- Improved most by rate limiting the guesses (#31), not by growing the alphabet.

## Client-side Attack Surface

The signaling relay is a dumb intermediary and the room code is a rendezvous secret, not a durable one. Once two browsers are on a live data channel, the remaining question is what a peer — malicious or merely buggy — can make the *other tab* do with the bytes and names it sends. This section covers the XSS/CSP gap, what a received file can and cannot reach, and what the "INTEGRITY ✓ SHA-256" claim on the hero actually verifies today.

### XSS and the missing CSP

`web/public/_headers` sets five headers (`X-Content-Type-Options`, `Referrer-Policy`, `X-Frame-Options`, `Strict-Transport-Security`, `Permissions-Policy`) but no `Content-Security-Policy`. There is no defense-in-depth layer against script injection: if an XSS bug ever exists anywhere in the render path — a received filename, a text-snippet message, a dependency (`qrcode`, `fflate`) — there's nothing today stopping injected script from running with the page's full origin, including `fetch` to arbitrary hosts and read access to whatever the tab holds in memory (in-flight file blobs, the signaling WebSocket).

React escapes JSX children and attributes by default, so a received filename or a text snippet rendered as `{name}` cannot inject markup. The one place that bypasses that guard is the QR code in `web/src/transfer/TransferFlow.tsx`, which sets `dangerouslySetInnerHTML` from `qrSvg` — but that string is the output of the `qrcode` library encoding the room's own share URL, not attacker-controlled peer input, so it isn't a peer-reachable injection point. No other `dangerouslySetInnerHTML` exists in `web/src`.

That leaves the CSP gap itself as the open item: a same-origin defense that would contain the blast radius of a future bug (in this codebase or a dependency) is simply absent. [Issue #48](https://github.com/Ishannaik/warp/issues/48) tracks adding it, starting Report-Only before enforcing. It is **open and unmerged as of this writing**.

### What a received file can do

Warp never auto-opens, auto-executes, or auto-previews a received file. The receive path (`web/src/lib/warp/receiveController.ts`, `web/src/lib/warp/useWarpTransfer.ts`) is write-only plumbing:

- `memorySink()` and `diskSink()` (`receiveController.ts:46-133`) only ever call `Blob(...)`/`writable.write(buf)` against a `FileSystemWritableFileStream` opened from an explicit `showSaveFilePicker`/`showDirectoryPicker` call. Neither sink reads back or interprets file contents — a poisoned write (`failed`) just stops the byte count from advancing.
- Getting bytes onto disk or into the tray at all requires the recipient to click **Accept** on the offer modal (`useWarpTransfer.ts` `accept()`, around line 730 onward). Nothing streams before that gesture.
- Handing a file to the OS is a second explicit action: `downloadOne`/`downloadAll` (`useWarpTransfer.ts:864-914`) build a transient `URL.createObjectURL` anchor and call `.click()` themselves, only in response to the user clicking a download button in the tray — the browser's own save-file/open-file prompt is what runs next, same as any other same-origin download link. The `savedToDisk` case (large batches via the File System Access API) writes straight into the folder or file handle the user picked at accept time; there is no separate reveal-and-run step.

So a malicious peer can name a file `evil.exe` or `report.pdf.scr` and send arbitrary bytes, but Warp treats that identically to any other browser download: it lands where the user chose to put it, and the OS's own execute-on-open behavior (or lack of it) is what governs from there, not anything Warp does.

### File-integrity story: what's wired up today

The hashing infrastructure (`web/src/lib/warp/hash.ts`, `hashWorker.ts`) exists and runs on both ends of a transfer: `peer.ts` opens a `createHashSession()` for a fresh (non-resumed) send at line 792 and a fresh receive at line 1004, feeds it every chunk, and emits a `hash-computed` event with the resulting SHA-256 hex digest once the file completes (`peer.ts:839-840`, `:1089-1090`).

That is where it stops. Grepping the codebase for consumers of `hash-computed` turns up none — no listener in `useWarpTransfer.ts`, no UI component reads a digest. The sender's digest is never put on the wire (no field in the offer/manifest or a `file-end` message carries it), so the receiver has no value to compare its own digest against. Today's SHA-256 is two independent local checksums with no cross-peer verification and no user-visible result.

The hero's **"INTEGRITY ✓ SHA-256"** claim (`web/src/hero/Hero.tsx:45`) currently rests on the transfer's resume mechanism, not on this hashing: `bytesWritten` is only advanced after a disk/memory write resolves (`receiveController.ts:6-18`), and the manifest's declared byte count is what resume and completion are checked against. That guards against dropped or truncated writes, not against bit-level corruption that preserves length, and it says nothing about a compromised or malicious peer sending bytes that don't match what it claims to be sending.

[Issue #6](https://github.com/Ishannaik/warp/issues/6) is what would close the gap: transmit the sender's digest, compare it on receipt, and surface a real verified badge (or a failure) instead of the current silent, uncompared local hash. It is **open and unmerged as of this writing**.

## Known open items

| Item | Status | Tracking issue |
| --- | --- | --- |
| No `Content-Security-Policy` header | Open | [#48](https://github.com/Ishannaik/warp/issues/48) |
| SHA-256 digests computed but never compared cross-peer (no verified badge) | Open | [#6](https://github.com/Ishannaik/warp/issues/6) |
| No rate limit on signaling `join` guesses (room-code brute force) | Open | [#31](https://github.com/Ishannaik/warp/issues/31) |
