FROM node:24-bookworm-slim

WORKDIR /app

COPY package.json ./
COPY apps/server/package.json ./apps/server/package.json
COPY tsconfig.base.json ./
COPY apps/server/tsconfig.json ./apps/server/tsconfig.json
RUN npm install

COPY apps/server ./apps/server
COPY .env.example ./

WORKDIR /app/apps/server
EXPOSE 3210
CMD ["../../node_modules/.bin/tsx", "src/index.ts"]
