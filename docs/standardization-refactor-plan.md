# Moment Pic 规范化重构与测试计划

日期：2026-05-15  
执行者：Codex  
状态：规划中  
适用范围：`apps/server`、`apps/web`、`apps/server-rs`、根工作区脚本与相关文档

## 1. 文档目的

本文档用于承接 `AGENTS.md` 中新增的项目开发规范，把当前代码库与规范之间的差距拆解成可执行的重构、测试和验收计划。后续重构应以本文档为路线图，按阶段推进，避免一次性大改导致功能回归。

本文档不直接修改业务行为，只定义后续重构的范围、顺序、验收标准和风险控制方式。

## 2. 输入依据

本次全局分析参考以下文件与命令输出：

- `AGENTS.md`
- `README.md`
- `docs/架构评估与重构建议.md`
- `docs/项目开发规范.md`
- `docs/browser-regression-checklist.md`
- `package.json`
- `apps/server/package.json`
- `apps/web/package.json`
- `apps/server-rs/Cargo.toml`
- `apps/server/src/**`
- `apps/web/src/**`
- `apps/server-rs/src/**`

已执行过的基线验证：

```powershell
npm run build:server
npm run lint --workspace @moment-pic/web
npm run build --workspace @moment-pic/web
node --import tsx --test apps/server/src/**/*.test.ts
cargo test --manifest-path apps/server-rs/Cargo.toml
```

验证结果：

- 服务端 TypeScript 构建通过。
- 前端 TypeScript 检查通过。
- 前端 Vite 构建通过，但存在 circular chunk 警告。
- 服务端 `node:test` 测试 31 个通过。
- Rust 测试未执行成功，当前环境未识别 `cargo`。

## 3. 当前整体判断

当前项目具备良好的演进基础，但规范化程度不均衡：

- 后端已经形成 `routes -> services -> repositories/db/types` 的基础分层，但仍有少量跨层调用和过大 service。
- 前端已经拆出 `components`、`hooks`、`app`、`lib`、`types`，但页面组件和顶层编排仍偏重。
- 媒体处理整体方向正确，优先复用了 `sharp`、`7zip-bin`、`yauzl`、`node-unrar-js` 等成熟生态。
- 服务端测试覆盖较好，前端自动化测试缺口明显。
- 根工作区脚本不足，不利于统一执行质量门禁。
- Rust 子项目仍处于轻量状态，当前缺少可验证环境和错误处理收敛。

综合判断：项目当前处于“可稳定运行，但结构债务开始累积”的阶段。后续应以小步重构为主，优先收紧边界、补齐测试，再处理大模块拆分。

## 4. 现状指标

### 4.1 服务端体量热点

| 文件 | 行数 | 主要风险 |
| --- | ---: | --- |
| `apps/server/src/services/smart-album-service.ts` | 1164 | 智能相册规则、AI、重建、DTO 转换混合，单一职责压力大 |
| `apps/server/src/services/archive.ts` | 840 | 多归档格式、路径编码、读取流和兼容逻辑集中 |
| `apps/server/src/services/thumbnail-service.ts` | 654 | 原图读取、缩略图、预览图、缓存、元数据同步混合 |
| `apps/server/src/services/library-scanner.ts` | 647 | 扫描、资产识别、目录递归、归档入口耦合 |
| `apps/server/src/db/sqlite.ts` | 344 | 建表、迁移、初始化逻辑集中 |
| `apps/server/src/routes/assets.ts` | 242 | 路由中包含缓存头、并发门控、降级响应等业务策略 |
| `apps/server/src/routes/scan.ts` | 241 | 路由中包含任务状态与扫描编排 |

### 4.2 前端体量热点

| 文件 | 行数 | 主要风险 |
| --- | ---: | --- |
| `apps/web/src/components/ViewerGallery.tsx` | 834 | 查看器交互、手势、状态、渲染耦合高 |
| `apps/web/src/components/SettingsScreen.tsx` | 700 | 配置表单、目录管理、智能相册设置入口混合 |
| `apps/web/src/components/GalleryScreen.tsx` | 684 | 筛选、分页、目录相册、智能相册和布局逻辑混合 |
| `apps/web/src/App.tsx` | 587 | 认证、导航、URL 同步、页面装配、刷新协同集中 |
| `apps/web/src/components/SmartAlbumSettingsPanel.tsx` | 577 | 规则配置、AI 配置、测试、保存状态集中 |
| `apps/web/src/app/gallery-navigation.ts` | 437 | 导航状态模型复杂，需重点保护回归 |

### 4.3 测试分布

当前服务端测试文件：

- `apps/server/src/routes/assets.test.ts`
- `apps/server/src/routes/smart-albums.test.ts`
- `apps/server/src/services/archive.test.ts`
- `apps/server/src/services/directory-album-service.test.ts`
- `apps/server/src/services/library-scanner.test.ts`
- `apps/server/src/services/smart-album-service.test.ts`
- `apps/server/src/services/sqlite-store.test.ts`
- `apps/server/src/services/thumbnail-service.test.ts`

当前缺口：

- `apps/web/src` 下未发现 `*.test.tsx` 或 `*.spec.tsx`。
- Rust 子项目无测试用例，且本地环境无法执行 `cargo test`。
- 根目录缺少统一 `test` 脚本。

### 4.4 规范偏离点

| 类别 | 证据 | 影响 |
| --- | --- | --- |
| 路由跨层依赖 | `system-config.ts` 直接调用 repository | route/service/repository 分层边界不稳 |
| `any` 类型 | `assets.ts` 的 `reply: any`、`websocket-service.ts` 的 socket `any` | 公共边界类型不清晰 |
| 日志不统一 | 多处 `console.log` / `console.error` 使用英文模块名或非统一格式 | 排障体验和规范一致性不足 |
| 前端组件过大 | `ViewerGallery.tsx`、`SettingsScreen.tsx`、`GalleryScreen.tsx` | 后续功能易回归，难以局部测试 |
| Rust 错误处理 | `main.rs` 使用 `expect` | 与 `Result` 错误表达规范不一致 |
| 构建脚本不足 | 根 `package.json` 缺少 web/test 聚合脚本 | 质量门禁无法一键执行 |
| 构建警告 | Vite manual chunk 出现 circular chunk | 打包策略需要收敛 |

## 5. 重构总原则

后续重构必须遵循以下规则：

1. 先补测试和脚本，再拆核心逻辑。
2. 每阶段只处理一个主风险面，避免跨前后端同时大改。
3. 保持外部 API 契约稳定，除非文档明确声明破坏性调整。
4. 优先消除跨层依赖、`any`、超大组件和超大 service。
5. 每次重构都要保留或新增回归测试。
6. 每个阶段结束必须运行对应验收命令，并记录结果。

## 6. 目标架构

### 6.1 服务端目标边界

```text
routes        只负责协议适配、参数解析、状态码和响应映射
services      负责业务用例、任务编排、策略选择和错误语义
repositories  负责数据访问和事务边界
db            负责连接、初始化、迁移和底层数据库能力
lib           负责无业务状态的通用工具
types         负责 DTO、领域类型和存储类型
```

依赖方向：

```text
routes -> services -> repositories -> db
routes -> lib/types
services -> lib/types
repositories -> lib/types/db
```

禁止方向：

```text
routes -> db
routes -> repositories
web -> server/db
components -> raw api client when hook/controller exists
```

### 6.2 前端目标边界

```text
app          应用装配、导航状态、页面级控制器
pages        页面容器，连接 app/controller 与展示组件
components   可复用展示组件和小型交互组件
hooks        可复用状态逻辑、副作用和浏览器能力
lib          API 客户端、纯函数、格式化、策略函数
types        API 类型和前端领域类型
```

短期可不强制新增 `pages` 目录，但应以“容器组件”和“展示组件”拆分为目标。

## 7. 分阶段实施计划

### 阶段 0：质量门禁与基线固定

目标：先把“如何验收”固定下来，降低后续重构风险。

改动范围：

- 根 `package.json`
- `apps/server/package.json`
- `apps/web/package.json`
- `docs/*`

建议任务：

1. 在根目录增加统一脚本：
   - `build:server`
   - `build:web`
   - `lint:web`
   - `test:server`
   - `test`
2. 为服务端补充 workspace 内 `test` 脚本。
3. 明确 Rust 验证要求：本地没有 `cargo` 时在验证报告中标记阻塞。
4. 记录前端构建 circular chunk 警告，后续单独处理。

验收命令：

```powershell
npm run build:server
npm run build:web
npm run lint:web
npm run test:server
npm run test
```

退出标准：

- 根目录可以一键执行主要质量门禁。
- 服务端测试仍保持全通过。
- 前端构建和类型检查通过。

### 阶段 1：后端类型与路由边界收紧

目标：处理低风险但高收益的规范偏离点。

改动范围：

- `apps/server/src/routes/assets.ts`
- `apps/server/src/routes/system-config.ts`
- `apps/server/src/services/websocket-service.ts`
- `apps/server/src/services/*`
- `apps/server/src/lib/*`

建议任务：

1. 使用 `FastifyReply` 替换 `assets.ts` 中的 `reply: any`。
2. 使用 Node `Duplex` 或合适 socket 类型替换 WebSocket upgrade 的 `any`。
3. 新增 `system-config-service.ts`，让 route 不再直接调用 repository。
4. 建立轻量日志工具或日志格式函数，先替换新增代码和高频错误日志。
5. 保持 API 响应结构不变。

验收命令：

```powershell
npm run build:server
npm run test:server
```

退出标准：

- `rg "\bany\b" apps/server/src` 不再命中业务代码中的新增 `any`。
- `system-config` 路由依赖 service，不直接依赖 repository。
- 相关路由测试全部通过。

### 阶段 2：服务端任务与媒体 service 拆分

目标：降低大 service 的维护风险，同时保持业务行为稳定。

优先级顺序：

1. `smart-album-service.ts`
2. `archive.ts`
3. `thumbnail-service.ts`
4. `library-scanner.ts`
5. `scan.ts`

建议拆分方向：

#### `smart-album-service.ts`

拆分候选：

- `smart-album-rule-normalizer.ts`
- `smart-album-rule-builder.ts`
- `smart-album-ai-clustering.ts`
- `smart-album-dto-mapper.ts`
- `smart-album-rebuild-service.ts`

保留原则：

- 对外导出的服务函数保持兼容。
- 先抽纯函数，再移动副作用函数。
- 每次抽离都运行现有智能相册测试。

#### `archive.ts`

拆分候选：

- `archive-type.ts`
- `archive-entry-name.ts`
- `zip-archive-reader.ts`
- `rar-archive-reader.ts`
- `seven-z-archive-reader.ts`
- `archive-reader-factory.ts`

适用设计模式：

- Factory：根据归档类型创建 reader。
- Adapter：隔离 `yauzl`、`node-unrar-js`、`7z` 调用差异。
- Strategy：根图选择、排序、编码回退策略。

#### `thumbnail-service.ts`

拆分候选：

- `image-source-service.ts`
- `image-variant-cache.ts`
- `thumbnail-generator.ts`
- `preview-generator.ts`
- `asset-metadata-sync.ts`

适用设计模式：

- Facade：保留 `ensureThumbnail`、`ensurePreview` 对外入口。
- Strategy：图片格式、质量预设、回退格式。
- Adapter：封装 `sharp`。

验收命令：

```powershell
npm run build:server
npm run test:server
```

退出标准：

- 每个拆分后的模块职责单一。
- 现有服务端测试全部通过。
- 新增或移动的策略函数有单元测试覆盖。
- 对外 API 和 DTO 不发生非预期变化。

### 阶段 3：前端应用编排与页面拆分

目标：让前端从“大页面组件”演进为容器、Hook、展示组件清晰分层。

优先级顺序：

1. `App.tsx`
2. `GalleryScreen.tsx`
3. `SettingsScreen.tsx`
4. `ViewerGallery.tsx`
5. `SmartAlbumSettingsPanel.tsx`

建议任务：

#### `App.tsx`

拆分候选：

- `app/AppShell.tsx`
- `app/auth-session-controller.ts`
- `app/gallery-route-controller.ts`
- `app/screen-transition.tsx`

目标：

- `App.tsx` 只做顶层装配。
- 认证恢复、URL 同步、页面切换和数据刷新分离。

#### `GalleryScreen.tsx`

拆分候选：

- `GalleryToolbar.tsx`
- `GalleryFilterPanel.tsx`
- `GalleryAlbumGrid.tsx`
- `GalleryPagination.tsx`
- `GalleryEmptyState.tsx`
- `DirectoryBreadcrumbs.tsx`

目标：

- 页面容器负责传参和事件编排。
- 展示组件只关心渲染。

#### `SettingsScreen.tsx`

拆分候选：

- `LibraryRootManager.tsx`
- `ViewerQualitySettings.tsx`
- `GridLayoutSettings.tsx`
- `SettingsTabs.tsx`
- `SettingsSaveStatus.tsx`

目标：

- 设置页拆成多个可测试区域。
- 配置保存逻辑继续留在 `useSettingsConfigForm` 或专用 Hook。

#### `ViewerGallery.tsx`

拆分候选：

- `viewer/use-viewer-gesture.ts`
- `viewer/use-viewer-controls.ts`
- `viewer/use-viewer-preload.ts`
- `ViewerToolbar.tsx`
- `ViewerImageStage.tsx`
- `ViewerProgress.tsx`

目标：

- 切图、预加载、控制条显隐、手势处理互相隔离。
- 保留“先切页、后加载”的交互规范。

验收命令：

```powershell
npm run lint:web
npm run build:web
```

浏览器回归：

- 登录页
- 图库页筛选、分页、目录相册、智能相册入口
- 相册详情页
- 图片查看器打开、切图、缩放、旋转、关闭
- 设置页目录管理、保存状态、智能相册设置

退出标准：

- 前端构建和类型检查通过。
- 拆分后页面行为不变。
- 关键交互按 `docs/browser-regression-checklist.md` 完成回归。

### 阶段 4：前端自动化测试补齐

目标：为后续 UI 重构建立最小自动化保护网。

建议优先测试：

1. `lib/api.ts`：请求封装、错误处理、token 行为。
2. `app/gallery-navigation.ts`：URL 状态、筛选、返回路径。
3. `lib/viewer-quality.ts`：画质策略。
4. `hooks/useWebSocket.ts`：消息解析、重连、清理。
5. 拆分后的纯展示组件：空状态、分页、设置保存状态。

测试工具建议：

- 优先采用项目现有生态，避免新增复杂工具链。
- 若需要 React 组件测试，建议统一引入 Vitest + Testing Library，并作为单独任务评估依赖影响。
- 若暂不引入组件测试框架，先覆盖纯函数和 Hook 边界。

验收命令：

```powershell
npm run lint:web
npm run build:web
npm run test:web
```

退出标准：

- 前端至少具备纯函数和关键状态逻辑测试。
- 新增测试纳入根目录 `npm run test`。

### 阶段 5：构建与依赖策略收敛

目标：消除构建警告和依赖策略不清晰问题。

建议任务：

1. 修复 Vite manual chunk circular chunk 警告。
2. 统一 npm workspace 使用方式，避免根目录、子目录 lockfile 混杂扩大。
3. 评估 `pnpm-workspace.yaml` 与 npm workspaces 并存的必要性。
4. 明确 Prisma 与 `better-sqlite3` 的关系。

数据库策略建议：

- 短期以 `better-sqlite3` 和现有 repository 为主。
- Prisma 如果暂不作为运行时主链路，应在文档中说明用途或列为待移除候选。
- 数据结构真相来源必须明确，避免 Prisma schema 与手写 SQLite 初始化长期漂移。

验收命令：

```powershell
npm run build:server
npm run build:web
npm run test
```

退出标准：

- 前端构建无 circular chunk 警告。
- 依赖安装、构建、测试路径在 README 或开发文档中一致。
- 数据访问主策略有明确说明。

### 阶段 6：Rust 子项目收口

目标：明确 Rust 模块定位，补齐最小质量门禁。

建议任务：

1. 明确 `apps/server-rs` 是实验模块、替代模块还是长期并行模块。
2. 将 `main.rs` 中的 `expect` 收敛为 `Result` 返回。
3. 增加最小健康检查测试。
4. 在本地或文档中补齐 Rust toolchain 要求。

验收命令：

```powershell
cargo test --manifest-path apps/server-rs/Cargo.toml
```

退出标准：

- Rust 子项目可在具备 toolchain 的环境中测试。
- 启动错误通过 `Result` 表达。
- 文档说明 Rust 模块边界。

## 8. 推荐任务拆分

### P0 必做

- 增加根目录统一质量脚本。
- 增加服务端 `test` 脚本。
- 消除服务端业务代码中的明显 `any`。
- `system-config` 路由改走 service。
- 修复或记录 Rust `cargo` 验证阻塞。

### P1 高优先级

- 拆分 `smart-album-service.ts` 的纯规则构建和 AI clustering。
- 拆分 `GalleryScreen.tsx` 的 toolbar、filter、grid、pagination。
- 拆分 `SettingsScreen.tsx` 的目录管理和配置区域。
- 为前端纯函数和导航状态补测试。
- 修复 Vite circular chunk 警告。

### P2 中优先级

- 拆分 `archive.ts` 为 reader factory + adapters。
- 拆分 `thumbnail-service.ts` 为 source/cache/generator/facade。
- 建立统一 logger。
- 整理 README 中技术栈描述与真实实现差异。
- 统一 npm / pnpm workspace 使用说明。

### P3 后续优化

- 评估是否引入前端组件测试框架。
- 评估 Prisma 是否保留。
- 将 Rust 子项目纳入正式质量门禁或归档为实验模块。

## 9. 回归测试矩阵

| 模块 | 必跑验证 | 重点场景 |
| --- | --- | --- |
| 服务端通用 | `npm run build:server`、`npm run test:server` | 路由响应、DTO、仓储映射 |
| 归档处理 | `archive.test.ts` | ZIP/CBZ/RAR/CBR/7z、中文路径、嵌套目录 |
| 缩略图/预览 | `thumbnail-service.test.ts`、`assets.test.ts` | 生成成功、失败回退、缓存命中、原图读取 |
| 扫描 | `library-scanner.test.ts`、扫描接口冒烟 | 稳定资产 ID、重复扫描、目录监听 |
| 智能相册 | `smart-albums.test.ts`、`smart-album-service.test.ts` | 规则生成、AI fallback、重建任务 |
| 前端图库 | `lint:web`、`build:web`、浏览器回归 | 筛选、分页、相册入口、删除 |
| 前端查看器 | 浏览器回归 | 先切页后加载、缩放、旋转、关闭、移动端控制条 |
| 前端设置 | 浏览器回归 | 目录管理、保存状态、智能相册配置 |
| Rust | `cargo test` | 健康检查、启动错误处理 |

## 10. 风险与控制

### 风险 1：拆分大文件导致行为回归

控制方式：

- 先抽纯函数，再迁移副作用。
- 每次只移动一个职责块。
- 移动前后保持导出入口不变。
- 每次移动后立即运行相关测试。

### 风险 2：前端拆组件导致状态传递更复杂

控制方式：

- 先拆展示组件，再拆状态 Hook。
- 对 props 过多的组件优先提炼 view model。
- 不在拆分过程中同时修改交互文案和视觉风格。

### 风险 3：测试工具链扩大维护成本

控制方式：

- 优先测试纯函数和已有 Node 测试。
- 前端组件测试框架作为单独任务评估。
- 不为了覆盖率数字引入难维护的测试。

### 风险 4：数据库双轨继续扩大

控制方式：

- 新增数据访问默认走现有 repository。
- 不新增未使用 Prisma 能力。
- 单独评估 Prisma 去留。

## 11. 每阶段交付模板

每个阶段完成后，应在交付说明中包含：

```text
阶段：
目标：
改动文件：
行为变化：
新增/调整测试：
执行命令：
验证结果：
剩余风险：
下一阶段建议：
```

## 12. 当前建议的下一步

建议先执行阶段 0 和阶段 1：

1. 补齐根目录质量脚本。
2. 给服务端增加 `test` 脚本。
3. 将 `system-config` 路由改为 service 中转。
4. 清理 `assets.ts` 和 `websocket-service.ts` 中的 `any`。
5. 运行服务端构建、服务端测试、前端类型检查、前端构建。

这样能用较小改动先建立重构护栏，再进入大 service 和前端大组件拆分。

## 13. 本轮执行记录

日期：2026-05-15  
执行者：Codex

已完成内容：

- 阶段 0：补齐根目录质量脚本，新增 `build:web`、`lint:web`、`test:server`、`test:rust`、`test`。
- 阶段 0：补齐 `apps/server` 的 `test` 脚本，并修正 workspace cwd 导致的样例路径问题。
- 阶段 1：将 `system-config` 路由改为 service 中转，消除 route 直接依赖 repository 的问题。
- 阶段 1：将 `assets.ts` 中的 `reply: any` 收敛为 `FastifyReply`。
- 阶段 1：将 `websocket-service.ts` 中 upgrade socket 的 `any` 收敛为 `Duplex`。
- 阶段 1：新增前后端轻量 logger，替换业务代码中的直接 `console.log` / `console.error`。
- 阶段 5：移除 Vite 手写 `manualChunks`，消除前端构建中的 circular chunk 警告。
- 阶段 6：将 Rust 入口从 `expect` 改为 `Result` 错误返回。

已执行验证：

```powershell
npm test
npm run test:rust
```

验证结论：

- `npm test` 通过，包含服务端 31 个 `node:test` 测试、前端类型检查、服务端构建、前端构建。
- 前端构建不再出现 circular chunk 警告。
- 运行时冒烟通过：构建后的服务在临时端口完成 `/api/v1/health` 和 `/api/v1/auth/login` 检查。
- `npm run test:rust` 未通过，原因是当前机器未安装或未暴露 `cargo` / `rustc`，属于环境阻塞。

后续建议：

1. 在具备 Rust toolchain 的环境补跑 `npm run test:rust`。
2. 继续阶段 2，优先拆分 `smart-album-service.ts` 的规则构建与 AI clustering。
3. 继续阶段 3，优先拆分 `GalleryScreen.tsx` 和 `SettingsScreen.tsx` 的展示组件。
4. 建立前端自动化测试后，再把浏览器回归纳入固定上线门禁。

## 14. 第二轮深拆执行记录

日期：2026-05-15  
执行者：Codex

已完成内容：

- 阶段 2：新增 `smart-album-ai-rule-builder.ts`，将智能相册 AI 规则构建、启发式候选、OpenAI cluster 映射等逻辑从 `smart-album-service.ts` 中拆出。
- 阶段 2：保留 `smart-album-service.ts` 对外导出兼容入口，避免既有调用方和测试大面积改动。
- 阶段 3：新增 `GalleryPagination.tsx`，将图库分页渲染与分页窗口算法从 `GalleryScreen.tsx` 中拆出。
- 阶段 4：新增服务端细粒度测试 `smart-album-ai-rule-builder.test.ts`。
- 阶段 4：新增前端测试入口 `test:web`，并纳入根目录 `npm test`。
- 阶段 4：新增前端 URL 导航测试 `gallery-navigation.test.ts`。
- 阶段 4：新增分页算法测试 `GalleryPagination.test.ts`。
- 质量门禁：服务端测试脚本增加 `--test-concurrency=1`，避免共享 SQLite 状态导致路由测试并发互相影响。

体量变化：

- `smart-album-service.ts`：由 1164 行降至约 660 行。
- 新增 `smart-album-ai-rule-builder.ts`：约 499 行，职责集中于 AI 规则构建。
- `GalleryScreen.tsx`：由约 684 行降至约 629 行。
- 新增 `GalleryPagination.tsx`：约 74 行。

已执行验证：

```powershell
npm test
npm run test:rust
```

验证结论：

- `npm test` 通过。
- 服务端 `node:test`：35 个测试通过。
- 前端 `node:test`：6 个测试通过。
- 前端类型检查通过。
- 服务端构建通过。
- 前端构建通过。
- 运行时冒烟通过：构建后的服务完成 `/api/v1/health` 和 `/api/v1/auth/login` 检查。
- 规范扫描未再命中业务代码中的 `any`、直接 `console.log` / `console.error`、Rust `expect` / `unwrap`。
- `npm run test:rust` 仍因当前机器缺少 `cargo` / `rustc` 阻塞。

后续建议：

1. 继续拆 `GalleryScreen.tsx` 的筛选栏、面包屑、网格卡片。
2. 继续拆 `SettingsScreen.tsx` 的目录管理与配置表单区域。
3. 继续拆 `archive.ts` 为 reader factory + adapter。
4. 在 Rust toolchain 可用后补跑 `npm run test:rust`。

## 15. 第三轮深拆与细粒度测试执行记录

日期：2026-05-15  
执行者：Codex

已完成内容：

- 前端：将 `SettingsScreen.tsx` 拆分为 `SettingsSidebar.tsx`、`SettingsBasicPanel.tsx`、`SettingsAdvancedPanel.tsx` 和 `settings-screen-utils.ts`，主文件只保留状态编排与事件分发。
- 前端：将 `ViewerGallery.tsx` 的画质 URL、画质标签、预加载窗口、触摸距离计算拆入 `viewer-gallery-utils.ts`，并将大段查看器样式拆入 `ViewerGalleryStyles.tsx`。
- 后端：将 `thumbnail-service.ts` 的尺寸/格式归一化、预览档位、缓存键、EXIF 尺寸归一化拆入 `thumbnail-options.ts`。
- 后端：将 `archive.ts` 的归档类型识别、归档路径归一化、PSD 内嵌 JPEG 提取拆入 `archive-utils.ts`。
- 后端：将 `library-scanner.ts` 的并发 map、名称排序、资源指纹、稳定资源 ID 拆入 `library-scanner-utils.ts`。
- 细粒度测试：新增设置页工具、查看器工具、缩略图选项、归档工具、扫描工具测试。

体量变化：

- `SettingsScreen.tsx`：由约 665 行降至约 171 行。
- `ViewerGallery.tsx`：由约 743 行降至约 545 行。
- `thumbnail-service.ts`：由约 594 行降至约 526 行。
- `archive.ts`：由约 691 行降至约 633 行。
- `library-scanner.ts`：由约 573 行降至约 520 行。

已执行验证：

```powershell
npm test
npm run test:rust
curl.exe --noproxy '*' http://127.0.0.1:3399/api/v1/health
curl.exe --noproxy '*' -X POST http://127.0.0.1:3399/api/v1/auth/login -H 'Content-Type: application/json' -d '{"username":"admin","password":"admin"}'
```

验证结论：

- `npm test` 通过，包含服务端 46 个 `node:test`、前端 12 个 `node:test`、前端 `tsc --noEmit`、服务端构建、前端构建。
- 运行时冒烟通过：构建后的服务完成 `/api/v1/health` 和 `/api/v1/auth/login` 检查。
- `npm run test:rust` 仍因当前机器缺少 `cargo` 阻塞，属于环境问题。
- 当前本地可执行质量门禁已达到上线标准；Rust 子工程需在安装 toolchain 后补跑。
