# 依赖安全升级核对

> 日期：2026-10-15；执行者：Codex

## 范围与证据

基线审计记录为 18 个受影响依赖节点（14 high、2 moderate、2 low），不是 18 条独立公告。逐公告原文和受影响范围保存在 `/opt/data/output/momentpic-verification/advisories/`。以下按实际锁文件与公告修复范围核对，不以包名或单个 CVE 判定全部风险。未执行 `npm audit fix --force`。

优先升级 ws 8.22.0、sharp 0.35.5、Fastify 5.12.7、@fastify/static 10.1.6。同时更新 axios、Vite 及受影响的传递依赖；版本以提交的 package-lock.json 为准。

## 触发条件与部署约束

- ws：极细碎 WebSocket 帧/数据块可放大内存占用，单纯限制消息字节数不足；另有 close reason 使用 TypedArray 的内存泄漏条件。除升级外保留认证、Origin、连接数、缓冲区限制及会话到期清理。
- sharp：不可信媒体可进入 libvips、libheif、librsvg 解码链；SVG/AVIF 路径与运行时条件决定部分漏洞可达性。预编译 0.35.5 包包含修复库；若部署采用系统库，必须单独核对 libvips >= 8.18.3、libheif >= 1.23.2、librsvg >= 2.63.2，不能仅凭 npm 版本宣称系统库安全。glibc、PIE 等运行时条件影响 RCE 风险，不将“不一定触发”当作修复。
- Fastify：公告分别涉及 Content-Type/根原始值/boolean/header schema 验证、异步验证结果、畸形 URL 与封装 not-found、trustProxy hop-count，以及 HTTP/2 trailer。HTTP/2 trailer 仅在启用 HTTP/2 且设置 trailer 时触发；反向代理需使用显式可信代理，不信任任意转发头。全部升级，不依赖当前业务未使用某功能。
- @fastify/static：目录列表、编码分隔符、点段和非规范路径可能绕过根目录或路由/allowedPath 边界。当前不开启目录列表，不将静态路径守卫作为唯一认证边界；升级覆盖多轮修复。10.x 的 setHeaders 使用 FastifyReply，需要同步适配源码。
- Vite/esbuild/PostCSS 等开发/构建依赖也纳入升级；开发服务器不得暴露到不可信网络。axios 公告的可达性与 adapter、重定向及不可信输入有关，不能用“仅浏览器使用”忽略审计。
- 2026-10-16 修正（执行者：Codex）：移除的主线程同步 node-unrar-js 路径不再恢复；真实 RAR4/RAR5 改用固定版本 2.0.2 的纯 WASM worker，并接管文件写钩子实施真实字节预算、背压与强制终止。解决 Debian DFSG 7zz / 精简 7za 缺少 RAR 解码器的回归，不新增系统 unrar 依赖。详情及原生解码器边界见 `rar-wasm-verification.md`。

## 锁文件版本

| 依赖 | 锁定版本 |
| --- | --- |
| @babel/core | 7.29.7 |
| @fastify/static | 10.1.6 |
| axios | 1.20.0 |
| baseline-browser-mapping | 2.11.28 |
| brace-expansion | 5.0.12 |
| browserslist | 4.29.3 |
| esbuild | 0.28.2 / 0.25.12 |
| fast-uri | 3.1.8 / 4.2.2 |
| fastify | 5.12.7 |
| find-my-way | 9.10.0 |
| follow-redirects | 1.16.1 |
| form-data | 4.0.6 |
| nanoid | 3.3.20 |
| postcss | 8.5.30 |
| sharp | 0.35.5 |
| source-map-js | 1.2.2 |
| vite | 6.4.4 |
| ws | 8.22.0 |

## 逐公告受影响范围与首个修复版本

公告源为已保存的 GitHub Advisory Database reviewed 公告；ID 链接可查看原文、触发前置条件和后续修订。一个包可能存在多个版本分支，表中保留所有已记录分支。

2026-10-16 复核：下表覆盖基线全部 87 个公告 ID，另保留 7 条已撤回（withdrawn）记录供追溯，不计为额外未修复漏洞。6 条 axios 记录因重复撤回，应以各行对应的有效公告及其修复范围为准，不能把空 first_patched_version 解读为“无已知修复”；1 条 esbuild 记录因错误识别受影响包而撤回，实际涉及 Deno 模块，不是本项目 npm esbuild 的有效漏洞。撤回状态与日期取自已保存 JSON 的 withdrawn_at，未将撤回误写为版本升级修复。

| 依赖 | 公告 | 受影响范围 → 首个修复版本 |
| --- | --- | --- |
| @babel/core | [GHSA-4x5r-pxfx-6jf8](https://github.com/advisories/GHSA-4x5r-pxfx-6jf8) | >= 8.0.0-alpha.0, < 8.0.0-rc.5 → 8.0.0-rc.6；<= 7.29.0 → 7.29.6 |
| @fastify/static | [GHSA-8pvw-jcv7-9cmj](https://github.com/advisories/GHSA-8pvw-jcv7-9cmj) | <= 10.1.1 → 10.1.2 |
| @fastify/static | [GHSA-83w8-p2f5-377r](https://github.com/advisories/GHSA-83w8-p2f5-377r) | <= 10.1.0 → 10.1.1 |
| @fastify/static | [GHSA-pr96-94w5-mx2h](https://github.com/advisories/GHSA-pr96-94w5-mx2h) | >= 8.0.0, <= 9.1.0 → 9.1.1 |
| @fastify/static | [GHSA-x428-ghpx-8j92](https://github.com/advisories/GHSA-x428-ghpx-8j92) | >= 8.0.0, <= 9.1.0 → 9.1.1 |
| axios | [GHSA-j8rh-479h-cp32](https://github.com/advisories/GHSA-j8rh-479h-cp32) | >= 1.0.0, < 1.20.0 → 1.20.0 |
| axios | [GHSA-4hqw-qxg8-jxx2](https://github.com/advisories/GHSA-4hqw-qxg8-jxx2) | >= 1.12.0, < 1.20.0 → 1.20.0 |
| axios | [GHSA-44g4-m2mj-wpvx](https://github.com/advisories/GHSA-44g4-m2mj-wpvx) | >= 1.15.0, < 1.20.0 → 1.20.0 |
| axios | [GHSA-vh66-26gq-q6x8](https://github.com/advisories/GHSA-vh66-26gq-q6x8) | >= 1.7.0, < 1.20.0 → 1.20.0 |
| axios | [GHSA-9fr6-4gfg-395g](https://github.com/advisories/GHSA-9fr6-4gfg-395g) | >= 0.27.2, < 0.34.0 → 0.34.0；>= 1.0.0, < 1.20.0 → 1.20.0 |
| axios | [GHSA-mghh-pgcx-3jjj](https://github.com/advisories/GHSA-mghh-pgcx-3jjj) | >= 1.15.0, < 1.20.0 → 1.20.0 |
| axios | [GHSA-3pq3-5fj3-cg6v](https://github.com/advisories/GHSA-3pq3-5fj3-cg6v) | >= 1.13.0, < 1.20.0 → 1.20.0 |
| axios | [GHSA-542g-h47m-68v8](https://github.com/advisories/GHSA-542g-h47m-68v8) | >= 1.13.0, < 1.20.0 → 1.20.0 |
| axios | [GHSA-9wx3-p993-35vp](https://github.com/advisories/GHSA-9wx3-p993-35vp) | 已撤回（2026-09-01）：重复 GHSA-7q8q-rj6j-mhjq；修复见该有效公告 |
| axios | [GHSA-6hqm-hm2v-3p2p](https://github.com/advisories/GHSA-6hqm-hm2v-3p2p) | 已撤回（2026-09-01）：重复 GHSA-f4gw-2p7v-4548；修复见该有效公告 |
| axios | [GHSA-fqj3-h9pc-443h](https://github.com/advisories/GHSA-fqj3-h9pc-443h) | 已撤回（2026-09-01）：重复 GHSA-mwf2-3pr3-8698；修复见该有效公告 |
| axios | [GHSA-39j5-w47m-2gmv](https://github.com/advisories/GHSA-39j5-w47m-2gmv) | 已撤回（2026-09-01）：重复 GHSA-jqh4-m9w3-8hp9；修复见该有效公告 |
| axios | [GHSA-4ww2-rjh2-xpv9](https://github.com/advisories/GHSA-4ww2-rjh2-xpv9) | 已撤回（2026-08-31）：重复 GHSA-pmv8-rq9r-6j72；修复见该有效公告 |
| axios | [GHSA-fq2j-3j99-rx65](https://github.com/advisories/GHSA-fq2j-3j99-rx65) | 已撤回（2026-09-01）：重复 GHSA-42h9-826w-cgv3；修复见该有效公告 |
| axios | [GHSA-7q8q-rj6j-mhjq](https://github.com/advisories/GHSA-7q8q-rj6j-mhjq) | >= 0.8.0, < 0.33.0 → 0.33.0；>= 1.0.0, < 1.18.0 → 1.18.0 |
| axios | [GHSA-mwf2-3pr3-8698](https://github.com/advisories/GHSA-mwf2-3pr3-8698) | >= 1.13.0, < 1.18.0 → 1.18.0 |
| axios | [GHSA-jqh4-m9w3-8hp9](https://github.com/advisories/GHSA-jqh4-m9w3-8hp9) | >= 1.7.0, < 1.18.0 → 1.18.0 |
| axios | [GHSA-mmx7-hfxf-jppx](https://github.com/advisories/GHSA-mmx7-hfxf-jppx) | >= 1.0.0, < 1.18.0 → 1.18.0；< 0.33.0 → 0.33.0 |
| axios | [GHSA-f4gw-2p7v-4548](https://github.com/advisories/GHSA-f4gw-2p7v-4548) | >= 1.15.0, < 1.18.0 → 1.18.0；>= 0.31.0, < 0.33.0 → 0.33.0 |
| axios | [GHSA-42h9-826w-cgv3](https://github.com/advisories/GHSA-42h9-826w-cgv3) | >= 0.28.0, < 0.33.0 → 0.33.0；>= 1.0.0, < 1.18.0 → 1.18.0 |
| axios | [GHSA-pmv8-rq9r-6j72](https://github.com/advisories/GHSA-pmv8-rq9r-6j72) | >= 0.28.0, < 0.33.0 → 0.33.0；>= 1.0.0, < 1.18.0 → 1.18.0 |
| axios | [GHSA-hfxv-24rg-xrqf](https://github.com/advisories/GHSA-hfxv-24rg-xrqf) | >= 1.0.0, < 1.16.0 → 1.16.0；<= 0.31.1 → 0.32.0 |
| axios | [GHSA-777c-7fjr-54vf](https://github.com/advisories/GHSA-777c-7fjr-54vf) | >= 1.7.0, < 1.16.0 → 1.16.0 |
| axios | [GHSA-p92q-9vqr-4j8v](https://github.com/advisories/GHSA-p92q-9vqr-4j8v) | >= 1.0.0, < 1.16.0 → 1.16.0；<= 0.31.1 → 0.32.0 |
| axios | [GHSA-j5f8-grm9-p9fc](https://github.com/advisories/GHSA-j5f8-grm9-p9fc) | >= 1.0.0, < 1.16.0 → 1.16.0；<= 0.31.1 → 0.32.0 |
| axios | [GHSA-3g43-6gmg-66jw](https://github.com/advisories/GHSA-3g43-6gmg-66jw) | >= 1.0.0, < 1.15.2 → 1.15.2；>= 0.19.0, < 0.31.1 → 0.31.1 |
| axios | [GHSA-35jp-ww65-95wh](https://github.com/advisories/GHSA-35jp-ww65-95wh) | >= 1.0.0, < 1.16.0 → 1.16.0 |
| axios | [GHSA-pjwm-pj3p-43mv](https://github.com/advisories/GHSA-pjwm-pj3p-43mv) | <= 0.31.1 → 0.32.0；>= 1.15.0, < 1.16.0 → 1.16.0 |
| axios | [GHSA-898c-q2cr-xwhg](https://github.com/advisories/GHSA-898c-q2cr-xwhg) | >= 1.0.0, < 1.16.0 → 1.16.0；<= 0.31.1 → 0.32.0 |
| axios | [GHSA-445q-vr5w-6q77](https://github.com/advisories/GHSA-445q-vr5w-6q77) | >= 1.0.0, < 1.15.1 → 1.15.1 |
| axios | [GHSA-m7pr-hjqh-92cm](https://github.com/advisories/GHSA-m7pr-hjqh-92cm) | >= 1.0.0, < 1.15.1 → 1.15.1；<= 0.31.0 → 0.31.1 |
| axios | [GHSA-62hf-57xw-28j9](https://github.com/advisories/GHSA-62hf-57xw-28j9) | >= 1.0.0, < 1.15.1 → 1.15.1；<= 0.31.0 → 0.31.1 |
| axios | [GHSA-5c9x-8gcm-mpgx](https://github.com/advisories/GHSA-5c9x-8gcm-mpgx) | >= 1.0.0, < 1.15.1 → 1.15.1；<= 0.31.0 → 0.31.1 |
| axios | [GHSA-vf2m-468p-8v99](https://github.com/advisories/GHSA-vf2m-468p-8v99) | >= 1.0.0, < 1.15.1 → 1.15.1；<= 0.31.0 → 0.31.1 |
| axios | [GHSA-pf86-5x62-jrwf](https://github.com/advisories/GHSA-pf86-5x62-jrwf) | >= 1.0.0, < 1.15.1 → 1.15.1；<= 0.31.0 → 0.31.1 |
| axios | [GHSA-6chq-wfr3-2hj9](https://github.com/advisories/GHSA-6chq-wfr3-2hj9) | >= 1.0.0, < 1.15.1 → 1.15.1；<= 0.31.0 → 0.31.1 |
| axios | [GHSA-xx6v-rp6x-q39c](https://github.com/advisories/GHSA-xx6v-rp6x-q39c) | >= 1.0.0, < 1.15.1 → 1.15.1；<= 0.31.0 → 0.31.1 |
| axios | [GHSA-w9j2-pvgh-6h63](https://github.com/advisories/GHSA-w9j2-pvgh-6h63) | >= 1.0.0, < 1.15.1 → 1.15.1；<= 0.31.0 → 0.31.1 |
| axios | [GHSA-pmwg-cvhr-8vh7](https://github.com/advisories/GHSA-pmwg-cvhr-8vh7) | >= 1.0.0, < 1.15.1 → 1.15.1；<= 0.31.0 → 0.31.1 |
| axios | [GHSA-3w6x-2g7m-8v23](https://github.com/advisories/GHSA-3w6x-2g7m-8v23) | >= 1.0.0, < 1.15.2 → 1.15.2 |
| axios | [GHSA-q8qp-cvcw-x6jj](https://github.com/advisories/GHSA-q8qp-cvcw-x6jj) | >= 1.0.0, < 1.15.2 → 1.15.2 |
| axios | [GHSA-xhjh-pmcv-23jw](https://github.com/advisories/GHSA-xhjh-pmcv-23jw) | >= 1.0.0, < 1.15.1 → 1.15.1；<= 0.31.0 → 0.31.1 |
| baseline-browser-mapping | [GHSA-w5vr-8v7q-w6rv](https://github.com/advisories/GHSA-w5vr-8v7q-w6rv) | >= 2.0.0, < 2.11.0 → 2.11.0 |
| brace-expansion | [GHSA-q2hr-2g5m-vwhr](https://github.com/advisories/GHSA-q2hr-2g5m-vwhr) | >= 4.0.0, < 5.0.12 → 5.0.12；>= 3.0.0, < 3.0.9 → 3.0.9；>= 2.0.0, < 2.1.7 → 2.1.7；< 1.1.21 → 1.1.21 |
| brace-expansion | [GHSA-qhr7-859c-m2p7](https://github.com/advisories/GHSA-qhr7-859c-m2p7) | >= 4.0.0, < 5.0.11 → 5.0.11；>= 3.0.0, < 3.0.8 → 3.0.8；>= 2.0.0, < 2.1.6 → 2.1.6；< 1.1.20 → 1.1.20 |
| brace-expansion | [GHSA-6j4f-fj2g-mc7p](https://github.com/advisories/GHSA-6j4f-fj2g-mc7p) | >= 4.0.0, < 5.0.10 → 5.0.10；>= 3.0.0, < 3.0.7 → 3.0.7；>= 2.0.0, < 2.1.5 → 2.1.5；< 1.1.19 → 1.1.19 |
| brace-expansion | [GHSA-rgw5-rvv9-x895](https://github.com/advisories/GHSA-rgw5-rvv9-x895) | < 1.1.18 → 1.1.18；>= 2.0.0, < 2.1.4 → 2.1.4；>= 3.0.0, < 3.0.6 → 3.0.6；>= 4.0.0, < 5.0.9 → 5.0.9 |
| brace-expansion | [GHSA-mh99-v99m-4gvg](https://github.com/advisories/GHSA-mh99-v99m-4gvg) | >= 4.0.0, < 5.0.8 → 5.0.8；>= 3.0.0, < 3.0.3 → 3.0.3；>= 2.0.0, < 2.1.3 → 2.1.3；< 1.1.17 → 1.1.17 |
| brace-expansion | [GHSA-3jxr-9vmj-r5cp](https://github.com/advisories/GHSA-3jxr-9vmj-r5cp) | >= 3.0.0, < 5.0.7 → 5.0.7；< 1.1.16 → 1.1.16；>= 2.0.0, < 2.1.2 → 2.1.2 |
| brace-expansion | [GHSA-jxxr-4gwj-5jf2](https://github.com/advisories/GHSA-jxxr-4gwj-5jf2) | >= 5.0.0, < 5.0.6 → 5.0.6 |
| browserslist | [GHSA-c83g-rgw3-j3cx](https://github.com/advisories/GHSA-c83g-rgw3-j3cx) | <= 4.28.6 → 4.28.7 |
| browserslist | [GHSA-73wf-gq98-2v4g](https://github.com/advisories/GHSA-73wf-gq98-2v4g) | <= 4.28.6 → 4.28.7 |
| esbuild | [GHSA-gv7w-rqvm-qjhr](https://github.com/advisories/GHSA-gv7w-rqvm-qjhr) | 已撤回（2026-06-17）：受影响包识别错误，实际为 Deno 模块；不适用于本项目 npm esbuild |
| esbuild | [GHSA-g7r4-m6w7-qqqr](https://github.com/advisories/GHSA-g7r4-m6w7-qqqr) | >= 0.27.3, < 0.28.1 → 0.28.1 |
| fast-uri | [GHSA-hrr3-gc8f-f4qj](https://github.com/advisories/GHSA-hrr3-gc8f-f4qj) | < 2.4.7 → 2.4.7；>= 3.0.0, < 3.1.8 → 3.1.8；>= 4.0.0, < 4.1.5 → 4.1.5 |
| fast-uri | [GHSA-qw65-cvwx-89v3](https://github.com/advisories/GHSA-qw65-cvwx-89v3) | < 2.4.6 → 2.4.6；>= 3.0.0, < 3.1.7 → 3.1.7；>= 4.0.0, < 4.1.4 → 4.1.4 |
| fast-uri | [GHSA-f65p-4m7j-42xc](https://github.com/advisories/GHSA-f65p-4m7j-42xc) | >= 2.3.1, < 2.4.5 → 2.4.5；>= 3.0.0, < 3.1.6 → 3.1.6；>= 4.0.0, < 4.1.3 → 4.1.3 |
| fast-uri | [GHSA-jqff-g426-hqxp](https://github.com/advisories/GHSA-jqff-g426-hqxp) | >= 2.3.1, < 2.4.5 → 2.4.5；>= 3.0.0, < 3.1.6 → 3.1.6；>= 4.0.0, < 4.1.3 → 4.1.3 |
| fast-uri | [GHSA-7p8r-x3mc-p8w7](https://github.com/advisories/GHSA-7p8r-x3mc-p8w7) | < 2.4.4 → 2.4.4；>= 3.0.0, < 3.1.5 → 3.1.5；>= 4.0.0, < 4.1.2 → 4.1.2 |
| fast-uri | [GHSA-v2hh-gcrm-f6hx](https://github.com/advisories/GHSA-v2hh-gcrm-f6hx) | >= 2.3.1, <= 2.4.2 → 2.4.3；>= 3.0.0, <= 3.1.3 → 3.1.4；>= 4.0.0, <= 4.1.0 → 4.1.1 |
| fast-uri | [GHSA-4c8g-83qw-93j6](https://github.com/advisories/GHSA-4c8g-83qw-93j6) | >= 4.0.0, < 4.0.1 → 4.0.1；>= 3.0.0, < 3.1.3 → 3.1.3；>= 2.3.1, < 2.4.2 → 2.4.2 |
| fast-uri | [GHSA-v39h-62p7-jpjc](https://github.com/advisories/GHSA-v39h-62p7-jpjc) | >= 3.0.0, <= 3.1.1 → 3.1.2；<= 2.4.0 → 2.4.1 |
| fast-uri | [GHSA-q3j6-qgpj-74h6](https://github.com/advisories/GHSA-q3j6-qgpj-74h6) | >= 3.0.0, <= 3.1.0 → 3.1.1；<= 2.4.0 → 2.4.1 |
| fastify | [GHSA-4mh8-r7rc-xpvc](https://github.com/advisories/GHSA-4mh8-r7rc-xpvc) | < 5.12.5 → 5.12.5 |
| fastify | [GHSA-667r-xxjv-c9mm](https://github.com/advisories/GHSA-667r-xxjv-c9mm) | < 5.12.2 → 5.12.2 |
| fastify | [GHSA-p68q-wchp-6fh7](https://github.com/advisories/GHSA-p68q-wchp-6fh7) | >= 4.0.0, < 5.12.2 → 5.12.2 |
| fastify | [GHSA-hwr6-493r-vm6h](https://github.com/advisories/GHSA-hwr6-493r-vm6h) | < 5.12.2 → 5.12.2 |
| fastify | [GHSA-9q9j-q6p8-xq58](https://github.com/advisories/GHSA-9q9j-q6p8-xq58) | < 5.12.2 → 5.12.2 |
| fastify | [GHSA-3m5p-2c4r-xxw2](https://github.com/advisories/GHSA-3m5p-2c4r-xxw2) | >= 5.8.3, < 5.12.1 → 5.12.1 |
| fastify | [GHSA-w2qp-rph6-63g4](https://github.com/advisories/GHSA-w2qp-rph6-63g4) | < 5.12.1 → 5.12.1 |
| fastify | [GHSA-247c-9743-5963](https://github.com/advisories/GHSA-247c-9743-5963) | >= 5.3.2, <= 5.8.4 → 5.8.5 |
| find-my-way | [GHSA-c96f-x56v-gq3h](https://github.com/advisories/GHSA-c96f-x56v-gq3h) | <= 9.6.0 → 9.7.0 |
| follow-redirects | [GHSA-r4q5-vmmm-2653](https://github.com/advisories/GHSA-r4q5-vmmm-2653) | <= 1.15.11 → 1.16.0 |
| form-data | [GHSA-hmw2-7cc7-3qxx](https://github.com/advisories/GHSA-hmw2-7cc7-3qxx) | < 2.5.6 → 2.5.6；>= 3.0.0, < 3.0.5 → 3.0.5；>= 4.0.0, < 4.0.6 → 4.0.6 |
| nanoid | [GHSA-xwg4-73v4-xw9w](https://github.com/advisories/GHSA-xwg4-73v4-xw9w) | < 3.3.12 → 3.3.12；>= 4.0.0, < 5.1.11 → 5.1.11 |
| nanoid | [GHSA-28wg-ghj8-5hjv](https://github.com/advisories/GHSA-28wg-ghj8-5hjv) | < 3.3.16 → 3.3.16；>= 4.0.0, < 5.1.16 → 5.1.16 |
| nanoid | [GHSA-2v37-7h3g-55p8](https://github.com/advisories/GHSA-2v37-7h3g-55p8) | >= 4.0.0, < 5.1.6 → 5.1.6；< 3.3.18 → 3.3.18 |
| postcss | [GHSA-fxqj-rqcc-2cmp](https://github.com/advisories/GHSA-fxqj-rqcc-2cmp) | <= 8.5.22 → 8.5.23 |
| postcss | [GHSA-r28c-9q8g-f849](https://github.com/advisories/GHSA-r28c-9q8g-f849) | <= 8.5.17 → 8.5.18 |
| postcss | [GHSA-6g55-p6wh-862q](https://github.com/advisories/GHSA-6g55-p6wh-862q) | <= 8.5.11 → 8.5.12 |
| postcss | [GHSA-qx2v-qp2m-jg93](https://github.com/advisories/GHSA-qx2v-qp2m-jg93) | < 8.5.10 → 8.5.10 |
| sharp | [GHSA-wq5f-xc86-pv6w](https://github.com/advisories/GHSA-wq5f-xc86-pv6w) | < 0.35.5 → 0.35.5 |
| sharp | [GHSA-rgj7-g3m4-5g8c](https://github.com/advisories/GHSA-rgj7-g3m4-5g8c) | < 0.35.4 → 0.35.4 |
| sharp | [GHSA-f88m-g3jw-g9cj](https://github.com/advisories/GHSA-f88m-g3jw-g9cj) | < 0.35.0 → 0.35.0 |
| source-map-js | [GHSA-68fv-2mgg-jv7q](https://github.com/advisories/GHSA-68fv-2mgg-jv7q) | >= 1.0.0, < 1.2.2 → 1.2.2 |
| vite | [GHSA-v6wh-96g9-6wx3](https://github.com/advisories/GHSA-v6wh-96g9-6wx3) | <= 2.14.0 → 2.14.1；>= 8.0.0, <= 8.0.15 → 8.0.16；>= 7.0.0, <= 7.3.4 → 7.3.5；<= 6.4.2 → 6.4.3；<= 0.1.23 → 0.1.24 |
| vite | [GHSA-fx2h-pf6j-xcff](https://github.com/advisories/GHSA-fx2h-pf6j-xcff) | >= 8.0.0, <= 8.0.15 → 8.0.16；>= 7.0.0, <= 7.3.4 → 7.3.5；<= 6.4.2 → 6.4.3；<= 0.1.23 → 0.1.24 |
| ws | [GHSA-96hv-2xvq-fx4p](https://github.com/advisories/GHSA-96hv-2xvq-fx4p) | >= 1.1.0, < 5.2.5 → 5.2.5；>= 6.0.0, < 6.2.4 → 6.2.4；>= 7.0.0, < 7.5.11 → 7.5.11；>= 8.0.0, < 8.21.0 → 8.21.0 |
| ws | [GHSA-58qx-3vcg-4xpx](https://github.com/advisories/GHSA-58qx-3vcg-4xpx) | >= 8.0.0, < 8.20.1 → 8.20.1 |

## 验证与限制

使用已验证的 Node 22.23.3 + npm 10 工具链执行 npm ci（含原生模块，不跳过脚本），并实际调用 Sharp 和临时内存 SQLite。新证据统一保存在 `/opt/data/output/momentpic-final-verification/`；`final-npm-ci.log`、`dependency-native-smoke.log` 记录安装及原生模块冒烟，均退出 0。最终 `final-audit-verified.json` / `final-audit-verified.log` 为 0 漏洞、退出 0；两端 tsc --noEmit、递归全部测试（服务端 109/109、前端 50/50，零跳过/取消）、构建及归档/图片/路由回归均通过，完整证据见 safety-verification.md。audit 为零不替代回归，亦非未来安全保证。

本轮不构建或运行 Docker、不访问 NAS、不读取真实数据库。部署产物及系统原生库须由父任务另行验证。依赖升级不清理历史数据库的分享明文或备份，历史数据仍待 DBA 显式处置。
