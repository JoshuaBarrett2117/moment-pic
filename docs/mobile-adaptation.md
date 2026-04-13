# 移动端适配开发文档

## 一、概述

本文档定义 Moment-Pic 项目移动端适配的技术方案与实施规范。项目前端采用 React 19 + TypeScript + Tailwind CSS 技术栈，需要针对移动设备进行响应式布局优化。

## 二、技术栈

| 类别 | 技术选型 |
|:---|:---|
| 框架 | React 19.0.0 |
| 语言 | TypeScript 5.8.2 |
| 样式方案 | Tailwind CSS 4.1.14 |
| 动画库 | Motion 12.23.24 |
| 响应式方案 | Tailwind 响应式前缀 + react-responsive |

## 三、响应式断点规范

```
移动端: < 640px
平板竖屏: 640px - 768px
平板横屏: 768px - 1024px
桌面端: > 1024px
```

## 四、组件适配清单

### 4.1 高优先级组件

#### Sidebar（侧边栏导航）

| 现状问题 | 适配方案 |
|:---|:---|
| 固定宽度 w-80（320px），移动端无法显示 | 移动端转换为底部标签栏或汉堡菜单抽屉 |
| 固定定位 fixed left-0 top-0 h-full，遮挡主内容区 | 移动端隐藏，触发器置于页面顶部 |
| 大号内边距 px-6 py-4，浪费移动端空间 | 移动端使用 px-3 py-2 |

```tsx
// 响应式类名示例
className={`
  fixed left-0 top-0 h-full 
  md:w-80 w-full md:relative
  transition-transform duration-300
  ${isOpen ? 'translate-x-0' : '-translate-x-full md:translate-x-0'}
`}
```

#### GalleryScreen（相册列表页）

| 现状问题 | 适配方案 |
|:---|:---|
| 主内容区 ml-80，依赖固定侧边栏 | 移除 ml-80，改为响应式 ml-0 md:ml-80 |
| 标题 text-6xl，手机上溢出 | 移动端改为 text-3xl md:text-6xl |
| 筛选条件栏 min-w-[200px] | 移动端改为可折叠筛选器 |
| 相册卡片 minmax(280px, 1fr) | 移动端改为 minmax(160px, 1fr) |
| 分页按钮 w-10 h-10，触摸目标偏小 | 移动端改为 w-12 h-12 |

```tsx
// 网格响应式示例
className="grid gap-4 grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-6"
```

#### ViewerGallery（图片预览器）

| 现状问题 | 适配方案 |
|:---|:---|
| 导航按钮固定尺寸 44px / 56px，触摸区域偏小 | 移动端增大至 56px 以上 |
| 依赖 hover 显示控件 | 移动端始终显示控件 |
| 无触摸手势支持 | 添加滑动切换、双指缩放手势 |
| 键盘导航在移动端无效 | 保留键盘支持，补充触摸交互 |

```tsx
// 触摸优化示例
className="w-14 h-14 md:w-11 md:h-11"  // 移动端更大触摸区域

// 移动端始终显示工具栏
className="opacity-100 md:opacity-0 md:group-hover:opacity-100"
```

### 4.2 中优先级组件

#### AlbumDetailScreen（相册详情页）

| 现状问题 | 适配方案 |
|:---|:---|
| 左侧信息栏固定 w-[280px] | 移动端隐藏或改为底部抽屉 |
| 头部区域 h-32 px-12，占用过多垂直空间 | 移动端改为 h-16 px-4 |
| 底部信息栏 h-20 px-12，信息密度过高 | 移动端简化或隐藏 |

#### SettingsScreen（设置页面）

| 现状问题 | 适配方案 |
|:---|:---|
| 左侧导航 w-80 固定宽度 | 移动端改为 Tab 切换 |
| 主内容区 p-12 大号内边距 | 移动端改为 p-4 或 p-6 |
| 数字输入框 w-20 / w-28 | 移动端增大触摸区域 |

### 4.3 低优先级组件

#### LoginScreen（登录页面）

| 现状问题 | 适配方案 |
|:---|:---|
| 双栏布局，右侧装饰在移动端不可见 | 移动端改为单栏，装饰图片作为背景 |
| 固定 p-12 内边距 | 移动端改为 p-6 |

```tsx
// 登录页响应式示例
className={`
  flex flex-col md:flex-row
  ${isMobile ? 'bg-gradient-to-br from-pink-100 to-purple-100' : ''}
`}
```

#### WobblyButton（摇摆按钮）

| 现状问题 | 适配方案 |
|:---|:---|
| 固定内边距 py-4 px-8 | 移动端改为 py-3 px-6 |
| 大号字号 text-lg | 移动端改为 text-base |

## 五、实施步骤

### 第一阶段：基础设施

1. 在项目中安装响应式检测依赖

```bash
npm install react-responsive
```

2. 创建响应式 Hook

```tsx
// apps/web/src/hooks/useResponsive.ts
import { useMediaQuery } from 'react-responsive';

export const useMobile = () => useMediaQuery({ maxWidth: 639 });
export const useTablet = () => useMediaQuery({ minWidth: 640, maxWidth: 1023 });
export const useDesktop = () => useMediaQuery({ minWidth: 1024 });
```

### 第二阶段：核心布局

1. 修复 GalleryScreen 的 ml-80 左边距问题
2. 重构 Sidebar 为响应式组件（桌面侧边栏 + 移动端底部导航）

### 第三阶段：交互优化

1. 为 ViewerGallery 添加触摸手势支持
2. 优化图片网格响应式列数

### 第四阶段：体验完善

1. 简化 SettingsScreen 移动端布局
2. 优化 LoginScreen 移动端样式

## 六、注意事项

### 触摸交互

- 所有可点击元素最小触摸区域 44x44px
- 按钮间距至少 8px，防止误触
- 避免依赖 hover 的交互模式

### 性能考量

- 移动端图片使用更小的缩略图
- 减少动画复杂度，使用 transform 而非 layout 属性
- 考虑使用 IntersectionObserver 实现懒加载

### 兼容性

- iOS Safari 需测试 WebKit 内核兼容性
- Android 设备测试 Chrome 内核
- 关注 Safe Area 适配（iPhone X 系列）

## 七、验证清单

- [ ] 移动端（375px）页面布局正常显示
- [ ] 平板（768px）布局适配正确
- [ ] 桌面端（1920px）保持原有体验
- [ ] 所有按钮触摸区域不小于 44x44px
- [ ] ViewerGallery 触摸手势正常工作
- [ ] 侧边栏移动端切换流畅
- [ ] 图片网格在各断点下显示正确数量
- [ ] 无水平滚动条溢出
