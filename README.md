# Moment Pic

[![Node.js](https://img.shields.io/badge/Node.js-22-green?style=flat&logo=node.js)](https://nodejs.org/)
[![React](https://img.shields.io/badge/React-19-blue?style=flat&logo=react)](https://react.dev/)
[![Fastify](https://img.shields.io/badge/Fastify-5-purple?style=flat)](https://fastify.dev/)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](LICENSE)

轻量级本地图片库：把 NAS / 硬盘上的图片目录和压缩包（ZIP / CBZ / RAR / CBR / 7z）变成可在手机和电脑上浏览的相册，支持缩略图、阅读进度、智能归纳、分享链接和多用户。

> 本程序面向本地 / 内网私有部署。需要外网访问时，请放在 HTTPS 反向代理之后并设置 `TRUSTED_PROXIES`。

## 功能

- 目录图集与压缩包图集，自动扫描、目录监听、增量重扫
- 缩略图与多档画质（原图 / 高清 / 省流），大图查看器支持缩放、旋转、手势翻页、预加载
- 阅读进度与首页「继续阅读」（每个用户独立）
- 收藏、最近浏览、目录相册、按名称全文搜索
- 智能归纳：按规则或 OpenAI 兼容接口自动整理相册
- 带密码和有效期的分享链接
- 多用户：管理员 / 只读两种角色，页面上修改用户名和密码
- 图片格式：jpg、jpeg、png、webp、gif、bmp

## 快速开始（Docker）

```bash
cp .env.example .env          # 至少填写 ADMIN_PASSWORD
docker compose up -d
```

打开 `http://<服务器IP>:3210`，用户名 `admin`，密码为 `ADMIN_PASSWORD`。登录后可在「设置 → 账号」修改用户名和密码，在「设置 → 用户管理」添加其他用户。

也可以直接使用 Docker Hub 镜像 `joshualoooooo/moment-pic:latest`（多架构，amd64 / arm64 自动匹配）。

```yaml
services:
  gallery:
    image: joshualoooooo/moment-pic:latest
    init: true
    ports: ["3210:3210"]
    environment:
      ADMIN_PASSWORD: ${ADMIN_PASSWORD}
    volumes:
      - ./config:/data                   # 数据库与缩略图缓存（需本地 ext4/btrfs，不支持 NFS/SMB）
      - /path/to/photos:/data/library:ro # 你的图片目录
    restart: unless-stopped
```

容器以 uid 1000 运行，首次部署前执行 `chown -R 1000:1000 ./config`。

## 配置

| 变量 | 默认值 | 说明 |
| :--- | :--- | :--- |
| `ADMIN_PASSWORD` | — | 首次启动（数据库里还没有用户）时必填，用来创建 `admin`；之后以页面上设置的密码为准 |
| `ADMIN_PASSWORD_RESET` | — | 设为 `true` 重启一次，用 `ADMIN_PASSWORD` 重置第一个管理员的密码（忘记密码时用，用完删掉） |
| `PORT` / `HOST` | `3210` / `0.0.0.0` | 监听地址 |
| `LIBRARY_ROOTS` | `/data/library` | 图库目录，多个用逗号、分号或换行分隔 |
| `SQLITE_PATH` | `/data/gallery.sqlite` | 数据库文件 |
| `CACHE_DIR` | `/data/cache` | 缩略图缓存目录 |
| `CACHE_MAX_BYTES` | `5368709120` | 缓存容量上限（5 GiB），超出按最旧优先回收 |
| `CACHE_GC_MIN_AGE_HOURS` / `CACHE_GC_INTERVAL_HOURS` | `24` / `6` | 缓存保护期与清理间隔，间隔为 0 关闭定时清理 |
| `TRUSTED_PROXIES` | 空 | 反向代理 IP/CIDR，逗号分隔；只有这些代理的 `X-Forwarded-*` 会被信任 |
| `WS_ALLOWED_ORIGINS` | 空 | 跨源访问时允许的网页 origin，如 `https://photos.example` |
| `AI_API_TOKEN` | 空 | 可选：智能归纳的 AI Token，优先于页面中保存的值 |
| `LOG_LEVEL` | `info` | trace / debug / info / warn / error / fatal |

## 本地开发

```bash
npm ci
cp .env.example apps/server/.env   # 开发模式服务端用 3211 端口
npm run dev:server                 # 后端 http://localhost:3211
npm run dev --workspace @moment-pic/web   # 前端 http://localhost:3210，/api 与 /ws 代理到 3211
```

常用命令：

```bash
npm test          # 服务端 + 前端测试、ESLint、类型检查、构建
npm run typecheck
```

测试会自动创建临时 SQLite / 缓存目录，不读取 `.env` 或真实图库。

## 项目结构

```
apps/
  server/   Fastify + better-sqlite3 + sharp
    src/routes        API 路由
    src/services      业务逻辑（扫描、缩略图、压缩包、智能归纳、认证）
    src/repositories  SQLite 数据访问
    src/db/migrations 版本化数据库迁移（PRAGMA user_version）
  web/      React 19 + Vite + Tailwind 4
docs/       设计文档；docs/archive 为历史验收记录
```

## 升级

版本变化与升级注意事项见 [CHANGELOG.md](CHANGELOG.md)。数据库结构在启动时自动迁移，迁移失败会回滚并拒绝启动，不会留下半升级状态；升级前仍建议备份 `/data/gallery.sqlite`。

## 许可证

[MIT](LICENSE)
