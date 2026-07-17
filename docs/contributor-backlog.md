# Warp — contributor issue backlog

A researched backlog of contributor-friendly issues for [Ishannaik/warp](https://github.com/Ishannaik/warp).
Informed by what [PairDrop](https://github.com/schlagmichdoch/PairDrop), [Snapdrop](https://github.com/SnapDrop/snapdrop), [FilePizza](https://github.com/kern/filepizza), [webwormhole](https://github.com/saljam/webwormhole), [magic-wormhole](https://github.com/magic-wormhole/magic-wormhole), [croc](https://github.com/schollz/croc), [LocalSend](https://github.com/localsend/localsend) and [ShareDrop](https://github.com/szimek/sharedrop) do — filtered hard through Warp's constraints.

**Every issue here respects the hard constraints:** browser-only · WebRTC data channels · $0 / no credit card / Cloudflare-free only · **STUN-only, no TURN/relay ever** · signaling server stays a dumb relay that never sees a file byte · mobile-first (~360–430px, zero horizontal overflow).

**Does not duplicate** open issues [#6](https://github.com/Ishannaik/warp/issues/6) (SHA-256 integrity), [#7](https://github.com/Ishannaik/warp/issues/7) (speed/ETA), [#8](https://github.com/Ishannaik/warp/issues/8) (safety number), [#9](https://github.com/Ishannaik/warp/issues/9) (drop-to-QR), [#10](https://github.com/Ishannaik/warp/issues/10) (folder trees).

Format per issue: `## N. Title`, then a `Labels:` / `Difficulty:` line, then the ready-to-paste body. Machine-readable twin: `docs/contributor-backlog.json`.

---

## 1. Make the signaling server URL configurable via VITE_SIGNALING_URL

Labels: `bug`, `good first issue`, `documentation`
Difficulty: good-first

### What & why
The README's self-hosting section says *"Point `VITE_SIGNALING_URL` in the frontend at your signaling server's `wss://` URL"* — but the frontend never reads that variable. The URL is hardcoded, so **self-hosters currently cannot point the app at their own signaling Worker without editing source**. This is the single biggest friction for anyone deploying their own Warp.

### Where
- `web/src/lib/warp/signaling.ts` line 22: `const SIGNALING_URL = "wss://warp-signaling.ishannaik7.workers.dev";`
- `README.md` ("Self-hosting" section) and `CONTRIBUTING.md` (dev setup) — update docs to match reality.
- `web/src/lib/warp/useNearby.ts` constructs `new SignalingClient()` (line ~221) — it inherits the same constant, so one fix covers both flows. Verify with `grep -rn "workers.dev" web/src`.

### How
1. `const SIGNALING_URL = import.meta.env.VITE_SIGNALING_URL ?? "wss://warp-signaling.ishannaik7.workers.dev";`
2. Add the typing to `web/src/vite-env.d.ts` (declare `ImportMetaEnv.VITE_SIGNALING_URL?: string`).
3. Document it: `.env.example` in `web/` with a commented `VITE_SIGNALING_URL=ws://localhost:8787`, plus a line in README self-hosting and CONTRIBUTING dev setup (local dev against `pnpm dev:server` becomes one env var away).

### Acceptance criteria
- [ ] `VITE_SIGNALING_URL=ws://localhost:8787 pnpm dev` connects the web app to a local `wrangler dev` server.
- [ ] With the variable unset, behaviour is byte-identical to today (production URL).
- [ ] Both the room flow (`/send`, `/r/:code`) and LAN nearby discovery use the override.
- [ ] `web/.env.example` exists; README + CONTRIBUTING mention it.
- [ ] `pnpm lint && pnpm typecheck && pnpm --filter @warp/web build` pass.

### Constraints
- Do not change the default URL or the wire protocol. No new dependencies.

### Good first issue?
Yes — a two-line code change plus docs, with an obvious way to verify locally. Hint: `import.meta.env` values are inlined at build time by Vite; restart `pnpm dev` after changing `.env`.

---

## 2. Warn before closing the tab while a transfer is in flight

Labels: `enhancement`, `good first issue`
Difficulty: good-first

### What & why
Closing or reloading the sender's tab kills every in-flight transfer for all peers; the receiver just sees a stall then a reconnect attempt that never succeeds. Every P2P transfer tool (FilePizza literally tells you *"the uploader must leave their browser window open"*) guards this with a `beforeunload` prompt. Warp has none — one accidental ⌘W torpedoes a 50 GB send at 99%.

### Where
- `web/src/lib/warp/useWarpTransfer.ts` — the hook already tracks `items: TransferItem[]`; a transfer is "in flight" when any item has `status === "transferring"` or `"reconnecting"` (see `TransferStatus` in `web/src/lib/warp/transfer.ts` lines 78–85). Mirror the wake-lock effect pattern at ~line 907, which already turns on/off based on active transfers.
- `web/src/nearby/useNearbyTransfer.ts` — same guard for the LAN flow.

### How
1. In each hook, add a `useEffect` that computes `active = items.some(i => i.status === "transferring" || i.status === "reconnecting")`.
2. When `active`, register `window.addEventListener("beforeunload", handler)` where the handler calls `e.preventDefault()` and sets `e.returnValue = ""` (both are needed cross-browser).
3. Remove the listener the moment nothing is in flight — an always-on nag is hostile and breaks bfcache.

### Acceptance criteria
- [ ] Reloading/closing mid-transfer shows the browser's native "leave site?" prompt (sender and receiver side).
- [ ] No prompt when idle, when everything is `done`/`declined`/`cancelled`, or on the landing page.
- [ ] Works in the LAN nearby flow too.
- [ ] `pnpm lint && pnpm typecheck && pnpm --filter @warp/web build` pass.

### Constraints
- No custom modal — only the native `beforeunload` mechanism (browsers ignore custom text anyway).
- Don't keep the listener registered while idle (it disables back/forward cache).

### Good first issue?
Yes — one small `useEffect` in two hooks. Hint: derive `active` inside the effect from the `items` dependency; the cleanup function is your "remove listener" path.

---

## 3. Show live transfer progress in the tab title

Labels: `enhancement`, `good first issue`, `ui`
Difficulty: good-first

### What & why
During a long transfer users switch tabs. Today the tab just says "Warp — Send files…" with no signal of progress; you must tab back to check. Putting `↑ 42% · Warp` (or `↓` for receiving) in `document.title` gives glanceable progress from anywhere, for free — a pattern users know from Google Drive/YouTube uploads.

### Where
- `web/src/lib/useDocumentSeo.ts` — currently sets a *static* title per route; your effect must play nicely with it (run after it, restore it on cleanup).
- `web/src/transfer/SessionView.tsx` or better `web/src/transfer/TransferFlow.tsx` — it already receives `items` from `useWarpTransfer` and can compute aggregate progress.

### How
1. Compute aggregate percent across in-flight items: `sum(transferred) / sum(size)` over items with `status === "transferring" || "reconnecting"` (fields on `TransferItem` in `web/src/lib/warp/transfer.ts`).
2. `useEffect`: while anything is in flight, set `document.title = \`\${arrow} \${pct}% · Warp\`` (throttle to ~1 update/sec — title churn hammers some browsers). Direction arrow: `↑` if any sending, `↓` if any receiving, `⇅` for both.
3. On completion or unmount, restore the previous title (capture it when the effect first fires).
4. Apply to the nearby flow too (`web/src/nearby/NearbyDevices.tsx`) if cheap — same items shape.

### Acceptance criteria
- [ ] Title shows live percent while transferring, in both directions.
- [ ] Title returns to the normal route title when the transfer finishes, errors, or the user navigates away.
- [ ] Updates at most ~1×/second.
- [ ] No interference with `useDocumentSeo` on other routes.

### Constraints
- No favicon canvas tricks in this issue (keep it title-only and dead simple).

### Good first issue?
Yes — pure UI polish over state that already exists. Hint: keep the throttle simple with a `useRef` of the last-written second.

---

## 4. Paste files and screenshots from the clipboard (Ctrl/Cmd+V) into the send queue

Labels: `enhancement`, `good first issue`, `ui`
Difficulty: good-first

### What & why
The fastest way to share a screenshot is screenshot-to-clipboard then paste. Warp's Select step only supports drag-drop and the file picker; pasting does nothing. Supporting `paste` events makes "screenshot → Warp → phone" a three-keystroke flow and matches what chat apps have taught everyone.

### Where
- `web/src/transfer/TransferFlow.tsx` — the Select step. `addFiles(list)` at ~line 63 already accepts `File[]`; the window-level drag handlers just above it (`onWinDragEnter`, ~line 78) show the "global listener scoped to `inSelect`" pattern to copy.
- Optionally the session composer in `web/src/transfer/SessionView.tsx` (it has its own file input) — fine as a follow-up.

### How
1. Add a `useEffect` registering `window.addEventListener("paste", handler)` only while `inSelect` is true.
2. In the handler: `const files = Array.from(e.clipboardData?.files ?? [])`. Pasted screenshots arrive as unnamed `image/png` blobs — rename to `pasted-2026-07-17-142301.png` style via `new File([f], name, {type: f.type})` when `f.name` is generic (`image.png`).
3. Ignore pastes when focus is in a text input/textarea (check `document.activeElement`) so pasting a room-code or text snippet still works.
4. Call `addFiles(files)`; empty clipboard pastes are a no-op.

### Acceptance criteria
- [ ] Pasting a screenshot on the Select step adds it to the queue with a timestamped name.
- [ ] Pasting files copied from the OS file manager adds them (Chromium supports this).
- [ ] Pasting while typing in the text composer or receive-code input does NOT hijack the paste.
- [ ] Works at mobile width (no layout change expected).

### Constraints
- No Clipboard API permission prompts (`navigator.clipboard.read()`) — only the `paste` event, which needs no permission.

### Good first issue?
Yes. Hint: test with Chromium first; Safari only exposes images on `clipboardData.files`, which is fine.

---

## 5. De-duplicate files added twice to the send queue

Labels: `good first issue`, `ui`
Difficulty: good-first

### What & why
Dropping the same file twice (or picking it again to "make sure") queues it twice, so the receiver is offered `report.pdf` two times and downloads two copies. Small trap, easy fix, real-world frequent — especially with drag-drop plus picker both available.

### Where
- `web/src/transfer/TransferFlow.tsx` — `addFiles` (~line 62): `setQueue(prev => [...prev, ...incomingList.map(...)])` appends blindly.
- Same pattern in the session composer's pending-file add path in `web/src/transfer/SessionView.tsx` and the nearby flow if it queues (check `web/src/nearby/NearbyDevices.tsx`).

### How
1. Treat `(name, size, lastModified)` as file identity — the same triple the engine already uses for resume identity (`fileKey` in `web/src/lib/warp/transfer.ts`). Reuse that helper if it's exported.
2. In `addFiles`, filter incoming files whose triple already exists in `prev`; keep first occurrence.
3. Optional nicety: if everything in a drop was a duplicate, flash the queue row (existing `warpBlink` keyframe in `web/src/styles/keyframes.css`) so it doesn't feel like the drop was swallowed.

### Acceptance criteria
- [ ] Adding the same file twice (drop, picker, or paste) results in one queue entry.
- [ ] Two different files with the same name but different size/mtime are both kept.
- [ ] Removing a file then re-adding it works.
- [ ] `pnpm lint && pnpm typecheck` pass.

### Constraints
- Identity check stays client-side and cheap — no hashing file contents.

### Good first issue?
Yes — a pure function change in one callback. Hint: build a `Set` of `` `${f.name}:${f.size}:${f.lastModified}` `` from `prev` and filter against it.

---

## 6. Use real buttons for the share-row actions (they're unfocusable spans)

Labels: `accessibility`, `good first issue`, `bug`
Difficulty: good-first

### What & why
On the Pair screen, "⧉ Copy link" and "↗ Share" are `<span onClick>` elements (`className="warp-share"`). Spans aren't in the tab order and don't respond to Enter/Space — **keyboard users literally cannot copy the invite link**, and screen readers announce them as plain text, not actions. This is the highest-impact/lowest-effort a11y fix in the app.

### Where
- `web/src/transfer/TransferFlow.tsx` ~lines 855–872: `<span className="warp-share" onClick={copy}>` and the `share` twin.
- Sweep for siblings: `grep -n "span" web/src/transfer/*.tsx web/src/nearby/*.tsx | grep -i onclick` — fix any other interactive span/div you find (there are a few in the session tray).

### How
1. Replace with `<button type="button" className="warp-share" …>`. Add a one-time button reset to the inline style (or a `.warp-share` rule in `web/src/index.css`): `background: none; border: 0; font: inherit; cursor: pointer; color: inherit; padding: 0` — then re-apply the existing visual styles so **pixels do not change**.
2. Keep the existing inline-style-heavy approach (project convention — see CONTRIBUTING "match the design tokens").
3. Verify with keyboard only: Tab reaches both, Enter activates, the "✓ copied!" state still shows.

### Acceptance criteria
- [ ] Copy link / Share are reachable with Tab and activate with Enter and Space.
- [ ] Zero visual regression at desktop and ~390px mobile width.
- [ ] Any other `onClick` span/div found in the transfer + nearby surfaces converted the same way.
- [ ] Announced as buttons by a screen reader (VoiceOver/NVDA spot check or an axe scan).

### Constraints
- Don't restructure layout or refactor to CSS modules — minimal, faithful change.

### Good first issue?
Yes — the classic first a11y PR. Hint: `font: inherit` is the one reset people forget; without it the mono font disappears.

---

## 7. Add visible :focus-visible outlines across the app

Labels: `accessibility`, `good first issue`
Difficulty: good-first

### What & why
`web/src/index.css` defines no focus styles at all (the only one in the app is `.rcv-input:focus` in `ReceiveEntry`). Default UA outlines are suppressed or invisible against the near-black `#121110` background in several places, so keyboard users can't tell where they are. WCAG 2.4.7 (Focus Visible) is a level-AA requirement.

### Where
- `web/src/index.css` — global stylesheet with the `@theme` tokens; add the rule here.
- Verify on: landing (`/`), `web/src/transfer/TransferFlow.tsx` (Select + Pair + session), `web/src/receive/ReceiveEntry.tsx`, `web/src/nearby/NearbyDevices.tsx`, footer links in `web/src/sections/*`.

### How
1. Add a global rule: `:focus-visible { outline: 2px solid var(--acc); outline-offset: 2px; }` — `:focus-visible` (not `:focus`) so mouse clicks don't paint outlines.
2. Check the accent outline is visible on both `#121110` background and accent-filled CTAs; for accent-on-accent cases add a targeted override (e.g. `outline-color: var(--amb)` or the ink `#efe9da`).
3. Tab through every route at desktop and ~390px; fix any element that clips the outline (`overflow: hidden` parents may need `outline-offset: -2px`).

### Acceptance criteria
- [ ] Every focusable element on every route shows a clearly visible focus ring when reached via keyboard.
- [ ] No focus ring on mouse click (`:focus-visible` semantics).
- [ ] No horizontal overflow introduced at 360–430px.
- [ ] Outline color has ≥3:1 contrast against its backdrop (check accent `#5360ff` on `#121110` — it passes at ~4.6:1).

### Constraints
- Keep it CSS-only; no component rewrites. Use the existing design tokens (`--acc`, `--amb`) — no new colors.

### Good first issue?
Yes — one CSS rule plus a patient Tab-through. Hint: pair naturally with issue "real buttons for share-row actions"; do that one first or the spans won't be tabbable to test.

---

## 8. Make the accept-offer modal a proper accessible dialog (role, focus trap, Escape)

Labels: `accessibility`, `good first issue`, `ui`
Difficulty: good-first

### What & why
`AcceptModal` — the review-before-receive gate, arguably Warp's signature interaction — is a plain positioned `<div>`. Screen readers don't announce it as a dialog, focus stays behind it in the page, Escape does nothing, and Tab walks out of it into the background UI. For a security-relevant consent surface ("accept these files?"), keyboard/SR users deserve first-class treatment.

### Where
- `web/src/transfer/SessionView.tsx` — `export function AcceptModal(` at line 763.
- Rendered from `web/src/transfer/TransferFlow.tsx` ~line 275 and the nearby flow.

### How
1. Add `role="dialog"`, `aria-modal="true"`, `aria-labelledby` pointing at the modal's heading id, `aria-describedby` at the file-count/size summary.
2. On open: move focus to the modal (the Decline button is a safe initial target — never make Accept the default focus for a consent dialog). On close: return focus to the element focused before it opened (stash in a `useRef`).
3. Trap Tab: on `keydown`, if `Tab` would leave the modal, wrap to the first/last focusable child (a ~15-line manual trap is fine; no dependency).
4. `Escape` closes the modal **as decline** (it's the non-destructive default and mirrors clicking outside… only if click-outside also declines; if there's no click-outside behaviour, make Escape trigger the existing decline handler).
5. Optionally `inert` on the app root while open (progressive enhancement; guard with `'inert' in HTMLElement.prototype`).

### Acceptance criteria
- [ ] Screen reader announces "dialog" with the offer summary when it opens.
- [ ] Focus lands inside on open, is trapped while open, and returns to the trigger on close.
- [ ] Escape declines the offer (same code path as the Decline button).
- [ ] Zero visual change; works at ~390px.

### Constraints
- No dialog library, no `<dialog>` element migration (Safari quirks with the current styling) — enhance the existing div.

### Good first issue?
Yes, with a hint: the focus trap is the only fiddly part — query `button, [href], input, textarea, [tabindex]:not([tabindex="-1"])` inside the modal and wrap on Tab/Shift+Tab at the ends.

---

## 9. Announce transfer lifecycle events to screen readers (aria-live)

Labels: `accessibility`, `good first issue`
Difficulty: good-first

### What & why
Everything Warp does — peer joined, offer received, transfer started, file done, connection lost/recovered — is communicated purely visually (progress bars, blinking dots, banner text). A screen-reader user hears silence for the entire session. One polite live region fixes the whole class of problem.

### Where
- `web/src/transfer/SessionView.tsx` — the shared session surface both flows funnel into; best single mount point.
- State to watch: `items` (`TransferItem.status` transitions, `web/src/lib/warp/transfer.ts` lines 78–85), `incoming` offer, `connections` array, and the hook `status` (`connected`/`reconnecting`) from `web/src/lib/warp/useWarpTransfer.ts`.

### How
1. Add a visually-hidden div: `<div aria-live="polite" role="status">` with an sr-only style (`position: absolute; width: 1px; height: 1px; clip-path: inset(50%); overflow: hidden; white-space: nowrap`). Add the `.sr-only` utility to `web/src/index.css`.
2. Track previous statuses (a `useRef<Map<id, status>>`); on transition, set the live text: "Receiving report.pdf", "report.pdf received", "Offer: 3 files, 1.2 GB — accept or decline", "Connection lost, reconnecting", "Device joined — 2 devices connected".
3. Debounce per-file progress — do NOT announce percents (that's a firehose); only announce state *transitions*, plus one "halfway" style milestone at most.
4. Clear the region a few seconds after each announcement so re-announcements of identical text still fire (set to `""` then the new text).

### Acceptance criteria
- [ ] With VoiceOver/NVDA running, joining, offer arrival, per-file start/done, decline/cancel, reconnect, and recovery are each spoken once.
- [ ] Progress percent is never spoken continuously.
- [ ] No visual change whatsoever.
- [ ] Works in both the code-room and LAN nearby session.

### Constraints
- `aria-live="polite"` only — never `assertive` (it interrupts).

### Good first issue?
Yes — self-contained, testable with any free screen reader (or just watching the region's text in DevTools). Hint: derive announcements in a `useEffect` diffing `items` against the previous ref; don't scatter announce calls through handlers.

---

## 10. Add a "Copy code" action next to "Copy link" on the pair screen

Labels: `enhancement`, `good first issue`, `ui`
Difficulty: good-first

### What & why
The Pair screen shows the big 6-character room code and offers "⧉ Copy link" / "↗ Share" — but no way to copy the **code itself**. When the receiver is entering the code by hand at `/receive` (the whole reason that page exists), the sender often wants to paste just `KMT4RA` into a chat, not a full URL. croc and magic-wormhole both treat the bare code as the primary shareable artifact.

### Where
- `web/src/transfer/TransferFlow.tsx` — the SHARE ROW (~lines 845–875) with the existing `copy` handler (line ~661, `navigator.clipboard.writeText(shareUrl)`).

### How
1. Add a third action, "⧉ Copy code", calling `navigator.clipboard.writeText(code)`.
2. Give each copy action its own `copied` feedback state (currently a single boolean; make it `"link" | "code" | null`) so the "✓ copied!" flash appears on the right button.
3. Alternative/bonus (designer's choice): make the big code display itself clickable-to-copy with a subtle hover hint — but keep the explicit button either way for discoverability.
4. Use a real `<button>` (see the share-row buttons issue) and keep mono font + hairline styling; check the row still wraps cleanly at ~360px (`flexWrap` is already set — verify three items behave).

### Acceptance criteria
- [ ] "Copy code" puts exactly the 6-char code (no whitespace, no URL) on the clipboard.
- [ ] Per-button copied feedback; copying link then code shows feedback in the right place.
- [ ] Row wraps with no horizontal overflow at 360px.
- [ ] Keyboard accessible (real button).

### Constraints
- Never generate/derive codes client-side — display-only of `joined.room` (CLAUDE.md invariant).

### Good first issue?
Yes — small, visual, instantly gratifying. Hint: `useState<"link" | "code" | null>(null)` plus a 1.5s reset timeout mirrors the existing pattern.

---

## 11. Run the engine .check.mjs harnesses in CI

Labels: `good first issue`, `enhancement`
Difficulty: good-first

### What & why
CONTRIBUTING.md calls the six `web/src/lib/warp/*.check.mjs` harnesses "the engine's regression net" and tells contributors to run them — but CI never does. `.github/workflows/ci.yml`'s web job runs lint, typecheck, and build only, so a PR that breaks reconnect/resume logic can go green. Wiring the net into CI makes the promise real and protects the trickiest code in the repo (resume, backpressure, salvage-on-reconnect).

### Where
- `.github/workflows/ci.yml` — the `web` job (after the build step).
- `web/package.json` — add a script so the command is one line locally and in CI.
- The harnesses: `web/src/lib/warp/{signaling,peer,transfer,receiveController,useWarpTransfer,idbStage}.check.mjs`.

### How
1. Add to `web/package.json` scripts: `"check:engine": "for f in src/lib/warp/*.check.mjs; do node \"$f\" || exit 1; done"` — or, more portable, a tiny `scripts/run-checks.mjs` that globs and spawns each with inherited stdio, exiting non-zero on first failure.
2. Add a CI step in the `web` job: `- run: pnpm --filter @warp/web check:engine`.
3. Confirm each harness actually exits non-zero on failure (deliberately break one locally and watch it fail) — a check that can't fail is decoration.
4. Update CONTRIBUTING's "Checks" section to include `pnpm --filter @warp/web check:engine`.

### Acceptance criteria
- [ ] CI web job runs all six harnesses and fails if any one fails (verified by a deliberate red run on the PR, then reverted).
- [ ] `pnpm --filter @warp/web check:engine` works locally on Linux/macOS.
- [ ] Total added CI time is small (these are dependency-free node scripts — expect seconds).
- [ ] CONTRIBUTING documents the script.

### Constraints
- No new test framework in this issue — the harnesses run under plain `node` by design; keep it that way.

### Good first issue?
Yes — YAML + package script, with a satisfying "I made CI stricter" payoff. Hint: prefer the `scripts/run-checks.mjs` runner over the shell loop; it works on Windows contributors' machines too.

---

## 12. Write a complete self-hosting guide (docs/SELF-HOSTING.md)

Labels: `documentation`, `good first issue`, `help wanted`
Difficulty: good-first

### What & why
The README's "Self-hosting" section is ~10 lines: two deploy commands and a one-line mention of `VITE_SIGNALING_URL`. Anyone who actually tries hits unanswered questions: creating the Cloudflare account/Pages project, what `server/wrangler.toml`'s Durable Object binding needs on first deploy (migrations!), how to point the frontend at their Worker, custom domains, and how to verify it works. Self-hostability is a trust feature for a privacy tool — PairDrop and Snapdrop both owe much of their community to painless self-host docs (PairDrop ships Docker + full deployment docs). A guide that a stranger can follow start-to-finish converts curious users into deployers into contributors.

### Where
- Create `docs/SELF-HOSTING.md`; link it from README's Self-hosting section and from `docs/ARCHITECTURE.md`'s intro.
- Source material: `server/wrangler.toml` (DO binding + migrations), `server/README.md`, `web/` build output, CLAUDE.md's deploy commands, the `VITE_SIGNALING_URL` wiring (see the "configurable signaling URL" issue — coordinate; the guide depends on it landing, or on documenting the current hardcoded constant honestly).

### How
Walk the whole path, assuming zero Cloudflare experience:
1. **Prereqs** — Node ≥22, pnpm, a free Cloudflare account, `wrangler login`. Explicitly note: **no credit card needed at any step** (that's the project's whole thesis — prove it in docs).
2. **Deploy signaling** — `pnpm --filter @warp/server run deploy` (call out the `run` keyword gotcha vs pnpm's builtin `deploy`); what the first-deploy DO migration output looks like; the resulting `*.workers.dev` URL; smoke-test with the `/health` endpoint (`server/src/index.js` line 14).
3. **Point the frontend** — `VITE_SIGNALING_URL=wss://<your-worker>.workers.dev pnpm --filter @warp/web build`.
4. **Deploy the frontend** — Cloudflare Pages (`wrangler pages deploy dist --project-name=<yours>`) *or any static host* (Netlify/GitHub Pages work — it's static files; note only Pages has been battle-tested).
5. **Verify** — open two tabs, transfer a file; what LAN discovery needs (same public IP); the STUN/no-TURN expectation on restrictive networks.
6. **Custom domain** (optional) — CNAME to Pages, HTTPS is automatic.
7. **Troubleshooting table** — `bad-room` (client minting codes / wrong server URL), WS connect failures (http vs https mixed content, `ws://` vs `wss://`), DO hibernation basics (the 8s keepalive is client-side; nothing to configure).

### Acceptance criteria
- [ ] A fresh reader with a new Cloudflare account can go zero → working self-hosted Warp using only this doc (ideally verified by actually doing it on a throwaway account).
- [ ] Every command is copy-pasteable and current; no step assumes prior Cloudflare knowledge.
- [ ] "No credit card" claim verified at each step and stated.
- [ ] README Self-hosting section links to the guide instead of duplicating it.
- [ ] Troubleshooting section covers at least the three failure modes above.

### Constraints
- Free-tier instructions only — never document a paid option (no TURN, no paid Workers features). The signaling server section must not suggest adding storage/logging (dumb relay stays dumb).

### Good first issue?
Yes — pure documentation, self-verifying (follow your own guide), and you learn the whole deployment story doing it. Hint: keep a scratch log of every confusing moment during your own first deploy; those moments are the guide's table of contents.

---

## 13. In-app QR scanner on the receive page

Labels: `enhancement`, `ui`, `help wanted`
Difficulty: intermediate

### What & why
The sender shows a QR code, but the receive path assumes the phone's OS camera app. That's fine on iOS, but on many Androids (and any desktop with a webcam) users open Warp first and then have no way to scan. An in-app "Scan QR" button on `/receive` closes the loop — PairDrop and LocalSend both offer in-app scanning for exactly this reason.

### Where
- `web/src/receive/ReceiveEntry.tsx` — add a "Scan QR" secondary action under the code input.
- Router: `web/src/router.tsx` — scanning yields a `/r/:code` URL; reuse `navigate`.
- The QR payload format comes from `shareUrl` in `web/src/transfer/TransferFlow.tsx` (a full `https://…/r/CODE` link).

### How
1. Feature-detect `('BarcodeDetector' in window)` and `navigator.mediaDevices?.getUserMedia`. Chromium ships BarcodeDetector; for Firefox/Safari either hide the button (v1) or add the tiny [`jsQR`](https://github.com/cozmo/jsQR) MIT library scanning video frames via canvas (v2 — it's ~40 KB, free, offline).
2. On tap: `getUserMedia({ video: { facingMode: "environment" } })` into a `<video>` in a full-screen overlay (design tokens: `#121110` scrim, hairline frame, mono "SCANNING…" label). Poll `detect()` every ~200ms.
3. On hit: accept both a full `/r/CODE` URL (parse pathname) and a bare 6-char code; validate against `VALID_RE` (already in `ReceiveEntry.tsx`, line ~23); stop all tracks; `navigate("/r/" + code)`.
4. Handle the three failure modes honestly: permission denied (explain + fall back to typing), no camera, and non-Warp QR (keep scanning, show "not a Warp code").
5. Always release the camera on unmount/close (`track.stop()` in cleanup) — a hot camera LED after leaving is a privacy bug.

### Acceptance criteria
- [ ] On Chromium mobile+desktop, scanning the sender's QR lands the receiver in the room, no OS camera app involved.
- [ ] Camera permission denial shows a friendly fallback message, not a broken overlay.
- [ ] Camera indicator turns off immediately when the overlay closes or on navigation.
- [ ] Button hidden (or jsQR fallback works) on browsers without BarcodeDetector.
- [ ] Overlay is mobile-first: works at 360px, no overflow, has a visible close button and Escape handling.

### Constraints
- No paid/cloud scanning APIs. If adding a library, it must be MIT/Apache, small, and bundled (no CDN — offline PWA future). Camera frames never leave the device.

---

## 14. Friendly device names instead of hex peer-id prefixes

Labels: `enhancement`, `ui`
Difficulty: intermediate

### What & why
Connected devices render as the first 8 characters of their signaling id (`labelFor` = `peerId.slice(0, 8)` — `web/src/lib/warp/useWarpTransfer.ts` lines 179–181), so a mesh session reads like `a3f91c2b · 7e02d4aa`. PairDrop generates memorable names ("Purple Fox") and lets you edit yours; LocalSend uses device model names. With mesh fan-out and selective-send on the horizon, humans need human labels for "which device is which".

### Where
- `web/src/lib/warp/useWarpTransfer.ts` — `labelFor()` and the `Connection` type (line ~107).
- `web/src/transfer/TransferFlow.tsx` joiner chips (~line 800) and `web/src/transfer/SessionView.tsx` device list — consumers of `label`.
- `web/src/lib/warp/useNearby.ts` / `web/src/nearby/NearbyDevices.tsx` — nearby flow shows devices too; keep naming consistent.

### How — two phases, first is tiny
1. **Deterministic names (no protocol change):** derive `adjective-animal` from a hash of the peerId with two small word lists (~64×64 entries in a new `web/src/lib/warp/names.ts`). Both sides hash the same id → both display the same name. Ship this alone and it's already a huge upgrade.
2. **Self-chosen names (data-channel hello):** add an optional `{ t: "hello", name: string }` control frame to the `ControlMessage` union in `web/src/lib/warp/transfer.ts`, sent once on channel open; sender's browser/OS (from `navigator.userAgentData?.platform` fallback UA sniff) or a user-edited name persisted in `localStorage`. Unknown control frames must already be ignored by old clients — verify `peer.ts`'s control dispatch tolerates unknown `t` (make it tolerant if not; that's the compat story).
3. Show name + a small hex suffix (`Purple Fox · a3f9`) so identical names stay distinguishable; the safety-number issue (#8) covers cryptographic identity — don't conflate.

### Acceptance criteria
- [ ] Phase 1: both sides display the same friendly name for a given device with zero wire changes.
- [ ] Phase 2 (if included): a device's chosen name appears on peers within a second of channel open; old↔new client sessions don't break.
- [ ] Names appear in joiner chips, session device list, per-item `peerId` stamps, and nearby list, at 360px without overflow (truncate with ellipsis).
- [ ] `node src/lib/warp/transfer.check.mjs` and `peer.check.mjs` extended for the new frame (phase 2).

### Constraints
- Signaling server stays dumb — names travel on the data channel (or derive locally), never through/stored on the server. No fingerprinting-grade UA details; coarse "Android · Chrome" at most, and only if the user hasn't set a custom name.

---

## 15. Show the connection path: LAN vs internet (STUN) badge

Labels: `enhancement`, `ui`
Difficulty: intermediate

### What & why
Warp's whole identity is "direct, no relay" — but users can't see *how* direct. A small session-header badge reading `direct · LAN` (host↔host candidates) vs `direct · internet` (srflx involved) tells users why a transfer is blazing (same Wi-Fi) or merely fast, helps debug NAT weirdness without DevTools, and doubles as live proof of the no-relay promise. Pairs beautifully with the `/how` theory page.

### Where
- `web/src/lib/warp/peer.ts` — `WarpPeer` owns the `RTCPeerConnection` (`this.pc`, ~line 311). Expose the selected candidate pair via a new method/event.
- `web/src/lib/warp/useWarpTransfer.ts` — surface it on the `Connection` objects (line ~107) the UI already renders.
- `web/src/transfer/SessionView.tsx` — render the badge in the session header / device chips.

### How
1. In `WarpPeer`, after channel open (and again after any ICE restart — see `restartIce` handling ~line 384), call `pc.getStats()`; find the `transport` stat's `selectedCandidatePairId` (fallback: the `candidate-pair` with `nominated && state === "succeeded"`), then read both candidates' `candidateType`.
2. Classify: both `host` → `lan`; any `srflx`/`prflx` → `internet`. (`relay` is impossible — STUN-only — but if ever seen, surface it loudly as a bug.)
3. Emit `path: "lan" | "internet" | "unknown"` on the peer's event surface; plumb into `Connection`. Re-check on `iceconnectionstatechange` since ICE can migrate pairs mid-session.
4. UI: tiny mono chip next to the device label — accent dot + `LAN` or `NET`. Tooltip/title with the one-line explanation. Mobile: chip only, no new row.

### Acceptance criteria
- [ ] Two devices on the same Wi-Fi show `LAN`; phone-on-LTE ↔ laptop-on-Wi-Fi shows `internet`.
- [ ] Badge updates if the pair migrates after an ICE restart.
- [ ] Zero polling while idle beyond the open/restart checks (battery).
- [ ] `peer.check.mjs` covers the classification function with stubbed stats objects (make the classifier a pure exported function so it's trivially testable).

### Constraints
- STUN-only stays: this is observability, not new transport. Don't ship a continuous `getStats()` poll loop; sample on state changes (plus at most one recheck a few seconds after open).

---

## 16. Stream "Download all (.zip)" instead of building the archive in RAM with zipSync

Labels: `performance`
Difficulty: intermediate

### What & why
"Download all" calls fflate's **synchronous** `zipSync` (`web/src/lib/warp/useWarpTransfer.ts` line ~860 and `web/src/nearby/useNearbyTransfer.ts` line ~287). That (a) blocks the main thread for the whole archive build — seconds of frozen UI on a phone — and (b) materializes a second full copy of every received blob in memory, so a 1.5 GB batch needs ~3 GB and OOM-kills mobile tabs. The engine goes to heroic lengths to avoid buffering (disk streaming, IDB staging); the zip path undoes it at the last step.

### Where
- `web/src/lib/warp/useWarpTransfer.ts` — the download-all callback around line 860 (`zipSync(zippable, { level: 0 })`).
- `web/src/nearby/useNearbyTransfer.ts` — identical twin around line 287. Extract ONE shared helper (e.g. `web/src/lib/warp/zipDownload.ts`) instead of fixing twice.

### How
1. Use fflate's streaming API: `Zip` + `ZipPassThrough` (level 0 is already used — files are pre-compressed, so pass-through is right and CRC is still computed). Feed each blob in ~1–4 MiB slices via `blob.slice().arrayBuffer()`, yielding to the event loop between slices.
2. Collect output chunks into an array and finish with one `new Blob(chunks, {type: "application/zip"})` + object-URL download. Memory now peaks at ~(largest slice + output so far) instead of 2× total — and the main thread never blocks. (True zero-buffer streaming to disk needs the service-worker download issue; keep that out of scope but structure the helper so a `WritableStream` sink can replace the chunk array later.)
3. Skip `savedToDisk` items exactly as today (they have no blob) and keep the level-0 rationale comment.
4. Show progress: the tray button becomes `zipping… 34%` (files processed / total bytes) — the current freeze gives no feedback at all.
5. Guard: if total blob bytes exceed a sane ceiling (e.g. 1 GiB), warn or suggest per-file downloads.

### Acceptance criteria
- [ ] UI stays responsive (spinner animates, scroll works) while zipping a multi-hundred-MB batch.
- [ ] Peak memory measurably lower than before (DevTools memory profile: no 2× spike).
- [ ] Zip opens correctly on Windows Explorer, macOS Archive Utility, and `unzip -t` (CRC pass).
- [ ] Behaviour identical for the nearby flow (shared helper, one implementation).
- [ ] Text items and disk-saved items handled as before.

### Constraints
- Keep fflate (already a dependency) — no new zip library. Don't move to a Worker thread in this issue unless it falls out naturally; slicing + yielding is enough.

---

## 17. Desktop notifications when something happens in a background tab

Labels: `enhancement`
Difficulty: intermediate

### What & why
Transfers are exactly the workload you background: start a 20 GB send, go do something else. Today nothing tells you when the receiver accepts, a file lands, the batch finishes, or the connection drops — you poll the tab. The Notification API fixes this in an afternoon. Snapdrop/PairDrop notify on incoming files for the same reason.

### Where
- `web/src/transfer/SessionView.tsx` / `web/src/transfer/TransferFlow.tsx` — same state transitions as the aria-live issue (they compose well; consider one small `useTransferEvents` hook both features consume).
- Events from `useWarpTransfer`: `incoming` offer set, item → `done`, all items in a batch → `done`, status → `reconnecting`/`error`.

### How
1. Request permission **contextually** — the first time a session reaches `connected` (never on page load; browsers punish that with permanent denial rates). A small "🔔 notify me" toggle in the session header is the cleanest trigger; persist choice in `localStorage`.
2. Only notify when `document.hidden` (or `!document.hasFocus()`); a visible tab shows its own UI.
3. Notify on: incoming offer ("Warp: 3 files offered — 1.2 GB"), batch complete ("All files sent/received"), connection lost >5s. Use the brand icon (`/icon-192.png`) and `tag:` per event class so repeats replace rather than stack.
4. Clicking the notification focuses the tab (`window.focus()` in the `onclick`).
5. Degrade silently when `Notification` is undefined (iOS Safari non-PWA) or permission is denied.

### Acceptance criteria
- [ ] With permission granted and tab hidden, offer arrival / batch completion / disconnect each produce exactly one notification.
- [ ] No permission prompt on load — only via the explicit toggle.
- [ ] Focused tab produces zero notifications.
- [ ] Clicking a notification focuses the Warp tab.
- [ ] No errors on browsers without the API.

### Constraints
- No push service, no server involvement of any kind (signaling stays a dumb relay; Push API needs infrastructure — out). Local `Notification` only.

---

## 18. Selective send: choose which connected devices receive a batch

Labels: `enhancement`, `ui`
Difficulty: intermediate

### What & why
In a mesh room every send fans out to **all** open peers (`sendFiles` iterates `connectedPeers()` — `web/src/lib/warp/useWarpTransfer.ts` line ~649; the composer even says "Send 3 files to 4 devices →"). That's a great default, but with laptop+phone+tablet+friend in one room, "send this only to Dana" is impossible — you spray everyone and rely on them declining. Per-device targeting turns the mesh from a broadcast into a real multi-device surface.

### Where
- `web/src/lib/warp/useWarpTransfer.ts` — `sendFiles` (line ~649) and `sendText` (line ~682): accept an optional `targetPeerIds?: string[]`; default (undefined) keeps broadcast semantics.
- `web/src/transfer/SessionView.tsx` — the composer (device chips already exist conceptually via `connections`; the `fanout` label at ~line 388 shows device count).
- Salvage path: the re-offer-on-reconnect logic (~line 613, `unfinished` loop) must re-offer only to the original target, not the whole room.

### How
1. Engine: thread `targetPeerIds` through to the per-peer `offerFiles` loop; store the target set on the batch record so salvage/re-offer respects it.
2. UI: a row of device chips above the composer (friendly names issue makes these readable) — all selected by default; tap to toggle; "Send to 2 of 4 devices →" label updates. Single-peer rooms show no chips (zero UI change for the common case).
3. Mobile: chips wrap, min tap target 44px, no overflow at 360px.
4. Per-item attribution already exists (`item.peerId`) so the tray needs no changes.

### Acceptance criteria
- [ ] With 3+ devices, deselecting one excludes it from the offer entirely (it never sees the accept modal).
- [ ] Default behaviour (nothing toggled) is byte-identical to today's broadcast.
- [ ] A mid-transfer reconnect re-offers unfinished files only to their original targets.
- [ ] Single-device rooms render exactly as today.
- [ ] `useWarpTransfer.check.mjs` extended: targeted offer, targeted salvage.

### Constraints
- No wire-protocol change needed (offers are already per-peer) — keep it that way. Don't regress the salvage/never-give-up invariants (CLAUDE.md: transfers must survive drops).

---

## 19. Rate-limit join attempts per IP in the signaling Durable Object

Labels: `enhancement`, `help wanted`
Difficulty: intermediate

### What & why
Room codes are 6 chars over a 32-symbol alphabet (~1.07 billion combinations — `server/src/index.js` lines 7–9), so guessing a live code is impractical, but nothing stops a client from *trying*: the DO happily processes unlimited `{type:'join', room}` attempts per socket/IP. A polite brute-force guard (a) hardens the "share the code privately and only your peer can join" story, and (b) protects the free-tier DO from request-burn by a misbehaving client. magic-wormhole's PAKE design is famous precisely for making code-guessing expensive; Warp can get most of the practical benefit with a dumb-relay-compatible throttle.

### Where
- `server/src/index.js` — the join handler (~lines 100–130, where `bad-room` / `room-full` errors are sent). The client IP is already extracted for LAN grouping (`CF-Connecting-IP`, ~line 36) and stored in the socket attachment.
- `server/test/` — the e2e suite (`pnpm --filter @warp/server test`) boots real wrangler; add cases there.

### How
1. Track failed joins (joins to nonexistent rooms) per IP in an in-memory `Map<ip, {count, windowStart}>` on the DO instance. Token-bucket or fixed window: e.g. **10 failed joins / 60s per IP** → respond `{type:'error', error:'rate-limited', message:'Too many attempts — wait a minute.'}` and optionally close with a distinct WS code.
2. Hibernation caveat: instance memory resets when the DO hibernates — that's acceptable (best-effort guard, zero storage cost). Note it in a comment; do NOT reach for `state.storage` (adds billable-ish ops and the dumb relay shouldn't persist visitor data anyway — this is also the privacy-correct choice).
3. Successful joins and fresh-room creations (`join` with no room) are never throttled; only *failed* code guesses count.
4. Client: map the new error kind to a friendly message in `web/src/lib/warp/signaling.ts` / the receive flow (don't leave users staring at raw `rate-limited`).
5. Tests: hammer a fake code 11× from one connection → expect the 11th to be `rate-limited`; verify a correct join still works from another IP (wrangler dev lets you spoof `CF-Connecting-IP`? if not, keyed fallback to a per-socket counter in tests).

### Acceptance criteria
- [ ] >N failed joins/minute from one IP get `rate-limited` errors; legitimate flows (create, correct code, reconnect-rejoin) are never throttled.
- [ ] Reconnect/rejoin storms after a network blip do NOT trip the limiter (rejoining a room you were in is a *successful* join — verify with the existing reconnect e2e).
- [ ] No Durable Object storage writes; memory-only.
- [ ] Server e2e suite covers limit-hit and limit-miss paths.
- [ ] The web client shows a human message for the new error.

### Constraints
- Signaling stays a dumb relay: no logging of IPs beyond the transient counter, no persistence, no analytics. Free tier only — zero storage billing. Don't break the reconnect-and-rejoin invariant (CLAUDE.md: transfers must survive drops).

---

## 20. Turn the NAT-failure wall into an honest, actionable troubleshooting panel

Labels: `enhancement`, `ui`
Difficulty: intermediate

### What & why
When STUN hole-punching fails, Warp shows a generic "Channel failed" panel (`ErrorPanel`, `web/src/transfer/TransferFlow.tsx` line ~962) with one message string and a retry button. The **no-TURN honest error is a core product decision** (README "Deliberate non-goals") — so the error experience IS the product for the ~5–10% of pairs that can't punch through. Right now it's honest but not helpful. Tell users *what happened, why Warp won't silently relay, and what actually works*.

### Where
- `web/src/transfer/TransferFlow.tsx` — `ErrorPanel` (~line 962) and the `error` plumbing at line ~166.
- `web/src/lib/warp/peer.ts` — `PeerErrorKind` at line 117 (`"nat-failed" | "disconnected" | "channel-error"`) and `web/src/lib/warp/useWarpTransfer.ts` `WarpError` (line ~116) — the kinds exist; the UI just flattens them to one string.
- Deep-link target: the `/how` theory page's NAT/STUN section (`web/src/theory/`, `NatStun.tsx` diagram).

### How
1. Branch `ErrorPanel` on `error.kind`, not just `message`. For `nat-failed`, render a structured panel:
   - **What happened** (one sentence): "Both devices are behind routers that refuse a direct path (symmetric NAT)."
   - **Why Warp stops here**: two lines on the no-relay promise, linking "the full story" → `/how` (NAT section anchor).
   - **What works, in order of success rate**: ① put both devices on the same Wi-Fi (always works — LAN needs no punching), ② hotspot one device to the other, ③ turn off VPN / try a non-corporate network, ④ retry (some NATs are flaky).
   - Retry button stays primary.
2. `disconnected` / `channel-error` / `signaling` kinds get their own shorter copy (e.g. "the other device went away" vs. implying NAT).
3. Mono/amber design tokens, mobile-first layout (stack the steps, no overflow at 360px).
4. Add an id/anchor on the theory page's NAT section so the deep link lands on the right diagram.

### Acceptance criteria
- [ ] `nat-failed` shows the structured panel with the three concrete remedies and the `/how` link.
- [ ] Other error kinds show kind-appropriate copy (no more one-size-fits-all).
- [ ] Panel is legible and overflow-free at 360px.
- [ ] Retry preserved and still calls `wrap.retry`.
- [ ] Copy reviewed against README's "Deliberate non-goals" — same tone, no apology for the no-relay stance.

### Constraints
- Absolutely no "add a TURN fallback" — the honest error is the feature. No network-probing "NAT type detector" in this issue (scope creep); classify from the existing `PeerErrorKind` only.

---

## 21. Service-worker streaming downloads for browsers without the File System Access API

Labels: `enhancement`, `performance`, `help wanted`
Difficulty: advanced

### What & why
Chromium receivers stream huge files straight to disk via `showSaveFilePicker`. Firefox and Safari don't have it, so they fall back to IndexedDB staging (`web/src/lib/warp/idbStage.ts`) — capped by quota (`estimateFits`, line 43) and double-writing every byte. [FilePizza](https://github.com/kern/filepizza) solved this years ago: a **service worker responds to a virtual download URL with a `ReadableStream`**, so the browser's own download manager writes chunks to disk as they arrive off the data channel — RAM-flat, quota-free, works on Firefox/Safari. This is the single biggest cross-browser capability gap in Warp.

### Where
- New: `web/public/sw-download.js` (or a Vite-built SW — coordinate with the PWA shell issue so there's ONE service worker with two concerns).
- `web/src/lib/warp/receiveController.ts` — add a third `ReceiveSink` implementation (`swSink`) next to `memorySink`/`diskSink`; the sink interface ("bytes only count after the write resolves") is already the right abstraction.
- `web/src/lib/warp/useWarpTransfer.ts` — sink selection logic in `accept()` (the `LARGE_THRESHOLD` branch, line ~72 constant): prefer FS Access → SW streaming → IDB → memory.

### How
1. SW: on `fetch` for `/__download/<token>`, respond `new Response(stream, { headers: { "Content-Disposition": attachment; filename, "Content-Length": size } })`. The page feeds the stream via a `MessageChannel` port (chunk → `port.postMessage(buf, [buf])`; close on file-end); the SW pipes port messages into the `ReadableStream` controller.
2. Page side: on accept, register the token+metadata with the SW, then trigger the download with a hidden iframe/anchor to the virtual URL. Backpressure: pause the port pump against the stream controller's `desiredSize`; the existing durable-write invariant maps to "chunk acked by SW".
3. **Resume interplay is the hard part**: a browser-managed download can't seek, so a mid-file drop restarts that file from 0 with this sink. Honest tradeoff — keep IDB as the sink for *resumable* mode and offer SW streaming when the file exceeds quota (`estimateFits` fails) or via explicit choice. Document the matrix in the PR.
4. Gotchas (all solved in FilePizza/StreamSaver — study them): SW may be killed mid-stream (keepalive pings on the port), Safari needs the SW on the same origin+scope, `Content-Length` makes the download show real progress, HTTPS-only.

### Acceptance criteria
- [ ] Firefox receives a file larger than its IDB quota, streaming to disk with the native download UI and flat memory (verified in about:memory / profiler).
- [ ] Safari (macOS ≥16.4) same flow.
- [ ] Chromium behaviour unchanged (FS Access still preferred).
- [ ] Cancel mid-download aborts the stream cleanly (no zombie download entry).
- [ ] Clear code comments on the resume tradeoff; `receiveController.check.mjs` covers the new sink's ordering/backpressure with a stubbed port.

### Constraints
- File bytes never touch any server — the SW is a local pipe, not a proxy (the virtual URL must never hit the network; guard with a scope check). No StreamSaver-style third-party MITM iframe (`streamsaver.com`) — self-host the mechanism entirely. Coordinate with the PWA-shell issue to share one SW registration.

---

## 22. Installable PWA: offline app shell + install prompt

Labels: `enhancement`
Difficulty: intermediate

### What & why
Warp ships a complete `site.webmanifest` (icons, theme, standalone display — `web/public/site.webmanifest`) but registers **no service worker**, so it's not installable and a flaky connection shows the browser dino. The app shell is fully static; caching it makes Warp load instantly from the home screen. Note the honest limit: signaling needs the network, so offline Warp can *load* and explain itself, not transfer — LAN transfers still require the (online) signaling server for the handshake. PairDrop/Snapdrop are installable PWAs; users expect it from this category.

### Where
- New SW (see the streaming-download issue — build ONE worker with both concerns, or a clear registration story for combining later).
- `web/index.html` / `web/src/main.tsx` — SW registration.
- `web/vite.config.ts` — either `vite-plugin-pwa` (workbox, well-trodden) or a small hand-rolled SW with a build-time asset manifest; hand-rolled keeps deps lean and the cache logic auditable (project taste: lean).
- `web/public/_headers` — ensure `Cache-Control` on the SW file itself is no-cache (Cloudflare Pages).

### How
1. Precache the built shell (hashed JS/CSS/fonts/brand images) on install; cache-first for hashed assets, network-first (falling back to cache) for `index.html` navigation requests.
2. Never intercept: WebSocket upgrades (signaling), anything cross-origin, and the `/__download/*` virtual namespace (reserved by the streaming issue).
3. Update flow: on new SW waiting, show a tiny "new version — reload" toast (mono, hairline) rather than skipWaiting-and-break mid-transfer. **Never auto-reload while a transfer is in flight** (compose with the beforeunload guard state).
4. Offline navigation gets the cached shell; the transfer flow then shows the existing signaling-error path with a friendly "you're offline" hint.
5. Verify install on Android Chrome + desktop Chrome; iOS gets add-to-homescreen with the existing icons.

### Acceptance criteria
- [ ] Lighthouse PWA installability checks pass; install works on Android/desktop Chrome.
- [ ] Airplane-mode reload serves the app shell with an honest offline message.
- [ ] A deployed update never hot-swaps the SW during an active transfer.
- [ ] WS signaling and all transfer traffic bypass the SW entirely.
- [ ] `pnpm --filter @warp/web build` produces the SW + manifest wiring with no manual steps.

### Constraints
- $0: no push services, no background sync servers. Keep the SW auditable and small — this is a privacy-sensitive app; contributors and users should be able to read the whole worker in one sitting. Coordinate scope/namespace with the streaming-download SW work.

---

## 23. Web Share Target: send files to Warp from the OS share sheet

Labels: `enhancement`
Difficulty: advanced

### What & why
The natural mobile flow is Photos → Share → Warp. Today Warp can *emit* shares (`navigator.share` on the pair screen) but can't *receive* them — you must open Warp first and re-find the file in the picker. The Web Share Target API (installed-PWA feature, Android Chrome) puts Warp in the OS share sheet: pick photos anywhere, share to Warp, land on the Select step with the queue pre-filled. PairDrop ships exactly this (`share_target` in its manifest) and it's the most-loved mobile path.

### Where
- `web/public/site.webmanifest` — add the `share_target` entry (`method: "POST"`, `enctype: "multipart/form-data"`, `action: "/share-target"`, files param accepting `*/*`).
- The service worker (depends on the PWA-shell issue): intercept the POST to `/share-target`.
- `web/src/transfer/TransferFlow.tsx` — consume staged files into the queue on mount (reuse `addFiles`, ~line 63).
- `web/src/router.tsx` — route/entry handling for the share-target navigation.

### How
1. Manifest `share_target` with `files: [{ name: "files", accept: ["*/*"] }]` plus `title`/`text` params (shared text becomes a text-snippet draft — the composer already sends text).
2. SW `fetch` handler for POST `/share-target`: read `formData()`, stash the `File`s in a short-lived Cache/IDB slot (`share-stage`), then `Response.redirect("/send?shared=1", 303)` — the canonical dance, since the page can't receive the POST directly.
3. On `/send` mount with `?shared=1`: pull staged files from IDB into the queue, clear the stage, show them exactly like dropped files. Compose with drop-to-QR (#9) if it lands first — shared files should auto-open the room per that flow.
4. Clean up stale staged shares (TTL, reuse the `gcOrphanStaging` pattern from `web/src/lib/warp/idbStage.ts` line 178).
5. Degrade: browsers without share-target simply never invoke it; no UI changes needed for them.

### Acceptance criteria
- [ ] On installed Android-Chrome PWA: sharing 1–N photos from the gallery opens Warp with them queued.
- [ ] Sharing plain text/URLs pre-fills a text snippet draft.
- [ ] Staged files are cleared after consumption and TTL-cleaned if the flow is abandoned.
- [ ] No behaviour change on iOS/desktop (graceful absence).
- [ ] Files never leave the device until a normal WebRTC transfer is initiated — the share stage is local storage only.

### Constraints
- Requires the PWA/SW foundation — sequence after (or alongside) the offline-shell issue. Signaling remains a dumb relay; the shared files ride the normal offer/accept path. Mobile-first UI review mandatory (this is a mobile-only feature).

---

## 24. Resume an interrupted receive after a full page reload

Labels: `enhancement`, `help wanted`
Difficulty: advanced

### What & why
Warp survives socket drops, ICE failures, even full peer rebuilds — but not an accidental **tab reload** on the receiver: the resume ledger (`RxEntry`, `web/src/lib/warp/useWarpTransfer.ts` line 49) lives in hook memory, and orphaned IDB partials are eventually GC'd (`gcOrphanStaging`, `web/src/lib/warp/idbStage.ts` line 178). At 90% of a 40 GB receive, F5 costs you everything. The engine's resume protocol (`resumeToken`/`fileKey`/`file-begin offset` — `web/src/lib/warp/transfer.ts` lines 39–63) was deliberately built peer-id-agnostic, so reload-survival is a natural extension, not a redesign: croc treats resumability as table stakes.

### Where
- `web/src/lib/warp/useWarpTransfer.ts` — `RxEntry` lifecycle (`makeHost` ~line 295, salvage refs ~line 286) and room join.
- `web/src/lib/warp/idbStage.ts` — partials already persist here for the IDB sink; add a small metadata store (`rx-ledger`) beside the staging store.
- `web/src/router.tsx` / `web/src/transfer/TransferFlow.tsx` — rejoin needs the room code; `/r/:code` already encodes it for receivers.

### How
1. Persist a compact ledger per active receive: `{room, key, resumeToken, size, bytesWritten, sinkKind, savedName}` — written on each durable flush (piggyback on the existing "bytes only count after write resolves" commit point, so the ledger can never claim more than is durably stored).
2. On mount at `/r/:code`, look up ledger entries for that room; pre-create `RxEntry`s from them (the hook already supports pre-created entries: "reuses a pre-created entry (so a resumed file keeps its partial)" — `makeHost` comment ~line 292).
3. The sender's never-give-up salvage already re-offers unfinished files on peer reconnect with the same `resumeToken`; the restored receiver answers `accept` with its `resume` offsets and the transfer continues. Verify the H4/H5 owner-token invariants hold when the "new" receiver has a fresh selfId (the token design says they should — prove it in the check harness).
4. Sinks: IDB partials restore cleanly. FS-Access disk handles can be persisted in IDB and re-requested via `handle.requestPermission()` (one honest re-prompt); memory-sink receives can't survive reload — restart those from 0 and say so.
5. Room-code lifetime: within `RECLAIM_MS` (3 min, `server/src/index.js` line 10) the room is reclaimable, and the sender keeping the tab open holds it alive — document that this feature targets "receiver reloaded while sender stayed up" (the dominant real-world case).
6. Expire ledger rows aggressively (room closed, transfer completed, TTL) — this is user-activity data; keep it minimal.

### Acceptance criteria
- [ ] Receiver at partial progress reloads → rejoins via `/r/:code` → transfer resumes from the durable offset (IDB sink), verified byte-identical at completion.
- [ ] Disk-streaming receives resume after one permission re-prompt (Chromium).
- [ ] Memory-mode receives restart honestly with a visible "starting over" state, not silent corruption.
- [ ] Ledger rows are removed on completion/decline/cancel and TTL-expired otherwise.
- [ ] `useWarpTransfer.check.mjs` gains a reload-simulation case (tear down the hook, rebuild with a persisted ledger stub, assert resume offsets).

### Constraints
- No server-side state — the ledger is local IndexedDB only; the DO stays a dumb relay with no transfer memory. Don't weaken the durable-write invariant or the resume-token security model (a re-offer must still present the matching token). Cross-*device* resume is explicitly out of scope.

---

## 25. Internationalization: extract UI strings and ship the first translations

Labels: `enhancement`, `help wanted`
Difficulty: advanced

### What & why
Every user-facing string is hardcoded English inside components. File sharing with the person next to you is intensely local — PairDrop ships ~25 community translations and LocalSend ~50; i18n is *the* proven magnet for first-time contributors in this category (each new language is its own perfect starter PR forever after). The transfer surfaces (~a few hundred strings) are very translatable; the `/how` theory long-form can stay English-only initially.

### Where
- Highest-value surfaces first: `web/src/transfer/TransferFlow.tsx`, `web/src/transfer/SessionView.tsx`, `web/src/receive/ReceiveEntry.tsx`, `web/src/nearby/NearbyDevices.tsx`, error copy in `web/src/lib/warp/useWarpTransfer.ts`.
- New: `web/src/lib/i18n.ts` + `web/src/locales/{en,…}.ts`.
- Explicitly deferred: `web/src/theory/**`, `web/src/sections/**` (landing), `web/src/legal/**`.

### How
1. **No heavy framework** (project is lean; react-i18next et al. are overkill): a typed dictionary module — `const en = { pair_copy_link: "Copy link", … } as const`, `type Strings = typeof en`, other locales `Partial<Strings>` merged over `en`, and a `useT()` hook reading a context. Params via simple template functions where needed (`files_count: (n) => …` handles pluralization honestly).
2. Detection: `navigator.languages` matched against available locales; manual override persisted in `localStorage`; a small mono language switcher in the footer (`web/src/sections/FooterCta.tsx`) and on the transfer surfaces' chrome.
3. `document.documentElement.lang` updated on switch (a11y/SEO); `useDocumentSeo` titles per locale for the transfer routes.
4. Number/size formatting: route `formatBytes` (`web/src/lib/warp/transfer.ts`) through `Intl.NumberFormat` with the active locale.
5. Seed with 2–3 launch locales from native-speaker contributors (the issue should invite them: "comment to claim a language"). Add `docs/TRANSLATING.md`: how to add a locale file, test it, and what NOT to translate (brand name, room codes, design-token labels).
6. RTL: out of scope for v1, but don't paint yourself into a corner — avoid string concatenation that assumes LTR ordering; note it in TRANSLATING.md.

### Acceptance criteria
- [ ] All strings on `/send`, `/r/:code`, `/receive`, and the nearby flow come from the dictionary (grep for JSX string literals as the review gate).
- [ ] Missing keys fall back to English at runtime AND fail `tsc` for the `en` master (typed keys).
- [ ] Language switcher works, persists, and updates `<html lang>`.
- [ ] At least one non-English locale ships complete on the covered surfaces.
- [ ] Bundle cost measured: locales lazy-loaded or demonstrably tiny (<5 KB each).
- [ ] `docs/TRANSLATING.md` exists with the claim-a-language workflow.

### Constraints
- No i18n SaaS, no paid TMS, no runtime CDN fetch for strings ($0, self-contained). Keep the inline-style design system untouched — this PR changes strings, not layout (watch German/Finnish length blowups at 360px, though: verify the worst screens).

---

## 26. Playwright end-to-end test: a real two-tab transfer in CI

Labels: `enhancement`, `help wanted`
Difficulty: advanced

### What & why
The engine has unit-level check harnesses and the server has an e2e suite, but **nothing exercises the real stack end-to-end**: two browsers, real signaling, real WebRTC, real bytes. Regressions like "the 40% freeze" (fixed in `9efe239`) are exactly the class that only an integration test catches. Headless Chromium does real loopback WebRTC (host candidates, no STUN needed), so this is entirely CI-able on free GitHub runners.

### Where
- New: `web/e2e/transfer.spec.ts` + `web/playwright.config.ts`.
- Servers under test: `pnpm dev:server` (wrangler dev :8787 — the server e2e in `server/test/` already boots this in CI, reuse the pattern) and `vite preview` of the production build. Requires the `VITE_SIGNALING_URL` issue (#1 in this backlog) so the built app targets localhost — sequence after it.
- CI: a new `e2e` job in `.github/workflows/ci.yml` gated on web or server changes.

### How
1. Playwright config: one Chromium project, `launchOptions.args: ["--use-fake-ui-for-media-stream"]` not needed (no camera) but DO keep default WebRTC; two `browser.newContext()`s in one test give two isolated "devices" on one loopback host.
2. Test script the golden path: context A opens `/send` (or `/`→send), queues a generated file (`page.setInputFiles` with an in-memory 4 MB buffer of random bytes), reads the room code from the DOM; context B opens `/r/<code>`, waits for the accept modal, accepts; assert A shows `done`, B's tray item completes, and the downloaded bytes hash-match the sent buffer (route the download via Playwright's `page.on("download")`).
3. Second test: decline path (B declines → A shows `declined`, channel stays open, A can re-offer).
4. Third test (stretch): text snippet round-trip — cheap and covers the composer.
5. Keep it fast and honest: 4 MB file, generous-but-bounded timeouts, retry once in CI (WebRTC setup can flake), total budget <3 min. Tag `@smoke` so it can also run locally via `pnpm --filter @warp/web e2e`.
6. Mid-transfer disconnect/resume e2e is a tempting follow-up — leave a TODO, don't scope it in (needs network-condition tooling).

### Acceptance criteria
- [ ] `pnpm --filter @warp/web e2e` runs green locally with `pnpm dev:server` running (or the script boots it).
- [ ] CI job runs the suite headless on ubuntu-latest and fails on a broken transfer path (verify with a deliberate red run, then revert).
- [ ] Byte-level integrity assertion on the received file (hash compare, not just "done" status).
- [ ] Decline path covered.
- [ ] Suite adds <3 minutes to CI and doesn't run on docs-only changes (respect the existing `paths-filter` setup).

### Constraints
- Free GitHub runners only — no paid browser grids, no Sauce/BrowserStack. Chromium-only is fine for v1 (Firefox/WebKit are follow-ups). Don't replace the `.check.mjs` harnesses — this complements them (CONTRIBUTING positions them as the engine's regression net).

---

## Summary

| Difficulty | Count | Numbers |
|---|---|---|
| good-first | 12 | 1–12 |
| intermediate | 9 | 13–20, 22 |
| advanced | 5 | 21, 23–26 |

Total **26 issues** — 12 good-first (46%).

Competitor sources consulted: [PairDrop](https://github.com/schlagmichdoch/PairDrop) (device names, share target, QR pairing, translations), [FilePizza](https://github.com/kern/filepizza) (service-worker streaming downloads, keep-tab-open guard), [Snapdrop](https://github.com/SnapDrop/snapdrop) (notifications, PWA), [webwormhole](https://github.com/saljam/webwormhole) / [magic-wormhole](https://github.com/magic-wormhole/magic-wormhole) (code-guess resistance), [croc](https://github.com/schollz/croc) (resume as table stakes, code-first sharing), [LocalSend](https://github.com/localsend/localsend) (device naming, translations at scale).
