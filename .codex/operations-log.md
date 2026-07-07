# operations-log

## 2026-04-13 Codex

- 任务：将图库默认排序调整为按更新时间倒序，并确认高级设置轮询默认开启、间隔为 60000 毫秒�?
- 处理�?
  - 修改后端 `listAlbumsDb` 与相册列表缓存默认排序为 `updatedAt desc`�?
  - 修改前端图库初始筛选与 URL 同步规则，默认值统一�?`updatedAt desc`�?
  - 复核高级设置默认值，现有数据库初始化和界面兜底均已满足“默认开�?+ 60000”�?
- 验证�?
  - `npm run build --workspace @moment-pic/server` 通过�?
  - `npm run build --workspace @moment-pic/web` 失败，环境中缺少前端依赖可执行文件�?
  - `npm run lint --workspace @moment-pic/web` 失败，当前环境缺�?`react`、`vite` 等依赖解析�?
## 2026-04-16 Codex

- 任务：将相册页图库列表尺寸调大�?- 处理：调�?`apps/web/src/components/GalleryScreen.tsx` 中网格最小列宽、卡片内边距、封面间距，以及标题和数量字号�?- 验证：`npm run lint --workspace @moment-pic/web` 通过�?
## 2026-04-16 Codex

- 任务：将相册详情页资产列表尺寸也调整�?`220px` 起步�?- 处理：修�?`apps/web/src/components/AlbumDetailScreen.tsx` 的资产网格为自适应 `minmax(220px, 1fr)`，并同步骨架屏�?- 验证：`npm run lint --workspace @moment-pic/web` 通过�?
## 2026-04-16 Codex

- 任务：把相册页与相册详情页的卡片宽度做成系统配置项�?- 处理：新�?`albumListItemMinWidth` �?`albumDetailItemMinWidth` 两个系统配置字段，接入后�?SQLite 初始化、API、前端设置页和两个列表页面�?- 验证：`npm run lint --workspace @moment-pic/web`、`npm run build --workspace @moment-pic/server` 通过�?
## 2026-04-16 Codex

- 任务：把相册页与相册详情页的卡片宽度拆成移动端和桌面端两套配置�?- 处理：新�?4 个系统配置字段，前端设置页改为分别编辑移动端/桌面端宽度，图库页与详情页按设备类型读取对应值�?- 验证：`npm run lint --workspace @moment-pic/web`、`npm run build --workspace @moment-pic/server` 通过�?
## 2026-04-18 Codex

- ���񣺵���Ƭˢ�����һ��ʱ��������ʾ��֧�ֽ�����һ��ͼ����
- ������
  - �޸� `apps/web/src/components/ViewerGallery.tsx`����ĩβѭ����ҳ��Ϊ�߽���ʾ���������������һͼ����ȷ��/ȡ��������
  - �޸� `apps/web/src/components/AlbumDetailScreen.tsx`���ѡ�������һ��ͼ����������Ӳ鿴��͸����������
  - �޸� `apps/web/src/App.tsx`������ǰͼ���б�������һͼ�� ID������ȷ�Ϻ��л���ȥ��
- ��֤��
  - `npm run lint --workspace @moment-pic/web` ͨ����
  - `npm run build --workspace @moment-pic/web` ͨ�������ڼ��е� circular chunk ���档


- ������֤������ `navigate` �������ͺ�`npm run lint --workspace @moment-pic/web` ͨ����
## 2026-04-18 Codex�����䣩

- �����޸��ֻ�����ʱ���ͼƬ�м��޷�����/��ʾ UI �����⡣
- ������
  - �� `apps/web/src/components/ViewerGallery.tsx` �У����ƶ��˽����ж��ӽ�����Ļ���ȸ�Ϊ�������豸���ж��������������ʶ��Ϊ����ˡ�
  - ������������л� UI ���߼��������Զ�����Ҳ���津���豸��Ч��
- ��֤��
  - `npm run lint --workspace @moment-pic/web` ͨ����
  - `npm run build --workspace @moment-pic/web` ͨ�������ڼ��е� circular chunk ���档
## 2026-04-18 Codex�����䣩

- ����ͬ���޸��ֻ�����������ҳ��Ҳ����������˵����⡣
- ������
  - �� `apps/web/src/hooks/useResponsive.ts` �� `useMobile` ��Ϊͬʱʶ��խ���ʹ������豸�������ֻ�Ҳ�ᰴ�ƶ�����Ⱦ��
  - `ViewerGallery` ��������ͳһ���ƶ����ж������ٵ���ά��һ���жϡ�
- ��֤��
  - `npm run lint --workspace @moment-pic/web` ͨ����
  - `npm run build --workspace @moment-pic/web` ͨ�������ڼ��е� circular chunk ���档
## 2026-04-18 Codex�����䣩

- �����ƶ��˿���ģʽ���ʵ��ؿ�ҳ�淶Χ��
- ������
  - ���� `useWideMobile`������ʶ����������豸�Ŀ������ֵ�λ��
  - `Sidebar` �ڿ����ֻ�����խ����������ȣ������������������
  - `GalleryScreen` �� `AlbumDetailScreen` �ڿ����ֻ�����������ܶȵ�������ȣ����ſ����������������ڱ߾ࡣ
- ��֤��
  - `npm run lint --workspace @moment-pic/web` ͨ����
  - `npm run build --workspace @moment-pic/web` ͨ�������ڼ��е� circular chunk ���档
## 2026-04-18 Codex�����䣩

- ���������ƶ��˺�����¼ҳ�档
- ������
  - ��д `apps/web/src/components/LoginScreen.tsx`���ú��������豸���ֵ����ƶ��˲��֣����ٹ����е� `md:` ���������
  - ����ʱ�����Ҳ�װ���������ſ���¼��Ƭ��˵�������ڱ߾�ͱ���ߴ硣
- ��֤��
  - `npm run lint --workspace @moment-pic/web` ͨ����
  - `npm run build --workspace @moment-pic/web` ͨ�������ڼ��е� circular chunk ���档
## 2026-04-18 Codex����β��

- ������
  - ��� `ViewerGallery` �ĳ�ͻ��������д������ָ����һ��ͼ����ʾ���ƶ��˴���������
  - ���� `GalleryScreen`��`LoginScreen`��`Sidebar` �������İ���
- ��֤��
  - `npm run lint --workspace @moment-pic/web` ͨ����
  - `npm run build --workspace @moment-pic/web` ͨ�������ڼ��е� circular chunk ���档
## 2026-05-09 Codex

- 任务：新增系统相册“目录相册”。
- 工具与降级：当前环境未提供 `sequential-thinking`、`shrimp-task-manager`、`code-index`、`exa` MCP；使用 `rg`、PowerShell、`update_plan`、`apply_patch` 和本地测试替代。
- 上下文收集：阅读 `library-scanner.ts`，确认文件夹图集和压缩包图集均通过扫描后写入 `albums.sourcePath`；阅读 `App.tsx`、`GalleryScreen.tsx`、`Sidebar.tsx`、`gallery-navigation.ts`，确认系统相册由前端视图状态和侧边栏入口组合实现。
- 实现：新增目录相册 service/API/hook，并接入前端导航、侧边栏、刷新与卡片渲染。
- 决策：不新增数据库表，目录节点命中已扫描 album 时进入图集详情；未命中时继续展示下一层目录树。

## 2026-05-09 Codex

- 任务：新增用于构建 ARM 架构镜像的 Dockerfile。
- 工具与降级：当前环境未提供 `sequential-thinking`、`shrimp-task-manager`、`code-index` MCP；使用 `rg`、PowerShell、`update_plan`、`apply_patch` 和 Docker 本地验证替代。
- 上下文收集：阅读 `Dockerfile`、`docker-compose.yml`、根 `package.json`、`apps/server/package.json`、`apps/web/package.json`，确认项目为 npm workspaces，现有镜像由前端构建、后端构建、运行镜像三个阶段组成。
- 实现决策：新增 `Dockerfile.arm64`，不改动既有 `Dockerfile`；所有阶段显式使用 `FROM --platform=linux/arm64 node:22-slim`，确保 `sharp`、`better-sqlite3`、Prisma 等原生依赖在 ARM64 目标平台安装或编译。

## 2026-05-09 Codex

- 任务：将页面跳转形式改为可配置，支持翻页滑动和常规淡入两种模式。
- 工具与降级：当前环境未提供 `sequential-thinking`、`shrimp-task-manager`、`code-index`、`exa` MCP；使用 `rg`、PowerShell、`update_plan`、`apply_patch` 和本地测试替代。
- 上下文收集：确认翻页式跳转由 `apps/web/src/App.tsx` 的 `AnimatePresence` 与 `motion.div` 控制；确认系统配置链路由 SQLite 初始化、`system-config` API、`useSystemConfig`、`useSettingsConfigForm` 和 `SettingsScreen` 组成。
- 实现：新增 `pageTransitionMode` 系统配置字段，默认 `page`；设置页增加“页面跳转形式”选择器；App 根据配置在左右滑动与短淡入淡出之间切换。
- 验证：`npm run lint --workspace @moment-pic/web`、`npm run build --workspace @moment-pic/server`、`npm run build --workspace @moment-pic/web`、`node --import tsx --test apps/server/src/services/sqlite-store.test.ts` 均通过。
- 追加调整：`Dockerfile.arm64` 使用 `ARG TARGETPLATFORM=linux/arm64` 和 `FROM --platform=$TARGETPLATFORM`，默认构建 ARM64，同时保留 Buildx 传入目标平台的能力。

## 2026-05-09 Codex

- 任务：调整 GitHub Actions，使提交触发 Docker 构建时同步构建 ARM64 镜像，并让 ARM64 tag 与常规 tag 区分。
- 上下文收集：阅读 `.github/workflows/docker.yml`，确认当前 workflow 使用 Docker Hub、`docker/metadata-action@v6` 生成常规 tags，并通过 `docker/build-push-action@v7` 构建推送默认平台镜像。
- 实现：新增 `docker/setup-qemu-action@v4` 初始化 ARM64 跨架构构建；新增 `Generate ARM64 tags` 步骤，将常规 tags 逐行转换为 `原tag-arm64`；新增 `Build and push ARM64 Docker image` 步骤，使用 `Dockerfile.arm64` 和 `platforms: linux/arm64` 构建推送。
- 标签策略：常规 tag 保持不变；ARM64 镜像使用 `-arm64` 后缀，例如 `latest-arm64`、`dev-arm64`、`1.2.3-arm64`、`sha-xxxx-arm64`。

## 2026-05-09 Codex

- 任务：排查页面跳转形式切换后不生效。
- 根因：设置页的 `useSettingsConfigForm` 未初始化拉取 `systemConfig`，导致 `savePageTransitionMode` 中 `systemConfig` 为 `null`，选择器只更新本地状态，没有调用 PATCH 保存。
- 修复：`useSettingsConfigForm` 初始化时调用 `fetchSystemConfig()`，确保所有配置保存路径都有后端配置上下文。
- 验证：API 直连 PATCH `pageTransitionMode` 可保存并读回；`npm run lint --workspace @moment-pic/web`、`npm run build --workspace @moment-pic/server`、`npm run build --workspace @moment-pic/web`、`node --import tsx --test apps/server/src/services/sqlite-store.test.ts` 通过。

## 2026-05-10 Codex

- 任务：手机端放大图片时支持拖动图片。
- 工具与降级：当前环境未提供 `sequential-thinking`、`shrimp-task-manager`、`code-index`、`exa` MCP；使用 `rg`、PowerShell、`update_plan`、`apply_patch` 和本地测试替代。`operations-log.md` 存在历史非 UTF-8 字节，`apply_patch` 无法读取，因此本条使用 PowerShell 追加，避免重写旧内容。
- 上下文收集：确认 `apps/web/src/components/ViewerGallery.tsx` 为大图查看器入口；桌面端已有 `scale > 1` 鼠标拖拽逻辑，移动端已有两指缩放和左右滑动切图，但单指触摸未更新图片 `position`。
- 实现：新增触摸拖拽起点引用；单指触摸在 `scale > 1` 时进入拖拽态并更新 `position`；拖动时阻止默认滚动并标记触摸变换，避免误触发左右切图或工具栏切换；两指缩放后剩余单指时重新校准拖拽起点。

## 2026-05-15 Codex

- 任务：继续深拆全部大文件并补充更细粒度测试，直到达到本地上线标准。
- 工具与降级：当前环境未提供 `sequential-thinking`、`shrimp-task-manager`、`code-index`、`exa` MCP；使用 `rg`、PowerShell、`apply_patch` 与本地测试/构建/冒烟替代。
- 实现：拆分 SettingsScreen、ViewerGallery、thumbnail-service、archive、library-scanner 的纯 UI/纯逻辑边界，新增对应细粒度测试。
- 验证：`npm test` 通过；服务端 46 个测试、前端 12 个测试、前端类型检查、服务端构建、前端构建均通过；本地 API 冒烟通过。
- 阻塞：`npm run test:rust` 因当前机器缺少 `cargo` 无法执行，需在 Rust toolchain 可用环境补跑。

## 2026-05-15 Codex 全量重构机会扫描

- 任务：扩大扫描范围，尽量一次性查出所有可重构代码与仓库级维护点。
- 范围：前端、后端、Rust 子工程、Docker/Compose、依赖、测试、数据产物、文档与本地验证脚本。
- 结果：新增 `docs/full-refactor-scan-2026-05-15.md`，按 P0/P1/P2 归类发布阻塞、架构主干和维护性清理项。
- 重点发现：跟踪数据产物、重复 lockfile、compose 个人路径、认证链路不统一、App/GalleryScreen/SmartAlbumSettingsPanel/媒体服务仍需继续拆分、未使用依赖与遗留 Prisma/JSON store 路线。

## 2026-05-15 Codex 按全量扫描文档执行重构

- 任务：按 `docs/full-refactor-scan-2026-05-15.md` 执行 P0/P1/P2 重构，并完成本地测试验证。
- 工具与降级：当前环境未提供 `sequential-thinking`、`shrimp-task-manager`、`code-index`、`exa` MCP；使用 `rg`、PowerShell、`apply_patch`、npm 本地测试/构建替代。
- 仓库卫生：移除已跟踪运行数据、SQLite 产物和缓存图片；保留 `.gitkeep`；删除 web 子 lockfile；补充 `.gitignore`。
- 配置清理：`docker-compose.yml` 移除本机绝对路径，改为 `LIBRARY_HOST_PATH`；合并 ARM64 Dockerfile 到主 Dockerfile；移除 Prisma 生成步骤和遗留 Docker ARM 文件。
- 依赖清理：删除 web 未使用依赖、server 遗留 Prisma/node-7z 依赖与旧 store/mock 文件；根 Rust 测试脚本增加 cargo 检测。
- 前端重构：统一认证会话工具；`App.tsx` 抽出 `PageTransitionFrame`；`GalleryScreen` 拆为 Header、Filters、Breadcrumbs、AlbumGrid；`ViewerGallery` 拆出 Toolbar 和 EndPrompt；智能相册规则草稿抽为纯函数并补测试。
- 后端重构：`archive.ts` 拆为 ZIP/CBR/7z reader、archive body adapter 与类型模块；`thumbnail-service` 抽出 original image source；`library-scanner` 抽出 post-scan task 编排。
- 验证：`npm test` 通过；`npm run test:rust` 在无 cargo 环境明确跳过并退出 0。

## 2026-05-15 Codex 继续执行剩余 P1 重构

- 任务：继续执行全量扫描文档中剩余可低风险落地的 P1 重构项。
- 前端：`gallery-navigation.ts` 统一使用 `auth-session`，移除导航模块对 `auth_token` 的直接读写；`ViewerGallery` 抽出 viewer 画质 session 工具并补测试。
- 后端：`smart-album-service` 抽出 `smart-album-mappers`，将规则 DTO 与 AI 配置 DTO 转换独立测试；新增 `request-query` 统一解析分页、枚举与可选字符串，并接入 albums/assets/smart-albums 路由。
- 验证：`npm test` 通过；`npm run test:rust` 在无 cargo 环境明确跳过。

## 2026-05-15 Codex 继续推进 AI Provider 与查看器拆分

- 任务：继续推进剩余 P1 深拆，优先处理 `smart-album-service` 和 `ViewerGallery`。
- 后端：新增 `smart-album-ai-candidates.ts`，将 OpenAI runtime、prompt 生成、AI 候选生成和 AI 连接测试从 `smart-album-service` 中抽出；新增 3 个 provider 单元测试。
- 前端：新增 `ViewerImageStage.tsx`，将大图画布、加载态、图片 transform 和鼠标拖拽事件承载从 `ViewerGallery` 中抽出。
- 修复：全量 `tsc` 暴露 `smart-album-service` 仍使用 `path.dirname`，补回 `node:path` import。
- 验证：`npm test` 通过；`npm run test:rust` 在无 cargo 环境明确跳过。

## 2026-05-15 Codex Viewer Hooks 与智能相册设置 UI 拆分

- 任务：继续推进剩余 P1 深拆，处理 `ViewerGallery` 副作用和 `SmartAlbumSettingsPanel` UI 大块。
- 前端：新增 `useViewerPreloader`，将相邻图片预加载副作用从 `ViewerGallery` 抽出；新增 `useViewerDesktopControls`，将桌面键盘和滚轮监听抽出。
- 前端：新增 `SmartAlbumRebuildPanel` 与 `SmartAlbumRuleList`，将自动整理重建状态区和规则列表区从 `SmartAlbumSettingsPanel` 抽出。
- 验证：`npm test` 通过；`npm run test:rust` 在无 cargo 环境明确跳过。

## 2026-05-15 Codex 智能相册 AI 配置面板拆分

- 任务：继续推进 `SmartAlbumSettingsPanel` 大组件拆分。
- 前端：新增 `SmartAlbumAiConfigPanel`，将 AI 自动归纳配置表单、连接测试按钮、保存按钮和连接摘要从主设置面板抽出。
- 主组件职责收敛：`SmartAlbumSettingsPanel` 保留数据状态、提交处理和子面板编排。
- 验证：`npm test` 通过；`npm run test:rust` 在无 cargo 环境明确跳过。

## 2026-05-15 Codex 继续打磨重构

- 目标：延续全量重构文档，继续降低大文件职责耦合并补充细粒度测试。
- 完成：`ViewerGallery` 抽出 `useViewerGestures`，保留移动端滑动、点按、双指缩放和桌面拖拽/缩放行为。
- 完成：`thumbnail-service.ts` 拆出 `sharp-runtime`、`generation-slot`、`asset-dimensions`、`image-variant-generator`，服务入口保留 ensureThumbnail/ensurePreview/openOriginalImage/warmupCoverThumbnails 对外契约。
- 完成：`SmartAlbumSettingsPanel` 抽出 `SmartAlbumRuleEditor`，规则编辑 UI 与设置面板流程控制分离。
- 完成：`App.tsx` 抽出 `smart-album-member-albums`，智能相册成员列表映射、过滤、排序变为可测试纯函数。
- 验证：`npm --workspace apps/web test`、`npm run lint:web`、`npm --workspace apps/server test`、`npm run build:server`、`npm test` 均通过；`npm run test:rust` 因无 cargo 按脚本成功跳过。

## 2026-05-15 Codex 继续打磨重构（二）

- 目标：继续降低前端根组件和图库页面职责耦合，优先选择可测试的纯逻辑与副作用 hook。
- 完成：`App.tsx` 抽出 `useAppAuthBootstrap`，启动鉴权恢复、登录态清理、初始 URL 恢复从根组件移出。
- 完成：`GalleryScreen` 抽出 `useChunkedAlbumRendering`，相册分块渲染与 IntersectionObserver 加载更多逻辑独立维护。
- 完成：`GalleryScreen` 抽出 `useGalleryScrollRestoration`，滚动位置保存/恢复独立维护。
- 完成：`GalleryScreen` 抽出 `gallery-screen-state`，筛选激活、排序选项、标题和空态文案变为纯函数，并新增测试。
- 验证：`npm --workspace apps/web test`、`npm run lint:web`、`npm test` 均通过；`npm run test:rust` 因无 cargo 按脚本成功跳过。

## 2026-05-15 Codex 继续打磨重构（三）

- 目标：继续拆分前端图库网格大组件，降低卡片 UI 与网格分派的耦合。
- 完成：`GalleryAlbumGrid` 拆出 `AlbumCard`、`SmartAlbumCard`、`DirectoryNodeCard`，三类卡片独立维护。
- 完成：拆出 `GalleryEmptyState` 与 `GalleryLoadingAlbumCards`，空态和加载骨架屏独立维护。
- 完成：拆出 `gallery-album-types` 与 `gallery-card-motion`，统一类型守卫、标签色和卡片动效配置。
- 完成：新增 `gallery-album-card-kind` 纯函数与单测，覆盖目录、智能相册、普通图集和 unsupported 分派。
- 验证：`npm --workspace apps/web test`、`npm run lint:web`、`npm test` 均通过；`npm run test:rust` 因无 cargo 按脚本成功跳过。

## 2026-05-16 Codex 下一轮重构

- 目标：继续降低 `App.tsx` 的页面数据装配和筛选动作耦合。
- 完成：新增 `gallery-screen-model`，将图库首页列表、加载态、分页、最近访问态、来源筛选可用性统一生成为页面模型。
- 完成：新增 `resolveNextAlbumId`，相册详情下一图集计算变为纯函数并覆盖边界测试。
- 完成：新增 `useGalleryFilterActions`，集中维护分页、排序、关键词、来源类型、图库根目录、智能相册/目录相册入口和目录节点筛选动作。
- 验证：`npm --workspace apps/web test`、`npm run lint:web`、`npm test` 均通过；`npm run test:rust` 因无 cargo 按脚本成功跳过。

## 2026-05-16 Codex 缩略图内存回归修复

- 任务：排查重构后 `/thumbnail`、`/preview` 可能返回 `Not enough memory` 的内存回归。
- 结论：原有 Sharp cache/concurrency 入口没有完全丢失，但重构后缓存命中补尺寸和普通文件生成链路存在额外整图 Buffer 读取，叠加较高请求闸门会放大内存峰值。
- 完成：`sharp-runtime` 将 Sharp cache 下调为 32MB/64 items，Sharp 并发降为 1，启用 `sequentialRead`，并在生成结束后释放 libvips cache。
- 完成：`generation-slot` 生成并发降为 1；`assets` 路由缩略图/预览请求闸门从 24/320 收紧到 8/160。
- 完成：`syncAssetDimensions` 不再在没有现成 Sharp 输入时读取原图，缓存命中路径不会为补宽高触发整图读入。
- 完成：新增 `readOriginalSharpInput`，普通文件直接向 Sharp 传路径，归档图片才使用 Buffer，减少 JS 堆峰值。
- 新增测试：覆盖普通文件 Sharp 路径输入、缺少宽高时尺寸同步不读取缺失原图。
- 验证：`npm --workspace apps/server test`、`npm run build:server`、`npm test` 均通过。

## 2026-05-16 Codex CBR/RAR 内存错误追溯与修复

- 任务：用户反馈仍出现 `Not enough memory`，要求追溯历史修复文档。
- 历史修复：找到提交 `967f27d Fix preview memory fallback`，当时通过 `/thumbnail`、`/preview` 生成失败后流式回源，以及 Sharp cache/concurrency 限制修复预览内存问题。
- 新根因：本次错误文本来自 `node-unrar-js` 的 `ERAR_NO_MEMORY`，不是 Sharp 自身抛出的错误；CBR/RAR 缩略图、预览和回源读取仍可能在 unrar wasm 解压阶段失败。
- 完成：`readCbrBuffer` 与 `readCbrStream` 改为复用项目已有 7z 读取器，避免 CBR/RAR 内容读取继续依赖 node-unrar-js 解压输出。
- 保留：CBR/RAR 列表解析暂继续使用 `node-unrar-js`，因为本次 500 发生在读取/回源链路；后续若扫描大 CBR 也触发同类错误，再把列表解析也迁移到 7z。
- 新增测试：`readArchiveEntryBuffer reads cbr entries through 7z extraction`、`openArchiveEntryBody streams cbr entries through 7z extraction`。
- 验证：`npm --workspace apps/server test`、`npm run build:server`、`npm test` 均通过。

## 2026-05-16 Codex 图片接口高并发压测

- 任务：对图片接口进行大并发压测，观察是否触发 `Not enough memory` 或 500。
- 压测准备：生成临时图库，包含 18 张大尺寸 JPEG 和 1 个 7z 图片归档；使用独立 `SQLITE_PATH`、`CACHE_DIR`、`LIBRARY_ROOTS` 和端口 4317 启动后端，避免污染本地数据。
- 压测脚本：`.codex/image-load-test.mjs`，自动创建图库根目录、触发扫描、登录、收集资产 ID，并并发请求 `/thumbnail`、`/preview`、`/original`。
- 结果一：并发 96、27 个资产、8 轮、513 个请求；463 个 200，50 个 503；无 500，无 `Not enough memory`。503 为缩略图请求闸门返回 `thumbnail service busy, retry later`，属于预期背压。
- 结果二：并发 64、27 个资产、8 轮、513 个请求；513 个 200；无 500，无 `Not enough memory`；服务端进程峰值 WorkingSet 约 163.2 MiB。
- 额外检查：本机 Documents 下找到的 `.rar` 为代码压缩包，非图片归档，未纳入图片接口真实 RAR 压测。

## 2026-05-16 Codex 线上 preview 空响应复核

- 任务：使用用户提供 cookie 请求线上 preview 接口。
- 请求：`/api/v1/assets/ast_0526c5a3150cb3f0fa479a11a52b46c3/preview?preset=balanced`。
- 线上结果：HTTP 200，`Content-Type: image/jpeg`，`Content-Length: 0`，下载体 0 字节；未返回 `Not enough memory`。
- 判断：服务端或缓存层存在 0 字节 preview 缓存文件被当成 ready 文件返回的问题。
- 修复：`findReadyFile` 改为必须 `stat.isFile()` 且 `size > 0`；图片变体生成改为先写临时文件，确认非空后再 rename 到正式缓存路径，避免失败/中断留下 0 字节正式缓存。
- 新增测试：`ensurePreview regenerates zero byte preview cache files`。
- 验证：`npm --workspace apps/server test`、`npm run build:server`、`npm test` 均通过。

## 2026-05-16 Codex 大图分页索引回退修复

- 任务：修复进入大图页面看到第 24 张后，由于后续图片尚未加载，点击下一张会回到第 2 张的问题。
- 工具说明：当前会话未暴露 sequential-thinking、shrimp-task-manager、code-index、exa；已使用 `rg`、`Get-Content`、`update_plan`、`apply_patch` 和本地 npm 验证替代，并将上下文写入 `.codex/context-scan-viewer-pagination.json`。
- 根因：`ViewerGallery` 的打开初始化 effect 依赖 `images.length`；`AlbumDetailScreen` 追加第 2 页后 `images.length` 从 24 变为 48，effect 重新把 `activeIndex` 设为打开时的 `initialIndex`，随后 `pendingAdvanceAfterLoad` 再推进一张，最终显示第 2 张。
- 修复：新增本次打开会话的初始化标记，只在查看器真正打开且尚未初始化时应用 `initialIndex`；列表追加时仅保留当前索引，列表收缩时通过纯函数夹紧到有效范围。
- 新增测试：`viewer index keeps current page position when appended images arrive`，覆盖追加图片后保持第 24 张并在 pending advance 后进入第 25 张的索引计算。
- 验证：`npm --workspace apps/web test`、`npm run lint:web`、`npm run build:web` 均通过。

## 2026-05-16 Codex 首页前端异常修复

- 任务：用户反馈首页前端异常，截图显示主内容空白且侧栏位于右侧。
- 工具说明：当前会话未暴露 sequential-thinking、shrimp-task-manager、code-index、exa；使用 `rg`、`Get-Content`、`update_plan`、`apply_patch` 和本地 npm 验证替代。Codex in-app browser 拒绝访问 `http://localhost:3210`，未绕过该限制。
- 上下文：已写入 `.codex/context-scan-homepage-frontend.json`。
- 根因：首屏鉴权恢复前先渲染登录页，鉴权成功后再把 `currentScreen` 切到首页；首页因此作为后续页面进入 `PageTransitionFrame` 的横向位移动画，整页 motion 容器若停留在 `translateX(100%)` 会让主内容离开视口、侧栏出现在右侧。
- 修复：`useAppAuthBootstrap` 返回 `isAuthBootstrapping`；`App.tsx` 在鉴权恢复期间显示静态加载层，等最终页面确定后再挂载 `PageTransitionFrame`。
- 验证：`npm run lint --workspace @moment-pic/web`、`npm run test --workspace @moment-pic/web`、`npm run build:web` 均通过。

## 2026-05-16 Codex 大图结束跳转提示修复

- 任务：修复当前图集结束后没有提示跳转到下一图集的问题。
- 工具说明：当前会话未暴露 sequential-thinking、shrimp-task-manager、code-index、exa；已使用 `rg`、`Get-Content`、`update_plan`、`apply_patch` 和本地 npm 验证替代，并将上下文写入 `.codex/context-scan-viewer-end-prompt.json`。
- 根因：`ViewerGallery` 原本只在用户停留于最后一张后再次点击下一张时才显示 `ViewerEndPrompt`；从倒数第二张前进到最后一张时不会主动提示。另一个风险是 `nextAlbumId` 只在进入详情时计算，目录相册和智能相册成员来源下容易缺少下一图集候选。
- 修复：viewer 记录是否由“下一张”前进，到达最后一张且没有更多图片时自动显示结束提示；App 侧按当前来源同步 `albumNavigationSource`，并在相册详情期间重新计算 `nextAlbumId`。
- 新增测试：`viewer end prompt appears after navigating forward to the final loaded image`、`buildDirectoryNavigationAlbums keeps album nodes as next-album candidates`。
- 验证：`npm --workspace apps/web test`、`npm run lint:web`、`npm run build:web` 均通过。

## 2026-05-16 Codex 大图结束提示触发时机调整

- 任务：按用户反馈调整结束提示触发时机，进入最后一张时不弹窗，停在最后一张后再次点击下一张才弹窗。
- 修复：删除 `ViewerGallery` 中到达最后一张后自动显示 `ViewerEndPrompt` 的 effect 和前进标记；保留 `goToNext` 在当前索引已是最后一张、且无更多图片可加载时弹窗的行为。
- 新增/调整测试：`resolveViewerNextAction shows end prompt only after requesting next from the final image`，锁定倒数第二张点击下一张只前进到最后一张，最后一张再次点击下一张才显示结束提示。
- 验证：`npm --workspace apps/web test`、`npm run lint:web`、`npm run build:web` 均通过。

## 2026-07-05 Codex 图集收藏与分享功能

- 任务：新增图集收藏按钮、封面收藏标识与操作、图集分享弹窗、密码访问分享链接和有效期失效机制。
- 工具说明：当前会话未暴露 sequential-thinking、shrimp-task-manager、code-index、exa；使用 `rg`、`Get-Content`、`apply_patch`、本地 npm 测试和构建替代，扫描结果写入 `.codex/context-scan-album-favorite-share.json`。
- 上下文：相册服务端路径为 `apps/server/src/routes/albums.ts`、`apps/server/src/services/album-service.ts`、`apps/server/src/repositories/album-repository.ts`；前端封面和详情路径为 `apps/web/src/components/gallery/AlbumCard.tsx`、`apps/web/src/components/AlbumDetailScreen.tsx`。
- 实现：
  - SQLite `albums` 增加 `is_favorite` 字段，新增 `album_shares` 表与 token/过期索引。
  - 新增收藏接口 `PATCH /api/v1/albums/:albumId/favorite`，列表、详情、资源分页和智能相册成员 DTO 均返回收藏状态。
  - 新增分享接口 `POST /api/v1/albums/:albumId/share`，公开接口 `/api/v1/shares/:token/...` 支持密码认证、分页读取、缩略图、预览图和原图访问。
  - 前端新增 `AlbumShareDialog`、`SharedAlbumScreen`，封面卡片和详情页菜单接入收藏/分享按钮。
- 验证：`npm run build:server`、`npm run lint --workspace @moment-pic/web`、`npm run test --workspace @moment-pic/server`、`npm run test --workspace @moment-pic/web`、`npm run build --workspace @moment-pic/web` 均通过。

## 2026-07-06 Codex 收藏入口与分享管理

- 任务：封面收藏/分享按钮默认隐藏并在 hover 展示；图集菜单新增收藏图集和分享管理页面。
- 实现：
  - `AlbumCard` 两个操作按钮统一使用 `group-hover`/`group-focus-within` 展示。
  - `/api/v1/albums` 支持 `favoriteOnly=true` 筛选。
  - 新增 `/api/v1/album-shares` 列表与删除接口。
  - 前端新增收藏模式和 `ShareManagementScreen`，侧栏新增“收藏图集”“分享管理”。
- 验证：`npm run build:server`、`npm run lint --workspace @moment-pic/web`、`npm run test --workspace @moment-pic/server`、`npm run test --workspace @moment-pic/web`、`npm run build --workspace @moment-pic/web` 均通过。
