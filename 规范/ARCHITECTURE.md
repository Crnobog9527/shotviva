# Shotviva 架构规范 v3

> 2026-11-04 · v2 按 `AUDIT_fable.md` 和 Owner 当日决定修订
> 2026-11-05 · v3 按 `AUDIT2_fable.md` 和 Owner 当日拍板修订（SKU 结构、积分模型、连接器并入 v1、20MB 上传、移动端应用壳）；细节推导见 `UPLOAD_20MB_fable.md`、`MOBILE_UI_rules_fable.md`、`CONNECTOR_shortest_path_fable.md`
> 上位文件：`seo资料/Shotviva建站规格v2.md`（下称「建站规格」）、`seo资料/公开创作库seo方案.md`（下称「创作库规格」）。本文管代码结构与业务规则，SEO 规则以上位文件为准。

## 0. 目标

1. Shotviva 是 MVP，用来验证有没有人付费。能简单就简单，验证成功后再加固。
2. 代码从第一天起按「建站模板」写：以后开新站（比如只做视频生成的站），只改 `site/`、`.env`、`supabase/seed`，不改核心代码。
3. 图片生成是第一个功能模块，视频生成只留接口，不实现。

## 1. 三层结构

```
src/
  core/        # 所有站共用，不知道「图片」「视频」是什么
    auth/        登录注册、hCaptcha、会话
    billing/     积分钱包、会员期、订单、支付通道（Stripe、Waffo）
    jobs/        生成任务、预扣/确认/退回积分
    storage/     R2 预签名直传、签名 URL、下载路由（含水印，见第 8 节）
    seo/         metadata、JSON-LD、sitemap、robots、llms.txt
    content/     SEO 页面内容的类型定义和通用渲染（见第 12 节）
    admin/       模板管理页
    analytics/   PostHog 埋点、Sentry
    partner/     伙伴接口：Graylum 连接器的鉴权、关联、五个路由（见第 14 节）
  modules/     # 功能模块，可整体开关
    image/       图片生成：provider 适配器、工作台 UI
    video/       视频生成：v1 只放接口类型
  site/        # 每个站各写一份：品牌、定价、页面内容
    site.config.ts
    content/pages/
  app/         # Next.js 路由，只做组装，不写业务逻辑
    (marketing)/ 营销页：首页、SEO 内页、/pricing。普通网页壳：顶部导航 + 正文 + 页脚
    (app)/       登录后应用页：工作台、我的作品、账号。应用壳：固定顶栏 + 底部 tab bar，无页脚（DESIGN.md 第 8 节）
    api/
```

两个 route group 是两个 `layout.tsx`，不是同一个 layout 用媒体查询变形。

`core/moderation`、`core/gallery` 第 6~8 周开创作库时再建，v1 不建空目录。

依赖方向（ESLint 强制，违反即不合格）：

- `app` → `site` / `modules` / `core`
- `modules` → `core`
- `core` 不能 import `modules` 或 `site`，只能通过模块注册表拿到模块
- 模块之间不能互相 import

### 1.1 仓库策略

- Shotviva 仓库本身设成 GitHub Template Repository。开新站时点 Use this template，`site/` 是唯一预期会改的代码目录。
- 不做 monorepo，不做 npm 包。
- 模板化的验收标准：把 `site/` 换成一份示例配置、`modules.image = false`，`pnpm build` 能通过，且 `/generate` 返回 404。不用「打开 video」做验收，video 模块 v1 没有 workspace。

## 2. 站点配置 `site.config.ts`

```ts
export const site = defineSite({
  brand: { name: 'Shotviva', domain: 'shotviva.com', tagline: 'AI food & product photo studio' },
  modules: { image: true, video: false },     // 关掉的模块：路由 404、不进 sitemap、不出现在导航和定价里
  locales: { default: 'en', enabled: ['en'] }, // next-intl，英文不带前缀
  billing: {
    currency: 'usd',
    freeCredits: 3,
    products: [                                   // 结构已定（第 6.2 节），价格数字待定
      { id: 'monthly', credits: 30, paidDays: 30, priceUsd: 0 /* 待定 */ },
      { id: 'yearly', credits: 360, paidDays: 365, priceUsd: 0 /* 待定 */ },
    ],
    channels: { primary: 'stripe', fallback: 'waffo' },   // 第 6.3 节：Waffo 只做单笔兜底
  },
  partners: { graylum: { returnToHosts: ['graylum.com', 'staging.graylum.com'] } },  // 第 14 节
  gallery: { enabled: false },                 // 创作库规格 U9：上线前 8 周不开页面
})
```

规则：

- 品牌名、价格、免费额度、支持语言这些对外数字**只写在 `site.config.ts`**，页面、FAQ、结构化数据都从这里读（建站规格 G3）。
- Stripe 和 Waffo 的价格 ID、产品 ID 放环境变量，不进 `site.config.ts`。
- 数据库只存订单、流水和用户数据，不存价格表。

## 3. 功能模块接口

v1 只定义三个字段，等视频模块真要接时再加：

```ts
export default defineModule({
  id: 'image',                       // 'image' | 'video'
  provider: openaiImageProvider,     // 出图适配器
  workspace: ImageWorkspace,         // 前台工作台组件
})
```

### 3.1 Provider 适配器

```ts
interface GenerationProvider {
  id: string                                       // 'openai-image'
  generate(input: ProviderInput): Promise<ProviderOutput>   // v1 同步调用
  // 视频接入时再加：submit()、getStatus()、parseWebhook()
}
```

### 3.2 v1 范围

- `image` 模块：只实现 GPT-Image-2.5 适配器（OpenAI 官方接口）。底座的 fal / KIE / WaveSpeed / Atlas 适配器不搬。
- `video` 模块：只有接口类型，`site.config.ts` 里是 `false`，不写任何视频页面。

## 4. 生成任务

表 `generation_jobs`（以后视频也用这张表）：

| 字段 | 说明 |
|---|---|
| id | uuid |
| user_id | 用户 |
| module | 'image' / 'video' |
| template_id | 用的模板 |
| inputs | 用户填的内容（文案、比例、输入图在 R2 的 key），**不含封装提示词** |
| provider | 实际调用的厂商 |
| source | 'web' / 'graylum'，哪条入口发起的 |
| idempotency_key | 可空，唯一索引。伙伴接口把调用方的 callId 放这里，重复请求返回同一个任务 |
| status | running → succeeded / failed |
| visibility | 'public' / 'private'，免费用户固定 public，付费用户可改（见第 9 节） |
| credits_cost | 本次扣多少积分 |
| output_key | 成品在 R2 的 key |
| error_code | 失败原因 |
| created_at / finished_at | |

v1 只走同步路径，三步：

1. 请求进来，先 HEAD 校验输入图对象（第 8 节），再**一条 SQL 原子预扣积分**：余额够才扣，不够直接失败。
2. 同一个请求里从 R2 读输入图（1～2MB 的压缩图）调用 GPT-Image-2.5。Vercel 函数最长设为 300 秒。
3. 成功就确认扣费、把成品写进 R2 `outputs/`，**只返回任务状态和 key，不返回图片字节**；失败或超时就自动退回积分。按任务 id 幂等，同一个任务只结算一次。

v1 不写回调解析、定时轮询、超时清理这类定时任务。视频接入时再按同一张表加异步路径。

## 5. 模板

模板分两张表，核心提示词不进仓库、不进公开表：

- `templates`（公开）：id、模块、名称、分类、封面前后对比图、字段定义（要几张图、要填哪些文案、可选比例）、消耗积分、排序、上下架状态、`visible_in`（`['web']` / `['partner']` / 两者，控制在哪些入口展示）。
- `template_prompts`（私有，只有服务端能读，RLS 拒绝所有客户端）：模板 id、提示词正文、版本号、模型参数。

内置一条 `freeform` 模板：字段定义只有 `prompt`（加可选参考图），`template_prompts` 里的提示词是直通。它让「自由文字出图」和「模板出图」走同一条代码路径；`visible_in = ['partner']`，Shotviva 自己的前台不展示（DESIGN.md 禁止出现 prompt）。

仓库里只放模板的字段结构和种子数据格式。种子提示词放在不进 git 的本地文件里，用脚本导入数据库。

v1 上线 6~8 个调好的模板，之后每周加。提示词调到「餐具摆盘不变」是真正的关键路径，比写代码慢。

## 6. 积分与付款

### 6.1 积分模型（Owner 2026-11-05 拍板）

两列解决，不做积分批次、不做过期：

- `profiles.credits`（整数）：余额，**永不过期**。
- `profiles.paid_until`（时间戳，可空）：付费身份窗口。**付费身份 = `paid_until > now()`**，决定私密、无水印、可商用。
- 任何一次成功付款（首付、订阅续费、钱包单笔、Waffo 单笔）都走同一个 SQL 函数 `apply_purchase(user, product_id, event_id)`：`credits += 商品积分`，`paid_until = max(paid_until, now()) + 商品天数`。订阅续费把 Stripe 的 invoice id 当 `event_id`，首付和单笔用 checkout session id，Waffo 用它的事件 id。
- 没用完的张数在续费时自然结转（积分不过期），不做「本期 / 结转」两本账。
- **1 credit = 1 image**，「重新生成」也算一张。前台英文一律说 "image"（"3 free images"、"uses 1 image"），后台和代码叫 credit。
- 余额只能通过 SQL 函数改：发放、预扣、确认、退回、管理员调整。前端和普通接口都不能直接写余额。
- 每一笔变动都写进流水表，带幂等键。
- 每个模板的消耗积分写在模板里，不写死在代码里。

### 6.2 商品（结构已定，价格待定）

**SKU 结构 Owner 2026-11-05 拍板（下午修订，取代上午的「2 个一次性商品」）：2 个会员商品，每个有两种付款形态。**

| id | 积分 | 付费身份 | 卡 / Apple Pay / Google Pay | 支付宝 / 微信 |
|---|---|---|---|---|
| `monthly` | 30（默认，随价格最终定） | +30 天 | Stripe **订阅**，自动续费，每期 +30 | Stripe **单笔**，到期不自动续，再买一次 |
| `yearly` | 360，一次发完 | +365 天 | Stripe **订阅**，每年续费一次 +360 | Stripe **单笔** |

- 同一个商品在 Stripe 里是一个 Product（税码 `txcd_10105001`）挂两个 Price：recurring 和 one-time，价格相同。
- 支付宝 / 微信在 Stripe 普通模式下不支持订阅，所以钱包用户买的是「一期会员」，`paid_until` 到了自己再买。这不是功能缺失，是 Stripe 的限制，付费墙文案要说清楚（"Renews automatically" vs "30 days, no auto-renew"）。
- 价格数字由 pricing-research 定稿后填进 `site.config.ts`，并同步修改建站规格 G3；在此之前 `priceUsd` 留 0，付费墙和 `/pricing` 的数字从配置读。商品 id 固定为 `monthly` / `yearly`，Stripe / Waffo 的商品映射、PostHog `purchase` 事件参数都按这两个 id 写。

已经确定的规则：

- **订阅的状态只有 Stripe 一份真相**，Shotviva 存一张镜像表 `subscriptions`（`user_id`、`stripe_subscription_id`、`product_id`、`status`、`current_period_end`、`cancel_at_period_end`），由回调同步，账号页只读它。
- 续费成功：`invoice.paid`（`billing_reason = subscription_cycle`）→ `apply_purchase`，`paid_until = 本期 period_end`。
- **续费失败：什么都不做。** `paid_until` 到期自然变回免费身份；Stripe 自己重试，哪天扣成功哪天再延。不写宽限期。
- 取消：期末生效（Stripe 默认）。用户在 Stripe Customer Portal（Managed Payments 下是 Link 的客户门户）自己取消，账号页只放一个「Manage subscription」链接，不自己写取消界面。`customer.subscription.updated / deleted` 只更新镜像表。
- 外部退款（Managed Payments 下 Link 客服 60 天内可以不经我们退款）：`charge.refunded` 只写记录 + Sentry 告警，Owner 手动 `admin_adjust_credits`。不写自动扣回。
- 不做：首月优惠券、升级降级、按比例退款、宽限期、测试时钟自动化、到期提醒邮件。
- **分两段上线**：上线当天必须有「订阅模式建结账 + 首付发放」（和单笔几乎相同）；续费、取消同步、Portal 链接在第一个付费用户满 30 天之前上线即可（TASKS T10）。
- 卡、支付宝、微信都能付（第 6.3 节的路由）。
- **水印在下载路由加**：成品只存一份无水印原图；`core/storage` 的下载路由按「`visibility = 'public'` 且当前非付费身份」用 `sharp` 叠右下角「Made with Shotviva」后返回（约 50ms），工作台预览和将来创作库展示同样走这个路由。付费后旧作品自动无水印，不重处理。
- 付费作品默认私密、可商用。付费期内做的作品到期后仍保持私密，不会自动公开。
- 到期提醒邮件 v1 不做；Managed Payments 订阅的续费提醒由 Stripe / Link 自动发。

### 6.3 通道

**Stripe：一个账户，按付款方式路由**（照 Graylum staging `methodRouting.ts` 的做法，Graylum 2026-10-12 沙盒实测两种模式共用一个账户 PASS）：

| 用户选的方式 | Checkout Session 怎么建 | 卖家 |
|---|---|---|
| 卡 / Apple Pay / Google Pay | `mode: 'subscription'`，`managed_payments: { enabled: true }`，不传 `payment_method_types`（MP 不允许） | Stripe（Link）当商户记录方，结账时另加税 |
| 支付宝 | `mode: 'payment'`，`payment_method_types: ['alipay']` | Shotviva |
| 微信 | `mode: 'payment'`，`payment_method_types: ['wechat_pay']`，`payment_method_options.wechat_pay.client = 'web'` | Shotviva |

- 服务端只认用户选的方式，不按 IP 或浏览器语言强制。Managed Payments 的结账页不允许买家国家为中国，所以大陆用户自然选钱包。
- MP 商品必须设税码 `txcd_10105001`（AI 服务，个人用）。MP 价格不含税，税在结账时另加。
- 顾客账单：卡支付显示 `LINK.COM* SHOTVIVA`，钱包支付显示 SHOTVIVA。MP 结账页不支持自定义域名。
- 正式环境的 Managed Payments 要等 Stripe 资格审核。**审核没下来之前的兜底**：卡先不带 `managed_payments` 走普通订阅（Shotviva 当卖家），审核通过后翻开关。
- 要处理的 Stripe 事件：`checkout.session.completed`（首付 / 单笔 → `apply_purchase`，写镜像表）、`invoice.paid`（只认 `subscription_cycle` → `apply_purchase`）、`customer.subscription.updated / deleted`（只更新镜像表）、`charge.refunded`（记录 + 告警）。其余事件忽略。
- Stripe 用与 Graylum 同一主体下**新开的独立账户**，避免两边回调互相收到对方的事件。

**Waffo：保留，只做单笔兜底**（Owner 2026-11-05 确认不砍）：

- 角色是 Stripe 账户本身没通过、或 Stripe 整体不可用时的收款兜底。Waffo 可以加急当天开通。
- Waffo 上只卖 `monthly` / `yearly` 的**单笔**形态（+30 / +365 天），不做 Waffo 订阅；Waffo 不支持微信，付款页只显示卡和支付宝。
- 通过环境变量指定当前用哪条通道：默认 Stripe；切到 Waffo 时付费墙全部方式都走 Waffo 单笔。**不做自动故障切换**，出问题时人工改开关。
- 回调规则和 Stripe 相同：先验签，再按事件 id 去重，最后 `apply_purchase`。

**开发顺序**：先 Stripe（T9 结账 + 首付、T10 续费），再 Waffo 兜底（T13）。做法参照 Graylum **staging 分支**的支付规则，但不复制它的代码：staging 的支付目录约 8900 行，带着首月优惠券、升级、宽限、测试时钟，Shotviva 一项都不要。

## 7. 登录

照 Graylum staging：

- Supabase Auth：邮箱 + 密码注册，点验证邮件完成激活；另加 Google 登录。
- hCaptcha 交给 Supabase Auth 自带的人机验证校验。前端**只做隐形验证**，失败时降级为显式 checkbox；不抄 Graylum 的「隐形 + 弹窗」两套。
- 防刷免费额度：只靠邮箱验证 + hCaptcha。要加 IP 限制就在发放免费额度的 SQL 函数里查 `profiles.signup_ip` 24 小时内是否已发过，一行；不引设备指纹库。
- 验证邮件、重置密码邮件由 Supabase Auth 发，SMTP 配成 Resend，发件地址 `noreply@shotviva.com`。**v1 不写任何发信代码**，只改 Supabase 的邮件模板。
- 管理员身份存在数据库 `profiles.role`，不用环境变量里的邮箱列表。

## 8. 上传、存储与保留期

### 8.1 硬约束

- Vercel 函数请求体和响应体上限都是 4.5MB。**任何 API 路由不得接收或返回图片字节**，只传 R2 key 或签名地址。
- Vercel 上预编译的 `sharp` 不含 HEIF 解码器，**服务端不转 HEIC**。
- GPT-Image 按像素看图，输出最大边 1536；长边 2048 以上的输入对出图零增益。

### 8.2 上传链路（支持 20MB 原图）

```
手机 / 桌面选图（≤20MB；accept="image/jpeg,image/png,image/webp"，不列 heic，不加 capture）
 → 浏览器校验大小和类型
 → 浏览器压缩：长边 2048、JPEG 0.85、重编码顺带丢掉 EXIF（含 GPS）→ 通常 0.5～2MB
     用 createImageBitmap(file, { resizeWidth }) 或 browser-image-compression（Web Worker），不在主线程 canvas 解大图
 → POST /api/uploads → { input_key, put_url }     服务端生成 key，presigned PUT 60 秒有效
 → 浏览器 PUT 直传 R2  inputs/{user_id}/{uuid}.jpg（用 XMLHttpRequest 才有上传进度）
 → POST /api/generate { input_key, template_id, inputs }
     服务端 HEAD 该对象：≤20MB、Content-Type 白名单，不合格删除并返回 422（PUT 签名限不了大小，这步不能省）
```

- **原图不上传、不存。** 20MB 只是文件选择器的上限，20MB 从不离开用户的设备。
- 浏览器压缩失败（老浏览器、低端机）才回退：同一个 presigned PUT 直传原图，服务端 `sharp` 缩到 2048 再送模型；HEIC 解不了就 422 提示换 JPEG。
- iPhone 的 HEIC 靠 iOS Safari 在选相册时自动转成 JPEG（`accept` 里没有 heic 就会转）；Android 三星开 HEIF 的走上面的回退。
- 上传不扣积分，扣积分在 `/api/generate`。
- 上传失败整段重传，不做断点续传；生成是服务端任务，用户切走再回来按 job id 查状态。
- 以后要「高清放大 / 打印」再加 `originals/` 前缀，现在不做。

### 8.3 存储布局

一个**私有桶**，不开公开访问；预览环境和生产用两个桶。用 R2 自带的生命周期规则，**不写定时任务**：

- `inputs/` 前缀：压缩后的输入图，7 天后自动删除。没发起生成的上传对象同样 7 天清掉。
- `outputs/` 前缀：成品，只存一份无水印原图，一律保留，直到用户删除。
- 桶 CORS 必须允许站点域名的 `PUT` 和 `Content-Type` 头。
- 所有读取走 `core/storage` 的下载路由（鉴权 + 第 6.2 节的水印规则）或短期签名 GET；伙伴接口返回的签名地址 7 天有效。

会员到期后保留 90 天、续费恢复、删除前提醒，这些等有付费用户后再做。隐私政策 v1 写「上传的照片保留 7 天，成品保留到你删除为止」。

## 9. 公开创作库

完全遵循创作库规格，另加下面几条（Owner 2026-11-04 确认）：

1. **付费墙与 8 周闸门并存**：从上线第一天起，免费用户生成前就看到「作品将公开展示」的告知，免费用户的作品 `visibility = 'public'`。但前 8 周 `gallery.enabled = false`，不生成任何 /g、/tag、/gallery 页面。付费用户可以随时改成 `private`。
2. **不另建作品表**：创作库规格第 3 节的 `ugc_works` 表不单独建。公开作品就是 `generation_jobs` 里 `status = 'succeeded' AND visibility = 'public'` 的记录。`indexable` 字段不要，作品页永远 noindex。
3. **公开数据不含核心提示词**：只展示模板名和用户自己填的文案。「一键复用」= 同一模板 + 同样参数 + 换成复用者自己的照片。
4. **标签选词看搜索意图**：标签主词必须是图片类或商用意图的词（如 `grilled salmon photo`、`cafe menu photos`），不收菜谱类意图的词。建站规格第 5 节「明确不做的词」不得进入标签白名单。每个标签上线前核实美国搜索量和哥飞版 KD，并检查前十名的页面类型。
5. **审核放到第 6~7 周**：和作品审核后台页一起做，在第 8 周开放创作库之前完成。审核方案到时再定，要指定具体服务，不写「含人脸」这种无法验证的规则。
6. 免费用户可以删除自己的作品（隐私法规要求），但不能设为私密。

## 10. 管理后台

v1 后台只做**两页**：

1. **模板与提示词编辑**。因为 `template_prompts` 客户端读不到，必须有一个服务端页面来改。功能：新建模板、编辑公开信息和私有提示词、上下架、排序。
2. **需求审核**（第 15 节）：待审需求列表（参考图 + 描述 + 用户）、通过 / 拒绝 / 下架、按票数排序、标记 shipped 并关联模板。

其他运营操作 v1 都不做页面：

| 需要 | v1 怎么做 |
|---|---|
| 查用户、看积分流水、看订单、看失败任务 | Supabase 后台直接查表 |
| 手动调积分 | 在 Supabase SQL 编辑器调用 `admin_adjust_credits(user_id, amount, reason)`，函数写流水 |
| 封禁用户 | 调用 `admin_ban_user(user_id, reason)` |
| 退款 | 在 Stripe 或 Waffo 后台操作 |
| 作品审核页 | 第 6~7 周和审核功能一起做 |

后台路由 `noindex`，只允许 `role = admin` 的账号访问。

可参考 Graylum staging 的 `admin/prompts`（提示词增删改、批量上下架）和 `AdminGuard`，只借逻辑，按 AGENTS.md 的拆分规则重写。不引入后台框架或后台模板项目。

## 11. 底座：新建项目 + 拷文件

Owner 2026-11-04 决定：**不在 flux-kontext-template 上原地改造**，新建 Next.js 16 + Tailwind v4 + next-intl + pnpm 项目，把底座里值得留的文件拷进来改。底座约 2.7 万行，能直接用的只有约 2~3 千行，而且它是 Tailwind v3、没有 next-intl、用 npm。拷进来的文件保留原 MIT 许可证声明。

可以拷过来参考或改造的：

| 底座文件 | 用途 |
|---|---|
| `src/lib/services/r2-storage.ts` | R2 上传下载 |
| `StructuredData.tsx`、`src/lib/seo/metadata-generator.ts` | JSON-LD 和 metadata |
| `src/app/sitemap.ts`、`robots.ts`、`llms.txt` | 抓取相关 |
| `src/lib/payment/stripe.ts` | Stripe Checkout 写法参考 |

不拷的（这些功能被重写或不需要）：出图工作台 `FluxKontextGenerator.tsx`（按 DESIGN.md 重写）、出图接口 `api/flux-kontext/route.ts`（被第 4 节取代）、`lib/database.ts`（被 Supabase 客户端 + SQL 函数取代）、13 个语言目录、`api/debug/*`、`/api/v1` 改写规则、NextAuth、Turnstile、Creem、`content-safety`、用户分级、API 文档页、Biome 配置。

## 12. SEO 页面内容格式

建站规格 R10 要求每个 SEO 页有五块内容。为了换站时只改 `site/`，内容统一存成固定结构：

- 一页一个文件：`site/content/pages/<slug>.ts`
- 导出固定结构：`{ slug, keyword, title, description, answerBlock, facts[], costTable, faq[], related[], hero }`
- 用 TypeScript 类型强制五块缺一不可。
- `app/(marketing)/[slug]/page.tsx` 一个通用组件渲染所有内页，第 8 周后的标签页也复用这套结构。
- JSON-LD、sitemap、FAQ 都从同一份结构生成。
- 价格、免费张数这些数字在内容里引用 `site.config.ts`，不手写。

## 13. v1 范围

**代码 v1 = 建站规格第 1 周交付 + `/image-to-image-generator`（R1 要求必须有）+ `/pricing`**。

- 建站规格第 2~4 周的内页是内容任务：用第 12 节的结构填内容，不算新功能。
- **模板库是首页的一块内容，不是首页的全部。** 首页从上到下：
  1. H1 + 直答块（以主词 `image to image ai` 开头，40~60 个英文词，建站规格 G1）
  2. 上传入口 + 首屏前后对比图
  3. 精选模板网格：每个模板的名称和用途说明都写在源码里
  4. 可核验事实块：平台尺寸、免费张数、出图耗时
  5. 成本对比表：请摄影师 vs Shotviva
  6. FAQ 3~5 条
  7. 内链块：直链所有已上线的内页

  首页内容同样按第 12 节的固定结构写，五块缺一不可，模板网格是额外的一块。
- **v1 不建 `/templates`**：上线只有 6~8 个模板，首页已全部展示，另建一页会和首页内容重复、抢同一个词（建站规格 R1）。
- **建 `/templates` 的两个条件，同时满足才建**：① 模板数量达到 20 个以上；② 给它找到一个和首页不撞词、核实过美国搜索量和哥飞版 KD 的独立主词（如 `ai food photo templates` 这一类），并登记进主词表 CSV。建好后首页只放精选模板，`/templates` 放完整模板库和分类筛选；分类页以后按创作库标签页的规则接长尾词。
- 「我的作品」页要有，`noindex`。
- 账号页要有：已连接 Graylum / 断开（第 14 节）、**删除账号**（服务端路由：`auth.admin.deleteUser` + 按 `inputs/{user_id}/`、`outputs/{user_id}/`、`requests/{user_id}/` 前缀清 R2 + `generation_jobs` 级联），`noindex`。
- **Graylum 连接器的 Shotviva 侧随 v1 一起上线**（Owner 2026-11-05 拍板），见第 14 节。
- 应用页用第 1 节的 `(app)` 应用壳，按 DESIGN.md 第 8 节先出手机稿。
- **模板需求墙（Wishlist）随 v1 上线**（Owner 2026-11-05 决定），占应用壳第四个 tab，见第 15 节。

v1 不做：积分引擎抽象层、积分过期和批次、订阅的宽限期 / 自动扣回 / 升级降级 / 优惠券 / 自写取消界面、Waffo 订阅、自动故障切换、自动退款、保留期定时任务、提醒邮件、内容审核、作品审核页、除模板页和需求审核页外的后台页、多语言内容、海报排版功能、视频生成实现、服务端 HEIC 转码、原图存储、断点续传、PWA / 离线、需求墙的评论 / 通知 / 重复合并 / 分类筛选。

## 14. 伙伴接口（Graylum 连接器）

Owner 2026-11-05 决定：Graylum 里能用 Shotviva 的模板出图，也能自由文字出图；额度归 Shotviva；用完跳去 Shotviva 充值。Shotviva 侧随 MVP 一起做，约 3.5 天。推导过程和 Graylum 侧的做法见 `CONNECTOR_shortest_path_fable.md`，本节只写 Shotviva 要做的。

### 14.1 不做什么

不做 OAuth 服务器、MCP 服务、OpenAPI、webhook、取消任务、沙盒、双语文案、按客户端限流、独立审核管线。Graylum 自己 mock 测试。

### 14.2 关联：一次性 code + 伙伴密钥

```
Graylum「连接 Shotviva」──302──▶ shotviva.com/connect/graylum?state=<Graylum 生成的随机值>
  未登录先走 Shotviva 自己的登录/注册；登录后显示一个按钮「允许 Graylum 用你的额度出图」
  点击 → 生成 10 分钟有效的一次性 code ──302──▶ graylum.com/api/connectors/shotviva/callback?code=…&state=<原值>
Graylum 服务器 ──POST /api/partner/link { code }（Authorization: Bearer <伙伴密钥>）──▶ Shotviva
                ◀── { account_id, display_name, credits_remaining }
```

- 回跳地址只允许 `site.config.ts` `partners.graylum.returnToHosts` 里的域名。
- Shotviva 不存任何 Graylum 令牌；Graylum 只存 `account_id`。
- 表 `partner_links`：`user_id`、`partner`（'graylum'）、`link_code`、`code_expires_at`、`linked_at`、`revoked_at`。RLS：用户只读自己的。账号页「断开」= 写 `revoked_at`。

### 14.3 鉴权

`/api/partner/*` **不走用户会话**：校验 `Authorization: Bearer <伙伴密钥>`（环境变量，预览和生产各一把，预览密钥在生产无效）+ `X-Shotviva-Account: <account_id>`，查 `partner_links` 未撤销后以该用户身份执行。这是 AGENTS.md 第 6 节「所有接口默认需要登录」的唯一例外。

### 14.4 五个路由（`core/partner/`）

| 路由 | 说明 |
|---|---|
| `POST /api/partner/link` | code 换 `{ account_id, display_name, credits_remaining }`，code 用过即废 |
| `GET /api/partner/account` | `{ credits_remaining, paid_until, top_up_url }` |
| `GET /api/partner/templates` | `templates` 里 `visible_in` 含 `partner` 的公开字段，含 `freeform` |
| `POST /api/partner/generate` | **同步**。入参 `template_id`、`inputs`、可选 `image`（URL）；头 `Idempotency-Key`（Graylum 传 callId，落 `generation_jobs.idempotency_key`）。走第 4 节同一条预扣/确认/退回路径，`source = 'graylum'`。出参 `{ job_id, image_url（签名 7 天）, credits_charged, credits_remaining }` |
| `GET /api/partner/jobs/{id}` | 状态 + 成功时的签名地址，给 Graylum 超时兜底用，只读 |

错误码：`quota_exhausted`（402，带 `top_up_url`）、`link_revoked`（401）、`invalid_input`（422）、`content_rejected`（422，OpenAI 自己的安全拒绝，不扣费）、`generation_failed`（500，已退回）。

### 14.5 充值回跳

`/pricing?from=graylum&return_to=…`：付款成功页按 `returnToHosts` 白名单回跳，带 utm。

### 14.6 契约

`core/partner/partner-types.ts`（zod schema + 推导类型）就是契约，拷给 Graylum；不写 OpenAPI。

## 15. 模板需求墙（Wishlist）

Owner 2026-11-05 决定。目的只有一个：**让用户告诉我们要什么模板、让其他用户替我们投票，Owner 在后台按票数排序后自己判断先做哪个。** 它不是 SEO 内容，不做算法推荐，不做社区。Owner 认为及时满足用户提出的模板需求是复购最大的粘性来源，所以进 v1、占一个 tab。

### 15.1 用户侧

- 位置：`(app)` 壳第四个 tab **Wishlist**（DESIGN.md 第 8.2 节），`noindex`，只有登录用户可见。
- **门槛**：至少成功出过 1 张图（`generation_jobs` 有 `succeeded`）的账号才能发帖和投票。未达门槛的账号能看墙，按钮灰掉并提示先出一张图。
- 发帖：自然语言描述（≤300 字）+ 参考图 1～3 张。不选分类、不写标题、不出现 prompt 一词。参考图复用第 8.2 节的上传链路（浏览器压缩 + 直传），存 R2 `requests/{user_id}/{uuid}.jpg`，不设过期；被拒或下架时服务端删除。
- 状态机：`pending`（提交后，只有本人可见「审核中」）→ `live`（Owner 通过，上墙）→ `shipped`（模板做出来了，关联 `template_id`）；或 → `rejected`（本人在「My requests」里看到，不显示原因）；`live` 可被 Owner 下架回 `rejected`。
- 墙：卡片 = 参考图 + 描述 + 脱敏用户名（显示名首字 + `***`）+ 「I want this too」按钮和计数。默认按票数倒序，其次按时间。一个账号一票，再点取消。`shipped` 的卡片置顶显示「Shipped →」直接跳到该模板。
- 「My requests」：本人的全部需求和状态。
- 空状态：一句「Tell us what template you need」+ 发帖按钮。墙空着没关系，不做冷启动数据。

### 15.2 后台

第 10 节的第二页。拦的东西：垃圾、无关内容、差评、色情、版权有问题的参考图。Owner 每天看一次，所以**审批前置**是有意的，不做「先上墙再下架」。不做重复合并：同是「外卖菜单海报」可能是十种风格，Owner 人工判断。

### 15.3 数据

- `template_requests`：`id`、`user_id`、`description`、`image_keys text[]`、`status`（pending / live / rejected / shipped）、`template_id`（可空）、`votes_count`、`created_at`、`reviewed_at`。
- `template_request_votes`：`request_id`、`user_id`，联合唯一。
- RLS：`live` / `shipped` 对所有登录用户可读；`pending` / `rejected` 只有本人和 admin；写只经服务端。
- 投票用一个 SQL 函数：存在即删除并 `votes_count - 1`，不存在即插入并 `+ 1`，函数内检查门槛。
- 发帖的服务端路由同样检查门槛，并按账号限频（复用现有限频）。

### 15.4 不做

评论、任何通知或发信、重复合并、分类和筛选、公开（未登录）页面、SEO、点赞以外的任何互动、拒绝原因。

### 15.5 条款

服务条款加一句：上传的参考图由上传者负责，我们可以不经说明下架。隐私政策写明：需求参考图保留到需求被拒、下架或账号删除为止；墙上只显示脱敏用户名。
