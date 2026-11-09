# 手机端：上传链路确认 + 移动 UI 规则（Fable，2026-11-05）

> Owner 两个问题：①手机端上传附件是否也走 `UPLOAD_20MB_fable.md` 的架构；②手机端 UI 要提前定规则，按「网页端 app 界面」设计，不是 PC 比例适配。本文是给总控窗口并入 DESIGN.md / ARCHITECTURE.md 的建议稿。

## 0. 手机端上传：支持，而且这套链路就是为手机设计的

`UPLOAD_20MB_fable.md` 的每一步都在手机浏览器里成立，没有任何一步依赖桌面能力：

| 步骤 | 手机上怎么发生 | 要注意的点 |
|---|---|---|
| 选图 | `<input type="file" accept="image/jpeg,image/png,image/webp">`。iOS 弹出「拍照 / 照片图库 / 浏览」，Android 弹出相机 / 相册 / 文件 | **不要加 `capture` 属性**，加了只能拍照不能选相册。要给「拍照」单独入口时，做两个按钮：「Take photo」带 `capture="environment"`，「Choose from gallery」不带 |
| HEIC | iOS Safari 看到 `accept` 里没有 heic，交给页面的就是 JPEG | Android 三星开 HEIF 的走回退 → 422 提示换 JPEG（已在上传方案 §6） |
| 压缩 | 在手机浏览器里跑，48MP 约 1～3 秒 | 用 `createImageBitmap(file, { resizeWidth })` 或 `browser-image-compression`（Web Worker），**不要在主线程 canvas 上解大图**，否则低端机卡死、iOS 可能直接刷新页面 |
| 直传 R2 | 手机浏览器发 PUT，2MB 在 4G 上 1～5 秒 | 用 `XMLHttpRequest` 而不是 `fetch`，因为 fetch 拿不到上传进度；进度条要显示 |
| 切出去又回来 | iOS Safari 切后台几十秒会杀掉页面的网络请求 | 上传只有 2MB，失败整段重传即可，不做断点续传；生成是服务端任务，回来按 job_id 查状态（DESIGN §4.4 已允许离开），监听 `visibilitychange` 回来就重新轮询 |
| 内置浏览器 | 微信、Instagram、TikTok 内置浏览器都支持图片 `<input type="file">` | 不要依赖 `navigator.share` 一定存在；不支持就回退普通下载 |

**结论：手机端走同一套，不需要第二套上传链路。** 唯一要改的是 DESIGN §4.3 把「大号拖拽框」改成「大号按钮」——手机上没有拖拽这回事。

v1 不做的：从相册「分享到 Shotviva」（要 PWA Web Share Target）、一次传多张、断点续传、离线。

## 1. 移动 UI 规则（建议写进 DESIGN.md）

DESIGN.md §1.4 现在只有一句「先按 375px 宽设计，再适配桌面」，这句不够硬，执行时很容易变成「桌面稿缩小」。下面的规则把它钉死。

### 1.1 设计顺序（硬规则）

1. `impeccable` 做设计方向时，三个关键屏（首页、工作台、付费墙）**先出 375px 手机稿，Owner 评审的就是手机稿**；桌面稿是手机稿的放宽，之后再出，不单独评审。
2. 任何页面 PR 的截图，手机截图在前，桌面在后；没有手机截图的 UI PR 不合并。
3. 发现某个交互在手机上做不了（hover、拖拽、右键、多列对比），以手机的做法为准改掉，不允许「手机上降级」。

### 1.2 两类页面，两套壳

| 类型 | 页面 | 壳 |
|---|---|---|
| **营销页**（走 SEO） | 首页、`/image-to-image-generator`、`/pricing`、模板页、博客 | 普通网页：顶部简洁导航 + 可滚动正文 + 页脚。按建站规格的 SEO 结构来，首屏有上传入口 |
| **应用页**（登录后） | 工作台、我的作品、账号、付费墙 | **app 壳**：固定顶栏 + 固定底部栏，内容区独立滚动，**没有页脚、没有营销导航、没有 SEO 正文** |

营销页点「Upload photo」进入应用壳，从此到出图完成不再看到营销元素。两套壳是两个 Next.js layout（`app/(marketing)` 和 `app/(app)`），不是同一个 layout 用媒体查询变形。

### 1.3 应用壳的结构

- **底部 tab bar**，固定三项：Create（模板选择）/ Photos（我的作品）/ Account。图标 + 文字，高 56px + 底部安全区。不做汉堡菜单，不做侧边抽屉。
- **推入的流程页隐藏 tab bar**：从 Create 选了模板后进入工作台，工作台是全屏流程页——顶栏左侧「返回」，底部换成**固定主操作栏**（"Generate · uses 1 credit"），和原生 app 从 tab 根页面推入详情页一样。生成中、结果页同样是流程页。
- 顶栏只放：返回或标题、右侧最多一个动作（例如剩余额度）。不放 logo 大图、不放导航链接。
- 主操作永远在底部拇指区，永远全宽、高 48～56px，永远只有一个。

### 1.4 触控规则

- 可点区域 ≥ 44×44px（已有），页面左右边距 16px，卡片间距 12～16px。
- **禁止 hover-only 交互**。模板卡片「悬停显示前图」（DESIGN §4.2）改为：卡片上一个「Before / After」小切换，或点击进入模板详情看对比滑块。
- 对比滑块单指拖动（已有），并且要能用点击任意位置跳到该处，不只靠拖。
- 不准出现横向滚动的整页；横向滚动只允许在明确的卡片轨道里（模板横向列表），且右侧露出半张卡提示可滑。
- 长按不承担任何功能（iOS 长按图片会弹系统菜单，和自定义冲突）。

### 1.5 视口与安全区

- `<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">`。
- 固定顶栏 / 底栏用 `env(safe-area-inset-top / bottom)` 补边距；全屏高度用 `100dvh`，**禁用 `100vh`**（iOS 地址栏会把底栏顶出屏幕）。
- 键盘弹出时底部操作栏不能挡住正在输入的字段：文案字段获得焦点时 `scrollIntoView`，底部栏在键盘弹出期间可以隐藏。

### 1.6 弹层

- **手机上所有弹窗一律用底部抽屉（bottom sheet）**，用 shadcn 的 `Drawer`（基于 vaul），可下拉关闭：付费墙、比例选择、模板预览、确认删除。
- 桌面才用居中 `Dialog`。用 shadcn 的「Responsive Dialog」模式：同一个组件，`md` 以下渲染 Drawer，以上渲染 Dialog。
- 禁止浏览器原生 `alert / confirm / prompt`。
- Toast 从顶部出，不盖底部操作栏。

### 1.7 输入与表单

- 输入框字号 16px（已有，防 iOS 自动缩放）。
- 文案字段加 `enterkeyhint="done"`、`autocapitalize="sentences"`；数字类字段加 `inputmode="numeric"`。
- 每个字段的示例写在占位符里（已有），错误紧跟字段下方（已有）。
- 工作台在手机上是**单列、从上到下一屏滚完**：上传 → 文案 → 比例 → 底部固定 Generate。不做分步向导，不做左右分栏。

### 1.8 图片与下载

- 结果图全宽展示，宽高比按生成比例，不裁切。
- iPhone 在结果页、作品详情页优先提供「存入相册」，主按钮直接调起系统面板。用户选「存储图像」后，到「照片」中查看。显式「下载到文件」入口保存到浏览器下载目录。
- 无法分享图片文件时，提供可操作的保存原图方式并说明操作。桌面和 Android 继续使用各自的下载与分享入口。

#### 1.8.1 分享面板能做到什么（Owner 2026-11-05 问）

**能做到：一个「Share」按钮弹出系统分享面板，里面列出用户手机上已装的 WhatsApp、Instagram、Facebook、X、Messages、Telegram、存相册等，用户点哪个就把图发到哪个。不需要向用户申请任何网站权限，也不需要在应用商店上架。**

原理：`navigator.share({ files: [jpegFile], title, text, url })`。这是浏览器把文件交给操作系统的分享系统（iOS 的 share sheet、Android 的 share intent），操作系统再列出能接收图片的已装 app。网站只能"交出去"，看不到用户装了什么、也不知道用户选了谁。

| 平台 | 支持 | 说明 |
|---|---|---|
| iOS Safari 14+ | 支持 | 面板由 iOS 画，列出所有能收图片的 app。WhatsApp 收图会丢掉 `text`，只带图 |
| Android Chrome 75+ | 支持 | 同上；Instagram 收到图后进发帖 / Story 编辑器 |
| 微信内置浏览器（iOS/Android） | **不支持** `navigator.share` | 回退：下载按钮 + 「长按保存」，用户存相册后自己发 |
| Instagram / Facebook / TikTok 内置浏览器 | 多数不支持 | 同上回退 |
| 桌面 Chrome / Safari | 支持但意义不大 | 回退 `<a download>` 即可 |

权限方面的事实：

- Web Share API **没有权限弹窗**，唯一要求是在用户点击的回调里调用（transient activation），且站点是 HTTPS。
- 唯一可能出现的系统提示：iOS 用户第一次从 Safari 「存储图像」时，iOS 会问一次「Safari 想要添加到照片」。这是 iOS 对 Safari 这个 app 的权限，所有网站都一样，一台手机只问一次，网站无法绕开也无需处理。Android 存到 Downloads 无提示。
- 不要做「分享到 WhatsApp / Instagram」的单独按钮：`whatsapp://send?text=` 这类深链**不能带图片文件**，只能带文字；把图发进这些 app 的唯一网页途径就是系统分享面板，而它正好不需要权限。

实现规则：

1. 结果页加载时先把结果图 `fetch` 成 `File`（`image/jpeg`）放在内存里；点击时同步调用 `navigator.share`。iOS 对「点击后再去 fetch 再 share」会判定失去用户激活而拒绝。
2. 先 `navigator.canShare({ files })` 判断，不支持就显示「Download」而不是「Share」，按钮文案跟着变。
3. iPhone「存入相册」只传图片文件，让系统呈现「存储图像」。网页无法指定分享目标或得知最终保存结果。关闭面板后允许重试，不显示「已存入相册」。其他平台的通用分享在 `text` 里放一句短文案 + 带 utm 的站点链接，能带的 app（X、Telegram、Messages）会带上，不能带的（WhatsApp、Instagram）自动丢弃，不用分 app 处理。
4. 一张图一个 `File`，类型 `image/jpeg`；不要传 PNG 大文件，部分 app 对 >10MB 的分享会静默失败。

### 1.9 状态反馈

- 上传分三段可见状态：**Compressing → Uploading（进度条）→ Generating（一般 60 秒左右，见 DESIGN「生成中」）**，每段都有文字，不准只转圈。
- 生成中允许切走，回来自动恢复；顶栏显示「Generating…」小标记直到完成。
- 网络失败给「Retry」按钮，不要让用户重新选图。

### 1.10 桌面是手机布局的放宽，不是另一套

- 应用页桌面版：内容区 `max-width` 720px 居中；底部 tab bar 变成顶栏右侧三个链接；底部主操作栏变成内容区末尾的大按钮（仍然全宽、仍然只有一个）；Drawer 变 Dialog。
- 工作台在 ≥1024px 可以变两列（左表单、右预览），这是**唯一**允许的桌面专属布局。
- 不允许桌面版多出手机版没有的功能或入口。

### 1.11 禁止清单

PC 栅格缩小、hover-only、整页横向滚动、固定像素宽度、`100vh`、小于 16px 的输入框、原生 alert、汉堡菜单、侧边栏、面包屑、同一页面超过一个主按钮。

### 1.12 v1 不做

PWA / 离线、安装到桌面提示、推送通知、Web Share Target、原生 app、手势返回动画。

## 2. 验收

- 每个 UI PR：375px 和 1280px 截图（已有），**加一张 iOS Safari 真机截图**，由 Codex 在 Validation handoff 里完成。
- 真机检查清单：底部栏不被地址栏顶出、键盘弹出时字段可见、选图能调相册、压缩和上传有进度、切后台再回来生成结果能恢复、Share 能存到相册。
- Lighthouse 移动端：LCP < 2.5s、CLS < 0.1、INP < 200ms（已有）。

## 3. 对现有规范的改动（给总控窗口）

1. DESIGN §1.4 替换为本文 §1.1 三条。
2. DESIGN §4.2 「悬停显示前图」改为 §1.4 的切换方式。
3. DESIGN §4.3 「大号拖拽框」改为「大号按钮，手机调相册 / 相机」，并加 §1.9 三段状态。
4. DESIGN 新增 §8「应用壳」= 本文 §1.2～§1.3、§1.5～§1.6。
5. ARCHITECTURE 布局层加：`app/(marketing)` 与 `app/(app)` 两个 route group、两个 layout。
6. LAUNCH 加本文 §2 真机检查清单。
