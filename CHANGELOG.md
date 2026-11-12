# 更新日志

## 未发布

### 修复
- 扫描互斥：启动扫描、手动扫描、目录监听增量扫描、单图集重扫经进程内扫描协调器串行执行，修复并发扫描同一新目录时 `UNIQUE constraint failed: albums.source_path`；写库时按 source_path 兜底复用已有记录。
- 内容未变的图集重扫不再刷新 `updated_at`（“最近更新”排序不再被一次重扫打乱）。
- 手动扫描合并：同一图库或全量扫描已在排队/执行时，`POST /api/v1/scan` 返回已有任务（`alreadyRunning: true`）。

### 功能
- 图集列表与图集内图片支持游标分页：响应 `pagination.nextCursor`，请求带 `cursor` 续读；并发新增/相同排序值时不重不漏。`page` 参数保持兼容。非法或与排序不一致的游标返回 400（code 4012）。
- 迁移 0005：为游标分页新增 `(col, id)` 复合索引并替换 0002 中的旧排序索引（幂等）。
- `LIBRARY_ROOTS` 此前只被解析、没有生效。现在启动时会把其中存在的目录自动登记为图库目录并触发首次扫描；只新增，不改动已登记或已禁用的目录，不存在的路径会在日志里警告。

### 文档
- README 重写：完整功能、截图、部署（Compose / NAS / 源码构建 / 反向代理）、升级备份与常见问题。

## 0.2.0（2026-11）

### 安全
- 依赖漏洞清零（follow-redirects、@fastify/static、fast-uri、glob、minimatch、vite），CI 增加 `npm audit --omit=dev --audit-level=high` 闸门，并启用 Dependabot。
- 账号保存到数据库（scrypt 哈希），会话改为服务端会话：登出、改密、禁用用户立即吊销；不再用管理员密码签名 cookie。
- 新增安全响应头：CSP、`X-Content-Type-Options: nosniff`、`X-Frame-Options: DENY`、`Referrer-Policy: no-referrer`（防止分享链接经 Referer 外泄）等。
- 智能归纳的 AI API Token 以 AES-256-GCM 加密存储（历史明文启动时自动加密），也可用环境变量 `AI_API_TOKEN` 提供；公网 AI 接口必须 https。

### 功能
- 用户管理（#12）：页面修改用户名/密码；管理员可添加、禁用、删除用户，设置角色（管理员 / 只读）。只读用户只能浏览，阅读进度按用户隔离。
- 登录页与头像不再请求外部图片（picsum），字体改为本地打包，不依赖 Google Fonts，内网 / 国内网络可正常显示。

### 性能
- 相册名搜索使用 SQLite FTS5 trigram 全文索引（≥3 个字符），短关键字回退 LIKE 并正确转义 `%`、`_`。
- 相册列表增加排序索引并使用延迟关联分页，深分页不再回表读取被跳过的行。

### 工程
- 数据库迁移改为 `PRAGMA user_version` 版本化迁移，每步独立事务，失败回滚并拒绝启动；不再吞掉 `ALTER TABLE` 错误。
- 配置统一：默认端口 3210；`LIBRARY_ROOT_PATH`、`INDEX_FILE_PATH`、`DATABASE_URL` 废弃（启动时提示）；数值型变量非法时拒绝启动。
- 前端开启 TypeScript strict（补上缺失的 `@types/react`），新增 ESLint + react-hooks 规则；移除 axios、react-cool-img、react-responsive、autoprefixer。
- CI：arm64 改用原生 runner 构建，合并为多架构镜像（同一 tag 自动匹配 amd64/arm64，保留 `*-arm64` 兼容标签）；PR 只做质量检查和 amd64 构建。
- 仓库清理：删除 Rust 骨架、`.codex/` 过程文件、`pnpm-workspace.yaml`；过程验收文档移到 `docs/archive/`；新增 MIT LICENSE。

### 升级注意
- 首次升级会把现有 `ADMIN_PASSWORD` 写入数据库成为 `admin` 账号的密码；之后在页面改过密码，`ADMIN_PASSWORD` 不再覆盖它。忘记密码时设置 `ADMIN_PASSWORD_RESET=true` 重启一次即可用 `ADMIN_PASSWORD` 重置，然后删掉该变量。
- 升级后所有设备需要重新登录一次（旧 cookie 格式失效）。
- 旧的阅读进度归属第一个管理员。

# Moment Pic

## 0.1.x（2026-10-15 安全升级说明）

- 运行与测试使用 Node.js 22（推荐最新维护版）；不支持用 Node 26 加载旧版 SQLite 原生模块。构建不需要管理员密码，运行启动必须显式设置 `ADMIN_PASSWORD`。
- 升级前复制 `.env.example` 到本地 `.env`，必须显式设置非空的 1-128 字符管理员密码。管理员密码不再限制复杂度：不要求至少 16 字符、至少三类字符或至少八种不同字符；单字符、重复字符、单一字符类别及仅含空格的密码均可使用，密码原样保留且不裁剪空格。未配置、空密码或超过 128 字符会拒绝启动。不要把密码写进镜像、Git、日志或共享的 Compose 文件；`.env.example` 保持空值，Compose 不提供默认口令。
- HTTPS 直连自动使用 Secure Cookie。反向代理必须设置 `TRUSTED_PROXIES` 为实际代理 IP/CIDR（逗号分隔，不要配置通配信任），代理需覆盖而非透传客户端的转发头。WebSocket 跨代理或本地开发时显式设置 `WS_ALLOWED_ORIGINS` 为可信网页 origin（如 `https://photos.example`，不要附带路径）；未列出的跨源升级会拒绝。
- 登录限制为每真实客户端 IP 每分钟 10 次；公开分享认证同时限制每 IP 20 次、每分享标识 10 次。哈希使用异步 scrypt，最多 2 个活动任务和 16 个排队任务；密码最长 128 字符。进程内限制适用于单实例，多实例必须在可信网关再加统一限流。
- 新分享只持久化哈希；密码仅创建响应显示一次，管理列表不会返回密码。重置密码后旧分享会话立即失效。历史明文由 DBA 备份、审核、单独清理，本版本不自动清理历史数据或更改旧哈希；旧库可保留不再使用的明文列。
- 全量扫描总是校验文件集合和文件元数据；目录 mtime 不能代表图片未修改。任何枚举、stat、元数据或归档失败都会保留对应旧索引，且该根目录本轮不执行删除差异。扫描任务和界面显示脱敏失败摘要；目录重新可读后再完整扫描才确认删除。
- 归档解压使用生产端背压与请求取消，默认墙钟上限 30 秒、解压输出上限 256 MiB、列表输出 8 MiB、条目数 50,000、错误输出 64 KiB。所有归档读取/流/列表共用 4 个活动、32 个排队预算。2026-10-16 修复（执行者：Codex）：真实 RAR4/RAR5/CBR 使用 `node-unrar-js` 纯 WASM worker，背压直接阻塞 WASM 写钩子，同步解码时也能强制终止；只有 worker 实际退出后才释放预算。非 solid 归档跳过无关条目（包括加密附件）；solid 归档仍显式解码并累计前置输出，不能只计算返回的图片。加密目标、必要的加密 solid 前置条目和损坏 RAR 明确报错，不 fallback 重试。实现、验证与限制见 `docs/archive/rar-wasm-verification.md`。
- `npm test` 递归发现两工作区所有 `.test.ts`/`.test.tsx`，测试自动创建临时 SQLite/缓存，不读取 `.env` 或真实图库。CI 的独立质量 job 通过后才能发布任意架构镜像。
- 依赖公告逐项前置条件与修复版本见 `docs/archive/dependency-security-2026-10-15.md`；行为、验收证据及限制见 `docs/archive/safety-verification.md`。本次只做本地验证，不推送、不部署。


### 0.1.x · 缩略图缓存容量（2026-10-18，Codex）

`CACHE_MAX_BYTES` 默认 5368709120（5 GiB），`CACHE_GC_MIN_AGE_HOURS` 默认 24，`CACHE_GC_INTERVAL_HOURS` 默认 6。间隔为 0 时关闭定时清理（包括启动后的首次清理）。启用时启动 5 分钟后执行首轮，完成后按间隔调度，重叠请求合并；退出时取消并等待当前轮。

清理仅遍历 `CACHE_DIR` 的扁平普通文件，不递归、不跟随符号链接、不修改数据库。超过 1 小时的 `.tmp` 残留优先删除；普通缓存仅超限时按文件 mtime 从旧到新删除，保留保护期内文件，因此全部文件较新时可能暂时超过容量。单文件删除失败不阻断其余文件。mtime 是生成/修改时间，并非精确的最近访问时间。删除的缓存在下次请求时自动重新生成。

缩略图 v5 缓存键包含 `fit=cover|inside`：封面默认 cover，详情使用等比 inside。升级后旧版本缓存按容量策略逐步回收，首次请求会重新生成；未超限的旧缓存不会强制清空。

### 0.1.x · 运行与升级说明（2026-10-18，Codex）

- SIGTERM/SIGINT 会停止目录监听、等待在途定向扫描，关闭 Fastify（含 WebSocket/缓存 GC），成功退出码为 0；超过 10 秒强制以 1 退出并记录错误。Compose 使用 `init: true` 回收子进程。
- `/api/v1/health` 无需登录，正常 200，数据库异常 503，`data` 内包含 `status`、`db`、`dbLatencyMs`、`uptime`、`version`，禁止缓存。SQLite `busy_timeout=2000` 限制锁竞争等待；它作用于所有数据库语句，**不是对同步驱动任意慢调用的抢占式 2 秒超时**。超过 2 秒的探测按实际成功/失败返回并记录时延告警。
- `LOG_LEVEL` 支持 trace/debug/info/warn/error/fatal，非法值回落 info，Fastify 和业务日志均生效。
- 镜像独立安装服务端生产依赖，运行阶段不带编译工具，使用 `NODE_ENV=production` 和 `USER node`。部署前必须在宿主机执行 `chown -R 1000:1000 /volume4/docker/moment-pic/config`，覆盖目录、缓存、SQLite 主文件和 `-wal`/`-shm`。数据库卷必须使用本地 ext4/btrfs，不支持 NFS/SMB 上的 WAL。
- HEALTHCHECK 用 Node 内建 fetch（30s 间隔、5s 超时、60s 启动宽限、3 次重试）。Docker 本身不会因 unhealthy 自动重启；外部 autoheal 会改变这一行为。
- 本次未执行 Docker 构建；≤400MB 体积目标、最终镜像依赖内容和非 root 容器运行均**未验证**。
- 阅读进度仅对登录用户保存；详情恢复上次图片，首页继续阅读过滤已读完图集，公开分享不读写个人进度。新增表由 bootstrap 幂等创建，无存量数据全量重算。
