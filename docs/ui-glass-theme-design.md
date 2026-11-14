# moment-pic 前端 UI 重构设计：黑色磨砂玻璃主题与主题切换

版本 v0.1 · 2026-11-10 · 基于 main@bad6b30

## 0. 一句话结论

功能、路由、接口、交互逻辑全部不动，只换视觉层。先把现在写死的纸张风格抽成「主题」，再实现第一套主题「黑色磨砂玻璃（glass-dark）」。主题切换的架子一次搭好，以后加新主题只需新增一份 CSS 变量文件和一条注册项。

## 1. 目标与非目标

**目标**

- 全站统一为黑色磨砂玻璃风格：深色背景、半透明毛玻璃面板、细描边、柔和光晕。
- 建立主题系统：`data-theme` + CSS 变量 + `ThemeProvider`，设置页提供「外观」入口。
- 首版只提供 `glass-dark` 一个主题，切换入口和存储机制先就位。
- 视觉更克制：去掉旋转、歪斜、手写体等纸张元素，突出照片本身。

**非目标（本次不做）**

- 不改任何业务逻辑：`hooks/`、`app/use-gallery-data-controller.ts`、`lib/api.ts` 等保持原样。
- 不改路由、接口、权限、数据结构。
- 不改信息架构：页面、按钮、入口的数量和位置不变（只读角色看不到的入口依旧看不到）。
- 不做跟随系统、用户自定义配色（留给后续）。
  - 首版非目标里的浅色主题和自定义背景已在 v2 实现（浅色主题「玫瑰纸感」、自定义背景图），见文末 v2 一节，不再属于「不做」。
- 主题偏好暂不存服务端（见 4.7）。

## 2. 现状盘点

| 项 | 现状 | 对重构的影响 |
| --- | --- | --- |
| 样式方案 | Tailwind 4，`src/index.css` 的 `@theme` 定义约 50 个 Material 3 语义色（surface、on-surface、primary-container、outline 等） | 有利：组件大多用语义类名（`bg-surface`、`text-outline`），改变量即可换色 |
| 高频类 | `text-outline` 116 次、`text-on-surface` 73 次、`bg-surface-container-high` 43 次、`border-outline/20` 36 次 | 这几组 token 定准，八成界面就对了 |
| 纸张专用类 | `paper-grain`、`polaroid`、`wobbly-mask`、`wobbly-border`、`sticky-note`、`washi-tape`、`ambient-shadow` | 这些是风格本身，必须改成语义类，按主题实现 |
| 纸张组件 | `PaperGrain`、`Polaroid`、`WobblyButton`，约 8 个文件引用；`AlbumDetailScreen` 有多处 `wobbly-mask` 和 `-rotate-2` | 主要改造对象 |
| 字体 | Epilogue（标题）、Plus Jakarta Sans（正文）、Caveat（手写，用于「设置」「分享管理」等标题） | 玻璃主题去掉手写体 |
| 大图页 | `ViewerGalleryStyles.tsx` 内联 `<style>`，硬编码 `rgba(255,255,255,0.2)` 等 | 改为读 CSS 变量 |
| 动效 | `motion/react`（已升 14），`Polaroid` 悬停 `scale 1.05` + 旋转归零 | 保留动效库，改参数 |
| 硬编码颜色 | 组件内约 20 处 `rgba()`，1 处十六进制 | 逐个换成变量 |

## 3. 视觉语言

### 3.1 关键词

深邃、通透、安静、以照片为主角。参考 visionOS 和 macOS 的材质：背景暗，面板半透明并模糊背后内容，边缘用一像素高光勾出层次。

### 3.2 色板（glass-dark）

| Token | 值 | 用途 |
| --- | --- | --- |
| `--mp-bg` | `#0B0D12` | 页面底色 |
| `--mp-bg-glow-1` | `rgba(99,102,241,0.22)` 靛蓝 | 背景光晕 1 |
| `--mp-bg-glow-2` | `rgba(45,212,191,0.14)` 青绿 | 背景光晕 2 |
| `--mp-surface-1` | `rgba(255,255,255,0.06)` | 一级玻璃（侧栏、顶栏、筛选条） |
| `--mp-surface-2` | `rgba(255,255,255,0.09)` | 二级玻璃（卡片、输入框悬停） |
| `--mp-surface-3` | `rgba(255,255,255,0.14)` | 三级玻璃（弹层、浮动按钮、选中态） |
| `--mp-field` | `rgba(0,0,0,0.28)` | 输入框底（比面板更深） |
| `--mp-border` | `rgba(255,255,255,0.12)` | 常规描边 |
| `--mp-border-strong` | `rgba(255,255,255,0.20)` | 悬停、聚焦描边 |
| `--mp-highlight` | `rgba(255,255,255,0.18)` | 面板顶部内高光 |
| `--mp-text` | `#EDEFF3` | 主文字 |
| `--mp-text-2` | `rgba(237,239,243,0.64)` | 次要文字（说明、计数） |
| `--mp-text-3` | `rgba(237,239,243,0.40)` | 占位、禁用（仅用于非关键信息） |
| `--mp-accent` | `#8AB4FF` | 强调色（选中导航、主按钮、进度） |
| `--mp-on-accent` | `#0B0D12` | 主按钮上的文字 |
| `--mp-accent-soft` | `rgba(138,180,255,0.16)` | 选中背景、标签底 |
| `--mp-success` | `#5EE6A8` | 扫描完成等 |
| `--mp-warning` | `#FFC56B` | 警告 |
| `--mp-danger` | `#FF7A85` | 错误、删除 |

对比度核算（在一级玻璃 `#191B20` 等效底色上）：主文字 14.9:1，次要文字 6.8:1，强调色 8.2:1，主按钮文字 9.3:1，均达到 WCAG AA。`--mp-text-3` 只有 3.5:1，只用于占位符和禁用态。

### 3.3 玻璃层级

| 层级 | 用在哪里 | 填充 | 模糊 | 描边 | 阴影 |
| --- | --- | --- | --- | --- | --- |
| L0 背景 | 页面底 | `--mp-bg` + 2 个径向光晕 | 无 | 无 | 无 |
| L1 面板 | 侧栏、顶栏、筛选条、设置面板、相册信息栏 | `--mp-surface-1` | `blur(24px) saturate(140%)` | `--mp-border` + 顶部内高光 | `0 8px 32px rgba(0,0,0,0.35)` |
| L2 卡片 | 相册卡片、继续阅读卡片、列表行 | `--mp-surface-2`（不加模糊） | 无 | `--mp-border` | `0 4px 16px rgba(0,0,0,0.25)` |
| L3 浮层 | 弹窗、下拉、Toast、大图页工具栏 | `--mp-surface-3` | `blur(32px) saturate(160%)` | `--mp-border-strong` | `0 16px 48px rgba(0,0,0,0.5)` |
| 遮罩 | 弹窗背后 | `rgba(0,0,0,0.55)` | `blur(8px)` | 无 | 无 |

原则：模糊只给固定数量的大面板和浮层，网格里成百上千的卡片不加 `backdrop-filter`，只用半透明填充（见第 6 节）。

### 3.4 圆角、间距、描边

- 圆角：面板 20px，卡片 16px，照片 14px，输入框和按钮 12px，胶囊按钮全圆角。
- 间距：沿用 Tailwind 4px 网格；面板内边距桌面 24px、手机 16px；卡片网格间距 16px。
- 描边统一 1px，不再用 2px 粗线和不规则 `clip-path`。

### 3.5 字体

- 标题与正文：`"Inter", "PingFang SC", "HarmonyOS Sans SC", "Microsoft YaHei", "Noto Sans SC", system-ui, sans-serif`。中文走系统字体，不额外打包中文字体。
- 去掉 Caveat 手写体；原先用 `font-script` 的标题改为 `font-semibold tracking-tight`。
- 数字（页码、计数、`3 / 24`）用 `font-variant-numeric: tabular-nums`，翻页时不跳动。
- 字号沿用现有档位，只把页面主标题从 `text-4xl/6xl` 收到 `text-3xl/5xl`。

### 3.6 动效

- 去掉卡片旋转（`rotation`、`-rotate-2`、`rotate-6` 等）和悬停时的大幅放大。
- 卡片悬停：`translateY(-2px)` + 描边变亮 + 阴影加深，160ms。
- 页面切换：淡入 + `scale 0.98 → 1`，240ms，沿用 `PageTransitionFrame`，只改参数。
- 弹层：淡入 + 上移 8px，200ms。
- 尊重 `prefers-reduced-motion`：只保留淡入淡出。

### 3.7 图标

继续用 lucide-react，统一 `strokeWidth={1.75}`，默认颜色 `--mp-text-2`，选中态 `--mp-accent`。

## 4. 主题系统架构

### 4.1 两层变量

1. **主题层**：每个主题一个 CSS 文件，在 `:root[data-theme="glass-dark"]` 下定义 `--mp-*` 原始变量（第 3.2 节的表）。
2. **语义层**：`index.css` 里用 Tailwind 4 的 `@theme inline` 把现有语义色映射到 `--mp-*`。这样组件里的 `bg-surface`、`text-outline` 不用改名，换主题即换色。

```css
/* src/index.css */
@import "tailwindcss";
@import "./theme/glass-dark.css";

@theme inline {
  --color-background: var(--mp-bg);
  --color-surface: var(--mp-surface-1);
  --color-surface-container: var(--mp-surface-1);
  --color-surface-container-high: var(--mp-surface-2);
  --color-surface-container-highest: var(--mp-surface-3);
  --color-on-surface: var(--mp-text);
  --color-outline: var(--mp-text-2);
  --color-primary: var(--mp-accent);
  --color-primary-container: var(--mp-accent-soft);
  --color-on-primary-container: var(--mp-text);
  --color-error: var(--mp-danger);
  /* 其余约 40 个 token 同理一一映射 */
}
```

```css
/* src/theme/glass-dark.css */
:root[data-theme="glass-dark"] {
  color-scheme: dark;
  --mp-bg: #0B0D12;
  --mp-surface-1: rgba(255,255,255,0.06);
  --mp-border: rgba(255,255,255,0.12);
  --mp-text: #EDEFF3;
  --mp-accent: #8AB4FF;
  --mp-blur-panel: 24px;
  --mp-blur-overlay: 32px;
  --mp-radius-panel: 20px;
  --mp-radius-card: 16px;
  /* …完整列表见第 3 节 */
}
```

### 4.2 装饰类改成语义类

把纸张专用类换成和风格无关的语义类，每个主题各自实现：

| 旧类 | 新语义类 | glass-dark 的实现 |
| --- | --- | --- |
| `paper-grain` / `<PaperGrain />` | `mp-backdrop` / `<ThemeBackdrop />` | 底色 + 两个慢速漂移的径向光晕（可选极淡噪点） |
| `polaroid` | `mp-photo-frame` | 14px 圆角，无白边，悬停描边变亮 |
| `wobbly-mask`（标签） | `mp-chip` | 全圆角胶囊，`--mp-accent-soft` 底 |
| `wobbly-border`（输入框） | `mp-field` | 深色玻璃输入框，聚焦时 2px 强调色光环 |
| `sticky-note` / `washi-tape` | `mp-badge` | 小号胶囊徽标 |
| `ambient-shadow` | `mp-elevation-1/2/3` | 对应 L1 到 L3 阴影 |
| 无 | `mp-glass-panel` / `mp-glass-overlay` | L1、L3 玻璃（含 `backdrop-filter` 与降级） |

组件 `Polaroid`、`WobblyButton` 改名为 `PhotoFrame`、`Button`，保留原导出名做别名一个版本，降低一次性改动面。

### 4.3 运行时

新增目录 `apps/web/src/theme/`：

- `themes.ts`：主题注册表 `[{ id: 'glass-dark', name: '黑色磨砂玻璃', colorScheme: 'dark', themeColor: '#0B0D12' }]`，默认 `glass-dark`。
- `ThemeProvider.tsx`：读写 `localStorage['moment-pic:theme']`，设置 `document.documentElement.dataset.theme` 和 `<meta name="theme-color">`；存的 id 不在注册表里时回退默认主题。
- `useTheme.ts`：返回 `{ theme, themes, setTheme }`。
- `glass-dark.css`：主题变量。

**防闪烁**：在 `apps/web/public/theme-init.js` 放一段十行以内的脚本，`index.html` 的 `<head>` 里在样式之前同步引入，渲染前就读 localStorage 写入 `data-theme`，避免先闪出旧样式。现有 CSP 是 `script-src 'self'`，禁止内联脚本，所以必须用同源文件，不要写成内联。

### 4.4 设置页入口

- 在设置侧栏新增「外观」标签（图标 `Palette`），所有角色可见，只影响当前浏览器。
- 内容是主题卡片网格：每张卡片有缩略预览、名称、选中标记。首版只有「黑色磨砂玻璃」一张，处于选中态；旁边放一张置灰的「更多主题，敬请期待」占位卡。
- 切换即时生效，无需保存按钮。

### 4.5 以后新增主题的步骤

1. 复制 `theme/glass-dark.css` 为 `theme/<id>.css`，改变量。
2. 在 `themes.ts` 注册一条。
3. 如果新主题需要不同的装饰（比如恢复纸张颗粒），在该 CSS 里覆写对应 `mp-*` 语义类。
4. 用第 9 节的截图清单逐屏过一遍。

组件代码不需要改。

### 4.6 浏览器支持与降级

- `backdrop-filter` 加 `-webkit-` 前缀（iOS Safari 需要）。
- `@supports not (backdrop-filter: blur(1px))`：玻璃层改为不透明的 `#15181F`、`#1C2029`，视觉接近。
- `@media (prefers-reduced-transparency: reduce)`：同上，用不透明填充。
- 低端安卓：通过 `useResponsive` 判断手机宽度时，把面板模糊降到 12px。

### 4.7 偏好存服务端（后续，可选）

首版只存在 localStorage。以后如果想让同一账号跨设备保持主题，再给 `users` 表加 `preferences` JSON 字段和 `PATCH /api/v1/me/preferences`，前端优先读服务端、再读本地。这一步会动后端和数据库迁移，所以不放进本次。

## 5. 页面与组件改造清单

| 页面或组件 | 现状 | 玻璃方案 | 参考图 |
| --- | --- | --- | --- |
| 全局背景 `PaperGrain` | 米色纸张颗粒 | `ThemeBackdrop`：近黑底 + 靛蓝、青绿两个光晕 | 图 1 |
| 侧栏 `Sidebar` | 米色底，粗描边 | L1 玻璃面板，选中项用强调色文字 + `accent-soft` 底 | 图 1 |
| 首页 `GalleryScreen` / `GalleryHeader` | 手写感标题 | 大标题 + 次要文字副标题；右上退出按钮改为圆形 L3 玻璃 | 图 1 |
| 筛选 `GalleryFilters` | 纸张卡片 | L1 玻璃条；下拉框为 `mp-field`；「清空筛选」为文字按钮 | 图 1 |
| 相册卡片 `AlbumCard` / `DirectoryNodeCard` / `SmartAlbumCard` | 拍立得白边 + 旋转 | L2 卡片，照片 14px 圆角，标题和计数在下方；「文件夹」「智能」用 `mp-chip` | 图 1、图 5 |
| 继续阅读 `ContinueReading` | 便利贴 | L2 横向卡片，缩略图 + 标题 + 进度 | 图 1 |
| 分页 `GalleryPagination` | 纸张按钮 | 胶囊分组，当前页用强调色实底 | 图 1 |
| 空状态、加载骨架 | 纸张插画 | 线框图标 + 次要文字；骨架为 `surface-2` 闪烁条 | 无 |
| 相册详情 `AlbumDetailScreen` | 拍立得网格、歪斜标签、旋转便签 | 左侧 L1 信息面板（标题、路径、张数、操作按钮），右侧照片网格无边框、无旋转 | 图 2 |
| 大图页 `ViewerGallery` 等 | 白色半透明按钮，内联样式 | 背景为当前图片高斯模糊 + 50% 压暗；顶部工具栏、左右翻页、画质弹层都用 L3 玻璃胶囊 | 图 3 |
| 登录 `LoginScreen` | 拍立得散落、便利贴、波浪描边输入框 | 居中 L3 玻璃卡片；背后 3 到 4 张模糊浮动照片和光晕；主按钮强调色实底 | 图 4 |
| 分享弹窗 `AlbumShareDialog` | 纸张弹窗 | L3 弹窗 + 遮罩；链接框为 `mp-field`，复制按钮为次按钮 | 无 |
| 分享管理 `ShareManagementScreen`、分享页 `SharedAlbumScreen` | 手写大标题 | 统一标题样式；列表行为 L2 | 无 |
| 设置页 `SettingsScreen` 及各面板 | 纸张面板 | 左侧 L1 标签栏 + 右侧 L1 内容面板；表单控件统一 `mp-field`；新增「外观」标签 | 无 |
| Toast | 纸张卡片 | L3 玻璃，左侧状态色细条 | 无 |
| 手机端 | 同桌面纸张风 | 顶栏 L1 玻璃；两列卡片；侧栏抽屉为 L3 | 图 5 |
| 滚动条 `custom-scrollbar` | 棕色 | 6px，`rgba(255,255,255,0.18)`，悬停 0.3 | 无 |

## 6. 性能约束

毛玻璃最大的风险是卡顿，尤其是图片网格和手机端。

- 同屏带 `backdrop-filter` 的元素不超过 6 个（侧栏、顶栏、筛选条、浮层、Toast、大图工具栏）。
- 网格卡片一律不用 `backdrop-filter`，只用半透明填充；视觉差别很小，滚动性能差很多。
- 背景光晕用一张固定的 CSS 渐变，`position: fixed`，不随滚动重绘；漂移动画只改 `transform`，周期 30 秒以上，`prefers-reduced-motion` 时停止。
- 大图页背景模糊用低清缩略图（已有的 thumbnail 接口）加 CSS `filter: blur(40px)`，不要对原图做模糊。
- 验收指标：首页 24 张卡片滚动在中端安卓上保持 50fps 以上；Lighthouse 性能分不低于改造前。

## 7. 可访问性

- 文字对比度按 3.2 节核算，主、次文字都满足 AA。
- 玻璃面板盖在亮色照片上时（登录页、大图页），面板加 `rgba(0,0,0,0.35)` 底层，保证文字可读。
- 聚焦态统一：`outline: 2px solid var(--mp-accent); outline-offset: 2px`，键盘可见。
- 手机端可点区域不小于 44×44px。
- 状态不只靠颜色区分：错误同时带图标和文字。

## 8. 实施计划

按 PR 拆分，每步都能单独上线、单独回滚。

| 阶段 | 内容 | 外观变化 | 预估 |
| --- | --- | --- | --- |
| P0 主题骨架 | 新增 `theme/` 目录、`ThemeProvider`、防闪烁脚本；`@theme inline` 映射到变量，变量值先填现有纸张色 | 无（像素级不变） | 0.5 天 |
| P1 语义类 | 纸张专用类改为 `mp-*` 语义类；`Polaroid`、`WobblyButton`、`PaperGrain` 改为主题无关组件；清理组件内硬编码颜色和大图页内联样式 | 无 | 1 天 |
| P2 玻璃主题 | 写 `glass-dark.css`，切默认主题；全局背景、字体、滚动条 | 全站变深色 | 0.5 天 |
| P3 逐屏打磨 | 首页、相册详情、大图页、登录、分享、设置、手机端，按第 5 节逐项 | 细节到位 | 2 天 |
| P4 外观设置与验收 | 设置页「外观」标签；降级与性能测试；截图对比；更新 README 截图 | 新入口 | 0.5 到 1 天 |

P0 和 P1 不改外观，可以先合并，风险最低。P2 起再部署到 NAS 看效果。

## 9. 验收标准

- 功能不变：现有前端测试 92 个、后端 209 个全部通过；`docs/browser-regression-checklist.md` 逐项手测通过。
- 视觉：按 README 的 8 个截图场景（登录、首页、相册、大图、分享、用户管理、智能相册设置、手机）重拍，和本文参考图对照。
- 浏览器：Chrome、Edge、Firefox、Safari（macOS 和 iOS）、安卓 Chrome；Firefox 旧版本走降级样式也能正常使用。
- 无闪烁：硬刷新时不出现米色底一闪。
- 主题切换：设置页切换即时生效，刷新后保持；localStorage 写入非法值时回退到 `glass-dark`。
- 性能：满足第 6 节指标。

## 10. 待确认

1. 现有纸张风格是否保留为第二套主题「经典纸张」？保留几乎零成本（P0 已经把它变成变量），但每次改组件都要两套都看一遍。我的建议是不保留，只留 `glass-dark`，和你说的「暂时仅支持黑色磨砂玻璃」一致。
2. 强调色用 `#8AB4FF`（柔和蓝）是否合适？备选有暖金 `#F5C46B`、薄荷 `#6EE7C8`。
3. 分享出去的公开相册页（访客看到的）是否也用玻璃主题？建议也用，保持品牌一致。


---

## v2（2026-11-11）：照片墙背景、玫瑰纸感主题、结构重排

视觉参考 momentpt.top。完整方案与效果稿见项目设计稿（ui-glass-v2）。

### 主题

| 主题 | id | 说明 |
|---|---|---|
| 暗夜玻璃（默认） | `glass-dark` | 近黑底 `#070708`，深色玻璃 `rgba(16,16,18,.55)` + `blur(24px) saturate(150%)`，强调色 `#5e9be0`，收藏用暖金 `#e8b57a` |
| 玫瑰纸感（浅色） | `rose-paper` | 原 main 分支的粉色 / 奶油色板映射到 `--mp-*`；卡片加 6px 奶油相框（`--mp-photo-frame`），不旋转；`--mp-text-3` 由 `#827471` 加深为 `#6f6260` 以满足 AA |

- 大图浏览器始终使用深色（`.mp-theme-dark` 在子树内重新声明暗色变量）。
- 新增主题：复制 `theme/*.css`，在 `themes.ts` 与 `public/theme-init.js` 注册，`themes.test.ts` 会校验两者一致。

### 背景图

- 默认照片墙：`public/backgrounds/photo-wall.webp`（桌面）与 `photo-wall-960.webp`（手机），通过 `--mp-bg-image` 引用；模糊、压暗与遮罩由主题变量 `--mp-bg-image-filter`、`--mp-bg-overlay` 决定。
- 「外观 → 背景」三选一：默认照片墙 / 我的图片 / 不用图片。选择保存在当前浏览器（`moment-pic:bg-mode`），首屏由 `theme-init.js` 同步应用。
- 自定义图片按账号存服务器：
  - `PUT /api/v1/account/background`：请求体直接是图片（JPG / PNG / WebP / AVIF，≤ 15 MB，短边 ≥ 320）。服务端自动旋转、去掉 EXIF / GPS，长边缩到 2560 以内并统一转 WebP；同一时间只转码一张。
  - `GET /api/v1/account/background?v=<版本>`：带版本号时 `Cache-Control: private, max-age=31536000, immutable`，支持 ETag / 304。
  - `GET /api/v1/account/background/meta`、`DELETE /api/v1/account/background`。
  - 文件存放在 `SQLITE_PATH` 同级的 `backgrounds/<userId>.webp`（Docker 下为 `/data/backgrounds`，不会被缓存清理删掉）。只读账号也能设置自己的；删除用户时一并删除文件。
  - 只有登录后才加载自定义图片，登录页始终用默认照片墙。

### 导航

- 桌面 ≥ 1280px：浮动玻璃侧栏，分组为浏览（首页 / 全部相册 / 收藏 / 最近浏览）、整理（目录 / 智能相册）、图库（悬停出现重扫），底部为分享管理（仅管理员）、设置、账号与退出。
- 640–1279px：收起为 72px 图标栏。
- 手机（含触屏平板）：底部标签栏（首页 / 相册 / 收藏 / 目录 / 我的），「我的」为底部抽屉。
- 侧栏「搜索相册」或快捷键 `/`：跳到全部相册并聚焦搜索框。
- 改名：「全部图片」→「全部相册」，「自动整理 / 智能归纳」→「智能相册」，「目录相册」→「目录」。设置改为主框架内的顶部标签页。

### 图库

- 新增首页（默认落地页，网址无 `view` 参数）：问候语、继续阅读（进度条）、最近更新、收藏、智能相册，复用现有接口。
- 列表改为无限滚动：同一查询的连续分页按 id 合并（`app/infinite-pages.ts`），刷新、轮询、收藏切换都按 id 原位更新；从相册返回时保留已加载内容和滚动位置。网址里的 `page` 只在会话内有效，刷新页面从第 1 页开始。
- 吸顶工具栏：来源胶囊、结果内搜索、排序 + 升降序、卡片尺寸大 / 中 / 小（`moment-pic:card-size`）。「每页数量」不再显示。
- 封面卡片 4:5，信息叠在底部渐变上；收藏星标常驻，管理员悬停出现分享 / 收藏按钮（无悬停设备常驻）。
- 目录页：子文件夹以紧凑横条列在上方，图集卡片在下方。
- 相册详情：去掉左侧栏，改为封面横幅（路径、标题、张数、读到第几张，继续阅读 / 收藏 / 分享 / 重扫）；网格 / 等高拼图两种排列（`moment-pic:detail-layout`）；删除底部写死的假路径；重扫按钮只对管理员显示。

### 已知限制

- ~~后端仍按页码分页~~：2026-11-12 起相册列表与相册内图片已改为游标分页（`nextCursor`，PR #26），翻页不再重复或漏项。分享页和阅读器的图片仍按页码分页。
- 网址里的 `page` 只在会话内有效；从网址直接打开第 N 页时走页码兼容路径，之后继续滚动用游标。
- 图标栏模式下不显示图库列表，可在 ≥ 1280px 或「我的」中切换图库。
- 侧栏让位的 CSS 条件须与 `useMobile()` 互补：没有指针设备（`pointer: none`）时同样显示侧栏并让出宽度。
