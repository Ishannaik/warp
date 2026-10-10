# CI

GitHub Actions is the pull request gate. The workflow is `.github/workflows/ci.yml`. On a pull request that touches the web app it lints, typechecks, builds, runs the engine checks, and runs the local Playwright transfer tests (Chromium and WebKit, Firefox as a non-blocking extra). Server changes run the signaling test. Pull requests do not deploy and do not call BrowserStack.

The live-site checks run today in `.github/workflows/live.yml`: on every push to `main`, weekly on Monday, and from the Actions tab with a custom URL. A Playwright job tests Chromium and WebKit, then a BrowserStack job runs the desktop suite and the Android script. The BrowserStack job reads the repo secrets `BROWSERSTACK_USERNAME` and `BROWSERSTACK_ACCESS_KEY`.

Travis is wired up but idle. The account is on the GitHub Student Developer Pack plan, which covers private repos only: `public_credits` is 0, so Travis creates jobs for this public repo and never starts them. Travis takes over once they grant open-source credits, which you request from Travis support. Until then `live.yml` does the same work.

Travis CI is the post-merge layer. The config is `.travis.yml`. It runs on a push to `main`, on the cron schedule, and on a manual api build. It does not run on pull requests. There are three stages, in order:

1. Build. Install with `pnpm install --frozen-lockfile`, then lint, typecheck, build, `check:engine`, and the signaling server test.
2. Deploy. This stage runs only when the event is a push to `main` and `WARP_AUTO_DEPLOY` is `1`. It deploys the Cloudflare Pages project `wrap` and the signaling Worker. Until that variable is set, the stage stays off.
3. Verify. Installs Chromium and WebKit, then runs the production Playwright suite against the live site. When `BROWSERSTACK_USERNAME` is set, a second job runs the BrowserStack desktop suite and the Android smoke script.

BrowserStack runs the same production specs on Chrome (Windows 11), WebKit (OS X Sequoia), and Firefox (Windows 11). WebKit on Sonoma is no longer offered for current Playwright releases, so the WebKit project uses Sequoia. The Android script opens `/send` on a Samsung Galaxy S23 and checks the text box, the Paste from clipboard button, and horizontal overflow. The account allows one parallel session, so every suite uses one worker.

`WARP_BASE_URL` defaults to `https://warp.ishannaik.com`.

## Travis environment variables

Set these in Travis. Do not commit them.

- `BROWSERSTACK_USERNAME`
- `BROWSERSTACK_ACCESS_KEY`
- `CLOUDFLARE_API_TOKEN`
- `CLOUDFLARE_ACCOUNT_ID`
- `WARP_AUTO_DEPLOY` set to `1` to turn the deploy stage on
- `WARP_BASE_URL` optional

## Local commands

From the repo root:

```bash
pnpm --filter @warp/web lint
pnpm --filter @warp/web typecheck
pnpm --filter @warp/web build
pnpm --filter @warp/web check:engine
pnpm --filter @warp/server test
```

From `web/`:

```bash
WARP_BASE_URL=https://warp.ishannaik.com pnpm test:prod
```

BrowserStack, after the two BrowserStack variables are exported:

```bash
pnpm test:browserstack
pnpm test:android
```

Missing BrowserStack variables skip those commands with a message. They do not crash.
