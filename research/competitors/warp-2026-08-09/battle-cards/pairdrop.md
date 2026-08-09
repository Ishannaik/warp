# Battle card: PairDrop

Generated 2026-08-09.

## Who they are

The Snapdrop successor, and the strongest direct competitor. 11,138 stars,
GPL-3.0, one primary maintainer with 81 contributors. [Data, gh api 2026-08-09]

## Where they genuinely win

Say these out loud rather than pretending otherwise.

- **Persistent device pairing.** Pair once with a 6-digit code, reconnect later
  without exchanging anything. Warp has this filed as #41 and unbuilt.
- **Installable PWA and OS share-sheet integration.** Sending from a phone's
  share menu is a materially better flow than opening a tab. Warp: #34, #35,
  both unbuilt.
- **TURN fallback.** When both peers sit behind symmetric NAT, PairDrop
  completes the transfer and Warp shows an error.
- **Scale.** 11,138 stars against 10.

## Where they lose

- **No tagged release since 2025-02-24**, eighteen months. Code still moves
  (last push 2026-04-22) but nothing ships to users. [Data]
- **No resume.** An interrupted transfer starts over. This is the single most
  requested missing capability in the voice-of-customer research.
- **No pause.**
- **No per-piece integrity check.**

## The honest answer to "why not just use PairDrop"

For most people, on most transfers, PairDrop is the better choice today. It is
more polished, installable, and has a relay for hard networks.

Warp wins in one specific situation: a large file over an unreliable connection.
PairDrop restarts from zero when the link drops. Warp resumes from the last
durable byte and re-sends only the tail. If the transfer is 30 GB and the wifi
is flaky, that is the difference between finishing and never finishing.

If the transfer is a 4 MB photo on stable wifi, there is no reason to prefer
Warp, and claiming otherwise in copy will get caught.
