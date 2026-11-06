# Shotviva UI 设计规范（DESIGN.md）

> v1 · 2026-11-04 起草 · v2 · 2026-11-05 按 Owner 拍板加入移动端应用壳（第 8 节）、上传按钮与三段状态、Web Share 下载 · 标「待定」的项要 Owner 拍板后再写进代码

## 0. 设计流程（硬规则）

**前台的任何 UI 设计工作都必须使用 `impeccable` skill，不允许跳过它直接写界面代码。** 包括新页面、新组件、改版、配色和字体、动效、空状态和错误状态。

流程：

1. 开工时用 `impeccable` 做一次设计方向：设计变量（颜色、字体、圆角、间距）+ 三个关键屏（首页、生成工作台、付费墙）。**三个关键屏先出 375px 手机稿，Owner 评审的就是手机稿，只评审这一次**，点头后定稿；桌面稿是手机稿的放宽，之后再出，不单独评审。
2. 之后每个前台页面和组件，仍然先用 `impeccable` 按已定方向出设计，再写代码；不再等 Owner 逐页点头。
3. 写完用 `impeccable` 对照设计做一次检查，修完问题再提 PR，PR 里附手机和桌面截图。
4. 设计方向本身要变（换配色、换字体、改关键屏布局），回到第 1 步找 Owner 评审。

**管理后台豁免 `impeccable`**：后台只有 Owner 自己用，直接用 shadcn 基础组件写。

只改文案、修 bug、不改变视觉的改动不受此限。拿不准算不算「设计」时，按「算」处理。

## 1. 设计原则

用户是不懂 AI 的日常用户和小商家（网店和二手卖家、餐饮店、美妆品牌、房东、宠物主人，Owner 2026-11-05 改定，不再只针对餐饮），多数人用手机操作。所有设计决定按下面四条排优先级：

1. **一眼看懂**：每个页面只有一个主要操作。产品界面（按钮、字段、标签、提示、错误信息）绝不出现 prompt、seed、guidance 这类词。营销页正文和 FAQ 可以用否定说法（"No prompts to write"、"Do I need to write a prompt? No."），这是卖点也是搜索词。工作台有一个**可选**的补充输入框 "Anything to change? (optional)"（Owner 2026-11-05，见第 4.3 节），让用户描述想加、去掉或调整的元素；它不叫 prompt、不是必填，模板仍是主路径，不出现只靠文字出图的入口。作品编辑（Owner 2026-11-06，ARCHITECTURE §5.2）在作品详情页有一个必填输入框 "What would you like to change?"，它是对**已有作品**的修改说明，也不叫 prompt；仍然没有从零只靠文字出图的入口。
2. **先看效果再动手**：模板、首页、标签页都以「前后对比图」开场。
3. **三步出图**：选模板 → 上传照片和填文案 → 生成。多一步都要有理由。
4. **手机是一个 app，不是缩小的网页**（Owner 2026-11-05）：登录后的页面按第 8 节的应用壳设计，先出 375px 手机稿；桌面是手机布局的放宽，不是另一套。任何页面 PR 的截图手机在前、桌面在后，没有手机截图的 UI PR 不合并。某个交互在手机上做不了（hover、拖拽、多列对比），以手机的做法为准改掉，不允许「手机上降级」。

## 2. 组件来源

| 来源 | 用在哪里 |
|---|---|
| shadcn/ui（new-york 风格） | 所有基础组件：按钮、表单、弹窗、下拉、标签页、表格、提示 |
| Magic UI | **可选**，只在 impeccable 设计方向明确需要某个效果时引入，且只用在营销页。不能拖慢首屏（R11）。工作台和后台不用 |
| 自建（按 shadcn 写法） | 前后对比滑块、上传按钮区、生成进度卡、付费墙抽屉、模板卡片、底部 tab bar |

规则：

- 优先从 Graylum staging 的 `apps/web/src/components/ui` 复制已有组件（同为 Tailwind v4 + shadcn），保持两站一致。
- 不准在业务代码里直接写颜色值、阴影值，一律用第 3 节的变量。
- 不准引入第三套组件库。

## 3. 设计变量

所有颜色定义在 `globals.css` 的 `:root` 上，用 shadcn 的变量名。

### 3.1 颜色

Owner 2026-11-05 定稿：**B 版「暗房」（Darkroom）**，取代此前的「打烊后的街」深色稿。界面克制，视觉重心让给用户的照片，有高级感和原生 app 的手感。**设计系统已入库，以仓库里的 `design/DESIGN.md`（组件、版式、命名规则）、`design/tokens/tokens.css`（全部变量）、`design/TOKENS.md`（变量说明和 T8 实现时要清理的问题）为准**，高保真稿是 `design/comps-v3-b/`（home / create / workspace / paywall / photos）。下表只列 shadcn 主变量，值以 `tokens.css` 为准，两处不一致时改本表。

| 变量 | 用途 | 值 |
|---|---|---|
| `--background` / `--foreground` | 页面底色和正文 | `#0B0A09` / `#F2ECE3` |
| `--primary` | 主按钮、链接、选中态（safelight 橙） | `#FF5B2E`，字色 `#1A0702` |
| `--muted` | 次要底色、占位 | `#1C1916`，说明字 `#A2988C` |
| `--accent` | 标签、徽章 | `#2A2420` |
| `--destructive` | 删除、错误 | `#FF5A5A` |
| `--success` | 生成成功、付款成功 | `#7FD6A0`（shadcn 默认没有，要补） |
| 付费墙三档材质 | Starter 哑光石墨、Pro 深宝石蓝玻璃、Max 实色黑金 | 见 `design/DESIGN.md`「Tier materials」，T8 实现时收进 `:root` |

要求：

- v1 只做深色模式，变量结构按 shadcn 写好，以后要加浅色模式不用改组件。营销页和应用页同一套深色。
- 正文与背景对比度至少 4.5:1，按钮文字至少 4.5:1（WCAG AA）。

### 3.2 字体

- B 版定稿：正文 **Geist**，数字和代码 **Geist Mono**，标题点缀 **Instrument Serif**（含斜体）。通过 `next/font` 自托管（字体文件见 `design/comps-v3-b/fonts/`），不走外链。
- **简体中文用小米 MiSans**（开源，免版税可商用；Owner 2026-11-06 定，照 Graylum 的做法）：
  - 字重只用 400 / 500 / 600。
  - 字体栈：英文字形仍由 Geist / Instrument Serif 负责，排在第一位；中文字形由 MiSans 负责，排在它们后面。完整写法 `Geist, 'MiSans', 'PingFang SC', 'Hiragino Sans GB', 'Microsoft YaHei', sans-serif`（Instrument Serif 和 Geist Mono 同理，在后面接 MiSans 和系统字体）。
  - 加载方式（ARCHITECTURE §17）：用官方分包 + `unicode-range`，页面上出现哪些字才下载哪些分包；hydration 之后再插入样式表，不挡首屏；不做 preload；不用任何外部字体主机。
  - 繁体、日文、生僻字回退到系统字体。
  - Instrument Serif 只用于英文标题；`/zh` 页的标题用 Geist + MiSans 600；中文不用斜体；中文正文行高不低于 1.6。组件不准给文字容器写死宽度，中英两种长度都要放得下。
- 字号：正文 16px（手机上不许小于 16px，否则 iOS 输入框会自动放大页面），说明文字 14px，H1 手机 32px / 桌面 48px。

### 3.3 间距、圆角、阴影

- 间距只用 Tailwind 的 4 倍数刻度。
- 圆角：`--radius` 取 `tokens.css` 的值（B 版 14px），按钮和输入框跟随 shadcn 的派生值。
- 阴影只用两级：卡片悬停、弹窗。

## 4. 关键页面与组件

### 4.1 前后对比图

- 默认展示「前后左右拖动」滑块；手机上也能单指拖动。
- 每张对比图下方一行可见说明，写清楚改了什么（建站规格 R9）。
- 首屏对比图不准懒加载，图片用 WebP/AVIF，`alt` 写「场景 + 主体 + 光线」。

### 4.1.1 首页结构

首页是工具落地页，模板网格只是其中一块。区块顺序固定为：H1 + 直答块 → 首屏生成器 + 对比图（首页直接出图，见 ARCHITECTURE.md 第 13 节）→ 精选模板网格 → 事实块 → 成本对比表 → FAQ → 内链块（见 ARCHITECTURE.md 第 13 节）。设计时不准把首页做成只有模板卡片的画廊页，正文区块也要设计得好读，不能藏进折叠或弹窗（建站规格 R5）。

### 4.2 模板卡片

- **展示媒体**：卡片可以是静态图、动图或短视频（ARCHITECTURE §8.3）。**只有动图和视频卡**在左上角放一个小图标标明类型（GIF / 播放），静态卡不放。视频：静音、循环、内联播放、不显示控制条；进入视口才播放，离开暂停；首屏卡片先显示封面帧，视频延后加载；系统开了「减少动态效果」时只显示封面帧。图片和封面帧都写 `alt`（建站规格 R9）。
- **每张模板卡都是一组常显的左右对比**（Owner 2026-11-05）：左半是手机原图，右半是 AI 结果，两边标签固定写 "Phone" / "AI"（首屏对比图和预览抽屉同样用这两个词）；不做切换按钮、不靠悬停；视频 / 动图卡播放「原图 → 结果」的变化过程。首页每个分类上方一到两行介绍，强调「手机照片 → AI 成品」。
- 点模板卡片先弹出**模板预览底部抽屉**（Owner 2026-11-05，参考 Lovart）：可拖动的「你的照片 vs 模板效果」前后对比、一句用途说明、"From N credits"、主按钮 "Use this template" 进入工作台。首页和 Create 页都用这个抽屉，不直接跳工作台。
- 卡片上只写：模板名、适合什么（例如 "Menu & delivery apps"）、消耗多少 credits——写这张模板自己 1K 档的数（例如 "From 2 credits"，数字读模板的 `credits_cost`，建站规格 G4），2K / 3K 的数在工作台选分辨率时才显示。

### 4.3 生成工作台

单列、从上到下一屏滚完，不做分步向导：

1. 上传区：大号按钮区，手机上点击调起相册 / 相机（两个入口："Take photo" 带 `capture`，"Choose from gallery" 不带）；桌面上同一块区域也接受拖拽。显示允许的格式和大小（JPG / PNG / WebP，up to 20MB）。
2. 文案区：只出现模板需要的字段，每个字段带示例占位。
2b. 可选补充输入框：标签 "Anything to change? (optional)"，占位例如 "Add a sprig of mint, remove the napkin"，≤300 字符，可留空。界面不出现 prompt 一词。
3. 尺寸选择（Owner 2026-11-05，8 个）：**Original**（按原图比例）/ **Banner 16:9** / **Post 4:5** / **Listing 1:1** / **Story 9:16** / **Rental 3:2** / **Website 4:3** / **Pin 2:3**，用带比例示意的图标按钮，默认 Original。和清晰度（Standard / HD / Max）是两个独立选择；同一清晰度下各比例的输出 token 都不超过该档正方形（ARCHITECTURE §8.1），所以扣费不随比例变。
3b. 分辨率选择：三张上下排列的选项卡，默认第一张。界面只显示 **Standard / HD / Max**（Owner 2026-11-05 定），每张写一行像素和用途，右侧写消耗：「Standard — 1024 px · Social & delivery apps · 2 credits」「HD — 2048 px · Websites & online stores · 4 credits」「Max — 2880 px · Print & zoom · 6 credits」（credits 数从该模板的 `credits_cost` 读，不写死）。内部代号 `1k` / `2k` / `3k` 只在代码和数据库里用，界面、营销页、FAQ 都不出现 1K / 2K / 3K，也不准用 "4K"、"Ultra HD"、"SD"。余额不够某一档时该档的 credits 变灰，主按钮变成 "Get credits · N needed" 并打开付费墙。
4. 生成按钮：固定在底部拇指区、全宽，写清楚当前分辨率的消耗，例如 "Generate · 2 credits"，切换分辨率时按钮上的数字跟着变。按钮旁显示余额 "30 credits + 6 free"。
5. 这一单将用免费积分时，按钮上方一行告知："This photo uses free credits: it's shown publicly with a watermark. Paid credits make it private and watermark-free." 将用付费积分时不显示。

单位叫法：价格、扣费、余额一律叫 **credits**，不说「张」；余额分开显示付费和免费（"30 credits + 6 free"）。**唯一例外**：新用户赠送对外写成 "3 free Standard images"（= 6 个免费 credit，Owner 2026-11-05），只用于营销页、注册提示和 FAQ 讲赠送的那一句。

### 4.4 生成中、成功、失败

- 上传分三段可见状态：**Compressing → Uploading（进度条）→ Generating**，每段都有文字，不准只转圈。
- 生成中：进度卡显示预计耗时，一律写「Usually about 60 seconds」/「一般 60 秒左右」。**出图时长全站只用这一个模糊说法**（Owner 2026-11-06）：不写区间、不按清晰度分开写，首页账单、FAQ、SEO 页同样如此，免得供应商波动时变成没兑现的承诺。可以离开页面，回来自动恢复；顶栏显示「Generating…」小标记直到完成，结果也在「我的作品」里。
- 成功：大图全宽预览（按生成比例，不裁切）+ 「Share」+ 「再生成一张」+ 前后对比。**Share 优先走 Web Share API**（`navigator.share({ files })`）：iOS / Android 弹系统分享面板，可存相册、发 WhatsApp / Instagram / X 等已装 app，不需要任何权限；`navigator.canShare` 不支持时（微信等内置浏览器、桌面）按钮改成 "Download" 走 `<a download>`，图下一行小字 "Long-press to save"。实现规则见 `MOBILE_UI_rules_fable.md` §1.8.1。
- 失败：说明原因、告知「额度已退回」、给出 "Retry"（不用重新选图）和「换一张照片」。

### 4.5 付费墙

- 触发：免费额度用完，或免费用户想把作品设为私密。
- 手机上是底部抽屉，桌面是居中弹窗（第 8.4 节）。9 个商品（ARCHITECTURE.md 第 6.2 节）。**2026-11-06 起以签收的 v3-b 稿 `design/comps-v3-b/paywall.html` 为准：改成单屏**（顶部 Monthly / Yearly 切换、三档卡、积分包入口、付款方式和条款在同一屏），下面两步的描述保留作内容要求（每档写什么、付款方式两组和续费条款），不再要求分两屏：
  1. **第一屏：选档位**（Owner 2026-11-05 修订）。顶部 **Monthly / Yearly** 切换；三张竖排卡片 Starter / Pro / Max 用三种材质色区分（Owner 2026-11-05 二次修订）：Starter 哑光石墨、Pro 深蓝宝石玻璃（推荐）、Max 黑金（金色描边、金色价格、金色按钮，带缓慢流光并标 "Best value"）。只有选 Yearly 时才显示节省，每张卡直接写省多少；Monthly 时不显示任何节省字样：划掉的按月折算价 + "Save $99.80 / $249.80 / $489 a year vs monthly"（数字从配置算，不写死）。流光动效在「减少动态效果」下关闭。每张写月付价、每月 credits、每 credit 单价（"$19.90 / month · 50 credits · $0.40 per credit"），Pro 高亮为推荐。卡片下方一行次要入口 "Just need a few photos? Credit packs from $9.90 →"。价格数字全部从 `site.config.ts` 读。
     - **档位权益**（Owner 2026-11-05，见 ARCHITECTURE §6.2「会员档位权益」）：每张卡列 "Everything in X, plus"。**只有已经上线的权益可以写成现有功能**；没上线的放在卡片底部单独一组，统一标 "Coming soon"，灰色小字，不能和现有权益混排。哪些上线、哪些 Coming soon 以 ARCHITECTURE §6.2 那张表为准。
     - 英文页面付款方式只写 "Alipay"，不带中文；中文页面写「支付宝」（Owner 2026-11-06）。
  2. **第二屏：选周期**。顶部分段控件 **Monthly / Yearly**（Yearly 段上标 "Save 40%"，折扣数从配置算），下面是所选档位的价格、credits 总数（年付写 "600 credits upfront"）和每 credit 单价；再往下是两组付款方式。从积分包入口进来的第二屏是 S / M / L 三项（"20 credits · $9.90" 并标 "One-time · no subscription"），再往下同样两组付款方式。
- **两组付款方式**：「Card · Apple Pay · Google Pay」和「Alipay」（不接微信支付，Owner 2026-11-05）。会员商品下，卡那组小字 "Renews automatically, cancel anytime"，钱包那组小字 "One-time payment, 30 days / 1 year, no auto-renew"；积分包在两组下都是单笔，小字只写 "One-time payment"。走 Waffo 时全部单笔。
- `/pricing` 页用同一套信息，桌面三栏并排（Starter / Pro / Max，顶部 Monthly / Yearly 切换），积分包一行三项放在下面；手机上退化成和付费墙一样的竖排。
- 账号页「Subscription」区块：当前档位和周期（"Pro · Yearly"）、状态（Active / Cancels on … / Past due / Free）、下次续费日，一个「Manage subscription」按钮打开 Stripe Customer Portal；钱包用户显示 "Paid until …" 和「Renew」按钮。
- 付款方式图标：卡、支付宝，按当前通道可用的方式显示。
- 价格数字从 `site.config.ts` 或数据库读，禁止写死。

### 4.6 空状态和错误页

每个列表都要有空状态：一句话说明 + 一个按钮（例如「我的作品」为空 → "Create your first photo"）。404 页给出首页和模板库入口。

### 4.7 模板需求墙（Wishlist tab）

规则见 ARCHITECTURE.md 第 15 节，这里只写界面。

- **墙页**（tab 根页）：顶栏标题 "Wishlist" + 右侧「My requests」入口；底部固定主按钮 "Request a template"（未达门槛时灰掉，下方一行 "Create one photo first to join"）。卡片列表按票数倒序：参考图（多张时横滑）、描述、脱敏用户名、右下角 "I want this too" 按钮 + 计数，已投票为选中态。`shipped` 卡片置顶，顶部一条 "Shipped →" 带模板名，点击进该模板的工作台。
- **发帖**（流程页，隐藏 tab bar）：上传区（1～3 张，复用工作台的上传按钮区和三段状态）→ 一个多行文本框（占位 "Describe the look you want, e.g. a dark moody poster for our weekend brunch menu"，计数 ≤300）→ 底部固定 "Submit"。提交成功后回墙页并 toast "Sent for review"。
- **My requests**（流程页）：本人需求列表，每条带状态标签 Pending / Live / Shipped / Rejected，Rejected 不显示原因。
- 空状态：墙空时显示 "Tell us what template you need" + 发帖按钮；My requests 空时 "You haven't requested anything yet"。
- 参考图点击全屏查看，长按不承担功能（第 8.3 节）。
- 后台需求审核页豁免 impeccable，按第 7 节用 shadcn 基础组件、中文。

## 5. 文案语气

- 用简单英文，句子短，面向不懂 AI 的日常用户和小商家，不写行业黑话。
- 用 "photo"，不用 "image generation"；用 "template"，不用 "prompt"。
- 按钮写动作："Upload photo"、"Generate"、"Download"，不写 "Submit"、"OK"。
- 每个页面都要出现三个卖点之一（建站规格第 0 节）：照片主体保持原样、不用写提示词、3 步出图。

## 6. 可访问性和性能

- 可点击区域至少 44×44px。
- 所有图片有 alt，装饰图用空 alt。
- 表单错误紧跟在字段下面，并能被读屏软件读出。
- 键盘能完成全部流程，焦点样式清晰可见。
- 移动端 LCP < 2.5s、CLS < 0.1、INP < 200ms（建站规格 R11）。Magic UI 动效不能拖慢首屏，必要时延后加载。
- **全站流动背景：Bold 档**（Owner 2026-11-07，营销页和登录后的应用页都用；照 `design/comps-v3-b/demo-background.html` 的 Bold 预设和 `DESKTOP-NOTES.md` 第十四轮第 2 条实现）：颗粒（`steps(8)`）+ 两个安全灯光池漂移（42s / 57s）+ 滚动跟随（光池以页面滚动 1/10 的速度移动，滚动中亮度提高）+ 指针跟随（小光池追指针，大光池向指针倾斜）+ 晕影呼吸。
  - 只用固定定位层的 transform / opacity，不触发布局；JS 只有一个 passive 滚动监听和一个 rAF 指针插值；标签页隐藏时暂停。
  - 触屏设备（`hover: none`）没有指针跟随层；`prefers-reduced-motion` 时全部关闭，只留静态地面。
  - 不能拖慢首屏：背景层在首屏渲染之后挂载，验收时核对 LCP / CLS / INP 不退步。
  - 背景层在内容之下，不影响任何文字对比度；作品图、对比图、付费墙、后台不加额外光效（后台不挂流动背景）。
- **签收稿的应用页动效补齐**（`DESKTOP-NOTES.md` 第 6 条「动效与地面（应用页）」）：应用页 `body` 同样用 `#0E0C0A → #0B0A09` 纵向渐变地面；Create 卡片、工作台各区块、Photos 任务和成片用一次性入场淡入（480ms，40ms 递增，最多 8 级）。
- **购买成功的庆祝动效**（Owner 2026-11-07，照 `design/comps-v3-b/demo-celebrate.html` 和 `DESKTOP-NOTES.md` 第十三轮第 4 条、第十四轮第 2 条实现）：结账返回页确认到账（「成功」状态，不是「处理中」）时播放一次，按购买的东西逐级加码：积分包约 1 秒、Starter 2.5 秒、Pro 3.5 秒（蓝宝石材质）、Max 约 7 秒（黑金 + 金箔，含余烬）；年付和月付同档同效。
  - 粒子由一个 canvas 引擎画（paper / foil / disc / spark / ember），材质和付费墙的档位卡一致；播完自动移除 canvas。
  - 同一笔付款只播一次：用付款 id 记在浏览器本地，刷新或再次打开返回页不重放。
  - `prefers-reduced-motion` 时只保留卡片淡入，没有粒子；不阻塞页面其他内容和按钮，点击任何地方可以跳过。
  - 动效代码按需加载，只在返回页成功态加载，不进其他页面的包。
- 尊重系统「减少动态效果」设置。
- 每个 UI PR 除 375px / 1280px 截图外，再由验收方在 iOS Safari 真机过一遍第 8.7 节的清单。

## 6.9 电脑稿与 Owner 2026-11-06 的修改（优先于本文件其他地方冲突的说法）

依据 T6 的电脑稿（`design/comps-v3-b/desktop-board.html`、`DESKTOP-NOTES.md`）和 Owner 审稿意见。T6 终审后，以电脑稿为准实现。

1. **模板卡的对比方式**：
   - 画风迁移（Art Styles）类保留中间可拖动的对比遮罩。
   - 其他类一律左右并排两张图：左边是手机实拍原图，右边是 AI 成品。
   - 首页画风迁移的首图保留遮罩，去掉左上角的播放按钮。
2. **点模板直接进入制作**：去掉「确认使用这个模板吗」这一步。点模板弹出制作面板（Lovart 式）：左边是样图，右边是工作台。
   - 电脑上，从模板网格点开是弹窗。
   - 手机上、从 Photos 的「再做一张」进入、直接打开链接或刷新时，是同一个面板的整页形态。
   - 弹窗是模板页里的客户端弹窗，不用 Next 的拦截路由（总控 2026-11-06，T38）：拦截路由下弹窗里点 Generate 软跳不到同一网址的整页工作台，硬刷新又会丢掉已上传的照片。
   - 批量（T28）在弹窗里只选模板和第一张照片；要多选时进整页工作台，在底部照片托盘里加（T6 稿 `workspace.html` 的批量三态）。
   - 原来的模板预览抽屉不再使用。
3. **模板缩略图的变化动效**：登录后的模板页上，缩略图平时静止；电脑上鼠标悬停时播放「实拍 → 成品」的擦除动画（CSS clip-path 循环），手机上滑入视口时播放一次，「减少动态效果」打开时不播。这只是装饰，不承载任何功能。
4. **营销页顶部导航**：Templates / Pricing / Log in / Start free。**已登录时**（Owner 2026-11-07 发现营销页总显示 Log in，像是掉了登录）：Log in / Start free 换成一个主按钮「Open app / 进入应用」（链到 `/generate`）和账号图标（链到 `/account`）；营销页本身仍然静态缓存，登录状态放在一个按请求渲染的小块里（Suspense 动态洞），未登录时的样子不变。已登录访问 `/login`、`/signup` 直接跳到 `next` 或 `/generate`，不再显示表单。后台的「回到网站」链到 `/generate`。v1 没有 `/templates` 页面（ARCHITECTURE §13），「Templates」链到首页的模板区 `/#templates`。
   - **语言切换（Owner 2026-11-06）**：导航里 Pricing 和 Log in 之间放一个小地球图标按钮（无文字，`aria-label` 写 "Language / 语言"），点开是两项菜单「English」「简体中文」，当前语言打勾；切换后进入对应语言的同一页（没有中文版的页面去中文首页）。手机上地球图标留在顶栏，不收进菜单。页脚保留文字版切换。浏览器语言是中文时仍是可关闭的提示条，不自动跳转（ARCHITECTURE §17）。应用里在账号页放「Language」一行。
5. **页脚**：
   - 主行：`support@shotviva.com` 和 `© 2026 Shotviva`（品牌名一个字不差，不写 Shotviva AI；Owner 2026-11-06，建站规格 §1）。
   - 下面一行：四个法律页链接。页脚**不写**运营主体和地址（Owner 2026-11-06：美国法律不要求放在页脚）；主体名称和地址写在条款 / 隐私政策的联系方式一节和首页 Organization 结构化数据里，都从 `site.config` 读，满足建站规格 G8、加州 B&P §17538 的卖家信息披露和 Stripe 审核。
   - MiSans 的署名不放页脚，改放在条款页的「Third-party notices」一节（ARCHITECTURE §17）。
6. **首页「What a set of photos costs」**：做详细的金额和时间对比，一边是请摄影师（价格、天数），一边是 Shotviva（credits、秒数）。
   - 摄影师报价取有来源的行业区间，来源写进 notes。
   - 上线前由 Owner 确认这些数字。
   - 所有数字从 `site.config` 读（G3 单一口径）。
   - 「Save up to 40%」按三档年付的实际节省取**最高值**（四舍五入到整数：Max $713 实际省 39.98%，显示 40%），由配置计算得出，不写死；改价后是 Max 的 40%（Owner 2026-11-06：最多 40%，41% 是错的）。
7. **电脑端布局**（替代第 8.6 节的「最宽 720px」）：
   - 内容最宽 1120px，居中。
   - 电脑端 H1 为 36px（替代第 3.2 节的 48px）。
   - 应用顶栏的链接和底部 tab bar 一致（Create / Wishlist / Photos / Account，Wishlist 随开关显示），右侧显示余额。
   - **应用顶栏左侧放品牌字标**（Owner 2026-11-07）：电脑端应用顶栏最左边放和营销页一样的「Shotviva.」字标（小号，不带「AI photo studio」副标题），点击回到营销首页 `/`（中文是 `/zh`）。已登录用户在首页也能直接用首屏生成器创作，营销页顶栏按已登录状态显示「进入应用」和账号图标（DESIGN §6.9 第 4 条）。
   - 营销页和应用页的具体布局以电脑稿为准。
8. **定价页「For business」模块**（Owner 2026-11-06）：放在积分包下面、FAQ 上面，和个人档位明显区分（不做第四张价格卡，不写价格）。
   - 标题 "For business"，一句副标题说明给谁：品牌、电商卖家、餐饮连锁、代运营公司等需要大批量出图的团队。
   - 列 5～6 条「我们可以为你定制的」，按 B 端最看重的排：① 批量价格（按月出图量给更低的单张价，按发票付款、年度合同）；② 专属模板（按你的品牌规范、产品线和平台规格定制，整个目录风格统一）；③ 更大的并发和批量（一次处理整个商品目录）；④ API 接入（接进你的商品系统或店铺，自动出图）；⑤ 隐私和数据条款（作品私密，可签数据处理协议）；⑥ 专人对接（上手培训、优先支持）。
   - 措辞一律写成「可以为你安排 / 联系我们定制」，**不写成现成功能**：这些现在都没有后台和代码，有 B 端客户来了再开发（Owner 2026-11-06）。不写 SLA、SSO、团队账号这类没做也没打算马上做的承诺。
   - 唯一按钮 "Contact us"：`mailto:support@shotviva.com`，预填主题 "Business inquiry — Shotviva" 和正文提示（公司名、每月大概出图量、用在哪些平台、想定制什么），方便 Owner 在邮箱里按主题筛选。中文页同样有这一块，邮件主题保持英文好筛选。
   - 点击按钮发 PostHog 事件 `contact_sales_click`（ARCHITECTURE §16.2）。
9. **首页生成栏真的能出图**（Owner 2026-11-06）：首页首屏的生成栏（照片、模板、尺寸、补充说明、Generate）和模板库、工作台走同一条出图路径，不另写一套。
   - 已登录：点 Generate 就上传照片（直传 R2）、预扣积分、发起生成，并直接跳到该模板工作台的生成中视图（同一个任务 id），出图后显示结果，作品进 Photos。
   - 未登录：打开注册 / 登录弹层；回来后保留刚才选的模板、尺寸、补充说明和照片（照片在浏览器里暂存，登录后再上传），用户再点一次即可生成。
   - 积分不够：打开付费墙，按钮写「Get credits · N needed」，和工作台一致；新用户的免费额度在这里同样可用。

## 7. 管理后台

- 页面清单见 ARCHITECTURE.md 第 10 节（Owner 2026-11-06 扩充）。
- **后台外壳**：
  - 左侧导航。后台是 Owner 在电脑上用的工具，第 8 节「不准侧边栏」只管用户侧的应用壳。
  - 顶部放当前账号和「回到网站」。手机上，左侧导航收成顶部下拉。
  - 借用 Graylum 后台的骨架和风格：侧栏、统计卡片、表格加筛选栏、空状态、加载和错误状态。只借样子和组件拆法，不搬 Graylum 的业务页面。
  - 用 B 版的颜色变量（深色），不另起一套主题。
- 豁免 `impeccable`，只用 shadcn 基础组件，不用 Magic UI。**界面只用中文**，后台只给 Owner 用，不做英文版，不进 `site/messages/en.json` / `zh.json`。文案集中放在各后台功能目录的 `copy.ts` 里，不散写在组件中（总控 2026-11-06）。
- 表格优先，默认按时间倒序，支持搜索。
- 危险操作（调积分、下架、封禁）必须二次确认，并要求填写原因。例外：需求墙的拒绝和下架只做二次确认，不填原因（ARCHITECTURE §15.4：v1 不做拒绝原因）。

## 8. 移动端应用壳（Owner 2026-11-05 定）

推导见 `MOBILE_UI_rules_fable.md`。这里是硬规则。

### 8.1 两类页面，两套壳

| 类型 | 页面 | 壳 |
|---|---|---|
| **营销页**（走 SEO） | 首页、`/image-to-image-generator`、`/pricing`、模板页、博客 | 普通网页：顶部简洁导航 + 可滚动正文 + 页脚，按建站规格的结构 |
| **应用页**（登录后） | 工作台、需求墙、我的作品、账号、付费墙 | **app 壳**：固定顶栏 + 固定底部栏，内容区独立滚动，没有页脚、没有营销导航、没有 SEO 正文 |

营销页点「Upload photo」进入应用壳，之后到出图完成不再看到营销元素。两套壳是 `app/(marketing)` 和 `app/(app)` 两个 layout（ARCHITECTURE.md 第 1 节）。

### 8.2 应用壳结构

- 底部 tab bar 固定项：**Create**（模板选择）/ **Wishlist**（模板需求墙，ARCHITECTURE.md 第 15 节，只在 `features.wishlist` 开时渲染）/ **Photos**（我的作品）/ **Account**。开着是四项，关着是三项，两种宽度都要好看。图标 + 文字，高 56px + 底部安全区。不做汉堡菜单、侧边抽屉。
- **流程页隐藏 tab bar**：从 Create 选了模板后进入工作台，工作台、生成中、结果页都是全屏流程页——顶栏左侧「返回」，底部换成固定主操作栏，和原生 app 从 tab 根页推入详情页一样。
- 顶栏只放：返回或标题、右侧最多一个动作（例如剩余张数）。不放 logo 大图、不放导航链接。**例外**（Owner 2026-11-07）：手机上 tab 根页（Create / Photos / Account 等）的顶栏左上角放小号「Shotviva.」字标，点击回营销首页；流程页（工作台、结果页）左上角仍是「返回」。
- 主操作永远在底部拇指区，永远全宽、高 48～56px，永远只有一个。

### 8.3 触控

- 可点区域 ≥ 44×44px，页面左右边距 16px，卡片间距 12～16px。
- **禁止 hover-only 交互。**
- 对比滑块单指拖动，并且点击任意位置能跳到该处。
- 整页不准横向滚动；横向滚动只允许在明确的卡片轨道里，右侧露出半张卡提示可滑。
- 长按不承担任何功能（和 iOS 系统菜单冲突）。

### 8.4 弹层

- **手机上所有弹窗一律底部抽屉**，用 shadcn `Drawer`（vaul），可下拉关闭：付费墙、比例选择、模板预览、确认删除。桌面才用居中 `Dialog`。用 shadcn 的 Responsive Dialog 模式：同一组件，`md` 以下渲染 Drawer，以上渲染 Dialog。
- 禁止浏览器原生 `alert / confirm / prompt`。Toast 从顶部出，不盖底部操作栏。

### 8.5 视口、安全区、键盘

- `<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">`。
- 固定顶栏 / 底栏用 `env(safe-area-inset-*)` 补边距；全屏高度用 `100dvh`，**禁用 `100vh`**。
- 输入框字号 16px；文案字段加 `enterkeyhint="done"`、`autocapitalize="sentences"`；字段获得焦点时 `scrollIntoView`，键盘弹出期间底部操作栏可以隐藏。

### 8.6 桌面是手机布局的放宽

- 应用页桌面版：内容区 `max-width` 720px 居中；底部 tab bar 变成顶栏右侧三个链接；底部主操作栏变成内容区末尾的大按钮；Drawer 变 Dialog。
- 工作台在 ≥1024px 可以变两列（左表单、右预览），这是**唯一**允许的桌面专属布局。
- 不允许桌面版多出手机版没有的功能或入口。

### 8.7 禁止清单与真机检查

禁止：PC 栅格缩小、hover-only、整页横向滚动、固定像素宽度、`100vh`、小于 16px 的输入框、原生 alert、汉堡菜单、侧边栏、面包屑、同一页面超过一个主按钮。

v1 不做：PWA / 离线、安装提示、推送、Web Share Target、原生 app、手势返回动画。

真机检查（iOS Safari，每个 UI PR）：底部栏不被地址栏顶出、键盘弹出时字段可见、选图能调相册和相机、压缩和上传有进度、切后台再回来生成结果能恢复、Share 能存到相册。
