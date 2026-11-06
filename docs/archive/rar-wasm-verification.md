# RAR4/RAR5 纯 WASM 流式修复

日期：2026-10-16；执行者：Codex。

## 动机与运行要求

基线 `da0ed1c968326ad98247c74f74f5f4c77283f6aa` 的 CBR reader 直接转交
7z。Debian DFSG 7zz 和内置 7za 不提供 RAR 解码，导致真实 RAR 回归。
本次固定生产依赖 `node-unrar-js` 2.0.2，RAR4/RAR5 根据 7/8 字节魔数识别；
不支持或截断的 RAR 签名直接失败。非 RAR 的伪装 CBR 仍走既有 7z reader；
ZIP/CBZ/7z 的实现保持不变。

运行时只需 Node 22 与生产依赖。已阅读 Dockerfile，worker 随 tsc 输出为 JS，
WASM 随 node_modules 复制；镜像清理规则保留两者。不需要系统 unrar、RAR 插件或 tsx。
本地没有构建/运行镜像，不能把静态检查称为镜像验收。

## 已检查的真实 API 与取舍

检查发布包 `dist/index.js`、`dist/js/Extractor.js`、`ExtractorFile.js`、
`ExtractorData.js`、`unrar.singleton.js` 及上游 C++/JS bridge。
`createExtractorFromData` 会缓冲完整输入/输出，不能用于生产流式读取；
默认 `ExtractorFile.create/write` 则写入真实磁盘，也不能直接使用。

适配器仅通过 `createExtractorFromFile` 初始化 WASM，并使用其 `unrar` 模块构造
`Extractor` 子类；重新绑定 `module.extractor` 接管桥接实际调用的
`open/create/read/write/tell/seek/closeFile`。访问 protected 模块的类型收敛在适配边界，
因此固定依赖版本，升级时必须复核桥接契约和生产测试。

- 输入仅打开指定归档的只读 FD，通过 WASM heap 直接分段读取；禁止分卷和外部引用。
- 所有输出都是虚拟句柄；路径不参与文件系统写入，绝不创建解压文件或临时输出。
- 非 solid 归档只提取目标，无关前置条目通过 RAR_SKIP 跳过，包括加密附件；
  加密目标仍明确拒绝。归档的 solid 标记决定是否显式解码全部前置文件，不能只
  判断当前条目的 solid 标记（链首通常未标记）。solid 前置文件的所有 write
  实际字节计入同一个 256 MiB 默认预算，再决定丢弃或发送；必要的加密依赖拒绝。
  不盲目对 solid 前置文件调用 RAR_SKIP，以免解码器隐藏处理绕过实际字节计量。
- 每个头部（包括非图片）都计数，序列化元数据与注释都计入 8 MiB 列表预算。
  列表接口可用 maxBytes 设置更低预算；缓冲和流式提取也限制扫描到的元数据。
- RAR 的所有诊断 stdout/stderr 合并限制为 64 KiB，不积累无限错误字符串。

## 背压与所有权

每次传输最多 64 KiB，生产者必须先取得共享原子 credit，再复制并转移该片段。
父线程仅在 Readable 请求数据或 push 返回可继续时给予下一份 credit。
当消费者暂停，真实 WASM write 钩子通过 Atomics.wait 同步阻塞；不是完整解压
条目后再包装流。原生解码器仍有自身工作区和有限写块，不能将该机制说成
“WASM 内部内存只有 64 KiB”。

魔数检查先取得共享 archiveBudget 的许可，RAR 分支把同一许可转交给 worker。
取消与墙钟超时覆盖排队、尚未完成的魔数读取、启动、同步解码及暂停阶段。
若魔数读取尚未完成，调用方可以先失败，但 FD 实际关闭后才释放该阶段的许可。
非 RAR 分支在关闭检查 FD 后释放检查许可，再使用原有 7z 调度；外层截止时间
保持不变，不能借切换分支重置墙钟上限。

AbortSignal、下游 destroy、错误或超限都会调用 Worker.terminate，不等待同步
WASM 或 Atomics.wait 响应消息。正常 done 不结束输出或释放许可；必须等 exit。
错误也只在 exit 后释放，释放函数和终止请求均幂等。trackUnmanagedFds 确保
强制终止时回收 worker 的同步打开 FD。

解码失败使用 ArchiveDecodeError（ARCHIVE_DECODE_ERROR，HTTP 422）；控制错误
保留原类型。管理/分享缩略图、预览图不能借原图 fallback 重启损坏的 RAR。
正常 PNG/JPEG 流不缓冲整个条目；显式 buffer API 和既有 PSD 内嵌 JPEG 路径
仍按原契约收集有字节上限的数据。

## 夹具与验证证据

`apps/server/src/services/archive/fixtures` 内为原创 CC0 1×1 PNG 与两份 tiny stored
RAR（RAR4 158 字节、RAR5 143 字节）。修复前由真实 WASM 独立解码并逐字节比较，
然后通过公共 archive API 运行回归：2 个失败，退出 1。先提交此失败检查点，
再修改实现，没有替换或弱化旧测试。

证据目录：`/opt/data/output/momentpic-rar-verification`。

- `fixture-wasm.log`：独立 WASM 解码结果。
- `repro-before.log`：未修改实现的真实失败与退出码；必须保留。
- `repro-after.log`：同一公共 API PNG 回归修复后通过。
- `rar-complete-targeted.log`：真实 RAR、资源控制、生产 JS 与 HTTP 断开定向测试。
- 早期调试失败日志保留，不能当作最终通过证据。

测试覆盖正常结束、CRC 损坏、缺失条目、解压与列表上限、solid 前置输出、真实
背压、AbortSignal、同步解码中取消、公共流 destroy、HTTP 管理/分享断开、暂停
超时、排队取消/超时/耗尽、延迟魔数读取、共享注入和默认预算、worker 意外退出、
路径不落盘以及编译后 worker 在空 PATH 下的真实解码。

## 独立复核修正（2026-10-16；Codex）

- 非 solid RAR4/RAR5 的 2048 字节无关附件不再触发 1024 字节预算失败；
  目标 PNG 为 90 字节，真实写钩子计数也必须恰好为 90，而非仅断言返回内容。
- 加密附件使用原创 RAR4 AES-128-CBC 密文、真实 salt 与 CRC；独立 WASM
  使用测试密码提取并比较原文，证明不是只设置 encrypted 标记。无密码定向提取
  未加密 PNG 可成功；公共 API 同样成功，但拒绝加密目标和 solid 加密前置依赖。
- solid 归档依据归档级标记显式解码前置输出；测试包含未标 solid 的链首和中间
  条目、恰好预算与少 1 字节失败。曾尝试按条目边界跳过前置内容，但真实解码器
  仍在 solid 模式处理这些内容；该失败日志保留，未把隐藏工作排除在计量之外。
- 共享预算原有按 acquisitions 比较 releases 的修正已在 `26b5534` 中存在，
  本轮新增空 PATH 分支证明系统 7zz/7z 缺失时仍能使用 bundled fallback。
  两分支本机实际都是 acquisitions=4、releases=4，最终 active=0、queued=0。
- 管理/分享路由已包含 ArchiveDecodeError 禁止 fallback，本轮不重复修改生产
  路由；扩充 TimeoutError 和诊断超限，8 类错误 × 3 种资源 × 2 类路由共
  48 个组合均只尝试一次。真实 HTTP 断开、取消与损坏 RAR 测试也通过。
- 夹具说明的 helper 路径改为 `fixtures/../rar-test-fixture.ts`；实际验证文件存在，
  重新生成的 RAR4/RAR5 与提交夹具逐字节一致，独立 WASM 解码 PNG 一致。

本轮日志单独保存在 `/opt/data/output/momentpic-rar-verification/review-2026-10-16/`，
不覆盖首次修复证据。`repro-before-real.log` 使用最终测试与真实 AES 夹具，仅将
临时编译目录的 worker 换成 `ca8504f` 原始源码：3 失败、1 通过、退出 1；
换回修复后的 worker，完全相同测试在 `repro-after-real.log` 为 4/4、退出 0。
生产源码未为复现而回滚。早期 `repro-before.log`、中途失败的 `repro-after.log`
以及 `targeted-passing.log` 均保留，不作为最终全量门禁替代品。

## 最终门禁结果

验证工具链是官方 Node 22.23.3 / npm 10.9.9，下载包 SHA256 校验通过，保存在
仓库忽略的 `tmp/node-v22.23.3-linux-x64`。默认 Node 26 的 SQLite ABI 冒烟失败已
保存在 `environment-native.log`，没有重编译或更换现有原生依赖；改用 Node 22 后
临时内存 SQLite 冒烟与完整测试通过。`toolchain-checksum.log` 保存真实校验退出码。

所有最终命令退出 0，测试无跳过、取消或 TODO。基线 29 个服务端测试文件增加至
实际递归发现的 32 个；前端仍为 17 个。实际断言计数以本次输出为准，不沿用旧报告。
下表已更新为独立复核修正后的完整复跑，日志均位于上述 `review-2026-10-16/`
子目录；工具链下载校验和初始环境日志仍保留在父证据目录。

| 命令 | 结果 | 日志 |
| --- | --- | --- |
| 夹具 helper 路径、逐字节重新生成与独立 WASM 解码 | 通过 | `fixture-helper.log` |
| `node --import ./scripts/test-isolation.mjs --import tsx --test --test-concurrency=1 <递归发现的归档与清理文件>` | 11 文件，53/53 | `archive-cleanup-final.log` |
| `node --import ./scripts/test-isolation.mjs --import tsx --test --test-concurrency=1 <递归发现的 scan/share/auth 文件>` | 7 文件，35/35 | `scan-share-auth-final.log` |
| `node node_modules/typescript/bin/tsc -p apps/server/tsconfig.json --noEmit` | 通过 | `server-tsc-final.log` |
| `node node_modules/typescript/bin/tsc -p apps/web/tsconfig.json --noEmit` | 通过 | `web-tsc-final.log` |
| `npm run test:discovery` | 2/2 | `discovery-final.log` |
| `npm run test:server` | 32 文件，135/135 | `server-tests-final.log` |
| `npm run test:web` | 17 文件，82/82 | `web-tests-final.log` |
| `npm run lint:web` | 通过 | `web-lint-final.log` |
| `npm run build:server` | 通过 | `server-build-final.log` |
| `npm run build:web` | 通过 | `web-build-final.log` |
| `git diff --check` | 通过 | `diff-check-final.log` / `diff-check-postdocs.log` |
| `npm audit --omit=dev --json` | 0 漏洞 | `audit-production.json` / `audit-production.log` |

两组定向测试的日志首行保存完整展开的真实命令，没有使用 shell 的非递归 glob。
递归发现与运行脚本为现有 `scripts/discover-tests.mjs` / `scripts/test-workspace.mjs`。
生产 JS 测试也包含在完整服务端与归档测试中，明确记录空 PATH 下真实 RAR4/RAR5
PNG 逐字节一致，以及 ARCHIVE_STDERR_LIMIT / ARCHIVE_DECODE_ERROR 的回收结果。
`final-summary.log` 汇总命令退出码，`verification-summary.json` 保留实际测试计数、
预算计数、审计结果和本地提交。失败检查点和中途失败日志不覆盖、不伪装为通过。

## 本地提交与影响文件

- `d00b8aab299aea6a8cfdfaa84d21afa6d22f36ba`：原创 fixture 与预期失败回归检查点。
- `ca8504f86cb1b683836b5bc2a1768977919ef17f`：生产依赖、真实 WASM 写钩子与 credit worker。
- `26b5534ebf405efc443cb0c355b211f309b1ad13`：待定 I/O 许可转交、禁止损坏重试及完整资源回归。
- `94f41a3`：首次修复文档、README 和安全说明。
- `4490bb7`：独立复核修正、真实加密夹具及空 PATH/路由/生产 JS 回归。
- 最后一笔文档提交更新本轮复跑计数；SHA 见本轮证据目录的 `commits-final.log`。

运行代码仅影响 `apps/server/package.json`、根锁文件以及 archive 模块内的
`archive-limits.ts`、`cbr-reader.ts`、`rar-reader.ts`、`rar-worker.ts`、`rar-protocol.ts`。
测试/fixture 涉及相邻的 `rar-reader.test.ts`、`rar-safety.test.ts`、
`rar-production.test.ts`、`rar-test-fixture.ts`、`fixtures/*`，以及既有
`archive.test.ts`、`routes/archive-fallback.test.ts`、`routes/media-disconnect.test.ts`。
文档涉及根 README、本文件、`safety-verification.md` 与
`dependency-security-2026-10-15.md`。无数据库迁移、前端逻辑或部署配置变更。

## 限制

原创夹具覆盖真实 stored RAR4/RAR5 与 stored solid 链，不声称穷尽所有压缩方法、
加密、多卷、恢复记录或恶意原生解码器输入。加密提取、分卷与外部引用明确不支持；
非 solid 归档内无关加密附件不妨碍读取未加密目标。
WASM 内部字典/工作区不是流输出预算的一部分；worker 隔离、强制终止和输出预算
不等于对所有原生内存分配的硬配额，也不等于解码库没有未知漏洞。
所有数据库验证必须通过现有测试隔离 preload 使用临时 SQLite，禁止真实库或外部图库。
本次不连接 NAS、不操作真实数据库、不运行 Docker、不推送或部署。
