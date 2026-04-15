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
