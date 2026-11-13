# 更新日志

## 未发布

### 性能
- 智能相册：扫描结束后不再立刻全库重建，改为标记后防抖 30 秒合并执行一次，连续拷贝一批文件只算一遍；扫描后的自动重建不再调用 AI，AI 聚类只在手动「重建」时运行（不再因拷几张图产生 token 费用）。规则模式只归一化、编译一次；按图片名匹配时一次性载入资产名；非 AI 规则只算一遍；成员列表不再逐个查图集。
- 智能相册 id 稳定：重建按 `normalized_key` 沿用旧 id 和状态（已隐藏的保持隐藏），内容没变不改 `updated_at`，只删除不再出现的智能相册。正在打开的智能相册不会因后台扫描而 404。
- 最近浏览：迁移 0007 把 `album_views` 改为 `(user_id, album_id)` 主键 + upsert（旧数据每个图集只保留最后一次浏览，归属最早的管理员），最近列表走 `(user_id, viewed_at)` 索引，不再全表 `GROUP BY`；每个用户最多保留 500 条。最近浏览改为按登录用户隔离，删除用户时一并清除。
- 启动：先监听端口再在后台执行首次扫描，空库首次部署时健康检查和登录页立即可用；`/api/v1/health` 新增 `scan`（`busy`、`label`）显示扫描进度。
- 原图：返回 `ETag`、`Last-Modified`、`Cache-Control`，`If-None-Match` 命中返回 304；目录图支持单段 `Range`（206/416，带 `If-Range`）。翻回上一张不再重新下载。
- 图片 URL 带内容版本 `v`（源文件 mtime + 大小的短哈希）：版本一致时缩略图、预览、原图都 `private, max-age=31536000, immutable`；不带或不一致时缩略图/预览 24 小时、原图 1 小时并要求重新验证。缩略图/预览补 `Vary: Accept`，`If-None-Match` 兼容列表、`*` 和 `W/`。
- 缩略图/预览的 304 判断提前到排队生成之前，不占生成槽也不读盘；缓存目录只在第一次用到时创建。
- 分享页：图片请求与管理端共用生成闸门和缓存头；读分享不再每次执行 `DELETE` 清理过期分享（改为最多每 10 分钟一次，查询按 `expires_at` 过滤）。
- 查看器默认「原图」档位也预加载下一张；主图加载完之前用网格里已缓存的缩略图做模糊占位。
- 长列表：相册卡片和图集图片加 `content-visibility: auto`，屏幕外跳过布局和绘制；照片上的标签和按钮去掉 `backdrop-filter`；所有缩略图共享一个 IntersectionObserver。
- 缩略图进入视口时如果页面没在滚动就立即加载，只在快速滚动中才等 250 ms。
- 每页条数：相册列表 24 → 60，图集详情 24 → 96。
- 动图（GIF/动画 WebP）缩略图和尺寸探测只读第一帧：缩略图不再逐帧处理，生成快约 50 倍、体积小约 58 倍，也不再输出所有帧拼成的竖长条。迁移 0006 清空 GIF/WebP 资产已入库的错误高度（由头部探测重新填写），动图缩略图缓存键升到 v6 自动重新生成；预览仍保留动画。
- 查看器的氛围背景改用网格里已缓存的缩略图，不再为每一页额外生成 1600px 预览；已缓存的预览不再排队等生成槽（之前会排在缩略图生成后面甚至 503）。
- 缩略图/预览生成并发默认 `min(2, CPU 核数)`，可用 `THUMBNAIL_CONCURRENCY` 调整；WebP 编码 effort 缩略图 2、预览 3。
- 文件变更推送：每个图库在一个防抖窗口内只推送一条汇总，不再逐文件广播；前端不再因每条文件事件重渲染整个应用，删除文件时等增量扫描结束（`scan_complete`）再刷新列表。WebSocket 广播时的会话吊销检查改为每客户端 30 秒一次。
- 前端构建产物预生成 `.br` / `.gz`，服务端优先发送压缩版本（入口 JS 426 KB → br 116 KB）；`/assets/` 下带哈希的文件 `Cache-Control: public, max-age=31536000, immutable`，`index.html` 仍为 `no-store`。

### 修复（界面）
- 新浏览器首次登录后主界面卡在半路（侧栏和顶栏右移）：系统设置「页面切换动画」为「普通」时，动画中途切换模式导致横向位移被冻结。淡入淡出动画补上 `x: 0`；每次切换开始时锁定动画模式；页面切换模式缓存在本地，登录后第一次切换就用正确的动画；去掉页面容器常驻的 `will-change: transform`。

### 安全
- 分享访问令牌不再出现在图片 URL 和响应体里。输对分享密码后，服务端写入 HttpOnly Cookie `mp_share`（Path 限定在 `/api/v1/shares/<token>/`，到分享过期时失效），分享图片只在输过密码的浏览器里能打开，复制图片地址到其他浏览器会返回 404。旧的 `?accessToken=` 参数不再被接受。新增 `GET /api/v1/shares/:token/session`，同一浏览器刷新分享页时免重输密码。

### 修复
- 扫描互斥：启动扫描、手动扫描、目录监听增量扫描、单图集重扫经进程内扫描协调器串行执行，修复并发扫描同一新目录时 `UNIQUE constraint failed: albums.source_path`；写库时按 source_path 兜底复用已有记录。
- 内容未变的图集重扫不再刷新 `updated_at`（“最近更新”排序不再被一次重扫打乱）。
- 手动扫描合并：同一图库或全量扫描已在排队/执行时，`POST /api/v1/scan` 返回已有任务（`alreadyRunning: true`）。

### 功能
- 图集列表与图集内图片支持游标分页：响应 `pagination.nextCursor`，请求带 `cursor` 续读；并发新增/相同排序值时不重不漏。`page` 参数保持兼容。非法或与排序不一致的游标返回 400（code 4012）。
- 迁移 0005：为游标分页新增 `(col, id)` 复合索引并替换 0002 中的旧排序索引（幂等）。
- `LIBRARY_ROOTS` 此前只被解析、没有生效。现在启动时会把其中存在的目录自动登记为图库目录并触发首次扫描；只新增，不改动已登记或已禁用的目录，不存在的路径会在日志里警告。

### 修复（界面）
- 没有指针设备（`pointer: none`，如无头浏览器、部分电视）时，桌面侧栏会盖住内容区：侧栏让位的 CSS 条件改为与 `useMobile()` 互补。

### 文档
- README 重写：完整功能、截图、部署（Compose / NAS / 源码构建 / 反向代理）、升级备份与常见问题。
- README 按 UI v2 和游标分页更新：首页、侧栏分组、无限滚动、两套主题与自定义背景、扫描排队；截图全部重拍（新增全部相册、外观设置、玫瑰纸感主题）；升级与备份补充数据库版本 5、背景图目录和镜像加速源缓存 `latest` 的说明。
- 新增 Docker Hub 仓库说明 `docs/dockerhub.md`（快速开始、标签、数据卷、环境变量、NAS、反向代理、升级备份、常见问题），CI 在 main 发布镜像后用 `peter-evans/dockerhub-description` 自动同步，并设置简短描述。
- Android 客户端 API 说明补充 `cursor` / `nextCursor`；主题设计文档的已知限制同步到游标分页之后的状态。

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
