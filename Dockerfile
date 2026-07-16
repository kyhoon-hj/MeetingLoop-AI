# syntax=docker/dockerfile:1

ARG POSTGRES_OPS_VERSION=16

FROM node:22-bookworm-slim AS base
ENV PNPM_HOME=/pnpm
ENV PATH=$PNPM_HOME:$PATH
RUN corepack enable && corepack prepare pnpm@11.7.0 --activate
WORKDIR /app

FROM base AS dependencies
RUN apt-get update \
    && apt-get install -y --no-install-recommends build-essential python3 \
    && rm -rf /var/lib/apt/lists/*
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml .npmrc ./
COPY apps/web/package.json apps/web/package.json
COPY apps/worker/package.json apps/worker/package.json
COPY packages/ai/package.json packages/ai/package.json
COPY packages/auth/package.json packages/auth/package.json
COPY packages/db/package.json packages/db/package.json
COPY packages/domain/package.json packages/domain/package.json
COPY packages/queue/package.json packages/queue/package.json
COPY packages/storage/package.json packages/storage/package.json
COPY packages/ui/package.json packages/ui/package.json
RUN pnpm install --frozen-lockfile

FROM dependencies AS builder
COPY tsconfig.json tsconfig.base.json ./
COPY apps/web apps/web
COPY apps/worker apps/worker
COPY packages/ai packages/ai
COPY packages/auth packages/auth
COPY packages/db packages/db
COPY packages/domain packages/domain
COPY packages/queue packages/queue
COPY packages/storage packages/storage
COPY packages/ui packages/ui
RUN pnpm --filter @meetingloop/web build \
    && pnpm --filter @meetingloop/worker exec tsc -b --force \
    && pnpm --filter @meetingloop/worker exec esbuild src/cli.ts --bundle --platform=node --format=cjs --outfile=dist/worker-bundle.cjs --external:argon2 --external:pg-native

FROM dependencies AS migrator
ENV NODE_ENV=production
COPY packages/db/migrations packages/db/migrations
COPY packages/db/scripts packages/db/scripts
CMD ["node", "packages/db/scripts/migrate.mjs"]

FROM postgres:${POSTGRES_OPS_VERSION}-alpine AS db-ops
COPY scripts/db-backup.sh /usr/local/bin/db-backup.sh
COPY scripts/db-restore-verify.sh /usr/local/bin/db-restore-verify.sh
RUN chmod 755 /usr/local/bin/db-backup.sh /usr/local/bin/db-restore-verify.sh
CMD ["/usr/local/bin/db-backup.sh"]

FROM node:22-bookworm-slim AS runner
ENV NODE_ENV=production
ENV HOSTNAME=0.0.0.0
ENV PORT=3000
WORKDIR /app

RUN groupadd --system --gid 1001 nodejs \
    && useradd --system --uid 1001 --gid nodejs nextjs

COPY --from=builder --chown=nextjs:nodejs /app/apps/web/.next/standalone ./
COPY --from=builder --chown=nextjs:nodejs /app/apps/web/.next/static ./apps/web/.next/static
COPY scripts/docker-entrypoint.sh /usr/local/bin/docker-entrypoint.sh
RUN chmod 755 /usr/local/bin/docker-entrypoint.sh

USER nextjs
EXPOSE 3000

HEALTHCHECK --interval=30s --timeout=5s --start-period=20s --retries=3 \
  CMD ["node", "-e", "fetch('http://127.0.0.1:3000/api/health').then(r=>{if(!r.ok)process.exit(1)}).catch(()=>process.exit(1))"]

ENTRYPOINT ["/usr/local/bin/docker-entrypoint.sh"]
CMD ["node", "apps/web/server.js"]

FROM dependencies AS worker-runner
ENV NODE_ENV=production
WORKDIR /app

RUN groupadd --system --gid 1001 nodejs \
    && useradd --system --uid 1001 --gid nodejs worker

COPY --from=builder --chown=worker:nodejs /app/apps/worker/dist/worker-bundle.cjs ./apps/worker/worker-bundle.cjs
COPY --from=builder --chown=worker:nodejs /app/apps/worker/package.json ./apps/worker/package.json
COPY --from=builder --chown=worker:nodejs /app/packages/ai ./packages/ai
COPY --from=builder --chown=worker:nodejs /app/packages/auth ./packages/auth
COPY --from=builder --chown=worker:nodejs /app/packages/db ./packages/db
COPY --from=builder --chown=worker:nodejs /app/packages/domain ./packages/domain
COPY --from=builder --chown=worker:nodejs /app/packages/queue ./packages/queue

USER worker
EXPOSE 3001
HEALTHCHECK --interval=20s --timeout=5s --start-period=20s --retries=3 \
  CMD ["node", "-e", "fetch('http://127.0.0.1:3001/health/ready').then(r=>{if(!r.ok)process.exit(1)}).catch(()=>process.exit(1))"]
CMD ["node", "apps/worker/worker-bundle.cjs"]
