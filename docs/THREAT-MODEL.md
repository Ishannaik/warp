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

(To be documented.)

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

```
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

Sweeping the full space at 100 guesses per second takes about 103 days, so a single low-traffic room is not realistically brute-forced. The exposure grows with adoption, not with time.

The two caps in the file are not defenses against this. `MAX_PEERS = 8` (`:5`) bounds mesh size per room, and `MAX_DISCOVER = 8` (`:6`) is a privacy guardrail on nearby-device listing. Neither one limits how many codes a client may try.

### The reclaim window widens the target

`RECLAIM_MS = 3 * 60 * 1000` (`server/src/index.js:10`) reserves a code for **three minutes** after its last socket drops. `handleGone()` writes a `reclaim:<code>` record when the room empties (`:190-193`), and `handleJoin()` checks that record before answering `room-not-found` (`:105-108`).

This exists so two devices that drop together, on a shared tunnel or train Wi-Fi, can rejoin the same rendezvous point and resume. It also means a code stays guessable for three minutes after everyone has left it. Two consequences follow:

- A code's guessable lifetime is its live session plus three minutes, so every room contributes more exposure than its actual use.
- The first reclaim-join wins and deletes the record (`:109`). An attacker who guesses a code inside that window occupies the rendezvous point before the legitimate peers return, which denies them the reclaim they were relying on.

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

(To be documented.)