# warp (CLI)

Send files between terminals, or between a terminal and a browser, straight
peer to peer. It speaks the same protocol as [warp.ishannaik.com](https://warp.ishannaik.com),
so a laptop running `warp` and a phone with the web app can swap files. The
signaling server only brokers the handshake. Your bytes never touch it.

## Usage

```bash
warp send photo.png notes/          # files and folders; prints a code
warp send --text "the wifi password is on the fridge"

warp K7P2QR                         # receive on the other machine
warp anchor quartz rocket bamboo lotus   # or type the five code words
warp                                # no code: it asks for one
```

The sender also prints a browser link (`https://warp.ishannaik.com/r/K7P2QR`)
for a receiver without the CLI.

Receive options:

| flag | does |
|---|---|
| `--out DIR` | save into DIR (default: current folder) |
| `-y`, `--yes` | accept without asking |
| `--overwrite` | replace existing files (default saves `name (1).ext`) |
| `WARP_CODE=...` | pass the code by env so it stays out of `ps` |

Files arrive as `name.warp-part` and get renamed when complete, so a half
file never looks finished. Folder sends keep their structure. A sender can't
write outside `--out`: the CLI drops `..`, absolute paths and drive letters
from incoming names.

## Build

```bash
cd cli
cargo build --release      # binary: target/release/warp
```

Needs Rust 1.87+.

## What it checks

- **Piece manifest (#137).** Files from 1 MiB to 2 GiB carry a SHA-256 per
  piece. The receiver writes only verified pieces, in order, and asks for a bad
  piece again by index. The last line for each file tells you which check ran:
  `N pieces verified` or `size checked`.
- **Backpressure.** The sender waits while more than 4 MiB sits in the send
  buffer, so a multi-GB file doesn't end up in RAM.
- **Pause and resume.** A browser on the other end can pause and resume. The
  CLI sender stops without `file-end` and offers the file again when you
  resume, like the web sender.

## Tested

`tests/browser-interop.mjs` drives headless Chromium 151 on the web app
against the binary and compares SHA-256 on both sides. Last run:

| direction | sizes | pause/resume |
|---|---|---|
| browser → CLI | 3 MB, 40 MB | yes |
| CLI → browser | 3 MB, 40 MB | yes |
| CLI → CLI | 3 MB, folder + text + five words | n/a |

```bash
cd web
pnpm build && pnpm exec vite preview --port 4391 &
WARP_SITE=http://localhost:4391 NO_MDNS=1 \
  node ../cli/tests/browser-interop.mjs ../cli/target/release/warp browser-send
```

Unit tests (`cargo test --lib`) cover the manifest wire format, the verifier,
path sanitising and the code words. One of them checks the word list against
`shared/codewords.js`, so the two can't drift. `cargo test --test live_signaling`
joins rooms on the production worker.

## Known limits

- **STUN only, like the web app.** Two peers behind strict NATs get an error
  and no relay.
- **Same-LAN with a browser is untested.** Chrome hides local IPs behind
  `<uuid>.local` names. The CLI resolves them over mDNS, but the test box is a
  cloud VM without multicast, so the tests run Chrome with that hiding off.
- **Re-sending a bad piece over 64 KiB.** webrtc-rs can't send a frame over
  64 KiB, and a re-sent piece must go as one frame. The CLI hashes 64 KiB
  pieces up to 32 MiB files, so those re-send fine. For bigger files it cancels
  that file with a message. Over a DTLS channel a bad piece is rare.
- **The CLI receiver restarts from zero** after the sender pauses. It doesn't
  ask for a resume offset.
- **Throughput** measured 2.5 to 3.5 MB/s between Chrome and the CLI on one
  machine. webrtc-rs SCTP is the ceiling there; nobody has tuned it yet.

## Debugging

```bash
WARP_DEBUG=1 warp K7P2QR               # ICE candidates and connection states
RUST_LOG=webrtc=info,dtls=debug warp K7P2QR   # library logs
```

## Why webrtc 0.17

webrtc-rs 0.12 took the first key-exchange group in the browser's DTLS
ClientHello. Chrome 151 lists a post-quantum group first, which webrtc-rs
doesn't support, so every handshake with the CLI as DTLS server died with
`invalid named curve`. 0.17 skips groups it doesn't know. 0.20+ is a sans-IO
rewrite with a different API.

## Layout

- `src/protocol.rs`: wire types matching `web/src/lib/warp/transfer.ts`,
  `signaling.ts` and `pieceManifest.ts`; the piece verifier; code words.
- `src/signaling.rs`: WebSocket client with the 8 s keepalive ping.
- `src/peer.rs`: STUN-only peer connection, detached data channel (webrtc-rs's
  own read loop uses a 65,535-byte buffer, one byte short of Chrome's 64 KiB
  chunks), queued ICE candidates, backpressure.
- `src/main.rs`: `send` and receive flows.
- `src/ui.rs`: progress bars in the Warp palette.
