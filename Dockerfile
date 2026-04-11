# 阶段 1: 构建前端
FROM node:24-slim AS web-builder

WORKDIR /app

COPY apps/web/package.json ./
RUN npm install

COPY apps/web/vite.config.ts apps/web/index.html ./
COPY apps/web/src ./src
COPY apps/web/public ./public

RUN npm run build

# 阶段 2: 构建后端依赖和应用
FROM node:24-slim AS builder

WORKDIR /app

RUN apt-get update && \
    apt-get install -y --no-install-recommends python3 make g++ && \
    rm -rf /var/lib/apt/lists/*

COPY package.json package-lock.json ./
COPY apps/server/package.json ./apps/server/package.json
COPY apps/server/prisma ./apps/server/prisma
COPY tsconfig.base.json ./
COPY apps/server/tsconfig.json ./apps/server/tsconfig.json

RUN npm install --workspace @moment-pic/server --include-workspace-root=false

COPY apps/server/src ./apps/server/src

WORKDIR /app/apps/server
RUN npx prisma generate
RUN npx tsc -p tsconfig.json

# 从 web-builder 复制前端构建产物
COPY --from=web-builder /app/dist ./apps/server/dist/public

# 阶段 3: 运行镜像
FROM node:24-slim

RUN apt-get update && \
    apt-get install -y --no-install-recommends libvips42 && \
    rm -rf /var/lib/apt/lists/*

WORKDIR /app

COPY --from=builder /app/node_modules ./node_modules
COPY --from=builder /app/apps/server/package.json ./apps/server/package.json
COPY --from=builder /app/apps/server/dist ./apps/server/dist
COPY --from=builder /app/apps/server/prisma ./apps/server/prisma

ENV HOST="0.0.0.0"
ENV PORT="3210"
ENV LIBRARY_ROOTS="/data/library"
ENV CACHE_DIR="/data/cache"
ENV SQLITE_PATH="/data/gallery.sqlite"
ENV INDEX_FILE_PATH="/data/index.json"
ENV DATABASE_URL="file:/data/gallery.sqlite"
ENV LOG_LEVEL="info"

WORKDIR /app/apps/server

RUN mkdir -p /data/library /data/cache

EXPOSE 3210

VOLUME ["/data/library", "/data/cache"]

CMD ["node", "dist/index.js"]
