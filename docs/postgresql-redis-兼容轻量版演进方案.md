# PostgreSQL 与 Redis 兼容轻量版演进方案

日期：2026-04-30  
执行者：Codex

## 1. 背景与目标

当前服务端业务主路径直接依赖 SQLite 访问层，列表接口还使用进程内 `Map` 做短 TTL 缓存，缩略图文件继续落盘到 `CACHE_DIR`。从现状看，项目已经具备轻量部署优势，但在以下场景会逐步遇到瓶颈：

- 图库数量增大后，SQLite 在并发读写、跨实例共享方面扩展性有限
- 当前缓存仅在单进程内生效，无法跨进程复用
- 如果未来需要多实例部署，扫描状态、热点列表和缓存失效都缺少统一协调点

本次规划目标：

- 默认保持当前轻量模式，无需 PostgreSQL、Redis 也能直接运行
- 当用户同时配置 PostgreSQL 与 Redis 后，系统自动从当前存储迁移
- 迁移成功后自动切换到增强模式
- 对业务接口尽量保持无感，避免前端和路由层大范围改造

## 2. 当前现状

结合代码现状，可以确认以下事实：

- 当前配置入口位于 [apps/server/src/config/env.ts](/C:/Users/a3875/Documents/code/moment-pic/apps/server/src/config/env.ts)
- 当前业务数据库实现位于 [apps/server/src/db/sqlite.ts](/C:/Users/a3875/Documents/code/moment-pic/apps/server/src/db/sqlite.ts)
- 当前业务访问层集中在 [apps/server/src/services/sqlite-store.ts](/C:/Users/a3875/Documents/code/moment-pic/apps/server/src/services/sqlite-store.ts)
- 当前相册列表缓存是 [apps/server/src/services/album-service.ts](/C:/Users/a3875/Documents/code/moment-pic/apps/server/src/services/album-service.ts) 内的进程内 `Map`
- Prisma 已引入，但实际业务主路径尚未通过 Prisma 访问数据库，见 [apps/server/prisma/schema.prisma](/C:/Users/a3875/Documents/code/moment-pic/apps/server/prisma/schema.prisma) 与 [apps/server/src/db/client.ts](/C:/Users/a3875/Documents/code/moment-pic/apps/server/src/db/client.ts)
- 历史上还保留了 JSON 索引存储能力，见 [apps/server/src/services/index-store.ts](/C:/Users/a3875/Documents/code/moment-pic/apps/server/src/services/index-store.ts)，但当前主业务已不依赖它

因此，“自动迁移”应以 **SQLite 为主迁移源**，并保留 **JSON 索引兜底导入能力**。

## 3. 目标形态

### 3.1 运行模式

定义两种明确模式：

- `lite`：SQLite + 本地文件缓存目录 + 进程内缓存
- `enhanced`：PostgreSQL + Redis + 本地文件缓存目录

说明：

- 缩略图文件本身仍建议继续保存在本地挂载目录 `CACHE_DIR`
- Redis 负责热点缓存、分布式锁、任务状态和失效广播
- PostgreSQL 负责全部结构化元数据持久化

### 3.2 模式切换规则

建议新增统一配置判定逻辑：

- 当未配置 PostgreSQL 与 Redis 时，自动进入 `lite`
- 当同时配置 PostgreSQL 与 Redis 时，自动进入“增强候选态”
- 启动时先执行迁移检查；迁移成功后进入 `enhanced`

建议不要在第一阶段支持“只配 PostgreSQL 不配 Redis”或“只配 Redis 不配 PostgreSQL”的半增强模式，原因如下：

- 需求表述本身要求 PostgreSQL 与 Redis 成对出现
- 半增强模式会带来更多组合测试成本
- 当前项目还没有存储抽象层，先收敛组合有利于尽快落地

## 4. 配置设计

建议在现有环境变量基础上新增以下配置：

```env
STORAGE_PROFILE=auto
DATABASE_URL=file:/data/gallery.sqlite
REDIS_URL=
AUTO_MIGRATE_TO_POSTGRES=true
AUTO_IMPORT_LEGACY_JSON=true
STORAGE_MIGRATION_STRATEGY=fail-fast
```

配置含义建议如下：

- `STORAGE_PROFILE`
  - `auto`：默认值，按配置自动判定
  - `lite`：强制轻量模式
  - `enhanced`：强制增强模式
- `DATABASE_URL`
  - `file:` 开头视为 SQLite
  - `postgresql:` 或 `postgres:` 开头视为 PostgreSQL
- `REDIS_URL`
  - 非空则视为 Redis 已配置
- `AUTO_MIGRATE_TO_POSTGRES`
  - 当检测到增强配置时，是否自动迁移 SQLite 数据
- `AUTO_IMPORT_LEGACY_JSON`
  - 当 SQLite 不存在但存在 `index.json` 时，允许导入历史数据
- `STORAGE_MIGRATION_STRATEGY`
  - `fail-fast`：迁移失败直接启动失败，避免用户误以为已切换成功
  - `fallback-lite`：迁移失败记录告警并继续用 SQLite 启动

建议默认使用 `fail-fast`，避免出现“用户以为在 PostgreSQL/Redis 上运行，实际仍在 SQLite”这种隐性状态漂移。

## 5. 架构改造方案

### 5.1 先抽象存储接口，再替换实现

不建议直接在 `sqlite-store.ts` 上硬改出 PostgreSQL 分支。更稳妥的方案是先抽象出统一仓储接口，例如：

```ts
type GalleryRepository = {
  listLibraryRoots(): LibraryRootRecord[];
  findLibraryRootById(id: string): LibraryRootRecord | null;
  upsertLibraryRoot(root: LibraryRootRecord): void;
  listAlbums(...): { items: AlbumRecord[]; total: number };
  findAlbumById(id: string): AlbumRecord | null;
  listAssetsByAlbumId(...): AssetRecord[];
  upsertThumbnail(thumbnail: ThumbnailRecord): void;
  getSystemConfig(): SystemConfigRecord;
  updateSystemConfig(...): SystemConfigRecord;
  replaceSmartAlbums(...): void;
  // 其他现有读写能力继续补齐
};
```

第一阶段建议保留两个实现：

- `sqlite-gallery-repository.ts`
- `postgres-gallery-repository.ts`

并新增一个装配层：

- `storage-provider.ts`：根据配置返回当前活动仓储

### 5.2 缓存抽象

当前只有相册列表做了进程内缓存，建议抽象为统一缓存接口：

```ts
type CacheStore = {
  get<T>(key: string): Promise<T | null>;
  set<T>(key: string, value: T, ttlSeconds: number): Promise<void>;
  del(key: string): Promise<void>;
  delByPrefix?(prefix: string): Promise<void>;
};
```

实现分为：

- `memory-cache-store.ts`
- `redis-cache-store.ts`

首批接入 Redis 的位置建议只覆盖高收益热点：

- 相册列表查询缓存
- 最近浏览相册列表缓存
- 智能相册列表缓存
- 扫描任务状态缓存
- 分布式锁

### 5.3 启动编排

建议新增启动编排顺序：

1. 解析环境变量并识别目标模式
2. 初始化 SQLite 读取能力
3. 若目标为增强候选态，则先连接 PostgreSQL 与 Redis
4. 执行自动迁移检查
5. 迁移成功后装配 PostgreSQL 仓储与 Redis 缓存
6. 否则按配置策略失败或回退

## 6. 自动迁移方案

### 6.1 迁移触发条件

满足以下条件时触发迁移：

- `DATABASE_URL` 指向 PostgreSQL
- `REDIS_URL` 已配置
- `AUTO_MIGRATE_TO_POSTGRES=true`
- PostgreSQL 目标库尚未完成同版本迁移标记

### 6.2 迁移元数据表

建议在 PostgreSQL 新增迁移记录表：

```sql
storage_migrations (
  id text primary key,
  source_type text not null,
  source_version text not null,
  source_fingerprint text not null,
  status text not null,
  started_at timestamptz not null,
  finished_at timestamptz,
  error_message text
)
```

用途：

- 防止重复导入
- 记录来源快照
- 为后续增量迁移或排障留痕

### 6.3 迁移流程

建议流程如下：

1. 先在 PostgreSQL 获取全局迁移锁
2. 检测目标库是否为空，若非空则校验是否已完成迁移
3. 以只读事务方式导出 SQLite 全量数据
4. 若 SQLite 不存在，则尝试读取 `index.json` 做历史导入
5. 按依赖顺序写入 PostgreSQL：
   - `library_roots`
   - `albums`
   - `assets`
   - `thumbnails`
   - `system_config`
   - `album_views`
   - `smart_albums`
   - `smart_album_members`
   - `smart_album_match_records`
   - `smart_album_rules`
   - `smart_album_ai_configs`
6. 导入完成后写入 `storage_migrations` 成功记录
7. 清理 Redis 相关缓存键
8. 切换运行时存储实现到 `enhanced`

### 6.4 迁移一致性策略

建议使用“启动时迁移 + 启动前无写流量”的模型，而不是在线双写，原因如下：

- 当前项目是单体服务，启动迁移成本低
- 现有代码没有统一仓储抽象，双写复杂度高
- 用户场景以本地部署为主，可接受一次启动期迁移

即：

- 服务启动时完成迁移
- 迁移未完成前不对外提供写接口
- 不做 SQLite 与 PostgreSQL 长期双写

### 6.5 失败处理

建议默认行为：

- 迁移失败时，服务直接启动失败
- 日志中明确指出失败阶段、失败表、失败条数和重试建议

可选兼容行为：

- 若配置 `STORAGE_MIGRATION_STRATEGY=fallback-lite`，则迁移失败后回退到 SQLite 模式

## 7. PostgreSQL 与 Redis 的职责边界

### 7.1 PostgreSQL 负责

- 所有业务元数据的持久化
- 分页、排序、筛选、聚合查询
- 智能相册规则与匹配结果存储
- 系统配置、最近浏览记录

### 7.2 Redis 负责

- 接口级热点缓存
- 分布式扫描锁
- 缓存失效广播
- 扫描任务状态、进度与心跳
- 防止重复缩略图生成的短期去重锁

### 7.3 仍然保留本地文件系统负责

- 原图库目录读取
- 缩略图二进制文件落盘
- SQLite 文件在轻量模式下的持久化

## 8. 推荐实施顺序

### 阶段 A：抽象层落地

- 新增 `storage-provider.ts`
- 抽象 `GalleryRepository`
- 抽象 `CacheStore`
- 让现有业务服务改为依赖接口而不是直接依赖 `sqlite-store.ts`

交付标准：

- 轻量模式功能不变
- 所有现有测试继续通过

### 阶段 B：PostgreSQL 仓储落地

- 将 Prisma `datasource` 调整为支持 PostgreSQL
- 新增 PostgreSQL 仓储实现
- 补齐与 SQLite 等价的读写能力

交付标准：

- 在不接入 Redis 的开发环境里可单独验证 PostgreSQL 仓储
- 与 SQLite 查询结果保持一致

### 阶段 C：Redis 缓存与锁

- 接入 Redis 客户端
- 替换相册列表 `Map` 缓存
- 增加扫描任务锁与缓存失效机制

交付标准：

- 相册列表缓存命中率可观测
- 多实例下缓存一致性可验证

### 阶段 D：自动迁移

- 增加启动迁移检查
- 增加 SQLite 全量导出与 PostgreSQL 全量导入
- 增加迁移元数据表与迁移日志

交付标准：

- 从现有 SQLite 启动切换到 PostgreSQL/Redis 时可自动完成迁移
- 失败时具备明确可恢复策略

### 阶段 E：文档与容器支持

- 更新 `.env.example`
- 更新 `docker-compose.yml`
- 增加 PostgreSQL、Redis 的可选服务模板
- 更新 README 的部署说明

## 9. 对现有代码的具体改动建议

优先级最高的改动点：

- [apps/server/src/services/sqlite-store.ts](/C:/Users/a3875/Documents/code/moment-pic/apps/server/src/services/sqlite-store.ts)
  - 拆分为接口定义 + SQLite 实现
- [apps/server/src/services/album-service.ts](/C:/Users/a3875/Documents/code/moment-pic/apps/server/src/services/album-service.ts)
  - 将 `Map` 缓存替换为可插拔缓存接口
- [apps/server/src/services/library-scanner.ts](/C:/Users/a3875/Documents/code/moment-pic/apps/server/src/services/library-scanner.ts)
  - 改为通过仓储接口读写扫描结果
- [apps/server/src/services/thumbnail-service.ts](/C:/Users/a3875/Documents/code/moment-pic/apps/server/src/services/thumbnail-service.ts)
  - 增加 Redis 去重锁，避免并发重复生成
- [apps/server/src/config/env.ts](/C:/Users/a3875/Documents/code/moment-pic/apps/server/src/config/env.ts)
  - 增加运行模式与迁移策略配置
- [apps/server/prisma/schema.prisma](/C:/Users/a3875/Documents/code/moment-pic/apps/server/prisma/schema.prisma)
  - 调整为兼容 PostgreSQL 的模型定义与迁移方式

## 10. 风险与决策

### 10.1 主要风险

- 现有业务层直接依赖 SQLite 函数，抽象改造面较大
- Prisma schema 与手写 SQLite DDL 存在并行维护痕迹，需要统一
- 自动迁移一旦设计成“静默回退”，容易造成用户误判实际存储状态
- 缩略图仍在本地磁盘，未来若做多实例部署需要共享卷或对象存储

### 10.2 关键决策建议

- 第一阶段只支持 `lite` 与 `enhanced` 两种模式，不支持半增强组合
- 只支持 `SQLite -> PostgreSQL` 单向自动迁移
- 增强模式必须 `PostgreSQL + Redis` 同时存在
- 自动迁移默认 `fail-fast`
- 不做长期双写，只做启动时一次性迁移
- 缩略图文件先继续本地落盘，不把二进制内容迁入 PostgreSQL

## 11. 最终规则清单

结合已确认需求，建议将实现规则固定为以下版本。

### 11.1 模式判定

- 未配置 PostgreSQL 与 Redis 时，系统进入 `lite`
- 同时配置 PostgreSQL 与 Redis 时，系统进入增强候选态
- 仅配置其中一个时，视为非法增强配置，启动失败并提示用户必须同时配置

### 11.2 迁移方向与时机

- 仅支持 `SQLite -> PostgreSQL` 单向自动迁移
- 不支持 `PostgreSQL -> SQLite` 自动回迁
- 迁移只允许在服务启动阶段执行
- 运行中不做热迁移

### 11.3 迁移成功后的主存储

- 迁移成功后，PostgreSQL 成为唯一结构化主库
- Redis 成为唯一分布式缓存与锁服务
- SQLite 不再继续双写
- 原 SQLite 文件仅作为历史保留，是否删除由用户后续手动决定

### 11.4 迁移失败处理

- 迁移失败时，服务直接启动失败
- 不允许静默回退到 SQLite
- 启动日志必须明确打印失败阶段、失败对象和修复建议

### 11.5 用户撤销增强配置后的行为

- 允许用户删除 PostgreSQL/Redis 配置后重新进入 `lite`
- 但不自动把 PostgreSQL 数据反向迁回 SQLite
- 回到 `lite` 后继续读取本地现有 SQLite 数据
- 若 SQLite 数据已落后于 PostgreSQL，用户需要接受旧数据状态或手动重新扫描

### 11.6 Redis 首阶段职责

- 相册列表缓存
- 最近访问列表缓存
- 扫描任务状态缓存
- 分布式锁

首阶段不建议把更多状态堆进 Redis，优先保证缓存与锁的确定性。

## 12. 验收标准

完成实现后，建议以以下结果作为验收：

- 未配置 PostgreSQL 与 Redis 时，系统默认按当前 SQLite 方案运行
- 配置 PostgreSQL 与 Redis 且目标库为空时，首次启动自动完成迁移
- 迁移完成后，相册、资源、缩略图记录、系统配置、智能相册数据全部可读
- Redis 缓存生效，列表接口在重复访问时命中缓存
- 关闭 PostgreSQL/Redis 配置后，系统仍可按轻量模式独立运行
- 启动日志能明确打印当前运行模式、迁移状态与目标存储

## 13. 推荐下一步

最合适的下一步不是直接改业务逻辑，而是先做“存储抽象层 + 缓存抽象层”。这一步完成后，后续 PostgreSQL、Redis 和自动迁移都可以分阶段接入，风险会明显更低。
