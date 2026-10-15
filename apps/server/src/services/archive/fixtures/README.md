# RAR 回归夹具

日期：2026-10-16；执行者：Codex。

`pixel.png` 是本项目生成的 1×1 红色 PNG，无第三方图片或归档内容。
`pixel-rar4.cbr`、`pixel-rar5.cbr` 分别使用相邻的 `rar-test-fixture.ts`
中的 stored RAR4/RAR5 生成器封装该图片，包含真实文件校验和与归档头校验和。
这些原创测试数据以 CC0-1.0 提供，可自由分发。

提交修复前，用 node-unrar-js 2.0.2 的真实 WASM `createExtractorFromData`
独立解码两份夹具并逐字节比较 PNG；公共 API 回归应在旧实现失败。
验证日志保存在 `/opt/data/output/momentpic-rar-verification`。
