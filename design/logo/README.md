# Shotviva logo marks（2026-11-07）

**定稿：C「S.」（Owner 2026-11-07 确认）。**

**Owner 11-07 选定 C「S + 点」，已精修两轮**：`c-s-dot-*`。第二轮按 Owner「线条和英文字体不和谐」改为**直接用字标字体 Instrument Serif 的 S 和句点字形**（`instrument-S.json`，用 fontTools 从 `comps-v3-b/fonts/instrument-serif.woff2` 提取，`gen.py` 的 `c_mark()`），句点按字体原本的字距放在 S 后、涂橙：标志就是「S.」，和「Shotviva.」同一只字。第三轮按 Owner「单独看太瘦弱」做了光学尺寸：同一字形用描边加重，图标 +80 字体单位（展示级粗衬线）、字标旁 +45、favicon +110（`gen.py` 的 `FAT_ICON / FAT_LOCK / FAT_FAV`）。文件：`c-s-dot-small.svg`（16 / 32，自动换墨色）、`-small-mono.svg`、`-icon-1024.svg`（暗底 + 橙点微光）、`-lockup.svg`（S. + Shotviva.）、`-lockup-tight.svg`（S. + Shotviva，点只出现一次）。PNG 在 `export/c/`：favicon 16 / 32 / 48 深浅两套，icon 120（Google OAuth）/ 180 / 512 / 1024。

以下是选型过程的全部轮次，留档。

第三轮（Owner 11-07：感叹号太寻常、商标难注册）加了 H / I / J，出发点是「只属于 Shotviva 的具体构造」。第二轮加了 E / F / G（Owner 11-07 说第一轮四个没记忆点）。第一轮 A–D 留着对比。全部是 16px 网格上画的矢量，由 `gen.py` 生成（改几何改脚本，不手改 SVG）。看 `test.html`（起 design/ 的静态服务器后打开 `/logo/test.html`）。

| 方向 | 文件前缀 | 小图 16px 的样子 |
|---|---|---|
| **第七轮：线性，配瘦衬线字标**（Owner 11-07 讨论后定的方向；品牌标与 favicon 分两层） | | |
| Y 一笔光迹 | `y-light-trail-*` | 一条有粗细的笔画绕成近闭合的弧，末段渐细变橙；favicon 是粗弧 + 橙尾 |
| Z 细线 + 一点橙 | `z-hairline-lamp-*` | 发丝粗的圆环留一个口，口上一枚实心橙点；favicon 环加粗到 2px |
| O 字里长出的花饰 | `o-swash-*` | 一笔上扬收尾的书法花饰（扁头笔粗细）+ 句点；favicon 加粗 |
| **第六轮：规则生成的形**（Owner 11-07：要 ChatGPT / Claude 那种一眼记住） | | |
| T 浮现 | `t-emergence-*` | 骨白方块 + 角上两粒渐小的橙方：画面正在成形 |
| U 嵌套 | `u-the-nest-*` | 粗骨白圆角方环，里面一枚橙方块偏右下：主体不动、框在动 |
| V 安全灯 | `v-the-lamp-*` | 八道长短相间的光芒绕空心，一道橙 |
| W 链环 | `w-the-links-*` | 两只圆角方环互扣，一骨白一橙：前后相连 |
| X 潮线 | `x-the-tide-*` | 方块被一道斜的柔波分开，上骨白下橙：显影液在升 |
| **第五轮：抽象符号，不含字母**（Owner 11-07） | | |
| P 叠合 | `p-the-overlap-*` | 两张骨白相纸横向错开、重合处橙：主体不变、样子变。16px 读成一粒胶囊，弱 |
| Q 翻转 | `q-the-turn-*` | 骨白圆盘右缘翻成一弯橙：光变的那一刻。16px 清楚，有月相联想 |
| R 快门花 | `r-the-bloom-*` | 五片圆瓣围着橙心。16px 最清楚、最像「一个符号」，但是花 / 星号联想 |
| S 一套 | `s-the-set-*` | 三张扇开的相纸、前面一张橙。16px 糊成一团，弱 |
| **I S 接缝方块（第四轮已打磨，推荐）** | `i-s-seam-square-*` | 圆角方块被一道 S 形接缝分成左骨白右橙：显影的边界画成首字母，具体曲线可作图形商标 |
| H 两张错位相纸（第三轮） | `h-the-pair-*` | 骨白相纸 + 右下错位的橙相纸，剪影是台阶形 S，意思是前 / 后两张；但和「复制」图标撞 |
| **Sv 连笔四变体（第四轮）** | `k-sv-nested-*` / `l-sv-v-bottom-*` / `m-sv-cradle-*` / `n-sv-tick-*` | 墨色 S + 橙色 v，一笔相连，没有圆点（原 J 的「竖尾顶球」已去）。K 嵌套、L S 流入 V、M V 托着 S、N S 流入对勾 |
| **E 「viva!」（打磨中）** | `e-viva-print-*` | 一张竖版骨白相纸立在一枚橙点上，整体读成一个感叹号：viva 的那声「！」。1024 图标是真正的相纸（骨白边、方角暗面、下边距厚），微倾 4°；两种组合：`-lockup.svg`（图标 + Shotviva.）和 `-lockup-viva.svg`（Shotviva + 图标当最后一笔，读成 Shotviva!）。`export/` 里有 favicon 16 / 32 / 48（深浅两套）、icon 120（Google OAuth）/ 180 / 512 / 1024 PNG |
| F 折角 | `f-folded-corner-*` | 骨白方块右上角折下一片橙（Owner 看后我自己也否：像文件图标） |
| G S 接缝 | `g-s-seam-*` | 骨白 / 橙一个圆被 S 分开（自否：像太极 / 百事） |
| A 取景框 + 点 | `a-viewfinder-dot-*` | 四个 2px 角括号 + 中间橙点（字标的句点，也是快门） |
| B 半显影 | `b-half-developed-*` | 圆角方块左灰右骨白，中间橙色接缝（Phone / AI 对比） |
| C S + 点 | `c-s-dot-*` | 2.7px 粗 S + 右下橙点 |
| D 方折 S + 点 | `d-squared-s-dot-*` | 用取景框直角拼的 S + 右下橙点 |

每个方向：`-small.svg`（favicon，16 / 32；文件里带 `prefers-color-scheme` 规则，浅色标签栏自动换近黑墨色；并带 fill / stroke 属性兜底）、`-small-32.svg`、`-small-mono.svg`（单色）、`-icon-1024.svg`（App 图标，暗房底，允许一点深度；180 / 512 直接缩）、`-lockup.svg`（图标 + 字标，字标是活字，构建时转路径）。

颜色只用三个 token：墨色（暗底骨白 #F2ECE3 / 浅底近黑 #0B0A09）、橙 #FF5B2E、底 #0B0A09。Google OAuth 要 120×120 的 logo，改了要重新审核，选定再导出。
