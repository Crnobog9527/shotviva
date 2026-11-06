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
- 模板化的验收标准：把 `site/` 换成一份示例配置、`modules.image = false`、`features.wishlist = false`，`pnpm build` 能通过，且 `/generate`、`/wishlist` 都返回 404、tab bar 只剩三项。不用「打开 video」做验收，video 模块 v1 没有 workspace。

## 2. 站点配置 `site.config.ts`

```ts
export const site = defineSite({
  brand: { name: 'Shotviva', domain: 'shotviva.com', tagline: 'AI photo studio' },   // 建站规格 §1（Owner 2026-11-05 定）
  modules: { image: true, video: false },     // 关掉的模块：路由 404、不进 sitemap、不出现在导航和定价里
  locales: { default: 'en', enabled: ['en', 'zh'] }, // next-intl：英文不带前缀，简体中文 /zh（Owner 2026-11-06，见第 17 节）
  billing: {
    currency: 'usd',
    freeCredits: 6,                               // 进 profiles.free_credits，只能生成免费作品（第 6.1 节）；= 3 张 Standard 档标准模板图，对外说 "3 free Standard images"（Owner 2026-11-05）
    products: [                                   // 9 个商品，价格 Owner 2026-11-05 定稿（第 6.2 节）
      { id: 'starter_monthly', tier: 'starter', interval: 'month', credits: 50,   paidDays: 30,   priceUsd: 19.9 },
      { id: 'starter_yearly',  tier: 'starter', interval: 'year',  credits: 600,  paidDays: 365,  priceUsd: 191 },
      { id: 'pro_monthly',     tier: 'pro',     interval: 'month', credits: 135,  paidDays: 30,   priceUsd: 49.9 },
      { id: 'pro_yearly',      tier: 'pro',     interval: 'year',  credits: 1620, paidDays: 365,  priceUsd: 479 },
      { id: 'max_monthly',     tier: 'max',     interval: 'month', credits: 280,  paidDays: 30,   priceUsd: 99 },
      { id: 'max_yearly',      tier: 'max',     interval: 'year',  credits: 3360, paidDays: 365,  priceUsd: 713 },
      { id: 'pack_s', tier: 'pack', interval: null, credits: 20,  paidDays: null, priceUsd: 9.9 },   // 积分包：不改会员期，所有人可买
      { id: 'pack_m', tier: 'pack', interval: null, credits: 55,  paidDays: null, priceUsd: 24.9 },
      { id: 'pack_l', tier: 'pack', interval: null, credits: 115, paidDays: null, priceUsd: 49.9 },
    ],
    channels: { primary: 'stripe', fallback: 'waffo' },   // 第 6.3 节：Waffo 只做单笔兜底
  },
  partners: { graylum: { returnToHosts: ['graylum.com', 'staging.graylum.com'] } },  // 第 14 节
  gallery: { enabled: false },                 // 创作库规格 U9：上线前 8 周不开页面
  features: { wishlist: true },                // 第 15.6 节：关掉 = tab 不显示、路由 404、后台页隐藏
})
```

规则：

- 品牌名、价格、免费额度、支持语言这些对外数字**只写在 `site.config.ts`**，页面、FAQ、结构化数据都从这里读（建站规格 G3）。
- Stripe 的 Price 不进代码也不进 `site.config.ts`：按第 6.2 节的 `lookup_key` 约定在 Stripe 后台建好，服务端用 lookup key 取。Waffo 的商品 ID 映射放环境变量。
- 分辨率档（1K / 2K / 3K）的像素定义和每档每模板的 credit 数不在这里：前者是 `modules/image` 的常量，后者在数据库 `templates.credits_cost`（第 5 节）。
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

- `image` 模块：只实现 OpenAI Images 接口形态的适配器（`/v1/images/edits`、`/v1/images/generations`；官方地址或兼容这套接口的中转地址都能用）。**用哪个供应商、哪个模型，从 T17 起在后台配置**（第 3.3 节）；环境变量 `OPENAI_API_KEY` / `OPENAI_IMAGE_MODEL` 只在后台没有启用任何供应商时兜底。环境变量的说明（原文）：`OPENAI_IMAGE_MODEL`，默认值由 Owner 定（代码里当前默认 `gpt-image-2.5-sunburst`；GPT Image 2.6 已于 2026-11-04 上线、同价、更快；Owner 2026-11-05 评估 2.6 对人物五官的保持很强，默认用哪个仍由 Owner 在环境变量里定）。底座的 fal / KIE / WaveSpeed / Atlas 适配器不搬。
- `video` 模块：只有接口类型，`site.config.ts` 里是 `false`，不写任何视频页面。

### 3.3 出图供应商配置（后台，Owner 要求：随时换供应商和模型，不改代码、不重新部署）

**表 `ai_providers`**（私有：开 RLS、拒绝所有客户端，只有服务端 service role 读写，和 `template_prompts` 一样）：

| 字段 | 说明 |
|---|---|
| `id` | uuid |
| `module` | `'image'`（以后视频再加） |
| `adapter` | 用哪个代码适配器：v1 只有 `'openai_images'`。接一个接口形态不同的厂商（如 Gemini、Seedream）要写新适配器，是代码任务，不是后台操作 |
| `label` | 后台显示名，如「OpenAI 官方」「某中转」 |
| `base_url` | 接口根地址，默认 `https://api.openai.com/v1`；只允许 `https://`，拒绝 localhost、内网和保留地址 |
| `model` | 模型名，如 `gpt-image-2.6` |
| `vault_secret_id` | 密钥存在 **Supabase Vault**（`vault.secrets`，由 Supabase 在库内加密），表里只存它的 id。Owner 2026-11-06 改定，和 Graylum 一样；取代原先「应用用 `PROVIDER_SECRETS_KEY` 做 AES-256-GCM」的做法，不再需要任何应用侧加密密钥 |
| `api_key_last4` | 密钥后 4 位，后台列表里显示用 |
| `is_active` | 当前在用；同一个 `module` 最多一条为 `true`（部分唯一索引） |
| `notes` | 备注 |
| `created_at` / `updated_at` / `updated_by` | 审计 |

切换在用的供应商用 SQL 函数 `admin_activate_provider(p_id)`：同一事务里把同模块其他行设为 `false`、这一行设为 `true`。

**出图时怎么选**：`core` 按模块取 `is_active` 那一行（服务端缓存，打 `providers` 标签，后台改动后立即失效），解密密钥，交给模块注册的适配器生成。后台没有启用的供应商时，用环境变量兜底。伙伴接口走同一条路径。`generation_jobs.provider` 写 `<供应商 id 或 env>/<模型名>`，以后按模型算成本用。从 T17 起，模板 `model_params` 里的 `model` 不再生效，模型只由在用的供应商决定，防止换供应商后个别模板还在调旧模型；`background` 等其他参数照旧。

**后台页 `/admin/providers`**（中文界面）：
- 列表：显示名、适配器、地址、模型、密钥后 4 位、是否在用、更新时间。
- 新增 / 编辑：密钥框只写不读，留空表示不改；保存后浏览器拿不到明文。
- 「测试连接」：用该行的地址和密钥请求 `GET {base_url}/models`，只看能否通过鉴权，不出图、不花钱。
- 「设为当前使用」：弹窗确认「从 A 换到 B」，写一条日志（logger，不含密钥）。
- 页面写明提醒：积分下限表（第 6.1 节）是按 GPT-Image high 质量的成本定的；换成更贵的模型前，先请总控更新下限。

**密钥读写函数**（全部 `security definer`，只授权 `service_role`）：
- `admin_set_provider_key(p_id, p_key)`：校验格式（可打印 ASCII、不含空白、16～1024 字符）。已有 Vault 记录就 `vault.update_secret`，没有就 `vault.create_secret`（名字 `shotviva.provider.<id>`）。同时写 `api_key_last4`。
- `provider_api_key(p_id)`：从 `vault.decrypted_secrets` 读出明文，只在服务端出图和「测试连接」时调用，不缓存明文。
- 删除供应商时，同一事务里删掉对应的 Vault 记录。

**安全**：
- 密钥不进日志、Sentry、PostHog，也不返回给浏览器。
- 浏览器和 Data API 碰不到 `vault` schema。
- 服务端缓存在用的供应商时，只缓存行（含 `vault_secret_id`），不缓存明文。

## 4. 生成任务

表 `generation_jobs`（以后视频也用这张表）：

| 字段 | 说明 |
|---|---|
| id | uuid |
| user_id | 用户 |
| module | 'image' / 'video' |
| template_id | 用的模板 |
| inputs | 用户填的内容（文案、比例、**分辨率 `resolution`：`'1k'` / `'2k'` / `'3k'`**、可选补充说明 `note`（≤300 字符，工作台「Anything to change?」，服务端拼在模板提示词之后，作为用户内容存档）、输入图在 R2 的 key），**不含封装提示词**。伙伴接口（第 14 节）v1 固定 `'1k'`，契约不加字段 |
| provider | 实际调用的供应商和模型：`<ai_providers.id 或 env>/<模型名>`（第 3.3 节） |
| source | 'web' / 'graylum'，哪条入口发起的 |
| idempotency_key | 可空，唯一索引。伙伴接口把调用方的 callId 放这里，重复请求返回同一个任务 |
| status | running → succeeded / failed |
| credit_pool | 'free' / 'paid'，本单从哪个池扣的（第 6.1 节）。决定水印、默认可见性、可商用 |
| visibility | 'public' / 'private'，free 作品固定 public，paid 作品默认 private、本人可改（见第 9 节） |
| credits_cost | 本次扣多少积分 = `templates.credits_cost[resolution]`，由 `reserve_credits` 在数据库里按模板和分辨率取，不信任调用方传入的数 |
| output_key | 成品在 R2 的 key |
| error_code | 失败原因 |
| created_at / finished_at | |

v1 只走同步路径，三步：

1. 请求进来，先校验 `resolution` 合法、HEAD 校验输入图对象（第 8 节），再**一条 SQL 原子预扣积分**：`reserve_credits(job_id, resolution)` 按模板在该分辨率的配置扣，余额够才扣，不够直接失败。
2. 同一个请求里从 R2 读输入图（1～2MB 的压缩图）调用 OpenAI GPT-Image（模型按 `OPENAI_IMAGE_MODEL`，`quality` 按模板的质量档，`size` 按分辨率档 × 比例，见第 8.1 节）。Vercel 函数最长设为 300 秒。
3. 成功就确认扣费、把成品写进 R2 `outputs/`，**只返回任务状态和 key，不返回图片字节**；失败或超时就自动退回积分。按任务 id 幂等，同一个任务只结算一次。

v1 不写回调解析、定时轮询、超时清理这类定时任务。视频接入时再按同一张表加异步路径。

## 5. 模板

模板分两张表，核心提示词不进仓库、不进公开表：

- `templates`（公开）：id、模块、名称、分类、封面前后对比图、字段定义（要几张图、要填哪些文案、可选比例）、**质量档 `quality`**（`'high'` / `'medium'`，送给模型的 `quality` 参数，默认 `'high'`）、**消耗积分 `credits_cost`**（jsonb，按分辨率三个档都必填：`{ "1k": 2, "2k": 4, "3k": 6 }`，正整数）、排序、上下架状态、`visible_in`（`['web']` / `['partner']` / 两者，控制在哪些入口展示）、**展示文字的其他语言版本 `translations`**（jsonb，默认 `{}`；结构 `{ "zh": { "name": "…", "description": "…", "fields": { "<字段 key>": { "label": "…", "placeholder": "…" } } } }`；英文仍是 `name` 等原字段；某语言缺某项时回退英文；后台模板编辑页可填中文；提示词不翻译，始终英文，Owner 2026-11-06）。
- `template_prompts`（私有，只有服务端能读，RLS 拒绝所有客户端）：模板 id、提示词正文、版本号、模型参数。

内置一条 `freeform` 模板：字段定义只有 `prompt`（加可选参考图），`template_prompts` 里的提示词是直通。它让「自由文字出图」和「模板出图」走同一条代码路径；`visible_in = ['partner']`，Shotviva 自己的前台不展示（DESIGN.md 禁止出现 prompt）。

仓库里只放模板的字段结构和种子数据格式。种子提示词放在不进 git 的本地文件里，用脚本导入数据库。

v1 第一批模板（Owner 2026-11-05 定，6 个分类、10 个模板；模板是数据，以后在后台随时加，不改代码）：

| 分类 | 模板 | 用途 |
|---|---|---|
| Food & Drink | Delivery Menu、Dark Dining、Promo Poster | 外卖平台菜单图、社媒氛围图、单张促销海报（一张图 + 一句标题 + 一个价格） |
| Products & Resale | Pure White、Lifestyle Table | 电商 / 二手平台主图、社媒生活场景图 |
| Beauty & Skincare | Spa Podium | 护肤美妆品牌展台图 |
| Rooms & Spaces | Bright Listing、Evening Glow | 出租房源图（提亮、不改结构）、傍晚暖光 |
| Pets | Pet Studio | 宠物写真 |
| Art Styles | Korean Manhwa | 照片转精致韩漫画风，构图和主体不变 |

- 每个模板消耗多少 credit 按「质量档 × 用户选的分辨率」定，写在 `templates.credits_cost`，后台可改，不低于第 6.1 节的下限。默认值：

| 模板质量档 | 1K | 2K | 3K |
|---|---|---|---|
| `high`（默认） | 2 | 4 | 6 |
| `medium`（效果够用的模板，需逐个实测后才能降档） | 1 | 2 | 3 |

- 分辨率由用户在工作台选，模板不限制档位；三个档位的像素定义见第 8.1 节。`freeform` 模板同样三档都配（默认同 `high`）。
- **画风模板的版权规则**：模板名、说明、提示词里只能用通用风格描述（如 "Korean manhwa style"），不准出现具体作品、作者、角色、工作室或品牌的名字；示例图不能模仿可辨认的作品。
- **海报类只做单张、短文字**：标题和价格由用户在工作台的文案字段里填。多行菜单、价格单这类需要逐行排版的物料不交给 AI 画字，放到物料期用代码排版做。
- 模板质量由 Owner 调提示词时把关，不设统一的实测门槛（Owner 2026-11-05）。

## 6. 积分与付款

### 6.1 积分模型（Owner 2026-11-05 拍板；傍晚修订为「按作品判付费」）

**权益跟着作品走，不跟着用户身份走**：一张图是用付费积分还是免费积分生成的，决定它是否带水印、是否私密、是否可商用。会员期 `paid_until` 不再决定任何权益。

- `profiles.free_credits`（整数）：注册赠送（`site.config.billing.freeCredits`），以后的活动赠送也进这里。只能生成**免费作品**。
- `profiles.credits`（整数）：**付费积分**，来自订阅首付 / 续费、钱包一期会员、积分包、管理员补偿。**永不过期**。生成的是**付费作品**。
- `profiles.paid_until`（时间戳，可空）：只记录会员期，用于账号页显示（订阅状态、钱包一期会员的到期日）。不参与水印、私密、可商用的判断。
- **扣费规则（`reserve_credits`）：先付费池、后免费池、整单不拆。** 付费池够就全扣付费池，作品 `credit_pool = 'paid'`；付费池不够但免费池够，全扣免费池，作品 `credit_pool = 'free'`；都不够就失败。不把一单拆到两个池里，所以没有「半付费作品」。付费用户剩下的免费积分留着，付费积分用完后才会用到，那时产出的是免费作品并触发付费墙。
- 任何一次成功付款（首付、订阅续费、钱包单笔、Waffo 单笔、积分包）都走同一个 SQL 函数 `apply_purchase(user, product_id, event_id)`：`credits += 商品积分`；商品带天数的同时 `paid_until = max(paid_until, now()) + 天数`；积分包的天数为空，**不碰 `paid_until`**（不能写成「+0 天」，那会把空的 `paid_until` 写成 now()）。首付和单笔用 checkout session id 当 `event_id`，Waffo 用它的事件 id。
- **结账入账走 `settle_checkout`**（T9，总控 2026-11-06 补；AGENTS §5.1 第 1 条：一个业务动作一个函数）。签名 `settle_checkout(user, product_id, session_id, subscription_id?, subscription_status?, current_period_end?, cancel_at_period_end?)`，只授权 `service_role`。它在一个事务里完成两件事：
  1. 如果是订阅，先把 Stripe 上的当前状态写进镜像表 `subscriptions`。写入的状态由回调当场从 Stripe 取回，不用事件里带的旧数据。同一订阅 id 如果属于别的用户或别的商品，直接拒绝。
  2. 再调用 `apply_purchase(user, product_id, session_id)`。

  入账失败时，镜像表的写入一起回滚。同一 session 的重发和兄弟事件只入账一次。`checkout.session.completed` 和 `checkout.session.async_payment_succeeded` 都走它。
- **付款记录与续费函数**（T10，总控 2026-11-06 按 T10 开工前的问题定）：
  - **表 `payments`**（私有，只授权 service role）：每次成功付款一行。
    - 字段：`user_id`、`product_id`、`channel`（`stripe` / `waffo`）、`stripe_session_id` / `stripe_invoice_id` / `stripe_charge_id`（各自可空且唯一）、`waffo_order_id`（可空、唯一）、`amount_total`（实付，含税，单位为分，int）、`currency`、`amount_tax`（分）、`method`（`card` / `alipay`）、`status`（`paid` / `refunded` / `partially_refunded` / `disputed`）、`amount_refunded`（分，默认 0）、`created_at`。
    - 约束：Stripe 行至少有 session 或 invoice 之一；Waffo 行必须有 `waffo_order_id`。
    - 不回填 T10 上线前的历史付款。
  - **`settle_checkout` 改签名**：新增参数 `p_amount_total`、`p_currency`、`p_amount_tax`、`p_method`、`p_invoice_id`（可空）、`p_charge_id`（可空），在同一事务里写 `payments`。参数变了无法 `create or replace`，按 AGENTS §5「签名必须变」的例外，由新迁移删掉旧的 7 参数版本后重建，PR 写明原因；调用方同步改。
  - **`apply_subscription_renewal`**：参数为 `(user, product_id, invoice_id, period_end, amount_total, currency, amount_tax, method, charge_id)`。内部用 `_apply_credit_change`（kind `purchase`，幂等键 `renewal:<invoice_id>`），`paid_until = greatest(paid_until, period_end)`，同一事务写 `payments`。
  - **`sync_subscription(sub_id, status, current_period_end, cancel_at_period_end)`**：供 `customer.subscription.updated / deleted` 使用，只更新已有的镜像行，不新建（没有首付记录的订阅不插入）。
  - **`record_payment_issue(charge_id, kind, amount_refunded)`**：`kind` 为 `refunded` / `disputed`，按 charge id 更新 `payments.status` 和 `amount_refunded`（全退为 `refunded`，部分退为 `partially_refunded`，争议为 `disputed`），不动积分。charge 不在表里时不写行，只发 Sentry 告警，回 200。
  - **`settle_waffo_order(user, product_id, payment_id, order_id, amount_total, currency, amount_tax, method)`**（T13，总控 2026-11-06 补）：在同一事务里完成两步。先调用 `apply_purchase(user, product_id, payment_id)`，用 Waffo 的 payment id 做幂等键；入账生效时再插入一行 `payments`，其中 `channel = 'waffo'`，`waffo_order_id` 取 Waffo 订单号，金额和税额取自 `order.completed` 事件，单位换算为分。重复事件不写第二行。
  - 以上函数都只授权 `service_role`。
- **首付的 `paid_until`**：首付走 `apply_purchase`，按商品天数累加（月付 +30 天，年付 +365 天），和 Stripe 本期结束日可能差一两天。从第一次续费起，由 `apply_subscription_renewal` 对齐 `period_end`，见下一条。
- 订阅续费走 T10 新增的 `apply_subscription_renewal(user, product_id, invoice_id, period_end)`：`credits += 商品积分`，`paid_until = greatest(paid_until, period_end)`（直接对齐 Stripe 的本期结束日，不按天数累加，避免大小月漂移）；同样写流水、按 invoice id 幂等，内部复用 `_apply_credit_change`（总控 2026-11-05 补）。
- 没用完的积分在续费时自然结转（积分不过期），不做「本期 / 结转」两本账。
- **计价单位是 credit，不是「张」。**（唯一例外：新用户赠送对外说 "3 free Standard images"，即 6 个免费 credit，见建站规格 G3。） 一次出图扣多少 = 模板在用户所选分辨率的配置值 `templates.credits_cost[resolution]`（第 5 节：`high` 模板默认 1K 2 / 2K 4 / 3K 6，`medium` 1 / 2 / 3），后台模板编辑页可改；会员每月发多少 credit、积分包多少 credit 写在 `site.config.ts`。前台后台都叫 credits，余额显示为 "30 credits + 3 free"。「重新生成」按同一模板、同一分辨率再扣一次。
- **配置下限（Owner 2026-11-05 定的毛利口径）**：每个质量档 × 分辨率的 credit 数 ≥ `ceil(该档 p95 单次真实成本 ÷ $0.06)`，后台可以往上加价，不能低于下限。下限表是 `modules/image` 里的常量，后台保存模板时在服务端校验，低于下限拒绝保存。$0.06 的来历：最便宜的 credit 是 Max 年付（定下限时 $0.208；2026-11-06 改价后 $0.212，下限按 $0.208 算更保守，不变），扣最坏手续费（国际卡 + Managed Payments：2.9% + 3.5% + 1.5% + $0.30）和 3% 退款预留后，守 **60% 毛利**（不含注册赠送的 3 个免费 credit，按最坏情况：credits 全部用完）每 credit 的成本上限约 $0.060。成本依据：OpenAI 官方价（图像输入 $8/M、输出 $30/M token），high 质量正方形单张输出 1K $0.053、2K $0.107、3K $0.178，加输入图约 $0.012～$0.021、提示词约 $0.005、失败退回损耗 10%、R2 + Vercel 约 $0.002；输入图 token 上线前按 LAUNCH §5 实测后更新下限表（定稿全文见共享笔记 `pricing-final-2026-11-05.md`）。
- 余额只能通过 SQL 函数改：发放（`grant_credits` 带 `pool` 参数，注册赠送和活动赠送用 `'free'`）、预扣、确认、退回、管理员调整（`admin_adjust_credits` 带 `pool` 参数）。前端和普通接口都不能直接写余额。
- 每一笔变动都写进流水表，记录动的是哪个池，带幂等键。

### 6.2 商品（Owner 2026-11-05 定稿）

**三档会员 × 月付 / 年付 + 三个积分包，共 9 个商品。** 商品 id 固定如下（总控定），Stripe / Waffo 映射、PostHog 事件、付费墙和 `/pricing` 文案都按这些 id 写：

| id | 档位 | 价格 | 付费积分 | 每 credit | 会员期 `paid_until` | 卡 / Apple Pay / Google Pay | 支付宝 |
|---|---|---|---|---|---|---|---|
| `starter_monthly` | Starter | $19.90 / 月 | 50 / 月 | $0.398 | +30 天 | Stripe **订阅**，每期 +50 | Stripe **单笔**一期会员 |
| `starter_yearly` | Starter | $191 / 年（合 $15.92/月） | 600，一次发完 | $0.318 | +365 天 | Stripe **订阅**，每年 +600 | Stripe **单笔** |
| `pro_monthly` | Pro | $49.90 / 月 | 135 / 月 | $0.370 | +30 天 | 订阅 | 单笔 |
| `pro_yearly` | Pro | $479 / 年（合 $39.92/月） | 1,620，一次发完 | $0.296 | +365 天 | 订阅 | 单笔 |
| `max_monthly` | Max | $99 / 月 | 280 / 月 | $0.354 | +30 天 | 订阅 | 单笔 |
| `max_yearly` | Max | $713 / 年（合 $59.42/月） | 3,360，一次发完 | $0.212 | +365 天 | 订阅 | 单笔 |
| `pack_s` | 积分包 | $9.90 | 20 | $0.495 | 不变 | Stripe Managed Payments **单笔** | Stripe **单笔** |
| `pack_m` | 积分包 | $24.90 | 55 | $0.453 | 不变 | 单笔 | 单笔 |
| `pack_l` | 积分包 | $49.90 | 115 | $0.434 | 不变 | 单笔 | 单笔 |

- 年付积分 = 12 × 月付积分，一次发完。**年付折扣（Owner 2026-11-06 改价）**：Starter、Pro 按月价 × 12 打 8 折，Max 打 6 折，金额取整到美元：$191（省 20%）、$479（省 20%）、$713（省 40%）。年付最多省 40%，不得超过。改价在 Stripe 上是新建 Price 并用 `transfer_lookup_key` 接过 lookup key（Price 金额不可改），旧 Price 归档；Waffo 商品价格同步改。积分包每 credit 都高于所有订阅，**所有人可买，包括没买会员的**，所有通道都是单笔，不改 `paid_until`。注册赠送仍是 3 个免费 credit（`billing.freeCredits`），不计入毛利。
- 积分包不改会员期，但它发的是付费积分，用它生成的作品就是付费作品（无水印、私密、可商用），所以非会员买包也拿到完整权益——这正是「按作品判付费」要解决的事。
- 价格数字只写在 `site.config.ts`（第 2 节），付费墙、`/pricing`、FAQ、结构化数据都从配置读；建站规格 G3 同步。送 Stripe 时用整数分（`1990`）。
- **Stripe Product / Price 映射**：Starter、Pro、Max 各一个 Product（税码 `txcd_10105001`），每个 Product 挂 4 个 Price：月付 recurring、月付 one-time、年付 recurring、年付 one-time（同 id 的 recurring 和 one-time 价格相同）；三个积分包各一个 Product，只有 one-time Price。Price 的 `lookup_key` 固定为 `<product_id>`（one-time）和 `<product_id>_recurring`（订阅），服务端按 lookup key 取 Price，不把 Price id 写进代码或配置；每个 Price 的 `metadata.product_id` 也写上，回调反查用。
- **不接微信支付**（Owner 2026-11-05 定，只保留卡和支付宝）。支付宝在 Stripe 普通模式下不支持订阅，所以钱包用户买会员买的是「一期」（`starter_monthly` 的单笔形态 = 30 天 50 credits），`paid_until` 到了自己再买。这不是功能缺失，是 Stripe 的限制，付费墙文案要说清楚（"Renews automatically" vs "30 days, no auto-renew"）。
- **PostHog `purchase` 事件参数**：`product_id`、`tier`（`starter` / `pro` / `max` / `pack`）、`interval`（`month` / `year` / 空）、`form`（`subscription` / `one_time`）、`channel`（`stripe` / `waffo`）、`method`（`card` / `alipay`）、`amount_usd`、`credits`。`generate` 事件加 `resolution` 和 `credits_cost`。

已经确定的规则：

- **订阅的状态只有 Stripe 一份真相**，Shotviva 存一张镜像表 `subscriptions`（`user_id`、`stripe_subscription_id`、`product_id`、`status`、`current_period_end`、`cancel_at_period_end`），由回调同步，账号页只读它。
- 续费成功：`invoice.paid`（`billing_reason = subscription_cycle`）→ `apply_subscription_renewal`（T10），`paid_until = greatest(paid_until, 本期 period_end)`。
- **续费失败：什么都不做。** 不再发积分，`paid_until` 到期后账号页显示会员已过期；已有的付费积分照常可用。Stripe 自己重试，哪天扣成功哪天再发。不写宽限期。
- 取消：期末生效（Stripe 默认）。用户在 Stripe Customer Portal（Managed Payments 下是 Link 的客户门户）自己取消，账号页只放一个「Manage subscription」链接，不自己写取消界面。`customer.subscription.updated / deleted` 只更新镜像表。
- 外部退款（Managed Payments 下 Link 客服 60 天内可以不经我们退款）：`charge.refunded` 只写记录 + Sentry 告警，Owner 手动 `admin_adjust_credits`。不写自动扣回。
- 不做：首月优惠券、升级降级、按比例退款、宽限期、测试时钟自动化、到期提醒邮件。
- **分两段上线**：上线当天必须有「订阅模式建结账 + 首付发放」（和单笔几乎相同）；续费、取消同步、Portal 链接在第一个付费用户满 30 天之前上线即可（TASKS T10）。
- 账号页「Subscription」区块显示当前档位（Starter / Pro / Max）和月付 / 年付；镜像表 `subscriptions.product_id` 存 9 个 id 之一。
- 卡和支付宝能付（第 6.3 节的路由），不接微信支付。
- **水印在下载路由加，按作品判**：成品只存一份无水印原图；`core/storage` 的下载路由对 `credit_pool = 'free'` 的作品用 `sharp` 叠右下角「Made with Shotviva」后返回（约 50ms），`credit_pool = 'paid'` 的作品永不加水印。工作台预览和将来创作库展示同样走这个路由。
- **免费作品**（免费积分生成）：`visibility = 'public'`，带水印，用户不能改私密，可以删除。买了会员之后它们**仍然**是免费作品——不会自动去水印、不会自动私密；想要无水印版就用付费积分再生成一张。
- **付费作品**（付费积分生成）：默认 `visibility = 'private'`、无水印、可商用，用户可以改公开（进创作库，仍无水印）。会员到期、积分用完都不影响已有付费作品。
- 到期提醒邮件 v1 不做；Managed Payments 订阅的续费提醒由 Stripe / Link 自动发。

#### 会员档位权益（Owner 2026-11-05 定档位差异；上线范围由总控 2026-11-05 按「没做出来的不能写成现有功能」裁定）

**当前档位**：`paid_until > now()` 时，取最近一次会员购买（订阅或钱包单期）的档位 `starter` / `pro` / `max`；只买过积分包或没付过费的账号没有档位，按 Starter 的生成限制处理（但用免费积分生成的仍是免费作品，规则不变）。档位只决定下表的「会员权益」，**不改变按作品判付费**（水印、私密、可商用仍只看作品用的是哪个池的积分，§6.1）。由 SQL 函数 `current_tier(user_id)`（实现：`paid_until > now()` 时，取付费池里最近一条带会员商品 id 的入账流水的档位；积分包和后台调积分不决定档位；返回 null 视同 Starter） 统一给出，代码不各自判断。

| 权益 | Starter | Pro | Max | v1 状态 |
|---|---|---|---|---|
| 无水印、可商用、默认私密、全部模板（付费积分生成的作品） | ✓ | ✓ | ✓ | **上线**（已有，§6.1） |
| 同时进行的生成数 | 1 | 3 | 6 | **上线**：按 `current_tier` 设并发上限（替换现有固定的 `MAX_RUNNING`），没有档位的账号为 1；界面允许生成在后台进行、在 Photos 页看进度 |
| 客服响应时间（站内工单和邮件） | 48 小时 | 24 小时优先 | 同一个工作日 | **上线**：Owner 本人回复兑现（Owner 2026-11-06 确认能兑现）。「同一个工作日」按**北京时间**：工作日 18:00 前收到的当天回，18:00 后或周末收到的算下一个工作日。后台工单列表按「到期时间」排序、标超时，概览「待处理」计超时工单（T27b） |
| 需求墙投票权重 | 1× | 1× | 3× | 随 T12 上线；T12 合并前在付费墙标 Coming soon |
| 批量上传（Pro 10 张、Max 30 张） | — | 10 | 30 | **Coming soon**，T28 做完后上线，Pro 和 Max 同时开（Owner 2026-11-06） |
| 新功能抢先用 | — | — | ✓ | **Coming soon**：权限接口和后台先做好（T29），有新功能要「只给 Max」时再在后台打开；不做「新模板抢先」（Owner 2026-11-06） |
| 生成排队优先 | — | 快速队列 | 最优先 | **不写进付费墙**：v1 是同步出图，没有排队，写了就是虚假承诺；以后改成异步队列时再加 |

品牌套件（logo 和字体自动套到海报上）**整条取消**，付费墙和定价页都不再出现（Owner 2026-11-06）。

**档位限制只有一张表**（Owner 2026-11-06 定，T28 落地）：所有按档位变的数字放在 `core/billing/tier-limits.ts` 的 `TIER_LIMITS` 里，付费墙文案和服务端校验都从这里读，保证页面写的就是代码限的。没有档位按 Starter。

| 字段 | Starter | Pro | Max | 说明 |
|---|---|---|---|---|
| `concurrency` | 1 | 3 | 6 | 同时进行的生成数（已上线） |
| `perWindow` | 20 | 40 | 80 | 10 分钟窗口内最多发起的生成数，替换现在固定的 20；否则 Max 批量 30 张第 21 张会被拦 |
| `batchMax` | 1 | 10 | 30 | 一次最多选几张照片批量生成 |
| `supportHours` | 48 | 24 | `null`（当个工作日，北京时间 18:00 截止） | 工单时效 |

- 需求墙 3 倍票的权重写在 SQL（`toggle_template_request_vote`），不读这张表，由 db 测试保证一致。
- 档位不够时服务端抛 `TIER_REQUIRED`（`core/errors.ts`，403，带 `required_tier`），前端打开付费墙并预选所需档位；`paywall_view` 的 `trigger` 记 `tier_required`（§16.2）。

**批量上传的语义**（Owner 2026-11-06）：同一模板、同一尺寸和清晰度、同一补充说明，一次选 N 张照片，出 N 张图。每张是一个独立任务：独立扣费、独立成败、失败独立退回。整批只用付费积分，付费池不够就不让批量（不拿免费积分凑，免得一批里混着带水印的）。浏览器按并发上限排队发 `/api/generate`；服务端没有「批量」对象，靠 `perWindow`、并发上限和余额兜底，不新建表、不加 `batch_id`。第一版不做「全部打包下载」。伙伴接口不做批量。

**新功能抢先用**（Owner 2026-11-06，T29）：
- 代码里有一张功能注册表 `FEATURES`（`core/features/registry.ts`，每项一个 key 和中文名）。新功能要受档位限制时，先在注册表加 key，再在服务端入口调 `requireFeature(userId, key)`，界面用 `featureOpen(tier, key)` 决定显示还是上锁。
- 谁能用由表 `feature_access` 决定：`key text primary key`（必须是注册表里的 key）、`min_tier text null`（`pro` / `max`，null 表示所有人可用）、`open_to_all_at timestamptz null`（到这个时间后所有人可用，可空）、`updated_at`、`updated_by`。没有行就是所有人可用。RLS 打开不建策略，只经 `service_role` 读写；读取按 `features` 缓存标签缓存，后台保存时失效。
- 判定 `featureOpen`：没有行、或 `min_tier` 为空、或已过 `open_to_all_at`、或用户档位 ≥ `min_tier` 就开放；档位顺序 starter < pro < max，没有档位按 Starter。
- 后台「功能权限」页（`/admin/features`）：列出注册表里所有功能，每项可选「所有人 / Pro 起 / 仅 Max」和「哪天起对所有人开放」，保存写 `feature_access`。注册表为空时显示「暂时没有可设置的功能」。
- 这张表是 §15.6「不做后台开关」的例外，只管档位门槛，不管功能开不开（功能开关仍在 `site.config` 的 `features`）。

### 6.3 通道

**Stripe：一个账户，按付款方式路由**（照 Graylum staging `methodRouting.ts` 的做法，Graylum 2026-10-12 沙盒实测两种模式共用一个账户 PASS）：

| 用户选的方式 | Checkout Session 怎么建 | 卖家 |
|---|---|---|
| 卡 / Apple Pay / Google Pay | `mode: 'subscription'`，`managed_payments: { enabled: true }`，不传 `allowed_payment_method_types`（MP 自己决定付款方式） | Stripe（Link）当商户记录方，结账时另加税 |
| 支付宝 | `mode: 'payment'`，`allowed_payment_method_types: ['alipay']`（在 Dashboard 已开启的动态付款方式里过滤；Dashboard 没开支付宝时拒绝跳转） | Shotviva |

> Stripe API 2026-09-30（stripe@23）起，Checkout Session 不再接受 `payment_method_types`，传了会 400；按方式限定一律用 `allowed_payment_method_types`。审核下来之前不走 MP 的卡路由传 `['card']`。（T9 修复，2026-11-06）

- 服务端只认用户选的方式，不按 IP 或浏览器语言强制。Managed Payments 的结账页不允许买家国家为中国，所以大陆用户自然选钱包。
- MP 商品必须设税码 `txcd_10105001`（AI 服务，个人用）。MP 价格不含税，税在结账时另加。
- 顾客账单：卡支付显示 `LINK.COM* SHOTVIVA`，钱包支付显示 SHOTVIVA。MP 结账页不支持自定义域名。
- 正式环境的 Managed Payments 要等 Stripe 资格审核。**审核没下来之前的兜底**：卡先不带 `managed_payments` 走普通订阅（Shotviva 当卖家），审核通过后翻开关。
- 要处理的 Stripe 事件：`checkout.session.completed` 和 `checkout.session.async_payment_succeeded`（首付 / 单笔 → `settle_checkout`：写镜像表 + `apply_purchase`，同一事务）、`invoice.paid`（只认 `subscription_cycle` → `apply_subscription_renewal`，T10）、`customer.subscription.updated / deleted`（只更新镜像表）、`charge.refunded`（记录 + 告警）、`charge.dispute.created`（拒付 / 争议：记录 + Sentry 告警，不自动扣积分；T10，总控 2026-11-06 补）。其余事件忽略（回 200）。Stripe 后台的回调端点一次订阅这 7 个事件。
- Stripe 用与 Graylum 同一主体下**新开的独立账户**，避免两边回调互相收到对方的事件。

**Waffo：保留，只做单笔兜底**（Owner 2026-11-05 确认不砍）：

- 角色是 Stripe 账户本身没通过、或 Stripe 整体不可用时的收款兜底。Waffo 可以加急当天开通。
- Waffo 上卖 9 个商品的**单笔**形态：六个会员商品按一期（月付 +30 天、年付 +365 天，积分同表）、三个积分包；不做 Waffo 订阅；Waffo 不支持微信，付款页只显示卡和支付宝。`product_id → Waffo 商品 id` 的映射放环境变量（一个 JSON 映射，九个 id 都要有，缺一个启动时报错）。
- 通过环境变量指定当前用哪条通道：默认 Stripe；切到 Waffo 时付费墙全部方式都走 Waffo 单笔。**不做自动故障切换**，出问题时人工改开关。
- 回调规则和 Stripe 相同：先验签，再按事件 id 去重，最后 `apply_purchase`。

**开发顺序**：先 Stripe（T9 结账 + 首付、T10 续费），再 Waffo 兜底（T13）。做法参照 Graylum **staging 分支**的支付规则，但不复制它的代码：staging 的支付目录约 8900 行，带着首月优惠券、升级、宽限、测试时钟，Shotviva 一项都不要。

## 7. 登录

照 Graylum staging：

- Supabase Auth：邮箱 + 密码注册，点验证邮件完成激活；另加 Google 登录。
- hCaptcha 交给 Supabase Auth 自带的人机验证校验。前端**只做隐形验证**，失败时降级为显式 checkbox；不抄 Graylum 的「隐形 + 弹窗」两套。
- 防刷免费额度：邮箱验证 + hCaptcha + **同 IP 限制**（Owner 2026-11-06 定：上线就开）。发放注册赠送的 SQL 函数检查同一个 `signup_ip` 24 小时内是否已经给别的账号发过；发过就不再发。后注册的账号照常能注册、能付费，只是没有免费额度，账号页显示一句说明。不引入设备指纹库。
- **封禁的范围**（Owner 2026-11-06 定）：被封禁（`banned_at` 不为空）的账号不能出图、不能用需求墙、**不能创建结账**（`/api/checkout` 返回 403）；封禁时在同一事务里**断开 Graylum 连接**（`partner_links` 置为断开）。账号仍可以登录、查看和下载自己的作品、删号。
- 验证邮件、重置密码邮件由 Supabase Auth 发，SMTP 配成 Resend，发件人 `Shotviva <support@shotviva.com>`（Owner 2026-11-05 由 `noreply@` 改来：Resend 提示 no-reply 发件人影响送达，且用户回信能直接进飞书的 support 邮箱）。**v1 不写任何发信代码**，只改 Supabase 的邮件模板。
- 邮件按用户语言发（Owner 2026-11-06）：注册时把当前页面语言写进 `user_metadata.locale`（`'en'` / `'zh'`，`signUp` 的 `options.data`）；四个模板正文用 `{{ if eq .Data.locale "zh" }}…{{ else }}…{{ end }}` 放中英两版；邮件标题如果 Supabase 支持同样的条件写法就中英分开，不支持就保持英文（T21 在本地 Supabase 实测后定）；没有 `locale` 的老账号和 Google 登录账号发英文。
- 管理员身份存在数据库 `profiles.role`，不用环境变量里的邮箱列表。

## 8. 上传、存储与保留期

### 8.1 硬约束

- Vercel 函数请求体和响应体上限都是 4.5MB。**任何 API 路由不得接收或返回图片字节**，只传 R2 key 或签名地址。
- Vercel 上预编译的 `sharp` 不含 HEIF 解码器，**服务端不转 HEIC**。
- GPT-Image 按像素看图；长边 2048 以上的输入对出图零增益（LAUNCH §5 的成本测量若发现 1K high 单次 p95 成本 > $0.12，可把上传长边降到 1536）。
- **输出分辨率三档（用户在工作台选，默认 1K）**：按正方形边长定义，1K = 1024²、2K = 2048²、3K = 2880²（标签叫 3K 而不是 4K：模型上限 2880 像素，叫 4K 会误导用户，Owner 2026-11-05 定）（模型上限）。非正方形比例的尺寸表放在 `modules/image/provider/output-size.ts`：边长取 16 的倍数、长短边比 ≤ 3:1，并且**同一档内任何比例的输出 token 数不超过该档正方形**（扣费表按每档最贵的正方形定，这样配置下限对所有比例都成立），用 OpenAI 官方 token 计算器的公式核对。

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

**模板封面另用一个公开桶**（Owner 2026-11-05：模板示例图由 Owner 在后台自己上传替换）：

- 桶名 `shotviva-assets`（预览用 `shotviva-assets-preview`），只放模板封面前后图，前缀 `covers/{template_id}/before-{hash}.webp`、`after-{hash}.webp`；文件名带内容哈希，换图就是新文件，不用清缓存。
- 公开读：生产绑定自定义域名 `assets.shotviva.com`（走 Cloudflare CDN）；预览可以用 R2 自带的开发地址。公开地址的前缀放环境变量 `NEXT_PUBLIC_ASSETS_BASE_URL`，`templates.cover_before_url` / `cover_after_url` 存完整地址。
- 写入只走后台：后台模板编辑页「上传前图 / 上传后图」→ 服务端校验（JPEG / PNG / WebP，≤20MB）→ `sharp` 转 WebP（长边 1600、质量 82）→ 写公开桶 → 更新模板行。和用户照片一样，图片字节不经 API 路由请求体（第 8.1 节）：浏览器先直传到私有桶的 `uploads-admin/` 临时前缀（7 天过期），服务端再读出处理后写公开桶。
- **展示媒体支持三种**（Owner 2026-11-05，参考 Lovart）：静态图、动图、短视频。`templates` 增加 `cover_media_type`（`'image'` / `'animated'` / `'video'`）、`cover_video_url`、`cover_poster_url`（视频和动图的封面帧，静态图时为空）；前后对比图字段照旧，用于静态图模板和预览抽屉里的拖动对比。
  - 动图一律存动态 WebP：后台上传 GIF 也收，服务端转成动态 WebP（GIF 体积通常大 5～10 倍，拖慢首屏）。
  - 视频存 MP4（H.264）原文件，≤15MB、≤15 秒，服务端只做类型和大小校验，不转码；必须有封面帧：后台单独上传，或上传时浏览器从第一帧截图生成。
  - 同样按内容哈希命名，放 `covers/{template_id}/`。
- 用户照片和成品绝不进公开桶；公开桶里没有任何用户数据。
- 换图后首页和模板页通过按需重新生成（ISR revalidate）立即更新，不用重新部署。

会员到期后保留 90 天、续费恢复、删除前提醒，这些等有付费用户后再做。隐私政策 v1 写「上传的照片保留 7 天，成品保留到你删除为止」。

## 9. 公开创作库

完全遵循创作库规格，另加下面几条（Owner 2026-11-04 确认）：

1. **付费墙与 8 周闸门并存**：从上线第一天起，用免费积分生成前就看到「作品将公开展示」的告知，免费作品（`credit_pool = 'free'`）`visibility = 'public'`。但前 8 周 `gallery.enabled = false`，不生成任何 /g、/tag、/gallery 页面。付费作品默认 `private`，本人可以随时改公开或改回。
2. **不另建作品表**：创作库规格第 3 节的 `ugc_works` 表不单独建。公开作品就是 `generation_jobs` 里 `status = 'succeeded' AND visibility = 'public'` 的记录。`indexable` 字段不要，作品页永远 noindex。
3. **公开数据不含核心提示词**：只展示模板名和用户自己填的文案。「一键复用」= 同一模板 + 同样参数 + 换成复用者自己的照片。
4. **标签选词看搜索意图**：标签主词必须是图片类或商用意图的词（如 `grilled salmon photo`、`cafe menu photos`），不收菜谱类意图的词。建站规格第 5 节「明确不做的词」不得进入标签白名单。每个标签上线前核实美国搜索量和哥飞版 KD，并检查前十名的页面类型。
5. **审核放到第 6~7 周**：和作品审核后台页一起做，在第 8 周开放创作库之前完成。审核方案到时再定，要指定具体服务，不写「含人脸」这种无法验证的规则。
6. 免费作品可以被本人删除（隐私法规要求），但不能设为私密。

## 10. 管理后台

v1 后台（Owner 2026-11-06 扩充；T23 做外壳和运营页）：**一个后台外壳**（左侧导航、中文、`/admin` 是概览首页），下挂下面这些页面。**只做本站已有的功能，不照搬 Graylum 后台**：Graylum 的工单、创始会员、导师、技能、发布监控等本站没有，不做。

| 导航 | 路由 | 内容 |
|---|---|---|
| 概览 | `/admin` | 今日 / 近 7 天 / 近 30 天：注册数、出图数、出图成功率、消耗积分（免费 / 付费分开）、新增付费用户、收入；近 30 天出图和收入趋势图。非收入部分由 `admin_dashboard_stats(p_days)` 一次算完；收入由 `admin_revenue_stats(p_days)` 算（T9 之后才有） |
| 用户 | `/admin/users` | 按邮箱搜（读 `admin.users_overview`，最多返回 50 条）。用户详情：积分两池、会员到期、最近出图、积分流水（分页）。操作：调积分（`admin_adjust_credits`，选池、填原因）、封禁 / 解封（`admin_ban_user` / `admin_unban_user`，填原因） |
| 订单与收入 | `/admin/orders` | 付款记录（时间、用户邮箱、商品、金额、付款方式、渠道、状态）和订阅状态，按商品和渠道汇总收入；每行链接到 Stripe 后台对应记录。退款仍在 Stripe 后台操作。数据来自 T9 的表，T9 合并后才有 |
| 出图记录 | `/admin/jobs` | 全部出图任务，按状态、模板、供应商 / 模型、来源（web / graylum）、日期筛选，游标分页；失败任务显示 `error_code`；按模型和清晰度统计次数和估算成本（成本单价表是代码常量，和积分下限放在同一处） |
| 模板 | `/admin/templates` | 见下面第 1 条 |
| 出图供应商 | `/admin/providers` | 见下面第 3 条 |
| 需求审核 | `/admin/requests` | 见下面第 2 条；`features.wishlist` 关掉时不出现在导航 |
| 公告横幅 | `/admin/announcements` | 全站顶部的公告 / 促销条，见下面「公告横幅」一段 |

**公告横幅**（Owner 2026-11-06 要求）：

- **数据**：表 `site_announcements`，字段：
  - `id`
  - `message_en`、`message_zh`：两种语言都必填，每条 ≤140 字
  - `link_url`：可空，只允许站内路径或 https
  - `link_label_en` / `link_label_zh`：可空
  - `tone`：`info` / `promo` 两种样式
  - `starts_at` / `ends_at`：可空，空表示不限
  - `is_active`
  - `created_at` / `updated_at` / `updated_by`
- **生效规则**：同一时间最多一条生效，即 `is_active` 为真且当前时间在起止范围内。保存时校验时间段不重叠，`admin_activate_announcement` 在一个事务里完成切换。
- **读取**：RLS 拒绝所有客户端读取。前台由服务端读出当前生效的那一条，走缓存，打 `announcements` 标签；后台改动后标签立即失效。
- **前台显示**：
  - 营销页和应用页最顶部显示一条横幅，按当前语言显示文字和链接。
  - 用户可以关闭。关闭状态按公告 id 记在浏览器本地，换了新公告会重新出现。
  - 后台页、结账页、工作台生成过程中不显示。
  - 不做弹窗，不做倒计时，不追踪点击。要看效果，用 PostHog 自带的 `$pageview` 来源。
- **后台管理**：列表；新增 / 编辑（两种语言并排填写，可预览样式）；启用 / 停用；定时开始和结束。

**后台数据访问补充**（总控 2026-11-06，按 T23 开工前提出的问题定）：

- **用户搜索**：`admin` schema 不对 Data API 开放。所以新增函数 `admin_search_users(p_query text)`，只授权给 `service_role`。它从 `admin.users_overview` 按邮箱 `ilike` 查，最多返回 50 行。
- **新增全局时间索引**，给概览统计和出图记录的全局分页用：
  - `generation_jobs(created_at desc, id desc)`
  - `credit_ledger(created_at)`
  - `profiles(created_at)`
- **审计**：
  - `admin_audit_log.action` 的允许值加上 `unban_user`。
  - 封禁和解封写审计日志。
  - 调积分只写积分流水，流水里已有原因，不再另写审计日志。
- **公告切换**：
  - 「启用」就是切换：在同一个事务里自动停用和它时间段重叠的旧公告，确认框里写明会停用哪一条。
  - 编辑一条已启用的公告，如果改完和别的已启用公告时间重叠，直接拒绝。
  - 数据库用排他约束兜底：`exclude using gist (tstzrange(coalesce(starts_at,'-infinity'), coalesce(ends_at,'infinity')) with &&) where (is_active)`。
- **收入**：`admin_dashboard_stats` 不含收入。收入单独用一个函数 `admin_revenue_stats(p_days)`，在 T9 的订单表合并后由订单页那个 PR 新建。概览页两个函数都调。这样两个函数各自一次写成，不需要用 `create or replace` 回头补字段。

页面细节：

1. **模板与提示词编辑**。因为 `template_prompts` 客户端读不到，必须有一个服务端页面来改。功能：新建模板、编辑公开信息（含质量档和 1K / 2K / 3K 三个 credit 数，低于第 6.1 节下限拒绝保存）和私有提示词、上下架、排序。
2. **需求审核**（第 15 节）：待审需求列表（参考图 + 描述 + 用户）、通过 / 拒绝 / 下架、按票数排序、标记 shipped 并关联模板。
3. **出图供应商**（第 3.3 节，T17）：增改供应商、测试连接、切换当前使用。

**客服与付款补救（T25、T26，Owner 2026-11-06 采纳 `docs/proposals/admin-roadmap.md` 的 P0 部分）**：
- **万能查找**：`admin_lookup(p_query)`。按输入格式分流：邮箱子串、用户 id 或 job id（uuid）、`cs_` / `in_` / `ch_` / `sub_` / Waffo 订单号；返回 `{kind, user_id, job_id}`，跳到用户详情。
- **用户详情补全**，在详情页新增五块，每块一个查询：
  - 最近 10 笔付款（`payments`，新索引 `payments(user_id, created_at desc)`）；
  - 订阅和当前档位；
  - Graylum 连接；
  - 同 IP 的其他账号（新索引 `profiles(signup_ip, created_at)`）；
  - 本人的需求。

  调积分时预览调整后的余额。
- **后台查看作品**：服务端签发 5 分钟有效的 R2 读取地址。成品看无水印原图；输入图超过 7 天已删除时，显示「已过期」。每次查看写一条审计日志 `view_work`（`admin_audit_log` 的 `action` 允许值加上 `view_work`，并新增 `target_id`）。隐私政策同步加一句：客服和安全需要时，我们可能查看你上传的照片和生成的图片，每次查看都有记录（Owner 2026-11-06 同意）。
- **卡住任务和单张补偿**：
  - 「卡住的任务」视图：`status = 'running'` 且创建超过 10 分钟，新建部分索引 `generation_jobs(created_at) where status = 'running'`。可单个或全部退回，调用已有的 `refund_job`。
  - 「补偿这一单」：调用 `admin_adjust_credits`，幂等键 `comp:<job_id>`，退回原来扣的积分池，同一单只能补一次。
- **可疑注册**：`admin_signup_ip_clusters(p_days)` 列出近 24 小时或 7 天内同一 IP 注册 ≥3 个账号的情况，可以逐个封禁。
- **按 Stripe id 重放入账**（T26）：后台输入 `cs_…` 后，从 Stripe 取回 session，确认已付款，预览将入账的内容，Owner 确认后走和回调同一个 `settle_checkout`（同一个幂等键，回调和重放谁先到都只入账一次）。输入 `sub_…` 则调用 `sync_subscription`。每次重放写审计日志 `replay_checkout`。Waffo 的重放等 T13。
- **概览「待处理」条**（T26）：`admin_todo_counts()` 一次返回卡住的任务、近 1 小时和 24 小时失败率、待审需求、待处理的退款和争议、最近一次入账时间，以及当前在用的供应商和模型，每项都有索引支撑。
- **T25 / T26 的审计写入与同 IP 规则的实现**（总控 2026-11-06 补）：
  - `admin_view_work(p_job_id)`：一次往返内写一行 `view_work` 审计（`user_id` 为作品主人，`target_id` 为 job id，原因固定为「客服查看作品」，不要求 Owner 每次填写），并返回签地址需要的 `user_id`、`status`、`output_key`、`input_key`、`created_at`。
  - `admin_log_replay(p_user_id, p_target_id, p_reason)`：只能写 `replay_checkout`。重放时先调 `settle_checkout`（它本身是幂等的），再调这个函数写审计，一共两次调用；审计写入失败只记日志。这是 AGENTS §5.1 第 1 条的例外，只用于后台重放。
  - 同 IP 限制写在 `grant_credits` 里，只对幂等键 `signup:<本人 id>` 的注册赠送生效，签名不变：
    - 判断依据是本账号的注册时间：同一个 `signup_ip` 上，如果有别的账号在本账号注册前 24 小时内（含之后）拿过注册赠送，本账号就不发赠送、不写流水，返回 `applied = false`。以后再登录也不会补发。
    - 按 IP 加 advisory lock，防止两个账号同时验证、都拿到赠送。
    - PostHog 的 `signup` 事件改为在首次写入 `signup_ip` 时发送，这样被限制的账号也会计入。
    - 被限制的账号在账号页显示一句说明，中英文都要有。
- **站内工单**（T27，Owner 2026-11-06 定，详细设计见 `docs/proposals/admin-roadmap.md` A8，本节是规范口径）：
  - **用户侧入口**：账号页的「Help & feedback」和页脚的「Contact」。付费墙、`/pricing`、订阅区块里不放任何退款入口。
  - **提交工单**：
    - 类型并列成一个普通列表，按顺序是：意见反馈、出图问题（可选附一张自己的作品）、付款问题（可选附一笔自己的付款）、退款申请（必须选一笔自己的付款）、账号问题、其他。退款申请的样式和其他项一样，不做突出。
    - 正文不超过 2000 字，不收附件。
    - 「我的工单」里能看到状态（已提交 / 已回复 / 已关闭）和往来消息，用户可以在工单里补充。
    - 中英文文案都要有，页面 `noindex`。
  - **退款全部人工处理**：后台打开退款工单时，显示这笔付款的信息、`refund_eligibility(payment_id)` 给出的三项参考检查（是否首次购买、是否在 7 天内、付款后是否用过任何积分），以及建议退款金额（税前价 × 94% + 全部税额，Owner 可以改）。Owner 选择同意（填金额）或拒绝，写回复，系统记审计日志 `decide_refund`。Owner 到 Stripe / Waffo 后台完成退款，退款回调更新付款状态，然后提示扣回积分。**不写任何自动退款或会动钱的代码。**
  - **数据**：
    - `support_tickets` 表：`id`、`user_id`、`type`（`feedback` / `image_issue` / `billing` / `refund` / `account` / `other`）、`status`（`open` / `replied` / `closed`）、`payment_id`、`job_id`（都必须是本人的）、`refund_decision`、`refund_amount_cents`、`created_at`、`last_message_at`、`user_seen_at`、`closed_at`。
    - `support_ticket_messages` 表：`id`、`ticket_id`、`author`（`user` / `admin`）、`body`（不超过 2000 字）、`created_at`。
    - RLS：用户只能读自己的工单，写入只经服务端。删号时工单一并删除。
    - 索引：`support_tickets(user_id, created_at desc, id desc)`；部分索引 `support_tickets(last_message_at desc, id desc) where status = 'open'`；`support_ticket_messages(ticket_id, created_at)`。
    - 函数（都只授权 `service_role`）：`create_support_ticket`（按账号限频，24 小时内最多 5 张）、`add_ticket_message`、`admin_reply_ticket`、`admin_decide_refund`、`admin_list_tickets`（游标分页）、`refund_eligibility`、`mark_ticket_seen`。
  - **通知**（Owner 定：不发邮件）：
    - Owner 侧：后台导航「工单」旁显示待处理数，概览的「待处理」条里也计入。
    - 用户侧：最后一条消息是 Owner 发的、且晚于 `user_seen_at` 时，账号 tab 和「我的工单」显示小红点。只在页面加载时查一次，不轮询，也不用 Realtime。
    - 提交成功页写一句回复时效（「通常 48 小时内，会员按档位更快」），时效数字从会员权益表读。
  - **条款**：
    - 退款政策改成「在网站的 Help & feedback 里提交退款申请，也可以发邮件」，审核规则不变：7 天内、首次购买、付款后没用过积分、扣 6% 手续费。
    - 隐私政策加一句：工单内容保留到删号为止。
- **收入口径**（T10 后续，总控 2026-11-06）：
  - `admin_revenue_stats` 改为读 `payments`。函数签名不变，用 `create or replace` 修改；这是「一次写成」的例外，原因是 T23 写这个函数时数据源还不存在。
  - 收入按净额计：`amount_total − amount_tax − amount_refunded`，只汇总 `currency = 'usd'` 的行，返回结构不变。
  - Adaptive Pricing 下买家看到的本币金额只在 Stripe 的 `presentment_details` 里；session、charge、invoice 上的 `amount` 和 `currency` 仍是我们定价用的美元，`payments` 直接记这些值即可。
- P1 和 P2 项（模板表现、毛利、真实 token 用量、失败分析、审计日志查看页、运行时开关、Graylum 统计、代删账号、作品审核队列、CSV 导出等）上线后按提案排期，不在 v1 范围。

**仍然不做页面、留在 Supabase / Stripe 后台的运营操作**：设为管理员（在 Studio 改 `profiles.role`）、退款（在 Stripe / Waffo 后台）、作品审核页（第 6~7 周和审核功能一起做）。

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
  2. 首屏生成器 + 前后对比图（Owner 2026-11-05）：首屏就能出图——上传照片 → 选模板（默认模板与首屏演示一致，暂定 Pure White，Owner 可在后台改）→ 可选「Anything to change?」→ "Generate · 2 credits"；结果直接显示在首屏对比图里。未登录时先弹出登录抽屉，登录后回到首页继续。生成器是客户端组件，首屏正文（H1、副标题、直答块）仍是服务端渲染、源码可见（建站规格 R5）。首屏下方的第一组演示是「一张手机照片 → 一整套图」（Owner 2026-11-05）：同一件商品从随手拍的杂乱桌面照 → 白底主图 / 生活场景 / 促销海报，并写一句「请摄影师拍这一套要 $___」（金额从配置读）；不再用画风迁移做首屏默认演示
  3. 精选模板网格：按第 5 节的 6 个分类分组，每个分类一个 H3，每个模板的名称和用途说明都写在源码里（建站规格 §4 首页骨架 H2-2）
  4. 可核验事实块：免费额度、每张消耗、三档像素、上传限制、出图耗时（建站规格 G4 通用事实）
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

v1 不做：积分引擎抽象层、积分过期和批次、订阅的宽限期 / 自动扣回 / 升级降级 / 优惠券 / 自写取消界面、Waffo 订阅、自动故障切换、自动退款、保留期定时任务、提醒邮件、内容审核、作品审核页、第 10 节表格以外的后台页、英文和简体中文以外的语言（`/ja`、`/id` 等，见建站规格 §6）、多行菜单 / 价格单的排版功能（单张促销海报模板要做，见第 5 节）、视频生成实现、服务端 HEIC 转码、原图存储、断点续传、PWA / 离线、需求墙的评论 / 通知 / 重复合并 / 分类筛选。

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
| `GET /api/partner/account` | `{ credits_remaining, free_credits_remaining, paid_until, top_up_url }`（两个池分开给，Graylum 据此提示这一单会不会是带水印的免费作品） |
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

- 位置：`(app)` 壳第四个 tab **Wishlist**（DESIGN.md 第 8.2 节），`noindex`，只有登录用户可见。整个功能受 `site.config.features.wishlist` 控制（第 15.6 节）。
- **门槛**：至少成功出过 1 张图（`generation_jobs` 有 `succeeded`）的账号才能发帖和投票。未达门槛的账号能看墙，按钮灰掉并提示先出一张图。
- 发帖：自然语言描述（≤300 字）+ 参考图 1～3 张。不选分类、不写标题、不出现 prompt 一词。参考图复用第 8.2 节的上传链路（浏览器压缩 + 直传），存 R2 `requests/{user_id}/{uuid}.jpg`，不设过期；被拒或下架时服务端删除。
- 状态机：`pending`（提交后，只有本人可见「审核中」）→ `live`（Owner 通过，上墙）→ `shipped`（模板做出来了，关联 `template_id`）；或 → `rejected`（本人在「My requests」里看到，不显示原因）；`live` 可被 Owner 下架回 `rejected`。
- 墙：卡片 = 参考图 + 描述 + 脱敏用户名（显示名首字 + `***`）+ 「I want this too」按钮和计数。默认按票数倒序，其次按时间。一个账号一票，再点取消。`shipped` 的卡片置顶显示「Shipped →」直接跳到该模板。
- 「My requests」：本人的全部需求和状态。
- 空状态：一句「Tell us what template you need」+ 发帖按钮。墙空着没关系，不做冷启动数据。

### 15.2 后台

第 10 节的第二页。拦的东西：垃圾、无关内容、差评、色情、版权有问题的参考图。Owner 每天看一次，所以**审批前置**是有意的，不做「先上墙再下架」。不做重复合并：同是「外卖菜单海报」可能是十种风格，Owner 人工判断。

### 15.3 数据

（总控 2026-11-06 按 T12 的设计补全）

- `template_requests`：`id`、`user_id`、`description`（≤300）、`image_keys text[]`、`status`（pending / live / rejected / shipped）、`template_id`（可空）、`votes_count`、`author_label`、`created_at`、`reviewed_at`。
  - `author_label`：发帖时在 SQL 里生成，取显示名首字加 `***`，没有显示名就用邮箱首字。墙上只读这一列，任何查询都不碰 `auth.users`。
  - 约束：
    - `rejected` 时 `image_keys` 为空（参考图已删），其他状态 1～3 张；
    - `shipped` ⇔ `template_id` 非空；
    - `pending` ⇔ `reviewed_at` 为空；
    - `shipped` 只能从 `live` 转过来。
- `template_request_votes`：`request_id`、`user_id`、`weight smallint`，`(request_id, user_id)` 联合唯一。`weight` 是投票那一刻按 `current_tier()` 快照的票数（Max 为 3，其余为 1）；取消投票按快照的票数减，会员到期也不会让计数虚高。
- `votes_count` 由 votes 表的 insert / delete 触发器维护，等于该需求所有 `weight` 之和。投票人删号、级联删票时，计数同步减。
- RLS：`live` / `shipped` 对所有登录用户可读；`pending` / `rejected` 只有本人和 admin 可读；写只经服务端。
- SQL 函数（全部只授权 `service_role`）：
  - `wishlist_eligible(user)`：是否至少成功出过 1 张图；
  - `create_template_request(user, description, keys)`：函数内检查门槛、封禁、按账号限频（24 小时内最多 5 条）；
  - `toggle_template_request_vote(request, user)`：只限 `live`，有票删票，没票按快照 `weight` 插入，函数内检查门槛；
  - `admin_review_template_request(request, status, template_id)`；
  - `admin_list_template_requests()`：带邮箱，后台用。
- 参考图：浏览器先走现有 `/api/uploads` 传到 `inputs/`（没发帖的 7 天后自动清）。发帖时服务端用 `sharp` 重新编码，去掉 EXIF / GPS 后写到 `requests/{user_id}/{uuid}.jpg`，因为墙上的图别人看得到。被拒、下架、删号时服务端删除。

### 15.4 不做

评论、任何通知或发信、重复合并、分类和筛选、公开（未登录）页面、SEO、点赞以外的任何互动、拒绝原因。

### 15.5 条款

服务条款加一句：上传的参考图由上传者负责，我们可以不经说明下架。隐私政策写明：需求参考图保留到需求被拒、下架或账号删除为止；墙上只显示脱敏用户名。

### 15.6 开关（Owner 2026-11-05 决定）

需求墙是一个**可整体关闭的功能**，不是产品的固定部分：这个仓库当模板开视频站时，视频站不需要它。

- 开关在 `site.config.ts`：`features: { wishlist: boolean }`。和 `modules`、`gallery.enabled` 一样是建站时的配置，不是运行时后台开关——「关不关」是每个站建站时定一次的事，放配置最省（不用设置表、不用缓存、build 时就能裁掉）。
- `features.wishlist = false` 时：tab bar 只渲染三项；`app/(app)/wishlist/*` 和 `app/api/wishlist/*` 返回 404；后台的需求审核页不出现在后台导航且直接 404；`template_requests` 两张表的迁移仍然跑（表空着无害，避免模板站的迁移序列分叉）。
- 判断只在一处：`core/wishlist/index.ts` 导出 `isWishlistEnabled(site: SiteConfig)`，**配置由调用方传入**（core 不能 import `site/`，写法同 `core/config` 的 `isModuleEnabled(site, id)`）；`features` 的类型加在 `core/config/define-site.ts`。路由、layout、后台导航都调它，不准各自读 `features.wishlist`（总控 2026-11-05 补）。
- 以后真需要「上线后临时关掉」（例如垃圾内容太多）再加运行时开关，一个 `system_settings` 行，一小时的事；v1 不做。

## 16. 埋点与错误监控（Owner 2026-11-05）

只用两家：PostHog（美国区，项目 712352）做产品和流量分析，Sentry 做错误告警。代码统一放 `core/analytics/`，页面和接口只调用 `track()` / `captureError()`，不准各自直接引 SDK。

### 16.1 PostHog 配置

- 无 Cookie：浏览器端 `persistence: 'memory'`，不写 Cookie、不写本地存储，所以不弹 Cookie 同意框。登录后用 Supabase 用户 id `identify`，未登录只按会话统计。
- 不开录屏（Session Replay），上线后看漏斗需要时再由 Owner 决定开启（届时要遮挡图片和输入框、改隐私政策）。自动记录点击、热力图、Web Vitals 打开（PostHog 后台已开）。
- 走同域代理：`/ingest/*` 改写到 `us.i.posthog.com`，减少广告拦截造成的丢数。
- 公开变量：`NEXT_PUBLIC_POSTHOG_KEY`、`NEXT_PUBLIC_POSTHOG_HOST`（已在 Vercel 三个环境配好）；服务端用同一个项目密钥发事件。
- 不发任何个人信息：事件属性里不准出现邮箱、文案原文、补充说明 `note`、图片地址、提示词。

### 16.2 事件字典（名字和属性固定，改动走 [spec] PR）

| 事件 | 在哪发 | 属性 |
|---|---|---|
| `signup` | 服务端：邮箱验证完成 / 首次 Google 登录时（和注册赠送同一处） | `method`（`email` / `google`） |
| `upload` | 浏览器：直传 R2 成功后 | `size_bucket`（`<1MB` / `1-5MB` / `>5MB`）、`compressed`（是否走了浏览器压缩） |
| `generate` | 服务端：任务结算后（成功或失败都发） | `template_id`、`category`、`resolution`、`credits_cost`、`credit_pool`、`status`、`error_code`、`source`（`web` / `graylum`）、`duration_ms`、`model`（实际调用的模型名，不含密钥和地址）、`batch_size`（单张为 1，T28 起） |
| `paywall_view` | 浏览器：付费墙打开 | `trigger`（`insufficient_credits` / `pricing_page` / `account` / `graylum` / `tier_required`） |
| `checkout_start` | 服务端：创建 Checkout Session 时 | `product_id`、`tier`、`interval`、`form`、`channel`、`method` |
| `purchase` | 服务端：支付回调入账成功后 | 第 6.2 节 `purchase` 参数 |
| `$pageview` | 浏览器：自动 | — |

所有事件都带 `locale`（`en` / `zh`，浏览器端注册为公共属性，服务端发时从请求或 `user_metadata.locale` 取；Owner 2026-11-06）。钱和积分相关的事件（`signup`、`generate`、`checkout_start`、`purchase`）一律服务端发，保证不被广告拦截漏掉；发送失败只记日志，不影响业务。

### 16.3 Sentry

- 前后端都接 `@sentry/nextjs`；`NEXT_PUBLIC_SENTRY_DSN` 公开，`SENTRY_AUTH_TOKEN`（上传源码映射）放 Vercel 加密变量。
- 必须告警的：出图失败率异常、支付回调验签失败或处理失败、`charge.refunded`、退回积分失败（第 4 节 refund 失败会让积分卡在预扣状态）。
- 上报前去掉邮箱、令牌、提示词（复用 `core/logger` 的打码规则）。

## 17. 多语言：英文 + 简体中文（Owner 2026-11-06）

**v1 上线只做英文和简体中文两种语言。中文只覆盖用户使用主路径上的核心页面**（Owner 2026-11-06 确认清单），其余页面上线时只有英文：

| # | 中文页面 | 用途 | 收录 |
|---|---|---|---|
| 1 | `/zh` | 首页（含首屏生成器） | 收录，主词「ai改图」 |
| 2 | `/zh/image-to-image-generator` | 图生图工具页 | 收录，主词「图生图」 |
| 3 | `/zh/pricing` | 价格页（只写美元，不出现人民币） | 收录，主词「Shotviva 价格」 |
| 4–7 | `/zh/signup`、`/zh/login`、`/zh/reset`、`/zh/reset/update` | 注册、登录、找回密码 | noindex |
| 8–9 | `/zh/generate`、`/zh/generate/[templateId]` | 创作页、工作台 | noindex |
| 10–11 | `/zh/photos`、`/zh/photos/[jobId]` | 我的作品、结果与分享 | noindex |
| 12 | `/zh/account` | 账号 | noindex |
| 13 | `/zh/wishlist` | 需求墙（开关打开时） | noindex |
| 14 | `/zh/connect/graylum` | Graylum 连接授权 | noindex |

不是独立页面但同样做中文：付费墙抽屉（写「支付宝」）、四封认证邮件、404 和错误页、页头页脚、语言切换器和「切换到中文」提示条、模板名称和说明。

**上线时只有英文**：
- 四个法律页。
- 全部 SEO 内页和博客（`/commercial-photography`、`/ai-restaurant-menu` 等）。
- 后台：本来就只有中文。

SEO 内页的中文版不批量做。哪一页的英文版在 GSC 里出现中文查询的真实展示或点击，才单独提一张卡给它做中文版（建站规格 §6.1）。

没有中文版的页面：
- 不输出指向 `/zh` 的 hreflang；
- 不显示「切换到中文」提示；
- 语言切换器的「中文」指向 `/zh` 首页。

- **地址**：英文不带前缀（`/pricing`），中文带 `/zh`（`/zh/pricing`）；slug 两种语言都用英文（建站规格 R4、§6）。`<html lang>`：`en` / `zh-Hans`。
- **怎么选语言**：不做自动跳转，也不按 IP 判断（建站规格 §6）。浏览器首选语言是中文、又打开了英文页的访客，页面顶部出一条可关闭的「切换到中文」提示，点了才跳到对应的 `/zh` 页；语言切换器在页头 / 页脚，是真实的 `<a href>`。用户选过的语言存在 `NEXT_LOCALE` Cookie（功能性 Cookie，不用于统计，隐私政策写明），之后访问不再提示。登录后的应用页按 Cookie / 当前地址的语言显示。
- **文字放哪**：界面文字 `site/messages/en.json` + `zh.json`（next-intl，组件里不准写死）；营销页正文按语言放 `site/content/`；模板名称和说明在 `templates.translations`（第 5 节）；数字、价格、日期用 next-intl 格式化。价格两种语言都是美元，口径与英文完全一致（建站规格 G3）。
- **中文怎么写**：直答块、FAQ、页面标题按中文用户的真实问法重新写，不机器直译（建站规格 G13）；Owner 审阅后上线。
- **SEO**：中文页只做 Google，不做百度（美国主体办不了 ICP 备案，Owner 2026-11-06）。`/zh` 下的可收录页面必须在中文口径主词表里（T22 产出），不在表里的 `/zh` 页 `noindex`；hreflang `en` / `zh-Hans` / `x-default`（指向英文）互指；每种语言独立 sitemap。中文 SEO 的写法规则见建站规格 §6.1。
- **付款**：中文页付款方式写「支付宝」，英文页写 "Alipay"（DESIGN §4.5）；Stripe Checkout 托管页传 `locale`（`en` / `zh`）。
- **法律页**：上线时只有英文。以后要做中文版时，它是英文版的翻译，页首注明「本中文版本仅供参考，如与英文版本不一致，以英文版本为准」，律师审英文版。
- **邮件**：见第 7 节，按 `user_metadata.locale` 发中文或英文。
- **字体：中文用小米 MiSans，照 Graylum 的做法移植**（Owner 2026-11-06；参考 `seo资料/全站中文字体.md`，以及 Graylum staging 分支的 `apps/web/public/fonts/misans/`、`src/components/misans-font.tsx`）：
  - **文件**：官方未修改的静态 WOFF2 分包（简体中文 + 拉丁，400 / 500 / 600，约 168 个文件、5.8 MB），放在 `public/fonts/misans/`。
    - 同目录保留 `manifest.json`（每个文件的来源、unicode-range、字节数、SHA-256）、汇总 CSS、`LICENSE.pdf`、`NOTICE.txt`、`README.md`。
    - 文件名用内容哈希，不重新生成，也不重新子集化。
  - **加载**：根布局挂一个客户端组件。hydration 后等两帧（两次 `requestAnimationFrame`），再往 `<head>` 插入 `<link rel="stylesheet" id="misans-font" href="/fonts/misans/misans-<hash>.css">`，用 id 防止重复插入。
    - 汇总 CSS 里每个 `@font-face` 都带 `unicode-range` 和 `font-display: swap`。
    - 首屏先用系统字体，浏览器只下载页面上实际用到的分包。
    - 不 preload，不用 Google Fonts，也不用任何 CDN。
  - **缓存**：只给 `/fonts/misans/*.woff2` 和 `*.css` 发 `Cache-Control: public, max-age=31536000, immutable`，NOTICE、PDF 不加。改字体必须换新哈希 URL。
  - **路由**：中间件（`src/proxy.ts`）的 matcher 排除 `fonts/misans/`。这个目录不放私密文件。
  - **署名（协议要求）**：写在条款页的「Third-party notices」一节：「本网站使用 MiSans 字体，版权归小米所有」（英文写 "This site uses the MiSans font, © Xiaomi."），并链接 `/fonts/misans/LICENSE.pdf`。页脚不放（Owner 2026-11-06，DESIGN §6.9）。
  - **授权边界**：
    - MiSans 只用于网页显示。服务端往图片上画字的地方（如水印 "Made with Shotviva"）不用 MiSans，以免变成「把字体嵌入导出文件」。
    - 字体文件放在私有仓库，通过网站对外提供，和 Graylum 一样；律师审法律页时一并确认协议里的「再分发」条款（LAUNCH §8）。
- **已知限制（写进 FAQ）**：中国大陆用户不开 VPN 用不了 Google 登录，用邮箱注册即可。

