# Moment Pic

[![Node.js](https://img.shields.io/badge/Node.js-18%2B-green?style=flat&logo=node.js)](https://nodejs.org/)
[![React](https://img.shields.io/badge/React-19-blue?style=flat&logo=react)](https://react.dev/)
[![Fastify](https://img.shields.io/badge/Fastify-5-purple?style=flat)](https://fastify.dev/)
[![TypeScript](https://img.shields.io/badge/TypeScript-5.8-blue?style=flat&logo=typescript)](https://www.typescriptlang.org/)
[![Prisma](https://img.shields.io/badge/Prisma-5-gray?style=flat)](https://www.prisma.io/)

轻量级本地图片库管理与浏览工具，支持目录相册、ZIP/CBZ/RAR 压缩包解析、缩略图生成与实时预览。默认以 SQLite 轻量模式运行；当同时配置 PostgreSQL 与 Redis 后，会在启动时自动从当前 SQLite 存储迁移并切换到增强模式。

## 限制

- 本程序仅用于本地私有部署，请勿公网暴露
- 支持的图片格式：`jpg`、`jpeg`、`png`、`webp`、`gif`、`bmp`

## 技术架构

| 组件 | 技术选型 | 作用 |
| :--- | :--- | :--- |
| 前端 | React 19 + Vite | 响应式交互与美观 UI |
| 后端 | Fastify + TypeScript | 高性能 REST API 服务 |
| 数据存储 | SQLite（默认）/ PostgreSQL（增强模式） | 元数据持久化存储 |
| 缓存 | 进程内缓存（默认）/ Redis（增强模式） | 热点列表缓存与后续分布式扩展 |
| 图片处理 | Sharp | 缩略图生成与图片处理 |

## 快速开始

### 环境依赖

- Node.js 18+
- pnpm（推荐）或 npm

### 启动指令

```bash
# 安装依赖
npm install

# 启动后端服务
npm run dev:server

# 启动前端开发服务器（可选，前端会自动嵌入后端）
cd apps/web && npm run dev
```

访问地址：`http://127.0.0.1:3210`

默认账号：`admin`  
默认密码：`admin`（可通过环境变量 `ADMIN_PASSWORD` 覆盖）

### Docker 部署

项目默认采用单容器轻量部署，前端静态资源与后端 API 一起打包进同一个镜像。推荐使用新版 `docker compose` 命令。需要增强模式时，可以额外启用 PostgreSQL 与 Redis。

#### 1. 准备配置

直接编辑仓库根目录的 [docker-compose.yml](C:/Users/a3875/Documents/code/moment-pic/docker-compose.yml)。

至少需要修改下面几项：

- `ADMIN_PASSWORD`：后台登录密码
- `ports`：如果 `3210` 端口冲突，修改左边宿主机端口
- `volumes`：把示例图片目录改成你自己的宿主机图片目录

当前和存储模式相关的关键变量：

- `CACHE_DIR`：缩略图缓存目录，默认就是通过环境变量控制
- `DATABASE_URL=file:/data/gallery.sqlite`：轻量模式默认值
- `REDIS_URL=""`：留空表示不启用增强模式
- `STORAGE_PROFILE=auto`：自动判定轻量/增强模式
- `AUTO_MIGRATE_TO_POSTGRES=true`：增强模式启动时自动执行 `SQLite -> PostgreSQL` 迁移
- `STORAGE_MIGRATION_STRATEGY=fail-fast`：迁移失败直接阻止启动

Windows 路径建议使用正斜杠，例如 `D:/Pictures`；Linux / macOS 使用绝对路径，例如 `/mnt/photos`。

#### 2. 启动服务

轻量模式：

```bash
docker compose up -d --build
```

增强模式：

1. 把 `gallery.environment` 里的 `DATABASE_URL` 改成 PostgreSQL URL
2. 把 `REDIS_URL` 改成 Redis URL
3. 使用 `enhanced` profile 启动 PostgreSQL 与 Redis

```bash
docker compose --profile enhanced up -d --build
```

访问地址：`http://127.0.0.1:3210`

默认账号：`admin`

增强模式规则：

- 只有同时配置 PostgreSQL 与 Redis 才会进入增强模式
- 当前只支持 `SQLite -> PostgreSQL` 单向自动迁移
- 迁移成功后 PostgreSQL 成为主库，SQLite 不再继续双写
- 默认不会静默回退，迁移失败会直接阻止启动

#### 3. 首次扫描

服务启动后可在界面内触发扫描，也可以手动调用：

```bash
curl -X POST http://127.0.0.1:3210/api/v1/scan
```

#### 4. 用户部署版 `docker-compose.yml`

仓库根目录的 [docker-compose.yml](C:/Users/a3875/Documents/code/moment-pic/docker-compose.yml) 已经整理成可直接给最终用户部署的版本，环境变量和卷挂载都带了中文注释。下面保留同一份内容：

```yaml
services:
  gallery:
    build: .

    # 容器名称，可按需修改
    container_name: moment-pic

    # 构建后的本地镜像名
    image: moment-pic:latest

    # 开机自启，除非手动停止
    restart: unless-stopped

    ports:
      # 宿主机端口:容器端口
      # 左边的 3210 可以改成你想暴露的端口
      - "3210:3210"

    environment:
      # 容器时区，影响日志时间
      TZ: "Asia/Shanghai"

      # 运行环境，生产部署建议保持 production
      NODE_ENV: "production"

      # 服务监听地址，Docker 中固定 0.0.0.0 即可
      HOST: "0.0.0.0"

      # 容器内监听端口，建议不要改
      PORT: "3210"

      # 后台登录密码，部署后请务必修改
      ADMIN_PASSWORD: "admin"

      # 图库根目录列表，和 volumes 中的容器内挂载路径保持一致
      LIBRARY_ROOTS: "/library/main"

      # 缩略图缓存目录
      CACHE_DIR: "/data/cache"

      # 轻量模式默认使用 SQLite；如需增强模式，可改成 PostgreSQL URL
      DATABASE_URL: "file:/data/gallery.sqlite"

      # 增强模式 Redis 地址；留空时保持轻量模式
      REDIS_URL: ""

      # auto: 自动判定；lite: 强制轻量模式；enhanced: 强制增强模式
      STORAGE_PROFILE: "auto"

      # 启动时自动把当前 SQLite 数据迁移到 PostgreSQL
      AUTO_MIGRATE_TO_POSTGRES: "true"

      # SQLite 不存在但 index.json 存在时，允许导入历史索引
      AUTO_IMPORT_LEGACY_JSON: "true"

      # 默认迁移失败直接阻止启动，避免误以为已经切到增强模式
      STORAGE_MIGRATION_STRATEGY: "fail-fast"

      # 日志级别，当前版本保留该变量，通常保持 info
      LOG_LEVEL: "info"

    volumes:
      # 程序数据目录
      # 内含数据库、缩略图缓存、索引文件
      - "./data/docker:/data"

      # 第一个宿主机图片目录 -> 容器内图库目录
      # Windows 示例：D:/Pictures:/library/main:ro
      # Linux 示例：/mnt/photos:/library/main:ro
      - "./data/library-example:/library/main:ro"

      # 如果要挂载多个目录，继续按下面格式追加即可
      # - "D:/Comic:/library/comic:ro"
      # - "E:/Archive:/library/archive:ro"

  postgres:
    profiles: ["enhanced"]
    image: postgres:16-alpine
    restart: unless-stopped
    environment:
      POSTGRES_DB: moment_pic
      POSTGRES_USER: moment_pic
      POSTGRES_PASSWORD: moment_pic
      TZ: "Asia/Shanghai"
    ports:
      - "5432:5432"
    volumes:
      - "./data/postgres:/var/lib/postgresql/data"

  redis:
    profiles: ["enhanced"]
    image: redis:7-alpine
    restart: unless-stopped
    ports:
      - "6379:6379"
    volumes:
      - "./data/redis:/data"
```

#### 5. 用户实际需要改的地方

- `ADMIN_PASSWORD`：改成你自己的登录密码
- `ports`：如果 `3210` 端口冲突，修改左边宿主机端口
- `volumes` 里的图片目录：改成你宿主机真实的图片目录
- `CACHE_DIR`：如果要把缩略图缓存放到别的挂载路径，可直接改这个环境变量
- `DATABASE_URL` + `REDIS_URL`：只有两者同时配置才会进入增强模式

#### 6. 多目录挂载示例

示例：

```yaml
volumes:
  - "./data/docker:/data"
  - "D:/Pictures:/library/main:ro"
  - "D:/Comic:/library/comic:ro"
  - "E:/Archive:/library/archive:ro"
```

#### 7. 增强模式示例

如果你想启用 PostgreSQL + Redis，把 `gallery.environment` 中的两项改成：

```yaml
environment:
  DATABASE_URL: "postgresql://moment_pic:moment_pic@postgres:5432/moment_pic"
  REDIS_URL: "redis://redis:6379"
  STORAGE_PROFILE: "auto"
  AUTO_MIGRATE_TO_POSTGRES: "true"
  STORAGE_MIGRATION_STRATEGY: "fail-fast"
```

然后使用：

```bash
docker compose --profile enhanced up -d --build
```

## 当前支持

1. 目录图集浏览（如 `风景1/001.jpg`）
2. ZIP/CBZ 根目录图集解析
3. 图片格式：`jpg`、`jpeg`、`png`、`webp`、`gif`、`bmp`
4. 首页图集浏览
5. 图集缩略图浏览
6. 单图查看器（支持缩放、旋转、全屏）
7. 上一张、下一张切换
8. 手动重新扫描
9. 目录监听与自动同步
10. WebSocket 实时推送
11. 自定义图片查看器组件（集成缩放、旋转、全屏功能）

## 项目结构

```
moment-pic/
├── apps/
│   ├── server/           # 后端服务
│   │   └── src/
│   │       ├── routes/  # API 路由
│   │       ├── services/# 业务逻辑
│   │       └── lib/     # 工具库
│   └── web/              # 前端应用
│       └── src/
│           ├── components/ # React 组件
│           └── hooks/      # 自定义 Hooks
├── docs/                 # 项目文档
└── package.json         # 工作空间配置
```

## 开发规范

- **重构原则**：遵循单一职责，消除代码坏味道
- **日志追踪**：[模块名] 中文日志规范说明
- **临时文件**：所有调试产物存放于 `/debug` 目录，需定期清理
