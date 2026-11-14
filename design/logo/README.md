# Shotviva logo（定稿 2026-11-07）

**标志：「S.」**，用字标字体 Instrument Serif 自己的 S 和句点字形，句点涂安全灯橙 `#FF5B2E`，墨色在暗底是骨白 `#F2ECE3`、浅底是近黑 `#0B0A09`。标志和「Shotviva.」字标是同一只字。

三档光学尺寸（同一字形按场景加重，`gen.py` 的 `FAT_ICON / FAT_LOCK / FAT_FAV`，单位是字体单位）：

| 场景 | 加重 | 文件 |
|---|---|---|
| App 图标（暗底，句点带微光） | +80 | `c-s-dot-icon-1024.svg`；PNG `export/c/icon-120.png`（Google OAuth）、`icon-180.png`（apple-touch）、`icon-512.png`、`icon-1024.png` |
| 字标旁的组合 | +45 | `c-s-dot-lockup.svg`（S. + Shotviva.）、`c-s-dot-lockup-tight.svg`（S. + Shotviva，导航用，句点只出现一次） |
| favicon | +110 | `c-s-dot-small.svg`（16，内置 `prefers-color-scheme` 自动换墨色）、`c-s-dot-small-32.svg`、`c-s-dot-small-mono.svg`（单色）；PNG `export/c/favicon-16|32|48-dark|light.png` |

`test.html`：浅色 / 深色标签栏、侧栏、180 / 512 图标、三种组合、单色三版。`python3 gen.py` 重生成全部 SVG 和测试页；PNG 用 Chrome 无头按真实像素渲染（见 DESKTOP-NOTES 第三十轮）。

授权：Instrument Serif 为 SIL OFL 1.1，字形改作标志允许；署名在 Terms 的 Third-party notices。商标：先注册文字 Shotviva，再注册「S. + Shotviva.」组合标；图形单独注册由律师判断。

选型过程（第一轮 A–D、第二轮 E–G、第三轮 H–J、第四轮 K–N、第五轮 P–S、第六轮 T–X、第七轮线性 Y / Z / O、十种风格 1–10、主流 AI 语法 11–20、暗房角色 21–30、手绘手势 31–40、网飞丝带 41–46）的文件已清理，记录见 `comps-v3-b/DESKTOP-NOTES.md` 第十七到三十三轮。

## 站内落地（T58）

- `src/app/icon.svg` 就是 `c-s-dot-small.svg`，随浏览器浅深色换墨色（Chrome / Edge / Firefox / Safari 26+ 用它）。
- `src/app/favicon.ico` 是给不认 SVG 图标的浏览器的兜底：16 / 32 / 48 三档都是暗房方块（`#0B0A09`，圆角）上的骨白「S.」（favicon 加重 +110），浅色和深色标签栏都清楚。透明底的单色 ICO 做不到两边都清楚。
- `src/app/apple-icon.png`：`c-s-dot-icon-1024.svg` 去掉圆角的满版 180（iOS 自己切圆角，透明角会变黑）。
- `public/icons/icon-192.png` / `icon-512.png`：manifest 图标，取 `export/c/icon-512.png`（192 由它缩）。
- **导航只用字标「Shotviva.」，不用 `-lockup-tight` 的「S. Shotviva」**（T58 用 impeccable 比对 375 / 1280 后决定）：并排时 S 出现两次，读起来像缩写人名「S. Shotviva」；手机营销顶栏本来就有副标题、地球和登录，再多 30px 更挤；「S.」本来就是字标压缩成的，留给放不下字标的地方（标签页、主屏幕、OAuth）。

## 邮件字标（2026-11-07）

- `public/brand/email/shotviva-wordmark@2x.png`（线上地址 `https://shotviva.com/brand/email/shotviva-wordmark@2x.png`）：Supabase 四个登录邮件模板（`supabase/templates/`）顶部的「Shotviva.」。邮件客户端不加载网页字体，所以字标做成图片。
- 浅底配色（邮件卡片是白底）：墨色 `#0B0A09`，句点 `#FF5B2E`，不透明白底（邮件客户端的深色模式不会把图片里的深字反白，白底保证仍然读得清）。
- 做法：无头 Chrome 用 `src/app/fonts/instrument-serif.woff2` 按 72px、字距 -0.02em（同导航字标）渲染，裁到字形边缘、补成偶数尺寸 210×60，邮件里按 105×30 显示；ImageMagick 最高压缩、去掉附加块（无损，约 5 KB）。
- 改字标时换新文件名，不覆盖旧文件：这个地址缓存一年（`next.config.ts`），已经发出去的邮件还指着它。
- **iOS 网页 App 启动图（T65）**：`startup.py` 生成 `export/startup/startup-<宽>x<高>.svg`（整屏暗房底 `#0B0A09`，App 图标的「S.」连同句点微光居中，图标框占屏宽 40%，去掉圆角底板），再用 Chrome 无头按真实像素渲染成 `public/startup/*.png`（命令写在脚本头部）。尺寸和 `src/core/seo/startup-images.ts` 一一对应，测试会检查每个文件都在。
