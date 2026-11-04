FROM node:24.22.1-bookworm-slim@sha256:be8204d4bd327363357f532187b752ff62759c31bedf98e9e18fc08c9cbd605c AS build
WORKDIR /workspace
RUN corepack enable && corepack prepare pnpm@10.32.1 --activate
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml tsconfig.base.json .npmrc ./
COPY apps/api/package.json apps/api/tsconfig.json ./apps/api/
COPY apps/worker/package.json apps/worker/tsconfig.json ./apps/worker/
COPY packages/contracts/package.json packages/contracts/tsconfig.json ./packages/contracts/
COPY packages/runtime/package.json packages/runtime/tsconfig.json ./packages/runtime/
RUN pnpm install --frozen-lockfile --filter abasong --filter @abasong/api... --filter @abasong/worker...
COPY packages/contracts/src ./packages/contracts/src
COPY packages/runtime/src ./packages/runtime/src
COPY packages/runtime/certs ./packages/runtime/certs
COPY apps/api/src ./apps/api/src
COPY apps/worker/src ./apps/worker/src
RUN pnpm --filter @abasong/contracts --filter @abasong/runtime build \
    && pnpm --filter @abasong/api --filter @abasong/worker build \
    && pnpm --filter @abasong/api deploy --prod --legacy /out/api \
    && pnpm --filter @abasong/worker deploy --prod --legacy /out/worker

FROM node:24.22.1-bookworm-slim@sha256:be8204d4bd327363357f532187b752ff62759c31bedf98e9e18fc08c9cbd605c AS runtime
# No privileged mount helpers; gettext cannot select attacker-controlled catalogs.
RUN find / -xdev -type f -perm /6000 -exec chmod a-s {} +
ENV LC_ALL=C.UTF-8 LANG=C.UTF-8 LANGUAGE=""

FROM runtime AS api
ENV NODE_ENV=production API_HOST=0.0.0.0 API_PORT=3001 TMPDIR=/app-tmp
WORKDIR /app
COPY --from=build --chown=node:node /out/api ./
RUN mkdir -p /app-tmp && chown node:node /app-tmp
VOLUME ["/app-tmp"]
USER node
EXPOSE 3001
CMD ["node","dist/cloud.js"]

FROM runtime AS worker
ENV NODE_ENV=production TMPDIR=/app-tmp
WORKDIR /app
COPY --from=build --chown=node:node /out/worker ./
RUN mkdir -p /app-tmp && chown node:node /app-tmp
VOLUME ["/app-tmp"]
USER node
CMD ["node","dist/cloud.js"]
