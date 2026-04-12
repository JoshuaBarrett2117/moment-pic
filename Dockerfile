# 阶段 1: 构建前端
FROM node:24-slim AS web-builder
WORKDIR /app
COPY apps/web/package.json apps/web/package-lock.json ./
RUN npm ci
COPY apps/web/vite.config.ts apps/web/index.html ./
COPY apps/web/src ./src
COPY apps/web/public ./public
RUN npm run build

# 阶段 2: 构建后端
FROM node:24-slim AS builder
WORKDIR /app
RUN apt-get update && apt-get install -y --no-install-recommends python3 make g++ && rm -rf /var/lib/apt/lists/*
COPY package.json package-lock.json ./
COPY apps/server/package.json ./apps/server/package.json
COPY apps/server/prisma ./apps/server/prisma
COPY tsconfig.base.json ./
COPY apps/server/tsconfig.json ./apps/server/tsconfig.json
RUN npm ci --workspace @moment-pic/server --include-workspace-root=false
COPY apps/server/src ./apps/server/src
WORKDIR /app/apps/server
RUN npx prisma generate && npx tsc -p tsconfig.json

# 阶段 3: 运行镜像（最小化体积）
FROM node:24-slim
WORKDIR /app
RUN apt-get update && apt-get install -y --no-install-recommends libvips42 && rm -rf /var/lib/apt/lists/*
COPY --from=builder /app/node_modules ./node_modules
COPY --from=builder /app/apps/server/package.json ./apps/server/package.json
COPY --from=builder /app/apps/server/dist ./apps/server/dist
COPY --from=builder /app/apps/server/prisma ./apps/server/prisma
COPY --from=web-builder /app/dist ./apps/server/dist/public
RUN rm -rf node_modules/.bin \
    && find node_modules -type d \( -name "test" -o -name "tests" -o -name "example" -o -name "examples" -o -name "docs" -o -name "__tests__" \) -exec rm -rf {} + 2>/dev/null || true \
    && find node_modules -type f \( -name "*.md" -o -name "*.ts" -o -name "*.d.ts" -o -name "LICENSE*" -o -name "README*" -o -name ".npm*" \) -delete 2>/dev/null || true
ENV HOST="0.0.0.0" PORT="3210" PUBLIC_DIR="/app/apps/server/dist/public" LIBRARY_ROOTS="/data/library" CACHE_DIR="/data/cache" SQLITE_PATH="/data/gallery.sqlite" INDEX_FILE_PATH="/data/index.json" DATABASE_URL="file:/data/gallery.sqlite" LOG_LEVEL="info"
WORKDIR /app/apps/server
RUN mkdir -p /data/library /data/cache
EXPOSE 3210
VOLUME ["/data/library", "/data/cache"]
CMD ["node", "dist/index.js"]
