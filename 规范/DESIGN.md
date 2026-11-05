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

1. **一眼看懂**：每个页面只有一个主要操作。产品界面（按钮、字段、标签、提示、错误信息）绝不出现 prompt、seed、guidance 这类词。营销页正文和 FAQ 可以用否定说法（"No prompts to write"、"Do I need to write a prompt? No."），这是卖点也是搜索词。工作台有一个**可选**的补充输入框 "Anything to change? (optional)"（Owner 2026-11-05，见第 4.3 节），让用户描述想加、去掉或调整的元素；它不叫 prompt、不是必填，模板仍是主路径，不出现只靠文字出图的入口。
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

Owner 2026-11-05 改定：**深色系**（T6 深色方向「打烊后的街」，取代 2026-11-04 的「先走浅色」）。仍然不刻意贴合食物，界面本身要克制，把视觉重心让给用户的照片；整体要有高级感和原生 app 的手感。具体色值以 T6 定稿的 `design/DESIGN-dark.md` 和 `design/tokens/` 为准，定稿后填进下表。

| 变量 | 用途 | 值 |
|---|---|---|
| `--background` / `--foreground` | 页面底色和正文 | 深色底 / 浅色字（待 T6 定稿） |
| `--primary` | 主按钮、链接、选中态 | 待 impeccable 定 |
| `--muted` | 次要底色、占位 | 待 impeccable 定 |
| `--accent` | 标签、徽章 | 待 impeccable 定 |
| `--destructive` | 删除、错误 | 红 |
| `--success` | 生成成功、付款成功 | 绿（shadcn 默认没有，要补） |

要求：

- v1 只做深色模式，变量结构按 shadcn 写好，以后要加浅色模式不用改组件。营销页和应用页同一套深色。
- 正文与背景对比度至少 4.5:1，按钮文字至少 4.5:1（WCAG AA）。

### 3.2 字体（待 impeccable 定）

- 字体在用 `impeccable` 做设计方向时确定，通过 `next/font` 自托管，不走外链。
- 字号：正文 16px（手机上不许小于 16px，否则 iOS 输入框会自动放大页面），说明文字 14px，H1 手机 32px / 桌面 48px。

### 3.3 间距、圆角、阴影

- 间距只用 Tailwind 的 4 倍数刻度。
- 圆角：卡片 `--radius: 0.75rem`，按钮和输入框跟随 shadcn。
- 阴影只用两级：卡片悬停、弹窗。

## 4. 关键页面与组件

### 4.1 前后对比图

- 默认展示「前后左右拖动」滑块；手机上也能单指拖动。
- 每张对比图下方一行可见说明，写清楚改了什么（建站规格 R9）。
- 首屏对比图不准懒加载，图片用 WebP/AVIF，`alt` 写「场景 + 主体 + 光线」。

### 4.1.1 首页结构

首页是工具落地页，模板网格只是其中一块。区块顺序固定为：H1 + 直答块 → 首屏生成器 + 对比图（首页直接出图，见 ARCHITECTURE.md 第 13 节）→ 精选模板网格 → 事实块 → 成本对比表 → FAQ → 内链块（见 ARCHITECTURE.md 第 13 节）。设计时不准把首页做成只有模板卡片的画廊页，正文区块也要设计得好读，不能藏进折叠或弹窗（建站规格 R5）。

### 4.2 模板卡片

- 封面是对比图的「后」图，卡片上一个「Before / After」小切换看「前」图；不用悬停（手机没有悬停）。
- **展示媒体**：卡片可以是静态图、动图或短视频（ARCHITECTURE §8.3），左下角一个小图标标明类型。视频：静音、循环、内联播放、不显示控制条；进入视口才播放，离开暂停；首屏卡片先显示封面帧，视频延后加载；系统开了「减少动态效果」时只显示封面帧。图片和封面帧都写 `alt`（建站规格 R9）。
- **每张模板卡都是一组对比**（Owner 2026-11-05）：左半是手机原图，右半是 AI 结果；视频 / 动图卡播放「原图 → 结果」的变化过程。首页每个分类上方一到两行介绍，强调「手机照片 → AI 成品」。
- 点模板卡片先弹出**模板预览底部抽屉**（Owner 2026-11-05，参考 Lovart）：可拖动的「你的照片 vs 模板效果」前后对比、一句用途说明、"From N credits"、主按钮 "Use this template" 进入工作台。首页和 Create 页都用这个抽屉，不直接跳工作台。
- 卡片上只写：模板名、适合什么（例如 "Menu & delivery apps"）、消耗多少 credits——写 1K 档的数（"From 2 credits"），2K / 3K 的数在工作台选分辨率时才显示。

### 4.3 生成工作台

单列、从上到下一屏滚完，不做分步向导：

1. 上传区：大号按钮区，手机上点击调起相册 / 相机（两个入口："Take photo" 带 `capture`，"Choose from gallery" 不带）；桌面上同一块区域也接受拖拽。显示允许的格式和大小（JPG / PNG / WebP，up to 20MB）。
2. 文案区：只出现模板需要的字段，每个字段带示例占位。
2b. 可选补充输入框：标签 "Anything to change? (optional)"，占位例如 "Add a sprig of mint, remove the napkin"，≤300 字符，可留空。界面不出现 prompt 一词。
3. 比例选择：用图标按钮，标注平台用途（例如 "DoorDash 16:9"）。
3b. 分辨率选择：三张上下排列的选项卡，默认第一张。界面只显示 **Standard / HD / Max**（Owner 2026-11-05 定），每张写一行像素和用途，右侧写消耗：「Standard — 1024 px · Social & delivery apps · 2 credits」「HD — 2048 px · Websites & online stores · 4 credits」「Max — 2880 px · Print & zoom · 6 credits」（credits 数从该模板的 `credits_cost` 读，不写死）。内部代号 `1k` / `2k` / `3k` 只在代码和数据库里用，界面、营销页、FAQ 都不出现 1K / 2K / 3K，也不准用 "4K"、"Ultra HD"、"SD"。余额不够某一档时该档的 credits 变灰，主按钮变成 "Get credits · N needed" 并打开付费墙。
4. 生成按钮：固定在底部拇指区、全宽，写清楚当前分辨率的消耗，例如 "Generate · 2 credits"，切换分辨率时按钮上的数字跟着变。按钮旁显示余额 "30 credits + 3 free"。
5. 这一单将用免费积分时，按钮上方一行告知："This photo uses free credits: it's shown publicly with a watermark. Paid credits make it private and watermark-free." 将用付费积分时不显示。

单位叫法：价格、扣费、余额一律叫 **credits**，不说「张」；余额分开显示付费和免费（"30 credits + 6 free"）。**唯一例外**：新用户赠送对外写成 "3 free Standard images"（= 6 个免费 credit，Owner 2026-11-05），只用于营销页、注册提示和 FAQ 讲赠送的那一句。

### 4.4 生成中、成功、失败

- 上传分三段可见状态：**Compressing → Uploading（进度条）→ Generating**，每段都有文字，不准只转圈。
- 生成中：进度卡显示预计耗时（例如 "Usually 20–40 seconds"）。可以离开页面，回来自动恢复；顶栏显示「Generating…」小标记直到完成，结果也在「我的作品」里。
- 成功：大图全宽预览（按生成比例，不裁切）+ 「Share」+ 「再生成一张」+ 前后对比。**Share 优先走 Web Share API**（`navigator.share({ files })`）：iOS / Android 弹系统分享面板，可存相册、发 WhatsApp / Instagram / X 等已装 app，不需要任何权限；`navigator.canShare` 不支持时（微信等内置浏览器、桌面）按钮改成 "Download" 走 `<a download>`，图下一行小字 "Long-press to save"。实现规则见 `MOBILE_UI_rules_fable.md` §1.8.1。
- 失败：说明原因、告知「额度已退回」、给出 "Retry"（不用重新选图）和「换一张照片」。

### 4.5 付费墙

- 触发：免费额度用完，或免费用户想把作品设为私密。
- 手机上是底部抽屉，桌面是居中弹窗（第 8.4 节）。9 个商品（ARCHITECTURE.md 第 6.2 节）分两步选，**每一屏最多三个选项**，手机一屏放得下，不滚动也能做决定：
  1. **第一屏：选档位**。三张竖排卡片 Starter / Pro / Max，每张写月付价、每月 credits、每 credit 单价（"$19.90 / month · 50 credits · $0.40 per credit"），Pro 高亮为推荐。卡片下方一行次要入口 "Just need a few photos? Credit packs from $9.90 →"。价格数字全部从 `site.config.ts` 读。
  2. **第二屏：选周期**。顶部分段控件 **Monthly / Yearly**（Yearly 段上标 "Save 40%"，折扣数从配置算），下面是所选档位的价格、credits 总数（年付写 "600 credits upfront"）和每 credit 单价；再往下是两组付款方式。从积分包入口进来的第二屏是 S / M / L 三项（"20 credits · $9.90" 并标 "One-time · no subscription"），再往下同样两组付款方式。
- **两组付款方式**：「Card · Apple Pay · Google Pay」和「Alipay · WeChat Pay」。会员商品下，卡那组小字 "Renews automatically, cancel anytime"，钱包那组小字 "One-time payment, 30 days / 1 year, no auto-renew"；积分包在两组下都是单笔，小字只写 "One-time payment"。走 Waffo 时全部单笔，微信不显示。
- `/pricing` 页用同一套信息，桌面三栏并排（Starter / Pro / Max，顶部 Monthly / Yearly 切换），积分包一行三项放在下面；手机上退化成和付费墙一样的竖排。
- 账号页「Subscription」区块：当前档位和周期（"Pro · Yearly"）、状态（Active / Cancels on … / Past due / Free）、下次续费日，一个「Manage subscription」按钮打开 Stripe Customer Portal；钱包用户显示 "Paid until …" 和「Renew」按钮。
- 付款方式图标：卡、支付宝、微信，按当前通道可用的方式显示（走 Waffo 时没有微信）。
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
- 尊重系统「减少动态效果」设置。
- 每个 UI PR 除 375px / 1280px 截图外，再由验收方在 iOS Safari 真机过一遍第 8.7 节的清单。

## 7. 管理后台

- v1 只有模板与提示词编辑一页（ARCHITECTURE.md 第 10 节）。
- 豁免 `impeccable`，只用 shadcn 基础组件，不用 Magic UI。界面用中文。
- 表格优先，默认按时间倒序，支持搜索。
- 危险操作（调积分、下架、封禁）必须二次确认，并要求填写原因。

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
- 顶栏只放：返回或标题、右侧最多一个动作（例如剩余张数）。不放 logo 大图、不放导航链接。
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
