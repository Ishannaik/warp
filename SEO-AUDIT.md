# Warp — SEO audit

Date: 2026-08-02
Scope: the Warp web app (`web/`) served at https://warp.ishannaik.com (mirrors: `wrap-3qq.pages.dev`, `warp.pixalabs.net`). Routes: `/`, `/send`, `/receive`, `/r/:code`, `/how`, `/brand`, `/terms`, `/privacy`.
Method: static review of `web/index.html`, `web/public/` (robots.txt, sitemap.xml, `_headers`, `_redirects`), the client router (`web/src/router.tsx`, `web/src/App.tsx`, `web/src/lib/useDocumentSeo.ts`), and every route component's headings/images/links; git history for honest `lastmod` dates. No new pages were invented — audit + fixes on existing surfaces only.

## Findings & actions

### HIGH

**S1. Canonical, Open Graph, and Twitter tags were static for every route — FIXED**
`index.html` hardcoded `rel=canonical`, `og:url`, `og:title`, `og:description`, `twitter:title`, `twitter:description` to the landing page. The per-route hook (`useDocumentSeo`) only updated `document.title` + `meta[name=description]`, so a JS-rendering crawler on `/how` saw the homepage canonical (indexing every route as a duplicate of `/`), and link unfurlers (Discord/Twitter/Slack previews of `/how` or `/brand`) showed the homepage title and URL.
Fix: `useDocumentSeo` now also updates the canonical link and the OG/Twitter title/description/URL per route (`web/src/lib/useDocumentSeo.ts`, wired in `web/src/App.tsx`). The canonical origin stays fixed to `https://warp.ishannaik.com` so the mirror hosts point at one canonical domain instead of self-canonicalizing.

**S2. Ephemeral session URLs (`/r/:code`) had no canonical strategy — FIXED**
Room links are shared constantly; without direction a crawler could index thousands of `/r/<CODE>` URLs as thin duplicates.
Fix: `/r/:code` canonicalizes to the stable `/receive` page (`App.tsx`). The sitemap never listed them (correct), and `robots.txt` correctly does not block them (canonicalization beats disallow for shared URLs).

### MEDIUM

**S3. `sitemap.xml` lastmod dates were stale and inaccurate — FIXED**
All URLs carried 2026-06-19/2026-06-20, but `/send` changed 2026-07-24, `/receive` 2026-07-20, `/how` 2026-07-15, `/brand` 2026-07-21, `/terms`+`/privacy` 2026-06-25 (git history of each route's content).
Fix: per-route `lastmod` set to the actual last content change date. (`/` stays 2026-06-19 — Landing is unchanged since.)

**S4. `/brand` had no `<h1>` — FIXED**
The hero wordmark was a `<span>` and section blocks start at `<h2>`, so the page's heading outline started at h2 (single-h1 rule).
Fix: the hero wordmark is now the page's single `<h1>` (`web/src/brand/BrandKit.tsx`); section blocks remain `<h2>`. Every other route already has exactly one `<h1>` (Hero, TransferFlow's mutually-exclusive steps, ReceiveEntry, Theory, Legal, NotFound).

**S5. Missing `og:locale` — FIXED**
Added `og:locale=en_US` to `index.html`.

### LOW / INFORMATIONAL (not fixed here — noted or tracked elsewhere)

**L1. No `Content-Security-Policy` header.** Security, not SEO; tracked as perf/modernization backlog item #4 (needs a Report-Only pass against the live transfer flow before enforcing). `web/public/_headers`.

**L2. Single 504 kB JS chunk hurts LCP/INP.** Tracked as backlog items #1 (route code-splitting + lazy `/how` diagrams) and #2 (vendor chunking). The largest CWV lever available; out of scope for an audit-and-fix pass.

**L3. No prerendered HTML snapshots.** The SPA is crawlable (Google renders JS; all nav links are real `href` anchors with progressive-enhancement `navigate()`), but non-rendering crawlers and some unfurlers see only the static `index.html` defaults (which are now the landing page's correct values). Tracked as backlog item #8 (advanced).

**L4. Soft-404 status code.** Unknown routes serve `index.html` with HTTP 200 (`_redirects` SPA fallback) and render the client-side NotFound page. Returning a real 404 status requires a Cloudflare Pages Function; the rendered 404 page is clear and `noindex`-worthy but not `noindex`-tagged. Acceptable for now; revisit if Search Console flags soft-404s.

**L5. JSON-LD is a single app-level `WebApplication`.** Deliberately kept global (the entity is the app, not each route); `sameAs` points at the GitHub repo, `offers` at $0. No per-route structured data warranted for a tool app.

## Verified clean

- `robots.txt`: allows all, references the sitemap with the canonical domain.
- `_redirects`: single SPA fallback (`/* /index.html 200`), no redirect chains.
- `_headers`: security headers on `/*`; hashed `/assets/*` served `immutable` one-year cache (HTML shell correctly left revalidating).
- Images: `og:image` 1200×630 with `og:image:alt`; tray thumbnails use empty `alt` correctly (decorative, filename adjacent); brand-kit logo marks carry descriptive `alt`.
- Internal linking: nav/footer/CTA links are real anchors (`href="/how"`, `/brand`, `/terms`, `/privacy`, `/send`) — crawlable without JS.
- Unique title + meta description per route (pre-existing via `seoForRoute` + `useDocumentSeo`).
- `html lang="en"`, viewport, theme-color, manifest + icons present.

## Verification

`pnpm typecheck` and `pnpm --filter @warp/web lint` clean after the fixes. Runtime tag updates are DOM-only (no transfer-engine surface touched).
