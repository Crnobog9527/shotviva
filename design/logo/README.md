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
