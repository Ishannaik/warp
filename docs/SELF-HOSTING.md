# Self-hosting Warp

Warp is completely open source and designed to be self-hosted on Cloudflare's free tier. 

Two things need to be deployed: a **signaling server** (a Cloudflare Worker that introduces browsers to each other) and the **frontend** (a static single-page application). File bytes travel directly between browsers and never touch the server.

**No credit card is required at any step.** This guide uses only free-tier services. Do not add storage or logging to the signaling server; it is designed to be a dumb relay.

## 1. Prerequisites

- **Node.js**: ≥22
- **pnpm**: installed globally (`npm install -g pnpm`)
- **Cloudflare account**: A free account (no credit card needed).

Log in to Cloudflare from your terminal:
```bash
npx wrangler login
```
This will open a browser to authenticate your CLI.

## 2. Deploy the signaling server

The signaling server brokers the connection handshake and hibernates when idle, costing nothing between transfers.

From the root of the repository, deploy the server:
```bash
pnpm --filter @warp/server run deploy
```
*(Note: Use `run deploy` rather than just `deploy` to bypass pnpm's built-in deploy command.)*

On the first deployment, you will see output about a Durable Object migration (e.g., `Migrations to apply: v1`). This is expected—the free tier includes SQLite-backed Durable Objects.

The output will provide your worker's URL, looking something like this:
`https://warp-signaling.<your-subdomain>.workers.dev`

**Smoke test:** Verify it's running by visiting the health endpoint in your browser or with curl:
```bash
curl https://warp-signaling.<your-subdomain>.workers.dev/health
```
It should return `200 ok`.

## 3. Point the frontend to your server

Now tell the frontend where your new signaling server is. Change the `https://` in your worker URL to `wss://` (WebSocket Secure).

Build the frontend with this URL:
```bash
VITE_SIGNALING_URL=wss://warp-signaling.<your-subdomain>.workers.dev pnpm --filter @warp/web build
```

## 4. Deploy the frontend

The frontend is just static files. You can deploy it to any static host (Netlify, GitHub Pages, etc.), but Cloudflare Pages is battle-tested for this project.

Deploy the `web/dist` directory to Cloudflare Pages:
```bash
cd web && npx wrangler pages deploy dist --project-name=<your-project-name>
```

This will give you a live URL for your Warp instance, e.g., `https://<your-project-name>.pages.dev`.

## 5. Verify it works

1. Open your deployed frontend URL in two different browser tabs (or on two devices).
2. Create a room in one tab and join it with the code in the other tab.
3. Transfer a file. 

**LAN Discovery:** Devices on the same network will discover each other automatically if they share the same public IP address.
**Network Restrictions:** Warp uses STUN to punch through NAT, but it intentionally does *not* use a paid TURN relay. If both peers are on highly restrictive networks (symmetric NATs) that block direct connections, the transfer will fail with an honest error instead of quietly routing your files through a paid middleman.

## 6. Custom domain (Optional)

You can use a custom domain for your frontend. Simply add a CNAME record pointing to your `.pages.dev` URL in your DNS settings. Cloudflare Pages provisions HTTPS automatically.

## 7. Troubleshooting

| Symptom | Cause | Solution |
|---|---|---|
| Client says `bad-room` instantly | The frontend minted a code instead of the server, or the `VITE_SIGNALING_URL` is wrong. | Ensure you built the frontend with the correct `wss://` URL. The server must own the room codes. |
| WebSocket connect failures | Mixed content (`ws://` on an `https://` site) or wrong protocol. | Always use `wss://` for production deployments. |
| Delays connecting when idle | The Durable Object hibernates after ~10 seconds of inactivity. | This is normal and expected. The client sends an 8-second keepalive ping to prevent the room from sleeping while you are waiting for a peer. |
