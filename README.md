# Moment Pic

## 2026-10-15 安全升级说明（执行者：Codex）

- 运行与测试使用 Node.js 22（推荐最新维护版）；不支持用 Node 26 加载旧版 SQLite 原生模块。构建不需要管理员密码，运行启动必须显式设置 `ADMIN_PASSWORD`。
- 升级前复制 `.env.example` 到本地 `.env`，设置独立的 16–128 字符强密码，包含大小写字母、数字、符号中的至少三类。不要把密码写进镜像、Git、日志或共享的 Compose 文件。未配置或弱密码会拒绝启动；Compose 不再提供默认口令。
- HTTPS 直连自动使用 Secure Cookie。反向代理必须设置 `TRUSTED_PROXIES` 为实际代理 IP/CIDR（逗号分隔，不要配置通配信任），代理需覆盖而非透传客户端的转发头。WebSocket 跨代理或本地开发时显式设置 `WS_ALLOWED_ORIGINS` 为可信网页 origin（如 `https://photos.example`，不要附带路径）；未列出的跨源升级会拒绝。
- 登录限制为每真实客户端 IP 每分钟 10 次；公开分享认证同时限制每 IP 20 次、每分享标识 10 次。哈希使用异步 scrypt，最多 2 个活动任务和 16 个排队任务；密码最长 128 字符。进程内限制适用于单实例，多实例必须在可信网关再加统一限流。
- 新分享只持久化哈希；密码仅创建响应显示一次，管理列表不会返回密码。重置密码后旧分享会话立即失效。历史明文由 DBA 备份、审核、单独清理，本版本不自动清理历史数据或更改旧哈希；旧库可保留不再使用的明文列。
- 全量扫描总是校验文件集合和文件元数据；目录 mtime 不能代表图片未修改。任何枚举、stat、元数据或归档失败都会保留对应旧索引，且该根目录本轮不执行删除差异。扫描任务和界面显示脱敏失败摘要；目录重新可读后再完整扫描才确认删除。
- 归档解压使用管道背压与请求取消，默认墙钟上限 30 秒、解压条目上限 256 MiB、列表输出 8 MiB、条目数 50,000、错误输出 64 KiB。所有归档读取/流/列表共用 4 个活动、32 个排队预算。超过限制明确失败，不返回截断的成功文件。RAR/CBR 也通过可终止子进程提取，真实 RAR 需要支持 RAR 的系统 `7zz`/`7z`；内置 `7za` 不保证支持专有 RAR 编码。
- `npm test` 递归发现两工作区所有 `.test.ts`/`.test.tsx`，测试自动创建临时 SQLite/缓存，不读取 `.env` 或真实图库。CI 的独立质量 job 通过后才能发布任意架构镜像。
- 依赖公告逐项前置条件与修复版本见 `docs/dependency-security-2026-10-15.md`；行为、验收证据及限制见 `docs/safety-verification.md`。本次只做本地验证，不推送、不部署。

[![Node.js](https://img.shields.io/badge/Node.js-22%2B-green?style=flat&logo=node.js)](https://nodejs.org/)
[![React](https://img.shields.io/badge/React-19-blue?style=flat&logo=react)](https://react.dev/)
[![Fastify](https://img.shields.io/badge/Fastify-5-purple?style=flat)](https://fastify.dev/)
[![TypeScript](https://img.shields.io/badge/TypeScript-5.8-blue?style=flat&logo=typescript)](https://www.typescriptlang.org/)

轻量级本地图片库管理与浏览工具，支持目录相册、ZIP/CBZ/RAR 压缩包解析、缩略图生成与实时预览。

## 限制

- 本程序仅用于本地私有部署，请勿公网暴露
- 支持的图片格式：`jpg`、`jpeg`、`png`、`webp`、`gif`、`bmp`

## 技术架构

| 组件 | 技术选型 | 作用 |
| :--- | :--- | :--- |
| 前端 | React 19 + Vite | 响应式交互与美观 UI |
| 后端 | Fastify + TypeScript | 高性能 REST API 服务 |
| 数据库 | better-sqlite3 + SQLite | 数据持久化存储 |
| 图片处理 | Sharp | 缩略图生成与图片处理 |

## 快速开始

### 环境依赖

- Node.js 22
- 带 RAR 解码器的完整 `7z`/`7zz`，用于 RAR/CBR 与真实归档回归；Ubuntu 的拆分包需同时安装 `7zip 7zip-rar`，其他发行版需核对插件仓库，或使用官方完整 `7zz`。不能只依赖精简 `7za`，也不能假定 `7zip` 包一定包含 RAR 解码器。
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

### Docker 启动

```bash
docker compose up --build
```

访问地址：`http://127.0.0.1:3210`

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
