# Contributing to Warp

Thanks for helping out! Warp is a small, deliberately-lean project. Keep changes
focused and the moving parts few.

## Setup

```bash
pnpm install
pnpm dev:server   # signaling server, :8080
pnpm dev          # web app, :5173
```

## Before you open a PR

```bash
pnpm lint
pnpm typecheck
pnpm test
```

CI runs the same checks per-package (only the package you touched is built/tested).

## Guidelines

- **Conventional Commits** for messages: `feat:`, `fix:`, `chore:`, `docs:`, `refactor:`, `test:`.
- **Keep it $0.** A core principle is no recurring-cost infrastructure (no TURN, no
  database, no paid relay). If a change needs a paid service, open an issue to discuss first.
- **The signaling server stays a dumb relay.** It must never read, store, or
  understand file contents — only introduce peers and forward opaque handshake blobs.
- Match the surrounding style. The server is a Cloudflare Worker + Durable Object; the web app is React + Vite.

## Reporting bugs

Open an issue with the bug-report template — include browser/OS, whether it's the
web app or server, and any console errors.
