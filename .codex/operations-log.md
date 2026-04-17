# operations-log

## 2026-04-13 Codex

- 任务：将图库默认排序调整为按更新时间倒序，并确认高级设置轮询默认开启、间隔为 60000 毫秒。
- 处理：
  - 修改后端 `listAlbumsDb` 与相册列表缓存默认排序为 `updatedAt desc`。
  - 修改前端图库初始筛选与 URL 同步规则，默认值统一为 `updatedAt desc`。
  - 复核高级设置默认值，现有数据库初始化和界面兜底均已满足“默认开启 + 60000”。
- 验证：
  - `npm run build --workspace @moment-pic/server` 通过。
  - `npm run build --workspace @moment-pic/web` 失败，环境中缺少前端依赖可执行文件。
  - `npm run lint --workspace @moment-pic/web` 失败，当前环境缺少 `react`、`vite` 等依赖解析。
## 2026-04-16 Codex

- 任务：将相册页图库列表尺寸调大。
- 处理：调整 `apps/web/src/components/GalleryScreen.tsx` 中网格最小列宽、卡片内边距、封面间距，以及标题和数量字号。
- 验证：`npm run lint --workspace @moment-pic/web` 通过。

## 2026-04-16 Codex

- 任务：将相册详情页资产列表尺寸也调整到 `220px` 起步。
- 处理：修改 `apps/web/src/components/AlbumDetailScreen.tsx` 的资产网格为自适应 `minmax(220px, 1fr)`，并同步骨架屏。
- 验证：`npm run lint --workspace @moment-pic/web` 通过。

## 2026-04-16 Codex

- 任务：把相册页与相册详情页的卡片宽度做成系统配置项。
- 处理：新增 `albumListItemMinWidth` 与 `albumDetailItemMinWidth` 两个系统配置字段，接入后端 SQLite 初始化、API、前端设置页和两个列表页面。
- 验证：`npm run lint --workspace @moment-pic/web`、`npm run build --workspace @moment-pic/server` 通过。

## 2026-04-16 Codex

- 任务：把相册页与相册详情页的卡片宽度拆成移动端和桌面端两套配置。
- 处理：新增 4 个系统配置字段，前端设置页改为分别编辑移动端/桌面端宽度，图库页与详情页按设备类型读取对应值。
- 验证：`npm run lint --workspace @moment-pic/web`、`npm run build --workspace @moment-pic/server` 通过。
