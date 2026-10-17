# Moment Pic 五项优化交付记录

日期：2026-10-18；执行者：Codex。按任务书顺序在 main 实施，各项验证后独立本地提交，不推送。

## 环境与审批

- 所有命令显式设置 `PATH=/opt/data/tools/node22/bin:$PATH`、`NODE_ENV=test`；测试使用 TMPDIR 下的临时目录，并由 `scripts/test-isolation.mjs` 隔离 SQLite、配置、缓存和媒体。
- 实施数据库改动前已完整阅读 `/opt/data/cache/momentpic-opt-dba-review.md`。不访问真实数据库/生产、不读取凭据、不修改 docs 外历史记录。
- 审批内部存在矛盾：§8 要求 4192 行单事务，而 §1.1/§7 硬约束每批 ≤1000 行。本实现遵守硬约束，4192 行使用 5 个事务（测试真实计数）。媒体 I/O 不在事务内。
- RAR/CBR 解码依赖与 worker 不变；本期头部探测只覆盖 folder/ZIP，CBR/RAR/7z 仍可在生成缩略图时沿既有流程获取尺寸。

## 1. 增量扫描与复用（已验证）

文件：`services/library-scanner.ts`、`services/directory-watcher.ts`、新增 `services/incremental-scan.ts`、`repositories/album-repository.ts`、`lib/paths.ts`、`lib/logger.ts`（均在 apps/server/src 下）。测试：`services/incremental-scan.test.ts`、`services/library-scanner-safety.test.ts`、`repositories/album-scan-status.test.ts`。

- 每 root 累积原始事件路径，1024 条上限，溢出回退全根扫描；同时规范化存量路径与事件路径，在同根 Map 匹配文件/最近祖先。按 DBA 审定，任何无法定位事件都回退（包括新图片和删除事件）。散图目录中新 ZIP 不被父图集匹配掩盖。
- 定向扫描每批 ≤200 图集合并提交，失败单图保留旧索引；目录/归档消失由可读祖先确认后清理，目录空图集清理；整轮只执行一次后置任务。
- folder 仍 stat 每张图，size+mtime 字符串一致且宽高已知时复用尺寸；归档 mtime 与已存指纹有效时完全跳过打开，不重算指纹、不写回空尺寸。
- 状态每批 ≤1000 行，NULL 安全比较跳过未变行，不刷新 albums.updated_at。

新增测试名：

- `单文件事件只重扫对应图集，同批路径去重且不调 scanLibrary`
- `无法定位的 add/unlink/addDir/unlinkDir 事件回退整根扫描`（四个独立用例）
- `目录事件匹配最近祖先，事件集合溢出则回退`
- `散图目录中的新归档仍回退以发现新图集`
- `连续扫描未变更图集：第二次 sharp.metadata 与 ZIP 打开次数均为零`
- `定向批量重扫删除空图集和消失的目录，单图失败保留旧索引且不阻断其他图集`
- `4192 行状态更新按 DBA 上限分 5 个事务，重复状态零写入且不改 updated_at`

复用回归：`目录 mtime 不变时全量扫描验证子文件元数据和集合，更新尺寸和缓存版本`，覆盖新增、删除及尺寸改变；既有损坏归档、stat 失败、根目录 EIO/EACCES/ENOENT 测试均通过。

验证：`npm run test:server` 基线 136/136，修改后 146/146，0 失败；`npm run build:server` 通过；最终统计调整后的 incremental-scan 定向测试 7/7。完整日志：`/opt/data/cache/momentpic-opt-step-1-tests.log`。

## 待验证项

后续四项尚未交付；Docker 未构建，镜像体积和镜像内运行效果未验证；浏览器验证在 UI 实现后记录。

## 2. 等比缩略图与有界尺寸回填（实现及自动验证完成，缺浏览器验证）

文件（apps/server/src）：`services/thumbnail-options.ts`、`services/thumbnail-service.ts`、`services/thumbnail/image-variant-generator.ts`、新增 `services/thumbnail/image-header-probe.ts` 和 `header-dimensions.ts`、`services/archive.ts`、`services/archive/zip-reader.ts`、`services/library-scanner.ts`、`services/album-service.ts`、`repositories/album-repository.ts`、`routes/assets.ts`。前端：`components/Polaroid.tsx`、`components/AlbumDetailScreen.tsx`、新增 `lib/asset-thumbnail.ts`。

- cover 默认保持首页封面，coverUrl 显式带 fit；inside 全链路进入 v5 cacheKey 与实际 Sharp resize，旋转先归一化。规范缩略图 DB 记录仅存 cover，inside 使用独立文件缓存，非法 fit 返回 400。
- JPEG SOF0/1/2/9/10、PNG IHDR、GIF、WebP VP8/VP8L/VP8X、BMP 头部解析；支持头部中的 EXIF 旋转，不解码像素。文件使用 open/read/close，ZIP 使用现有 archive lease、列表/条目限制，最多返回 128KB 即销毁流并关闭归档。超过头部范围或不支持的格式保留未知尺寸，后续正常缩略图生成仍可补齐。
- 新/变更 ZIP 顺带探测；每次扫描图集和分页各有 3 秒总期限，全局并发 ≤4，单资产版本 in-flight 去重，失败负缓存 10 分钟且最多 10000 条。超时取消并停止新任务，返回已完成结果；RAR/CBR/7z 不执行本期探测。
- 当页 JS 过滤、不改变分页 SQL；条件写回每批 ≤500 行，只更新缺失尺寸，保留 thumbnail_key，不刷新 albums.updated_at，写前检查资产版本防止重扫竞态。
- 详情缩略图使用 inside/object-contain，渲染前用已知宽高预留 aspect-ratio，未知时方形；图片 load 不触发比例更新。
- v4 → v5 使旧缓存自然失效，升级后首次访问会重新生成缩略图；无数据迁移或全量回填。

新增测试文件/测试名：

- `services/thumbnail/image-header-probe.test.ts`：`头部探测 jpeg/png/gif/webp 返回真实图片尺寸`（4例）、`JPEG EXIF orientation 6 归一化宽高`、`JPEG SOF c0/c1/c2/c9/ca 有界解析`（5例）、`BMP 负高度与 OS/2 头部解析`、`WebP VP8 /VP8L/VP8X 分支解析`（3例）、`损坏、截断和 128KB 以后的尺寸不被误识别`。
- `services/thumbnail/header-dimensions.test.ts`：`分页探测跨请求并发最多 4，同资产 in-flight 合并`、`分页整体期限取消正在读取的头部，停止剩余项并返回已有结果`、`失败负缓存按版本生效，已知尺寸与 RAR/7z 不探测`。
- `services/archive/zip-reader.test.ts`：`ZIP 头部读取截断 128KB 并释放预算，支持取消、超时和条目限制`。
- `services/library-scanner-safety.test.ts`：`新 ZIP 扫描填尺寸，旧 NULL 仅按当页回填且失败不写库、不改缩略图键`（同时断言查询计划使用既有 idx_assets_album_sort）。
- `services/thumbnail-service.test.ts`：`inside 缩略图保留原图比例，cover/inside 使用不同 v5 缓存文件且仅 cover 入库`（真实 Sharp 文件 metadata）。
- `routes/assets.test.ts`：`thumbnail fit 白名单拒绝非法值，cover/inside 可通过协议校验`。
- `apps/web/src/lib/asset-thumbnail.test.ts`：`详情缩略图使用原图比例，缺失或非法尺寸预留方形`、`详情 inside 覆盖旧 fit 并保留其他查询参数`。

验证：`npm run test:server` 167/167，之后补充 fit 协议用例并运行 `node --import ./scripts/test-isolation.mjs --import tsx --test apps/server/src/routes/assets.test.ts` 4/4；`npm run build:server`、`npm run build:web`、`npx tsc --noEmit -p apps/web/tsconfig.json` 通过；`npm run test:web` 最终 87/87。日志：`/opt/data/cache/momentpic-opt-step-2-tests.log`。中间 SSR 测试因 react-cool-img 在 Node 下默认导出互操作失败（85/86）；未掩盖失败，改为测试实际使用的比例/URL selector 后通过。

浏览器：实际尝试 playwright-core 启动本机 Chromium，得到 `executable doesn't exist`；安装目录只有 ABOUT/LICENSE。未执行真实浏览器视觉/滚动 CLS 验证，不能将“首屏与滚动无跳动”标为完全验收。自动测试只能确认预留比例逻辑；最终仍需有浏览器环境验证。
