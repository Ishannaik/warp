FROM node:22-alpine AS build

WORKDIR /app
RUN corepack enable

COPY . .
RUN pnpm install --frozen-lockfile

# Optional: bake a custom signaling relay into the Vite bundle. Leaving the
# argument unset preserves Warp's built-in Cloudflare signaling default.
ARG VITE_SIGNALING_URL
RUN if [ -n "$VITE_SIGNALING_URL" ]; then \
      VITE_SIGNALING_URL="$VITE_SIGNALING_URL" pnpm --filter @warp/web build; \
    else \
      pnpm --filter @warp/web build; \
    fi

FROM nginx:1.27-alpine AS runtime

COPY docker/nginx.conf /etc/nginx/conf.d/default.conf
COPY --from=build /app/web/dist /usr/share/nginx/html

EXPOSE 80
