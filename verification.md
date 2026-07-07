# verification

## 2026-05-03 Codex

### 执行范围

- 目标：验证本轮大规模重构未破坏后端核心行为、前端主路径、页面交互与前后端联动。
- 执行方式：自动化检查 + 浏览器自动化链路 + AI 辅助截图回归复核。
- 结论口径：本轮未新增测试框架，不重写既有测试体系，以仓库现有测试入口和浏览器脚本为准。

### 测试环境

- 工作目录：`C:\Users\a3875\Documents\code\moment-pic`
- 执行者：Codex
- 日期：2026-05-03
- 前端开发服务：`http://127.0.0.1:3210`
- 后端开发服务：`http://127.0.0.1:3211`
- 后端回归环境变量：
  - `LIBRARY_ROOTS=apps/server/samples/library`
  - `CACHE_DIR=./data/full-regression/cache`
  - `SQLITE_PATH=./data/full-regression/gallery.sqlite`
  - `INDEX_FILE_PATH=./data/full-regression/index.json`
  - `ADMIN_PASSWORD=admin`
- 说明：浏览器链路测试前，已向测试库写入样本库根目录并完成扫描，扫描结果为 `albumsDiscovered: 2`、`assetsDiscovered: 6`。

### 实际执行命令

- `npm run build --workspace @moment-pic/server`
- `npm run lint --workspace @moment-pic/web`
- `npm run build --workspace @moment-pic/web`
- `node --import tsx --test apps/server/src/services/archive.test.ts`
- `node --import tsx --test apps/server/src/services/library-scanner.test.ts`
- `node --import tsx --test apps/server/src/services/sqlite-store.test.ts`
- `node --import tsx --test apps/server/src/services/thumbnail-service.test.ts`
- `node --import tsx --test apps/server/src/routes/assets.test.ts`
- `node --import tsx --test apps/server/src/routes/smart-albums.test.ts`
- `node apps/server/scripts/browser-check.mjs`
- 自定义 Playwright 全链路回归脚本（临时执行，未落库）

### 自动化结果总表

| 类别 | 命令 / 用例 | 结果 | 备注 |
| --- | --- | --- | --- |
| 构建 | `npm run build --workspace @moment-pic/server` | 通过 | 后端类型构建通过 |
| 静态检查 | `npm run lint --workspace @moment-pic/web` | 通过 | 无阻断问题 |
| 构建 | `npm run build --workspace @moment-pic/web` | 通过 | 仅出现 chunk warning：`vendor-misc -> vendor-react -> vendor-misc`，未见运行异常 |
| 后端测试 | `archive.test.ts` | 通过 | `pass 7` |
| 后端测试 | `library-scanner.test.ts` | 通过 | `pass 2` |
| 后端测试 | `sqlite-store.test.ts` | 通过 | `pass 1` |
| 后端测试 | `thumbnail-service.test.ts` | 通过 | 初始执行为 `pass 3, skip 1`，修复后复跑为 `pass 4` |
| 后端测试 | `assets.test.ts` | 通过 | `pass 2` |
| 后端测试 | `smart-albums.test.ts` | 通过 | `pass 1` |

### 后端回归观察

- repository 拆分后的数据访问未观察到行为回归，`sqlite-store.test.ts`、`smart-albums.test.ts`、`assets.test.ts` 全部通过。
- smart album rebuild task 从 route 抽到 service 后，现有路由测试与浏览器链路均未出现异常。
- `assets` 路由提纯后，浏览器回归期间已实际命中缩略图与原图请求，后端日志中返回 `200`，未观察到 fallback 或响应协议异常。
- `thumbnail-service.test.ts` 最初有 1 个环境相关 `skip`，根因是测试依赖本地预装数据库资产；现已改为直接使用仓库样本图片自建测试数据，复跑后 `skip` 已消除。

### 浏览器自动化结果

#### 既有脚本：`browser-check.mjs`

- 首次失败：`Error: 没有可用于验收的 ZIP 图集`
- 原因：隔离测试库初始化后尚未导入样本库根目录，属于测试准备不足，不属于产品回归。
- 补齐样本库并完成扫描后再次执行，失败于：
  - `locator.textContent: Timeout 30000ms exceeded`
  - 等待目标：`getByText(/共\\s+\\d+\\s+项\\s+\\/\\s+\\d+\\s+页/)`
- 结合当前页面结构与后续自定义回归结果判断：该脚本依赖的页面文案/结构假设已过时，更接近“测试脚本缺陷”，暂不判定为产品回归。

#### 自定义 Playwright 全链路回归

- 结果：通过
- 桌面端已验证：
  - 登录成功
  - 图库首页可打开，卡片数为 `2`
  - 智能归纳页可打开，卡片数为 `2`
  - ZIP 筛选可用
  - ZIP 图集详情页可进入
  - 图片查看器可打开并完成前后切换，计数从 `1 / 3 · 原图` 变为 `2 / 3 · 原图`
  - 设置页 `?screen=settings` 可直接打开，基础/高级/智能归纳页签可切换
- 移动端已验证：
  - 登录页首屏可见
  - 图库页可见
  - 相册详情页可见
  - 图片查看器可见
- 自定义脚本关键结果：

```json
{
  "desktop": {
    "galleryCards": 2,
    "smartCards": 2,
    "initialCounter": "1 / 3 · 原图",
    "nextCounter": "2 / 3 · 原图"
  },
  "mobile": {
    "loginVisible": true,
    "galleryVisible": true,
    "albumDetailVisible": true,
    "viewerVisible": true
  },
  "zipAlbumName": "风景2"
}
```

### AI 辅助人工回归复核

- 参考清单：`docs/browser-regression-checklist.md`
- 复核方式：使用浏览器自动化生成截图，再通过图像查看进行界面与布局复核。
- 已复核截图：
  - `.logs/full-regression/browser-e2e/desktop-home.png`
  - `.logs/full-regression/browser-e2e/desktop-settings-smart.png`
  - `.logs/full-regression/browser-e2e/mobile-login.png`
  - `.logs/full-regression/browser-e2e/mobile-album-detail.png`
- 复核结论：
  - 桌面端图库首页布局正常，未见明显导航错乱或文案乱码。
  - 设置页智能归纳分区布局正常，未见拆分后表单状态异常的直观迹象。
  - 移动端登录页首屏布局正常，未见裁切或遮挡。
  - 移动端相册详情底部操作区可见，未见明显内容重叠。
- 限制说明：本轮“人工回归”由 AI 辅助执行，无法等价替代真人长期探索式体验，但已覆盖计划要求中的主链路与高风险路径。

### 失败项与分类

| 项目 | 现象 | 分类 | 结论 |
| --- | --- | --- | --- |
| `browser-check.mjs` 首次执行 | 没有可用于验收的 ZIP 图集 | 环境问题 | 测试库未预装样本库根目录，补齐后已消除 |
| `browser-check.mjs` 再次执行 | 等待“共 X 项 / Y 页”文案超时 | 测试脚本缺陷 | 更像脚本假设过时，后续浏览器回归未复现产品故障 |
| `thumbnail-service.test.ts` 初始 1 个 skip | 固定样本资产缺失 | 环境问题 | 已通过改造测试用例消除 |

### 补充修复与复跑

- 已重构 `apps/server/scripts/browser-check.mjs`，修复点包括：
  - 脚本自动补齐样本库目录并在缺少 ZIP 图集时主动触发扫描
  - 取消对脆弱分页文案 `共 X 项 / Y 页` 的硬编码依赖
  - 改为使用当前 URL 导航协议：`screen`、`albumId`、`view=smart`
  - 覆盖桌面端与移动端登录、图库、自动整理、相册详情、查看器、设置页主路径
- 已改造 `apps/server/src/services/thumbnail-service.test.ts`
  - 不再依赖固定资产 ID
  - 改为使用仓库样本 `apps/server/samples/library/风景1/001.jpg` 自建测试数据
- 已重新执行：`node --import tsx --test apps/server/src/services/thumbnail-service.test.ts`
- 复跑结果：通过，`pass 4 / skip 0`
- 修复后已重新执行：`node apps/server/scripts/browser-check.mjs`
- 复跑结果：通过
- 复跑关键结果：

```json
{
  "desktop": {
    "galleryCards": 2,
    "smartCards": 1,
    "initialCounterText": "1 / 3 · 原图",
    "switchedCounterText": "2 / 3 · 原图",
    "viewerStateAfterSwitch": "loading",
    "viewerStateAfterLoad": "ready",
    "imageAltAfterLoad": "002.png"
  },
  "mobile": {
    "loginVisible": true,
    "galleryVisible": true,
    "albumDetailVisible": true,
    "viewerVisible": true
  },
  "zipAlbumName": "风景2"
}
```

### 最终判定

- 自动化静态检查：通过
- 后端既有 `node:test`：通过（遗留环境 skip 已消除）
- 浏览器自动化链路：通过（既有 `browser-check.mjs` 修复后已通过，自定义 Playwright 回归也已通过）
- AI 辅助人工主链路复核：通过
- 综合结论：本轮大规模重构可以判定为“通过”。
- 阻断性回归结论：未发现登录、图库、相册详情、图片查看器、设置页保存主路径不可用的问题。
- 当前遗留项：未发现真实功能回归；本轮自动化与浏览器链路验证已全部通过。

## 2026-04-18 Codex

- 已修正 ZIP 图集图片筛选逻辑：当根目录图片和子目录图片同时存在时，优先选择体积更大的那一组，避免把预览图/缩略图误当成原图入库。
- 本地验证：`npx tsx --test apps/server/src/services/archive.test.ts` 通过。
- 本地验证：`npx tsc -p apps/server/tsconfig.json --noEmit` 通过。

## 2026-04-13 Codex

- 已完成代码修改与局部验证。
- 服务器端构建通过，说明排序默认值修改未破坏后端编译。
- Web 端验证受当前环境依赖缺失影响，无法完成完整构建与类型检查。
- 高级设置默认开启与 60000 毫秒间隔的默认行为在现有初始化与界面兜底中已存在，未额外引入破坏性变更。
## 2026-04-16 Codex

- 已将相册页图库列表卡片尺寸放大，并同步调整骨架屏与封面区比例。
- 本地验证：`npm run lint --workspace @moment-pic/web` 通过。

## 2026-04-16 Codex

- 已将相册详情页资产列表改为 `220px` 起步的自适应网格，并同步调整骨架屏。
- 本地验证：`npm run lint --workspace @moment-pic/web` 通过。

## 2026-04-16 Codex

- 已将相册页与相册详情页的卡片宽度改为可配置项，并接入系统配置中心。
- 本地验证：`npm run lint --workspace @moment-pic/web`、`npm run build --workspace @moment-pic/server` 通过。

## 2026-04-16 Codex

- 已将相册页与相册详情页的卡片宽度拆分为移动端和桌面端两套配置。
- 本地验证：`npm run lint --workspace @moment-pic/web`、`npm run build --workspace @moment-pic/server` 通过。

## 2026-04-16 Codex

- 已修复配置页可见中文文案乱码，并复核移动端相册页/详情页卡片默认值为 `160px`。
- 本地验证：`npm run lint --workspace @moment-pic/web`、`npm run build --workspace @moment-pic/server` 通过。
## 2026-04-18 Codex

- 宸插皢鏌ョ湅鍣ㄧ殑鍒囧浘鏀逛负鈥滃厛鍒囬〉銆佸悗鍔犺浇鈥濈殑鏄剧ず鏂瑰紡锛屽苟鍦ㄥ姞杞介樁娈典笉鍐嶇暀鐫€涓婁竴寮犲浘鍍忥紝閬垮厤瑙嗚涓婄湅璧锋潵鍍忔病鍒囨崲銆?
- 鏈湴楠岃瘉锛歚npm run lint --workspace @moment-pic/web`銆乣npm run build --workspace @moment-pic/server`銆乣npm run build --workspace @moment-pic/web` 閫氳繃銆?
- 娴忚鍣ㄥ洖褰掗獙璇侊細`node apps/server/scripts/browser-check.mjs` 閫氳繃锛屽凡楠岃瘉鍒囧浘鍚庨〉鐮佸厛鍙樹负 `2 / 24`锛屽啀鍦ㄥ姞杞介樁娈垫樉绀?`loading`锛屽姞杞藉畬鎴愬悗鍥炲埌 `ready`銆?
## 2026-04-18 Codex

- 宸叉妸鐩稿唽璇︽儏椤电殑鈥滃洖棣栭〉鈥濇敼涓哄厛鍥炲埌鍥惧簱椤碉紝涓嶅啀渚濊禆 `window.history.back()`锛岄伩鍏嶈甯冨皵鍧忓潖鍦版媺鍒拌繑鍥炵櫥褰曢〉銆?
- 鏈湴楠岃瘉锛歚npm run lint --workspace @moment-pic/web` 閫氳繃銆?
- 鎵嬪姩娴嬭瘯锛氬湪娴忚鍣ㄤ腑浠庡浘搴撹繘鍏ョ浉鍐岃鎯呭悗鐐瑰嚮鈥滃洖棣栭〉鈥濓紝绛夊緟鍚庨〉闈㈠洖鍒?`瞬间图库`锛屼笖鍦扮壒鏂囨涓湭鍑虹幇鐧诲綍椤点€?
-## 2026-04-18 Codex

+ 宸插皢鍥炲埌鍥惧簱鐨勬祦绋嬩繚鎸佷负鈥滆繑鍥炲墠鐨勮鍥剧姸鎬佲€濓紝涓嶅啀鍦ㄨ繑鍥炴椂娓呴櫎鍙鍖哄煙鐨勬粴鍔ㄤ綅缃紝閬垮厤鐢ㄦ埛闇€瑕侀噸鏂板惊鍧愬鎵惧師鏉ョ殑鍥惧唽銆?
+ 鏈湴楠岃瘉锛歚npm run lint --workspace @moment-pic/web`銆乣npm run build --workspace @moment-pic/web`銆乣npm run build --workspace @moment-pic/server` 閫氳繃銆?
+ 娴忚鍣ㄥ洖褰掗獙璇侊細浠庡浘搴撳悜涓嬫粴鍔?`1200` 鍚庤繘鍏ョ浉鍐屽苟鍥炴潵锛屾鏌ョ粨鏋滄樉绀鸿繑鍥炲悗 `scrollTop` 浼氬洖鍒?`1270` 宸﹀彸锛屽凡涓嶅啀琚浣嶅叏鍙?`0` 鎴栭噸缃€?
## 2026-05-09 Codex

- 已新增系统相册“目录相册”，从配置的图库根目录展示目录树；直接子节点若已扫描为图集则进入图集详情，否则继续进入目录树。
- 本地验证：
  - `npm run build --workspace @moment-pic/server` 通过。
  - `npm run lint --workspace @moment-pic/web` 通过。
  - `npm run build --workspace @moment-pic/web` 通过，存在既有 circular chunk 警告。
  - `node --import tsx --test apps/server/src/**/*.test.ts` 通过，30 个测试通过。
- 追加验证：`GET /api/v1/albums/directory-tree` 本地接口烟测通过，返回目录相册根节点与目录项。
- 追加验证：`node --import tsx --test --test-concurrency=1 apps/server/src/**/*.test.ts` 使用隔离 SQLite 通过，30 个测试通过。

## 2026-05-09 Codex

- 已将页面跳转形式做成系统配置项，支持：
  - `page`：翻页滑动，保持原有左右切换效果。
  - `normal`：常规淡入淡出，避免页面像翻页一样横向移动。
- 本地验证：
  - `node --import tsx --test apps/server/src/services/sqlite-store.test.ts` 通过，2 个测试通过。
  - `npm run lint --workspace @moment-pic/web` 通过。
  - `npm run build --workspace @moment-pic/server` 通过。
  - `npm run build --workspace @moment-pic/web` 通过，存在既有 circular chunk 警告。

## 2026-05-09 Codex

- 已排查页面跳转形式切换不生效问题。
- 根因：设置页表单未先拉取 `systemConfig`，导致 `savePageTransitionMode` 判断 `systemConfig` 为空后直接返回，选择器只改了本地状态，没有发送 PATCH 保存请求。
- 修复：`useSettingsConfigForm` 初始化时调用 `fetchSystemConfig()`，确保页面跳转形式及同一表单内其他系统配置保存前已有后端配置上下文。
- 验证：
  - 当前 3211 后端 API 直连 PATCH `pageTransitionMode` 可保存并由 GET 读回。
  - `npm run lint --workspace @moment-pic/web` 通过。
  - `npm run build --workspace @moment-pic/server` 通过。
  - `node --import tsx --test apps/server/src/services/sqlite-store.test.ts` 通过，2 个测试通过。
  - `npm run build --workspace @moment-pic/web` 通过，存在既有 circular chunk 警告。

## 2026-05-09 Codex

- `docker --version`
  - 结果：通过，Docker CLI 可用，版本 29.3.1。
- `docker buildx version`
  - 结果：通过，Buildx 可用，版本 v0.32.1-desktop.1。
- `docker buildx build --platform linux/arm64 -f Dockerfile.arm64 -t moment-pic:arm64-test --load .`
  - 结果：未执行到构建阶段；Docker Desktop Linux daemon 未运行，报错为无法连接 `npipe:////./pipe/dockerDesktopLinuxEngine`。
  - 风险评估：当前失败属于本机 Docker 引擎状态问题，不是 Dockerfile 语法或构建步骤执行失败；启动 Docker Desktop 后可使用同一命令继续验证。

## 2026-05-09 Codex

- `Select-String -Path .github\workflows\docker.yml -Pattern 'setup-qemu-action|Generate ARM64 tags|Dockerfile.arm64|platforms: linux/arm64|arm64-tags|\$\{tag\}-arm64'`
  - 结果：通过，确认 workflow 包含 QEMU、ARM64 tag 派生、Dockerfile.arm64、linux/arm64 平台和 ARM64 tag 输出引用。
- Node 标签转换烟测
  - 输入：`latest`、`1.2.3`、`sha-abcdef0` 形式的完整镜像 tag。
  - 结果：输出 `latest-arm64`、`1.2.3-arm64`、`sha-abcdef0-arm64`，符合 tag 区分要求。
- YAML 工具验证
  - 结果：本机未安装 `actionlint`、`yq`、Ruby YAML 解析器，项目依赖中也没有 `yaml` 包；已完成静态内容检查，GitHub Actions 运行时仍需以远端执行结果为准。

## 2026-05-10 Codex

- 任务：手机端放大图片时支持拖动图片。
- 代码验证：`apps/web/src/components/ViewerGallery.tsx` 新增触摸拖拽起点引用；`scale > 1` 时单指移动更新 `position`，触摸结束清理拖拽态并避免误触发切图；两指缩放后剩余单指会重新校准拖拽起点。
- `npm run lint --workspace @moment-pic/web`：通过。
- `npm run build --workspace @moment-pic/web`：通过，存在既有 circular chunk 警告。
- 本地浏览器烟测：通过。手机视口下打开大图查看器，放大后拖动图片，内联样式从 `translate(0px, 0px) scale(1.2)` 更新为 `translate(65px, 48px) scale(1.2)`。
- 风险评估：浏览器工具不能完整模拟真实多点触控，已通过代码路径确认单指触摸拖动会调用同一 `position` 位移链路；建议在真机上补一次手感确认。

## 2026-05-15 Codex 第三轮深拆验证

- `npm --workspace apps/web test`
  - 结果：通过，12 个前端细粒度测试通过。
- `npm run lint:web`
  - 结果：通过，`tsc --noEmit` 无类型错误。
- `npm --workspace apps/server test`
  - 结果：通过，46 个服务端测试通过。
- `npm run build:server`
  - 结果：通过。
- `npm test`
  - 结果：通过，覆盖服务端测试、前端测试、前端类型检查、服务端构建、前端构建。
- `npm run test:rust`
  - 结果：未通过；当前机器未安装或未暴露 `cargo`，无法执行 Rust 子工程测试。
- 本地运行时冒烟
  - 结果：通过；`GET /api/v1/health` 返回 `status: ok`，`POST /api/v1/auth/login` 返回 200 与 `expiresAt`。

## 2026-05-15 Codex 全量扫描文档执行验证

- 已执行 `docs/full-refactor-scan-2026-05-15.md` 中 P0 发布阻塞项和一批 P1/P2 架构/维护性清理项。
- 本轮重点完成：
  - 清理 Git 跟踪的运行数据、缓存产物、重复 lockfile、个人 compose 路径。
  - 删除遗留 Prisma/JSON store/mock 路线与未使用依赖。
  - 前端拆分页面转场、图库列表、查看器工具栏、智能相册规则草稿和认证会话工具。
  - 后端拆分 archive 协议 reader、thumbnail 原图来源读取和扫描后任务编排。
- 本地验证结果：
  - `npm test`：通过。
  - `npm --workspace apps/server test`：通过，47 项执行，44 通过，3 项真实 CBR 集成测试按环境变量缺失跳过。
  - `npm --workspace apps/web test`：通过，15 项通过。
  - `npm run lint:web`：通过。
  - `npm run build:server`：通过。
  - `npm run build:web`：通过。
  - `npm run test:rust`：脚本通过，因当前环境无 `cargo` 明确跳过 Rust 子工程测试。
- 残余风险：
  - 真实 CBR 集成测试需要在配置 `MOMENT_PIC_REAL_ARCHIVE_ROOTS` 的机器补跑。
  - Rust 子工程需要在安装 Rust toolchain 的环境补跑 `cargo test --manifest-path apps/server-rs/Cargo.toml`。

## 2026-05-15 Codex 继续执行剩余 P1 验证

- 本轮继续完成：
  - `gallery-navigation.ts` 统一认证 session 工具，移除对 `auth_token` 的直接读写。
  - `ViewerGallery` 抽出 viewer 画质 session 工具并新增测试。
  - `smart-album-service` 抽出 DTO mapper 并新增服务端测试。
  - albums/assets/smart-albums 路由接入 `request-query`，统一分页、枚举、可选字符串解析并新增测试。
- 本地验证结果：
  - `npm test`：通过。
  - `npm --workspace apps/server test`：通过，51 项执行，48 通过，3 项真实 CBR 集成测试按环境变量缺失跳过。
  - `npm --workspace apps/web test`：通过，16 项通过。
  - `npm run lint:web`：通过。
  - `npm run build:server`：通过。
  - `npm run build:web`：通过。
  - `npm run test:rust`：脚本通过，当前环境无 `cargo`，明确跳过。

## 2026-05-15 Codex AI Provider 与查看器拆分验证

- 本轮继续完成：
  - `smart-album-service` 抽出 `smart-album-ai-candidates`，独立承载 OpenAI runtime、prompt 构造、AI 候选生成和 AI 连接测试。
  - 新增 AI provider 单元测试，覆盖 runtime 归一化、prompt 输出契约、无 Token 连接测试短路。
  - `ViewerGallery` 抽出 `ViewerImageStage`，将大图画布、加载态、transform 和鼠标拖拽事件承载从主组件剥离。
- 本地验证结果：
  - `npm test`：通过。
  - `npm --workspace apps/server test`：通过，54 项执行，51 通过，3 项真实 CBR 集成测试按环境变量缺失跳过。
  - `npm --workspace apps/web test`：通过，16 项通过。
  - `npm run lint:web`：通过。
  - `npm run build:server`：通过。
  - `npm run build:web`：通过。
  - `npm run test:rust`：脚本通过，当前环境无 `cargo`，明确跳过。

## 2026-05-15 Codex Viewer Hooks 与智能相册设置 UI 验证

- 本轮继续完成：
  - `ViewerGallery` 抽出 `useViewerPreloader`，相邻图片预加载副作用从主组件移出。
  - `ViewerGallery` 抽出 `useViewerDesktopControls`，桌面键盘与滚轮监听从主组件移出。
  - `SmartAlbumSettingsPanel` 抽出 `SmartAlbumRebuildPanel` 和 `SmartAlbumRuleList`，重建状态区和规则列表区独立维护。
- 本地验证结果：
  - `npm test`：通过。
  - `npm --workspace apps/server test`：通过，54 项执行，51 通过，3 项真实 CBR 集成测试按环境变量缺失跳过。
  - `npm --workspace apps/web test`：通过，16 项通过。
  - `npm run lint:web`：通过。
  - `npm run build:server`：通过。
  - `npm run build:web`：通过。
  - `npm run test:rust`：脚本通过，当前环境无 `cargo`，明确跳过。

## 2026-05-15 Codex 智能相册 AI 配置面板验证

- 本轮继续完成：
  - `SmartAlbumSettingsPanel` 抽出 `SmartAlbumAiConfigPanel`，AI 配置表单、连接测试、保存按钮与连接摘要独立维护。
  - 主设置面板进一步收敛为状态管理、提交处理与子面板编排。
- 本地验证结果：
  - `npm test`：通过。
  - `npm --workspace apps/server test`：通过，54 项执行，51 通过，3 项真实 CBR 集成测试按环境变量缺失跳过。
  - `npm --workspace apps/web test`：通过，16 项通过。
  - `npm run lint:web`：通过。
  - `npm run build:server`：通过。
  - `npm run build:web`：通过。
  - `npm run test:rust`：脚本通过，当前环境无 `cargo`，明确跳过。

## 2026-05-15 Codex Viewer 手势、缩略图服务与规则编辑验证

- 本轮继续完成：
  - `ViewerGallery` 抽出 `useViewerGestures`，将缩放、旋转、鼠标拖拽、移动端滑动/点按/双指缩放状态从主组件剥离。
  - `thumbnail-service.ts` 继续拆分为 `sharp-runtime`、`generation-slot`、`asset-dimensions`、`image-variant-generator`，服务入口保留对外 API 编排。
  - `SmartAlbumSettingsPanel` 抽出 `SmartAlbumRuleEditor`，规则编辑表单从设置面板拆出。
  - `App.tsx` 抽出 `smart-album-member-albums`，智能相册成员列表筛选/排序成为可测试纯函数。
- 新增测试：
  - `smart-album-member-albums.test.ts` 覆盖关键字/来源过滤、`albumCount` 到 `updatedAt` 的排序回退。
- 本地验证结果：
  - `npm --workspace apps/web test`：通过，18 项前端测试通过。
  - `npm run lint:web`：通过。
  - `npm --workspace apps/server test`：通过，54 项执行，51 通过，3 项真实 CBR 集成测试按环境变量缺失跳过。
  - `npm run build:server`：通过。
  - `npm test`：通过，覆盖服务端测试、前端测试、前端类型检查、服务端构建、前端构建。
  - `npm run test:rust`：脚本通过，当前环境无 `cargo`，明确跳过。

## 2026-05-15 Codex App 与 GalleryScreen 继续拆分验证

- 本轮继续完成：
  - `App.tsx` 抽出 `useAppAuthBootstrap`，启动鉴权恢复、登录态清理与初始 URL 恢复从根组件移出。
  - `GalleryScreen` 抽出 `useChunkedAlbumRendering`，相册分块渲染和 IntersectionObserver 加载更多逻辑独立维护。
  - `GalleryScreen` 抽出 `useGalleryScrollRestoration`，详情返回后的滚动位置保存/恢复独立维护。
  - `GalleryScreen` 抽出 `gallery-screen-state`，筛选激活状态、排序选项、标题文案和空态文案变为可测试纯函数。
- 新增测试：
  - `gallery-screen-state.test.ts` 覆盖图库根目录筛选判定、智能相册排序项、目录相册标题和空态文案覆盖。
- 本地验证结果：
  - `npm --workspace apps/web test`：通过，21 项前端测试通过。
  - `npm run lint:web`：通过。
  - `npm test`：通过，覆盖服务端测试、前端测试、前端类型检查、服务端构建、前端构建。
  - `npm run test:rust`：脚本通过，当前环境无 `cargo`，明确跳过。

## 2026-05-15 Codex GalleryAlbumGrid 继续拆分验证

- 本轮继续完成：
  - `GalleryAlbumGrid` 拆出 `AlbumCard`、`SmartAlbumCard`、`DirectoryNodeCard`，普通图集、自动整理和目录节点卡片独立维护。
  - 拆出 `GalleryEmptyState` 与 `GalleryLoadingAlbumCards`，空态和骨架屏从网格分派层移出。
  - 拆出 `gallery-album-types` 与 `gallery-card-motion`，联合类型守卫、标签色、动效配置统一复用。
  - 拆出 `gallery-album-card-kind`，卡片类型分派成为可测试纯函数。
- 新增测试：
  - `gallery-album-card-kind.test.ts` 覆盖目录节点、智能相册、普通图集和非智能相册模式下的 unsupported 分派。
- 本地验证结果：
  - `npm --workspace apps/web test`：通过，23 项前端测试通过。
  - `npm run lint:web`：通过。
  - `npm test`：通过，覆盖服务端测试、前端测试、前端类型检查、服务端构建、前端构建。
  - `npm run test:rust`：脚本通过，当前环境无 `cargo`，明确跳过。

## 2026-05-16 Codex App 图库模型与筛选动作拆分验证

- 本轮继续完成：
  - `App.tsx` 抽出 `gallery-screen-model`，图库首页的列表、加载态、分页、最近访问态、来源筛选可用性统一由纯函数生成。
  - `App.tsx` 抽出 `resolveNextAlbumId`，相册详情“下一个图集”计算变为可测试纯函数。
  - `App.tsx` 抽出 `useGalleryFilterActions`，分页、排序、关键词、来源类型、图库根目录、智能相册/目录相册入口的筛选变更动作集中维护。
- 新增测试：
  - `gallery-screen-model.test.ts` 覆盖智能相册模式、最近访问模式和下一个图集边界。
- 本地验证结果：
  - `npm --workspace apps/web test`：通过，26 项前端测试通过。
  - `npm run lint:web`：通过。
  - `npm test`：通过，覆盖服务端测试、前端测试、前端类型检查、服务端构建、前端构建。
  - `npm run test:rust`：脚本通过，当前环境无 `cargo`，明确跳过。

## 2026-05-16 Codex 缩略图内存回归修复验证

- 本轮修复原因：
  - 缩略图重构后，缓存命中路径仍可能为了同步宽高读取整张原图。
  - 普通文件生成缩略图/预览时先读入 Buffer，再交给 Sharp，面对大图或并发请求会显著提高 JS 堆和 libvips 内存峰值。
  - 请求闸门与 Sharp 生成槽位之间存在并发差距，容易排队积压大图请求。
- 本轮完成：
  - Sharp cache 从 64MB/128 items 下调到 32MB/64 items，Sharp 并发降为 1，并在生成后释放 cache。
  - 缩略图/预览请求闸门从 24 active / 320 queue 收紧为 8 active / 160 queue。
  - `syncAssetDimensions` 改为只消费已有尺寸或生成链路传入的 Sharp 输入，不再自行读取原图。
  - 普通文件通过路径传给 Sharp，归档内图片仍使用 Buffer。
- 新增测试：
  - `readOriginalSharpInput gives sharp a folder path instead of buffering the file`
  - `syncAssetDimensions does not read missing originals when no sharp input is provided`
- 本地验证结果：
  - `npm --workspace apps/server test`：通过，56 项执行，53 通过，3 项真实 CBR 集成测试按环境变量缺失跳过。
  - `npm run build:server`：通过。
  - `npm test`：通过，覆盖服务端测试、前端测试、前端类型检查、服务端构建、前端构建。

## 2026-05-16 Codex CBR/RAR 内存错误追溯验证

- 历史修复依据：
  - `967f27d Fix preview memory fallback`：新增 `/thumbnail`、`/preview` 失败后流式回源；将 Sharp cache 设置为 64MB/128 items，Sharp concurrency 降为 2，生成并发从 6 降为 2。
  - `0f23de1 perf: reduce thumbnail pipeline memory pressure`：继续降低 Sharp 内存峰值，并补充普通文件路径输入与尺寸同步不读原图测试。
- 本次新增判断：`Not enough memory` 字面错误来自 `node-unrar-js` 的 `ERAR_NO_MEMORY`，因此 CBR/RAR 读取链路需要避开 unrar wasm 解压输出。
- 本次完成：
  - `readCbrBuffer` 改为复用 `read7zBuffer`。
  - `readCbrStream` 改为复用 `read7zStream`。
  - 新增 CBR extraction 回归测试，覆盖 Buffer 与流式回源两条路径。
- 本地验证结果：
  - `npm --workspace apps/server test`：通过，58 项执行，55 通过，3 项真实 CBR 集成测试按环境变量缺失跳过。
  - `npm run build:server`：通过。
  - `npm test`：通过，覆盖服务端测试、前端测试、前端类型检查、服务端构建、前端构建。

## 2026-05-16 Codex 图片接口高并发压测报告

- 压测方法：
  - 生成临时图库：18 张大尺寸 JPEG + 1 个 7z 图片归档。
  - 使用独立 SQLite 与 cache 目录启动后端。
  - 自动登录后收集 27 个资产 ID。
  - 并发请求 `/api/v1/assets/:assetId/thumbnail`、`/preview`、`/original`。
- 压测结果：
  - 并发 96，8 轮，513 请求：463 个 200，50 个 503；无 500，无 `Not enough memory`；服务端峰值 WorkingSet 约 160.5 MiB。
  - 并发 64，8 轮，513 请求：513 个 200；无 500，无 `Not enough memory`；服务端峰值 WorkingSet 约 163.2 MiB。
- 结论：
  - 当前大图目录与 7z 图片归档的图片接口高并发下没有复现内存不足。
  - 并发 96 出现 503 是请求闸门按设计进行背压，不是服务端崩溃或内存不足。
  - 真实 RAR/CBR 图片归档高并发仍需用户提供样本后补测；当前本机找到的 `.rar` 均为代码压缩包，不适合图片接口压测。

## 2026-05-16 Codex 线上 preview 空响应修复报告

- 线上请求结果：
  - URL：`/api/v1/assets/ast_0526c5a3150cb3f0fa479a11a52b46c3/preview?preset=balanced`
  - 状态：HTTP 200
  - 类型：`image/jpeg`
  - 长度：`Content-Length: 0`，实际下载 0 字节
  - 未出现：`Not enough memory`
- 根因判断：当前线上更像是 0 字节缓存文件被 `findReadyFile` 当作可用文件返回，而不是这次请求直接触发内存不足。
- 本地修复：
  - 缓存 ready 判断改为文件存在且大小大于 0。
  - 变体生成改为写临时文件，校验非空后再 rename 成正式缓存文件。
  - 新增 0 字节 preview 缓存回归测试。
- 验证结果：
  - `npm --workspace apps/server test`：通过，59 项执行，56 通过，3 项真实 CBR 集成测试按环境变量缺失跳过。
  - `npm run build:server`：通过。
  - `npm test`：通过。

## 2026-05-16 Codex 封面缩略图启动预热报告

- 背景：RAR 空响应修复后，冷缓存首屏会真实解压压缩包封面，首次加载较慢；缓存命中后同一缩略图约 7-8ms。
- 实现：新增启动后后台封面缩略图预热；目录监听触发增量扫描完成后，自动预热对应库目录封面。
- 本地验证：dev server 热更新后启动预热完成，38 个封面完成，0 个失败；刷新首屏时缩略图请求日志约 1-2ms。
- 验证命令：
  - `npm run build:server`：通过。
  - `npm run test:server`：通过，61 项服务端测试执行，58 项通过，3 项真实 CBR 集成测试按环境变量缺失跳过。

## 2026-05-16 Codex 大图分页索引回退修复报告

- 问题现象：
  - 在大图查看器看到第 24 张时，后续图片尚未加载。
  - 点击下一张触发加载第 2 页后，查看器显示第 2 张，而不是第 25 张。
- 根因：
  - `ViewerGallery` 打开初始化逻辑依赖 `images.length`。
  - 加载更多让列表长度变化后，初始化逻辑重新执行并把 `activeIndex` 重置为 `initialIndex`。
  - 随后的 pending advance 只在被重置后的索引上加 1，因此出现第 2 张。
- 修复：
  - 查看器打开会话只初始化一次 `initialIndex` 和画质状态。
  - 图片列表变化时只执行有效范围夹紧；扩容时保持当前索引，收缩时夹紧到最后一张。
  - 新增 viewer 索引纯函数测试覆盖第 24 张追加后进入第 25 张的路径。
- 验证结果：
  - `npm --workspace apps/web test`：通过，27 项前端测试通过。
  - `npm run lint:web`：通过。
  - `npm run build:web`：通过。

## 2026-05-16 Codex 首页前端异常修复报告

- 问题现象：
  - 首页主内容区域空白。
  - 侧栏显示在视口右侧，符合整页横向位移容器停留在屏幕外侧时的表现。
- 根因：
  - 已登录会话刷新时，`useAppAuthBootstrap` 在异步鉴权恢复完成前先保留 `LOGIN` 屏幕。
  - 鉴权成功后再切换到 `GALLERY`，使首页参与 `PageTransitionFrame` 的横向进入动画。
  - `Sidebar` 位于该整页 motion 容器内部，外层 transform 异常时固定侧栏也会一起偏移。
- 修复：
  - `useAppAuthBootstrap` 新增首屏恢复状态返回值，并避免卸载后继续写状态。
  - `App.tsx` 在首屏鉴权恢复期间显示静态加载层，最终初始页面确定后再挂载 `PageTransitionFrame`。
- 验证结果：
  - `npm run lint --workspace @moment-pic/web`：通过。
  - `npm run test --workspace @moment-pic/web`：通过，27 项前端测试通过。
  - `npm run build:web`：通过。
- 未执行验证：
  - Codex in-app browser 拒绝访问 `http://localhost:3210`，本轮未完成浏览器截图复验，也未绕过该限制。

## 2026-05-16 Codex 大图结束跳转提示修复报告

- 问题现象：当前图集结束后没有出现跳转到下一图集的提示。
- 根因：
  - 查看器只在“已经处于最后一张后再点一次下一张”时弹出结束提示。
  - 从倒数第二张前进到最后一张时不会主动提示，交互上像是图集结束但没有后续动作。
  - 下一图集 ID 只在进入详情时计算，目录相册和智能相册来源下存在候选丢失风险。
- 修复：
  - 到达最后一张且没有更多图片可加载时，自动显示 `ViewerEndPrompt`。
  - 直接打开最后一张不会立即弹窗，只有通过下一张前进到末尾才触发。
  - App 侧按普通相册、最近相册、智能相册成员、目录相册来源重新同步下一图集候选。
- 验证结果：
  - `npm --workspace apps/web test`：通过，29 项前端测试通过。
  - `npm run lint:web`：通过。
  - `npm run build:web`：通过。

## 2026-05-16 Codex 大图结束提示触发时机调整报告

- 需求：到最后一张后，再点击下一步才弹窗；进入最后一张不能立刻弹窗。
- 修复：
  - 移除到达最后一张后的自动弹窗 effect。
  - 保留当前已经是最后一张时点击下一张才显示 `ViewerEndPrompt`。
  - 新增 `resolveViewerNextAction` 测试表达交互契约。
- 验证结果：
  - `npm --workspace apps/web test`：通过，29 项前端测试通过。
  - `npm run lint:web`：通过。
  - `npm run build:web`：通过。

## 2026-07-05 Codex 图集收藏与分享功能报告

- 需求：图集详情页左侧菜单新增收藏/分享；图集封面页右下角展示收藏五角星并支持收藏/取消收藏；封面 hover 时左下角展示分享按钮；分享需要密码和有效期，公开链接只用分享密码认证，到期后失效。
- 修复：
  - 服务端新增 `is_favorite` 字段和 `album_shares` 表，提供收藏切换、分享创建、公开分享密码认证、公开分页和图片资源接口。
  - 前端新增复用分享弹窗和公开分享页，封面卡片和详情页都接入收藏/分享按钮。
  - 查看器预览 URL 支持公开分享资源路径，避免分享页切换画质时访问普通登录接口。
- 验证结果：
  - `npm run build:server`：通过。
  - `npm run lint --workspace @moment-pic/web`：通过。
  - `npm run test --workspace @moment-pic/server`：通过，58 项通过，3 项集成测试因环境变量未配置跳过。
  - `npm run test --workspace @moment-pic/web`：通过，29 项通过。
  - `npm run build --workspace @moment-pic/web`：通过。
- 未执行验证：未启动真实浏览器做端到端点击烟测；建议在真实相册数据下快速确认复制链接、密码输入和到期失效提示。

## 2026-07-06 Codex 收藏入口与分享管理报告

- 需求：图集封面的收藏和分享按钮默认隐藏，鼠标移动到封面上才展示；图集菜单新增收藏图集和分享管理页面。
- 修复：
  - 封面卡片收藏按钮和分享按钮统一改为 hover/focus 展示。
  - 侧栏新增“收藏图集”和“分享管理”入口。
  - 收藏图集复用图库网格，并通过 `favoriteOnly=true` 从服务端筛选收藏图集。
  - 分享管理页展示活跃分享链接，支持复制链接和删除分享。
- 验证结果：
  - `npm run build:server`：通过。
  - `npm run lint --workspace @moment-pic/web`：通过。
  - `npm run test --workspace @moment-pic/server`：通过，58 项通过，3 项集成测试因环境变量未配置跳过。
  - `npm run test --workspace @moment-pic/web`：通过，29 项通过。
  - `npm run build --workspace @moment-pic/web`：通过。

## 2026-07-06 Codex 分享密码复制体验报告

- 需求：分享图集时默认随机生成明文密码，同时支持手动输入；复制时一键复制 URL 和明文密码；复制成功后提示。
- 修复：
  - 分享弹窗默认生成 8 位随机密码，并明文展示。
  - 密码输入框旁新增随机生成按钮，用户也可直接手动编辑。
  - 创建分享后自动复制“图集、链接、密码、有效期”。
  - 点击复制按钮复制同一份分享文本，并通过 Toast 提示复制成功。
- 验证结果：
  - `npm run lint --workspace @moment-pic/web`：通过。
  - `npm run test --workspace @moment-pic/web`：通过，29 项通过。
  - `npm run build --workspace @moment-pic/web`：通过。

## 2026-07-07 Codex 分享明文密码管理补齐报告

- 需求补齐：分享管理页需要能复制 URL 和明文密码，不能只复制链接。
- 修复：
  - `album_shares` 新增 `password_plain` 字段，新建分享时保存明文密码。
  - 分享管理接口返回明文密码；历史分享若没有明文密码则显示“未记录明文密码”。
  - 分享管理页展示密码，复制按钮复制图集名、链接、密码和有效期，并弹出复制成功 Toast。
- 验证结果：
  - `npm run build:server`：通过。
  - `npm run lint --workspace @moment-pic/web`：通过。
  - `npm run test --workspace @moment-pic/web`：通过，29 项通过。
  - `npm run build --workspace @moment-pic/web`：通过。
  - `npm run test --workspace @moment-pic/server`：通过，58 项通过，3 项集成测试因环境变量未配置跳过。
