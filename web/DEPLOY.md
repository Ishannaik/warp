# Warp — Deploy Runbook (Cloudflare Pages + Namecheap DNS)

Deploy target: **Cloudflare Pages** project `wrap` (project name stays `wrap`), custom domain `warp.ishannaik.com`.
App: Vite + React SPA in `web/` (pnpm workspace). Build output: `web/dist`.
Wrangler is authenticated as **ishannaik7@gmail.com** (`wrangler whoami` to confirm).

> SPA routing: `web/public/_redirects` contains `/*  /index.html  200`. Vite copies
> `public/` into `dist/` on build, so the redirect ships automatically — no extra step.

---

## 0. Prerequisites

- Node + `pnpm` installed (repo is a pnpm workspace; root `pnpm-workspace.yaml`).
- `wrangler` available (use `pnpm dlx wrangler` if not installed globally; or `pnpm add -Dw wrangler` at the repo root).
- Verify auth:
  ```sh
  wrangler whoami      # expect ishannaik7@gmail.com
  ```
  If not authed: `wrangler login`.

---

## 1. Build the app

Run from the **`web/`** directory:

```sh
cd web
pnpm install            # if deps not yet installed
pnpm build              # vite build -> web/dist
```

Confirm `web/dist/index.html` and `web/dist/_redirects` exist.

---

## 2. Create the Pages project (one-time)

From the **`web/`** directory:

```sh
wrangler pages project create wrap --production-branch main
```

- `wrangler pages project create <name>` registers the project. If you omit the name
  it prompts for one — pass `wrap` explicitly to keep it non-interactive.
- `--production-branch` sets the production branch label (cosmetic for direct-upload
  deploys; `main` is a sane default).
- Idempotency: if the project already exists this errors harmlessly. List with:
  ```sh
  wrangler pages project list
  ```

---

## 3. Deploy the build

From the **`web/`** directory:

```sh
wrangler pages deploy dist --project-name=wrap
```

- `dist` is the build-output directory argument (relative to `web/`).
- `--project-name=wrap` targets the project from step 2.
- Output prints the deployment URL, e.g. `https://<hash>.wrap.pages.dev` plus the
  canonical `https://wrap.pages.dev`.
- Optional: `--branch=main` to tag this as a production deploy.

**Verify:** open `https://wrap.pages.dev`, hard-refresh a deep link (e.g.
`https://wrap.pages.dev/anything`) to confirm the SPA `_redirects` fallback serves
`index.html` with a 200.

Re-deploys: just re-run steps 1 + 3.

---

## 4. Attach the custom domain `warp.ishannaik.com`

There is **no wrangler subcommand** to add a Pages custom domain (as of 2026 the
`wrangler pages` group has no `domain add`). It must be done in the dashboard, and the
external CNAME must be created **only after** the domain is registered in the dashboard
— otherwise the host returns a **522** error.

### 4a. Register the domain in Cloudflare Pages (do this FIRST)

Dashboard → **Workers & Pages** → select project **wrap** → **Custom domains** tab →
**Set up a custom domain** → enter `warp.ishannaik.com` → **Continue / Activate domain**.

Cloudflare will show the exact DNS target to create. For a domain whose DNS is hosted
externally (Namecheap, not on Cloudflare nameservers), the target is the project's
Pages subdomain:

```
warp.ishannaik.com  CNAME  wrap.pages.dev
```

Leave this tab open; the domain shows **"pending"** until the CNAME resolves.

### 4b. Create the CNAME at Namecheap

`warp.ishannaik.com` is a subdomain (host `warp` on zone `ishannaik.com`). Add **one**
CNAME host record: host `warp` → `wrap.pages.dev`. Two ways:

#### Option A — Namecheap dashboard (manual)

1. Sign in at namecheap.com → **Domain List** → **Manage** on `ishannaik.com`.
2. **Advanced DNS** tab → **Host Records** → **Add New Record**.
3. Set:
   - **Type:** `CNAME Record`
   - **Host:** `wrap`
   - **Value / Target:** `wrap.pages.dev`  *(no trailing dot, no `https://`)*
   - **TTL:** `Automatic` (or 1–5 min while testing)
4. **Save All Changes** (green checkmark).
5. Ensure no conflicting `A`/`URL`/`CNAME` record already exists for host `wrap`.

#### Option B — Namecheap API (`namecheap.domains.dns.setHosts`)

> **User-provided prerequisites (flag to user — not automatable without these):**
> 1. **API access enabled** on the Namecheap account (Profile → Tools → Namecheap API
>    Access → toggle ON; account must meet Namecheap's eligibility, e.g. balance/spend
>    or domain-count requirements).
> 2. **API key** + the account **API username**.
> 3. **Whitelisted IP** — the public IP making the call must be added to the API
>    allowlist. `<CLIENT_IP>` below must equal that whitelisted IP.

**CRITICAL — `setHosts` is destructive:** it **overwrites ALL host records** on the
zone. You must first read the existing records and replay them, then append the new
`wrap` CNAME. Skipping this wipes existing DNS for `ishannaik.com`.

1. Read current hosts:
   ```sh
   curl -s "https://api.namecheap.com/xml.response?ApiUser=<API_USER>&ApiKey=<API_KEY>&UserName=<API_USER>&ClientIp=<CLIENT_IP>&Command=namecheap.domains.dns.getHosts&SLD=ishannaik&TLD=com"
   ```
   Capture every existing `<host>` (HostName, RecordType, Address, TTL, MXPref).

2. Re-submit **all** existing hosts **plus** the new `wrap` CNAME via `setHosts`.
   Records are 1-indexed (`HostName1`, `RecordType1`, `Address1`, ...). Example adding
   `wrap` as the Nth record alongside existing ones:
   ```sh
   curl -s "https://api.namecheap.com/xml.response" \
     --data-urlencode "ApiUser=<API_USER>" \
     --data-urlencode "ApiKey=<API_KEY>" \
     --data-urlencode "UserName=<API_USER>" \
     --data-urlencode "ClientIp=<CLIENT_IP>" \
     --data-urlencode "Command=namecheap.domains.dns.setHosts" \
     --data-urlencode "SLD=ishannaik" \
     --data-urlencode "TLD=com" \
     # --- replay each EXISTING record from getHosts (1..N-1) here --- \
     --data-urlencode "HostName1=@"   --data-urlencode "RecordType1=A"     --data-urlencode "Address1=<existing-ip>"     --data-urlencode "TTL1=1800" \
     --data-urlencode "HostName2=www" --data-urlencode "RecordType2=CNAME" --data-urlencode "Address2=<existing-target>" --data-urlencode "TTL2=1800" \
     # --- the NEW record for Cloudflare Pages --- \
     --data-urlencode "HostName3=wrap" --data-urlencode "RecordType3=CNAME" --data-urlencode "Address3=wrap.pages.dev" --data-urlencode "TTL3=300"
   ```
   - Base URL (production): `https://api.namecheap.com/xml.response`
     (sandbox: `https://api.sandbox.namecheap.com/xml.response`).
   - Global params on every call: `ApiUser`, `ApiKey`, `UserName`, `ClientIp`, `Command`.
   - Per-host params: `HostName[i]`, `RecordType[i]`, `Address[i]`, `TTL[i]`
     (`MXPref[i]` only for MX). `Address` for a CNAME = the target host (`wrap.pages.dev`).
   - Success: XML response `<ApiResponse Status="OK">` with `IsSuccess="true"`.

### 4c. Finish + verify

1. Back in the Pages **Custom domains** tab, wait for `warp.ishannaik.com` to flip from
   **pending** to **active** (DNS propagation + cert issuance; usually minutes).
2. Verify resolution:
   ```sh
   nslookup warp.ishannaik.com        # -> CNAME wrap.pages.dev
   curl -I https://warp.ishannaik.com # -> HTTP/2 200, served by Cloudflare
   ```
3. If you see **522** or a cert error: the CNAME was created before the dashboard step,
   or the domain is still pending. Confirm the dashboard shows the domain as added,
   then re-check DNS propagation.

---

## Quick reference (happy path)

```sh
cd web
pnpm build
wrangler pages project create wrap --production-branch main   # one-time
wrangler pages deploy dist --project-name=wrap
# then: dashboard -> add custom domain warp.ishannaik.com,
#       Namecheap -> CNAME  warp -> wrap.pages.dev
```
