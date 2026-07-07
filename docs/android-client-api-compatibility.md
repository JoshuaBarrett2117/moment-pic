# Android 客户端 API 兼容说明

本文档记录第三方或官方 Android 客户端接入 Moment Pic 后端时，建议优先依赖的稳定 API 子集。目标是在不改变现有 Web 端体验的前提下，让移动端客户端可以先实现登录、相册浏览、图片浏览和手动扫描等核心能力。

## 兼容目标

Android 客户端第一阶段建议只依赖 `/api/v1` 下的基础接口：

- 登录与会话 Cookie。
- 相册分页、搜索和排序。
- 相册内图片分页。
- 缩略图、预览图和原图读取。
- 手动触发图库扫描与轮询扫描状态。

移动端不应在第一阶段假设后端支持多用户管理、公开分享、收藏同步、增量扫描或目录配置管理。这些能力如果后续进入后端稳定接口，再单独补充兼容说明。

## 登录

```http
POST /api/v1/auth/login
Content-Type: application/json

{
  "username": "admin",
  "password": "..."
}
```

客户端需要保存响应中的 `Set-Cookie`，后续请求带上同一个 Cookie。登录失败时按响应 `message` 展示错误即可。

## 相册列表

```http
GET /api/v1/albums?page=1&pageSize=24&keyword=&sortBy=updatedAt&sortOrder=desc
```

建议客户端支持的查询参数：

| 参数 | 说明 |
| :--- | :--- |
| `page` | 从 1 开始的页码 |
| `pageSize` | 每页数量，移动端建议 24 |
| `keyword` | 相册名搜索关键词，可为空 |
| `sortBy` | `updatedAt`、`name`、`assetCount` |
| `sortOrder` | `asc` 或 `desc` |
| `libraryRootId` | 可选，按图库来源过滤 |
| `sourceType` | 可选，`folder` 或 `zip` |

客户端需要读取响应中的 `items` 和 `pagination.total`。相册封面优先使用 `coverUrl`；如果为空，可以进入相册后用第一张图片缩略图作为兜底封面。

## 图片列表

```http
GET /api/v1/albums/{albumId}/assets?page=1&pageSize=120
```

客户端需要读取响应中的 `items` 和 `pagination.total`。每个图片条目建议依赖：

- `id`
- `name`
- `thumbnailUrl`
- `originalUrl`
- `width` / `height`
- `sortIndex`

`thumbnailUrl` 和 `originalUrl` 如果是相对路径，客户端应按后端服务地址补全为绝对 URL。

## 图片资源

后端当前提供以下资源读取接口：

```http
GET /api/v1/assets/{assetId}/thumbnail
GET /api/v1/assets/{assetId}/preview
GET /api/v1/assets/{assetId}/original
```

移动端列表页建议使用 `thumbnail`，大图查看页可使用 `original`，在网络较慢或图片很大时可先使用 `preview` 作为过渡。

## 手动扫描

```http
POST /api/v1/scan
Content-Type: application/json

{
  "libraryRootId": "optional-root-id"
}
```

响应会返回 `taskId`。客户端可轮询：

```http
GET /api/v1/scan/{taskId}
```

移动端应把该能力展示为“重新扫描”或“刷新图库”。当前 `/api/v1` 扫描接口没有 dry-run、增量刷新和全量刷新语义，客户端不要把它标记为增量或全量模式。

## Android 客户端降级建议

如果同一个 Android 客户端同时兼容其他后端版本，建议启动时做协议探测：

1. 优先尝试目标版本的健康检查或登录接口。
2. 如果 `/api/v2` 不可用，再尝试 `/api/v1/auth/login`。
3. 在 `/api/v1` 模式下隐藏或禁用后端不支持的功能，并给出明确提示。

`/api/v1` 模式下建议保留：

- 登录。
- 相册列表、搜索、排序。
- 图片列表、缩略图、原图查看。
- 本地收藏。
- 手动重新扫描。

`/api/v1` 模式下建议隐藏或提示不支持：

- 多用户管理。
- 普通账号相册授权。
- 公开分享链接。
- 后端收藏同步。
- dry-run、增量扫描、全量扫描。
- 图库来源新增、启用和禁用。

## 回归检查

移动端或第三方客户端接入后，建议至少验证：

- 登录成功和登录失败提示。
- 首页相册分页加载。
- 相册名搜索。
- 按更新时间和相册名排序。
- 进入相册后图片分页加载。
- 缩略图显示和原图打开。
- 手动扫描后任务状态能轮询到完成或失败。