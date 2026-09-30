# Production image for the Nexora API. Build context: repository root.
#   docker build -f apps/api/Dockerfile -t nexora-api .
FROM node:22-bookworm-slim AS build
ENV PNPM_HOME=/pnpm PATH=/pnpm:$PATH COREPACK_ENABLE_DOWNLOAD_PROMPT=0
RUN apt-get update && apt-get install -y --no-install-recommends openssl ca-certificates && rm -rf /var/lib/apt/lists/* \
  && corepack enable
WORKDIR /app

# Dependency layer: only manifests, so source changes don't reinstall.
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml .npmrc tsconfig.base.json ./
COPY apps/api/package.json apps/api/
COPY packages/contracts/package.json packages/contracts/
RUN pnpm install --frozen-lockfile --filter @nexora/api...

COPY apps/api apps/api
COPY packages/contracts packages/contracts
RUN pnpm --filter @nexora/api exec prisma generate && pnpm --filter @nexora/api build

FROM node:22-bookworm-slim AS runtime
RUN apt-get update && apt-get install -y --no-install-recommends openssl ca-certificates && rm -rf /var/lib/apt/lists/*
ENV NODE_ENV=production
WORKDIR /app
# node_modules includes the Prisma CLI used by the entrypoint to run `prisma migrate deploy` before starting.
COPY --from=build --chown=node:node /app /app
USER node
EXPOSE 3000
CMD ["sh", "/app/apps/api/scripts/start-production.sh"]
