# testing

## 2026-04-13 Codex

- `npm run build --workspace @moment-pic/server`
  - 结果：通过�?
- `npm run build --workspace @moment-pic/web`
  - 结果：失败�?
  - 原因：当前环境无法直接解�?web workspace �?`vite` 可执行文件�?
- `npm run lint --workspace @moment-pic/web`
  - 结果：失败�?
  - 原因：当前环境缺少前端依赖解析，报错集中�?`react`、`lucide-react`、`vite`、`@vitejs/plugin-react` 等模块无法找到�?
## 2026-04-16 Codex

- `npm run lint --workspace @moment-pic/web`
  - 结果：通过�?
## 2026-04-16 Codex

- `npm run lint --workspace @moment-pic/web`
  - 结果：通过�?- `npm run build --workspace @moment-pic/server`
  - 结果：通过�?
## 2026-04-16 Codex

- `npm run lint --workspace @moment-pic/web`
  - 结果：通过�?- `npm run build --workspace @moment-pic/server`
  - 结果：通过�?
## 2026-04-16 Codex

- `npm run lint --workspace @moment-pic/web`
  - 结果：通过�?
## 2026-04-18 Codex

- `npm run lint --workspace @moment-pic/web`
  - �����ͨ����
- `npm run build --workspace @moment-pic/web`
  - �����ͨ����
  - ��ע������˼��е� circular chunk ���棬����Ӱ�칹���������ɡ�


## 2026-04-18 Codex�����䣩

- `npm run lint --workspace @moment-pic/web`
  - �����ͨ����
## 2026-04-18 Codex�����䣩

- `npm run lint --workspace @moment-pic/web`
  - �����ͨ����
- `npm run build --workspace @moment-pic/web`
  - �����ͨ����
  - ��ע������˼��е� circular chunk ���棬����Ӱ�칹���������ɡ�
## 2026-04-18 Codex�����䣩

- `npm run lint --workspace @moment-pic/web`
  - �����ͨ����
- `npm run build --workspace @moment-pic/web`
  - �����ͨ����
  - ��ע������˼��е� circular chunk ���棬����Ӱ�칹���������ɡ�
## 2026-04-18 Codex�����䣩

- `npm run lint --workspace @moment-pic/web`
  - �����ͨ����
- `npm run build --workspace @moment-pic/web`
  - �����ͨ����
  - ��ע������˼��е� circular chunk ���棬����Ӱ�칹���������ɡ�
## 2026-04-18 Codex�����䣩

- `npm run lint --workspace @moment-pic/web`
  - �����ͨ����
- `npm run build --workspace @moment-pic/web`
  - �����ͨ����
  - ��ע������˼��е� circular chunk ���棬����Ӱ�칹���������ɡ�
## 2026-04-18 Codex����β��

- `npm run lint --workspace @moment-pic/web`
  - �����ͨ����
- `npm run build --workspace @moment-pic/web`
  - �����ͨ����
  - ��ע������˼��е� circular chunk ���棬����Ӱ�칹���������ɡ�
## 2026-05-09 Codex

- `npm run build --workspace @moment-pic/server`
  - 结果：通过。
- `npm run lint --workspace @moment-pic/web`
  - 结果：通过。
- `npm run build --workspace @moment-pic/web`
  - 结果：通过；Vite 输出既有 circular chunk 警告，不影响构建产物生成。
- `node --import tsx --test apps/server/src/services/directory-album-service.test.ts apps/server/src/services/library-scanner.test.ts`
  - 结果：通过，3 个测试通过。
- `node --import tsx --test apps/server/src/**/*.test.ts`
  - 结果：通过，30 个测试通过。
- 追加验证：目录相册接口烟测 `GET /api/v1/albums/directory-tree` 通过，已确认缺失磁盘目录不会导致根页 500。
- 追加验证：`node --import tsx --test --test-concurrency=1 apps/server/src/**/*.test.ts` 使用隔离 SQLite 通过，30 个测试通过。

## 2026-05-09 Codex

- `docker --version`
  - 结果：通过，Docker CLI 可用，版本 29.3.1。
- `docker buildx version`
  - 结果：通过，Buildx 可用，版本 v0.32.1-desktop.1。
- `docker buildx build --platform linux/arm64 -f Dockerfile.arm64 -t moment-pic:arm64-test --load .`
  - 结果：未执行到构建阶段；Docker Desktop Linux daemon 未运行，报错为无法连接 `npipe:////./pipe/dockerDesktopLinuxEngine`。
  - 风险评估：当前失败属于本机 Docker 引擎状态问题，不是 Dockerfile 语法或构建步骤执行失败；启动 Docker Desktop 后可使用同一命令继续验证。

## 2026-05-09 Codex

- `node --import tsx --test apps/server/src/services/sqlite-store.test.ts`
  - 结果：通过，2 个测试通过，覆盖默认画质与页面跳转模式配置持久化。
- `npm run lint --workspace @moment-pic/web`
  - 结果：通过。
- `npm run build --workspace @moment-pic/server`
  - 结果：通过。
- `npm run build --workspace @moment-pic/web`
  - 结果：通过；Vite 输出既有 circular chunk 警告，不影响构建产物生成。

## 2026-05-09 Codex

- `Select-String -Path .github\workflows\docker.yml -Pattern 'setup-qemu-action|Generate ARM64 tags|Dockerfile.arm64|platforms: linux/arm64|arm64-tags|\$\{tag\}-arm64'`
  - 结果：通过，确认 workflow 包含 QEMU、ARM64 tag 派生、Dockerfile.arm64、linux/arm64 平台和 ARM64 tag 输出引用。
- Node 标签转换烟测
  - 输入：`latest`、`1.2.3`、`sha-abcdef0` 形式的完整镜像 tag。
  - 结果：输出 `latest-arm64`、`1.2.3-arm64`、`sha-abcdef0-arm64`，符合 tag 区分要求。
- YAML 工具验证
  - 结果：本机未安装 `actionlint`、`yq`、Ruby YAML 解析器，项目依赖中也没有 `yaml` 包；已完成静态内容检查，GitHub Actions 运行时仍需以远端执行结果为准。

## 2026-05-09 Codex

- 排查页面跳转设置保存链路。
- `curl` 登录当前 3211 后端后执行 PATCH `/api/v1/system-config`：`pageTransitionMode` 可从 `page` 更新为 `normal` 并在 GET 中读回。
- `npm run lint --workspace @moment-pic/web`：通过。
- `npm run build --workspace @moment-pic/server`：通过。
- `node --import tsx --test apps/server/src/services/sqlite-store.test.ts`：通过，2 个测试通过。
- `npm run build --workspace @moment-pic/web`：通过，存在既有 circular chunk 警告。

## 2026-05-10 Codex

- `npm run lint --workspace @moment-pic/web`
  - 结果：通过，`tsc --noEmit` 无类型错误。
- `npm run build --workspace @moment-pic/web`
  - 结果：通过；Vite 输出既有 `Circular chunk: vendor-misc -> vendor-react -> vendor-misc` 警告，不影响构建产物生成。
- 本地浏览器烟测（`http://127.0.0.1:3210`，临时手机视口 390x844）
  - 结果：通过。登录后进入 `album-0001`，打开大图查看器，点击“放大”后图片样式为 `scale(1.2)`；拖动后样式变为 `translate(65px, 48px) scale(1.2)`，确认放大状态下位移链路可用。
  - 说明：当前 in-app browser 工具无法可靠模拟真实双指触摸；本次已验证移动视口查看器、缩放按钮、拖拽位移和运行时错误。触摸拖动核心路径通过代码审查覆盖。
  - 控制台：仅观察到既有 `[WebSocket] Error: Event`，未发现本次查看器手势相关错误。

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

- `npm --workspace apps/server test`
  - 结果：通过，47 个服务端测试执行，44 个通过，3 个真实 CBR 集成测试因 `MOMENT_PIC_REAL_ARCHIVE_ROOTS` 未配置按预期跳过。
- `npm --workspace apps/web test`
  - 结果：通过，15 个前端细粒度测试通过；新增覆盖认证会话工具与智能相册规则草稿转换。
- `npm run lint:web`
  - 结果：通过，`tsc --noEmit` 无类型错误。
- `npm run build:server`
  - 结果：通过。
- `npm run build:web`
  - 结果：通过，Vite 成功生成生产构建产物。
- `npm test`
  - 结果：通过，覆盖服务端测试、前端测试、前端类型检查、服务端构建、前端构建。
- `npm run test:rust`
  - 结果：通过跳过；当前环境未安装或未暴露 `cargo`，脚本输出中文跳过说明并退出 0。

## 2026-05-15 Codex 继续执行剩余 P1 验证

- `npm --workspace apps/web test`
  - 结果：通过，16 个前端测试通过，新增 viewer 画质 session 测试。
- `npm run lint:web`
  - 结果：通过。
- `npm --workspace apps/server test`
  - 结果：通过，51 个服务端测试执行，48 个通过，3 个真实 CBR 集成测试按预期跳过。
- `npm run build:server`
  - 结果：通过。
- `npm test`
  - 结果：通过，覆盖服务端测试、前端测试、前端类型检查、服务端构建、前端构建。
- `npm run test:rust`
  - 结果：通过跳过；当前环境未安装或未暴露 `cargo`。

## 2026-05-15 Codex AI Provider 与查看器拆分验证

- `npm --workspace apps/server test`
  - 结果：通过，54 个服务端测试执行，51 个通过，3 个真实 CBR 集成测试按预期跳过。
- `npm --workspace apps/web test`
  - 结果：通过，16 个前端测试通过。
- `npm run lint:web`
  - 结果：通过。
- `npm run build:server`
  - 结果：通过。
- `npm run build:web`
  - 结果：通过。
- `npm test`
  - 结果：通过，覆盖服务端测试、前端测试、前端类型检查、服务端构建、前端构建。
- `npm run test:rust`
  - 结果：通过跳过；当前环境未安装或未暴露 `cargo`。

## 2026-05-15 Codex Viewer Hooks 与智能相册设置 UI 验证

- `npm --workspace apps/web test`
  - 结果：通过，16 个前端测试通过。
- `npm run lint:web`
  - 结果：通过。
- `npm test`
  - 结果：通过，覆盖服务端测试、前端测试、前端类型检查、服务端构建、前端构建。
- `npm run test:rust`
  - 结果：通过跳过；当前环境未安装或未暴露 `cargo`。

## 2026-05-15 Codex 智能相册 AI 配置面板验证

- `npm --workspace apps/web test`
  - 结果：通过，16 个前端测试通过。
- `npm run lint:web`
  - 结果：通过。
- `npm test`
  - 结果：通过，覆盖服务端测试、前端测试、前端类型检查、服务端构建、前端构建。
- `npm run test:rust`
  - 结果：通过跳过；当前环境未安装或未暴露 `cargo`。

## 2026-05-15 Codex Viewer 手势、缩略图服务与规则编辑验证

- `npm --workspace apps/web test`
  - 结果：通过，18 个前端测试通过；新增智能相册成员列表筛选/排序测试。
- `npm run lint:web`
  - 结果：通过。
- `npm --workspace apps/server test`
  - 结果：通过，54 个服务端测试执行，51 个通过，3 个真实 CBR 集成测试按预期跳过。
- `npm run build:server`
  - 结果：通过。
- `npm test`
  - 结果：通过，覆盖服务端测试、前端测试、前端类型检查、服务端构建、前端构建。
- `npm run test:rust`
  - 结果：通过跳过；当前环境未安装或未暴露 `cargo`。

## 2026-05-15 Codex App 与 GalleryScreen 继续拆分验证

- `npm --workspace apps/web test`
  - 结果：通过，21 个前端测试通过；新增 `gallery-screen-state` 纯函数测试。
- `npm run lint:web`
  - 结果：通过。
- `npm test`
  - 结果：通过，覆盖服务端测试、前端测试、前端类型检查、服务端构建、前端构建。
- `npm run test:rust`
  - 结果：通过跳过；当前环境未安装或未暴露 `cargo`。

## 2026-05-15 Codex GalleryAlbumGrid 继续拆分验证

- `npm --workspace apps/web test`
  - 结果：通过，23 个前端测试通过；新增 `gallery-album-card-kind` 卡片分派测试。
- `npm run lint:web`
  - 结果：通过。
- `npm test`
  - 结果：通过，覆盖服务端测试、前端测试、前端类型检查、服务端构建、前端构建。
- `npm run test:rust`
  - 结果：通过跳过；当前环境未安装或未暴露 `cargo`。

## 2026-05-16 Codex App 图库模型与筛选动作拆分验证

- `npm --workspace apps/web test`
  - 结果：通过，26 个前端测试通过；新增 `gallery-screen-model` 图库页模型测试。
- `npm run lint:web`
  - 结果：通过。
- `npm test`
  - 结果：通过，覆盖服务端测试、前端测试、前端类型检查、服务端构建、前端构建。
- `npm run test:rust`
  - 结果：通过跳过；当前环境未安装或未暴露 `cargo`。

## 2026-05-16 Codex 缩略图内存回归修复验证

- `npm --workspace apps/server test`
  - 结果：通过，56 个服务端测试执行，53 个通过，3 个真实 CBR 集成测试因未配置 `MOMENT_PIC_REAL_ARCHIVE_ROOTS` 按预期跳过。
  - 新增覆盖：普通文件 Sharp 输入使用文件路径而非 Buffer；缺少宽高且无 Sharp 输入时不读取原图。
- `npm run build:server`
  - 结果：通过。
- `npm test`
  - 结果：通过，覆盖服务端测试、前端测试、前端类型检查、服务端构建、前端构建。

## 2026-05-16 Codex CBR/RAR 内存错误修复验证

- `npm --workspace apps/server test`
  - 结果：通过，58 个服务端测试执行，55 个通过，3 个真实 CBR 集成测试因未配置 `MOMENT_PIC_REAL_ARCHIVE_ROOTS` 按预期跳过。
  - 新增覆盖：CBR 路径的 Buffer 读取通过 7z extraction；CBR 路径的原图回源 body 通过 7z extraction 流式读取。
- `npm run build:server`
  - 结果：通过。
- `npm test`
  - 结果：通过，覆盖服务端测试、前端测试、前端类型检查、服务端构建、前端构建。

## 2026-05-16 Codex 图片接口高并发压测验证

- `node .codex/image-load-test.mjs` with `LOAD_SAMPLE_COUNT=18 LOAD_CONCURRENCY=96 LOAD_ROUNDS=8`
  - 结果：完成 513 个请求；463 个 200，50 个 503；无 500，无 `Not enough memory`。
  - 说明：503 响应为 `{"code":5003,"message":"thumbnail service busy, retry later"}`，是缩略图请求闸门的预期背压。
  - 服务端峰值 WorkingSet：约 160.5 MiB。
- `node .codex/image-load-test.mjs` with `LOAD_SAMPLE_COUNT=18 LOAD_CONCURRENCY=64 LOAD_ROUNDS=8`
  - 结果：完成 513 个请求；513 个 200；无 500，无 `Not enough memory`。
  - 服务端峰值 WorkingSet：约 163.2 MiB。
- 未覆盖项：未找到可用的图片类真实 `.rar/.cbr` 样本；本轮真实高并发覆盖大图目录与 7z 图片归档，CBR/RAR 内容读取由单元测试覆盖 7z extraction 路径。

## 2026-05-16 Codex 线上 preview 空响应修复验证

- 线上复核：使用用户提供 cookie 请求 preview URL，响应为 `200 image/jpeg`，但 `Content-Length: 0`，实际下载 0 字节；未出现 `Not enough memory`。
- `npm --workspace apps/server test`
  - 结果：通过，59 个服务端测试执行，56 个通过，3 个真实 CBR 集成测试因未配置 `MOMENT_PIC_REAL_ARCHIVE_ROOTS` 按预期跳过。
  - 新增覆盖：0 字节 preview 缓存文件不会被视为 ready，`ensurePreview` 会重新生成非空缓存。
- `npm run build:server`
  - 结果：通过。
- `npm test`
  - 结果：通过，覆盖服务端测试、前端测试、前端类型检查、服务端构建、前端构建。

## 2026-05-16 Codex 大图分页索引回退修复验证

- `npm --workspace apps/web test`
  - 结果：通过，27 个前端测试通过。
  - 新增覆盖：viewer 在第 24 张触发分页追加到 48 张时保持当前索引，pending advance 后进入第 25 张。
- `npm run lint:web`
  - 结果：通过，TypeScript 类型检查无错误。
- `npm run build:web`
  - 结果：通过，Vite 生产构建成功。

## 2026-05-16 Codex 首页前端异常修复验证

- `npm run lint --workspace @moment-pic/web`
  - 结果：通过，TypeScript 类型检查无错误。
- `npm run test --workspace @moment-pic/web`
  - 结果：通过，27 个前端测试通过。
- `npm run build:web`
  - 结果：通过，Vite 生产构建成功。
- 未执行项：Codex in-app browser 本轮拒绝访问 `http://localhost:3210`，因此未完成浏览器截图复验；未使用其他浏览器自动化绕过限制。

## 2026-05-16 Codex 大图结束跳转提示修复验证

- `npm --workspace apps/web test`
  - 结果：通过，29 个前端测试通过。
  - 新增覆盖：前进到最后一张且没有更多图片时显示结束提示；目录相册 album 节点可作为下一图集候选。
- `npm run lint:web`
  - 结果：通过，TypeScript 类型检查无错误。
- `npm run build:web`
  - 结果：通过，Vite 生产构建成功。

## 2026-05-16 Codex 大图结束提示触发时机调整验证

- `npm --workspace apps/web test`
  - 结果：通过，29 个前端测试通过。
  - 覆盖：最后一张再点下一张才进入 `show-end-prompt`，进入最后一张本身仍是 `advance`。
- `npm run lint:web`
  - 结果：通过。
- `npm run build:web`
  - 结果：通过。

## 2026-07-05 Codex 图集收藏与分享功能验证

- `npm run build:server`
  - 结果：通过，服务端 TypeScript 构建成功。
- `npm run lint --workspace @moment-pic/web`
  - 结果：通过，前端 TypeScript 类型检查无错误。
- `npm run test --workspace @moment-pic/server`
  - 结果：通过，58 项服务端测试通过，3 项真实归档集成测试因未配置 `MOMENT_PIC_REAL_ARCHIVE_ROOTS` 跳过。
- `npm run test --workspace @moment-pic/web`
  - 结果：通过，29 项前端测试通过。
- `npm run build --workspace @moment-pic/web`
  - 结果：通过，Vite 生产构建成功。
- 未执行项：未启动真实浏览器进行端到端点击烟测；本轮通过类型检查、单元测试和生产构建覆盖主要回归风险。
