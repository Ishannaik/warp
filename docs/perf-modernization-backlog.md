# Warp — Performance, Modernization & SEO Backlog

Grounded against the real codebase (`web/`, `server/`) and current (2026) tooling/best-practice research. 12 issues, contributor-ready. See `perf-modernization-backlog.json` for the machine-readable form.

## Index

| # | Title | Labels | Difficulty |
|---|---|---|---|
| 1 | Code-split routes and lazy-load the /how theory diagrams | performance, enhancement | intermediate |
| 2 | Split vendor code into long-term-cache chunks and add a bundle visualizer | performance, good first issue | good-first |
| 3 | Serve hashed build assets with long-lived immutable Cache-Control | performance, good first issue | good-first |
| 4 | Add a Content-Security-Policy header (currently missing entirely) | enhancement, help wanted | intermediate |
| 5 | Modernize the eslint/typescript-eslint/Vite toolchain (unblocks Dependabot #5) | enhancement, help wanted | intermediate |
| 6 | Upgrade TypeScript and turn on stricter compiler options | enhancement, help wanted | advanced |
| 7 | Make canonical URL, Open Graph/Twitter tags, and JSON-LD update per route | enhancement | intermediate |
| 8 | Prerender static HTML snapshots for crawlers and link-unfurlers | enhancement, performance | advanced |
| 9 | Add a Lighthouse / Core Web Vitals budget check to CI | performance, enhancement | intermediate |
| 10 | Centralize File System Access capability detection into a receive-adapter module | enhancement, performance | intermediate |
| 11 | Add a File System Access ponyfill so Firefox/Safari get a real save picker | enhancement, help wanted | advanced |
| 12 | Document the receive-strategy/browser support matrix | documentation, good first issue | good-first |

---

## 1. Code-split routes and lazy-load the /how theory diagrams

**Labels:** `performance`, `enhancement`  
**Difficulty:** intermediate

## What & why

The whole app currently ships as **one JS chunk**. A real `pnpm --filter @warp/web build` on this checkout produces:

```
dist/assets/index-AGuyrpdP.js   504.20 kB │ gzip: 146.01 kB
(!) Some chunks are larger than 500 kB after minification.
```

That single chunk is loaded on **every** route — including `/` (Landing) and `/send`, the two most-visited pages — even though it contains the entire `/how` "theory" page, which is huge: `web/src/theory/Theory.tsx` is 1645 lines and `web/src/theory/diagrams/` is **16 files totalling 7136 lines** (`Chunking.tsx`, `DurableObject.tsx`, `NatStun.tsx`, seven `L0Direct.tsx`…`L7Bedrock.tsx` "depth" diagrams, `primitives.tsx` at 27.5 KB, etc.). A visitor who only wants to send a file pays for a physics-and-networking explainer they'll never open.

`web/src/App.tsx` (lines 3–8) imports every route component eagerly:

```ts
import Landing from "./Landing";
import TransferFlow from "./transfer/TransferFlow";
import Theory from "./theory/Theory";
import ReceiveEntry from "./receive/ReceiveEntry";
import BrandKit from "./brand/BrandKit";
import Legal from "./legal/Legal";
```

and `web/src/theory/Theory.tsx` (lines 16–30+) statically imports all 16 diagram components, so Rollup has no chance to split them off even if the route were lazy.

## Where

- `web/src/App.tsx` — the route switch (lines 62–77) that currently renders `<TransferFlow />`, `<Theory />`, etc. directly.
- `web/src/theory/Theory.tsx` — imports every file under `web/src/theory/diagrams/` up front.
- `web/vite.config.ts` — currently just `{ plugins: [react(), tailwindcss()] }`, no `build.rollupOptions`.

## How

1. Wrap each route in `React.lazy()` + a single `<Suspense>` boundary in `App.tsx`:
   ```ts
   const TransferFlow = lazy(() => import("./transfer/TransferFlow"));
   const Theory = lazy(() => import("./theory/Theory"));
   const BrandKit = lazy(() => import("./brand/BrandKit"));
   const Legal = lazy(() => import("./legal/Legal"));
   ```
   Keep `Landing` (and probably `ReceiveEntry`, it's tiny) eager since `/` is the hottest path and you don't want an extra network round-trip + fallback flash for the landing page itself.
2. Add a minimal `<Suspense fallback={...}>` — reuse the existing bg (`#121110`) so there's no white flash; keep it mobile-safe (no fixed pixel sizing, per the CLAUDE.md mobile-first rule).
3. Inside `Theory.tsx`, the 16 diagram imports don't all need to load at once either — `L0Direct.tsx`…`L7Bedrock.tsx` are behind a "depth gauge" (`DepthGauge` in `primitives.tsx`) that the user scrolls/clicks through. Consider lazy-loading those per-depth-level too, or at minimum confirm Rollup pulls the whole `diagrams/` folder into the new `Theory` chunk (not back into the main chunk) after step 1 — run `pnpm --filter @warp/web build` and check `dist/assets/` for a separate `Theory-*.js` chunk.
4. This project uses a hand-rolled router (`web/src/router.tsx`, no React Router), so there's no built-in route-based lazy convention — the `lazy()` calls above are all that's needed, no router config changes.
5. Re-run the build and record the new main-chunk size in the PR description (before/after KB, gzip'd).

## Acceptance criteria

- [ ] `App.tsx` lazy-loads `TransferFlow`, `Theory`, `BrandKit`, and `Legal` behind `React.lazy` + `Suspense`.
- [ ] A production build (`pnpm --filter @warp/web build`) shows the `/how` diagrams in their own chunk(s), separate from the chunk loaded by `/` and `/send`.
- [ ] The main entry chunk shrinks measurably (target: comfortably under the 500 kB Rollup warning threshold) — paste before/after sizes in the PR.
- [ ] The Suspense fallback matches the dark theme (`#121110` bg) and works at 360–430px mobile width with no layout shift/flash.
- [ ] `pnpm --filter @warp/web build` (lint + typecheck + build) is clean.
- [ ] Manually verify `/`, `/send`, `/receive`, `/how`, `/brand`, `/terms`, `/privacy` all still render correctly (client router has no built-in error boundary for lazy-chunk fetch failures — a fresh deploy invalidating an in-flight lazy chunk is a known SPA footgun; at minimum confirm normal navigation works, a retry-on-chunk-error wrapper is a nice-to-have, not required here).

## Constraints

- No new router library — keep `web/src/router.tsx`'s hand-rolled `navigate`/`useRoute`.
- $0 infra — this is a client-bundling change only, no server/Worker changes.
- Don't regress the transfer UI itself; this is purely about *when* JS is fetched, not the WebRTC engine.

---

## 2. Split vendor code into long-term-cache chunks and add a bundle visualizer

**Labels:** `performance`, `good first issue`  
**Difficulty:** good-first

## What & why

`web/vite.config.ts` has no `build.rollupOptions`, so React/ReactDOM, `qrcode`, and `fflate` (see `web/package.json` dependencies) are bundled into the same single chunk as all of Warp's own application code. That means **every** app deploy invalidates the browser cache for React itself, even though React changes far less often than Warp's own UI code. Vendor code that rarely changes should live in its own chunk with its own stable content hash, so a returning visitor's browser can reuse it across Warp releases.

This is a smaller, standalone piece of the code-splitting work (see the companion route/Theory lazy-loading issue) — good as a first PR into the build config.

## Where

- `web/vite.config.ts` (currently: `{ plugins: [react(), tailwindcss()] }`, no `build` key at all).
- `web/package.json` dependencies: `fflate`, `qrcode`, `react`, `react-dom`.

## How

1. Add a `build.rollupOptions.output.manualChunks` function (function form, not the object form — the object form breaks with dynamic imports/circular deps more easily):
   ```ts
   build: {
     rollupOptions: {
       output: {
         manualChunks(id) {
           if (id.includes("node_modules")) {
             if (id.includes("react-dom") || id.includes("/react/")) return "vendor-react";
             if (id.includes("qrcode")) return "vendor-qrcode";
             if (id.includes("fflate")) return "vendor-fflate";
             return "vendor";
           }
         },
       },
     },
   },
   ```
   Tune the buckets after inspecting actual output — don't over-fragment (many tiny chunks add HTTP overhead too); start coarse and only split further if a visualizer run justifies it.
2. Add `rollup-plugin-visualizer` as a devDependency and wire it into `vite.config.ts` behind an env flag (e.g. only when `process.env.ANALYZE` is set) so it doesn't run on every CI build:
   ```ts
   import { visualizer } from "rollup-plugin-visualizer";
   plugins: [react(), tailwindcss(), process.env.ANALYZE && visualizer({ open: true, gzipSize: true })].filter(Boolean),
   ```
3. Run `ANALYZE=1 pnpm --filter @warp/web build` locally, inspect the treemap, and confirm the vendor chunk(s) look sane (no accidental duplication of React across chunks — that's the classic manualChunks footgun).
4. Because `qrcode` is used to render the pairing QR code, confirm it isn't needed on the very first paint of `/send` — if it's below-the-fold or behind a step, it's a good candidate for a *dynamic* `import("qrcode")` instead of a static one, which is an easy follow-up (call this out in the PR even if you don't do it, so it's not lost).

## Acceptance criteria

- [ ] `manualChunks` splits at least React/ReactDOM into a dedicated chunk with a stable hash across a code-only change to app source (verify: touch a non-vendor file, rebuild, confirm the vendor chunk's hash is unchanged).
- [ ] `rollup-plugin-visualizer` is available via an opt-in `ANALYZE=1` build and does not run (or add output) on a normal `pnpm --filter @warp/web build`.
- [ ] No chunk regresses to being *larger* than before (i.e. this isn't just moving bytes around for no benefit — the point is fewer bytes invalidated per deploy).
- [ ] `pnpm --filter @warp/web build` stays clean (lint + typecheck + build).

## Constraints

- $0 infra — build-time only, no server changes.
- Keep the config readable; this is a hobby project's Vite config, not a monorepo build system — don't over-engineer the chunking strategy.

---

## 3. Serve hashed build assets with long-lived immutable Cache-Control

**Labels:** `performance`, `good first issue`  
**Difficulty:** good-first

## What & why

Verified against the **live production site**:

```
$ curl -sI https://warp.ishannaik.com/assets/index-BMEkc1ji.js
content-type: application/javascript
cache-control: public, max-age=0, must-revalidate
```

`index-BMEkc1ji.js` is a Vite content-hashed filename — it is by definition immutable (a new build always produces a new hash, per `dist/assets/index-<hash>.js` from the local build). But it's being served with `max-age=0, must-revalidate`, which is Cloudflare Pages' default for everything (confirmed: the HTML document at `/` gets the identical header). That means **every** returning visitor's browser re-validates the JS/CSS bundle with the origin on every single load, instead of reading it straight from disk cache for up to a year. For a WebRTC app whose whole pitch is "instant" transfer, an avoidable revalidation round-trip before the app can even boot is real, measurable latency.

`web/public/_headers` today only sets security headers, with a single `/*` block and no path-scoped rules at all:

```
/*
  X-Content-Type-Options: nosniff
  Referrer-Policy: strict-origin-when-cross-origin
  X-Frame-Options: SAMEORIGIN
  Strict-Transport-Security: max-age=31536000; includeSubDomains
  Permissions-Policy: geolocation=(), microphone=(), camera=(self)
```

## Where

- `web/public/_headers` — files here are copied verbatim into `dist/` by Vite (anything in `public/` ships as-is) and Cloudflare Pages reads `_headers` from the deployed `dist/` root.
- `web/vite.config.ts` — confirms the default `assetsDir` (`assets/`) and hashed filenames (`[name]-[hash].js`), which is what makes this safe.

## How

1. Add a path-scoped block **above or below** the existing `/*` block (Cloudflare Pages applies the *most specific* matching rule per header, more-specific paths win over `/*` for the same header name — verify behavior after deploy, don't just assume):
   ```
   /assets/*
     Cache-Control: public, max-age=31536000, immutable
   ```
2. Do **not** apply `immutable`/long `max-age` to `/index.html` itself (or any non-hashed file like `/site.webmanifest`, `/favicon.svg`, `/robots.txt`, `/sitemap.xml`, `/og.jpg`) — those must keep revalidating (`max-age=0, must-revalidate` is *correct* for the HTML shell, since it's what points at the current hashed bundle; caching it long-term would pin visitors to a stale bundle reference after your next deploy).
3. Deploy to a preview or the real Pages project and re-run the `curl -sI` check above against the new hashed filename to confirm `cache-control: public, max-age=31536000, immutable` is actually returned (Cloudflare Pages' own edge cache and any browser cache can both mask a misconfigured rule in casual testing — the `curl -I` above is the ground truth).
4. Leave the existing `/*` security-header block untouched; `_headers` merges multiple matching blocks by header name, it doesn't replace the whole block.

## Acceptance criteria

- [ ] `/assets/*` (or the more specific hashed-JS/CSS glob you choose) responds with `Cache-Control: public, max-age=31536000, immutable` — verified with `curl -sI` against a real deploy, not just reasoning about the config file.
- [ ] `/index.html` (and `/`, `/send`, etc., which all serve `index.html` via `_redirects`) still responds with a short/no-cache `Cache-Control` so new deploys are picked up promptly.
- [ ] The existing security headers (`X-Content-Type-Options`, `Strict-Transport-Security`, etc.) are unaffected — re-check with `curl -sI` on `/`.
- [ ] No change to app code; this is a `_headers`-only PR.

## Constraints

- Cloudflare Pages free tier only — no Workers/Functions needed for this (a static `_headers` rule is enough; see the separate CSP/middleware issue for anything that needs actual logic).
- Don't cache anything Cloudflare-Pages-generated that isn't content-hashed.

---

## 4. Add a Content-Security-Policy header (currently missing entirely)

**Labels:** `enhancement`, `help wanted`  
**Difficulty:** intermediate

## What & why

`web/public/_headers` sets five good security headers (nosniff, referrer-policy, frame-options, HSTS, permissions-policy) but has **no `Content-Security-Policy` at all**. Verified live:

```
$ curl -sI https://warp.ishannaik.com/ | grep -i content-security
(no output — header is absent)
```

Without a CSP, an XSS bug anywhere in the app (or a compromised dependency — this app pulls in `qrcode`, `fflate`, and the whole Vite/React toolchain) has an unrestricted blast radius: arbitrary script injection, arbitrary fetch/exfiltration targets, arbitrary iframe embedding beyond what `X-Frame-Options` already blocks. For an app whose entire value proposition is "your files never touch a server, trust us," a real CSP is a meaningful, visible trust signal — and a genuinely useful defense-in-depth layer.

## Where

- `web/public/_headers` — the only place headers are currently set (a flat file, no logic).
- `web/index.html` — inline `<script type="application/ld+json">` (JSON-LD) and Google Fonts `<link>`s need explicit CSP allowances or they'll be the first thing a strict policy breaks.
- `web/src/lib/warp/signaling.ts:22` — `const SIGNALING_URL = "wss://warp-signaling.ishannaik7.workers.dev";` — this is the only cross-origin `connect-src` the app legitimately needs (plus STUN, which isn't fetch/XHR and isn't CSP-governed the same way, but WebRTC's own network access isn't blocked by `connect-src` in most browsers — verify current spec behavior before assuming otherwise).

## How

1. Start in **Report-Only** mode so you don't break production on a wrong guess: add `Content-Security-Policy-Report-Only` to `_headers` first, watch the (browser devtools / a temporary `report-uri`) console for violations across every route (`/`, `/send`, `/r/<code>`, `/receive`, `/how`, `/brand`, `/terms`, `/privacy`) and the actual transfer flow (drag-drop, QR pairing, accept-modal, disk-streaming download), then flip to the enforcing header once it's quiet.
2. A reasonable starting policy for this app's actual surface (adjust after the report-only pass, don't ship this unverified):
   ```
   Content-Security-Policy: default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline' https://fonts.googleapis.com; font-src https://fonts.gstatic.com; img-src 'self' data: blob:; connect-src 'self' wss://warp-signaling.ishannaik7.workers.dev; worker-src 'self' blob:; base-uri 'none'; form-action 'none'; frame-ancestors 'none'
   ```
   Notes on the tricky parts:
   - `style-src 'unsafe-inline'` is needed because the app is "inline-`style`-heavy" by design (per `CLAUDE.md`); a nonce/hash-based approach would be more correct but is a much bigger refactor — call this trade-off out explicitly in the PR rather than silently shipping `unsafe-inline`.
   - `script-src 'self'` with **no** `unsafe-inline`: check whether Vite's production build emits any inline `<script>` (it emits `<script type="module" crossorigin src="...">`, which is fine, but double check the JSON-LD `<script type="application/ld+json">` block in `index.html` isn't blocked — `application/ld+json` is a data island, not executable, and is exempt from `script-src`, but verify in a real browser, don't assume).
   - `img-src blob:` is required for client-side file previews / the "Download all (.zip)" flow.
   - `worker-src blob:` will be needed if issue #33 (service-worker streaming downloads) or the File System Access fallback-adapter work lands.
   - If issue #13 (configurable `VITE_SIGNALING_URL`) lands first/alongside, the `connect-src` value here needs to become environment-aware rather than hardcoded — flag that dependency in the PR.
3. Decide static `_headers` vs. a Cloudflare Pages Function `functions/_middleware.js`: a static `_headers` rule is sufficient for a fixed policy (no per-request logic needed today), and is simpler/zero-cost. Only reach for `functions/_middleware.js` if you want a nonce-based policy or per-route differences — if you do, note that **`_headers`-file rules do not apply to responses generated by a Pages Function**, so picking middleware means moving *all* header-setting there, not just CSP (don't end up with headers split across two systems).

## Acceptance criteria

- [ ] A CSP (start Report-Only, then enforcing) is live on all routes, verified with `curl -sI` for the enforcing header on the deployed site.
- [ ] The full transfer flow (drag-drop send, QR-code pairing, accept modal, receive-to-disk via File System Access picker, "Download all" zip) is exercised in a report-only pass with **zero** unexpected violations logged.
- [ ] Google Fonts (Bricolage Grotesque / Archivo / JetBrains Mono, loaded via `<link>` in `index.html`) still render.
- [ ] The signaling WebSocket (`wss://warp-signaling.ishannaik7.workers.dev`) still connects — a broken `connect-src` would silently kill every pairing.
- [ ] Document the final chosen policy and the reasoning behind any `unsafe-*` directive in a code comment next to the `_headers` rule (or in the PR description if middleware is used instead).

## Constraints

- $0 infra, no relay — this only touches headers/policy, not the WebRTC/STUN path itself.
- STUN traffic (UDP, not fetch/XHR/WebSocket) — don't assume `connect-src` blocks it; verify rather than over-restrict and silently break NAT traversal.
- Mobile-first isn't directly relevant here, but re-test the mobile transfer flow specifically since it's the primary use case per `CLAUDE.md`.

---

## 5. Modernize the eslint/typescript-eslint/Vite toolchain (unblocks Dependabot #5)

**Labels:** `enhancement`, `help wanted`  
**Difficulty:** intermediate

## What & why

`web/package.json` currently pins:

```
"eslint": "^9.17.0",
"typescript-eslint": "^8.19.0",
"@vitejs/plugin-react": "^4.3.4",
"globals": "^15.14.0",
"vite": "^6.0.7",
"typescript": "^5.7.3"
```

Current npm registry latest (checked live): `eslint@10.7.0`, `typescript-eslint@8.64.0`, `vite@8.1.5`, `globals@17.7.0`. Dependabot's open PR **#5** (`chore(deps-dev): bump the npm group across 1 directory with 12 updates`) attempts exactly this bump, and its `web` CI check **fails**. The actual failure, pulled from the real GitHub Actions run for that PR:

```
> @warp/web@0.1.0 lint /home/runner/work/warp/warp/web
> eslint .

Oops! Something went wrong! :(
ESLint: 10.7.0
TypeError: Cannot read properties of undefined (reading 'Cjs')
    at Object.<anonymous> (.../@typescript-eslint+typescript-estree@8.64.0_typescript@7.0.2/.../create-program/shared.js:59:18)
```

That trace is `typescript-eslint@8.64.0` failing against `typescript@7.0.2` (TypeScript 7 / "Project Corsa", the Go-native compiler rewrite that reached GA on 2026-07-08) — **not** an ESLint 10 problem per se. `typescript-eslint`'s type-aware rules depend on TypeScript's programmatic API, and TS 7.0 shipped without a stable one (Microsoft's own guidance: the stable API lands in 7.1, and a TS7-support request filed against `typescript-eslint` on GA day was closed "not planned" for 7.0). So the npm `peerDependencies` resolution dependabot picked (TS 7.0.2) is simply not yet supported by the lint toolchain — this is not a Warp bug, it's an ecosystem timing gap, and the fix is to pin around it, not to fight it blindly.

This issue is about landing the parts of #5's bump that **do** work today, and unblocking the rest with an explicit, documented pin — rather than leaving Dependabot's PR open and red indefinitely.

## Where

- `web/package.json` — the pinned devDependency versions.
- `web/eslint.config.js` — flat config using `tseslint.config(...)`; check the ESLint 10 flat-config changelog for breaking changes to the config shape before bumping (ESLint 9→10 is a major version).
- `.github/workflows/ci.yml` — the `web` job runs `lint` → `typecheck` → `build` as three separate steps; a toolchain bump must keep all three green.
- GitHub PR/issue: `Ishannaik/warp#5` (the open Dependabot PR to reconcile with, not duplicate).

## How

1. **Split the upgrade**: TypeScript itself is out of scope here (see the companion "TypeScript upgrade" issue) — hold `typescript` back from #5's proposed `7.0.2` for now and bump everything else `typescript-eslint` can actually run against.
2. Bump `eslint` 9→10, `@vitejs/plugin-react` 4→6, `eslint-plugin-react-hooks`, `eslint-plugin-react-refresh`, `globals`, `tailwindcss`, `@tailwindcss/vite`, and `typescript-eslint` to latest, but keep `typescript` on the current 5.x line (or the highest 5.x/6.x release `typescript-eslint`'s peer range actually supports — check its `package.json` `peerDependencies` at the version you land on).
3. Read the ESLint 9→10 and `@vitejs/plugin-react` 4→6 changelogs for breaking changes; `web/eslint.config.js` is currently a small flat config (`tseslint.config(...)` wrapping `js.configs.recommended` + `tseslint.configs.recommended` + the two React plugins) — confirm the shape is still valid, ESLint 10 has been tightening flat-config validation.
4. Run `pnpm --filter @warp/web lint && pnpm --filter @warp/web typecheck && pnpm --filter @warp/web build` locally and fix anything the newer rule sets now flag (a version bump this size commonly surfaces a few real, previously-silent lint issues — fix them, don't suppress them blanket-style).
5. Once green, either: (a) close/comment on #5 explaining the TS-7 split and that a follow-up will finish it once `typescript-eslint` supports TS 7.1's stable API, or (b) push directly to the dependabot branch if repo permissions allow, whichever this repo's workflow prefers — coordinate in the PR description either way so the two efforts don't collide.
6. Leave a comment in `web/package.json` (next to `typescript`) noting *why* it's pinned below latest, with a link back to this issue and to the upstream `typescript-eslint` TS7-tracking issue, so the next person doesn't "fix" it by bumping blindly and reintroducing the crash.

## Acceptance criteria

- [ ] `eslint`, `@vitejs/plugin-react`, `typescript-eslint`, `globals`, `tailwindcss`, `@tailwindcss/vite` are bumped to current-latest-compatible versions.
- [ ] `typescript` stays on a version `typescript-eslint`'s installed version actually declares support for (verify via its `peerDependencies`, don't guess).
- [ ] `pnpm --filter @warp/web lint`, `typecheck`, and `build` are all green locally and in CI.
- [ ] A code comment in `web/package.json` (or a `README`/`CLAUDE.md` note) explains the TypeScript pin and links to the tracking issue for lifting it.
- [ ] Dependabot PR #5 is either closed with an explanation comment, or superseded/merged via this issue's branch — not left open and silently red.

## Constraints

- No behavior change to the app itself — this is dependency/tooling only.
- Don't disable or blanket-suppress newly-surfaced lint rules to force green; fix the underlying code or, if a rule is genuinely wrong for this codebase, disable it narrowly with a comment explaining why.

---

## 6. Upgrade TypeScript and turn on stricter compiler options

**Labels:** `enhancement`, `help wanted`  
**Difficulty:** advanced

## What & why

`web/package.json` pins `"typescript": "^5.7.3"`; the current npm registry latest is `typescript@7.0.2` — **TypeScript 7.0 / "Project Corsa"**, a full port of the compiler and language service to Go, which reached general availability 2026-07-08 and is reported to be roughly 10x faster on type-checks. That's a genuinely compelling upgrade for a project with a 1645-line `Theory.tsx`, a 973-line `useWarpTransfer.ts`, and a 1079-line `peer.ts`.

**But it isn't a safe drop-in yet for this repo's toolchain.** TypeScript 7.0 shipped without a stable programmatic compiler API — the stable API lands in 7.1 — and `typescript-eslint`'s type-aware lint rules depend on exactly that API. This is not theoretical: it's the confirmed, live cause of Dependabot PR #5's failing `web` check in this repo (see the companion toolchain-migration issue for the full stack trace). So this issue is scoped to: (a) land the TS version bump in a way that doesn't break lint, and (b) separately tighten `web/tsconfig.json`, which has been sitting on a fairly permissive strict configuration.

Current `web/tsconfig.json`:

```json
{
  "compilerOptions": {
    "target": "ES2022",
    "useDefineForClassFields": true,
    "lib": ["ES2022", "DOM", "DOM.Iterable"],
    "module": "ESNext",
    "skipLibCheck": true,
    "moduleResolution": "bundler",
    "allowImportingTsExtensions": true,
    "resolveJsonModule": true,
    "isolatedModules": true,
    "moduleDetection": "force",
    "noEmit": true,
    "jsx": "react-jsx",
    "strict": true,
    "noUnusedLocals": true,
    "noUnusedParameters": true,
    "noFallthroughCasesInSwitch": true,
    "types": ["vite/client"]
  },
  "include": ["src", "vite.config.ts"]
}
```

`strict` is on, which is good, but several high-signal options that catch real bugs are **not** enabled: `noUncheckedIndexedAccess`, `exactOptionalPropertyTypes`, `noImplicitOverride`, `noPropertyAccessFromIndexSignature`, `verbatimModuleSyntax`. Given this codebase does a lot of manual protocol/wire-format parsing (`web/src/lib/warp/transfer.ts`, `peer.ts`'s binary chunk framing, `useWarpTransfer.ts`'s registry `Map`s keyed by file id) — exactly the kind of code where an unchecked `array[i]` or `map.get(x)` silently typed as non-`undefined` causes real runtime bugs — `noUncheckedIndexedAccess` in particular is likely to catch genuine latent issues, not just bikeshedding.

## Where

- `web/tsconfig.json` — the only TS config (no separate app/node split; `vite.config.ts` is included in the same config).
- `web/package.json` — the `typescript` devDependency pin.
- `web/src/lib/warp/` — the highest-value place to run the stricter flags against first (`transfer.ts`, `peer.ts`, `useWarpTransfer.ts`, `receiveController.ts`, `idbStage.ts`, `signaling.ts`, `useNearby.ts` — the whole WebRTC engine, ~3150 lines).

## How

1. **Version**: coordinate with the toolchain-migration issue — if `typescript-eslint` still doesn't support TS 7's API when you pick this up, either (a) stay on the latest TS 5.x/6.x line `typescript-eslint` officially supports and file a fast-follow once 7.1 support lands, or (b) if you want TS 7's speed *now*, investigate Microsoft's compatibility package for pinning a TS-6-compatible surface just for ESLint's type-aware rules while `tsc` itself runs on 7 (check current docs — this shipped as part of the 7.0 migration story). Don't silently downgrade `typescript-eslint`'s effective TS version without documenting the trade-off.
2. **Stricter flags**: enable one at a time, not all at once — each will surface a distinct wave of errors and a single giant PR is unreviewable:
   - `noUncheckedIndexedAccess` first (highest bug-catching value here) — expect it to touch `Map`/array access throughout `web/src/lib/warp/`.
   - `noImplicitOverride`, `noPropertyAccessFromIndexSignature` next (usually low-diff).
   - `exactOptionalPropertyTypes` and `verbatimModuleSyntax` last — both tend to be the most invasive on an existing codebase; do them as separate follow-up PRs if the diff from the first two is already large.
3. For each flag, run `pnpm --filter @warp/web typecheck` and fix the real bugs it surfaces with actual guards/narrowing — do not blanket `as T` or `!` your way past `noUncheckedIndexedAccess` errors, that defeats the entire point of turning it on.
4. Keep `web/tsconfig.json` a single file (no need to split into `tsconfig.app.json`/`tsconfig.node.json` project-references the Vite template default uses elsewhere — this repo deliberately kept it simple, matching the existing style, unless a real reason to split emerges).

## Acceptance criteria

- [ ] `typescript` is bumped, with the version choice and its lint-compatibility trade-off documented (in the PR description and/or a `tsconfig.json`/`package.json` comment).
- [ ] `noUncheckedIndexedAccess` is enabled and the codebase is clean under it — real narrowing/guards added, not blanket assertions.
- [ ] At least `noImplicitOverride` and `noPropertyAccessFromIndexSignature` are also enabled (or a documented reason given for deferring either).
- [ ] `pnpm --filter @warp/web typecheck` and `build` are green.
- [ ] No behavior change — this is a types-only PR; if a stricter flag reveals what looks like an actual runtime bug (not just a typing gap), split that fix into its own PR/issue rather than silently bundling a behavior change in here.

## Constraints

- Must stay compatible with the lint toolchain (coordinate with the eslint/typescript-eslint migration issue — don't land a TS version that breaks `pnpm --filter @warp/web lint` in CI).
- No behavior changes to the WebRTC engine — this issue is types and compiler flags only.

---

## 7. Make canonical URL, Open Graph/Twitter tags, and JSON-LD update per route

**Labels:** `enhancement`  
**Difficulty:** intermediate

## What & why

`web/index.html` hardcodes canonical/OG/Twitter/JSON-LD for the **landing page only**, and because this is a client-side-routed SPA (`web/src/router.tsx`, no SSR), those static `<head>` tags never change as the user (or a crawler) navigates:

```html
<link rel="canonical" href="https://warp.ishannaik.com/" />
...
<meta property="og:title" content="Warp — Send files directly between devices" />
<meta property="og:url" content="https://warp.ishannaik.com/" />
...
<script type="application/ld+json">
  { "@type": "WebApplication", "name": "Warp", "url": "https://warp.ishannaik.com", ... }
</script>
```

`web/src/lib/useDocumentSeo.ts` (used from `web/src/App.tsx`'s `seoForRoute()`) only updates `document.title` and the `<meta name="description">` content on navigation — it does **not** touch `<link rel="canonical">`, the OG/Twitter tags, or the JSON-LD block. Concretely: right now, if you share a link to `/how` or `/brand` on social media, the Open Graph preview shows the **landing page's** title/description/URL, not the actual page's — because `og:url` and `og:title` are frozen at the `index.html` values. Same for the canonical tag: `/terms` and `/privacy` both self-report their canonical URL as `https://warp.ishannaik.com/`, which actively tells search engines to *not* index them as distinct pages.

There's also only one JSON-LD block (`WebApplication`), present on every route regardless of content — a proper `SoftwareApplication` schema with pricing/category info (matching the actual `$0, no card, free & open-source` positioning already in `web/index.html`'s meta description) would be richer and is the schema type Google's own docs recommend for installable web apps over the more generic `WebApplication`.

## Where

- `web/index.html` — static `<head>` tags (lines ~15, ~18–38, ~41–57).
- `web/src/lib/useDocumentSeo.ts` — the hook that currently only sets title + meta description.
- `web/src/App.tsx` — `seoForRoute()` (lines 15–60) already has a clean per-route title/description map; this is the natural place to extend.
- `web/public/sitemap.xml` — already lists per-route URLs (`/`, `/send`, `/receive`, `/how`, `/brand`, `/terms`, `/privacy`) with `<lastmod>` — useful as the canonical list of routes to cover.

## How

1. Extend `seoForRoute()` in `App.tsx` (or move it into its own module if it grows) to return canonical path + OG/Twitter overrides + a per-route JSON-LD object, not just `{ title, description }`.
2. Extend `useDocumentSeo.ts` to also manage:
   - `<link rel="canonical">` — create/update it the same way the hook already creates/updates `<meta name="description">`.
   - `<meta property="og:title">`, `og:description`, `og:url` (and the Twitter equivalents) — same pattern.
   - A JSON-LD `<script type="application/ld+json">` — either update the existing static one's `textContent` in place, or inject a second route-specific block (e.g. `BreadcrumbList` for sub-pages) alongside the site-wide `SoftwareApplication` block; don't just delete/recreate the tag on every render (watch for a flash where crawlers might catch an empty state — set it synchronously in the same effect, same pattern the hook already uses).
   - `og:image`/`twitter:image` can stay pointed at the single `og.jpg` unless per-route social cards are wanted (that's a bigger asset-generation task — explicitly out of scope here, note it as a future issue if raised in review).
3. Upgrade the JSON-LD `@type` from `WebApplication` to `SoftwareApplication` (or keep both if there's a reason — check current Google structured-data guidelines for which is preferred for a PWA-installable tool; `web/public/site.webmanifest` already declares `display: standalone` and icons, so `SoftwareApplication` fits the app's actual installability), keeping the existing `offers: { price: "0" }` (accurate — matches the $0/no-card positioning in `CLAUDE.md`) and `sameAs` (GitHub repo link).
4. Test with a real crawler-view tool (e.g. Google's Rich Results Test, or simply `curl` + inspect — remembering a plain `curl` only sees the *static* `index.html`, not what `useDocumentSeo` injects client-side; this is exactly why the companion prerendering issue exists — note that limitation explicitly in the PR rather than declaring "SEO fixed" based on a browser-only check).

## Acceptance criteria

- [ ] Every route in `sitemap.xml` gets its own `<link rel="canonical">`, OG title/description/url, and Twitter title/description that reflect that route (not the landing page's) after client-side navigation.
- [ ] The JSON-LD schema is upgraded to (or supplemented with) `SoftwareApplication`, still accurately reflecting `$0`/free/open-source.
- [ ] `useDocumentSeo.ts`'s existing behavior (title, meta description) is preserved — this is additive, not a rewrite.
- [ ] Verified in a real browser's devtools `<head>` inspection across at least `/`, `/send`, `/how`, `/terms` that canonical/OG/JSON-LD actually change on navigation (not just on initial load).
- [ ] `pnpm --filter @warp/web build` clean.

## Constraints

- No SSR/build-time rendering in this issue — that's the separate prerendering issue below; this is purely the client-side `<head>`-management layer (which crawlers that execute JS, and social-share unfurlers that do, will see; ones that don't won't — call that limitation out explicitly).
- $0 infra, no new dependencies needed (this is plain DOM API, matching `useDocumentSeo.ts`'s existing style).

---

## 8. Prerender static HTML snapshots for crawlers and link-unfurlers

**Labels:** `enhancement`, `performance`  
**Difficulty:** advanced

## What & why

Warp is a 100%-client-rendered SPA (`web/src/main.tsx` mounts everything into `<div id="root">`; there is no server-side rendering — the Cloudflare Pages deploy is just the static `dist/` output). That means the *only* content a crawler or link-unfurler gets **without executing JavaScript** is whatever is hardcoded in `web/index.html` — the landing page's title/description/OG/JSON-LD (see the companion per-route SEO issue). Every other route (`/send`, `/how`, `/brand`, `/terms`, `/privacy`) serves the *exact same* `index.html` shell (that's what `web/public/_redirects`'s `/*  /index.html  200` rule does), and its real content only appears after React hydrates and `useDocumentSeo`/route components run.

Most major crawlers (Googlebot) do execute JS and will eventually see the real content, but: (1) it costs a second rendering pass in Google's indexing pipeline (their own docs note this can be delayed, sometimes by days), and (2) many *other* consumers of a page's HTML — Slack/Discord/iMessage link previews, Twitter/X card unfurlers, some SEO auditing tools — do **not** execute JavaScript at all, and will show the landing page's title/description for a shared `/terms` or `/brand` link. `web/public/robots.txt` and `sitemap.xml` already exist and list all 7 routes, so the intent to be indexed as distinct pages is already there — the rendering gap is what's missing.

## Where

- `web/index.html` / `dist/` — the static shell every route currently shares byte-for-byte.
- `web/public/_redirects` — the SPA-fallback rule that serves `index.html` for every unmatched path.
- `web/public/sitemap.xml` — the authoritative route list to prerender.
- Cloudflare Pages Functions (`functions/` directory, if introduced — see the CSP/middleware issue, which may also want a `functions/` dir) as the natural place to run edge-side prerender logic on Cloudflare's free tier.

## How

There are two realistic, $0, no-card approaches — pick one and document why in the PR (don't build both):

**Option A — Build-time prerender (simpler, recommended to try first).** Since every route's content is static per-path (title/description/JSON-LD; the actual interactive transfer UI still needs to hydrate client-side, that's fine and expected), add a small prerender step to the build: after `vite build`, spin up the built app in something like `vite preview` + a headless browser (Playwright — already a candidate dependency per issue #38's Playwright E2E issue, reuse it if that lands first) or a simpler DOM-only renderer, visit each route from `sitemap.xml`, and write the resulting `<head>`-populated HTML to `dist/send/index.html`, `dist/how/index.html`, etc. `web/public/_redirects` then needs path-specific rules ahead of the catch-all so Cloudflare Pages serves the prerendered file for that exact path while still falling back to the SPA shell for anything dynamic (`/r/<code>`, which is inherently per-session and shouldn't be prerendered).

**Option B — Edge-side prerender-on-request for known bots.** A Cloudflare Pages Function (`functions/_middleware.js`) that inspects the `User-Agent`, and for known crawler/unfurler UAs, serves a cached prerendered snapshot (rendered ahead of time via Option A's approach, or on-demand with a headless-render service) instead of the raw SPA shell; regular users still get the normal SPA. This is more flexible (covers new routes automatically) but more moving parts — a caching layer, bot-UA maintenance, and a render pipeline. Given the "$0, no card" constraint in `CLAUDE.md`, if you go this route, make sure whatever headless-render approach you pick has a genuinely free tier with no card requirement (verify current pricing before committing, per the `CLAUDE.md` golden rule — don't assume based on training data).

Either way:
1. `/r/<code>` must **never** be prerendered/cached — it's a live, per-session pairing code; serving a stale snapshot would be actively wrong.
2. Confirm the prerendered/served HTML still boots the real React app correctly for human visitors (no hydration mismatch, no duplicate content flash).
3. Validate with a tool that fetches *without* executing JS (plain `curl`, or Google's Rich Results Test / a link-unfurler simulator) against each route in `sitemap.xml` and confirm it now sees route-specific title/description/JSON-LD.

## Acceptance criteria

- [ ] At least `/`, `/send`, `/receive`, `/how`, `/brand`, `/terms`, `/privacy` (every static route in `sitemap.xml`) return route-specific `<title>`, meta description, and JSON-LD to a plain `curl`/no-JS fetch — not just after client-side hydration.
- [ ] `/r/<code>` is explicitly excluded from prerendering/caching and still works as a live SPA route.
- [ ] The chosen approach (build-time vs. edge-side) is documented in the PR with the trade-off reasoning, plus confirmation of $0/no-card cost.
- [ ] Human visitors see no regression (no hydration flash/mismatch, no broken interactivity) on any prerendered route.
- [ ] `pnpm --filter @warp/web build` (and any new prerender step) runs in CI/deploy without manual steps.

## Constraints

- $0 and no credit card — verify pricing live for any headless-render dependency before adding it (per `CLAUDE.md`'s golden rule; "we got burned assuming Koyeb/Fly were free").
- Cloudflare Pages + Workers free tier only.
- Must not affect the live, interactive transfer flow — this issue is about what non-JS clients see, not a rendering-architecture change to the real app.

---

## 9. Add a Lighthouse / Core Web Vitals budget check to CI

**Labels:** `performance`, `enhancement`  
**Difficulty:** intermediate

## What & why

There is currently no automated performance regression check anywhere in `.github/workflows/ci.yml` — the `web` job runs `lint`, `typecheck`, `build`, and stops. That means the ~504 KB / 146 KB gzip main bundle (see the code-splitting issue) could grow further with no signal until someone notices the app feels slower. In 2026, Google's Core Web Vitals field thresholds are LCP ≤ 2.5s, INP ≤ 200ms, CLS ≤ 0.1 (75th-percentile field data, not lab); Lighthouse CI gives you a reasonable **lab-data proxy** for that in a PR check, which is the right layer for catching regressions before they ship (field data from real users only shows up after the fact).

This is a different, complementary check from issue #23 (which is about running the `.check.mjs` unit-test harnesses for the WebRTC engine in CI) — this issue is about *rendering/loading* performance of the built site, not engine correctness.

## Where

- `.github/workflows/ci.yml` — the `web` job (currently: checkout → pnpm install → lint → typecheck → build).
- `web/vite.config.ts` / `pnpm --filter @warp/web preview` — needed to serve the built `dist/` for Lighthouse to hit.
- Routes to budget: `/` (landing — the one almost every new visitor lands on, so it's the one that matters most for first impressions) at minimum; `/send` and `/how` (the heaviest page pre-code-splitting) are good secondary targets once that work lands.

## How

1. Add `@lhci/cli` (Lighthouse CI) as a devDependency, or use the `treosh/lighthouse-ci-action` GitHub Action — either is free for a public repo.
2. In CI, after `pnpm --filter @warp/web build`, serve `dist/` (`pnpm --filter @warp/web preview` or a static server) and run Lighthouse against it headlessly (Chrome via `puppeteer`/`playwright` — check what the chosen LHCI tool already bundles before adding a redundant browser dependency).
3. Set an initial **budget, not a bar** — Lighthouse lab scores are noisy in shared CI runners; start with generous thresholds (e.g., performance score ≥ 80, no metric budget failures) and tighten over time as the code-splitting/caching work in this backlog lands, rather than picking today's exact numbers and having them immediately fail-on-noise.
4. Make the check block the PR (or start as informational-only via `continue-on-error: true`, then flip to blocking once you've confirmed it isn't flaky) — your call based on how noisy the first few runs look.
5. Store LHCI results as a workflow artifact or comment on the PR (LHCI has a built-in GitHub status/comment integration) so a contributor sees exactly what regressed, not just a red X.
6. Only run this job on `web/`-touching changes, reusing the existing `changes` job's `web` output filter (same pattern the `web`/`server` jobs already use) so it doesn't run on every unrelated PR.

## Acceptance criteria

- [ ] A CI job runs Lighthouse against the built `dist/` for at least `/` on every PR that touches `web/`.
- [ ] Budgets/thresholds are documented (in the workflow file or a config file) with the reasoning for the chosen initial numbers.
- [ ] The check reuses the existing `changes` job's path-filtering pattern (only runs when relevant).
- [ ] A failing run gives a contributor a clear, actionable summary (which metric, which route, roughly by how much) — not just a bare failure.
- [ ] Confirmed non-flaky across at least a few real CI runs before being made a required/blocking check (or explicitly left informational if it's still noisy).

## Constraints

- Public GitHub repo — Lighthouse CI / the chosen action must be free (verify current pricing/limits, per `CLAUDE.md`'s "verify pricing before recommending any host/service" rule).
- Don't add a heavyweight headless-browser dependency if the CI job already has one available (e.g. if issue #38's Playwright E2E work lands first, reuse that browser install rather than adding a second one).

---

## 10. Centralize File System Access capability detection into a receive-adapter module

**Labels:** `enhancement`, `performance`  
**Difficulty:** intermediate

## What & why

Warp already has three receive strategies for incoming files, chosen by browser capability and file size: **disk** (via the File System Access API's `showSaveFilePicker`/`showDirectoryPicker`), **IndexedDB staging** (`web/src/lib/warp/idbStage.ts`, for large files on browsers without the FS Access API — Firefox and Safari, neither of which implements those picker methods, confirmed against current MDN/caniuse data), and **in-memory** (small files, any browser). That's good architecture — but the logic that *decides* which strategy applies is currently duplicated and inlined rather than living in one place:

- `web/src/lib/warp/useWarpTransfer.ts:72`: `const LARGE_THRESHOLD = 256 * 1024 * 1024;`
- `web/src/transfer/SessionView.tsx:761`: the **same constant, redefined**: `const LARGE_THRESHOLD = 256 * 1024 * 1024;`
- `web/src/lib/warp/useWarpTransfer.ts:706-707`: feature detection inline in the `accept()` callback: `const fs = window as unknown as WindowWithFsPickers; const canStream = large && (off.items.length > 1 ? !!fs.showDirectoryPicker : !!fs.showSaveFilePicker);`
- `web/src/transfer/SessionView.tsx:780-782`: the **same feature check, duplicated** (differently) purely to decide UI copy: `("showSaveFilePicker" in window || "showDirectoryPicker" in window) && (total >= LARGE_THRESHOLD || ...)`

Two copies of the same threshold and two slightly different forms of the same capability check is exactly the kind of drift that causes real bugs later — e.g. if someone bumps `LARGE_THRESHOLD` in one file during a tuning pass and forgets the other, the accept-modal's "expect a folder/file picker" copy (`SessionView.tsx`) silently goes out of sync with what `useWarpTransfer.ts` actually does. This issue is about extracting a single, tested "receive adapter" module that both call sites use — the strategy-selection logic itself, not adding a new strategy (issue #33, service-worker streaming downloads, is the place for a *new* strategy; this issue makes the *existing three* easier to reason about and to extend later, including by #33).

## Where

- `web/src/lib/warp/useWarpTransfer.ts` (lines 72, 690-775 — the `accept()` callback that builds the sink per file).
- `web/src/transfer/SessionView.tsx` (lines 760-783 — `AcceptModal`, which needs to know the same threshold/capability facts purely to render the right copy).
- `web/src/lib/warp/receiveController.ts` — already defines `ReceiveSink`, `diskSink`, `memorySink`; the natural home for a new `chooseReceiveStrategy()`/adapter-registry function.
- `web/src/lib/warp/idbStage.ts` — `idbSink`, `estimateFits` (the iOS/quota gating logic that already exists for the IDB fallback).
- `web/src/lib/warp/peer.ts` (lines ~94-104) — the `FsWritable`/`FsFileHandle`/`FsDirectoryHandle` structural types used to keep the FS Access API's ambient types decoupled from `lib.dom.d.ts` (worth reusing/re-exporting from the new module rather than a fourth copy).

## How

1. In `receiveController.ts` (or a new `web/src/lib/warp/receiveAdapters.ts` if that keeps `receiveController.ts` focused), define:
   - The single `LARGE_THRESHOLD` export.
   - A `detectFsAccessSupport()` (or similar) that returns a small capability object (`{ canSaveFile: boolean; canPickDirectory: boolean }`) computed once from `window`, instead of two different `"x" in window` / `!!window.x` spellings scattered across files.
   - A pure `chooseReceiveStrategy({ items, large, fsSupport }): 'disk-file' | 'disk-dir' | 'idb' | 'memory'` function that both `useWarpTransfer.ts`'s `accept()` and `SessionView.tsx`'s `AcceptModal` call, so the modal's "expect a picker" copy and the actual sink selection are provably the same decision, not two hand-synced ones.
2. Update `useWarpTransfer.ts`'s `accept()` (lines 690-775) to call the new function instead of the inline `canStream`/`useIdb` branching — keep the actual picker-opening/`try`/`catch`-cancel-fallback behavior (lines 710-724) exactly as-is, that user-gesture-timing subtlety is load-bearing (the comment there explains why: prompting *before* awaiting anything, from the accept click's own gesture).
3. Update `SessionView.tsx`'s `AcceptModal` (lines 760-783) to call the same `chooseReceiveStrategy`/capability check instead of its own inline duplicate.
4. Add a `.check.mjs` harness for the new pure function, matching this codebase's existing testing style (see `web/src/lib/warp/useWarpTransfer.check.mjs`, `peer.check.mjs`, etc. — plain Node scripts that transpile via `esbuild` and assert, not a test framework) — this is the kind of pure decision logic that's easy and valuable to unit-test in isolation, unlike the WebRTC plumbing around it.

## Acceptance criteria

- [ ] `LARGE_THRESHOLD` is defined exactly once and imported everywhere it's used.
- [ ] FS Access capability detection is a single function, used by both `useWarpTransfer.ts` and `SessionView.tsx` — no more independently-spelled `"x" in window` checks.
- [ ] The user-gesture-timing behavior around `showSaveFilePicker`/`showDirectoryPicker` (prompt before any `await`, fall back to in-memory/IDB on `AbortError`) is unchanged — verify manually by cancelling a picker mid-accept and confirming the transfer still completes via fallback.
- [ ] A new `.check.mjs` harness covers `chooseReceiveStrategy` for the disk/idb/memory decision matrix (large+FS-support, large+no-FS-support, small, single-file vs. multi-file batch).
- [ ] `pnpm --filter @warp/web build` (lint + typecheck + build) clean; existing `.check.mjs` harnesses still pass.
- [ ] No behavior change for end users — this is a refactor, not a feature change.

## Constraints

- Don't change the actual receive strategies (disk/IDB/memory) or their thresholds — this is purely de-duplicating the *selection* logic, setting up clean ground for #33's new SW-streaming strategy and the fallback-ponyfill issue below to slot in without touching two files each time.
- $0/STUN-only/no relay — untouched by this refactor, called out for completeness only.

---

## 11. Add a File System Access ponyfill so Firefox/Safari get a real save picker

**Labels:** `enhancement`, `help wanted`  
**Difficulty:** advanced

## What & why

Firefox (desktop and Android, all versions) and Safari (macOS/iPadOS/iOS, all versions) do not implement `showSaveFilePicker`/`showDirectoryPicker`/`showOpenFilePicker` — confirmed against current MDN/caniuse data; Safari ships only the Origin Private File System (from Safari 15.2), which isn't the same user-facing "save to a chosen location" picker. Today, on those browsers, Warp's large-file receive path (`web/src/lib/warp/useWarpTransfer.ts:706-707`'s `canStream` check) is simply `false`, so it silently falls to IndexedDB staging (`idbStage.ts`) or in-memory (`receiveController.ts`'s `memorySink`) — which works (bounded by `estimateFits`'s quota/iOS-memory gating) but means Firefox/Safari users never get the "choose where to save" UX Chrome/Edge users get, and for genuinely huge files, the final `Blob`-materialization-then-download step is still real memory pressure on those engines that a true streaming write to disk would avoid.

This is deliberately framed as **an adapter, not a duplicate of issue #33**. #33 ("Service-worker streaming downloads for browsers without the File System Access API") is about building a *new* delivery mechanism — a service worker intercepting a synthetic download request to stream bytes to disk without ever fully materializing them, StreamSaver.js-style. This issue is narrower and complementary: wire in an existing, well-maintained **ponyfill** (`browser-fs-access` from GoogleChromeLabs, or the lower-level `native-file-system-adapter`/`file-system-access` package it's used to build) that gives Firefox/Safari a same-shaped `showSaveFilePicker`-like API backed by whatever fallback that library implements internally (which may itself use a download-link/Cache-API-backed approach, or coordinate with a service worker if one exists) — so that from Warp's call sites, `showSaveFilePicker` "just works" everywhere, and the *actual* streaming mechanism underneath (native on Chrome, ponyfilled on Firefox/Safari, possibly SW-backed if #33 lands) becomes an implementation detail the adapter module (see the companion centralization issue) can swap.

## Where

- `web/src/lib/warp/useWarpTransfer.ts` (lines 706-724 — where `fs.showSaveFilePicker`/`showDirectoryPicker` are called directly against `window`).
- `web/src/lib/warp/peer.ts` (lines ~94-104 — the structural `FsWritable`/`FsFileHandle`/`FsDirectoryHandle` types already used instead of `lib.dom.d.ts`'s real ones, specifically so this kind of polyfilling is easy to slot in without a type fight).
- `web/src/lib/warp/idbStage.ts` — the existing fallback this ponyfill would sit *above*: if the ponyfill itself can't provide a working picker (e.g. genuinely unsupported environment), the existing IDB/memory fallback chain should still be the safety net, not removed.
- Ideally lands **after** the centralization issue above, so there's one call site (`chooseReceiveStrategy`/the adapter module) to wire the ponyfill into, not two.

## How

1. Evaluate `browser-fs-access` (npm, actively maintained, built on `native-file-system-adapter`) against this app's actual needs: it needs to support both single-file save (`fileSave`) and, ideally, a directory-write mode for multi-file batches (Warp's `showDirectoryPicker` path) — confirm the library's current directory-write support level before committing, some ponyfills only cover single-file save well.
2. Confirm exactly what the library falls back to on Firefox/Safari (a synthetic `<a download>` + Blob, or something more sophisticated) and whether that changes Warp's memory characteristics for very large files versus the current IDB-staging fallback — if the ponyfill's fallback is *also* just "materialize a Blob and trigger a download," it may not be a meaningful improvement over what `idbStage.ts`'s `finalize()` already does (a lazy Blob-of-Blobs) for memory, but it *would* give a nicer "choose folder" UX for multi-file batches, which today just falls to individually-downloaded files or a single zip — check the current `SessionView.tsx`/`useWarpTransfer.ts` multi-file no-FS-Access UX before/after to confirm this is a genuine improvement, not just a dependency add for its own sake.
3. Add the chosen ponyfill as a dependency, and wire it into the adapter module from the companion centralization issue (or directly into `useWarpTransfer.ts`/`peer.ts` if that issue hasn't landed yet) behind the same capability-detection point, so native FS Access (Chrome/Edge) and the ponyfill (Firefox/Safari) are indistinguishable from the call site's perspective.
4. Manually verify on real Firefox and Safari (BrowserStack/real devices, or at minimum current desktop Firefox + Safari if that's what's available) that a large-file receive now prompts a save location, and that a cancelled prompt still falls through to the existing IDB/memory fallback exactly as it does today.
5. Bundle-size check: ponyfills that shim a lot of surface can be nontrivial in size — confirm the addition doesn't meaningfully regress the bundle-size work being done elsewhere in this backlog (measure gzip'd size before/after).

## Acceptance criteria

- [ ] Firefox and Safari users get a real "choose where to save" prompt for large single-file and (if the library supports it) multi-file/directory receives, where today they silently skip straight to IDB/memory.
- [ ] The existing IDB-staging/memory fallback chain (`idbStage.ts`, `estimateFits`'s iOS/quota gating) still applies when the ponyfill itself can't provide a working picker, or the user cancels — verified manually.
- [ ] The added dependency's bundle-size impact is measured and reported in the PR (gzip'd KB before/after).
- [ ] Manually verified on real Firefox and Safari, not just Chrome with devtools feature-flags disabled (those don't reliably reproduce the real fallback path).
- [ ] Coordinated with (references, doesn't duplicate) issue #33 in the PR description — this issue is the adapter/picker-parity layer; #33 is the deeper streaming-delivery mechanism.

## Constraints

- $0, no paid service, no native app — a client-side JS ponyfill only.
- No TURN/relay implications — this is entirely about the local save-target step after bytes already arrived over the P2P channel, unrelated to NAT traversal.
- Must not regress the existing Chrome/Edge native-FS-Access path, which already works well.

---

## 12. Document the receive-strategy/browser support matrix

**Labels:** `documentation`, `good first issue`  
**Difficulty:** good-first

## What & why

Warp silently picks between three (soon possibly four, if the service-worker-streaming issue #33 and/or the ponyfill-adapter issue land) different receive strategies depending on browser capability and file size — disk-via-File-System-Access, IndexedDB staging, and in-memory, per `web/src/lib/warp/useWarpTransfer.ts`'s `accept()` and `web/src/lib/warp/idbStage.ts`. None of this is written down anywhere a contributor or curious user can find it — understanding *why* a given browser behaves a certain way currently requires reading code comments spread across three files. A short, honest support-matrix doc is exactly the kind of thing that (a) helps new contributors orient before touching the adapter code (several other issues in this backlog touch it), and (b) is genuinely useful to publish for users wondering "why did Firefox not ask me where to save?".

## Where

- New doc: `docs/BROWSER-SUPPORT.md` (matches the existing `docs/SELF-HOSTING.md` naming pattern requested in issue #24).
- Source material already in the codebase (read, don't guess):
  - `web/src/lib/warp/useWarpTransfer.ts` (`LARGE_THRESHOLD`, the `accept()` strategy selection, the `canStream`/`useIdb` branches).
  - `web/src/lib/warp/idbStage.ts` (the doc comment at the top already explains the IDB fallback's reasoning in detail — the iOS ~1GiB hard cap, the storage-quota check, the Blob-of-Blobs assembly).
  - `web/src/lib/warp/peer.ts` (top-of-file doc comment on the overall transfer design).
  - `web/src/transfer/SessionView.tsx`'s `AcceptModal` (the user-facing copy shown for each case today).

## How

1. Write a table: browser (Chrome/Edge desktop, Chrome Android, Firefox desktop, Firefox Android, Safari macOS, Safari iOS/iPadOS) × capability (native File System Access picker? IDB staging available? approximate practical file-size ceiling?).
2. Explain the `LARGE_THRESHOLD` (256 MiB) cutoff in plain language: below it, everything stays in memory regardless of browser; at/above it, the strategy branches by capability.
3. Explain the iOS ~1 GiB hard cap from `idbStage.ts`'s `estimateFits`/`IOS_HARD_CAP` and *why* it exists (iOS Safari tabs get killed with no catchable exception around 1.5-2 GB — an honest, upfront refusal beats a silent crash, matching the STUN-only "honest failure over silent paid relay" philosophy already established for NAT traversal in `CLAUDE.md`).
4. Link out to the relevant open issues (#33 for SW streaming, and the adapter-centralization/ponyfill issues from this backlog if they're open) so the doc doesn't go stale the moment someone starts that work — frame it as "current state," not "final state."
5. Cross-link from the main `README.md` (a short pointer, not a duplicate) if the README has a docs-index section; check its current structure before deciding where to add the link.

## Acceptance criteria

- [ ] `docs/BROWSER-SUPPORT.md` exists with an accurate table (verified against the actual code, not assumptions) covering Chrome/Edge, Firefox, and Safari across desktop/mobile.
- [ ] The `LARGE_THRESHOLD` cutoff and the iOS hard cap are explained in plain language with the "why," not just the numbers.
- [ ] Linked from `README.md` if the README has a natural place for it.
- [ ] References the relevant open adapter/streaming issues without claiming work that hasn't landed yet.
- [ ] No code changes — pure documentation PR.

## Constraints

- Keep it factual and current — re-verify every claim against the actual code/behavior rather than copying from a general "File System Access API" reference, since Warp's specific thresholds (256 MiB, ~1 GiB iOS cap) are project-specific tuning, not spec values.

---

