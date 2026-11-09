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
    channels: { primary: 'stripe', fallback: 'waffo' },   // 第 6.3 节：Waffo 兜底，卡订阅 + 支付宝单笔
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

- `image` 模块：支持 OpenRouter 专用图片接口（`/api/v1/images`），也支持 OpenAI Images 接口（`/v1/images/edits`、`/v1/images/generations`；官方地址或兼容这套接口的中转地址都能用）。**用哪个供应商、哪个模型，从 T17 起在后台配置**（第 3.3 节）；环境变量 `OPENAI_API_KEY` / `OPENAI_IMAGE_MODEL` 只在后台没有启用任何供应商时兜底。环境变量的说明（原文）：`OPENAI_IMAGE_MODEL`，默认值由 Owner 定（代码里当前默认 `gpt-image-2.5-sunburst`；GPT Image 2.6 已于 2026-11-04 上线、同价、更快；Owner 2026-11-05 评估 2.6 对人物五官的保持很强，默认用哪个仍由 Owner 在环境变量里定）。底座的 fal / KIE / WaveSpeed / Atlas 适配器不搬。
- `video` 模块：只有接口类型，`site.config.ts` 里是 `false`，不写任何视频页面。

### 3.3 出图供应商配置（后台，Owner 要求：随时换供应商和模型，不改代码、不重新部署）

**表 `ai_providers`**（私有：开 RLS、拒绝所有客户端，只有服务端 service role 读写，和 `template_prompts` 一样）：

| 字段 | 说明 |
|---|---|
| `id` | uuid |
| `module` | `'image'`；`'decision'`（作品编辑判断改动范围用，T30，§5.2）；以后视频再加 |
| `adapter` | 出图用 `'openai_images'` 或 `'openrouter_images'`；`'openai_responses'`（OpenAI 官方 Responses API，作品编辑判断用，第一版模型 `gpt-6-luna`，Owner 2026-11-06）。OpenRouter 图片目录内的模型共用同一适配器，可直接在后台切换 |
| `label` | 后台显示名，如「OpenAI 官方」「某中转」 |
| `base_url` | 接口根地址，OpenRouter 默认 `https://openrouter.ai/api/v1`，OpenAI 默认 `https://api.openai.com/v1`；只允许 `https://`，拒绝 localhost、内网和保留地址 |
| `model` | 模型名，如 `gpt-image-2.6`、`google/gemini-2.5-flash-image` |
| `resolutions` | 支持的清晰度，非空 text[]，默认 `{1k,2k,3k}`。模板或试跑指定该模型时按此判断能否出当前清晰度 |
| `capabilities` | jsonb，默认 `{}` 表示等待首次刷新。记录本站支持的 `resolutions`、固定 `aspectRatios`、是否支持原图比例 `originalRatio`、参考图数量上下限 `minReferences/maxReferences`、最后成功时间 `fetchedAt`。OpenRouter 另保留目录原始固定比例 `providerAspectRatios`，用于后台和伙伴接口。 |
| `estimated_image_costs` | jsonb，管理员按清晰度填写的单张美元成本估值，供 §6.1 样本不足时使用。 |
| `vault_secret_id` | 密钥存在 **Supabase Vault**（`vault.secrets`，由 Supabase 在库内加密），表里只存它的 id。Owner 2026-11-06 改定，和 Graylum 一样；取代原先「应用用 `PROVIDER_SECRETS_KEY` 做 AES-256-GCM」的做法，不再需要任何应用侧加密密钥 |
| `api_key_last4` | 密钥后 4 位，后台列表里显示用 |
| `is_active` | 当前在用；同一个 `module` 最多一条为 `true`（部分唯一索引） |
| `price_input_text_per_m` / `price_input_image_per_m` / `price_output_per_m` | 美元 / 百万 token 的单价，后台填（按 OpenAI 价目页）；用来把每单用量算成 `cost_usd`。`decision` 供应商同样填输入和输出单价（T33） |
| `notes` | 备注 |
| `created_at` / `updated_at` / `updated_by` | 审计 |

**删除供应商**（Owner 2026-11-06）：后台供应商列表每行有「删除」，二次确认后调用 `admin_delete_provider(p_id)`：被 `template_prompts.provider_id` 引用的供应商须先解除绑定；在用的那一行不能删（先把另一条设为在用，或先停用再删）；删除时连同它在 Vault 里的密钥一起删掉，在同一个事务里完成。出图记录里的 `provider` 是文字快照，删除不影响历史记录和成本。迁移编号段 `0300`～`0319`。

切换在用的供应商用 SQL 函数 `admin_activate_provider(p_id)`：同一事务里把同模块其他行设为 `false`、这一行设为 `true`。

**出图时怎么选**：前台模板出图优先用 `template_prompts.provider_id` 指定的 image 供应商（可未启用）。该字段为空时，走默认供应商：取 image 模块的 `is_active` 行，无在用行时沿用环境变量。作品编辑和伙伴出图只走默认供应商；换脸判断按 decision 模块取在用行。服务端在扣积分前按有效能力校验比例和清晰度，非法请求返回 `INVALID_INPUT`。已允许的请求遇到上游目录变化或暂时不可用时，保留按实际供应商记账的备用路径。后台改供应商后使 `providers` 缓存失效，密钥按次读取。实际调用的供应商和完整模型名以 `<供应商 id 或 env>/<模型名>` 记入 `generation_jobs.provider`，按供应商、模型和清晰度分别统计。模板 `model_params.model` 不参与选型。

**OpenRouter**：出图统一走 `POST /api/v1/images`，通过 `input_references` 提交参考图，读取 `data[0].b64_json`。本站 1K、2K、3K 档对应 `resolution` 的 1K、2K、4K，跟随照片时传 `aspect_ratio: auto`，输出格式为 PNG。3K 档交付时缩回本站目标像素。OpenRouter 不使用 OpenAI 的 `quality`、`input_fidelity`、`background`。原始 `prompt_tokens`、`completion_tokens`、`cost` 记入 `provider_usage`；响应的美元费用乘以 1.055 计入 `cost_usd`（充值手续费）。缺少费用时记录警告，按已有 token 和配置单价估算。积分仍按第 6.1 节的价格和下限。

**后台页 `/admin/providers`**（中文界面）：
- 列表：显示名、适配器、地址、模型、密钥后 4 位、是否在用、更新时间。
- 新增 / 编辑：密钥框只写不读，留空表示不改；保存后浏览器拿不到明文。OpenRouter 保存供应商时读取 `GET {base_url}/images/models` 更新能力。目录中的 1K、2K、4K 映射为本站 1k、2k、3k，未声明清晰度参数时只提供标准档。只有声明 auto 才支持原图比例。OpenAI 图片适配器提供全套站内选项。手动「刷新能力」和每日带 CRON_SECRET 的刷新均同步旧 resolutions 字段，失败保留最后成功的能力及时间。
- 「测试连接」：OpenRouter 查询同一图片目录并用该行密钥调用免费的鉴权接口；其他适配器沿用 `GET {base_url}/models`。测试连接不产生出图费用。
- 「设为当前使用」：弹窗确认「从 A 换到 B」，写一条日志（logger，不含密钥）。
- 模板编辑页展示当前所选模型的能力、参考图上限与最后刷新时间。

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
| template_id | 用的模板（作品编辑用内置模板 `edit`，§5.2） |
| parent_job_id | 作品编辑时，被编辑的那张作品的 id（同一用户的成功作品）；模板出图为空。外键 `on delete set null`（T30） |
| inputs | 用户填的内容（文案、比例、**分辨率 `resolution`：`'1k'` / `'2k'` / `'3k'`**、可选补充说明 `note`（≤300 字符，工作台「Anything to change?」，服务端拼在模板提示词之后，作为用户内容存档）、模板开关 `toggles` / `toggles_confirmed_at`（T89，见 §5.1c）、输入图在 R2 的 key），**不含封装提示词**。伙伴接口（第 14 节）v1 固定 `'1k'`，契约不加字段 |
| provider | 实际调用的供应商和模型：`<ai_providers.id 或 env>/<模型名>`（第 3.3 节） |
| provider_usage | 供应商返回的用量（jsonb）：出图的 `input_text_tokens`、`input_image_tokens`、`output_tokens`；作品编辑另记判断那一步的 `decision_input_tokens`。供应商没返回就为空（T33） |
| cost_usd | 这一单的真实成本（`numeric(10,6)`）= 用量 × 结算时在用供应商的单价快照；以后改单价不影响历史。没有用量或单价没填就为空，后台标「无法计算」（T33） |
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
  - **英文说明**（Owner 2026-11-07 补）：`templates` 加 `description`（可空，≤160 字），后台模板编辑页在英文名称下面加「英文说明」输入框，和「中文说明」并排。凡是显示模板说明的地方（模板卡、创作弹窗、工作台标题下、落地页模板列表），英文页显示 `description`，中文页显示 `translations.zh.description`，中文缺失时回退英文说明；两者都空就不显示。说明不自动翻译。迁移编号段 `0380`～`0399`（T52）。
- `template_prompts`（私有，只有服务端能读，RLS 拒绝所有客户端）：模板 id、提示词正文、版本号、模型参数、可空外键 `provider_id uuid`（只允许 `ai_providers.module = image`，见 §3.3）。后台「出图模型」可选跟随默认或某一条 image 供应商。创作页和首页只接收 `template_image_options` 的三个公开字段：可用清晰度、固定比例和是否支持原图比例。后台专用的供应商信息、成本与提示词保持私有。旧调用保存提示词时省略该字段会保留已选模型，显式传 null 才恢复默认。
- `template_prompts.style_refs jsonb not null default '[]'`（T97）：最多 3 个有序的 `{key,width,height,uploadedAt}`。每个 key 只属于本模板的私有桶前缀。编辑器显式传空数组才清空，旧版保存和模板同步省略时保留目标环境的参考图。修改参考图或顺序即递增提示词版本；服务端按模板和版本按需读图缓存。
- 首次、批量、再来一张和伙伴出图都先放用户照片，再放这一版本的画风图；作品编辑不附图，画风图不进入用户输入审查。`{{photo_count}}` 和 `{{style_ref_count}}` 分别渲染实际发送的两类张数。保存时，用户照片的最少和最多张数分别加上固定画风图张数，两端都须落在 T96 模型输入范围内。例如模型至少需要 1 张输入图，模板固定提供 1 张画风图时，用户可以上传 0 张照片。出图遇上限变化先回退默认供应商，仍超限则只带用户照片并记警告。实际使用的有序 key 只在 `generation_jobs.inputs.style_ref_keys` 留档，含私有 key 的作业禁止客户端直读，服务端按所有者与删除状态过滤后返回安全投影。


站内固定比例取第 4.3 节选择器和模型能力的交集。缺少原图比例时按输入图片尺寸选最近比例，只有一档清晰度时隐藏选择器。首次刷新前没有可用能力的 OpenRouter 模板暂时无法出图。伙伴请求固定标准档，比例取模板 `fields.aspectRatios` 与可用模型比例的交集，保留模板顺序。交集为空时目录隐藏该模板，直接生成返回已有的不支持错误。

内置一条 `freeform` 模板：字段定义只有 `prompt`（加可选参考图），`template_prompts` 里的提示词是直通。它让「自由文字出图」和「模板出图」走同一条代码路径；`visible_in = ['partner']`，Shotviva 自己的前台不展示（DESIGN.md 禁止出现 prompt）。

仓库里只放模板的字段结构和种子数据格式。种子提示词放在不进 git 的本地文件里，用脚本导入数据库。

### 5.1b 收藏模板（Owner 2026-11-08，T83）

模板多了以后好找。每个模板卡片和模板弹窗上有一个收藏按钮（心形，点一下收藏、再点取消，立即生效、乐观更新）。
- **在哪看**：创作页的模板分类条最前面加「收藏」（中文）/ "Saved"（英文），有收藏时才显示，点开只列收藏的模板，最新收藏的在前，点模板直接打开创作弹窗；首页生成器的模板选择器里，登录用户同样有这一项。
- **未登录**：点收藏先去登录，登录回来自动把这个模板收藏上。
- **数据**：新表 `template_favorites(user_id, template_id, created_at)`，主键 `(user_id, template_id)`，RLS 只能读写自己的行，每人最多 200 个；模板下架或改成只给伙伴用时不在收藏里显示（行保留，重新上架后回来）；模板删除时级联删除；删号时随账号删除。
- 收藏只影响登录用户自己的页面，模板目录和首页的服务端缓存不变（收藏列表在客户端或按用户单独读取，不进公共缓存）。
- 埋点 `template_favorite`（`template_id`、`category`、`action = add / remove`、`surface`）。迁移编号段 `0740`～`0759`。

### 5.1c 模板开关（Owner 2026-11-08，T89）

模板可以给用户几个开 / 关选项，第一个是餐饮菜品的「优化摆盘和器皿」/ "Upgrade plating & tableware"。哪些模板配由后台定，代码里不按分类写死。

**数据定义**

- `templates.fields.toggles`（公开，可选，默认 `[]`，最多 3 个）：每项 `{ key, label, hint?, default, confirm? }`。
  - `key`：`^[a-z][a-z0-9_]*$`，不能和 `fields.copy` 的 key 重名，也不能是 `aspect_ratio`（同一套 `{{key}}` 占位符）。
  - `label`（英文，≤60）、`hint`（英文，≤200，可选）。
  - `default`：只能是 `false`。
  - `confirm`（可选）：开启前的确认框 `{ title ≤80, body ≤1200, checkbox ≤120, accept ≤40 }`，英文。确认框文字是模板数据，不写死在代码里。
  - 旧模板的 `fields` 没有 `toggles`，读出时按 `[]` 处理。
- `templates.translations.zh.fields.<key>`：开关的中文 `label`、`hint`、`confirm: { title, body, checkbox, accept }`，每一项缺了就回退英文，和文案字段同一个 `fields` 对象（文案字段用 `label` / `placeholder`）。
- `template_prompts.model_params.toggles.<key>`（私有）：`{ on, off }` 两段文字。`renderPrompt` 按用户的选择把对应一段放进正文的 `{{<key>}}`；没录的按空串（不会把占位符原样发给模型）。这两段只用来拼提示词，`model_params` 其余的键照旧交给出图供应商，`toggles` 不传过去。提示词片段不进仓库（测试用假片段）。
- 后台保存（`saveTemplate` 和导入脚本）：定义了开关却在提示词正文里没有 `{{<key>}}`，或缺 `on` / `off` 任一段（空白也算缺），拒绝保存（`INVALID_INPUT`，提示是哪个开关缺什么）。数据库函数 `admin_upsert_template` 不变，没有迁移。
- `generation_jobs.inputs`（只在模板有开关时写）：
  - `toggles: { "<key>": true | false }`：模板的每个开关都记，没开的记 `false`。
  - `toggles_confirmed_at: { "<key>": "<ISO 时间>" }`：带 `confirm` 的开关为开时，记服务端收到请求的时间。没有这样的开关时不写这个键。
- `admin_test_runs.inputs.toggles`：后台试跑的开关选择，结构同上（不记确认时间）。

**请求和规则**

- `/api/generate` 的 `inputs` 加 `toggles: { key: boolean }`（可选，缺的 key 按关）和 `toggles_confirmed: string[]`（用户在确认框里确认过的 key）。
- 服务端校验：key 必须属于该模板、值必须是布尔。带 `confirm` 的开关为开时，`toggles_confirmed` 里必须有它，否则 `INVALID_INPUT`，在扣积分之前拒绝。
- 浏览器只有在用户勾选并点了确认（或同一浏览器会话里这个模板确认过，sessionStorage；或「再来一张」沿用原作品已开启的选择）后才会把开关打开，所以会把开着的这类开关都放进 `toggles_confirmed`。
- 伙伴接口 v1 不收开关：请求里带了也丢掉，一律按关（§14.6 契约不变）。
- 后台试跑（§10.b）的开关直接开或关，管理员不弹确认框。
- 积分价格不变。开关不是用户写的文字，不送换脸判断（§5.1a）。作品编辑（§5.2）不受影响。

### 5.1a 禁止换脸：按用户输入的文字判断意图（Owner 2026-11-08，T81）

换脸、换身份一定要靠用户写字下指令，所以只审**用户输入、会送进出图模型的文字**，不碰模板提示词（不往模板里加任何「保持长相」之类的句子，以免把模型带偏），也不对图片做人脸检测或识别。多图参考（如同一商品多角度）照常可用。

- **审哪些文字**：工作台的补充说明、模板的文字字段（如海报标题、价格）、作品编辑的那句话、伙伴接口 `freeform` 的 `prompt`。任何一处命中就整单拒绝。
- **怎么判断**（Owner 2026-11-08 改：不靠穷举句子和关键词）：只用判断模型（第 3.1 节 `decision` 模块；作品编辑在原有的范围判断里一起回答，不多一次调用），不设关键词表。提示词是一段与语言无关的原则：只有「把一个人的脸或身份换成另一个人的（来自另一张图或某个真实人物）、在人与人之间换脸或融合脸、把人变成某个特定的真实人物」才拒绝；表情、妆容、发型、头饰、配饰、衣服、年龄感、光线、背景、画风等外观修改都放行；用户用什么语言写就按什么语言理解意图，拿不准时放行。提示词里最多放三四个简短示例，不列词表。中英文及其他主流语言的例句只作为评测集（录下真实判断结果在 CI 回放），不放进提示词。
- **结果**：拒绝时在扣积分之前返回，不扣任何积分，错误码 `IDENTITY_SWAP_REFUSED`，提示「为保护每个人的肖像权，Shotviva 不能把人换成另一个人或换脸。可以改表情、妆容、光线和背景。」（英文同义）；伙伴接口返回 422 和同一错误码。判断模型调用失败时放行并记日志（关键词那一步已挡掉明显的），不让出图整体不可用。
- **留痕**：每次拒绝写一条记录（用户、入口、命中方式、截断到 200 字的原文、时间），保留 90 天后删除；后台用户详情显示拒绝次数，24 小时内被拒 3 次及以上的账号在用户列表标红，是否封号由 Owner 决定。埋点 `generate_refused`（`reason = identity_swap`、`source`）。
- **条款**：使用规范写明禁止换脸、冒充他人或生成某个真实人物的仿冒图，违者可封号。
- 迁移编号段 `0700`～`0719`。

### 5.2 作品编辑（Owner 2026-11-06，T30）

用户在自己的作品详情页点「Edit」，写一句想改哪里，把这张作品当参考图再出一张。用户不会写提示词，没说出口的「其他地方别动」由我们补；但不能对每张图都硬塞「主体保持不变」，那会挡住用户真想做的大改动。所以先判断这句话要改的范围，再按范围加约束。

- **入口和界面**：作品详情页「Edit」按钮，打开编辑面板（手机底部弹出，电脑和创作面板同一个组件，设计由 T6 出稿）：一个输入框（标签 "What would you like to change?"，1～500 字符，任何语言）、清晰度（默认和原作品同一档）、本次花费；比例固定和原作品一样。只能编辑自己的、成功的作品；免费作品也能编辑。
- **编辑时可以换尺寸**（Owner 2026-11-06 签收 v3-b 稿，覆盖上面「比例固定」的说法）：编辑面板有和工作台相同的 8 个尺寸格，默认是原作品的尺寸；选了别的比例时 `/api/edit` 带 `aspect_ratio`，出图按新比例，提示词末尾加一段「把画面延展到新画幅，主体位置不变」的约束（同样放在 `edit` 模板参数里，后台可调，不进仓库）。价格不变，不加迁移（T47）。
- **一单 = 一次普通出图**：走内置模板 `edit`（`visible_in` 为空，不在目录里出现），`reserve_credits` 照常预扣，扣 `templates.credits_cost[resolution]`，默认和标准模板同价 2 / 4 / 6（Owner 2026-11-06，后台可改，不低于下限）；先付费池后免费池、按作品判水印的规则不变。新作品是一张独立作品，`parent_job_id` 指向原作品；原作品不动。编辑出来的作品可以再编辑。
- **第一步：判断范围**（`ai_providers` 里 `module = 'decision'` 的在用供应商；Owner 2026-11-06 定用 **GPT-6 Luna**（OpenAI Responses API，便宜、和出图同一个账户），不用 Decisions API，因为它写不出要保留的元素清单）：把原作品（低清晰度）、用户原话和判断指令送进去，用结构化输出拿回 `{ scope, confidence, keep, change }`：`scope` 是五种范围之一（只改某个物件或细节 `object` / 换背景或场景 `background` / 换风格、光线或色调 `style` / 换主体 `subject` / 整体重做 `global`），`confidence` 0～1，`keep` 是图里必须保持不变的具体元素（最多 8 个英文短语），`change` 是一句英文概括。推理用模型允许的最低档，每次 5 秒，超时、5xx 或连接中断时重试一次，仍失败用兜底并放行（Owner 2026-11-08，T81；放行次数在后台「AI 供应商」页统计）。`confidence` ≥ 0.5 才采用；否则、调用失败或超时，用「兜底」。判断指令放在 `template_prompts` 里 `edit` 模板的参数中，后台可改，不进仓库。判断这一步做成统一接口，按在用供应商的 `adapter` 选实现，以后换模型（例如 Claude Haiku）只加适配器、在后台切换。
- **第二步：出图**：`/v1/images/edits`，输入图是原作品在 R2 的无水印原图（服务端直接读，不经用户上传），提示词 = `edit` 模板的封装提示词 + 该范围的约束段落（`object` 和 `background` 两种范围把 `keep` 清单写进去，例如「Keep unchanged: …」；`subject` 和 `global` 不写）+ 用户原话（原文，不翻译）。约束段落一共六段（五种范围 + 兜底），也放在 `edit` 模板的参数里，Owner 在后台调，**不进仓库**。约束的意思举例：只改物件时「只改用户说的那个东西，其余所有元素保持一致」；换背景时「保留产品的形状、颜色、logo 和文字，背景按要求换」；换主体时「不要保留原主体」。模型支持时带 `input_fidelity: 'high'`（参数也在 `template_prompts`）。
- **存档**：`generation_jobs.inputs` 记 `instruction`（用户原话）、`edit_scope`（判出的范围或 `fallback`）、`confidence`、`keep`、`change`，供 Owner 调约束时看；不存封装提示词。判断这一步的 token 记进 `provider_usage.decision_input_tokens` / `decision_output_tokens`，按判断供应商的输入、输出单价算进这一单的 `cost_usd`（§10.0）。
- **不做**（第一版）：圈选区域（涂抹蒙版，第二版）；伙伴接口的编辑；批量编辑；翻译用户原话。
- **效果检查**：开发窗口在 PR 里贴中英文各 10 句典型说法的前后对比（例如「沙发换成蓝色」「背景换成海边」「把模特换成男生」「更亮一点」），供 Owner 看效果。这不是通过门槛：效果由 Owner 在后台调约束段落。

**模板分类由后台管理（Owner 2026-11-08，T75）**：分类不再写死在代码里（`TEMPLATE_CATEGORIES`、`messages` 里的 `app.categories`、`site/content` 两份分类说明都删掉，改从数据库读）。
- 新表 `template_categories`（公开读，只有管理员能写）：`key`（英文短标识，如 `food-drink`，建好后不能改，页面、埋点、缓存都认它）、`name_en` / `name_zh`（显示名，必填，英文 ≤ 32 字、中文 ≤ 12 字，各自不重名）、`intro_en` / `intro_zh`（首页分类说明，可空，空就不显示说明）、`sort_order`（决定创作页分类条和首页分组的顺序）、`card_style`（`pair` 并排对比 / `compare` 拖动对比；现在只有「画风」是 `compare`，原来按名字 `'Art Styles'` 判断的地方都改成看这个字段）。
- **先扩后收（总控 2026-11-08 审 #283 后改）**：`templates.category` 保持存英文名不动（旧版本代码照常工作），新增 `templates.category_key`（外键，非空，有索引），按现有值回填（匹配 key / 英文名（不分大小写）/ 中文名，都不匹配就新建一个分类，名称重复时加「 2」「 3」直到两种语言都不重名）；两个触发器保持同步：写 `category_key` 时把 `category` 改成对应英文名，只写 `category` 时解析出 key；分类改英文名时同步改模板上的 `category`。`edit`、`freeform` 是系统分类（`is_system`）：站内永不展示、分类管理里不显示、不能改名、删除或作为移入目标。新代码读 `category_key`；数据库还没迁移时退回读旧列（访客页面和出图照常，后台模板页要等迁移）。迁移 `0580`～`0583` 只加不改，正式库可以先迁移，回滚到上一版部署随时安全。模板编辑页只能从已有分类里选，去掉「新分类…」手填。**收尾**（T84，T75 上正式站并稳定一周后）：删掉 `templates.category`、触发器里按名称解析的分支和迁移前的兼容读取。
- 后台模板页加「分类管理」：列表显示每个分类的中英文名称、说明、样式、用到它的模板数；可以新增、编辑名称和说明、调整顺序、删除。
- 删除：没有模板用它就直接删；有模板在用，删除时必须选一个分类把这些模板（含未上架的）移过去，移动和删除在同一个事务里完成。至少保留一个分类。
- 改名只改显示，`key` 不变，所以 SEO 页面地址、PostHog 里的 `category`（从这一版起发 `key`）都不受影响。保存后 `revalidateTag('templates', 'max')`，和模板保存一样。
- 没有已上架模板的分类，在创作页和首页都不显示（规则不变）。迁移编号段 `0580`～`0599`。

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
    - 字段：`user_id`、`product_id`、`channel`（`stripe` / `waffo`）、`stripe_session_id` / `stripe_invoice_id` / `stripe_charge_id`（各自可空且唯一）、`waffo_order_id`（可空，**不唯一**，有索引：一张 Waffo 订阅订单每期都有一笔扣款）、`waffo_payment_id`（Waffo 的 `PAY_` 扣款号，可空、唯一；T50）、`amount_total`（实付，含税，单位为分，int）、`currency`、`amount_tax`（分）、`method`（`card` = MP 卡（海外银行卡）/ `alipay` / `wechat_pay`（T73）/ `cn_card` = 普通 Stripe 卡（中国银行卡，T64）；迁移只放宽 `payments_method_check`，不改函数；续费沿用订阅 metadata 里记的方式）、`status`（`paid` / `refunded` / `partially_refunded` / `disputed`）、`amount_refunded`（分，默认 0）、`created_at`。
    - 约束：Stripe 行至少有 session 或 invoice 之一；Waffo 行必须有 `waffo_order_id` 和 `waffo_payment_id`（T50 之前的老行可以没有 `waffo_payment_id`）。
    - 不回填 T10 上线前的历史付款。
  - **`settle_checkout` 改签名**：新增参数 `p_amount_total`、`p_currency`、`p_amount_tax`、`p_method`、`p_invoice_id`（可空）、`p_charge_id`（可空），在同一事务里写 `payments`。参数变了无法 `create or replace`，按 AGENTS §5「签名必须变」的例外，由新迁移删掉旧的 7 参数版本后重建，PR 写明原因；调用方同步改。
  - **`apply_subscription_renewal`**：参数为 `(user, product_id, invoice_id, period_end, amount_total, currency, amount_tax, method, charge_id)`。内部用 `_apply_credit_change`（kind `purchase`，幂等键 `renewal:<invoice_id>`），`paid_until = greatest(paid_until, period_end)`，同一事务写 `payments`。
  - **`sync_subscription(sub_id, status, current_period_end, cancel_at_period_end)`**：供 `customer.subscription.updated / deleted` 使用，只更新已有的镜像行，不新建（没有首付记录的订阅不插入）。
  - **`record_payment_issue(charge_id, kind, amount_refunded)`**：`kind` 为 `refunded` / `disputed`，按 charge id 更新 `payments.status` 和 `amount_refunded`（全退为 `refunded`，部分退为 `partially_refunded`，争议为 `disputed`），不动积分。charge 不在表里时不写行，只发 Sentry 告警，回 200。
  - **`settle_waffo_order(user, product_id, payment_id, order_id, amount_total, currency, amount_tax, method)`**（T13，总控 2026-11-06 补）：在同一事务里完成两步。先调用 `apply_purchase(user, product_id, payment_id)`，用 Waffo 的 payment id 做幂等键；入账生效时再插入一行 `payments`，其中 `channel = 'waffo'`，`waffo_order_id` 取 Waffo 订单号，金额和税额取自 `order.completed` 事件，单位换算为分。重复事件不写第二行。**T50 起**：签名不变，同时写 `waffo_payment_id`；单笔和订阅的每一期扣款（含首付）都走它，幂等键是 `PAY_` 扣款号，所以续费不会重复入账，续费失败没有扣款事件、不入账。
  - 以上函数都只授权 `service_role`。
- **首付的 `paid_until`**：首付走 `apply_purchase`，按商品天数累加（月付 +30 天，年付 +365 天），和 Stripe 本期结束日可能差一两天。从第一次续费起，由 `apply_subscription_renewal` 对齐 `period_end`，见下一条。
- 订阅续费走 T10 新增的 `apply_subscription_renewal(user, product_id, invoice_id, period_end)`：`credits += 商品积分`，`paid_until = greatest(paid_until, period_end)`（直接对齐 Stripe 的本期结束日，不按天数累加，避免大小月漂移）；同样写流水、按 invoice id 幂等，内部复用 `_apply_credit_change`（总控 2026-11-05 补）。
- 没用完的积分在续费时自然结转（积分不过期），不做「本期 / 结转」两本账。
- **计价单位是 credit，不是「张」。**（唯一例外：新用户赠送对外说 "3 free Standard images"，即 6 个免费 credit，见建站规格 G3。） 一次出图扣多少 = 模板在用户所选分辨率的配置值 `templates.credits_cost[resolution]`（第 5 节：`high` 模板默认 1K 2 / 2K 4 / 3K 6，`medium` 1 / 2 / 3），后台模板编辑页可改；会员每月发多少 credit、积分包多少 credit 写在 `site.config.ts`。前台后台都叫 credits，余额显示为 "30 credits + 3 free"。「重新生成」按同一模板、同一分辨率再扣一次。
- **配置下限（T96）**：按实际供应商配置、模型名和清晰度，取近 30 天成功出图中有成本记录的 p95。至少 10 个样本时使用实测值，样本不足时使用后台每档单张美元估价；OpenAI 可使用保守估价，并保留原质量档下限。最低积分为 `ceil(单张成本 × 1.10 ÷ C_max)`。C_max 由当前商品的最低每积分实收乘以 76.1%（扣除预计手续费、退款和返佣）和 40%（目标毛利 60%）得出。后台显示建议下限，保存或批量变更时按模型核对支持的档位。该计算不会修改已有模板的售价、用户积分或套餐。
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

- 年付积分 = 12 × 月付积分，一次发完。**年付折扣（Owner 2026-11-06 改价）**：Starter、Pro 按月价 × 12 打 8 折，Max 打 6 折，金额取整到美元：$191（省 20%）、$479（省 20%）、$713（省 40%）。年付最多省 40%，不得超过。改价在 Stripe 上是新建 Price 并用 `transfer_lookup_key` 接过 lookup key（Price 金额不可改），旧 Price 归档；Waffo 商品价格同步改。积分包每 credit 都高于所有订阅，**所有人可买，包括没买会员的**，所有通道都是单笔，不改 `paid_until`。注册赠送为 6 个免费 credit（以 `site.config.ts` 的 `billing.freeCredits` 为准），不计入毛利。
- 积分包不改会员期，但它发的是付费积分，用它生成的作品就是付费作品（无水印、私密、可商用），所以非会员买包也拿到完整权益——这正是「按作品判付费」要解决的事。
- 价格数字只写在 `site.config.ts`（第 2 节），付费墙、`/pricing`、FAQ、结构化数据都从配置读；建站规格 G3 同步。送 Stripe 时用整数分（`1990`）。
- **Stripe Product / Price 映射**：Starter、Pro、Max 各一个 Product（税码 `txcd_10105001`），每个 Product 挂 4 个 Price：月付 recurring、月付 one-time、年付 recurring、年付 one-time（同 id 的 recurring 和 one-time 价格相同）；三个积分包各一个 Product，只有 one-time Price。Price 的 `lookup_key` 固定为 `<product_id>`（one-time）和 `<product_id>_recurring`（订阅），服务端按 lookup key 取 Price，不把 Price id 写进代码或配置；每个 Price 的 `metadata.product_id` 也写上，回调反查用。
- **支付宝和微信支付放在同一个结账页**（Owner 2026-11-07 改，T73；原「不接微信支付」作废）：用户选「支付宝 / 微信支付」后进 Stripe 结账页，两种都列出，自己选。支付宝和微信支付在 Stripe 普通模式下都不支持订阅，所以钱包用户买会员买的是「一期」（`starter_monthly` 的单笔形态 = 30 天 50 credits），`paid_until` 到了自己再买。这不是功能缺失，是 Stripe 的限制，付费墙文案要说清楚（"Renews automatically" vs "30 days, no auto-renew"）。
- **PostHog `purchase` 事件参数**：`product_id`、`tier`（`starter` / `pro` / `max` / `pack`）、`interval`（`month` / `year` / 空）、`form`（`subscription` / `one_time`）、`channel`（`stripe` / `waffo`）、`method`（`card` / `alipay` / `wechat_pay` / `cn_card`）、`amount_usd`、`credits`。`generate` 事件加 `resolution` 和 `credits_cost`。

已经确定的规则：

- **订阅的状态只有 Stripe 一份真相**，Shotviva 存一张镜像表 `subscriptions`（`user_id`、`stripe_subscription_id`、`product_id`、`status`、`current_period_end`、`cancel_at_period_end`），由回调同步，账号页只读它。
- **Waffo 卡订阅也进这张表**（T50，总控 2026-11-06 按 Waffo 文档定）：
  - 表结构：新增 `id`（bigint identity）做主键；`stripe_subscription_id` 改为可空、唯一；新增 `provider`（`'stripe'` / `'waffo'`，默认 `'stripe'`）、`waffo_order_id`（`ORD_` 订阅订单号，可空、唯一）、`last_event_at`。约束：stripe 行必须有 `stripe_subscription_id`，waffo 行必须有 `waffo_order_id`。`status` 取值不变。
  - Waffo 状态映射：`activated` / `renewed` / `recovered` / `uncanceled` → `active`；`canceling` → `active` + `cancel_at_period_end = true`；`past_due` → `past_due`；`canceled` / `expired` → `canceled`（终态，之后的事件不再改它）。
  - 写入只走 `sync_waffo_subscription(user, order_id, product_id, status, current_period_end, cancel_at_period_end, event_at) → boolean`：按 `waffo_order_id` 插入或更新；订单属于别的用户或别的商品时拒绝；`event_at` 早于 `last_event_at` 的旧事件忽略。
  - 积分和 `paid_until` 只由扣款事件（`payment_succeeded`，经 `settle_waffo_order`）发放，每期按 `apply_purchase` 的 +30 / +365 天；订阅状态事件本身不发积分。
  - 取消：账号页「Cancel subscription」调 Waffo `subscription-order/cancel-order`，成功后调 `sync_waffo_subscription` 写 `cancel_at_period_end`；Waffo 回调随后再确认一次。
- 续费成功：`invoice.paid`（`billing_reason = subscription_cycle`）→ `apply_subscription_renewal`（T10），`paid_until = greatest(paid_until, 本期 period_end)`。
- **续费失败：什么都不做。** 不再发积分，`paid_until` 到期后账号页显示会员已过期；已有的付费积分照常可用。Stripe 自己重试，哪天扣成功哪天再发。不写宽限期。
- 取消：期末生效（Stripe 默认）。用户在 Stripe Customer Portal（Managed Payments 下是 Link 的客户门户）自己取消，账号页只放一个「Manage subscription」链接，不自己写取消界面。`customer.subscription.updated / deleted` 只更新镜像表。
- **退款自动扣回积分（Owner 2026-11-07 改，T71；推翻原来「只告警、不扣回」）**：
  - 退款政策（Owner 原话）：「用户充值以后 7 天内，如果没有使用积分才可以退款；一旦使用了积分就不能退款……个别用了一半积分要退款的，改成人工审核：我会先把他剩余的付费积分扣掉，再按剩下的比例给他退款。」
  - 常规：7 天内、没用过积分 → 全额退款；退款回调（Stripe `charge.refunded`、Waffo `refund.succeeded`）**自动扣回这笔付款发放的积分**。
  - 扣回量按付款记账、幂等：`本次应扣 = 该笔发放积分 × 累计退款比例 − 该笔已扣回`，再以当前付费池余额封顶，余额永远不为负；同一退款事件重复到达只扣一次。扣回写进积分流水，关联 `payment_id` 和退款号。
  - 人工审核（用过积分的例外）：Owner 在后台退款工单 / 订单页点「扣回这笔付款的剩余积分」，扣掉用户剩余的付费积分并**记到这笔付款名下**，然后按比例退款；之后到达的退款回调按上面公式计算，已扣回的部分不会再扣。
  - 扣不够（积分已被花掉，例如 Link 客服直接退款）：差额记在付款行（`clawback_shortfall`），Sentry 告警，后台订单和用户详情显示「欠扣 N 积分」；不做下次充值补扣，不封号。
  - 会员退款：会员资格立即结束（`paid_until` 改为退款时刻，不早于其他仍有效的购买），仍在续费的订阅同时取消（不按比例、不开发票）；这一期发的积分按上面规则扣回。
  - 拒付：`charge.dispute.created` 时先按全额扣回（同一公式、同一封顶），`charge.dispute.closed` 且结果为我方胜诉时，把这笔拒付扣回的积分还给用户（总控 2026-11-07 定）。
  - Stripe 争议可以先于本地订单到达。`payments` 插入或首次取得 `stripe_charge_id` 时，同一事务按 charge 关联尚无付款的争议，填入付款和用户 ID，用既有幂等键和 `clawback_payment_credits` 结算开启争议的扣回。已结案的争议交给既有 `close_payment_dispute` 处理，并保留原结案时间。并发投递按 charge 串行配对。归属变化沿用 T95 触发器重算佣金。回填失败时整体撤回该次回填，写私有表 `payment_dispute_link_errors`（付款 ID、SQLSTATE、最近发生时间、解决时间），付款与购买积分仍提交。后台概览「待处理」按付款统计未解决的回填异常；同一付款重复失败只算一笔，成功回填后保留错误记录并标记解决。迁移不批量修改既有订单。
  - Waffo 退款与 Stripe 同一规则、同一函数。
- **升级（Owner 2026-11-07，T66）**：会员本质是打折卖积分，升级就是按全价买更高的档，不补差价、不按比例、不退钱。
  - **Waffo 的限制（2026-11-08，#309）**：Waffo 没有「立即终止」订阅的接口，取消一张生效中的订阅只能「期末取消」，所以升级后旧订单在 Waffo 后台会显示「取消中」直到原周期结束。我们这边把旧订阅的镜像行记为已在升级时结束（之后 Waffo 的事件不能再把它改回来）；旧订单如果之后还发生扣款，不发积分、再取消一次，并发飞书告警「旧订阅没取消」由 Owner 退款；被恢复的旧订单同样再取消并告警。Waffo 原生的「改套餐」流程（`originOrderId` + `changeTiming: immediate`）能立即切换，但要改结账页和回调，等 Waffo 成为主力收款通道时再做。
  - 只能往高升：Starter → Pro → Max；同一档月付 → 年付也算升级。不能降级（高档换低档、年付换同档月付），想降只能先取消，等当期结束后重新订。
  - 有会员时买更高的档：付款页照常按新档全价结账；付款成功后新档**立即生效**，新档这一期的积分**立即全额到账**（年付一次到账，同首购），`paid_until` 按新档从付款时起算（`greatest(原 paid_until, 付款时 + 新档周期)`）；旧档没用完的积分全部保留，不扣不退。
  - 旧的自动续费订阅在新档付款成功后**立即取消**（不按比例退款、不再续费），由付款回调里同一处处理：Stripe（MP 卡 / 中国银行卡）调取消订阅接口，Waffo 调 `cancel-order`；取消失败只告警，Owner 手动处理，不回滚新档。支付宝等一次性购买没有订阅可取消。
  - 付费墙和定价页：已有会员时，比当前档低或同档同周期的选项显示为不可选（写明「不能降级，可在到期后重新订」），更高的档显示「升级」。服务端同样校验，低档或同档请求返回 409。
- 不做：降级、补差价 / 按比例退款、宽限期、测试时钟自动化、到期提醒邮件。折扣码见 §6.4（T94，Owner 2026-11-09）。
- **分两段上线**：上线当天必须有「订阅模式建结账 + 首付发放」（和单笔几乎相同）；续费、取消同步、Portal 链接在第一个付费用户满 30 天之前上线即可（TASKS T10）。
- 账号页「Subscription」区块显示当前档位（Starter / Pro / Max）和月付 / 年付；镜像表 `subscriptions.product_id` 存 9 个 id 之一。
- 卡、支付宝、微信支付能付（第 6.3 节的路由；微信支付 T73 起）。
- **水印在下载路由加，按作品判**：成品只存一份无水印原图；`core/storage` 的下载路由对 `credit_pool = 'free'` 的作品用 `sharp` 叠右下角「Made with Shotviva」后返回（约 50ms），`credit_pool = 'paid'` 的作品永不加水印。工作台预览和将来创作库展示同样走这个路由。
- **免费作品**（免费积分生成）：`visibility = 'public'`，带水印，用户不能改私密，可以删除。买了会员之后它们**仍然**是免费作品——不会自动去水印、不会自动私密；想要无水印版就用付费积分再生成一张。
- **付费作品**（付费积分生成）：默认 `visibility = 'private'`、无水印、可商用，用户可以改公开（进创作库，仍无水印）。会员到期、积分用完都不影响已有付费作品。
- **删除作品**（Owner 2026-11-06，T41）：用户可以删除自己的任何一张已完成作品（成功或失败的都可以，生成中的不行），免费、付费都一样。
  - 入口：作品详情页的「Delete」，二次确认（写明「删除后无法恢复，花掉的积分不退」）；Photos 网格第一版不做多选删除。
  - 数据：`generation_jobs` 加 `deleted_at`，**软删除**，行保留，用于积分流水、真实成本对账和后台统计。用户可见的所有读取（Photos、详情、文件路由、Make again、编辑、创作库 / 公开页、伙伴接口查询）一律排除 `deleted_at` 非空的行，文件路由返回 404。
  - 文件：标记删除后，服务端删掉这张作品在 R2 的全部文件：成品、原图小图、随作品保留的输入图（T40 的 `deleteWorkFiles`）。删文件失败只记日志，不回滚删除。
  - 一次往返：`delete_own_job(p_job_id)`（只能删本人、已完成的作品，重复调用不报错）；迁移编号段 `0340`～`0359`。
  - 编辑链：被删作品的编辑作品不受影响；它们详情页的「Edited from」显示「原作品已删除」。
  - 后台：出图记录照常显示，标「用户已删除」；后台「查看作品」对已删除的作品显示「已删除」，不签发地址。
  - 不退积分，不影响已开的发票和退款工单。
- 到期提醒邮件 v1 不做；Managed Payments 订阅的续费提醒由 Stripe / Link 自动发。

#### 会员档位权益（Owner 2026-11-05 定档位差异；上线范围由总控 2026-11-05 按「没做出来的不能写成现有功能」裁定）

**当前档位**：`paid_until > now()` 时，取最近一次会员购买（订阅或钱包单期）的档位 `starter` / `pro` / `max`；只买过积分包或没付过费的账号没有档位，按 Starter 的生成限制处理（但用免费积分生成的仍是免费作品，规则不变）。档位只决定下表的「会员权益」，**不改变按作品判付费**（水印、私密、可商用仍只看作品用的是哪个池的积分，§6.1）。由 SQL 函数 `current_tier(user_id)`（实现：`paid_until > now()` 时，取付费池里最近一条带会员商品 id 的入账流水的档位；积分包和后台调积分不决定档位；返回 null 视同 Starter） 统一给出，代码不各自判断。

| 权益 | Starter | Pro | Max | v1 状态 |
|---|---|---|---|---|
| 无水印、可商用、默认私密、全部模板（付费积分生成的作品） | ✓ | ✓ | ✓ | **上线**（已有，§6.1） |
| 同时进行的生成数 | 1 | 3 | 6 | **上线**：按 `current_tier` 设并发上限（替换现有固定的 `MAX_RUNNING`），没有档位的账号为 1；界面允许生成在后台进行、在 Photos 页看进度 |
| 客服响应时间（站内工单和邮件） | 48 小时 | 48 小时 | 24 小时 | **上线**：Owner 本人回复兑现（Owner 2026-11-06 定：Starter、Pro 48 小时，Max 24 小时）。后台工单列表按「到期时间」排序、标超时，概览「待处理」计超时工单（T27b） |
| 需求墙投票权重 | 1× | 1× | 3× | 随 T12 上线；T12 合并前在付费墙标 Coming soon |
| 批量上传（Pro 10 张、Max 30 张） | — | 10 | 30 | **Coming soon**，T28 做完后上线，Pro 和 Max 同时开（Owner 2026-11-06） |
| 新功能抢先用 | — | — | ✓ | **Coming soon**：权限接口和后台先做好（T29），有新功能要「只给 Max」时再在后台打开；「新模板抢先」删掉（Owner 2026-11-06） |
| 品牌套件（存 logo 和字体，海报自动套用） | — | ✓ | ✓ | **Coming soon**，做法未定，Owner 想清楚前不开发、不删（Owner 2026-11-06） |
| 生成排队优先 | — | 快速队列 | 最优先 | **不写进付费墙**：v1 是同步出图，没有排队，写了就是虚假承诺；以后改成异步队列时再加 |

**档位限制只有一张表**（Owner 2026-11-06 定，T28 落地）：所有按档位变的数字放在 `core/billing/tier-limits.ts` 的 `TIER_LIMITS` 里，付费墙文案和服务端校验都从这里读，保证页面写的就是代码限的。没有档位按 Starter。

| 字段 | Starter | Pro | Max | 说明 |
|---|---|---|---|---|
| `concurrency` | 1 | 3 | 6 | 同时进行的生成数（已上线） |
| `perWindow` | 20 | 40 | 80 | 10 分钟窗口内最多发起的生成数，替换现在固定的 20；否则 Max 批量 30 张第 21 张会被拦 |
| `batchMax` | 1 | 10 | 30 | 一次最多选几张照片批量生成 |
| `supportHours` | 48 | 48 | 24 | 工单时效（小时） |

- 需求墙 3 倍票的权重写在 SQL（`toggle_template_request_vote`），不读这张表，由 db 测试保证一致。
- 档位不够时服务端抛 `TIER_REQUIRED`（`core/errors.ts`，403，带 `required_tier`），前端打开付费墙并预选所需档位；`paywall_view` 的 `trigger` 记 `tier_required`（§16.2）。

**批量上传的语义**（Owner 2026-11-06）：同一模板、同一尺寸和清晰度、同一补充说明，一次选 N 张照片，出 N 张图。每张是一个独立任务：独立扣费、独立成败、失败独立退回。整批只用付费积分，付费池不够就不让批量（不拿免费积分凑，免得一批里混着带水印的）。浏览器按并发上限排队发 `/api/generate`；服务端没有「批量」对象，靠 `perWindow`、并发上限和余额兜底，不新建表、不加 `batch_id`。第一版不做「全部打包下载」。伙伴接口不做批量。

**新功能抢先用**（Owner 2026-11-06，T29）：
- 代码里有一张功能注册表 `FEATURES`（`core/features/registry.ts`，每项一个 key 和中文名）。新功能要受档位限制时，先在注册表加 key，再在服务端入口调 `requireFeature(userId, key)`，界面用 `featureOpen(tier, key)` 决定显示还是上锁。
- 谁能用由表 `feature_access` 决定：`key text primary key`（必须是注册表里的 key）、`min_tier text null`（`pro` / `max`，null 表示所有人可用）、`open_to_all_at timestamptz null`（到这个时间后所有人可用，可空）、`updated_at`、`updated_by`。没有行就是所有人可用。RLS 打开不建策略，只经 `service_role` 读写；读取按 `features` 缓存标签缓存，后台保存时失效。
- 判定 `featureOpen`：没有行、或 `min_tier` 为空、或已过 `open_to_all_at`、或用户档位 ≥ `min_tier` 就开放；档位顺序 starter < pro < max，没有档位按 Starter。
- 后台「功能权限」页（`/admin/features`）：列出注册表里所有功能，每项可选「所有人 / Pro 起 / 仅 Max」和「哪天起对所有人开放」，保存写 `feature_access`。注册表为空时显示「暂时没有可设置的功能」。
- 这张表是 §15.6「不做后台开关」的例外，只管档位门槛，不管功能开不开（功能开关仍在 `site.config` 的 `features`）。
- 保存函数签名是 `admin_set_feature_access(p_key, p_min_tier, p_open_to_all_at, p_actor)`：服务端用 service role 调用时拿不到 `auth.uid()`，所以由服务端传管理员 id 写进 `updated_by`（和 `admin_activate_announcement` 同一做法，T29）。

#### 联盟返佣（Owner 2026-11-07 定，2026-11-09 改为 Shotviva 内置，T95）

> **2026-11-09 更新（Owner 确认，替代下面「不自己开发、用第三方工具」；同日再改为 Shotviva 内置）**：第三方工具月费太高，联盟功能**内置在 Shotviva 里**（不做独立中心、不新建仓库和 Supabase；各产品先各做各的，以后再看能否合并）。表都以 `affiliate_` 开头放在 Shotviva 库；`profiles` 加 `referred_by` / `referred_at` / `referred_source`；推广链接 `?ref=` + cookie `sv_ref`（60 天，先到先得），注册时绑定（终身），首次付费时可补绑。推广员页面 `/partners`（中英双语、noindex），后台 `/admin/affiliates`；不发邮件，不动钱，Owner 每月手工打款后点「已付」。佣金：积分包和月付 15%、年付 10%，终身；团队奖励（二级，Owner 逐个开通）积分包和月付 5%、年付 3%；确认期 30 天，按实付减税（含 T94 折后）计算，退款按比例重算，争议冻结、败诉归零；**已确认甚至已结算付过款的佣金**后来遇到退款或败诉，同样按新金额重算，差额从推广员余额里扣，余额可以为负，用以后的佣金抵，不向推广员追钱；每月 1 日结算、门槛 $200。规格全文 `.local/affiliate/spec.md`。
> **有意的例外**：`payments` 和 `payment_disputes` 上的触发器直接调用 `affiliate_recompute_payment`，在同一事务里重算佣金（不改现有各个计费函数，不经发件箱）。这个触发器**绝不能让付款写入失败**：函数内部捕获所有异常，出错时只写一条错误记录（供后台重算），付款和积分照常提交；DB 测试要覆盖「佣金函数报错时付款仍然成功」。数据定义由 T95 的开发 PR 和迁移一起写进本节。和 T94 邀请码互不排斥，佣金按折后实付算。

**T95 数据定义（0900–0919）**。所有金额为整数美元分，比例为基点，新表启用 RLS，仅服务端读取。用户写入经当前会话取用户 id，后台 RPC 还校验 `p_actor` 是未封禁管理员，操作写入 `admin_audit_log`。结算单仅记录 Owner 手工付款结果。

| 表 | 字段与约束 |
|---|---|
| `profiles` 扩展 | `referred_by` 引用 `affiliates.user_id`，`referred_at`、`referred_source` 记录绑定时间和来源（signup、first_checkout、admin）。邀请码关系另存于 T94。 |
| `affiliates` | `user_id` 主键、唯一 `slug`、`status`、`parent_user_id`、`team_enabled`、`country`、`application`、`reject_reason`、`approved_at/by`、`admin_note`、`created_at`；`payout_method/details`、`us_person`、`terms_version/accepted_at`。受邀未注册者记录为待激活，Supabase 确认邮箱后激活。 |
| `affiliate_settings` | 布尔主键 `singleton=true`；`enabled=false` 为触发器及应用开关的同一数据源；`hold_days=30`、`payout_min_usd=20000`、`settlement_day=1`、`apply_min_level=none`、`terms_version`。 |
| `affiliate_rates` / `affiliate_rate_overrides` | 每个 `product_kind` 的 `l1_bp/l2_bp`；个人覆盖按 `(user_id,product_kind)` 唯一，各等级可单独回落至默认比例。 |
| `affiliate_commissions` | `id`、`payment_id`、`affiliate_user_id`、`level`、`product_id`、`rate_bp`、`base_usd`、`amount`、`status`、`confirm_after/confirmed_at`、`void_reason`、`flags`、`released_by`、`created_at/updated_at`。每笔付款每层至多一行。付款当时的归属、团队资格、比例和确认期保留；只按当前退款和争议重算。现有 `profiles.signup_ip` 支持同 IP 标记；付款表没有卡指纹。 |
| `affiliate_commission_changes` | `id, commission_id, at, old_amount, new_amount, old_status, new_status, reason` 记录每次实际变化。 |
| `affiliate_adjustments` | `id, request_id, affiliate_user_id, amount, reason, created_by, created_at`。相同请求只记一次。 |
| `affiliate_payouts` | `id, affiliate_user_id, period, amount, status, payout_snapshot, created_at, paid_at, paid_method, paid_reference, decided_by, note`；每人每月唯一。 |
| `affiliate_recompute_errors` | `id, payment_id, at, error, snapshot, resolved_at`；每笔付款最多一条未解决错误；首次计算失败时保存已取得的收款人、比例和确认日，以便重试。 |
| `affiliate_click_days` | `affiliate_user_id,day` 联合主键、`clicks`。 |
| `affiliate_balances` | 每个 `affiliate_user_id` 的 `confirmed,pending,paid,available`。可结算余额为已确认佣金加人工调整，减去待付和已付结算单；暂缓单回到余额。 |

- `affiliate_bind/count_click/apply/save_profile` 负责归属、点击、申请及设置。团队邀请只接受有效的已开团队推广员。申请门槛以未全额退款的会员付款为准。
- `affiliate_recompute_payment` 由付款新增、退款金额或状态变化、争议新增或结案触发。对税后退款比例使用精确整数除法。付款与积分事务独立于佣金成败。每日 `affiliate_daily(UTC 日期)` 重试错误、确认到期佣金并在结算日生成结算单。
- 关闭计划后，旧佣金继续按退款和争议结果重算；关闭期间发生的付款，重开也不补发佣金。直接推广员在付款时已暂停或封禁，本人佣金作废，该笔付款也不产生上级团队奖励。
- `admin_affiliate_decide/create/set/adjust/commission_release/rebind/payout_decide/settings/recompute` 写审计。后台财务汇总及邮箱查询、推广员概览及已脱敏推荐用户列表通过服务端读取函数返回。短码唯一索引支持绑定，推广员与时间索引支持私有明细分页，状态与确认时间索引支持每日确认，未解决错误及争议按付款检索。

- **不自己开发联盟系统**，用第三方联盟工具接入（选型待 Owner 定；接入前核对：能否追踪 Managed Payments 订阅、支付宝单笔和 Waffo 订单怎么记）。网站这边只做记录推广码、结账时把推广码传给支付平台，届时另开任务卡。
- **返佣比例**：代理绑定自己推荐的客户，按该客户每一笔付款**终身**返佣：
  - 积分包（`pack_s` / `pack_m` / `pack_l`）和月付会员（`*_monthly`）：**15%**；
  - 年付会员（`*_yearly`）：**10%**（年付折扣更大，Owner 定）。
- **返佣基数**：该笔付款不含税的实付金额（`payments.amount_total − payments.amount_tax`）；退款的付款不返或追回。
- **毛利核算**（`.local/affiliate-margin-2026-11-07.md`，2026-11-07）：按实测出图成本（约 $0.03 / 积分），返佣后所有商品毛利率在 65% 以上；按规范最坏成本（$0.06 / 积分、积分全部用完），最低是 Max 年付走 Managed Payments 国际卡，约 51%。未计第三方工具月费和给代理打款的手续费（约再少 1～3 个百分点）。

### 6.3 通道

**Stripe：一个账户，按付款方式路由**（照 Graylum staging `methodRouting.ts` 的做法，Graylum 2026-10-12 沙盒实测两种模式共用一个账户 PASS）：

| 用户选的方式 | Checkout Session 怎么建 | 卖家 |
|---|---|---|
| 卡 / Apple Pay / Google Pay | `mode: 'subscription'`，`managed_payments: { enabled: true }`，不传 `allowed_payment_method_types`（MP 自己决定付款方式） | Stripe（Link）当商户记录方，结账时另加税 |
| 支付宝 / 微信支付（T73） | `mode: 'payment'`，`allowed_payment_method_types: ['alipay', 'wechat_pay']`，`payment_method_options.wechat_pay.client: 'web'`（在 Dashboard 已开启的动态付款方式里过滤；两种都没开时拒绝跳转，只开了一种就只显示那一种）。**微信支付由服务端开关 `STRIPE_WECHAT_PAY`（on / off，默认 off）控制**：off 时只请求 `alipay`，所有文案只写「支付宝 / Alipay」，和 T73 之前完全一样；on 时加上 `wechat_pay` 和「支付宝 / 微信支付」文案。测试站分支先开；正式站等 Stripe 正式账户批准微信支付后由总控打开（Owner 2026-11-08） | Shotviva |
| 中国银行卡（只在中文页出现，T64） | 会员 `mode: 'subscription'`、积分包 `mode: 'payment'`，**不带** `managed_payments`，用专用的付款方式配置「Shotviva card only (T64)」（只开银行卡，Link / Apple Pay / Google Pay 关；由 `scripts/stripe-setup.ts` 维护、按名字查找，Stripe 不允许它和 `allowed_payment_method_types` 同时传，配置缺失时才退回 `['card']`），`wallet_options.link: 'never'`，按当地货币显示照 Stripe 账户默认（Owner 2026-11-07：显示当地货币可以，到账是美元），不开自动税（与审核前的兜底卡路由同一条代码路径）；会员照常自动续费，账号页「Manage subscription」进普通 Stripe Customer Portal | Shotviva |

> Stripe API 2026-09-30（stripe@23）起，Checkout Session 不再接受 `payment_method_types`，传了会 400；按方式限定一律用 `allowed_payment_method_types`。审核下来之前不走 MP 的卡路由传 `['card']`。（T9 修复，2026-11-06）

- 服务端只认用户选的方式，不按 IP 或浏览器语言强制。Managed Payments 的结账页不允许买家国家为中国（2026-11-07 正式站真卡实测：中国发卡的 Visa 被拒「China is not currently supported」），所以给中文页加「中国银行卡」这条普通 Stripe 卡路由（T64，Owner 2026-11-07）。
- **中文页付款方式（Owner 2026-11-07，T64）**：三项，顺序固定：① **中国银行卡**（上表第三行，普通 Stripe）② **支付宝 / 微信支付**（T73）③ **海外银行卡 · Apple Pay · Google Pay**（原来的 MP 卡路由，只改名）。英文页两项：Card · Apple Pay · Google Pay 和 Alipay（开关打开后叫 Alipay / WeChat Pay），没有中国银行卡。中国银行卡这条路由由 Shotviva 当卖家：大陆买家不涉及我们需要申报的销售税 / 增值税；非大陆用户在中文页选它的情况接受，不做卡 BIN 拦截（上线后看数据再定）。埋点 `checkout_start.method = 'cn_card'`。
- MP 商品必须设税码 `txcd_10105001`（AI 服务，个人用）。MP 价格不含税，税在结账时另加。
- 顾客账单：卡支付显示 `LINK.COM* SHOTVIVA`，钱包支付显示 SHOTVIVA。MP 结账页不支持自定义域名。
- 正式环境的 Managed Payments 要等 Stripe 资格审核。**审核没下来之前的兜底**：卡先不带 `managed_payments` 走普通订阅（Shotviva 当卖家），审核通过后翻开关。
- **账号页购买记录里下载收据和发票（Owner 2026-11-08，T80）**：账号页「Purchases / 购买记录」每一笔付款旁边放「收据」，有发票的再放「发票」，点了在新标签页打开或下载付款服务商出的正式文件，我们不自己生成 PDF。
  - 链接在用户点击时由服务端现取（服务端核对这笔 `payments` 行属于当前用户），不存进数据库，也不在页面 HTML 里提前放：Stripe 一次性付款取 charge 的 `receipt_url`；订阅首付和续费取 invoice 的 `hosted_invoice_url` / `invoice_pdf`；Managed Payments（海外银行卡）、支付宝 / 微信支付、中国银行卡各自能拿到什么，由开发先在 Stripe 测试模式逐一核实后写进 PR，拿不到发票的只给收据；Waffo 按它的接口能给的给，什么都没有时显示「收据已发送到付款邮箱」。
  - **微信支付和支付宝只给收据，不生成发票**（Owner 2026-11-08）：不开 Checkout 的 `invoice_creation`；积分包等一次性付款同样只有收据，有企业客户需要发票时再议。
  - 已退款 / 部分退款的付款照样能下载，行上标「已退款」；Stripe 的收据页会显示退款。
  - 手机号账号没有邮箱时，这里是拿收据的主要途径。

- **拒付申诉证据（Owner 2026-11-08，T82）**：防「积分用完再拒付」。
  - **先核实谁负责拒付**：海外银行卡（Managed Payments，Stripe 是卖家）、中国银行卡（普通 Stripe）、支付宝 / 微信支付、Waffo 各自的拒付由谁应诉、能不能通过接口提交证据，开发先查文档并在测试模式验证，写进 PR；只有需要我们应诉的渠道接入下面的流程。
  - **平时就记证据**：开始结账时记录用户 IP 和 User-Agent（存在付款行，和 `stripe_session_id` 关联）；结账页开启 Stripe 的「必须同意服务条款」（`consent_collection.terms_of_service = 'required'`，自定义文字带服务条款和退款政策链接；Managed Payments 不支持时写明），同意时间从 session 回读并存下；每次出图和下载记录 IP（只存哈希以外的必要形式，按隐私政策写明用途：防欺诈和处理争议）。
  - **拒付来了自动整理**：收到 `charge.dispute.created` 后，服务端汇总注册时间、付款信息、同意条款的时间、付款时 IP、这笔积分的消耗明细（每张图时间、IP、是否下载）、退款政策原文和产品说明，按 Stripe 证据字段（`customer_email_address`、`customer_purchase_ip`、`service_date`、`access_activity_log`、`refund_policy`、`refund_policy_disclosure`、`terms_of_service`、`product_description`、`uncategorized_text` 等）写进这笔拒付，`submit = false` 只存草稿；飞书告警写明截止日期和后台链接（T72）。
  - **后台「拒付」页**：列出每笔拒付（金额、用户、原因、状态、截止日期），点开预览证据草稿，可补充文字或附件，Owner 点「提交申诉」才 `submit = true`（只能交一次，二次确认）。截止前 3 天还没提交，飞书再提醒一次（打开后台时检查，不写定时任务；告警由收到的 Stripe 事件和后台访问触发，若需要准时提醒再单独定）。
  - **预防**：发生拒付的账号自动封禁（填原因「拒付」，Owner 可在后台解封）；中国银行卡路由强制 3D Secure（`payment_method_options.card.request_three_d_secure = 'any'`）。
  - 迁移编号段 `0720`～`0739`。

- 要处理的 Stripe 事件：`checkout.session.completed` 和 `checkout.session.async_payment_succeeded`（首付 / 单笔 → `settle_checkout`：写镜像表 + `apply_purchase`，同一事务）、`invoice.paid`（只认 `subscription_cycle` → `apply_subscription_renewal`，T10）、`customer.subscription.updated / deleted`（只更新镜像表）、`charge.refunded`（记录 + 自动扣回积分 + 告警，T71）、`charge.dispute.created`（记录 + 全额扣回 + 告警，T71）、`charge.dispute.closed`（我方胜诉时把拒付扣回的积分还回，T71）。其余事件忽略（回 200）。Stripe 后台的回调端点订阅这 8 个事件（T71 新增 `charge.dispute.closed`，Owner 在 Stripe 后台勾选）。
- Stripe 用与 Graylum 同一主体下**新开的独立账户**，避免两边回调互相收到对方的事件。

**Waffo：保留做兜底，卡支付做订阅**（Owner 2026-11-05 确认不砍；2026-11-06 晚加卡订阅）：

- 角色是 Stripe 账户本身没通过、或 Stripe 整体不可用时的收款兜底。Waffo 可以加急当天开通。
- **Waffo 上的会员按付款方式分两种**（Owner 2026-11-06 晚）：
  - **银行卡 = 自动续费订阅**：月付 / 年付按期自动扣款，每期成功扣款走同一个 `apply_purchase`（积分 + `paid_until`，与 Stripe 续费一致，幂等键用 Waffo 的扣款 / 订单号）；续费失败不发积分、不延 `paid_until`；用户可以在账号页取消，取消后当期结束不再续费（镜像到 `subscriptions`，`cancel_at_period_end = true`）。Waffo 没有类似 Stripe Customer Portal 的托管页时，账号页的「Cancel subscription」按钮由我们调 Waffo 的取消接口（这是「不自写取消界面」的唯一例外）。
  - **支付宝 = 单次购买一期**：月付 +30 天、年付 +365 天，不自动续费，到期后手动再买（和 Stripe 支付宝一致）。
  - 三个积分包所有方式都是单笔。Waffo 不支持微信，付款页只显示卡和支付宝；卡写明「自动续费，可随时取消」，支付宝写明「不自动续费」。`product_id → Waffo 商品 id` 的映射放环境变量（一个 JSON 映射，九个 id 都要有，缺一个启动时报错）。
- 通过环境变量指定当前用哪条通道：默认 Stripe；切到 Waffo 时付费墙全部方式都走 Waffo（卡订阅、支付宝单笔、积分包单笔）。**不做自动故障切换**，出问题时人工改开关。
- 回调规则和 Stripe 相同：先验签，再按事件 id 去重，最后 `apply_purchase`。

**开发顺序**：先 Stripe（T9 结账 + 首付、T10 续费），再 Waffo 兜底（T13）。做法参照 Graylum **staging 分支**的支付规则，但不复制它的代码：staging 的支付目录约 8900 行，具体商品、升级和折扣规则见 §6.2、§6.4。

### 6.4 邀请码、优惠码与送积分码（T94）

#### 表 `codes`（私有：开 RLS、不建 policy，只经 service role 读写）

| 字段 | 类型 | 说明 |
|---|---|---|
| `id` | uuid pk | |
| `code` | text unique not null | 大写；check `^[A-Z0-9]{4,20}$` |
| `kind` | text not null | `invite` / `campaign` |
| `owner_user_id` | uuid null → profiles on delete cascade | 只有 `invite` 有；`unique(owner_user_id) where kind='invite'` |
| `invitee_credits` | int null | 被兑换时送的积分；`invite` 行为空（数字来自 config） |
| `invitee_pool` | text null | `free` / `paid` |
| `discount_percent` | int null | 1～90；空 = 不打折 |
| `discount_products` | text[] null | 9 个商品 id 的子集；有折扣时必填、非空 |
| `discount_duration` | text null | `once` / `repeating` / `forever` |
| `discount_months` | int null | 只有 `repeating` 时必填 |
| `discount_valid_days` | int null | 兑换后 N 天内可用 |
| `stripe_coupon_id` | text null | 后台保存时建的 Stripe 优惠券；预览库、生产库各自对应 Stripe 测试模式 / 正式模式 |
| `starts_at` / `expires_at` | timestamptz null | |
| `max_redemptions` | int null | |
| `redemption_count` | int not null default 0 | 兑换函数加锁自增 |
| `new_users_only` | bool not null default false | |
| `active` | bool not null default true | |
| `note` | text null | 后台备注（例如「Product Hunt 首发」） |
| `created_by` | uuid null | 管理员 id |
| `created_at` / `updated_at` | timestamptz | |

约束：`campaign` 行的「送积分」和「打折」至少有一项。后台送积分码每次赠送的上限，以及付费池送积分码是否必须填写总名额，由 `system_settings` 的 `code_gift_policy` 配置。创建或修改赠送条款时数据库校验；既有兑换记录保留实际发放量。
索引：`code` 唯一索引供兑换查询；后台列表按 `(created_at desc, id desc)` 分页，按类型筛选时使用带 `kind` 前缀的索引。

#### 表 `code_redemptions`（私有，同上）

| 字段 | 类型 | 说明 |
|---|---|---|
| `id` | uuid pk | |
| `code_id` | uuid → codes on delete set null | 邀请人删号后保留已被邀请的事实，不能再次领邀请积分。 |
| `kind` | text | 冗余存 `codes.kind`，给唯一索引用 |
| `user_id` | uuid → profiles on delete cascade | 兑换人 |
| `inviter_user_id` | uuid null → profiles on delete set null | 只有 `invite` 有 |
| `context` | text | `signup` / `account` / `paywall` |
| `status` | text | `ok` / `blocked_same_ip` / `blocked_no_signup_grant` |
| `credits_granted` | int default 0 | 实际送给兑换人的 |
| `inviter_rewarded_at` | timestamptz null | |
| `inviter_reward_payment_id` | bigint null → payments | 触发邀请人奖励的那笔付款 |
| `discount_expires_at` | timestamptz null | 兑换时算好：`least(code.expires_at, now() + valid_days)` |
| `discount_used_payment_id` | bigint null → payments | 用掉折扣的那笔付款 |
| `discount_void_at` | timestamptz null | 被新折扣替换时写 |
| `created_at` | timestamptz | |

唯一：`(code_id, user_id)`；`(user_id) where kind = 'invite'`（只能被邀请一次）。
索引：`(code_id, created_at desc, id desc)`（后台看某个码的兑换记录）；`(inviter_user_id, created_at desc) where inviter_user_id is not null`（我的邀请）；`(user_id) where discount_percent 待用`，即部分索引 `(user_id) where discount_used_payment_id is null and discount_void_at is null`（结账查待用折扣）。

#### `payments` 的新增字段

- `code_id uuid null → codes`
- `amount_discount int not null default 0`（分；来自 Stripe session `total_details.amount_discount`）
- `code_discount_conflict boolean not null default false` 标记重复消费同一折扣的付款。
- `code_effects_applied_at timestamptz null` 记录首次完成核销与奖励判断的时间。

#### `credit_ledger.kind` 扩两种

check 约束换成原来的集合再加上 `code_grant`（兑换送的积分）和 `invite_reward`（邀请人奖励）。删掉旧约束、加新约束，放在同一个迁移里，只会变宽。幂等键：`code:<redemption_id>`、`invite:<redemption_id>`。

#### 函数（plpgsql，`search_path = ''`，只授权 `service_role`）

| 函数 | 做什么 |
|---|---|
| `get_or_create_invite_code(p_user)` | 有就返回，没有就生成 8 位码（撞了重试） |
| `redeem_code(p_user, p_code, p_context, p_invitee_credits, p_invite_window_days, p_replace=false)` | 一个事务里做完：查码并锁行 → 校验（启用、时间、名额、新用户、封禁、自己的码、同 IP、已用过、只能被邀请一次、邀请码 7 天窗口、注册赠送是否已发）→ 写兑换记录 → `redemption_count + 1` → 送积分（`_apply_credit_change`，kind `code_grant`）→ 有折扣时作废旧的待用折扣。返回 `{status, credits_granted, discount_percent, discount_products, discount_expires_at, replaced}`；有待用折扣、没传 `p_replace = true` 时返回 `needs_confirm`，不写任何东西 |
| `checkout_discount(p_user, p_product_id)` | 只读：返回这个账号针对这个商品可用的待用折扣（`code_id`、`stripe_coupon_id`、`percent`），没有就返回空 |
| `apply_payment_code_effects(p_user, p_payment_id, p_code_id, p_amount_discount, p_inviter_credits, p_inviter_cap)` | 付款入账后由回调调用，幂等：① 把 `code_id` / `amount_discount` 写进这笔 `payments`，把对应的折扣标记为用掉；② 这个用户是被邀请来的、这是他第一笔成功付款、邀请人没封禁、配置的奖励窗口内没超上限，就给邀请人发付费积分（kind `invite_reward`）。Stripe 首付、单笔和 Waffo 单笔都调；续费不调 |
| `admin_save_code(p_actor, p_code_id, p_fields, p_catalog, p_floor_product_id)` | 新建 / 编辑后台码；服务端从 site.config 的商品目录传入价格、积分和最便宜订阅的原价及积分数做精确比较。三参数旧入口使用数据库商品目录镜像。折扣参数建好后不能改 |
| `admin_set_code_active(p_actor, p_code_id, p_active)` | 启用 / 停用 |
| `admin_list_codes(p_actor, p_cursor, p_kind, p_code_id)` / `admin_code_redemptions(p_actor, p_code_id, p_cursor)` | 后台列表，按游标分页、每页 30 条；码列表一并带出统计：兑换数、付款人数、净收入（`amount_total − amount_tax − amount_refunded` 的合计）、折扣总额 |
| `admin_top_inviters(p_actor, p_days)` | 前 50 名邀请人：邀请数、付款人数、拿到的奖励 |
| `my_invite_summary(p_user, p_inviter_cap, p_cursor)` | 账号页用：我的码、邀请人数、付款人数、已得积分、当前奖励窗口的天数及剩余次数 |

后台函数均带管理员参数 `p_actor`，函数内校验身份。`admin_audit_log_action_check` 保留全部现有操作并加入以下两项。写操作在同一事务记录 `save_code` 或 `set_code_active`。

#### 注册与手动兑换的限频（阶段 2）

注册由首次验证登录调用 `redeem_code`。账号页、付费墙经 `redeem_limited_code` 在一次数据库请求中完成限频与兑换，只授权 service_role。每个账号滚动一小时最多受理 10 次手动请求，错误码、格式错误和替换确认请求均占次数。新增 `profiles.code_redeem_attempts timestamptz[] not null default '{}'` 仅保留最近最多 10 个时间戳；按账号串行检查，不记录输入的码。达到上限返回 rate_limited。公共效果预览只读，IP 限频由 Vercel Firewall 处理。

#### 折扣占用和并发入账（Owner 2026-11-09）

- 每个账号同时最多一份待用折扣。兑换、替换、占用与核销按账号串行，兑换名额按码锁定。积分入账键基于兑换记录，滚动窗口的奖励上限按邀请人串行，按邀请人的 invite_reward 流水计数，被邀请人删号不会返还奖励名额。受邀人免费积分、邀请人首付奖励积分、补填窗口和奖励次数上限由服务端从 `site.growth.invite` 传入。滚动奖励窗口天数读取 `system_settings.code_inviter_window_days`（当前 30），原签名将天数传给支付、邀请统计的带参重载，后者返回窗口天数供双语文案使用。两项 T94 运行时设置均可经现有管理员设置 RPC 修改。
- 在兑换行增加 `checkout_token uuid`、`checkout_expires_at timestamptz`（均可空）以及 `checkout_prepared boolean not null default false`。服务端生成一次尝试专用的 UUID。在创建带折扣的 Stripe Session 前调用 `reserve_checkout_discount(p_user,p_product_id,p_token)`，原子查询并占用，返回折扣和截止时刻。预占建单窗口 60 秒。发起 Stripe 请求前调用 `prepare_checkout_discount(p_user,p_token,p_expires_at)`，原子固定并返回要发给 Stripe 的 Unix 截止秒数。同一尝试可幂等重试，沿用此值。其他尝试收到占用状态；存在占用时不能替换。阶段 3 建单按发起 Stripe 请求的时间设 30 分钟有效期；数据库校验传入的 Unix 秒允许最多 10 秒的时钟与传输余量，锁和 Stripe 共用同一绝对截止时间。Stripe 建单用 token 作幂等键；创建结果不确定时仅重试原尝试。阶段 3 必须对齐 Stripe 实际截止时间，不能让本地占用先于仍可付款的 Session 到期。
- 到期即可重新占用，无需定时清理。用户放弃时服务端先确认 Stripe Session 已过期或主动关闭成功，再调用 `release_checkout_discount(p_user,p_token)`；确定未建单也立即释放。释放须匹配原 token，延迟的取消或过期通知不能释放新占用。异步付款处理中不能因浏览器返回就认定为放弃。
- 核销以成功付款为准；从 Stripe 可信 metadata 取得码，按用户和码定位兑换，允许处理关闭或替换后迟到的成功通知。第一笔成功核销后保留其付款 id。第二笔不同付款命中同一份折扣也正常入账，保留实付和折扣金额，标记该笔 `code_discount_conflict`。首次处理后记 `code_effects_applied_at`，封顶或封禁时确定的未发奖结果同样不随回调重放改变。RPC 返回冲突标记供回调记 warning，后台兑换明细列出异常付款；不追收差价。重放同一笔付款不重复发奖。
- 后台码按付款行的 code_id 归因；邀请码按成功邀请后该用户的付款归因。每个码内按付款行去重，金额按币种分别汇总。邀请付款人数以实际已付款账号计（含因封顶未领奖者）。注册同 IP 或无注册赠送被拦记录保留原因，不计成功名额和邀请数。折扣底线取当前订阅商品中最低的美元实收价除以该商品积分数，积分包只作为折扣目标。服务端使用 `site.billing.products` 中的标价与积分，不先舍入每积分价格。逐一校验每个目标的折后美元实收除以积分数大于或等于底线。已创建码的折扣条款不可改。

## 7. 登录

照 Graylum staging：

- Supabase Auth：邮箱 + 密码注册，点验证邮件完成激活；另加 Google 登录。
- hCaptcha 交给 Supabase Auth 自带的人机验证校验。前端**只做隐形验证**：页面上不放任何验证控件，用户点提交按钮时才调用 hCaptcha，需要挑战时由 hCaptcha 自己弹出验证窗口（Owner 2026-11-07：不再降级为页面内的显式 checkbox）。验证失败或被关掉时，表单下方给一句提示，再点一次按钮重新弹出；hCaptcha 的告知并进表单下方的条款那句（Owner 2026-11-07）：「继续即表示你同意服务条款和隐私政策，本页由 hCaptcha 提供人机验证。」，hCaptcha 链到它的隐私说明；没有条款句的表单（登录、找回密码、重发）只放一句同样样式的「本页由 hCaptcha 提供人机验证。」；隐私政策的第三方服务里列出 hCaptcha。hCaptcha 的语言跟随页面语言。
- 防刷免费额度：邮箱验证 + hCaptcha + **同 IP 限制**（Owner 2026-11-06 定：上线就开）。发放注册赠送的 SQL 函数检查同一个 `signup_ip` 24 小时内是否已经给别的账号发过；发过就不再发。后注册的账号照常能注册、能付费，只是没有免费额度，账号页显示一句说明。不引入设备指纹库。
- **封禁的范围**（Owner 2026-11-06 定）：被封禁（`banned_at` 不为空）的账号不能出图、不能用需求墙、**不能创建结账**（`/api/checkout` 返回 403）；封禁时在同一事务里**断开 Graylum 连接**（`partner_links` 置为断开）。账号仍可以登录、查看和下载自己的作品、删号。
- 验证邮件、重置密码邮件由 Supabase Auth 发，SMTP 配成 Resend，发件人 `Shotviva <mail@shotviva.com>`（Owner 2026-11-07 由 `support@` 改为 `mail@`；回信进飞书邮箱，`mail@` 设为 `support@` 的别名；网站和法律页上的联系邮箱仍是 `support@`。更早 2026-11-05 由 `noreply@` 改来：Resend 提示 no-reply 发件人影响送达，且用户回信能直接进飞书的 support 邮箱）。**v1 不写任何发信代码**，只改 Supabase 的邮件模板。邮件里引用的图片（`public/brand/email/` 下，如字标 `shotviva-wordmark@2x.png`）**上线后永不删除、永不改名、永不改内容**：已经发出的邮件会一直引用原地址；换新图一律用新文件名，并重新粘贴模板（Owner 2026-11-07）。审 PR 时凡是删改 `public/brand/email/` 已有文件的一律打回。
- 邮件按用户语言发（Owner 2026-11-06）：注册时把当前页面语言写进 `user_metadata.locale`（`'en'` / `'zh'`，`signUp` 的 `options.data`）；四个模板正文用 `{{ if eq .Data.locale "zh" }}…{{ else }}…{{ end }}` 放中英两版；邮件标题如果 Supabase 支持同样的条件写法就中英分开，不支持就保持英文（T21 在本地 Supabase 实测后定）；没有 `locale` 的老账号和 Google 登录账号发英文。
- 管理员身份存在数据库 `profiles.role`，不用环境变量里的邮箱列表。
- **中国大陆手机号验证码登录（Owner 2026-11-07，T63）**：给大陆用户的快捷注册 / 登录，和邮箱、Google 并存。
  - 只收 `+86` 大陆手机号；入口只在中文登录 / 注册页显示（「手机号登录」和「邮箱登录」两个页签，中文页默认手机号），英文页不显示。
  - 流程：填手机号 → 隐形 hCaptcha → 收 6 位验证码（5 分钟有效）→ 填码即注册或登录，不设密码。用的是 Supabase Auth 自带的手机号 OTP；短信不走 Twilio，走 Supabase 的「Send SMS」Auth Hook 指向我们自己的接口（校验 Hook 签名），接口调用**阿里云号码认证服务的「短信认证」**（Dypnsapi `SendSmsVerifyCode`，Owner 2026-11-07 定：个人实名账号可用、不要企业资质；用阿里云赠送的签名和配套的验证码模板，签名不是 Shotviva、不可修改，赠送签名和模板必须配套）。验证码由 Supabase 生成，Hook 把它作为模板参数 `code`（另传有效分钟数 `min`）交给接口下发；校验仍由 Supabase `verifyOtp` 完成，不调用 `CheckSmsVerifyCode`。签名名称、模板编号、AccessKey（RAM 子账号，只给短信认证发送权限）都在环境变量。发短信这一层是可替换的适配器（阿里云 / 测试用的假发送），代码和日志里**永远不出现验证码明文**。
  - 防刷（缺一不可）：发码前过 hCaptcha（Supabase 自带校验）；同一手机号 60 秒 1 条、每天 5 条，同一 IP 每天 20 条，超了 Hook 直接拒绝且不调用阿里云；阿里云后台设每日发送上限和余额报警（Owner）；只接受 `+86` 开头的号码。
  - 手机号验证过就等同邮箱验证过：能出图、能领注册赠送（同 IP 规则照旧）。埋点 `signup.method` 加 `phone`。
  - 手机号账号可以没有邮箱：Stripe / Waffo 结账时由支付页自己收邮箱开收据；客服工单回复只在站内提醒；账号页显示脱敏手机号（`138****5678`），v1 不做绑定邮箱和换号；删号照常。后台用户列表和搜索要能显示、搜索手机号，邮箱为空不报错。
  - 合规（个人信息保护法）：手机号注册时单独勾选同意「服务条款」「隐私政策」「使用规范」和「个人信息出境」（Owner 2026-11-08 加上服务条款和使用规范，三个都是可点开的链接）（数据存美国 Supabase，短信经阿里云发送）；隐私政策补「手机号的用途、短信服务商、出境」一节（英文，中文页链接同一份），列进律师审阅清单。
  - Supabase 控制台的手机号登录开关、Hook 地址和密钥、测试号码由 Owner 配置（预览和生产分开）；预览用 Supabase 的测试号码 + 固定验证码给 QA 账号，不发真短信。

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
- T97 画风参考图使用 `style-refs/<template_id>/<随机 UUID>.webp`，长边不超过 1536 像素；模板编辑器仅对管理员提供预览，生成服务端直接读取，模板公开数据、伙伴请求和作业序列化均不提供 key 或地址。


- `inputs/` 前缀：压缩后的输入图（临时位置），7 天后自动删除。没发起生成的上传对象同样 7 天清掉。
- **输入图随作品保留**（Owner 2026-11-06，T40）：出图成功结算时，服务端用 R2 的复制操作（不经 API 路由请求体）把这次的全部输入图复制到 `outputs/{user_id}/{job_id}-in-{n}.jpg`，记在这条任务上；和成品一起保留、一起删除（删号按 `outputs/{user_id}/` 前缀清，已覆盖）。目的是让「Make again」任何时候都能直接用原来的照片。复制失败只记日志，不影响结算，这张作品的 Make again 退回「请再加一次照片」。作品编辑（§5.2）的输入是成品，不另存。
- `outputs/` 前缀：成品，只存一份无水印原图，一律保留，直到用户删除。
- **原图小图**（Owner 2026-11-06，T32）：出图成功结算时，服务端用 `sharp` 把这次的输入图（多图模板取第一张）转成长边 768、质量 80 的 WebP，去掉 EXIF / GPS，写到 `outputs/{user_id}/{job_id}-input.webp`，和成品一起保留、一起删除（删号按 `outputs/{user_id}/` 前缀清，已覆盖）。全尺寸输入图按上一条随作品保留。写小图失败只记日志，不影响结算。作品编辑（§5.2）的输入是上一张作品，不另存小图，详情页直接链到原作品。
- 桶 CORS 必须允许站点域名的 `PUT`、`GET` 和 `Content-Type` 头。`GET` 给分享按钮用：付费作品 `/api/files/:id` 302 到签名地址，浏览器要跨域读出图片才能交给系统分享面板（T31）。
- 所有读取走 `core/storage` 的下载路由（鉴权 + 第 6.2 节的水印规则）或短期签名 GET；伙伴接口返回的签名地址 7 天有效。

**模板封面另用一个公开桶**（Owner 2026-11-05：模板示例图由 Owner 在后台自己上传替换）：

- 桶名 `shotviva-assets`（预览用 `shotviva-assets-preview`），只放模板封面前后图，前缀 `covers/{template_id}/before-{hash}.webp`、`after-{hash}.webp`；文件名带内容哈希，换图就是新文件，不用清缓存。
- 公开读（Owner 2026-11-07 改）：shotviva.com 的 DNS 在 Vercel，R2 绑不了自定义域名，所以**生产走本站同源路径**：`https://shotviva.com/assets/covers/...` 由 Next 的 rewrite 转到公开桶的 r2.dev 地址（服务端变量 `R2_PUBLIC_ORIGIN`，构建时读取），`/assets/*` 返回 `Cache-Control: public, max-age=31536000, immutable`（文件名带内容哈希），让 Vercel 的 CDN 缓存，r2.dev 本身几乎不被直接访问。生产 `NEXT_PUBLIC_ASSETS_BASE_URL = https://shotviva.com/assets`；预览可以直接填 r2.dev 地址。以后 DNS 迁到 Cloudflare 再绑 `assets.shotviva.com`，只改这两个变量，不改代码（T51）。
- 公开地址的前缀放环境变量 `NEXT_PUBLIC_ASSETS_BASE_URL`，`templates.cover_before_url` / `cover_after_url` 存完整地址。
- 写入只走后台：后台模板编辑页「上传前图 / 上传后图」→ 服务端校验（JPEG / PNG / WebP，≤20MB）→ `sharp` 转 WebP（长边 1600、质量 82）→ 写公开桶 → 更新模板行。和用户照片一样，图片字节不经 API 路由请求体（第 8.1 节）：浏览器先直传到私有桶的 `uploads-admin/` 临时前缀（7 天过期），服务端再读出处理后写公开桶。
- **封面按语言适配（Owner 2026-11-08，T87）**：同一个模板可以给每种页面语言各配一套封面（前图、后图、动态封面），例如海报、菜单类模板的封面上有文字时，中文页显示中文字的封面，英文页显示英文字的封面。现有 `cover_before_url` / `cover_after_url` / 动态封面字段是**通用封面**（不属于任何语言，所有语言都能用）；新增 `cover_locales`（jsonb，默认 `{}`，结构 `{ "zh": { "before": "…", "after": "…", "video": "…" } }`，只加不改）。显示规则（Owner 2026-11-08 定，不写死任何语言）：按**页面语言**（`/zh` 是中文、根路径是英文，以后加的语言同理；页面语言本身已按 T217 规则跟随浏览器主语言提示切换）找该语言的专属封面，有就用；没有就用通用封面；通用封面也没有、只有某一种语言的封面时，**所有语言都显示这一张**（有多种语言封面时按后台语言页签的顺序取第一个）。也就是说只上传一套封面时，所有语言都显示它；只有给某种语言另外上传了封面，这种语言的用户才看到专属版本。是否做其他语言版本完全由 Owner 决定，有的海报英文排版更好看，就只用一套。所有展示封面的地方都按这个规则：首页和落地页模板区、创作页模板卡片和弹窗、收藏、伙伴接口（按请求的语言参数）。后台模板编辑页的封面区加语言页签（通用 / 中文 / 英文…，以后加语言自动多一个；每个页签都可以空着），每个语言单独上传、替换、删除；T85 试跑的「设为封面」先选设到哪个语言。封面压缩、公开桶和缓存规则不变。迁移编号段 `0820`～`0839`。
  - **一键转成其他语言（Owner 2026-11-08）**：后台封面区在任意一张已定好的「后」封面上点「生成其他语言版本」，勾选目标语言（例如英文、日文），系统用出图模型做「只把图上的文字翻译成目标语言，版式、字体风格、颜色、画面其他内容都不变」的编辑，每种语言一张（可以重跑），结果先给 Owner 预览，满意再点「设为该语言封面」。走 T85 试跑的同一套记录和费用规则（不扣积分、计入成本对账「后台试跑」、受每日预算限制）。「前」图一般是没有文字的原照片，各语言共用，不翻译；动态封面不翻译，各语言单独上传或退回默认。翻译用的提示词放在 `template_prompts` 的系统参数里（后台可改，不进仓库）。
  - **可配置的语言列表**：后台封面页签显示的语言 = 网站已上线的语言 + `site.config` 里登记的「准备中」语言（先登记日语 `ja`），所以可以在某种语言的页面上线之前先把封面准备好；准备中语言的封面在前台不显示，等那个语言的页面上线后自动生效。
  - **数据定义（T87，2026-11-08，开发窗口提案经总控确认，迁移 `0820`～`0824` 起）**：

###### 表

- `templates.cover_locales`（0820）：jsonb，非空，默认 `{}`，约束 `jsonb_typeof = 'object'`。每种语言一项，键都可选：`before`、`after`（静态图地址）、`media`（`animated` / `video`）、`video`、`poster`（动态封面和封面帧）。语言码是短小写标签（`en`、`zh`、`ja`、`pt-br`），已上线和「准备中」的语言都能存。
- `admin_test_runs.kind`（0821）：允许值加 `translate`（「生成其他语言版本」）。这类试跑没有父记录、没有测试照片；来源封面、来源语言（null = 通用）、目标语言记在 `inputs`。

###### 函数（都只授权 service_role，函数里核对管理员）

- `admin_begin_test_run`（0822，`create or replace`，签名不变）：另外接受 `kind = 'translate'`（`parent` 和 `photo` 都必须为空）；预算、锁、花费账本、幂等都和 0784 相同。
- `admin_set_test_run_cover`（0823，`create or replace`，签名不变）：
  - `p_locale` 为 null：写通用封面，和原来一样。
  - `p_locale` 为语言码：写 `cover_locales -> 语言 -> after`。只有模板还没有通用前图时，才同时写该语言的 `before`（前图各语言共用）。翻译出来的试跑没有测试照片，所以只会写后图。
- `admin_set_template_locale_cover(p_actor, p_template_id, p_locale, p_patch jsonb, p_assets_base text, p_locales text[], p_clear boolean default false)`（0824，新；审查后加 `p_assets_base`：地址必须在本站资源域名下；`p_locales`：服务端传入已上线语言，用于判断改动后已上架的站内模板是否仍有前图和后图，失去最后一张时抛 `COVER_STILL_NEEDED`，本来就不完整的模板允许补传；辅助函数 `_template_has_cover_parts`）：后台语言页签的上传、替换和删除，一次调用、一个事务。
  - 把 `p_patch` 合并进该语言：值为 null 表示删掉这个键；某个语言删空后整项去掉。
  - `p_clear` 为 true 时删掉整个语言。
  - 校验：键只能是上面五个，地址必须是 https，`media` 只能是两个值。
  - 返回新的 `cover_locales`。

###### 其他口径（不涉及数据结构）

- **前台怎么取封面**：前图、后图、动态封面三部分各自独立取。先看页面语言自己的；没有就用通用的；通用的也没有，就按已上线语言的顺序（`LOCALES`，即后台页签顺序）取第一个有的。准备中的语言前台永远不读。代码在 `core/templates/cover-locales.ts`，由 `localizeTemplate` 统一套用，所以首页、落地页、创作页卡片和弹窗、收藏、作品页都一致。
- **伙伴接口**：`GET /api/partner/templates?locale=zh` 返回该语言页面显示的封面。不带或不认识的值按英文处理，响应结构不变。
- **「准备中」语言**：`site.config.locales.upcoming = ['ja']`（`defineSite` 里是可选字段）。后台封面页签依次是：通用、已上线语言、准备中语言。中文名用 `Intl.DisplayNames` 生成，加语言不用写文案。
- **翻译提示词**：放在 `edit` 模板 `model_params.cover_translate`（`editParamsSchema` 的可选键），在「作品编辑的判断题和约束段落」页编辑。`{{language}}` 会换成目标语言的英文名（`Intl.DisplayNames`）。没填时翻译不可用，提示去填。
  - 出图参数：输入是来源后图（从公开桶按地址取）；尺寸跟随原图（`original`）；清晰度默认 2K；质量档和 `input_fidelity` 用 edit 模板的。
  - 没有用户输入的文字，所以不走换脸判断。
- **上架条件（总控 2026-11-08 按 Owner「只传一套封面所有语言都用它」改）**：站内模板上架要求「前图和后图各至少有一张」，可以来自不同地方（例如通用前图 + 中文后图），因为前台按部分各自取封面，每种语言都能取到前后图；只有「准备中」语言的封面不算。T87 一并修改 `publish-rules` 和批量编辑的校验：批量编辑新增 5 参数重载 `admin_bulk_edit_templates(…, p_locales text[])`（0825，由服务端传入已上线语言，不设默认值），旧的 4 参数版本（0640）保留给已部署的旧代码，T87 上线稳定后由收尾卡删除。语言页签删除封面时，如果会让已上架的站内模板缺前图或后图，拒绝并提示。封面地址只接受本站资源桶的地址。翻译生成的结果只能设为它的目标语言的后图（`admin_set_test_run_cover` 遇到其他情况抛 `TRANSLATE_TARGET_ONLY`）；翻译试跑的 `prompt_version` 记为空，翻译提示词及其版本记在 `inputs`。

- **展示媒体支持三种**（Owner 2026-11-05，参考 Lovart）：静态图、动图、短视频。`templates` 增加 `cover_media_type`（`'image'` / `'animated'` / `'video'`）、`cover_video_url`、`cover_poster_url`（视频和动图的封面帧，静态图时为空）；前后对比图字段照旧，用于静态图模板和预览抽屉里的拖动对比。
  - 动图一律存动态 WebP：后台上传 GIF 也收，服务端转成动态 WebP（GIF 体积通常大 5～10 倍，拖慢首屏）。
  - 视频存 MP4（H.264）原文件，≤15MB、≤15 秒，服务端只做类型和大小校验，不转码；必须有封面帧：后台单独上传，或上传时浏览器从第一帧截图生成。
  - 同样按内容哈希命名，放 `covers/{template_id}/`。
- 用户照片和成品绝不进公开桶；公开桶里没有任何用户数据。
- 换图后首页和模板页通过按需重新生成（ISR revalidate）立即更新，不用重新部署。

会员到期后保留 90 天、续费恢复、删除前提醒，这些等有付费用户后再做。隐私政策写「你用来生成作品的照片会和作品一起保留，方便你随时再做一张；删除作品时一起删除。上传后没用来生成的照片 7 天后自动删除」（Owner 2026-11-06 改，T40）。

## 9. 公开创作库

完全遵循创作库规格，另加下面几条（Owner 2026-11-04 确认）：

1. **付费墙与 8 周闸门并存**：从上线第一天起，用免费积分生成前就看到「作品将公开展示」的告知，免费作品（`credit_pool = 'free'`）`visibility = 'public'`。但前 8 周 `gallery.enabled = false`，不生成任何 /g、/tag、/gallery 页面。付费作品默认 `private`，本人可以随时改公开或改回。
2. **不另建作品表**：创作库规格第 3 节的 `ugc_works` 表不单独建。公开作品就是 `generation_jobs` 里 `status = 'succeeded' AND visibility = 'public'` 的记录。`indexable` 字段不要，作品页永远 noindex。
3. **公开数据不含核心提示词**：只展示模板名和用户自己填的文案。「一键复用」= 同一模板 + 同样参数 + 换成复用者自己的照片。
4. **标签选词看搜索意图**：标签主词必须是图片类或商用意图的词（如 `grilled salmon photo`、`cafe menu photos`），不收菜谱类意图的词。建站规格第 5 节「明确不做的词」不得进入标签白名单。每个标签上线前核实美国搜索量和哥飞版 KD，并检查前十名的页面类型。
5. **审核放到第 6~7 周**：和作品审核后台页一起做，在第 8 周开放创作库之前完成。审核方案到时再定，要指定具体服务，不写「含人脸」这种无法验证的规则。
6. 免费作品可以被本人删除（隐私法规要求），但不能设为私密。

## 10. 管理后台

### 10.a 后台改进（Owner 2026-11-08，T77～T79）

- **用户管理改成列表（T77）**：`/admin/users` 打开就是用户列表，每页 50 个、按注册时间倒序，页码翻页并显示总数。列：邮箱或手机号、会员等级标签（免费 / Starter / Pro / Max，带月付 / 年付和到期日）、付费 / 免费积分、注册方式（邮箱 / Google / 手机号）、注册时间、最近出图时间、状态（正常 / 已封禁）。筛选：会员等级、注册方式、状态、注册日期范围；搜索框沿用万能查找（邮箱或片段、手机号片段、用户 id、作品 id、订单号）。可以按注册时间、最近出图、付费积分排序。**批量操作**（勾选后出现，每次最多 50 个）：批量调积分（选池、填数量和原因，每人一条流水，同一批次重复提交不重复发）、批量封禁 / 解封（填原因）；确认框列出受影响人数，只在一个事务里执行，部分失败时整批不生效并说明原因。**用户详情改成同一页的弹窗**（手机上是全屏），内容和操作同现在的详情页；地址带 `?user=<id>`，工单、订单、出图记录里的用户链接都打开这个弹窗，旧的 `/admin/users/<id>` 跳转过来。列表查询走一个管理员才能调用的 SQL 函数，配索引。
  - **T77 的三个 SQL 函数**（迁移 `0620`～`0622`，只加函数和索引，旧代码不受影响；都只给 service_role 执行、`search_path = ''`、函数里再核对 `p_actor` 是管理员）：`admin_list_users(筛选, 排序, 页码)` 返回一页 50 行和总数，排序和筛选值走白名单，默认按注册时间倒序用索引直接取一页，按最近出图排序走 `generation_jobs(user_id, created_at desc)` 索引；`admin_batch_adjust_credits(p_actor, 用户 id 数组, 池, 数量, 原因, 批次 id)` 每人走 `_apply_credit_change` 记流水，幂等键 `admin_batch:<批次 id>:<用户 id>`，余额不会被扣成负数，整批一个事务；`admin_batch_set_banned(p_actor, 用户 id 数组, 封禁或解封, 原因)` 整批一个事务，**选中的人里有管理员或操作者本人时整批拒绝**（界面上这些行的勾选框也不可选）。两个批量函数都把操作的管理员记进流水原因和后台操作日志。
- **后台界面排查（T78）**：所有后台页面在 1280 / 1440 / 1920 和手机宽度下逐页检查重叠、溢出、截断，按 DESIGN 修好（例如出图记录的「模板」下拉和「模型」输入框重叠）。模板页和用户页另有任务卡负责，这里只记录问题不改。
- **出图编号（T78）**：每次出图都有固定的编号，就是任务 id 的前 8 位（不够区分时显示更长）。后台出图记录加「编号」列（点一下复制），筛选区加「编号」搜索（输入 6 位以上前缀即可），万能查找也认编号。用户在作品详情里能看到这张图的编号（小字，可复制），详情页加「这张图有问题？」，打开帮助弹窗并自动带上编号；工单里显示关联的作品编号，后台点开直接跳到那一单出图记录。
- **成本对账说明（T78）**：页面说明写清楚「OpenAI 实际扣费」是这个 OpenAI 项目下所有用量，测试站、本地开发如果用同一个项目的密钥也会算进去；「我们记录的成本」只算正式站数据库里有成本的出图。
- **模板批量编辑（T79）**：模板列表勾选后，除了上架 / 下架，还能批量改：三档积分（每档可单独填，留空不改）、展示入口（站内 / 伙伴 / 两者）、质量档（high / medium），以及 T75 之后的分类。保存前逐个模板按第 6.1 节下限校验（质量档变了按新档的下限算），有任何一个不合格就整批不保存并列出是哪些模板、差多少；确认框列出要改的字段和模板数；整批在一个事务里完成，保存后 `revalidateTag('templates', 'max')`。

### 10.b 后台模板试跑（Owner 2026-11-08，T85）
- T97 首次试跑默认附上当前模板的画风参考图，管理员可勾「本次不带参考图」作对照。结果卡显示实际附上的张数；编辑试跑不附图，费用按供应商真实用量记录。


建模板、调提示词、做封面都在后台完成，并且**完整走一遍用户的链路：首次出图 → 在结果上编辑 → 在编辑结果上再编辑**。
- **入口**：模板编辑页（新建或编辑都有）右侧「试跑」面板。草稿（未上架）模板也能试跑。
- **首次出图**：上传测试照片或从「最近用过的测试照片」里选（只存测试用，和用户照片分开），选清晰度（默认标准），填模板的文字字段和补充说明，点「试跑」。可选「一次跑 3 张」：同一版提示词跑 3 张不同照片，或同一张照片跑 3 次。「出图模型」默认使用模板当前配置，可为本次比较指定其他 image 供应商或默认供应商；这次选择不写回模板。走和用户出图**完全相同**的流程：同样的提示词拼法、供应商、质量档、换脸判断（§5.1a）。
- **编辑**：任何一次试跑结果都可以点「编辑」，写一句要改的地方，走和用户作品编辑（§5.2）**完全相同**的流程（范围判断、兜底、换脸判断、计价规则）；编辑同样支持「一次跑 3 张」（同一句话跑 3 次，或对 3 个结果各跑一次）。编辑结果上还能继续编辑，形成一棵记录树。
- **记录和对比**：每个模板保留最近 50 条试跑 / 编辑记录（含当时的提示词版本、实际模型名、清晰度、说明文字、耗时、成本），按树状显示；可以勾两条并排对比。
- **设为封面**：任意一条结果一键设为「后」封面，它的源照片设为「前」封面，按封面规则自动压缩；动态封面照旧单独上传。
- **费用**：不扣任何积分；每次显示真实成本，计入成本对账并标「后台试跑」；默认每天 5 美元上限（后台可改），到上限后当天不能再试跑。
- **隔离**：只有管理员能用；试跑结果不进管理员账号的作品、不计入出图统计、漏斗和 PostHog 事件（`source = admin_test`）；没设成封面的结果和测试照片 30 天后删除（打开试跑面板时顺带清理，不加定时任务）。
- 迁移编号段 `0780`～`0799`，只加不改。

**数据定义（T85，2026-11-08，开发窗口提案经总控确认）**

#### 为什么不写进 `generation_jobs`

`source = admin_test` 用独立的表实现，不往 `generation_jobs` 加行：
- 旧代码 `jobRowSchema` 的 `source` 是 `web | graylum` 的严格枚举、`credits_cost` 要求正整数；迁移先于代码上线，正式站旧代码读到 `admin_test` 行会报错。
- 作品页、创作库、限频、概览统计、出图记录、失败率告警、争议证据、删号清理都读 `generation_jobs`，每一处都得加排除条件，漏一处就泄露。独立表天然不进这些地方。
- 共用的是流水线代码（提示词拼法、供应商、质量档、换脸判断、编辑范围判断和约束段落、出图调用、超时、成本计算），只有「谁付钱、存哪里」两处换成试跑自己的实现。

#### 表 `admin_test_photos`（私有：开 RLS、无 policy，只有 service role 读写）

| 字段 | 说明 |
|---|---|
| `id` | uuid |
| `object_key` | 私有桶 `admin-tests/photos/{id}.{jpg,png,webp}`，唯一 |
| `created_by` | 上传的管理员，`on delete set null` |
| `created_at` / `last_used_at` | 「最近用过的测试照片」按 `last_used_at desc` 取 12 张；每次试跑更新 |

索引 `(last_used_at desc)`。

#### 表 `admin_test_runs`（私有，同上）

| 字段 | 说明 |
|---|---|
| `id` | uuid（浏览器生成，重复请求返回同一行） |
| `template_id` | 被试跑的模板，`on delete cascade` |
| `kind` | `generate`（首次出图）/ `edit`（在某条结果上编辑） |
| `parent_id` | 编辑时被编辑的那条试跑（同一模板、成功、有成品），`on delete set null`；首次出图为空。形成记录树 |
| `photo_id` | 源测试照片；编辑继承父记录的，`on delete set null` |
| `batch_id` | 同一次点击（一次 3 张共用一个） |
| `status` | `running` → `succeeded` / `failed` |
| `resolution` | `1k` / `2k` / `3k` |
| `inputs` | jsonb：文字字段、比例、补充说明；编辑时用户原话、判出的范围、confidence、keep、change。不存封装提示词 |
| `prompt_version` | 当时用的 `template_prompts.version`（编辑记 `edit` 模板的版本） |
| `provider` | `<供应商 id 或 env>/<模型名>` |
| `provider_usage` / `cost_usd` | 同 `generation_jobs`（§10.0），失败但供应商回了用量也记 |
| `estimate_usd` | 开跑时为预算占用的估算（按清晰度的正方形输出 token × 输出单价，加输入余量） |
| `output_key` | 私有桶 `admin-tests/outputs/{id}.png` |
| `error_code` / `duration_ms` | |
| `cover_set_at` | 设为封面的时间；不为空的记录和它的源照片不被 30 天清理 |
| `created_by` / `created_at` / `finished_at` | |

索引 `(template_id, created_at desc)`（面板列表，取 50 条）、`(created_at)`（当天预算、清理、成本对账）。

#### 表 `admin_test_spend`（私有，同上；审查后新增，2026-11-08）

每次试跑一行，**没有外键**（删模板、裁剪 50 条、30 天清理都不影响它），100 天后才清。字段：`run_id`（唯一）、`template_id`（只记值）、`day`（北京时间自然日）、`cost_usd`、`counted_as`（`actual` 真实成本 / `estimate` 调过出图模型但算不出成本时按估算 / `zero` 未调用模型或 10 分钟超时）、`created_at`。T92 增加 `provider text`（同试跑的供应商/模型快照，迁移前已被裁剪的归为未知）和 `has_openrouter boolean`（是否记录到 OpenRouter 用量），即使试跑明细被删除也能按模型对账。**每日预算和成本对账页的「后台试跑」都只读这张表。**预算判断和占用（`admin_begin_test_run`）在任何模型调用之前完成，包括换脸判断和编辑范围判断；超预算一个模型都不调。换脸被拒的试跑记为 `failed / IDENTITY_SWAP_REFUSED`，判断用掉的 token 计入成本。试跑不占管理员的换脸判断配额，也不计入「AI 供应商」页的用户统计。清理改为 `POST /api/admin/test-runs/cleanup`（同源校验）。

#### 函数（普通 plpgsql，`search_path = ''`，只授权 `service_role`；带 `p_actor` 的在函数里再核对是管理员）

- `admin_begin_test_run(p_actor, p_run_id, p_template_id, p_kind, p_parent_id, p_photo_id, p_batch_id, p_resolution, p_inputs, p_prompt_version, p_provider, p_estimate_usd)`：按 `p_run_id` 幂等；advisory lock 串行化预算判断；当天（北京时间自然日）已花 = 已结束记录的 `cost_usd` 合计 + 10 分钟内仍在跑的记录的 `estimate_usd`；已花 + 本次估算 > 预算就抛 `TEST_BUDGET_EXCEEDED`（不调用供应商）。编辑时校验父记录、继承 `photo_id`；更新照片 `last_used_at`。返回新行。
- `admin_finish_test_run(p_run_id, p_status, p_output_key, p_error_code, p_provider_usage, p_cost_usd, p_duration_ms)`：只从 `running` 结束，重复调用返回原行。
- `admin_test_budget_status()`：返回预算、当天已花、当天试跑次数、北京时间日期。
- `admin_set_test_run_cover(p_actor, p_run_id, p_before_url, p_after_url, p_locale text default null)`：`p_locale` 为空时写通用封面，指定语言时写该语言的专属封面（T87 实现，此前传语言返回 `INVALID_INPUT`）；同一事务里更新模板的前后封面地址、记 `cover_set_at`。WebP 转换和写公开桶在应用里先做（和现有封面上传同一套压缩规则）。
- `admin_cleanup_test_runs(p_actor)`：打开面板时调用。删掉 30 天前且没设成封面的记录；每个模板超出最近 50 条的（不含封面记录）；30 天没用过、也不是封面记录源照片的测试照片；10 分钟还在 `running` 的标成 `failed / TIMEOUT`。返回要从 R2 删除的 key 列表，应用尽力删除、失败只记日志。
- `admin_test_daily_costs(p_days)`：成本对账页按 UTC 日返回试跑的 `cost_usd` 合计、次数和分供应商/模型的明细（`by_provider`）。两侧每日记录都标明是否含 OpenRouter 用量，混合费用的日期不与 OpenAI 账单计算差额。试跑合计和 `admin_daily_costs` 并列显示为「后台试跑」，计入「我们记录的成本」。
- 预算：`system_settings` 新键 `admin_test_daily_budget_usd`（数字，0～1000，默认 5），`admin_set_system_setting` 用 `create or replace` 加这个键。

迁移 `0780`～`0789`，只加表、索引、函数；`admin_set_system_setting` 只多认一个键，旧代码不受影响。

#### 其他实现口径（不涉及数据结构，供审查）

- 接口：`/api/admin/test-runs`（首次出图）、`/api/admin/test-runs/edit`（编辑）、`/api/admin/test-photos`（预签名上传）；一次 3 张是浏览器并发 3 个请求（Server Action 在同一页面是串行的，所以不用 Server Action）。只有管理员能调，非管理员 404。
- 换脸判断照常调用；试跑被拒不写 `identity_refusals`（否则管理员账号会被标红），不发 `generate` / `generate_refused` 事件。
- 封面：结果设为「后」、源照片设为「前」，按 §8.3 封面规则转 WebP（长边 1600、质量 82）写公开桶，`revalidateTag('templates', 'max')`。

### 10.c 企业咨询（Owner 2026-11-08，T86）

价格页「联系我们」弹窗表单（字段见 DESIGN §6.9 第 8 条）提交到服务端，存进新表 `business_inquiries`（私有：开 RLS 无 policy，只有 service role 读写）：`id`、`created_at`、`locale`、`page`、`user_id`（已登录时，可空，`on delete set null`）、各表单字段（文本和多选数组，长度在服务端再校验）、`status`（`new` 新咨询 / `contacted` 已联系 / `won` 已成交 / `closed` 无效或关闭）、`admin_note`（Owner 备注）、`updated_at`、`ip_hash`（防刷用，不存明文 IP）。
- 防刷：隐形 hCaptcha（正式站开启时）；同一 IP 每小时 3 条、每天 10 条，同一邮箱每天 3 条；超了提示「提交太频繁，请稍后再试」。
- 提交函数 `submit_business_inquiry(p_inquiry jsonb, p_ip_hash text) returns jsonb`（只给 service role）：服务端校验通过后调用，一次往返里先按 IP 哈希、再按邮箱加 advisory 锁数限额，未超就插入一行（邮箱去空格转小写），返回 `{status, id}`：`status` 为 `ok`（带新 `id`）或 `ip_hourly` / `ip_daily` / `email_daily`（`id` 为空）。`ip_hash` 是服务端用 HMAC-SHA256 算的（密钥由 service-role key 派生），不存明文 IP。迁移 `0800`（表、索引、RLS）、`0801`（函数）。
- 后台新页「企业咨询」（`/admin/inquiries`，导航放在「工单」旁边）：列表按时间倒序，显示公司、姓名、邮箱、出图量、用途、状态，可按状态筛选；点开看全部字段，改状态、写备注；新咨询数在后台导航上显示角标。
- 提交成功发飞书告警（T72 新增种类「新企业咨询」：公司名、出图量、用途，带后台链接，不带邮箱和电话）。
- 隐私政策补一句：企业咨询表单收集的联系方式只用于回复本次咨询。迁移编号段 `0800`～`0819`，只加不改。

### 10.0 真实出图成本（Owner 2026-11-06，T33）

后台的成本一律用供应商回传的真实用量算，不再用固定单价估算。

- **每单成本**：出图（`/v1/images/edits` / `generations`）返回的 `usage` 写进 `generation_jobs.provider_usage`，结算时乘在用供应商的三项单价得到 `cost_usd`，和结算在同一次调用里写入（`confirm_job` / 失败退回的函数多收两个参数，不另开往返）。失败的任务只要供应商回了用量也记成本（供应商照样收钱）。作品编辑把判断那一步的输入 token 也算进这一单。
- **后台显示**：出图记录每单显示成本；概览按天、按模型汇总真实成本和单张平均成本；单价没填的供应商在后台供应商页标红提示。
- **单价不用手填**（Owner 2026-11-06）：代码里内置一张常用模型的官方单价表（`MODEL_PRICES`，按模型名，含出图和判断用的模型，注明取价日期和来源页）。新建或编辑供应商时按模型名自动带出单价；供应商行没填单价时按这张表算成本；后台仍可覆盖（例如中转站价格不同）。OpenAI 没有官方的价格接口，所以价格表随代码更新：官方调价时开 PR 改表；成本对账页如果连续几天和账单差得多，就提示「单价可能过期」。
- **和 OpenAI 实际账单对账**：后台「成本对账」页（`/admin/costs`）按天列出近 30 天 OpenAI 实际扣费（OpenAI Costs API `GET /v1/organization/costs`，按 `api_key_id` 或项目筛选，和发票对得上）和我们逐单加总的 `cost_usd`，并显示差额。需要 Owner 在 OpenAI 组织设置里建一把**管理员密钥（Admin key）**，和出图密钥分开，存进 Supabase Vault（和 §3.3 同一做法，后台填、只显示后 4 位）；没填时这一页只显示我们自己的合计并提示去填。读取在打开页面时进行、缓存 1 小时，不写定时任务。对账只读，不改任何数据。
- 供应商是 OpenRouter 这类会在响应里直接给出费用的中转时，以响应里的费用为准（适配器负责换算），单价字段可以不填。目前预览和生产都用 OpenAI 官方接口。

v1 后台（Owner 2026-11-06 扩充；T23 做外壳和运营页）：**一个后台外壳**（左侧导航、中文、`/admin` 是概览首页），下挂下面这些页面。**只做本站已有的功能，不照搬 Graylum 后台**：Graylum 的工单、创始会员、导师、技能、发布监控等本站没有，不做。

| 导航 | 路由 | 内容 |
|---|---|---|
| 概览 | `/admin` | 今日 / 近 7 天 / 近 30 天：注册数、出图数、出图成功率、消耗积分（免费 / 付费分开）、新增付费用户、收入；近 30 天出图和收入趋势图。非收入部分由 `admin_dashboard_stats(p_days)` 一次算完；收入由 `admin_revenue_stats(p_days)` 算（T9 之后才有） |
| 用户 | `/admin/users` | 按邮箱搜（读 `admin.users_overview`，最多返回 50 条）。用户详情：积分两池、会员到期、最近出图、积分流水（分页）。操作：调积分（`admin_adjust_credits`，选池、填原因）、封禁 / 解封（`admin_ban_user` / `admin_unban_user`，填原因） |
| 邀请与兑换码 | `/admin/codes` | 码管理、毛利校验、兑换明细（含重复折扣付款）、邀请统计与同 IP 拦截。后台只用中文。 |
| 订单与收入 | `/admin/orders` | 付款记录（时间、用户邮箱、商品、金额、付款方式、渠道、状态）和订阅状态，按商品和渠道汇总收入；每行链接到 Stripe 后台对应记录。退款仍在 Stripe 后台操作。数据来自 T9 的表，T9 合并后才有 |
| 出图记录 | `/admin/jobs` | 全部出图任务，按状态、模板、供应商 / 模型、来源（web / graylum）、日期筛选，游标分页；失败任务显示 `error_code`；每单显示真实成本 `cost_usd`；按模型和清晰度统计次数和真实成本合计（T33 起；T33 之前的老任务没有用量，按旧的代码常量估算并标「估算」） |
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
   - **拖动排序（Owner 2026-11-08，T76）**：「首页精选」列表和模板列表都改成拖动排序，不再只能一次点一下上下箭头。每行左边有一个拖动把手：电脑上按住把手直接拖，手机和平板上长按整行约 0.3 秒后拖；拖动时显示放下的位置，靠近列表边缘时自动滚动。键盘也能排序（把手获得焦点后按空格拿起、方向键移动、空格放下、Esc 取消），读屏有提示。放下后**整个列表的新顺序一次保存**（一个 SQL 函数在同一事务里重写这一组的序号，不逐条改），界面先按新顺序显示，保存失败就退回原顺序并提示。模板列表在搜索或筛选状态下不能拖（只排一部分会把顺序搞乱），把手变灰并提示「清空搜索后可拖动排序」。上下箭头保留但缩小，作为备用。拖动排序做成后台共用的组件，以后的分类排序等列表直接用。保存后照旧 `revalidateTag('templates', 'max')`。
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
- **后台查看作品**：服务端签发 5 分钟有效的 R2 读取地址。成品看无水印原图；输入图已删除时（T40 之前超过 7 天的老作品）显示「已过期」。每次查看写一条审计日志 `view_work`（`admin_audit_log` 的 `action` 允许值加上 `view_work`，并新增 `target_id`）。隐私政策同步加一句：客服和安全需要时，我们可能查看你上传的照片和生成的图片，每次查看都有记录（Owner 2026-11-06 同意）。
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
  - **在弹窗里完成（Owner 2026-11-07，T68）**：点「Help & feedback」不跳页，在账号页上直接弹出工单弹窗（电脑是居中对话框，手机是全高底部抽屉，按 DESIGN 的 Sheet 样式）。弹窗里两个页签「新建工单」「我的工单」；点开一张工单在弹窗内显示往来消息，并能直接补充回复；提交成功、返回列表都不离开弹窗。原来的 `/account/help`、`/account/help/new`、`/account/help/[id]` 保留为深链：打开后跳到 `/account?help=new` / `?help=list` / `?help=<id>`，账号页读这个参数自动打开弹窗到对应位置（页脚「Contact」指向 `/account?help=new`，未登录先去登录）。
  - **提交工单**：
    - 类型并列成一个普通列表，按顺序是：意见反馈、出图问题（可选附一张自己的作品）、付款问题（可选附一笔自己的付款）、退款申请（必须选一笔自己的付款）、账号问题、其他。退款申请的样式和其他项一样，不做突出。
    - 正文不超过 2000 字。
    - **可以附图片（Owner 2026-11-07，T69）**：新建工单和每次补充回复都能附最多 3 张图片（截图或照片），JPG / PNG / WebP / HEIC（HEIC 在浏览器端转 JPEG，同出图上传），每张 ≤ 10 MB。走现有的 R2 直传：私有桶 `tickets/<user_id>/<ticket_id>/` 前缀，上传后服务端校验类型和大小、清除 EXIF、转 WebP，失败的删掉；图片只能用户本人和管理员经签名地址查看，不进创作库、不进公开读取。删工单 / 删号时一并删除文件。管理员回复也可以附图。
    - 「我的工单」里能看到状态（已提交 / 已回复 / 已关闭）和往来消息，用户可以在工单里补充。
    - 中英文文案都要有，页面 `noindex`。
  - **退款全部人工处理**：后台打开退款工单时，显示这笔付款的信息、`refund_eligibility(payment_id)` 给出的三项参考检查（是否首次购买、是否在 7 天内、付款后是否用过任何积分），以及建议退款金额（税前价 × 94% + 全部税额，Owner 可以改）。Owner 选择同意（填金额）或拒绝，写回复，系统记审计日志 `decide_refund`。Owner 到 Stripe / Waffo 后台完成退款，退款回调更新付款状态并自动扣回积分（T71）；用过积分的人工审核先点「扣回这笔付款的剩余积分」再按比例退款。**不写任何自动退款或会动钱的代码。**
  - **数据**：
    - `support_tickets` 表：`id`、`user_id`、`type`（`feedback` / `image_issue` / `billing` / `refund` / `account` / `other`）、`status`（`open` / `replied` / `closed`）、`payment_id`、`job_id`（都必须是本人的）、`refund_decision`、`refund_amount_cents`、`created_at`、`last_message_at`、`user_seen_at`、`closed_at`。
    - `support_ticket_messages` 表：`id`、`ticket_id`、`author`（`user` / `admin`）、`body`（不超过 2000 字）、`created_at`。
    - `support_ticket_attachments` 表（T69，迁移编号段 `0500`～`0519`，只加不改）：`id`、`message_id`、`ticket_id`、`object_key`、`content_type`、`bytes`、`width`、`height`、`created_at`；每条消息最多 3 行（函数里校验）；RLS 同工单，写入只经服务端。
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

**前台的后台入口**（Owner 2026-11-07）：管理员登录后，在账号页（「账号」分组最上面一行「管理后台 / Admin」）和电脑端应用顶栏最右侧（和其他标签同样式；手机底部标签栏不加，DESIGN §8.2）各有一个「Admin / 管理后台」入口，链到 `/admin`。入口由服务端按 `profiles.role = 'admin'` 决定是否渲染，普通用户的页面和打包代码里都不出现这个入口；入口本身不是权限控制，`/admin` 的访问检查照旧。

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

### 12.0 预上线收录开关（Owner 2026-11-06：绑域名过支付审核，但上线前不被任何搜索或 AI 引擎收录）

- **一个开关**：服务端环境变量 `SITE_INDEXING`（`on` / `off`，默认 `off`；其他值启动报错）。只有 `SITE_INDEXING=on` 且 `VERCEL_ENV=production` 时才算「开放收录」；预览和本地怎么设都是关闭。
- **关闭时**：
  - `core/seo/indexing.ts` 对所有路径（英文和 `/zh`）都判不可收录，全站页面 `noindex, nofollow`（仍然只在这一处控制，AGENTS §9）。
  - 每个响应都带 `X-Robots-Tag: noindex, nofollow`，包括图片、JS、字体、robots、`/api/*`、404 和跳转（非 HTML 资源只能靠响应头）。
  - `robots.txt` 对 `*` 放行（Googlebot 和 Bingbot 必须能抓到页面才看得到 noindex；被 Disallow 的页面看不到 noindex，地址仍可能因外链进索引），对 AI 爬虫（GPTBot、OAI-SearchBot、ChatGPT-User、ClaudeBot、Claude-SearchBot、Claude-User、PerplexityBot、Perplexity-User、Google-Extended、CCBot、Applebot-Extended、Meta-ExternalAgent、Bytespider、Amazonbot）一律 `Disallow: /`；不写 Sitemap 和 Host 行。
  - `sitemap.xml`、`sitemap-pages.xml`、`sitemap-zh.xml`、`llms.txt` 返回 404。
  - 不提交 GSC / Bing sitemap、不用 IndexNow、不登记目录站。GSC 可以用 DNS TXT 先验证。
- **打开后**：恢复建站规格 R11 / G10 的规则（放行五个 AI 爬虫、发布 sitemap 和 llms.txt）。
- **非正式域名永远不收录**：host 不是 `shotviva.com` 的请求（`*.vercel.app`、预览地址）无论开关如何都带 `X-Robots-Tag: noindex, nofollow`；生产的 `shotviva.vercel.app` 308 跳到 `https://shotviva.com`。canonical 仍取自 `site.brand.domain`，不随环境变量变。
- **防误开**：单元测试覆盖默认关闭、预览下 `on` 仍关闭、非法值报错；`pnpm seo:check <url> --expect=closed|open` 在 GitHub Actions 每天对生产地址跑一次，期望值由上线 PR 从 `closed` 改成 `open`。
- `NEXT_PUBLIC_SITE_URL` 只在 Production 范围设为 `https://shotviva.com`（构建时写入，改完要重新部署）；不能设到 Preview。
- 不加 `trailingSlash: true`（建站规格 R4，且会弄坏 PostHog 代理）。

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
     - **精选模板由后台挑选，不写死在代码里**（Owner 2026-11-07）：`templates` 加 `featured_rank`（可空整数，空 = 不上首页，小的排前面）。后台模板列表加「首页精选」开关和排序（拖动或填序号），只能选已上架的模板，最多 12 个。首页模板区按第 5 节的分类顺序分组显示被选中的模板（没有被选模板的分类不显示），名称、说明（英文 `description` / 中文 `translations.zh.description`，规则同 T52）、封面都从数据库读；SEO 落地页的模板列表同样从精选里按分类筛。页面仍是静态生成，打 `templates` 缓存标签；后台保存后用 `revalidateTag('templates', 'max')`：先照常给访客缓存页，后台再生成新页，保存后的第一位访客可能还看到一次旧内容，但不会被阻塞等待（性能卡 #235，总控 2026-11-07；公告横幅仍立即失效，因为可能是紧急通知）。模板名称和说明照旧出现在页面源码里。一个都没选时，退回显示最新上架的 6 个。`site/content` 里写死的模板清单和 `public/home/templates/` 的示意图删除（首屏示意图保留）。迁移编号段 `0400`～`0419`（T53）。
  4. 可核验事实块：免费额度、每张消耗、三档像素、上传限制、出图耗时（建站规格 G4 通用事实）
  5. 成本对比表：请摄影师 vs Shotviva
  6. FAQ 3~5 条
  7. 内链块：直链所有已上线的内页

  首页内容同样按第 12 节的固定结构写，五块缺一不可，模板网格是额外的一块。
- **v1 不建 `/templates`**：上线只有 6~8 个模板，首页已全部展示，另建一页会和首页内容重复、抢同一个词（建站规格 R1）。
- **建 `/templates` 的两个条件，同时满足才建**：① 模板数量达到 20 个以上；② 给它找到一个和首页不撞词、核实过美国搜索量和哥飞版 KD 的独立主词（如 `ai food photo templates` 这一类），并登记进主词表 CSV。建好后首页只放精选模板，`/templates` 放完整模板库和分类筛选；分类页以后按创作库标签页的规则接长尾词。
- 「我的作品」页要有，`noindex`。
- 账号页要有：「Integrations / 集成」区块（Owner 2026-11-06，T34）：列出可连接的外部产品，现在只有 Graylum 一行，显示状态「Enabled / 已启用」或「Not enabled / 未启用」，点进去是连接 / 断开（第 14 节）；以后加别的集成就在这里加一行，不在账号页单独放；**删除账号**（服务端路由：**先在 Stripe 立即取消这个用户所有未结束的订阅**（`subscriptions.cancel`，不按比例退款；任何一个取消失败就整件事停下、不删号，提示用户稍后再试或联系客服，Owner 2026-11-06 发现删号后 Stripe 仍会续费扣款），再 `auth.admin.deleteUser` + 按 `inputs/{user_id}/`、`outputs/{user_id}/`、`requests/{user_id}/` 前缀清 R2 + `generation_jobs` 级联；Waffo 没有订阅，不用处理），`noindex`。
- **Graylum 连接器的 Shotviva 侧随 v1 一起上线**（Owner 2026-11-05 拍板），见第 14 节。
- 应用页用第 1 节的 `(app)` 应用壳，按 DESIGN.md 第 8 节先出手机稿。
- **模板需求墙（Wishlist）随 v1 上线**（Owner 2026-11-05 决定），占应用壳第四个 tab，见第 15 节。

v1 不做：积分引擎抽象层、积分过期和批次、订阅的宽限期 / 自动扣回 / 升级降级 / 自写取消界面（Waffo 卡订阅的取消按钮除外）、自动故障切换、自动退款、保留期定时任务、提醒邮件、内容审核、作品审核页、第 10 节表格以外的后台页、英文和简体中文以外的语言（`/ja`、`/id` 等，见建站规格 §6）、多行菜单 / 价格单的排版功能（单张促销海报模板要做，见第 5 节）、视频生成实现、服务端 HEIC 转码、原图存储、断点续传、PWA / 离线、需求墙的评论 / 通知 / 重复合并 / 分类筛选。

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

- 开关分两层（见本节最后一条，T62）：`site.config.ts` 的 `features: { wishlist: boolean }` 决定这个站有没有这个功能；有的话，开不开由后台运行时开关决定。
- `features.wishlist = false` 时：tab bar 只渲染三项；`app/(app)/wishlist/*` 和 `app/api/wishlist/*` 返回 404；后台的需求审核页不出现在后台导航且直接 404；`template_requests` 两张表的迁移仍然跑（表空着无害，避免模板站的迁移序列分叉）。
- 判断只在一处：`core/wishlist/index.ts` 导出 `isWishlistEnabled(site: SiteConfig)`，**配置由调用方传入**（core 不能 import `site/`，写法同 `core/config` 的 `isModuleEnabled(site, id)`）；`features` 的类型加在 `core/config/define-site.ts`。路由、layout、后台导航都调它，不准各自读 `features.wishlist`（总控 2026-11-05 补）。
- **后台运行时开关（Owner 2026-11-07 改，T62）**：需求墙开不开由 Owner 在后台「功能权限」页自己控制，不再改代码。两层：
  - `site.config.features.wishlist` 改为「这个站有没有需求墙这个功能」（模板仓库开别的站可以整个去掉）。`false` 时一切照旧：后台开关不出现、路由 404。Shotviva 设为 `true`。
  - 运行时开关存一行 `system_settings`（key `wishlist_enabled`，默认关），只有 `role = admin` 经 RPC 能写，客户端读不到表；读取走 `'use cache'` + `cacheTag`，后台保存时 `updateTag`，改完不用部署、马上生效。
  - `isWishlistEnabled(site)` 仍是唯一判断处：`features.wishlist && (运行时开关 || 预览覆盖)`；`FEATURE_WISHLIST_PREVIEW=on` 仍只在非生产生效。
  - 关掉时行为和原来 `features.wishlist = false` 一样（tab 三项、路由和接口 404、后台审核页隐藏）；已有的需求和投票数据保留，重新打开后原样出现。

## 16. 埋点与错误监控（Owner 2026-11-05）

只用两家：PostHog（美国区，项目 712352）做产品和流量分析，Sentry 做错误告警。代码统一放 `core/analytics/`，页面和接口只调用 `track()` / `captureError()`，不准各自直接引 SDK。

### 16.1 PostHog 配置

- **按地区决定是否用 Cookie（Owner 2026-11-07，T70）**：欧盟、欧洲经济区、英国、瑞士以外的访客，浏览器端 `persistence: 'localStorage+cookie'`，匿名访客跨刷新、跨天能连成一条路径，不弹任何东西；这些地区的访客默认 `persistence: 'memory'`（不写 Cookie、不写本地存储），页面底部显示一条同意条（「接受」/「仅必要」，中英文，按 DESIGN 样式，不挡内容），点「接受」后切换为 Cookie 记录并记住选择，点「仅必要」保持现状且不再询问；页脚加「Cookie 设置」可以改主意。地区由服务端读 Vercel 的 `x-vercel-ip-country` 决定并传给页面，读不到时按需要同意处理。不用 Termly 等第三方同意平台（只有 PostHog 一家用 Cookie）。登录后用 Supabase 用户 id `identify`，注册前的匿名行为并到账号下。隐私政策补「统计与 Cookie」一节，列进律师审阅清单。
- 录屏（Session Replay）的遮挡在代码里先配好（T70）：所有输入框和文本域遮挡、用户上传的照片和作品图片遮挡（加统一的遮挡类名）、后台和结账返回页不录；录屏本身是否开启、采样比例由 Owner 在 PostHog 后台决定（Owner 决定前保持关闭）。开启前隐私政策要写明。自动记录点击、热力图、Web Vitals 打开（PostHog 后台已开）。
- 走同域代理：`/ingest/*` 改写到 `us.i.posthog.com`，减少广告拦截造成的丢数。
- 公开变量：`NEXT_PUBLIC_POSTHOG_KEY`、`NEXT_PUBLIC_POSTHOG_HOST`（已在 Vercel 三个环境配好）；服务端用同一个项目密钥发事件。
- 不发任何个人信息：事件属性里不准出现邮箱、文案原文、补充说明 `note`、图片地址、提示词。

### 16.2 事件字典（名字和属性固定，改动走 [spec] PR）

| 事件 | 在哪发 | 属性 |
|---|---|---|
| `signup` | 服务端：邮箱验证完成 / 首次 Google 登录时（和注册赠送同一处） | `method`（`email` / `google`） |
| `upload` | 浏览器：直传 R2 成功后 | `size_bucket`（`<1MB` / `1-5MB` / `>5MB`）、`compressed`（是否走了浏览器压缩） |
| `generate` | 服务端：任务结算后（成功或失败都发） | `template_id`、`category`、`resolution`、`credits_cost`、`credit_pool`、`status`、`error_code`、`source`（`web` / `graylum`）、`duration_ms`、`model`（实际调用的模型名，不含密钥和地址）、`batch_size`（单张为 1，T28 起）、`edit_scope`（作品编辑时的范围或 `fallback`，模板出图为空，T30 起）、`toggles`（模板开关的选择 `{ key: true/false }`，模板没有开关时为 `{}`，T89 起） |
| `paywall_view` | 浏览器：付费墙打开 | `trigger`（`insufficient_credits` / `pricing_page` / `account` / `graylum` / `tier_required`） |
| `checkout_start` | 服务端：创建 Checkout Session 时 | `product_id`、`tier`、`interval`、`form`、`channel`、`method` |
| `purchase` | 服务端：支付回调入账成功后 | 第 6.2 节 `purchase` 参数 |
| `contact_sales_click` | 浏览器：定价页「For business」的 Contact us 按钮（DESIGN §6.9 第 8 条） | `page`（`/pricing` 或 `/zh/pricing`） |
| `business_inquiry_submit` | 浏览器：企业咨询表单提交成功（服务端已存下）后（T86，ARCHITECTURE §10.c） | `volume`（每月出图量档：`under_100` / `100_500` / `500_2000` / `2000_10000` / `over_10000`）、`uses`（主要用途数组，至少 1 个：`ecommerce` / `food_menu` / `social` / `real_estate` / `ads` / `other`）；不含任何联系方式或填写的文字 |
| `$pageview` | 浏览器：自动 | — |

T94 新增 `code_redeem`（服务端：kind、context、status、credits、pool、discount_percent，仅 campaign 传明文 code）、`invite_reward`（服务端：credits、product_id）、`invite_share`（浏览器：action 为 copy/share、surface）。`signup` 增加 code_kind，`checkout_start` 增加 code、discount_percent，`purchase` 增加 code、amount_discount_usd。用户邀请码不进分析事件。

所有事件都带 `locale`（`en` / `zh`，浏览器端注册为公共属性，服务端发时从请求或 `user_metadata.locale` 取；Owner 2026-11-06）。钱和积分相关的事件（`signup`、`generate`、`checkout_start`、`purchase`）一律服务端发，保证不被广告拦截漏掉；发送失败只记日志，不影响业务。

- **新增事件（T89，Owner 2026-11-08）**：`template_toggle`（浏览器：`template_id`、`key`、`action` = `confirm_shown`（弹出确认框）/ `confirmed`（勾选后点了开启）/ `cancelled`（取消或关掉确认框）/ `turned_off`（把带确认框的开关关掉）、`surface` = `workspace` / `create_dialog` / `home`）。后台试跑不发。
- **新增事件（T74，Owner 2026-11-07）**：`template_view`（浏览器：打开模板详情或在选择器里选中模板，`template_id`、`category`、`surface`）、`paywall_select`（浏览器：付费墙里选中商品，`product_id`、`method`）、`checkout_cancel`（服务端：结账取消返回，`product_id`、`method`）、`upload_error`（浏览器：上传失败，`reason` 枚举，不含文件名）。PostHog 打开 `capture_pageleave`（停留时间、最大滚动深度）。
- **新增事件（T90，Owner 2026-11-08）**：`app_update_prompt`（浏览器：新版本刷新提示条，`action`（`shown` / `refreshed` / `dismissed`）、`reason`（`version` 版本检查发现新版本 / `error` 旧页面找不到服务端函数或代码块）；每个新版本或每次出错只记一次 `shown`）。

### 16.2a 后台「流量与转化」页（Owner 2026-11-07，T74）

PostHog 的英文后台不好读，后台加一个中文页，用 PostHog Query API（HogQL，服务端用只读的个人 API 密钥 `POSTHOG_PERSONAL_API_KEY`，项目 `POSTHOG_PROJECT_ID`=712352）读数据，`'use cache'` 缓存 10 分钟，按中文展示；不搬 PostHog 全部功能，每块旁边有「在 PostHog 打开」链接。时间范围今天 / 7 天 / 30 天，带和上一周期的对比。

1. **每页表现**：浏览量、访客、平均停留时间、平均滚动深度、跳出率、从该页进站后注册 / 付款的比例（可排序）。
2. **转化漏斗**：进站 → 上传 → 出图 → 付费墙 → 开始结账 → 付款，每步人数和流失；可按 中 / 英、手机 / 电脑、来源、国家、新 / 老访客切换。
3. **付款环节**：付费墙里各商品被选次数与点去付款的比例；按付款方式（海外银行卡 / 中国银行卡 / 支付宝·微信支付 / Waffo）的「开始结账 → 付款成功」比例；结账取消次数。
4. **新用户激活**：注册后 24 小时内出第一张图的比例；注册到首次出图、首次付款的平均时长；免费积分用完后付款的比例。
5. **模板表现**：各模板浏览、使用、出图成功率、带来的付款。
6. **体验问题**：上传失败、出图失败次数与最常见原因；各页面真实打开速度（Web Vitals，慢的在前）。

每个指标名旁边一个「?」用一句中文解释含义。留存、续费率、渠道长期价值等第二批指标上线跑一两个月后再加。

### 16.3 Sentry

- 前后端都接 `@sentry/nextjs`；`NEXT_PUBLIC_SENTRY_DSN` 公开，`SENTRY_AUTH_TOKEN`（上传源码映射）放 Vercel 加密变量。
- 必须告警的：出图失败率异常、支付回调验签失败或处理失败、`charge.refunded`、退回积分失败（第 4 节 refund 失败会让积分卡在预扣状态）。
- 上报前去掉邮箱、令牌、提示词（复用 `core/logger` 的打码规则）。

### 16.4 业务告警（飞书群机器人，Owner 2026-11-07，T72）

Sentry 留给开发看技术错误；给 Owner 的是「业务告警」：一句中文大白话 + 后台链接，发到飞书群的自定义机器人（开启签名校验）。

- **发送**：`core/alerts` 一个 `notifyOwner(kind, facts)`，按 kind 套中文模板，POST 到 `FEISHU_ALERT_WEBHOOK_URL`（带 `FEISHU_ALERT_SECRET` 签名）；发送失败只记日志和 Sentry，绝不影响业务；同一事件重复只发一次（按事件 id 去重）；没配置环境变量时静默跳过（预览环境默认不发，测试时可单独配一个测试群）。
- **告警种类和文案方向**（金额用美元，带用户的脱敏邮箱或手机号、商品名，最后一行是后台链接）：
  - 退款：「有一笔退款：xxx 的 Pro 月付 $49.90 已退款，已自动扣回 135 积分。」（扣回结果来自 T71；欠扣时写「还差 N 积分没扣回」）
  - 拒付开始 / 拒付结果（胜诉还回积分 / 败诉）。
  - 付款回调处理失败：「一笔 $19.90 的 Starter 月付没能自动到账，请到后台订单页处理。」
  - 出图失败率偏高：过去 60 分钟失败 ≥ 5 张且失败率 ≥ 30%，每小时最多提醒一次。
  - 新工单：用户新建工单或补充回复时提醒，退款申请类单独标出。
  - 升级后旧订阅取消失败（T66）。
- 不发任何提示词、图片地址、完整邮箱或手机号、密钥。

## 17. 多语言：英文 + 简体中文（Owner 2026-11-06）

**v1 上线只做英文和简体中文两种语言。所有面向用户的页面都要有中文版**（Owner 2026-11-06 晚改：原来只做下表 14 个核心页面，现在扩到全站，后台除外）。下表是原来的核心页面，收录规则不变；表外新增的中文页（SEO 内页、博客、结账返回等）一律 `noindex`；法律页只有英文：

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

**全站中文化**（Owner 2026-11-06 晚）：
- 全部 SEO 内页和博客、结账返回页、需求墙、连接页都做中文版；后台本来就只有中文，不做英文。
- **四个法律页例外，只有英文**（Owner 2026-11-06 晚再定）：不做 `/zh` 版；在中文页上点法律链接直接进英文页，语言切换器在法律页上的「中文」指向 `/zh` 首页，不输出 hreflang。
- 新页面从第一天起就中英两版一起交付，任务卡验收里写明。
- **收录不变**：可收录的中文页仍只有 `/zh`、`/zh/image-to-image-generator`、`/zh/pricing` 三个（建站规格 §6.1 第 1、2 条的理由不变）；其余 `/zh` 页都 `noindex`，不进 `/zh` sitemap。哪个中文页要开收录，等 GSC 出现真实中文查询再单独定。
- **hreflang 只在两边都可收录的页面之间输出**；`noindex` 的中文页不输出 hreflang，但语言切换器和「切换到中文」提示照常指向它对应的 `/zh` 页。
- 中文 SEO 内页同样按中文用户真实问法写，不机器直译（G13）；法律页是翻译（见下面「法律页」）。

- **地址**：英文不带前缀（`/pricing`），中文带 `/zh`（`/zh/pricing`）；slug 两种语言都用英文（建站规格 R4、§6）。`<html lang>`：`en` / `zh-Hans`。
- **怎么选语言**（Owner 2026-11-07 改）：不按 IP、不按 Accept-Language 自动跳转（建站规格 §6）；但**用户自己选过的语言要记住**：
  - **记住**：在地球菜单、提示气泡或账号页「Language」里选择语言时，写 `NEXT_LOCALE` Cookie（一年）；已登录用户同时写 `user_metadata.locale`（邮件也用它）。
  - **生效**：中间件只认这个 Cookie（不认浏览器语言）：Cookie 是 `zh`、访问的是有中文版的英文地址时，307 跳到对应的 `/zh` 地址；Cookie 是 `en`、访问 `/zh` 地址时，307 跳回英文地址。爬虫不带 Cookie，不受影响。语言切换器本身的链接先写 Cookie 再跳，所以不会来回跳。没有中文版的页面（法律页、后台）不跳。
  - **提醒**：浏览器语言列表里有中文（`navigator.languages` 任意一项以 `zh` 开头）、还没选过语言、正在看有中文版的英文页时，**不再显示顶部提示条**，改为在导航的地球图标上出一个带动效的提醒（DESIGN §6.9 第 4 条）。用户做出选择（点中文、点 English、或点气泡上的关闭）之前，每次打开网站都会提醒；做出选择后不再提醒。
- **文字放哪**：界面文字 `site/messages/en.json` + `zh.json`（next-intl，组件里不准写死）；营销页正文按语言放 `site/content/`；模板名称和说明在 `templates.translations`（第 5 节）；数字、价格、日期用 next-intl 格式化。价格两种语言都是美元，口径与英文完全一致（建站规格 G3）。
- **中文怎么写**：直答块、FAQ、页面标题按中文用户的真实问法重新写，不机器直译（建站规格 G13）；Owner 审阅后上线。
- **SEO**：中文页只做 Google，不做百度（美国主体办不了 ICP 备案，Owner 2026-11-06）。`/zh` 下的可收录页面必须在中文口径主词表里（T22 产出），不在表里的 `/zh` 页 `noindex`；hreflang `en` / `zh-Hans` / `x-default`（指向英文）互指；每种语言独立 sitemap。中文 SEO 的写法规则见建站规格 §6.1。
- **付款**：中文页付款方式写「支付宝」，英文页写 "Alipay"（DESIGN §4.5）；Stripe Checkout 托管页传 `locale`（`en` / `zh`）。
- **法律页**：只有英文（Owner 2026-11-06 晚）。以后要做中文版时，它是英文版的翻译，页首注明「本中文版本仅供参考，如与英文版本不一致，以英文版本为准」，律师审英文版。
- **邮件**：见第 7 节，按 `user_metadata.locale` 发中文或英文。
- **中文字体只用于标题（Owner 2026-11-07，T67）**：MiSans 只给标题和大字用（400 一档，与现有标题字重一致；T67 实测 600 会让标题明显变粗）；正文、按钮、导航、表单、说明等界面文字的中文一律用系统字体栈 `"PingFang SC", "Hiragino Sans GB", "Microsoft YaHei", "Noto Sans CJK SC", "Source Han Sans SC", sans-serif`（英文字体不变）。目的：大陆访问是跨境下载瓶颈（ITDOG 平均 3.85 秒），中文页首次字体下载从约 1 MB 降到约 265 KB；汇总 CSS 只声明 400 一档，体积随之变小。下面关于文件和授权的规则不变（不改、不子集化官方分包）。
- **字体：中文用小米 MiSans，照 Graylum 的做法移植**（Owner 2026-11-06；参考 `seo资料/全站中文字体.md`，以及 Graylum staging 分支的 `apps/web/public/fonts/misans/`、`src/components/misans-font.tsx`）：
  - **文件**：官方未修改的静态 WOFF2 分包（简体中文 + 拉丁，400 / 500 / 600，约 168 个文件、5.8 MB），放在 `public/fonts/misans/`。
    - 同目录保留 `manifest.json`（每个文件的来源、unicode-range、字节数、SHA-256）、汇总 CSS、`LICENSE.pdf`、`NOTICE.txt`、`README.md`。
    - 文件名用内容哈希，不重新生成，也不重新子集化。
  - **加载**（Owner 2026-11-07 改，T65：原来 hydration 后再插入样式表，每次进中文页都会先用系统字体画一遍、再换成 MiSans，看起来闪一下，网速慢时更明显）：服务端 HTML 里的一段内联脚本在首次内容绘制之后立刻插入 `<link rel="stylesheet" href="/fonts/misans/misans-<hash>.css">`（T67 实测：阻塞式 `<head>` 引用让 `/zh` 首帧慢约 0.15 s、CI Lighthouse 不过线，所以不用）。正文是系统字体，永远不换；标题回访时首帧后约 45 ms 换成 MiSans。系统字体 fallback 用 `size-adjust` / `ascent-override` 调到接近 MiSans 的字宽和行高，首次访问的切换尽量看不出来。
    - 汇总 CSS 里每个 `@font-face` 都带 `unicode-range` 和 `font-display: swap`。
    - 首屏先用系统字体，浏览器只下载页面上实际用到的分包。
    - 不预加载 woff2 分包（交给 unicode-range 按需取），不用 Google Fonts，也不用任何 CDN。
  - **缓存**：只给 `/fonts/misans/*.woff2` 和 `*.css` 发 `Cache-Control: public, max-age=31536000, immutable`，NOTICE、PDF 不加。改字体必须换新哈希 URL。
  - **路由**：中间件（`src/proxy.ts`）的 matcher 排除 `fonts/misans/`。这个目录不放私密文件。
  - **署名（协议要求）**：写在条款页的「Third-party notices」一节：「本网站使用 MiSans 字体，版权归小米所有」（英文写 "This site uses the MiSans font, © Xiaomi."），并链接 `/fonts/misans/LICENSE.pdf`。页脚不放（Owner 2026-11-06，DESIGN §6.9）。
  - **授权边界**：
    - MiSans 只用于网页显示。服务端往图片上画字的地方（如水印 "Made with Shotviva"）不用 MiSans，以免变成「把字体嵌入导出文件」。
    - 字体文件放在私有仓库，通过网站对外提供，和 Graylum 一样；律师审法律页时一并确认协议里的「再分发」条款（LAUNCH §8）。
- **已知限制（写进 FAQ）**：中国大陆用户不开 VPN 用不了 Google 登录，用手机号验证码（T63 上线后）或邮箱注册即可。

