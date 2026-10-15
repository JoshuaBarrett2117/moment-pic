# 安全修复行为与验证

> 日期：2026-10-15；执行者：Codex

## 扫描与媒体元数据

扫描在某图库根发生任何枚举、相关文件 stat、媒体解析失败时，保守禁止该根删除旧索引；健康相册仍可更新。成功枚举确认消失的相册，才在同一事务删除其分享与媒体索引。替换相册不删除分享；全量与单相册重扫均保留收藏和分享身份。

先筛选相关图片/归档扩展名，再访问文件状态；不相关文件的断链不阻塞扫描，相关媒体断链仍报告失败。Sharp 未提供 BMP 解码器时只降级 BMP 的尺寸元数据，不使整个相册失败；支持格式的损坏输入仍使扫描失败并保留旧索引。BMP 缩略图可能不可生成，原图路径继续可用，不自研解码器。

`scan-followup-red-retry.log` 记录修复前 4 个真实回归失败；`scan-followup-green.log` 记录 16/16 通过，含 BMP、断链、收藏/分享跨重扫保留、确认删除、falsy rejection、损坏归档与原地覆盖。`scan-typecheck.log` 服务端类型检查通过。证据目录为 `/opt/data/output/momentpic-final-verification/`。

本轮数据库验证只使用测试预加载器创建的临时隔离 SQLite，不执行真实数据库连接、历史数据清理或 DBA 窗口操作。

## 扫描状态与 Settings 验收

扫描 API 返回 failureCount/outcome，完成、部分失败、完全失败都发送 scan_complete；异常、封面预热及历史相册错误只返回脱敏摘要。单相册重扫错误响应也不回传文件路径。前端失败/部分失败终态同样触发健康相册刷新，不能只处理 completed。Settings 显示独立错误提示，并接收应用 WS 错误；图库页保留全局提示，Settings 不重复展示两个横幅。

扫描 Hook 按图库根持有可取消请求与串行轮询；重复点击只发一次，清除、卸载、退出登录取消请求，旧轮询/恢复结果不能重启任务或覆盖新状态。三次轮询故障有明确脱敏错误。新增 API、Hook 与真实 Settings renderer 回归均通过。

最后补齐请求层直接返回取消错误的分支：该分支也删除 pending 状态并释放任务记录，不能静默卡住扫描按钮。`scan-cancel-red-baseline.log` 在 TMPDIR 中读取已提交源码的隔离副本，证明修复前此用例失败；`scan-cancel-final-web-retry.log` 50/50、零取消/跳过，`scan-cancel-final-types-retry.log` 通过。之前的试跑包含测试块错误嵌套导致的取消，已修正测试结构，最终只以零失败/零取消的完整复跑验收。

`scan-api-final.log` 实际 API/WS 与单相册失败脱敏通过；`scan-ui-delivery-web.log` 49/49；`scan-ui-delivery-types.log` 两端类型检查、`scan-ui-delivery-build.log` 前端构建均通过。`browser-delivery.log` 与 `browser-results.json` 记录两种真实浏览器模式：正常 WS 和拦截 WS 的轮询回退，均实际点击 Settings 扫描、看到失败提示、在仍处于 Settings 时收到健康相册刷新，返回图库看到新增相册，页面脚本错误为零。

截图为 `settings-scan-failure-{websocket,polling}.png`、`partial-healthy-gallery-{websocket,polling}.png`，均位于证据目录。无系统中文字体时，只在临时验收页面注入官方 Noto CJK 字体改善截图可读性，未修改应用字体依赖或安装系统包。

## 分享密码与异步认证

所有新分享仅保存随机盐的 scrypt 哈希；管理列表不返回密码，创建响应只展示一次，重置会使旧访问令牌失效。历史明文列、历史备份不由启动代码自动清理，仍需 DBA 窗口处理。

密码派生使用共享并发 2、排队 16、排队等待最多 5 秒的预算。客户端取消会立即停止等待，排队取消不启动派生；已经启动的原生 scrypt 必须等真实 callback 完成才释放槽位。认证等待之后重新读取分享的存在性、身份、密码哈希和有效期，撤销、重置或过期均不得签发会话。

`share-race-red.log` 为修复前竞态证据；`share-followup-green.log` 10/10 通过，覆盖原生 callback 取消记账、队列超时、撤销/重置/过期竞态、旧明文不回传、独立 IP/分享限流及真实 scrypt 响应性；`share-typecheck.log` 通过。

## WebSocket、Origin 与启动配置

HTTP Upgrade 必须具有有效会话与严格 Origin（协议、主机和端口均匹配）。缺失/null/恶意来源、畸形 Cookie、过期会话及异常路径均被拒绝；拒绝响应发送后主动销毁套接字，另有 250ms 清理兜底，不依赖对端主动结束半开连接。HTTP CORS 与 WS 采用同一允许来源策略，并设置 Vary: Origin，不信任任意 X-Forwarded-Host。

真实目录监听器广播图库相对路径；会话过期主动关闭，连接与发送预算受限。前端未登录不连接、退出不重连，网络故障可重连，过期会话通知登录。启动要求显式强管理员密码；HTTPS Cookie 只信任配置的反向代理。升级配置见 README 与 .env.example，不再保留默认弱密码。

`ws-close-red.log` 复现旧实现遗留半开连接；`ws-followup-green-retry.log` 10/10 通过（真实 TCP Upgrade、实际 watcher 文件事件、实际 CORS/认证路由）；`ws-typecheck.log` 通过。watcher 测试在临时 SQLite 中将默认 60 秒轮询改为 50ms，未改变生产配置或访问外部图库。

`startup-entry.log` 6/6 通过，额外通过真实 Node 子进程执行 index.ts 验证缺失/弱配置退出、无数据库创建、密码不回显。子进程只接收必要测试环境变量，dotenv 显式指向临时空文件，不读取仓库 .env；代理 HTTPS Cookie、伪造转发头、登录限流及 CORS 回归同时通过。

## 归档取消与资源所有权

ZIP/7z/RAR/CBR 读取共用并发 4、排队 32 的预算，默认墙钟 30 秒、解压输出 256MiB、列表输出 8MiB、条目数 50,000。7z 子进程背压传递给 stdout；RAR WASM worker 背压直接传递到同步写钩子；诊断输出限制 64KiB。正常结束、断开、异常和限额都走清理路径；子进程必须真实 close、worker 必须真实 exit 后才释放槽位，不把 stdout end 或解码 done 消息当作退出。2026-10-16 复核修正（执行者：Codex）：非 solid RAR 跳过无关前置条目及其加密检查；solid 归档仍显式解码并累计目标之前全部实际输出，防止遗漏解码器的隐藏工作。

ZIP 在 open 回调前就监听取消：调用方立即收到取消/超时，未归还的文件系统操作仍占用预算，延迟返回的句柄被关闭，真实 close 后才释放槽位。ZIP 查找条目与列举一样遵守列表预算。

取消、预算繁忙、超时、字节/条目/错误输出限制具有可识别错误类型，禁止管理路由 fallback 到原图后重启解压。RAR 解码损坏、worker 异常和不支持的 RAR 签名使用 `ARCHIVE_DECODE_ERROR`（HTTP 422），管理与分享路由也不得 fallback。非 RAR 的 7z 程序之间仍仅允许启动 ENOENT/EACCES 时切换。

`archive-followup.log` 22/22 通过，含真实 ZIP/7z、延迟 ZIP open、真实子进程 close 记账、慢消费者、四类清理、实际管理/分享路由与 HTTP 断开；`archive-typecheck.log` 通过。后续最终门禁会单独保留归档四路径日志。

原有 3 个跳过项已替换为临时目录构造的真实 RAR4 stored 格式（含头部与数据 CRC），覆盖 110 页、81 页及实际 JPEG 解压；不再读取外部媒体路径。历史 `archive-real-rar.log` 曾验证系统完整 7z 路径，但该证据不能说明 Debian DFSG 运行环境支持 RAR。2026-10-16 新增原创 CC0 RAR4/RAR5 PNG 夹具；真实 WASM 独立解码成功，而旧公共 API 的两个回归确实失败（退出 1）。新实现与新证据见 `rar-wasm-verification.md`。

RAR 运行时现只需要 Node 与生产依赖 `node-unrar-js` 2.0.2，不依赖系统 unrar、RAR-enabled 7zz 或开发期 tsx。旧 CI 中额外安装的 `7zip-rar` 不再是 RAR 解码前置条件；本次不改发布流程。生产 JS 测试在空 PATH、无 TS loader 的独立 Node 进程验证两种 RAR，并验证 worker 启动异常与诊断输出超限后的资源回收。

已检查 Dockerfile：构建产物包含 worker JS，复制的生产依赖包含 WASM；运行镜像的清理规则不会删除 `.wasm` 或 `.js`。RAR 不再要求 Debian 7zip 提供插件。仅做静态检查和本地生产 JS 验证，未构建或运行镜像，不能声称镜像已通过实测；未连接 NAS、未部署或推送。

## 最新请求与前端生命周期

相册、图片、最近访问、目录、图库根、系统配置、智能相册列表/详情使用可取消的最新请求代次。旧 success/error/finally 不改变当前数据、错误或 loading；卸载取消请求。图库控制器在查询/页面切换时取消旧请求，异步刷新在 await 后再次检查查询代次；智能相册详情和成员的两个 await 都有检查。

`latest-and-scan-web.log` 前端 49/49、零跳过取消，包含 7 个实际 Hook 的乱序/取消测试、智能相册两阶段请求和实际图库控制器。测试使用 React renderer，不仅测试辅助函数。测试工具的 renderer 已被 React 标记 deprecated，当前测试可用；后续可单独评估替换工具，不在本次安全修复引入并行测试框架。

## 最终交付复核（2026-10-16；Codex）

以下为源码提交 0a4cbc2 后的完整复跑；最终提交仅补充本节与公告撤回标注，不改变可执行代码。日志自身记录命令、Node 版本和退出码；全部证据位于 `/opt/data/output/momentpic-final-verification/`。

| 验证 | 最终日志 | 结果 |
| --- | --- | --- |
| 原生模块安装 | final-npm-ci.log | npm ci，未禁用安装脚本，退出 0 |
| Sharp / SQLite 冒烟 | dependency-native-smoke.log | 实际图片编码/元数据及内存 SQLite 查询，退出 0 |
| 递归 ts/tsx 发现 | final-discovery-verified.log | 2/2，零失败/取消/跳过，退出 0 |
| 服务端类型检查 | final-server-tsc-verified.log | tsc --noEmit，退出 0 |
| 前端类型检查 | final-web-tsc-verified.log | tsc --noEmit，退出 0 |
| 全部门禁 | final-quality-gate-verified.log | 29 个服务端测试文件 109/109、17 个前端测试文件 50/50，均零失败/取消/跳过；前端 lint、服务端构建、前端构建通过，退出 0 |
| 归档四类清理和路由 | archive-four-path.log | 24/24，零失败/取消/跳过，退出 0 |
| 实际浏览器 | browser-final-verified.log / browser-results.json | WS 和轮询两模式均看到 Settings 脱敏失败与健康相册刷新，页面脚本错误为零，退出 0 |
| 最终依赖审计 | final-audit-verified.log / final-audit-verified.json | 所有严重级别合计 0，退出 0 |
| 差异格式检查 | final-diff-check-verified.log | git diff --check，退出 0 |

运行时为 Node 22.23.3 / npm 10，本机默认 Node 26 未用于验收。RAR 使用 TMPDIR 内完整官方 7zz 26.04；测试只创建临时隔离数据库/缓存/图库。历史失败日志保留用于复现，不能替代上表最终成功结果。

未执行 push、Docker 构建/运行/推送、NAS 访问、真实数据库连接/清理或远程 GitHub Actions。Rust 未修改，未运行 cargo test。原始 77 项 WIP 保留在本地提交，未重置或丢弃。交付最后一次提交带 `[skip ci]`，避免父任务仅推源码时触发本次镜像流水线；后续显式构建仍由独立质量任务约束。历史明文及旧备份留待 DBA 处置，部署 RAR 解码器仍须单独验收，不能用本地通过替代部署验收。

## 最后一棒最小修复复核（2026-10-15 UTC；Codex）

以 `5b5e365` 为基线，先仅增加实际 React Hook/控制器回归并运行 RED，再修改实现；本节证据均位于 `/opt/data/output/momentpic-final-verification/`，不替代前述服务端、构建、浏览器和依赖审计记录。

- 图库控制器改用单调查询代次，刷新入口及根目录 await 后均检查存活/代次，阻止 A→B→A 与卸载后继续请求；查询/认证切换同时取消根目录读取，当前查询重新读取根目录。
- `useLatestRequest.begin` 卸载后返回已取消的非当前请求，所有读取调用方在启动 API 前检查；显式取消同步结束 loading，迟到 success/error/finally 不恢复状态。智能相册列表与详情使用独立请求槽及 loading，取消同时清理两槽。
- `useLibraryScan` 的轮询互斥、旧任务/恢复响应隔离、同步重复 POST 去重、迟到 POST/恢复卸载保护、终态只通知一次均已验证无需重写：RED 中扫描 14 项已有 12 项通过。仅保留的 scan 回调在卸载/禁用后仍能 POST 两项失败，补充当前 mounted/enabled 检查后扫描 14/14 通过。
- UI 项 1 已验证无需改动：保留现有脱敏摘要，完整前端测试包含 Settings 与图库控制器的失败/部分成功刷新及错误脱敏验证，不展示原始错误或路径。七条已撤回公告的既有记录未改动。

| 验证命令 | 日志 | 结果 |
| --- | --- | --- |
| Node test runner + test-isolation/tsx，三个实际 Hook/控制器测试文件 | last-leg-red.log | 48 项：22 通过、26 失败；零取消/跳过，退出 1（修复前） |
| 同一组测试与命令 | last-leg-green.log | 48/48；零失败/取消/跳过，退出 0 |
| npm run typecheck --workspace @moment-pic/server | last-leg-server-typecheck.log | 退出 0 |
| npm run typecheck --workspace @moment-pic/web | last-leg-web-typecheck.log | 退出 0 |
| npm run test:web（递归发现） | last-leg-web-full.log | 17 文件、82/82；零失败/取消/跳过，退出 0 |

运行时为 `/tmp/momentpic-tools/runtime/package/bin/node`（22.23.3），临时目录使用 `TMPDIR=/tmp/momentpic-tools/tmp`，测试仅用 mock/隔离临时数据。本轮仅前端请求生命周期修复，未重跑服务端测试、构建、浏览器、审计或 Rust；未变更依赖/凭据/环境配置，未提交、推送或操作 Docker/NAS/生产数据库。部署与历史数据风险仍沿用前述记录，由父任务完成交付。
