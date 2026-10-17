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
