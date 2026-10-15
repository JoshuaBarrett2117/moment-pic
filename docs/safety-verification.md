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

ZIP/7z/RAR/CBR 读取共用并发 4、排队 32 的预算，默认墙钟 30 秒、单条目解压 256MiB、列表输出 8MiB、条目数 50,000。子进程输出背压传递给 stdout；错误输出限制 64KiB。正常结束、断开、进程异常和限额都走清理路径；子进程必须真实 close 后才释放槽位，不把 stdout end 当作进程退出。

ZIP 在 open 回调前就监听取消：调用方立即收到取消/超时，未归还的文件系统操作仍占用预算，延迟返回的句柄被关闭，真实 close 后才释放槽位。ZIP 查找条目与列举一样遵守列表预算。

取消、预算繁忙、超时、字节/条目/错误输出限制具有可识别错误类型，禁止管理路由 fallback 到原图后重启解压。可用归档程序之间只允许启动 ENOENT/EACCES 时切换，控制类错误不得重试。RAR/CBR 不再走不可取消的同步解压器；缺少支持 RAR 的完整 7z/7zz 时明确失败。

`archive-followup.log` 22/22 通过，含真实 ZIP/7z、延迟 ZIP open、真实子进程 close 记账、慢消费者、四类清理、实际管理/分享路由与 HTTP 断开；`archive-typecheck.log` 通过。后续最终门禁会单独保留归档四路径日志。

原有 3 个跳过项依赖外部图库中的特定 RAR/CBR。现已替换为临时目录构造的真实 RAR4 stored 格式（含头部与数据 CRC），覆盖 110 页、81 页及实际 JPEG 解压；不再读取环境提供的外部媒体路径。`archive-real-rar.log` 14/14、零跳过，额外覆盖真实 RAR 的条目/字节上限与 PSD 缓冲取消。stored fixture 验证 RAR 容器与完整 7z 读取路径，不声称覆盖所有 RAR 压缩算法或密码/多卷变体。

开发与 CI 需安装完整 7z/7zz（Ubuntu/Debian 的 `7zip` 包），精简 `7zip-bin` 不是完整 RAR 解码器。CI 质量门禁已声明此依赖。本机仅在 TMPDIR 下载并使用官方独立 7zz 26.04，下载来源和执行结果见 `sevenzip-download-index.log`、`sevenzip-download.log`，未修改系统安装或运行任何容器。

## 最新请求与前端生命周期

相册、图片、最近访问、目录、图库根、系统配置、智能相册列表/详情使用可取消的最新请求代次。旧 success/error/finally 不改变当前数据、错误或 loading；卸载取消请求。图库控制器在查询/页面切换时取消旧请求，异步刷新在 await 后再次检查查询代次；智能相册详情和成员的两个 await 都有检查。

`latest-and-scan-web.log` 前端 49/49、零跳过取消，包含 7 个实际 Hook 的乱序/取消测试、智能相册两阶段请求和实际图库控制器。测试使用 React renderer，不仅测试辅助函数。测试工具的 renderer 已被 React 标记 deprecated，当前测试可用；后续可单独评估替换工具，不在本次安全修复引入并行测试框架。
