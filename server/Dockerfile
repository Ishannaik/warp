# Signaling server for Koyeb / Render / Fly / any container host.
# Portable Node — not tied to pnpm or bun at runtime.
FROM node:22-alpine

WORKDIR /app

# Only the server's own manifest; this image builds the server in isolation.
COPY package.json ./
RUN npm install --omit=dev --no-audit --no-fund

COPY signaling.js ./

ENV PORT=8080
EXPOSE 8080
HEALTHCHECK --interval=30s --timeout=3s CMD wget -qO- http://localhost:8080/health || exit 1
CMD ["node", "signaling.js"]
