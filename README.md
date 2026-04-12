# Moment Pic

[![Node.js](https://img.shields.io/badge/Node.js-18%2B-green?style=flat&logo=node.js)](https://nodejs.org/)
[![React](https://img.shields.io/badge/React-19-blue?style=flat&logo=react)](https://react.dev/)
[![Fastify](https://img.shields.io/badge/Fastify-5-purple?style=flat)](https://fastify.dev/)
[![TypeScript](https://img.shields.io/badge/TypeScript-5.8-blue?style=flat&logo=typescript)](https://www.typescriptlang.org/)
[![Prisma](https://img.shields.io/badge/Prisma-5-gray?style=flat)](https://www.prisma.io/)

轻量级本地图片库管理与浏览工具，支持目录相册、ZIP/CBZ 压缩包解析、缩略图生成与实时预览。

## 限制

- 本程序仅用于本地私有部署，请勿公网暴露
- 支持的图片格式：`jpg`、`jpeg`、`png`、`webp`、`gif`、`bmp`

## 技术架构

| 组件 | 技术选型 | 作用 |
| :--- | :--- | :--- |
| 前端 | React 19 + Vite | 响应式交互与美观 UI |
| 后端 | Fastify + TypeScript | 高性能 REST API 服务 |
| 数据库 | Prisma + SQLite | 数据持久化存储 |
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
6. 单图查看器
7. 上一张、下一张切换
8. 手动重新扫描
9. 目录监听与自动同步
10. WebSocket 实时推送

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
