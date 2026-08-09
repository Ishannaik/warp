# Self-hosting Warp

Warp's frontend is a static Vite application. The signaling service is separate: it introduces peers over WebSocket but never receives file bytes.

## Deploy the frontend to Vercel

The repository includes `web/vercel.json` for the static frontend target. It does three things:

- builds the web workspace with `pnpm --filter @warp/web build`;
- serves `web/dist` as the deployment output;
- rewrites SPA routes to `/index.html` so `/send`, `/receive`, `/how`, and `/r/:code` still work on a hard refresh.

### Signaling URL

Set `VITE_SIGNALING_URL` in the Vercel project's environment variables to the `wss://` URL of the signaling backend you want the frontend to use, for example:

```text
VITE_SIGNALING_URL=wss://your-signaling.example.com
```

Vite inlines this value at build time, so redeploy after changing it. If the variable is omitted, Warp keeps its built-in default Cloudflare signaling URL.

This Vercel target is **frontend-only**. It does not move file bytes through Vercel and it does not attempt to port Warp's Cloudflare Durable Object signaling service to a Vercel function. The browser still talks directly to the configured signaling WebSocket and transfers files peer-to-peer over WebRTC.

### Cost / billing check

Verified against Vercel's current documentation on 2026-08-09:

- Hobby is listed as **$0** and has no billing cycle.
- Hobby usage is capped; when included usage is exhausted, Vercel can pause the Hobby project instead of billing on-demand overage.
- The paid Pro upgrade flow asks for card details. Keeping this static target on Hobby therefore preserves Warp's `$0 / no-card` hosting constraint.

Sources: [Vercel Hobby plan](https://vercel.com/docs/plans/hobby), [Vercel pricing](https://vercel.com/pricing), and [Vite SPA deployment on Vercel](https://vercel.com/docs/frameworks/frontend/vite).

## Existing Cloudflare path

Nothing here replaces the existing Cloudflare deployment. Self-hosters can continue serving the frontend from Cloudflare Pages and running signaling as the Cloudflare Worker + Durable Object. Vercel is an additional static-frontend target only.
