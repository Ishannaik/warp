## What & why

<!-- What does this change and why? Keep it short — the diff tells the how. -->

Closes #<!-- issue number, if any -->

## Type

- [ ] feat
- [ ] fix
- [ ] docs / chore / refactor / test / perf

## Checklist

<!-- Check what applies; delete lines that genuinely don't (e.g. server-only PRs can drop the mobile check). -->

- [ ] `pnpm lint && pnpm typecheck` pass locally
- [ ] `pnpm --filter @warp/web build` is green (web changes)
- [ ] `pnpm --filter @warp/server test` passes (server changes)
- [ ] Engine changes: the relevant `web/src/lib/warp/*.check.mjs` harness passes (and covers the new behaviour)
- [ ] UI checked at **~360–430px width** — no horizontal overflow, mobile branch present (`useIsMobile()`)
- [ ] Design tokens + inline-style component style respected (no drive-by restyling)

### Hard constraints (see [CONTRIBUTING.md](../CONTRIBUTING.md#hard-constraints-the-soul-of-the-project))

- [ ] No new recurring-cost infrastructure — no TURN, database, storage, or paid API ($0, no card, forever)
- [ ] Still STUN-only — no relay in the file path; NAT failure stays an honest error
- [ ] The signaling server still never reads, stores, or understands file contents
- [ ] `SEND_HIGH_WATER` in `peer.ts` untouched or still well below 16 MiB
- [ ] Transient network drops still recover (no new terminal errors for blips; keepalive ping intact)

## Screenshots / recordings

<!-- For UI changes: desktop + ~390px mobile. For transfer changes: a quick note on what you tested (file size, browsers, devices). -->
