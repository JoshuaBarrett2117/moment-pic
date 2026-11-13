# Moment Pic

[![Node.js](https://img.shields.io/badge/Node.js-22-green?style=flat&logo=node.js)](https://nodejs.org/)
[![React](https://img.shields.io/badge/React-19-blue?style=flat&logo=react)](https://react.dev/)
[![Fastify](https://img.shields.io/badge/Fastify-5-purple?style=flat)](https://fastify.dev/)
[![Docker Image](https://img.shields.io/badge/Docker-joshualoooooo%2Fmoment--pic-2496ED?style=flat&logo=docker)](https://hub.docker.com/r/joshualoooooo/moment-pic)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](LICENSE)

轻量级、可自托管的本地图片库。把 NAS / 硬盘上的图片目录和压缩包（ZIP / CBZ / RAR / CBR / 7z）变成能在手机和电脑上浏览的相册：自动生成缩略图、记住每个人的阅读进度、按规则或 AI 自动归纳系列图集，还能生成带密码和有效期的分享链接。界面提供「暗夜玻璃」和「玫瑰纸感」两套主题，背景可以用默认照片墙或你自己的图片。

> 面向本地 / 内网私有部署。需要外网访问时，请放在 HTTPS 反向代理之后，并设置 `TRUSTED_PROXIES`。

![首页](docs/screenshots/home.webp)

## 目录

- [功能](#功能)
- [截图](#截图)
- [部署](#部署)
  - [Docker Compose（推荐）](#docker-compose推荐)
  - [群晖 / 绿联等 NAS](#群晖--绿联等-nas)
  - [从源码构建镜像](#从源码构建镜像)
  - [反向代理与外网访问](#反向代理与外网访问)
  - [首次使用](#首次使用)
- [配置](#配置)
- [升级与备份](#升级与备份)
- [常见问题](#常见问题)
- [本地开发](#本地开发)
- [项目结构](#项目结构)
- [许可证](#许可证)

## 功能

**图库与扫描**

- 支持两种图集：图片文件夹，以及 ZIP / CBZ / RAR / CBR / 7z 压缩包（不解压到磁盘，按需读取）
- 可添加多个图库目录（环境变量 `LIBRARY_ROOTS` 自动登记，或在设置里添加）；首次全量扫描，之后监听目录变化并增量重扫，也可对单个图集手动重扫
- 所有扫描（启动扫描、手动扫描、目录监听、单图集重扫）排队串行执行，不会互相冲突；重复点「扫描」会直接返回正在进行的任务
- 内容没有变化的图集重扫后不改更新时间，「最近更新」排序保持准确
- 支持的图片格式：jpg、jpeg、png、webp、gif、bmp
- 缩略图后台预热，缓存有容量上限，超出后按最旧优先自动回收

**浏览**

- 首页（默认落地页）：继续阅读（带进度条）、最近更新、收藏、智能相册
- 侧栏分为「浏览」（首页 / 全部相册 / 收藏 / 最近浏览）、「整理」（目录 / 智能相册）和「图库」三组；窗口较窄时收起为图标栏，手机上改为底部标签栏
- 全部相册：按来源（文件夹 / 压缩包）筛选，按名称、更新时间、图片数量排序，按名称全文搜索（快捷键 `/`）；卡片有大 / 中 / 小三档
- 列表无限滚动，后端用游标分页，翻页时不重复、不漏项；从相册返回时保留已加载内容和滚动位置
- 「继续阅读」：每个用户各自记录看到第几张，下次打开直接跳回
- 目录：按图库目录逐层进入，子文件夹和图集分开显示
- 相册详情：封面横幅，网格或等高拼图两种排列
- 大图查看器：缩放、旋转、全屏、键盘 ← → 切换、滚轮缩放，手机上左右滑动翻页
- 四档画质（省流 / 均衡 / 高清 / 原图），可设默认档位，查看时随时切换；可设置前后预加载张数

**外观**

- 两套主题：暗夜玻璃（默认，深色磨砂玻璃）和玫瑰纸感（浅色，粉色与奶油色，卡片带相框）；大图查看器始终是深色
- 背景三选一：默认照片墙、上传自己的图片、不用图片。上传的图片按账号保存在服务器上，换设备也能用；服务端会自动旋转、去掉 EXIF / GPS，并压缩成 WebP

**自动整理（智能归纳）**

- 规则归纳：按图集名称、完整路径、父目录或文件名匹配（包含 / 完全等于 / 前缀 / 后缀 / 正则），把同系列图集合并成一个「自动整理」相册，支持名称模板、优先级和最少命中数
- AI 归纳：接入任意 OpenAI 兼容接口，支持「辅助建议 / 低风险自动应用 / 全自动」三种模式和置信度阈值
- AI Token 加密保存在数据库中，也可以用环境变量 `AI_API_TOKEN` 提供

**分享**

- 为单个图集生成分享链接，带访问密码和有效期，对方无需账号即可查看
- 「分享管理」集中查看和撤销仍在有效期内的分享

**账号与权限**

- 多用户，两种角色：管理员可以管理图库、扫描和设置；只读用户只能浏览，看不到收藏、分享、扫描和设置入口
- 管理员可添加、禁用、删除用户、重置密码；每个人可在「设置 → 账号」改自己的用户名和密码
- 服务端会话：登出、改密码、禁用用户立即生效；登录失败限流

**安全与运维**

- 默认安全响应头（CSP、nosniff、禁止页面嵌套、no-referrer）
- 数据库结构版本化迁移，失败自动回滚并拒绝启动；旧版本遇到新版迁移过的数据库会拒绝打开
- 内置健康检查 `/api/v1/health`，Docker 镜像自带 `HEALTHCHECK`
- 多架构镜像（amd64 / arm64）

## 截图

截图使用 [Wikimedia Commons](https://commons.wikimedia.org/) 上公开授权的示例图片拍摄。

| 全部相册 | 相册详情 |
| :---: | :---: |
| ![全部相册](docs/screenshots/albums.webp) | ![相册详情](docs/screenshots/album.webp) |
| **大图查看器** | **玫瑰纸感主题** |
| ![大图查看器](docs/screenshots/viewer.webp) | ![玫瑰纸感主题](docs/screenshots/theme-rose.webp) |
| **外观：主题与背景** | **登录** |
| ![外观设置](docs/screenshots/appearance.webp) | ![登录](docs/screenshots/login.webp) |
| **用户管理** | **智能相册规则** |
| ![用户管理](docs/screenshots/settings-users.webp) | ![智能相册](docs/screenshots/settings-smart.webp) |
| **分享页（访客视角）** | |
| ![分享](docs/screenshots/share.webp) | |

**手机端**：首页、全部相册、相册详情

![手机端](docs/screenshots/mobile.webp)

## 部署

镜像发布在 Docker Hub：`joshualoooooo/moment-pic`。

| 标签 | 说明 |
| :--- | :--- |
| `latest` / `main` | main 分支最新版本 |
| `sha-<提交>` | 某次提交的固定版本，生产环境建议固定到这种标签，升级时手动改 |
| `<版本号>` | 打 `v*` tag 时发布 |

同一个标签同时包含 amd64 和 arm64，Docker 会自动拉取匹配的架构。

### Docker Compose（推荐）

新建一个目录，例如 `/opt/moment-pic`，放入 `docker-compose.yaml`：

```yaml
services:
  moment-pic:
    image: joshualoooooo/moment-pic:latest
    container_name: moment-pic
    init: true
    ports:
      - "3210:3210"
    environment:
      ADMIN_PASSWORD: "换成你的强密码"     # 首次启动创建 admin 用
      TZ: Asia/Shanghai
      LIBRARY_ROOTS: /photos                # 启动时自动登记为图库目录，多个用逗号分隔
    volumes:
      - ./config:/data                      # 数据库、缩略图缓存与背景图
      - /path/to/photos:/photos:ro          # 你的图片目录，只读挂载即可，可挂多个
    restart: unless-stopped
```

```bash
mkdir -p config && sudo chown -R 1000:1000 config   # 容器默认以 uid 1000 运行
docker compose up -d
docker compose ps                                   # 等待状态变成 healthy
```

浏览器打开 `http://<服务器IP>:3210`。首次启动会自动登记 `LIBRARY_ROOTS` 里的目录并完成第一次扫描。

> `./config` 必须在本地文件系统上（ext4 / btrfs 等）。SQLite 不支持放在 NFS / SMB 网络共享上。

### 群晖 / 绿联等 NAS

和上面一样使用 Compose，在 NAS 的 Docker / Container Manager 里新建项目并粘贴配置即可。几个常见差异：

- **媒体目录权限**：如果图片所在的父目录对普通用户不可遍历（例如权限为 000 的共享文件夹根目录），uid 1000 读不到文件。这时可以给服务加 `user: "0:0"` 以 root 运行，并保持图片目录 `:ro` 只读挂载。
- **路径保持一致更省事**：可以把宿主路径原样挂进容器，例如 `/volume1/photos:/volume1/photos:ro`，`LIBRARY_ROOTS` 也填同样的路径。
- **配置目录**：例如 `/volume1/docker/moment-pic/config:/data`。

一个 NAS 上的实际示例：

```yaml
services:
  moment-pic:
    image: joshualoooooo/moment-pic:latest
    container_name: moment-pic
    user: "0:0"                         # 媒体父目录不可遍历时才需要
    ports:
      - "3210:3210"
    environment:
      ADMIN_PASSWORD: "换成你的强密码"
      TRUSTED_PROXIES: 192.168.1.10     # 反向代理所在 IP，没有就删掉
      WS_ALLOWED_ORIGINS: https://photos.example.com
      LIBRARY_ROOTS: /volume1/photos,/volume2/comics
    volumes:
      - /volume1/photos:/volume1/photos:ro
      - /volume2/comics:/volume2/comics:ro
      - /volume1/docker/moment-pic/config:/data
    restart: always
```

### 从源码构建镜像

```bash
git clone https://github.com/JoshuaBarrett2117/moment-pic.git
cd moment-pic
cp .env.example .env        # 填写 ADMIN_PASSWORD，按需填写 LIBRARY_HOST_PATH
docker compose up -d --build
```

仓库自带的 `docker-compose.yml` 使用命名卷 `gallery-data` 保存数据，并把 `LIBRARY_HOST_PATH`（默认是示例图库）挂载到容器的 `/data/library`。

国内网络构建较慢时，可以传入 apt 镜像：

```bash
docker build --build-arg APT_MIRROR=https://mirrors.tuna.tsinghua.edu.cn/debian -t moment-pic:local .
```

### 反向代理与外网访问

Moment Pic 使用 Cookie 会话和 WebSocket（扫描进度推送），反代时需要转发 WebSocket。Nginx 示例：

```nginx
server {
    listen 443 ssl;
    server_name photos.example.com;
    client_max_body_size 20m;

    location / {
        proxy_pass http://127.0.0.1:3210;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection "upgrade";
        proxy_set_header Host $host;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
    }
}
```

同时在容器环境变量里设置：

- `TRUSTED_PROXIES`：反代的 IP 或网段。只有这些来源的 `X-Forwarded-*` 头会被信任，用于识别真实客户端 IP（登录限流）和 HTTPS。不要填 `0.0.0.0/0`。
- `WS_ALLOWED_ORIGINS`：网页访问地址，如 `https://photos.example.com`，多个用逗号分隔，不带路径。

Lucky、Caddy、群晖自带反代同理：开启 WebSocket 支持，并把反代的 IP 填进 `TRUSTED_PROXIES`。

### 首次使用

1. 用 `admin` 和 `ADMIN_PASSWORD` 登录。
2. 设置了 `LIBRARY_ROOTS` 时，目录已自动登记并开始首次扫描，首页会陆续出现图集，缩略图在后台生成。也可以在「设置 → 图库与浏览 → 添加库目录」手动添加，填写**容器内**路径，然后点「扫描全部」。
3. 想隐藏某个 `LIBRARY_ROOTS` 里的目录，请在设置里「禁用」而不是删除：删除后只要它还在环境变量里，下次重启会重新登记。
4. 建议到「设置 → 账号」改成你自己的用户名和密码；需要给家人看时，在「设置 → 用户管理」添加只读用户。
5. 在「设置 → 外观」切换主题和背景。主题与背景模式保存在当前浏览器；上传的背景图保存在服务器上，跟着账号走。

数据库里已有用户后，`ADMIN_PASSWORD` 不再生效，以页面上设置的密码为准。

## 配置

| 变量 | 默认值 | 说明 |
| :--- | :--- | :--- |
| `ADMIN_PASSWORD` | — | 首次启动（数据库中还没有用户）时必填，用来创建 `admin` |
| `ADMIN_PASSWORD_RESET` | — | 设为 `true` 重启一次，会用 `ADMIN_PASSWORD` 重置第一个管理员的密码。忘记密码时用，用完删掉 |
| `PORT` / `HOST` | `3210` / `0.0.0.0` | 监听端口与地址 |
| `SQLITE_PATH` | `/data/gallery.sqlite` | 数据库文件。用户上传的背景图存放在同级的 `backgrounds/` 目录 |
| `CACHE_DIR` | `/data/cache` | 缩略图缓存目录 |
| `CACHE_MAX_BYTES` | `5368709120` | 缓存容量上限（5 GiB），超出后按最旧优先回收 |
| `CACHE_GC_MIN_AGE_HOURS` | `24` | 缓存文件的最短保留时间 |
| `CACHE_GC_INTERVAL_HOURS` | `6` | 定时清理间隔，设为 `0` 关闭定时清理 |
| `TRUSTED_PROXIES` | 空 | 反向代理 IP / CIDR，逗号分隔 |
| `WS_ALLOWED_ORIGINS` | 空 | 跨源访问时允许的网页 origin，逗号分隔 |
| `AI_API_TOKEN` | 空 | 智能归纳的 AI Token，优先于页面中保存的值 |
| `LOG_LEVEL` | `info` | `trace` / `debug` / `info` / `warn` / `error` / `fatal` |
| `LIBRARY_ROOTS` | `/data/library` | 容器内的图库目录，多个用逗号、分号或换行分隔。启动时自动登记其中存在的目录（只新增，不改动已登记或已禁用的目录）；也可以在「设置」里手动添加 |

旧变量 `LIBRARY_ROOT_PATH` 已废弃，启动时会提示改用新变量。

## 升级与备份

**升级**

```bash
docker compose pull          # 使用固定 sha 标签时，先改 compose 里的 image
docker compose up -d
```

数据库结构在启动时自动迁移。迁移失败会整体回滚并拒绝启动，不会留下半升级状态。**升级前请先备份数据库**：迁移后的数据库，旧版本镜像会拒绝启动。每个版本的变化和注意事项见 [CHANGELOG.md](CHANGELOG.md)。

当前数据库结构版本为 5（迁移 0005 为游标分页新增了 `albums` 复合索引）。图库很大时，首次启动建索引会稍慢一些。

从 0.1.x 升级到 0.2.0：首次启动会用 `ADMIN_PASSWORD` 创建 `admin` 账号，旧的登录 Cookie 失效，所有设备需要重新登录一次；原有阅读进度归属第一个管理员。

**备份**

需要备份的是配置目录里的数据库和自定义背景图（`cache` 目录可以重新生成）：

```bash
docker compose stop
cp config/gallery.sqlite* /path/to/backup/
cp -r config/backgrounds /path/to/backup/     # 用户上传的背景图，没有上传过可以跳过
docker compose start
```

**回滚**：把 `image` 改回旧标签，并恢复升级前备份的数据库。新版本迁移过的数据库不能被旧版本直接读取（旧版检测到更高的 `user_version` 会拒绝启动）。

## 常见问题

**扫描后首页是空的？**
看启动日志里是否有「LIBRARY_ROOTS 中的目录未登记」的警告，并确认「设置 → 图库与浏览」里的库目录填的是容器内路径。用 `docker exec moment-pic ls <路径>` 检查容器能否读到文件。

**缩略图大量失败或看不到图片？**
多半是权限问题：容器以 uid 1000 运行，读不到媒体目录。给媒体目录加读权限，或参考上文改用 `user: "0:0"`。

**忘记密码？**
在环境变量里设置新的 `ADMIN_PASSWORD` 和 `ADMIN_PASSWORD_RESET=true`，重启一次后删掉 `ADMIN_PASSWORD_RESET`。

**外网访问时扫描进度不更新？**
反代没有转发 WebSocket，或 `WS_ALLOWED_ORIGINS` 没有包含访问域名。

**`docker compose pull` 拉到的 `latest` 是旧版本？**
部分 Docker Hub 镜像加速源会长时间缓存 `latest`。改用固定的 `sha-<提交>` 标签拉取即可，或者直连 Docker Hub。

**数据库报 `database is locked` 或损坏？**
配置目录不能放在 NFS / SMB 上，请改用本地磁盘。

## 本地开发

需要 Node.js 22。

```bash
npm ci
cp .env.example apps/server/.env          # 开发模式后端使用 3211 端口
npm run dev:server                        # 后端 http://localhost:3211
npm run dev --workspace @moment-pic/web   # 前端 http://localhost:3210，/api 与 /ws 代理到 3211
```

常用命令：

```bash
npm test             # 服务端 + 前端测试、ESLint、类型检查、构建
npm run typecheck
npm run lint:web
```

测试会自动创建临时 SQLite 和缓存目录，不读取 `.env` 和真实图库。

CI（GitHub Actions）：PR 会跑依赖审计、全部测试，并验证 amd64 镜像能构建；合并到 main 后分别在 amd64 / arm64 上原生构建，合成多架构镜像推送到 Docker Hub。

## 项目结构

```
apps/
  server/                Fastify 5 + better-sqlite3 + sharp
    src/routes           API 路由
    src/services         业务逻辑：扫描、缩略图、压缩包读取、智能归纳、认证
    src/repositories     SQLite 数据访问
    src/db/migrations    版本化数据库迁移（PRAGMA user_version）
  web/                   React 19 + Vite 8 + Tailwind CSS 4
    src/components       页面与组件（首页、相册、详情、查看器、设置等）
    src/theme            主题变量（glass-dark 暗夜玻璃、rose-paper 玫瑰纸感）
    public/backgrounds   默认照片墙背景
docs/                    设计文档与截图；主题设计见 docs/ui-glass-theme-design.md，docs/archive 为历史验收记录
scripts/                 测试发现与运行脚本
```

第三方客户端接入可参考 [Android 客户端 API 兼容说明](docs/android-client-api-compatibility.md)。

## 许可证

[MIT](LICENSE)
