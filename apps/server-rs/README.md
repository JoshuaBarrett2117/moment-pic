# Rust Backend Scaffold

日期：2026-04-10
执行者：Codex

## 目标

该目录提供 `moment-pic` 后端 Rust 化重构的起步骨架，当前先完成：

1. `axum` 服务基础结构
2. `GET /api/v1/health` 健康检查
3. 可独立运行的端口监听（默认 `3320`）

## 启动

```bash
cd apps/server-rs
cargo run
```

## 后续迁移建议

1. 先迁移扫描管线（目录遍历 + SQLite 增量更新）
2. 再迁移只读查询接口（图集列表、资源列表）
3. 最后迁移缩略图与静态文件服务
