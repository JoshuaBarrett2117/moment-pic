# Moment Pic

日期：2026-04-09
执行者：Codex

## 本地启动

1. 安装依赖：`npm install`
2. 启动服务：`npm run dev:server`
3. 打开浏览器：`http://127.0.0.1:3210`

## Docker 启动

1. 运行：`docker compose up --build`
2. 打开浏览器：`http://127.0.0.1:3210`
3. 默认账号：`admin`
4. 默认密码：`admin`（可通过环境变量 `ADMIN_PASSWORD` 覆盖）

## 当前支持

1. 目录图集，例如 `风景1/001.jpg`
2. ZIP 根目录图集，例如 `风景2.zip`
3. 图片格式：`jpg`、`jpeg`、`png`、`webp`、`gif`、`bmp`
4. 首页图集浏览
5. 图集缩略图浏览
6. 单图查看器
7. 上一张、下一张切换
8. 手动重新扫描

## 验收截图输出

浏览器验收脚本会输出到：

`./.logs/browser-check/`
