# 数据库与 API 设计草案

日期：2026-04-09
执行者：Codex

## 1. 设计目标

本设计草案服务于第一阶段开发，目标是：

1. 支持目录图集和 ZIP 图集的统一建模
2. 支持图库首页、图集详情页和图片查看器
3. 支持缩略图缓存与原图访问
4. 为后续增量扫描、搜索和扩展格式预留空间

当前只覆盖第一阶段所需核心结构，不引入收藏、标签、浏览历史等附加能力。

## 2. 设计原则

### 2.1 统一抽象

无论图片来自目录还是 ZIP，前端看到的都应该是统一的：

1. 图集 `Album`
2. 图片资源 `Asset`

后端通过来源字段和定位字段区分其真实来源。

### 2.2 前端只依赖业务 ID

前端不直接使用宿主机路径或 ZIP 条目路径，只通过：

1. `albumId`
2. `assetId`

访问数据和图片资源。

### 2.3 先保证可用，再预留扩展

数据库字段只保留当前阶段真正需要的内容，但会预留后续增量扫描和格式扩展所需的基础字段。

## 3. 核心实体

## 3.1 Album

图集是展示和浏览的一级单元。

来源分两类：

1. `folder`
2. `zip`

示例：

1. `/data/library/风景1` -> `风景1`
2. `/data/library/风景2.zip` -> `风景2`

## 3.2 Asset

图片资源是图集中的单张图片。

它可能来自：

1. 文件夹中的实际图片文件
2. ZIP 包中的某个条目

## 3.3 LibraryRoot

第一阶段即使只支持一个根目录，也建议保留 `library_roots` 表，避免后续扩展多目录时重构主逻辑。

## 4. 数据库设计

数据库建议采用：`SQLite`

## 4.1 library_roots

用途：

1. 记录被扫描的图库根目录
2. 记录根目录状态和最近扫描时间

建议字段：

| 字段名 | 类型 | 说明 |
| --- | --- | --- |
| id | text | 主键，UUID |
| path | text | 根目录路径，例如 `/data/library` |
| name | text | 根目录显示名，例如 `默认图库` |
| enabled | integer | 是否启用，`1` 启用，`0` 禁用 |
| last_scanned_at | text | 最近扫描时间，ISO 时间字符串 |
| created_at | text | 创建时间 |
| updated_at | text | 更新时间 |

约束建议：

1. `path` 唯一

## 4.2 albums

用途：

1. 存放图集主记录
2. 提供首页图集卡片所需数据

建议字段：

| 字段名 | 类型 | 说明 |
| --- | --- | --- |
| id | text | 主键，UUID |
| library_root_id | text | 所属图库根目录 ID |
| name | text | 图集名称，例如 `风景1` |
| source_type | text | 来源类型，`folder` 或 `zip` |
| source_path | text | 图集源路径，例如 `/data/library/风景1` 或 `/data/library/风景2.zip` |
| source_mtime | integer | 图集源最后修改时间戳，便于增量更新 |
| cover_asset_id | text | 封面图片 ID，可为空，扫描完成后回填 |
| asset_count | integer | 图片总数 |
| scan_status | text | 扫描状态，例如 `ready`、`error` |
| error_message | text | 扫描异常信息，可为空 |
| created_at | text | 创建时间 |
| updated_at | text | 更新时间 |

约束建议：

1. `source_path` 唯一
2. `source_type` 仅允许 `folder`、`zip`

索引建议：

1. `idx_albums_library_root_id`
2. `idx_albums_name`
3. `idx_albums_source_type`

## 4.3 assets

用途：

1. 存放图集内单张图片
2. 支撑详情页缩略图列表和大图查看

建议字段：

| 字段名 | 类型 | 说明 |
| --- | --- | --- |
| id | text | 主键，UUID |
| album_id | text | 所属图集 ID |
| name | text | 文件名，例如 `001.jpg` |
| extension | text | 扩展名，例如 `jpg` |
| source_type | text | 来源类型，冗余存储，`folder` 或 `zip` |
| source_path | text | 对目录图为图片实际路径；对 ZIP 图为 ZIP 文件路径 |
| relative_path | text | 对目录图为相对图库根目录路径；对 ZIP 图可为空 |
| zip_entry_path | text | ZIP 条目路径，仅 ZIP 图片使用 |
| sort_index | integer | 排序序号 |
| width | integer | 图片宽度，可为空，首次解析后补齐 |
| height | integer | 图片高度，可为空，首次解析后补齐 |
| size_bytes | integer | 文件大小或条目大小，可为空 |
| source_mtime | integer | 源资源修改时间戳 |
| thumbnail_key | text | 缩略图缓存键 |
| created_at | text | 创建时间 |
| updated_at | text | 更新时间 |

约束建议：

1. `album_id + sort_index` 唯一
2. 对目录图片，`source_path` 应唯一
3. 对 ZIP 图片，建议 `source_path + zip_entry_path` 唯一

索引建议：

1. `idx_assets_album_id`
2. `idx_assets_album_id_sort_index`
3. `idx_assets_thumbnail_key`

## 4.4 thumbnails

用途：

1. 管理缩略图缓存
2. 支持后续缓存失效和重建

第一阶段这个表不是必须，但我建议保留，能让缓存管理更清晰。

建议字段：

| 字段名 | 类型 | 说明 |
| --- | --- | --- |
| id | text | 主键，UUID |
| asset_id | text | 所属图片 ID |
| cache_key | text | 缓存唯一键 |
| format | text | 缩略图格式，例如 `jpeg`、`webp` |
| width | integer | 缩略图宽度 |
| height | integer | 缩略图高度 |
| file_path | text | 缩略图缓存文件路径 |
| status | text | 状态，例如 `ready`、`stale`、`error` |
| created_at | text | 创建时间 |
| updated_at | text | 更新时间 |

约束建议：

1. `asset_id` 唯一
2. `cache_key` 唯一

## 5. 表关系

关系如下：

1. 一个 `library_root` 对应多个 `albums`
2. 一个 `album` 对应多个 `assets`
3. 一个 `asset` 对应零个或一个 `thumbnail`

可以表示为：

```text
library_roots
  └─ albums
       └─ assets
            └─ thumbnails
```

## 6. 字段设计说明

## 6.1 为什么 albums 和 assets 都保留 source_type

因为在资源访问层，直接从 `asset` 就能判断读取方式，避免每次都先关联 `album` 查询。

这是一个轻度冗余，但能简化图片读取逻辑。

## 6.2 为什么 assets 同时保留 source_path 和 zip_entry_path

因为目录图片和 ZIP 图片的读取方式不同：

1. 目录图片只需要真实文件路径
2. ZIP 图片需要 ZIP 文件路径 + 条目路径

这样统一后，读取逻辑很清晰：

1. `folder`：直接读 `source_path`
2. `zip`：打开 `source_path` 指向的 ZIP，再读 `zip_entry_path`

## 6.3 为什么保留 source_mtime

用于后续：

1. 判断是否需要重扫
2. 判断缩略图是否过期
3. 支持增量更新

## 7. 数据示例

## 7.1 albums 示例

```json
{
  "id": "alb_001",
  "library_root_id": "root_001",
  "name": "风景1",
  "source_type": "folder",
  "source_path": "/data/library/风景1",
  "source_mtime": 1770000000,
  "cover_asset_id": "ast_001",
  "asset_count": 12,
  "scan_status": "ready",
  "error_message": null
}
```

```json
{
  "id": "alb_002",
  "library_root_id": "root_001",
  "name": "风景2",
  "source_type": "zip",
  "source_path": "/data/library/风景2.zip",
  "source_mtime": 1770001000,
  "cover_asset_id": "ast_101",
  "asset_count": 20,
  "scan_status": "ready",
  "error_message": null
}
```

## 7.2 assets 示例

目录图图片：

```json
{
  "id": "ast_001",
  "album_id": "alb_001",
  "name": "001.jpg",
  "extension": "jpg",
  "source_type": "folder",
  "source_path": "/data/library/风景1/001.jpg",
  "relative_path": "风景1/001.jpg",
  "zip_entry_path": null,
  "sort_index": 1
}
```

ZIP 图图片：

```json
{
  "id": "ast_101",
  "album_id": "alb_002",
  "name": "001.jpg",
  "extension": "jpg",
  "source_type": "zip",
  "source_path": "/data/library/风景2.zip",
  "relative_path": null,
  "zip_entry_path": "001.jpg",
  "sort_index": 1
}
```

## 8. API 设计

建议统一前缀：

```text
/api/v1
```

返回格式建议统一：

```json
{
  "code": 0,
  "message": "ok",
  "data": {}
}
```

错误格式建议统一：

```json
{
  "code": 4001,
  "message": "album not found"
}
```

## 8.1 图库根目录接口

### GET /api/v1/library-roots

用途：

1. 获取当前图库根目录配置

返回示例：

```json
{
  "code": 0,
  "message": "ok",
  "data": [
    {
      "id": "root_001",
      "name": "默认图库",
      "path": "/data/library",
      "enabled": true,
      "lastScannedAt": "2026-04-09T10:00:00Z"
    }
  ]
}
```

### POST /api/v1/library-roots

用途：

1. 新增图库根目录

第一阶段如果只支持单目录，这个接口可以先保留不开放 UI。

请求示例：

```json
{
  "name": "默认图库",
  "path": "/data/library"
}
```

## 8.2 扫描接口

### POST /api/v1/scan

用途：

1. 手动触发全量重扫

请求示例：

```json
{
  "libraryRootId": "root_001"
}
```

返回示例：

```json
{
  "code": 0,
  "message": "ok",
  "data": {
    "taskId": "scan_001",
    "status": "started"
  }
}
```

### GET /api/v1/scan/status/:taskId

用途：

1. 查询扫描任务状态

返回示例：

```json
{
  "code": 0,
  "message": "ok",
  "data": {
    "taskId": "scan_001",
    "status": "completed",
    "albumsDiscovered": 2,
    "assetsDiscovered": 32,
    "startedAt": "2026-04-09T10:00:00Z",
    "finishedAt": "2026-04-09T10:00:05Z"
  }
}
```

第一阶段如果不做异步任务系统，也可以退化为同步接口：

1. `POST /api/v1/scan`
2. 接口执行扫描后直接返回结果

## 8.3 图集接口

### GET /api/v1/albums

用途：

1. 获取图集列表
2. 支持首页卡片展示

查询参数建议：

1. `page`
2. `pageSize`
3. `sourceType`，可选

返回示例：

```json
{
  "code": 0,
  "message": "ok",
  "data": {
    "items": [
      {
        "id": "alb_001",
        "name": "风景1",
        "sourceType": "folder",
        "assetCount": 12,
        "coverUrl": "/api/v1/assets/ast_001/thumbnail",
        "updatedAt": "2026-04-09T10:00:00Z"
      },
      {
        "id": "alb_002",
        "name": "风景2",
        "sourceType": "zip",
        "assetCount": 20,
        "coverUrl": "/api/v1/assets/ast_101/thumbnail",
        "updatedAt": "2026-04-09T10:00:00Z"
      }
    ],
    "pagination": {
      "page": 1,
      "pageSize": 20,
      "total": 2
    }
  }
}
```

### GET /api/v1/albums/:albumId

用途：

1. 获取图集基础信息
2. 提供详情页头部信息

返回示例：

```json
{
  "code": 0,
  "message": "ok",
  "data": {
    "id": "alb_001",
    "name": "风景1",
    "sourceType": "folder",
    "assetCount": 12,
    "coverAssetId": "ast_001",
    "updatedAt": "2026-04-09T10:00:00Z"
  }
}
```

### GET /api/v1/albums/:albumId/assets

用途：

1. 获取图集内图片列表
2. 支持详情页缩略图网格
3. 支持查看器切图

查询参数建议：

1. `page`
2. `pageSize`

第一阶段如果图集规模不大，也可以先不分页，直接返回全量。

返回示例：

```json
{
  "code": 0,
  "message": "ok",
  "data": {
    "album": {
      "id": "alb_001",
      "name": "风景1",
      "assetCount": 12
    },
    "items": [
      {
        "id": "ast_001",
        "name": "001.jpg",
        "width": 1280,
        "height": 720,
        "sortIndex": 1,
        "thumbnailUrl": "/api/v1/assets/ast_001/thumbnail",
        "originalUrl": "/api/v1/assets/ast_001/original"
      },
      {
        "id": "ast_002",
        "name": "002.jpg",
        "width": 1280,
        "height": 720,
        "sortIndex": 2,
        "thumbnailUrl": "/api/v1/assets/ast_002/thumbnail",
        "originalUrl": "/api/v1/assets/ast_002/original"
      }
    ],
    "pagination": {
      "page": 1,
      "pageSize": 100,
      "total": 12
    }
  }
}
```

## 8.4 图片接口

### GET /api/v1/assets/:assetId

用途：

1. 获取单张图片元数据
2. 供查看器按 ID 定位时使用

返回示例：

```json
{
  "code": 0,
  "message": "ok",
  "data": {
    "id": "ast_001",
    "albumId": "alb_001",
    "name": "001.jpg",
    "width": 1280,
    "height": 720,
    "sortIndex": 1,
    "thumbnailUrl": "/api/v1/assets/ast_001/thumbnail",
    "originalUrl": "/api/v1/assets/ast_001/original"
  }
}
```

### GET /api/v1/assets/:assetId/thumbnail

用途：

1. 返回图片缩略图
2. 首次访问时自动触发生成

返回：

1. `image/jpeg` 或 `image/webp`

实现建议：

1. 命中缓存时直接返回文件
2. 未命中时读取原图并生成缩略图

### GET /api/v1/assets/:assetId/original

用途：

1. 返回原图内容
2. 用于大图查看

返回：

1. 原始图片流

实现建议：

1. 目录图直接读文件
2. ZIP 图按条目读取并流式返回

## 8.5 健康检查接口

### GET /api/v1/health

用途：

1. 容器探活
2. 运维检查

返回示例：

```json
{
  "code": 0,
  "message": "ok",
  "data": {
    "status": "ok"
  }
}
```

## 9. 前后端 DTO 建议

## 9.1 AlbumListItemDTO

```ts
type AlbumListItemDTO = {
  id: string;
  name: string;
  sourceType: "folder" | "zip";
  assetCount: number;
  coverUrl: string | null;
  updatedAt: string;
};
```

## 9.2 AssetListItemDTO

```ts
type AssetListItemDTO = {
  id: string;
  name: string;
  width: number | null;
  height: number | null;
  sortIndex: number;
  thumbnailUrl: string;
  originalUrl: string;
};
```

## 9.3 AlbumDetailDTO

```ts
type AlbumDetailDTO = {
  id: string;
  name: string;
  sourceType: "folder" | "zip";
  assetCount: number;
  coverAssetId: string | null;
  updatedAt: string;
};
```

## 10. 第一阶段推荐简化点

为了尽快落地，我建议第一阶段做以下简化：

1. 只支持一个 `library_root`
2. `POST /scan` 可以先做同步扫描
3. 图集详情图片列表可以先不分页
4. `thumbnails` 表可以先保留，但实现上允许“无记录时现算现存”
5. 暂不处理重名图集冲突，只要求 `source_path` 唯一

## 11. 当前最建议的实施顺序

下一步如果进入开发，我建议顺序是：

1. 先把 `albums / assets / library_roots` 三张表定下来
2. 实现目录扫描和 ZIP 扫描入库
3. 先做 `GET /albums` 和 `GET /albums/:id/assets`
4. 再做 `GET /assets/:id/thumbnail`
5. 最后做 `GET /assets/:id/original`

这样最短路径能先把前端首页和详情页跑通。

## 12. 我对这版设计的建议结论

如果你认可第一阶段追求的是“先跑通完整浏览链路”，那这版库表和 API 已经足够作为开发契约。

最关键的 3 个实现约束是：

1. 前端永远只认 `albumId` 和 `assetId`
2. 后端永远通过统一模型屏蔽目录和 ZIP 的差异
3. 图片访问永远走受控接口，不暴露宿主机真实路径

