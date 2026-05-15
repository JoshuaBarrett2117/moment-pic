# 全量重构机会扫描报告

日期：2026-05-15  
执行者：Codex  
范围：前端、后端、Rust 子工程、Docker/Compose、依赖、测试、数据产物、文档与本地验证脚本。

## 1. 扫描摘要

本轮未发现前后端源码存在循环 import；服务端源码依赖方向整体保持 `routes -> services -> repositories -> db`。但仓库仍存在三类重构机会：

1. 发布与仓库卫生：数据产物、重复 lockfile、机器路径、未使用依赖、遗留技术路线。
2. 前端架构：`App`、`GalleryScreen`、`SmartAlbumSettingsPanel`、`ViewerGallery` 仍承担过多职责。
3. 后端架构：媒体读取、缩略图生成、图库扫描、智能相册仍是偏过程式大服务，下一步应按 adapter/job/policy/repository 边界继续拆。

## 2. P0：上线前应优先处理

| 编号 | 问题 | 证据 | 风险 | 建议 |
| --- | --- | --- | --- | --- |
| P0-01 | 仓库跟踪运行数据与缓存产物 | `git ls-files` 命中 `apps/server/data/index.json`、`apps/server/prisma/data/gallery.db`、`data/cache/98d64c...jpg` | 产物污染版本库，数据路径含本机信息，后续 diff 噪声大 | 从 Git 移除已跟踪运行数据，保留 `.gitkeep` 或样例 fixture；补充 `.gitignore` 覆盖 `apps/server/data/**`、`data/cache/**` |
| P0-02 | 存在重复 lockfile | `package-lock.json` 与 `apps/web/package-lock.json` 均被跟踪 | npm workspaces 下双 lockfile 易导致依赖解析不一致 | 保留根 `package-lock.json`，删除 workspace 子 lockfile |
| P0-03 | docker-compose 绑定了个人机器路径 | `docker-compose.yml` 含 `C:/Users/a3875/Pictures/test`、`Y:/其他/PIC` | 其他环境无法直接启动，发布配置不可复用 | 改为注释示例或 `.env.example`，compose 默认仅挂载命名卷/通用路径 |
| P0-04 | Rust 测试门禁不可执行 | `npm run test:rust` 依赖本机 `cargo`，当前环境不可用 | 根测试未纳入 Rust，Rust 子工程质量无法闭环 | 安装 toolchain 后补跑；或在根脚本中检测 cargo，不可用时明确跳过并输出原因 |
| P0-05 | API 客户端尝试删除 HttpOnly cookie | `apps/web/src/lib/api.ts` 中设置 `document.cookie = ... HttpOnly` | 浏览器不能通过 JS 设置/清除 HttpOnly，语义误导 | 删除该行，401 时只清理前端态并请求 `/auth/logout` 或依赖服务端清 cookie |
| P0-06 | 登录链路绕开统一 API 客户端 | `LoginScreen.tsx` 直接 `fetch('/api/v1/auth/login')`，同时存在 `useAuth.ts` | 认证错误处理、cookie、拦截器行为不统一 | `LoginScreen` 使用 `useAuth` 或统一 `auth-session` 服务 |
| P0-07 | 测试依赖本机真实归档路径 | `archive.test.ts` 含 `C:/Users/a3875/Pictures/test*` | 其他机器测试不稳定，CI/交付环境不可复现 | 将真实归档测试改为可选 integration；默认使用临时 fixture 生成 |

## 3. P1：架构主干重构

### 3.1 前端

| 编号 | 问题 | 证据 | 建议 |
| --- | --- | --- | --- |
| P1-01 | `App.tsx` 是全局编排中心 | 约 548 行，包含认证校验、导航、数据预取、历史记录、页面切换和大量 props 分发 | 拆 `AuthGate`、`AppRouterShell`、`GalleryRouteController`、`PageTransitionFrame` |
| P1-02 | `GalleryScreen.tsx` 同时承载三种图库模式 | 普通相册、智能相册、目录相册均在同一组件分支渲染 | 拆 `GalleryToolbar`、`GalleryHeader`、`GalleryEmptyState`、`AlbumCard`、`SmartAlbumCard`、`DirectoryNodeCard` |
| P1-03 | `SmartAlbumSettingsPanel.tsx` 仍是大表单组件 | 约 551 行，混合规则编辑、AI 配置、重建任务、测试连接、删除确认 | 拆 `SmartAlbumRuleEditor`、`AiConfigForm`、`RuleList`、`RebuildTaskStatus` |
| P1-04 | `ViewerGallery.tsx` 仍混合状态机与 UI | 约 545 行，含键盘、鼠标、触摸、预加载、结束提示、工具栏 | 拆 `useViewerControls`、`useViewerGestures`、`ViewerToolbar`、`ViewerEndPrompt` |
| P1-05 | `Sidebar.tsx` 同时处理导航、图库根目录、移动端展开 | 约 264 行，和 `GalleryScreen` 强耦合 | 拆 `SidebarNav`、`LibraryRootList`、`ScanActions`、`MobileSidebarShell` |
| P1-06 | `useSystemConfig` 被多个页面各自拉取 | `App`、`GalleryScreen`、`AlbumDetailScreen`、`useSettingsConfigForm` 都调用配置拉取 | 建立 `SystemConfigProvider`，页面只消费上下文，设置页负责更新后刷新 |
| P1-07 | 前端路由/导航直接依赖 `window` 与 `localStorage` | `gallery-navigation.ts` 直接读写 URL、history、storage | 抽 `browserNavigationAdapter`，纯状态机与副作用分离 |
| P1-08 | `useScan` 与 `useLibraryScan` 功能重复 | 两个 hook 都实现扫描/轮询，后者更完整 | 删除或合并 `useScan`，统一扫描任务模型 |
| P1-09 | 浏览器原生 `confirm` 分散使用 | `SettingsScreen.tsx`、`SmartAlbumSettingsPanel.tsx` | 改为统一确认弹窗 hook，便于测试和移动端体验一致 |
| P1-10 | API DTO 手写双端同步 | `apps/web/src/types/api.ts` 与 `apps/server/src/types/dto.ts` 分离维护 | 建立共享 DTO 包或生成脚本，避免字段漂移 |

### 3.2 后端

| 编号 | 问题 | 证据 | 建议 |
| --- | --- | --- | --- |
| P1-11 | `archive.ts` 仍是多协议巨型 adapter | ZIP、CBR、7z、stream、buffer、7z 命令执行都在一个文件 | 拆 `archive-readers/zip-reader.ts`、`cbr-reader.ts`、`sevenzip-reader.ts`、`archive-reader-factory.ts` |
| P1-12 | `thumbnail-service.ts` 混合 DB、缓存、Sharp、降级 | 读取原图、生成缩略图/预览、写 DB、内存去重都在一个 service | 拆 `image-source-service`、`image-variant-cache`、`sharp-variant-generator`、`thumbnail-orchestrator` |
| P1-13 | `library-scanner.ts` 扫描完成直接重建智能相册 | `scanLibrary` 和 `rescanAlbum` 结尾调用 `rebuildSmartAlbums()` | 改为事件/任务编排：扫描发布 `LibraryScanned`，智能相册订阅或由 job runner 触发 |
| P1-14 | `smart-album-service.ts` 仍混合 DTO、AI runtime、规则匹配、持久化 | 约 607 行，含 OpenAI 请求、规则匹配、DTO 映射、CRUD | 继续拆 `smart-album-query-service`、`smart-album-rebuild-engine`、`ai-cluster-provider`、`dto-mapper` |
| P1-15 | routes 缺统一 schema/validator | 多处 `request.query as`、`request.body as`、手动 `Number(query.page)` | 引入 Fastify schema 或轻量 zod/typebox，统一 query/body 校验与错误响应 |
| P1-16 | 后台任务状态只存在内存 Map | `scan.ts`、`smart-album-rebuild-service.ts` 使用进程内 Map | 重启丢任务状态，多实例不可用 | 抽 `TaskStore` 接口，短期内存实现，后续 SQLite 实现 |
| P1-17 | `directory-watcher` 与扫描器/WS 强耦合 | watcher 直接调用 `scanLibrary` 与 `wsService` | 拆事件总线或 callback adapter，watcher 只发布文件变更 |
| P1-18 | `album-service` 有 TTL 内存缓存但缺集中失效策略 | `albumListCache` 仅局部清理，跨扫描/删除/更新靠手动调用 | 抽 `AlbumListCache` 并统一在 repository 写操作后失效 |

## 4. P2：维护性与生态清理

| 编号 | 问题 | 证据 | 建议 |
| --- | --- | --- | --- |
| P2-01 | 前端依赖包含疑似未使用包 | `@google/genai`、`express`、`dotenv`、`photoswipe`、`react-viewer` 未在源码 import；CSS 仍有 `.react-viewer-*` 遗留样式 | 删除未使用依赖与遗留 CSS，降低安装体积 |
| P2-02 | 构建依赖放在 dependencies | `@vitejs/plugin-react`、`@tailwindcss/vite` 位于 web dependencies | 移入 devDependencies |
| P2-03 | 服务端依赖包含遗留路线 | `@prisma/client` 仅 `db/client.ts` 引用；`node-7z` 未见源码使用 | 明确 Prisma 去留；若不用 Prisma 与 node-7z，删除依赖、client、schema 或转为未来计划文档 |
| P2-04 | `sqlite-store.ts` 成为兼容聚合层 | 测试仍从 `services/sqlite-store.ts` 导入 repository 函数 | 测试逐步改为直接导入 repository；最终删除聚合层 |
| P2-05 | `index-store.ts` / `IndexStore` 似乎是旧 JSON store | 源码仅定义读写 JSON store，主流程已经使用 SQLite | 确认无运行调用后删除 |
| P2-06 | `mock-data.ts` 似乎是旧样例数据 | 未见主流程引用 | 确认无运行调用后删除或迁移到测试 fixture |
| P2-07 | Dockerfile 与 Dockerfile.arm64 高度重复 | 两个文件几乎相同，仅 platform 参数不同 | 合并为单 Dockerfile + `ARG TARGETPLATFORM`，workflow 用 buildx 指定平台 |
| P2-08 | Dockerfile 写死 USTC Debian 镜像 | 构建阶段修改 sources.list | 非大陆网络或镜像异常时构建失败 | 改为可选 `APT_MIRROR` build arg |
| P2-09 | Dockerfile `VOLUME` 未覆盖 SQLite/索引文件语义 | `SQLITE_PATH=/data/gallery.sqlite`，但 Dockerfile 声明 `/data/library`、`/data/cache` | 运行镜像建议统一声明 `/data` 或依赖 compose volume |
| P2-10 | `vite.config.ts` 暴露 `process.env.GEMINI_API_KEY` | 前端未见使用，且把 API key 注入浏览器有泄漏风险 | 删除该 define，AI 能力统一走后端 |
| P2-11 | `apps/server-rs` 是独立健康检查 demo | Rust 子工程仅 health route，未接入主服务 | 明确作为实验项目、删除、或制定迁移路线；避免主门禁长期阻塞 |
| P2-12 | `.dockerignore` 忽略 docs/server-rs/samples，但仓库仍跟踪其他本地产物 | 构建上下文和 Git 跟踪策略不一致 | 梳理 `.gitignore`、`.dockerignore`、样例 fixture 策略 |
| P2-13 | 本地浏览器脚本较大且混合 API/浏览器流程 | `apps/server/scripts/browser-check.mjs` 约 278 行 | 拆 `api-client`、`fixtures`、`browser-flows`，并参数化账号/路径 |
| P2-14 | 文档存在旧路径与过时结论 | 多篇文档仍引用 `sqlite-store.ts`、旧架构、绝对路径 | 增加 docs/index 与状态标记：active/archived/outdated |

## 5. 可继续拆分的大文件清单

| 文件 | 行数约 | 建议拆分方向 |
| --- | ---: | --- |
| `apps/server/src/services/archive.ts` | 633 | protocol readers + process runner + body adapter |
| `apps/server/src/services/smart-album-service.ts` | 607 | query / rebuild / AI provider / DTO mapper |
| `apps/web/src/components/GalleryScreen.tsx` | 593 | toolbar / header / cards / empty / grid |
| `apps/server/src/routes/smart-albums.test.ts` | 584 | route test fixtures + rule scenarios |
| `apps/web/src/components/SmartAlbumSettingsPanel.tsx` | 551 | AI config / rule editor / rule list / task panel |
| `apps/web/src/App.tsx` | 548 | auth gate / router shell / page renderer |
| `apps/web/src/components/ViewerGallery.tsx` | 545 | controls hook / gestures hook / subcomponents |
| `apps/server/src/services/thumbnail-service.ts` | 526 | source reader / cache repository / generator / orchestrator |
| `apps/server/src/services/library-scanner.ts` | 520 | folder scanner / archive scanner / diff planner / job orchestrator |
| `apps/server/src/services/smart-album-ai-rule-builder.ts` | 443 | tokenizer / heuristic candidate builder / rule record builder |
| `apps/web/src/app/gallery-navigation.ts` | 390 | pure navigation state + browser adapter |

## 6. 建议执行顺序

1. P0 仓库卫生：移除跟踪数据、删除子 lockfile、清理 compose 个人路径、统一认证 API 调用。
2. 前端主干：先拆 `App.tsx` 与 `GalleryScreen.tsx`，降低后续 UI 变更冲突。
3. 后端主干：先拆 `archive.ts` reader factory，再拆 `thumbnail-service.ts` orchestrator。

## 8. 2026-05-15 执行状态

- 已完成 P0：仓库运行产物清理、重复 lockfile 删除、compose 个人路径移除、Rust 测试门禁可跳过、认证链路统一、真实归档测试 fixture 化。
- 已完成 P2 主要项：未使用依赖清理、Prisma/旧 JSON store/mock 路线删除、Dockerfile 合并、Vite API key define 移除、旧 viewer CSS 清理。
- 已推进 P1 主干：`App.tsx` 抽出页面转场；`GalleryScreen.tsx` 拆分 Header/Filters/Breadcrumbs/Grid；`archive.ts` 拆为协议 reader；`thumbnail-service.ts` 抽出原图来源读取；`library-scanner.ts` 抽出扫描后任务编排；`ViewerGallery.tsx` 与 `SmartAlbumSettingsPanel.tsx` 完成第一批 UI/纯逻辑拆分。
- 验证结果：`npm test` 通过；`npm run test:rust` 在无 cargo 环境明确跳过并退出 0。
- 后续可继续深拆但不阻塞当前本地上线标准：`SmartAlbumSettingsPanel` 表单 UI、`ViewerGallery` 手势 hook、`smart-album-service` AI provider/query/rebuild mapper。

## 9. 2026-05-15 继续执行状态

- 已继续推进 P1-07：导航模块认证态改为复用 `auth-session`，保留图库筛选持久化 localStorage。
- 已继续推进 P1-04：`ViewerGallery` 画质 session 存取抽到 `viewer-quality-session` 并补测试。
- 已继续推进 P1-14：`smart-album-service` DTO mapper 抽到 `smart-album-mappers` 并补测试。
- 已继续推进 P1-15：新增 `request-query`，albums/assets/smart-albums 路由统一解析分页、枚举与可选字符串。
- 验证结果：`npm test` 通过；`npm run test:rust` 在无 cargo 环境明确跳过并退出 0。

## 10. 2026-05-15 继续推进状态

- 已继续推进 P1-04：`ViewerGallery` 抽出 `ViewerImageStage`，主组件进一步聚焦状态机和编排。
- 已继续推进 P1-14：`smart-album-service` 抽出 `smart-album-ai-candidates`，AI runtime、prompt、候选生成和连接测试独立成 provider 模块。
- 新增测试：AI provider runtime/prompt/无 Token 短路测试。
- 验证结果：`npm test` 通过；`npm run test:rust` 在无 cargo 环境明确跳过并退出 0。

## 11. 2026-05-15 继续推进状态

- 已继续推进 P1-04：`ViewerGallery` 抽出 `useViewerPreloader` 与 `useViewerDesktopControls`，预加载、键盘和滚轮副作用从主组件移出。
- 已继续推进 P1-03：`SmartAlbumSettingsPanel` 抽出 `SmartAlbumRebuildPanel` 与 `SmartAlbumRuleList`，重建状态区和规则列表区独立维护。
- 验证结果：`npm test` 通过；`npm run test:rust` 在无 cargo 环境明确跳过并退出 0。

## 12. 2026-05-15 继续推进状态

- 已继续推进 P1-03：`SmartAlbumSettingsPanel` 抽出 `SmartAlbumAiConfigPanel`，AI 配置表单与连接测试 UI 独立维护。
- 验证结果：`npm test` 通过；`npm run test:rust` 在无 cargo 环境明确跳过并退出 0。

## 13. 2026-05-15 继续打磨状态

- 已继续推进 P1-04：`ViewerGallery` 抽出 `useViewerGestures`，移动端手势、桌面拖拽、缩放和旋转状态独立维护。
- 已继续推进 P1-08：`thumbnail-service.ts` 拆出 Sharp runtime、生成并发槽位、资产尺寸同步和图片变体生成器，入口层收敛到对外 API 编排。
- 已继续推进 P1-03：`SmartAlbumSettingsPanel` 抽出 `SmartAlbumRuleEditor`，规则编辑表单独立维护。
- 已继续推进 P1-07：`App.tsx` 抽出智能相册成员列表筛选/排序纯函数，并新增前端单测。
- 验证结果：`npm test` 通过；`npm run test:rust` 在无 cargo 环境明确跳过并退出 0。

## 14. 2026-05-15 App 与 GalleryScreen 继续拆分状态

- 已继续推进 P1-07：`App.tsx` 抽出 `useAppAuthBootstrap`，启动鉴权恢复和初始导航恢复从根组件移出。
- 已继续推进 P1-02：`GalleryScreen` 抽出 `useChunkedAlbumRendering` 与 `useGalleryScrollRestoration`，分块渲染、加载更多观察器和滚动恢复独立维护。
- 已继续推进 P1-02：`GalleryScreen` 抽出 `gallery-screen-state`，筛选状态、排序选项、标题和空态文案变为纯函数，并新增单测。
- 验证结果：`npm test` 通过；`npm run test:rust` 在无 cargo 环境明确跳过并退出 0。

## 15. 2026-05-15 GalleryAlbumGrid 继续拆分状态

- 已继续推进 P1-02：`GalleryAlbumGrid` 拆出 `AlbumCard`、`SmartAlbumCard`、`DirectoryNodeCard`，卡片 UI 按数据类型独立维护。
- 已继续推进 P1-02：`GalleryAlbumGrid` 拆出 `GalleryEmptyState`、`GalleryLoadingAlbumCards`、`gallery-card-motion`、`gallery-album-types`。
- 已继续推进 P1-02：新增 `gallery-album-card-kind` 纯函数和测试，覆盖图集卡片分派逻辑。
- 验证结果：`npm test` 通过；`npm run test:rust` 在无 cargo 环境明确跳过并退出 0。

## 16. 2026-05-16 App 图库模型与筛选动作拆分状态

- 已继续推进 P1-07：`App.tsx` 抽出 `gallery-screen-model`，图库页数据装配和下一个图集计算转为纯函数，并新增单测。
- 已继续推进 P1-07：`App.tsx` 抽出 `useGalleryFilterActions`，分页、排序、关键词、来源类型、图库根目录和模式切换筛选动作集中维护。
- 验证结果：`npm test` 通过；`npm run test:rust` 在无 cargo 环境明确跳过并退出 0。
4. 任务与事件：把扫描、智能相册重建、目录 watcher 的隐式调用改为显式 job/event。
5. 依赖清理：删除未使用依赖与遗留 Prisma/JSON store，完成后跑全量测试与 Docker 构建验证。

## 7. 已执行的扫描命令摘要

```powershell
rg --files
rg "TODO|FIXME|console\.|\bany\b|@ts-ignore|fetch\('/api|localStorage|sessionStorage|setInterval" -n .
git ls-files | rg "apps/server/data|data/|package-lock|sqlite-store|mock-data|index-store|Dockerfile"
rg "request\.(query|params|body) as" apps/server/src/routes apps/server/src/services -n
rg "@google/genai|photoswipe|react-viewer|express|dotenv|@prisma/client|node-7z" apps package.json -n
```
