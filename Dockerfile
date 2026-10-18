# syntax=docker/dockerfile:1.7

# 阶段 1: 构建前端
FROM node:22-slim AS web-builder
WORKDIR /app
COPY package.json package-lock.json ./
COPY apps/web/package.json ./apps/web/package.json
RUN npm ci --workspace @moment-pic/web --include-workspace-root=false
COPY apps/web ./apps/web
WORKDIR /app/apps/web
RUN npm run typecheck && npm run build

# 阶段 2: 构建后端
FROM node:22-slim AS builder
ARG APT_MIRROR=""
ARG APT_SECURITY_MIRROR=""
WORKDIR /app
RUN if [ -n "$APT_MIRROR" ]; then \
      SECURITY_MIRROR="${APT_SECURITY_MIRROR:-${APT_MIRROR%/debian}/debian-security}"; \
      rm -f /etc/apt/sources.list.d/*.list \
      && echo "deb ${APT_MIRROR} bookworm main" > /etc/apt/sources.list \
      && echo "deb ${APT_MIRROR} bookworm-updates main" >> /etc/apt/sources.list \
      && echo "deb ${SECURITY_MIRROR} bookworm-security main" >> /etc/apt/sources.list; \
    fi
RUN apt-get update && apt-get install -y --no-install-recommends python3 make g++ && rm -rf /var/lib/apt/lists/*
COPY package.json package-lock.json ./
COPY apps/server/package.json ./apps/server/package.json
COPY tsconfig.base.json ./
COPY apps/server/tsconfig.json ./apps/server/tsconfig.json
RUN npm ci --workspace @moment-pic/server --include-workspace-root=false
COPY apps/server/src ./apps/server/src
WORKDIR /app/apps/server
RUN npx tsc -p tsconfig.json

# 阶段 3: 仅安装服务端生产依赖，编译工具不会进入 runtime
FROM node:22-slim AS prod-deps
WORKDIR /app
RUN apt-get update && apt-get install -y --no-install-recommends python3 make g++ && rm -rf /var/lib/apt/lists/*
COPY package.json package-lock.json ./
COPY apps/server/package.json ./apps/server/package.json
RUN npm ci --omit=dev --workspace @moment-pic/server --include-workspace-root=false \
    && rm -rf node_modules/@types

# 阶段 4: 运行镜像（最小化体积）
FROM node:22-slim AS runtime
ARG APT_MIRROR=""
ARG APT_SECURITY_MIRROR=""
WORKDIR /app
RUN if [ -n "$APT_MIRROR" ]; then \
      SECURITY_MIRROR="${APT_SECURITY_MIRROR:-${APT_MIRROR%/debian}/debian-security}"; \
      rm -f /etc/apt/sources.list.d/*.list \
      && echo "deb ${APT_MIRROR} bookworm main" > /etc/apt/sources.list \
      && echo "deb ${APT_MIRROR} bookworm-updates main" >> /etc/apt/sources.list \
      && echo "deb ${SECURITY_MIRROR} bookworm-security main" >> /etc/apt/sources.list; \
    fi
RUN apt-get update && apt-get install -y --no-install-recommends libvips42 7zip && rm -rf /var/lib/apt/lists/*
COPY --from=prod-deps /app/node_modules ./node_modules
COPY --from=builder /app/apps/server/package.json ./apps/server/package.json
COPY --from=builder /app/apps/server/dist ./apps/server/dist
COPY --from=web-builder /app/apps/web/dist ./apps/server/dist/public
ENV NODE_ENV="production"
ENV CACHE_MAX_BYTES="5368709120" CACHE_GC_MIN_AGE_HOURS="24" CACHE_GC_INTERVAL_HOURS="6"
ENV HOST="0.0.0.0" PORT="3210" PUBLIC_DIR="/app/apps/server/dist/public" LIBRARY_ROOTS="/data/library" CACHE_DIR="/data/cache" SQLITE_PATH="/data/gallery.sqlite" INDEX_FILE_PATH="/data/index.json" DATABASE_URL="file:/data/gallery.sqlite" LOG_LEVEL="info"
WORKDIR /app/apps/server
RUN install -d -o node -g node /data /data/library /data/cache
USER node
# DB 不可用会 unhealthy；Docker 本身不会因此自动重启，外部 autoheal 需另行评估。
HEALTHCHECK --interval=30s --timeout=5s --start-period=60s --retries=3 CMD node -e 'fetch("http://127.0.0.1:" + process.env.PORT + "/api/v1/health", {signal: AbortSignal.timeout(4000)}).then(r => process.exit(r.ok ? 0 : 1)).catch(() => process.exit(1))'
EXPOSE 3210
VOLUME ["/data"]
CMD ["node", "dist/index.js"]
