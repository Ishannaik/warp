# Battle card: Wormhole (wormhole.app)

Generated 2026-08-09.

## Who they are

The polished, design-led browser transfer product, built by Feross Aboukhadijeh
and John Hiesey. Closed source. The team's attention has moved to Socket, their
security company. [Data]

## Where they genuinely win

- **The best-looking product in the category.** Warp's design is good; theirs is
  the benchmark.
- **Brand and reach.** They own "Firefox Send replacement" search traffic.
- **Files survive a closed tab** for transfers under 5 GB, because those are
  cached server-side. That is a real convenience Warp deliberately cannot match.

## Where they lose

- **They store your files.** Up to 5 GB, encrypted, on their servers, for 24
  hours. [Data] Only larger transfers go direct peer to peer.
- **Closed source, so the encryption claim cannot be checked.** Only the
  `wormhole-crypto` library is open, and its last npm publish was
  **2021-06-25**. [Data]
- **Effectively unmaintained.** No dated product features in 2025 or 2026.
- Users say so directly:

  > "wormhole.app is closed source, we actually dont know what they are doing
  > with the data"
  > — r/webdev, January 2026

## The honest answer to "why not just use Wormhole"

If you want the file to sit somewhere for a day so the recipient can grab it
later, use Wormhole. That is a genuine feature and Warp does not have it.

If you want the file to never touch anyone's server, Wormhole under 5 GB is not
that, and you cannot verify their claims because the code is closed. Warp's
signaling server relays opaque SDP blobs and never sees a file byte, and you can
read the 200 lines that prove it.

This is the sharpest contrast Warp has with any competitor. Use it carefully and
factually: their storage is encrypted and time-limited, not careless.
