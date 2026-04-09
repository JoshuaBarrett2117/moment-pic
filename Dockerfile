FROM node:24-bookworm-slim AS builder

WORKDIR /app

RUN apt-get update && apt-get install -y python3 make g++ && rm -rf /var/lib/apt/lists/*

COPY package.json package-lock.json ./
COPY apps/server/package.json ./apps/server/package.json
COPY apps/server/prisma ./apps/server/prisma
COPY tsconfig.base.json ./
COPY apps/server/tsconfig.json ./apps/server/tsconfig.json

RUN npm install

COPY apps/server/src ./apps/server/src
COPY apps/server/public ./apps/server/public

WORKDIR /app/apps/server
RUN npx prisma generate
RUN npx tsc -p tsconfig.json

FROM node:24-bookworm-slim

RUN apt-get update && apt-get install -y libvips42 && rm -rf /var/lib/apt/lists/*

WORKDIR /app

COPY package.json package-lock.json ./
COPY apps/server/package.json ./apps/server/package.json

RUN npm install --omit=dev

COPY --from=builder /app/apps/server/dist ./apps/server/dist
COPY --from=builder /app/apps/server/src/public ./apps/server/src/public
COPY --from=builder /app/apps/server/prisma ./apps/server/prisma
COPY --from=builder /app/node_modules/.prisma ./node_modules/.prisma

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
