# syntax=docker/dockerfile:1.7
# -------- Stage 1: deps --------
FROM node:22-alpine AS deps
RUN apk add --no-cache libc6-compat
WORKDIR /app
COPY package.json pnpm-lock.yaml ./
RUN corepack enable && pnpm install --frozen-lockfile

# -------- Stage 2: builder --------
FROM node:22-alpine AS builder
WORKDIR /app
COPY --from=deps /app/node_modules ./node_modules
COPY . .

# Client-side env must be present at build time (NEXT_PUBLIC_*).
ARG NEXT_PUBLIC_MAPBOX_TOKEN
ARG NEXT_PUBLIC_SENTRY_DSN
ARG NEXT_PUBLIC_POSTHOG_KEY
ARG NEXT_PUBLIC_POSTHOG_HOST
ARG NEXT_PUBLIC_APP_URL
ARG GIT_SHA
ENV NEXT_PUBLIC_MAPBOX_TOKEN=$NEXT_PUBLIC_MAPBOX_TOKEN \
    NEXT_PUBLIC_SENTRY_DSN=$NEXT_PUBLIC_SENTRY_DSN \
    NEXT_PUBLIC_POSTHOG_KEY=$NEXT_PUBLIC_POSTHOG_KEY \
    NEXT_PUBLIC_POSTHOG_HOST=$NEXT_PUBLIC_POSTHOG_HOST \
    NEXT_PUBLIC_APP_URL=$NEXT_PUBLIC_APP_URL \
    GIT_SHA=$GIT_SHA

# Dummy env to satisfy validation during build (runtime uses real values).
ENV DATABASE_URL="postgresql://build:build@localhost:5432/build" \
    AUTH_SECRET="build-only-placeholder-not-for-runtime-use-1234" \
    NEXT_TELEMETRY_DISABLED=1

RUN corepack enable && pnpm build
RUN pnpm exec tsc --skipLibCheck --module commonjs --target es2020 --moduleResolution node \
    --esModuleInterop true --outDir dist scripts/worker.ts || true

# -------- Stage 3: runner --------
FROM node:22-alpine AS runner
WORKDIR /app
ENV NODE_ENV=production PORT=3002 HOSTNAME=0.0.0.0
RUN apk add --no-cache wget && \
    addgroup -g 1001 -S nodejs && adduser -S nextjs -u 1001

# Next.js standalone build — tracer already bundles @prisma/client
# (listed in serverExternalPackages) into .next/standalone/node_modules.
# In Prisma 7 the client generates to node_modules/.pnpm/@prisma+client@.../
# not node_modules/.prisma — so the old .prisma copy is both missing and
# unnecessary.
COPY --from=builder --chown=nextjs:nodejs /app/.next/standalone ./
COPY --from=builder --chown=nextjs:nodejs /app/.next/static ./.next/static
COPY --from=builder --chown=nextjs:nodejs /app/prisma ./prisma
# prisma.config.ts provides datasource.url (resolved from process.env.DATABASE_URL
# at migrate-deploy time). Without it, Prisma 7 errors out because the schema's
# `datasource db` block intentionally has no `url = env(...)` — the URL lives
# in the config file so a single source of truth handles dev (dotenv) + prod.
COPY --from=builder --chown=nextjs:nodejs /app/prisma.config.ts ./prisma.config.ts
# Worker build output (may not exist in pure app image; tolerated)
COPY --from=builder --chown=nextjs:nodejs /app/dist ./dist
# Worker relies on full node_modules for prisma CLI (migrate deploy), bullmq, etc
COPY --from=builder --chown=nextjs:nodejs /app/node_modules ./worker_modules
COPY --chown=nextjs:nodejs docker/entrypoint.sh ./entrypoint.sh
COPY --chown=nextjs:nodejs docker/worker-entrypoint.sh ./docker/worker-entrypoint.sh

RUN chmod +x ./entrypoint.sh ./docker/worker-entrypoint.sh

USER nextjs
EXPOSE 3002
CMD ["./entrypoint.sh"]
