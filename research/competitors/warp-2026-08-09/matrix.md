# Warp feature matrix

Generated 2026-08-09. strong / adequate / weak / missing.

| Capability | Warp | PairDrop | Snapdrop | ToffeeShare | Wormhole | LocalSend | croc |
|---|---|---|---|---|---|---|---|
| Works with no install | strong | strong | strong | strong | strong | missing | missing |
| Works across networks (not LAN-only) | strong | adequate | **missing** | strong | strong | **missing** | strong |
| Never stores a byte server-side | **strong** | adequate | strong | strong | **weak** | strong | adequate |
| Open source | strong | strong | strong | **missing** | weak | strong | strong |
| Actively maintained | strong | weak | **missing** | weak | **missing** | strong | strong |
| Resume after interruption | **strong** | missing | missing | weak | weak | weak | strong |
| Pause and resume on demand | **strong** | missing | missing | missing | missing | missing | weak |
| Per-piece integrity verification | **strong** | missing | missing | weak | adequate | weak | adequate |
| Streams to disk (no RAM ceiling) | strong | weak | weak | adequate | adequate | strong | strong |
| Native apps | missing | missing | missing | adequate | missing | **strong** | missing |
| OS share-sheet integration | missing | strong | missing | adequate | missing | strong | missing |
| Installable PWA | missing | strong | missing | adequate | missing | n/a | n/a |
| Persistent device pairing | missing | strong | missing | adequate | missing | strong | adequate |
| CLI | missing | adequate | missing | missing | missing | adequate | strong |
| HEIC conversion | missing | strong | missing | missing | missing | missing | missing |
| Relay fallback when NAT fails | **deliberately missing** | strong | missing | strong | strong | n/a | strong |
| Users (proxy: GitHub stars) | **10** | 11,138 | 19,706 | n/a | n/a | 87,118 | 39,544 |

## Rows where nobody is strong

These are the actual openings, in the sense the skill means: capabilities no
competitor has nailed.

**1. Pause and resume on demand.** Warp is alone with a strong rating, as of
yesterday. croc resumes after a crash but has no user-facing pause. Every
browser competitor is missing it entirely. This matters more than it looks,
because it is the second most-requested thing in the voice-of-customer pass.

**2. Resume that genuinely continues rather than restarting.** Users complain
about this specifically and by name:

> "if you stop a migration halfway through and then 'resume' it starts the
> entire thing over again"
> — r/selfhosted

Warp resumes from a durable byte offset and re-sends only the tail. This is
verified by the harness assertion "resume streamed only the 4-byte tail, not the
whole file".

**3. Per-piece integrity verification.** Warp verifies each piece against a
SHA-256 manifest and re-requests only the corrupt index. Nobody else in the
browser set does this.

## The row that decides everything

The last one. Warp is strong or unique on the three capabilities users are
actively asking for, and has **10 stars against 11,000 to 87,000**. No cell in
this matrix explains that gap. Distribution does.

## Caveat on the ratings

Warp's own column is rated from source I have read and tested. Competitor
columns are rated from documentation, changelogs and user reports, not from
running them. A "weak" on a competitor means I found no evidence of the
capability, which is weaker than proof of absence.
