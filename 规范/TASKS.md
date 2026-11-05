# Shotviva 任务卡（仓库建立前）

> 2026-11-05 建。按 COLLABORATION.md §3：仓库建好后迁到 GitHub Issue。当前协作模式 4：Claude 做全部开发，Codex 只做浏览器验收。每张卡一个开发窗口、一个 PR；两个窗口不改同一批文件。
> 「依据」只摘要点，开发窗口拿不准时回去读整节。

## 状态总览

| 卡 | 名称 | 状态 | 依赖 |
|---|---|---|---|
| T0 | 仓库骨架 + CI | 可派 | — |
| T1 | 登录与账号 | 可派 | T0 |
| T2 | 积分、付费身份与任务表 | 可派 | T0 |
| T3 | 模板表与管理后台 | 可派 | T0 |
| T4 | 上传与出图 | 可派 | T0、T2、T3 |
| T5 | 站点配置与 SEO 内容框架 | 可派 | T0 |
| T6 | 设计方向（impeccable，手机稿） | 可派 | — |
| T7 | Graylum 伙伴接口 | 可派 | T1、T2、T3、T4 |
| T8 | 应用壳与工作台 UI | 等 T6、T16 | T4、T6、T16 |
| T9 | 付费墙、/pricing、Stripe 结账与首付发放 | **价格已定稿，等 T15、T16 合并** | T2、T5、T6、T15、T16 |
| T10 | 订阅续费、取消同步、Customer Portal | 等 T9；首个付费用户满 30 天前上线 | T9 |
| T13 | Waffo 单笔兜底 | 等 T9 | T9 |
| T14 | 积分双池与按作品判付费（改 T2 / T4） | **可派，T8 / T9 之前** | T2、T4 |
| T11 | 首页与内页最终文案 | 价格已定稿，可派 | T5 |
| T12 | 模板需求墙（Wishlist） | 等 T8 | T1、T4、T8 |
| T15 | 迁移基线与自动化 | **可派，T8 / T9 / T12 之前** | T14 |
| T18 | 埋点与错误监控 | **可派，T8 / T9 之前** | — |
| T19 | 法律页面 | **可派** | T5 |
| T16 | 按分辨率扣费（模板三档积分 + 质量档） | **等 T15 合并；T8 / T9 之前** | T3、T4、T14、T15 |

并行建议：T0 先做（半天到一天）；T0 合并后 T1 / T2 / T3 / T5 四张同时开；T6 和 T0 同时开（不碰代码）。

---

## T0 仓库骨架 + CI

**目标**：一个空壳 Next.js 16 项目，四层目录、边界规则、CI 都在，`pnpm build` 通过，后续每张卡都在它上面开分支。

**范围**：新建仓库（不在 flux-kontext-template 上改）。`src/core|modules|site|app` 目录、`eslint.config`、`.github/workflows/ci.yml`、`core/env.ts`、`core/logger.ts`、`core/errors.ts`、`supabase/` 目录与 `config.toml`、`site/site.config.ts` 骨架（只有类型和空值）。从底座只拷 ARCHITECTURE §11 列出的文件，保留 MIT 声明。不许动：任何业务逻辑、页面。

**依据**：
- ARCHITECTURE §1「`core` 不能 import `modules` 或 `site`；模块之间不能互相 import」「`app/(marketing)` 与 `app/(app)` 两个 route group 是两个 layout」；§11「新建项目 + 拷文件」。
- AGENTS §2 技术栈表（Next 16、React 19、TS strict、Tailwind v4、shadcn new-york、next-intl、pnpm）；§3.1「`max-lines` 300、`max-lines-per-function` 60/120、`complexity` 10」；§4「环境变量统一在 `core/env.ts` 用 zod 解析」「不准用 `console.log`」；§7「CI 用 `supabase/setup-cli` action + `supabase start` 起库，第一个 PR 就把 workflow 建好」。

**验收**：
- [ ] `pnpm lint && pnpm typecheck && pnpm test && pnpm build` 本地和 CI 都过
- [ ] 故意在 `core/` import `modules/` 一次，lint 失败
- [ ] 故意写一个 310 行文件，lint 失败
- [ ] CI 里 `supabase start` 成功并跑了一个空的数据库测试
- [ ] `vercel.json` 没有 `/api/*` CORS `*`，函数区域 `sfo1`

**依赖**：无。

---

## T1 登录与账号

**目标**：邮箱 + 密码（验证邮件）、Google 登录、隐形 hCaptcha、`profiles` 表、账号页（删除账号）。

**范围**：`core/auth/`、`supabase/migrations/000x_profiles.sql`、`app/(app)/account`、`app/(marketing)/login|signup|reset`。不许动：积分列的写入逻辑（T2）。

**依据**：
- ARCHITECTURE §7「Supabase Auth：邮箱 + 密码注册，点验证邮件完成激活；另加 Google 登录」「前端只做隐形验证，失败时降级为显式 checkbox」「管理员身份存在数据库 `profiles.role`」「防刷免费额度：只靠邮箱验证 + hCaptcha」；§13「账号页：删除账号（服务端路由：`auth.admin.deleteUser` + 按前缀清 R2 + `generation_jobs` 级联）」。
- AGENTS §5「每张表必须开 RLS」；§6「所有接口默认需要登录」。
- DESIGN §8 应用壳：账号页在 `(app)` 壳内。

**验收**：
- [ ] 注册 → 收到 Resend 发的验证邮件 → 点击后能登录；未验证不能进 `(app)`
- [ ] Google 登录回跳正确
- [ ] hCaptcha 在注册和登录生效，失败时出现 checkbox
- [ ] `profiles` 有 `role`、`credits`（默认 = `site.config.billing.freeCredits`）、`paid_until`（空）、`signup_ip`
- [ ] 删除账号后 `auth.users`、`profiles`、R2 两个前缀下的对象都没了（测试用 mock R2 客户端断言调用）

**依赖**：T0。

---

## T2 积分、付费身份与任务表

> 已合并（PR #3）。其中「付费身份 = `paid_until`」和「1 credit = 1 image」已被 Owner 2026-11-05 傍晚的决定取代，修订由 T14 执行；本卡保留作历史。

**目标**：`profiles.credits` / `paid_until` 两列的全部 SQL 函数和流水表，`generation_jobs` 表，带并发测试。

**范围**：`supabase/migrations/`（积分流水、`generation_jobs`、SQL 函数）、`core/billing/credits.ts`、`core/jobs/`。不许动：支付通道、页面。

**依据**：
- ARCHITECTURE §6.1「`profiles.credits` 永不过期；`paid_until` 付费身份 = `paid_until > now()`；买任何商品 `credits += 积分`，`paid_until = max(paid_until, now()) + 天数`；1 credit = 1 image；余额只能通过 SQL 函数改；每一笔变动都写进流水表，带幂等键」；§4 `generation_jobs` 字段表（含 `source`、`idempotency_key` 唯一索引、`visibility`）和「一条 SQL 原子预扣……按任务 id 幂等」；§10 `admin_adjust_credits(user_id, amount, reason)`、`admin_ban_user(user_id, reason)`。
- AGENTS §5「积分和订单只能通过 SQL 函数修改」；§7 测试 1、3、4。

**验收**：
- [ ] 函数：`grant_credits`、`reserve_credits(job_id)`、`confirm_job`、`refund_job`、`apply_purchase(user, product_id, event_id)`、`admin_adjust_credits`、`admin_ban_user`
- [ ] 测试：并发 10 次预扣只成功余额允许的次数、余额不为负；同一 job 重复确认 / 退回只结算一次；`apply_purchase` 同一 event_id 两次只加一次；`paid_until` 连续购买累加、过期后 `is_paid()` 为 false
- [ ] 私有表 RLS：匿名和普通用户读不到流水

**依赖**：T0。

---

## T3 模板表与管理后台

**目标**：`templates` / `template_prompts` 两张表、种子导入脚本、后台「模板与提示词编辑」一页、内置 `freeform` 模板。

**范围**：`supabase/migrations/`、`core/admin/`、`app/(app)/admin/templates`、`scripts/import-prompts.ts`。不许动：出图逻辑。

**依据**：
- ARCHITECTURE §5「`templates`（公开）……`visible_in`」「`template_prompts`（私有，RLS 拒绝所有客户端）」「内置一条 `freeform` 模板……`visible_in = ['partner']`」「种子提示词放在不进 git 的本地文件里」；§10「v1 后台只做一页：模板与提示词编辑……后台路由 noindex，只允许 `role = admin`」。
- DESIGN §7「后台豁免 impeccable，只用 shadcn 基础组件，界面用中文」。

**验收**：
- [ ] 匿名身份 `select * from template_prompts` 返回空
- [ ] 后台能新建、编辑公开信息和私有提示词、上下架、排序；普通账号访问返回 404
- [ ] `freeform` 存在且前台模板列表查询（`visible_in` 含 `web`）不返回它
- [ ] 种子脚本从 `.local/prompts.json`（gitignore）导入，仓库里只有格式示例

**依赖**：T0。

---

## T4 上传与出图

**目标**：浏览器压缩 + 直传 R2，GPT-Image-2.5 适配器，同步生成路由，下载路由（含水印）。

**范围**：`core/storage/`（预签名、HEAD 校验、下载路由）、`modules/image/provider/`、`modules/image/workspace/use-upload.ts`、`app/api/uploads`、`app/api/generate`、`app/api/files/[jobId]`。不许动：工作台视觉（T8）、伙伴路由（T7）。

**依据**：
- ARCHITECTURE §8.1「任何 API 路由不得接收或返回图片字节」「服务端不转 HEIC」；§8.2 链路全文（accept 不列 heic、长边 2048 / JPEG 0.85、presigned PUT 60 秒、`inputs/{user_id}/{uuid}.jpg`、生成前 HEAD 校验 ≤20MB 和类型、原图不上传、压缩失败才回退）；§8.3「一个私有桶……`inputs/` 7 天……只存一份无水印」；§4 三步；§6.2「水印在下载路由加：`visibility = 'public'` 且当前非付费身份用 `sharp` 叠右下角」；§3.1 Provider 接口。
- AGENTS §6 上传一条、§7 测试 3 和 8。
- DESIGN §4.4「Compressing → Uploading（进度）→ Generating」。

**验收**：
- [ ] 20MB JPEG 从手机浏览器能上传，R2 里的对象 <3MB 且无 EXIF
- [ ] 直传 25MB 文件 / 改后缀文本后调生成 → 422，对象被删
- [ ] 生成成功：扣 1、`outputs/` 有文件、返回体不含图片字节；失败 / 超时：退回
- [ ] 下载路由：免费公开作品带水印，付费身份无水印，非本人 404
- [ ] 成品 key 用 `outputs/{user_id}/{job_id}.png`，让 T1 的删除账号能按前缀清（总控 2026-11-05 补）
- [ ] iPhone 真机 HEIC 相册照片能走通（Codex 验收）

**依赖**：T0、T2、T3。

---

## T5 站点配置与 SEO 内容框架

**目标**：`site.config.ts` 完整类型与 Shotviva 值、`site/content/pages/<slug>.ts` 固定结构、通用内页渲染组件、JSON-LD / sitemap / robots / llms.txt、noindex 全局控制。

**范围**：`site/`、`core/seo/`、`core/content/`、`app/(marketing)/[slug]`、`app/sitemap.ts`、`app/robots.ts`。不许动：具体文案（T11）、应用页。

**依据**：
- ARCHITECTURE §2 配置示例与「对外数字只写在 `site.config.ts`」；§12「一页一个文件……`{ slug, keyword, title, description, answerBlock, facts[], costTable, faq[], related[], hero }`……TypeScript 类型强制五块缺一不可」；§13 首页七个区块顺序。
- 建站规格 R1～R12、G1～G13；AGENTS §9「新建任何可收录页面前，先确认它在主词表 CSV 里」「noindex 由全局配置统一控制」。

**验收**：
- [ ] 少写任何一块，`tsc` 报错
- [ ] 首页、`/image-to-image-generator`、`/pricing` 用占位文案渲染，Ctrl+U 可见正文
- [ ] JSON-LD（SoftwareApplication + Organization、FAQPage、BreadcrumbList）、sitemap index、robots 放行 AI 爬虫、`/llms.txt` 都有
- [ ] `(app)` 下所有页面 noindex；关掉 `modules.image` 后 `/generate` 404 且不进 sitemap

**依赖**：T0。

---

## T6 设计方向（impeccable，手机稿）

**目标**：一次 impeccable 设计方向：设计变量 + 首页、工作台、付费墙三个关键屏的 **375px 手机稿**，Owner 评审一次定稿。

**范围**：设计产出物（变量表、三屏稿），不写业务代码。

**依据**：DESIGN §0「三个关键屏先出 375px 手机稿，Owner 评审的就是手机稿」；§1 四条原则；§3.1「先走浅色系，不刻意贴合食物」；§8 应用壳全部（tab bar、流程页固定主按钮、底部抽屉、禁止清单）；§4.5 付费墙「两个商品 `monthly` / `yearly` × 两组付款方式」。

**验收**：
- [ ] 工作台稿是流程页：顶栏返回 + 底部固定 Generate，无 tab bar
- [ ] 付费墙稿是底部抽屉，两个选项，价格位是占位
- [ ] 首页稿按 ARCHITECTURE §13 七个区块顺序
- [ ] Owner 点头

**依赖**：无（和 T0 并行）。

---

## T7 Graylum 伙伴接口

**目标**：`partner_links` 表、`/connect/graylum` 授权页、账号页「已连接 / 断开」、五个 `/api/partner/*` 路由、`/pricing` 回跳白名单、`partner-types.ts`。

**范围**：`core/partner/`、`app/(app)/connect/graylum`、`app/api/partner/*`、账号页连接区块、`supabase/migrations/000x_partner_links.sql`。不许动：Graylum 仓库。

**依据**：ARCHITECTURE §14 全文（14.2 关联流程与 `state` / 10 分钟 code、14.3「不走用户会话：伙伴密钥 + `X-Shotviva-Account`」、14.4 五个路由与错误码、14.5 回跳白名单、14.6 契约）；§4「`idempotency_key` 唯一索引」；AGENTS §6 例外条、§7 测试 7。

**验收**：
- [ ] code 用一次即废、10 分钟过期
- [ ] 重复 `Idempotency-Key` 返回同一 job、只扣一次
- [ ] 402 带 `top_up_url`；撤销后 401；`return_to` 非白名单拒绝；预览密钥在生产 401
- [ ] `partner-types.ts` 用 zod 定义全部入参出参，一份拷贝交给 Graylum 总控
- [ ] 可选 `image` URL 只接受 https、限 Graylum 白名单域名、限大小，服务端拉取后压到 2048 再送模型（防 SSRF，总控 2026-11-05 补）

**依赖**：T1、T2、T3、T4。

---

## T8 应用壳与工作台 UI（等 T6）

**目标**：`(app)` layout（顶栏 + tab bar：Create / Photos / Account 三项，Wishlist 第四项由 `features.wishlist` 控制渲染，T8 先放占位页，内容在 T12）、三个 tab 页、工作台流程页、生成中 / 成功 / 失败三态、Share 按钮。

**依据**：DESIGN §4.3、§4.4、§8 全部；`MOBILE_UI_rules_fable.md` §1.8.1 Share 实现规则。

**验收**：LAUNCH §7.5 五条 + DESIGN §8.7 真机清单（Codex 验收）。

**依赖**：T4、T6。

---

## T9 付费墙、/pricing、Stripe 结账与首付发放（价格已定稿；等 T15、T16 合并）

**目标**：付费墙（三档 × 月 / 年 + 三个积分包，两步选、两组付款方式）、`/pricing`、Stripe Checkout Session 按付款方式路由（卡 = Managed Payments 订阅，积分包和钱包 = 单笔）、`checkout.session.completed` 回调 → `apply_purchase` + 写 `subscriptions` 镜像表。上线当天要有的部分。

**范围**：`core/billing/stripe/`、`app/api/webhooks/stripe`、`app/(marketing)/pricing`、付费墙组件、迁移编号段 `0080`～`0099`（T15 PR #24 的规划；**T15 未合并前不写迁移**）：`subscriptions` 表；`products` 表改成 ARCHITECTURE §6.2 的 9 个商品（`starter_monthly` … `pack_l`：改 check 约束、替换种子行，积分包 `days` 为空），一次成型（AGENTS §5：先设计后迁移、一张卡一次成型，不准「先加再改」）；`site/site.config.ts` 的 9 个商品（id、`tier`、`interval`、积分、天数、价格，同步改 T5 的相关测试和 `SiteConfig` 类型）；Stripe Price 按 `lookup_key` 取（§6.2），不加 Price id 环境变量；PostHog `purchase` 参数按 §6.2。不许动：`_apply_credit_change` / `apply_purchase` 的逻辑、续费逻辑（T10）、模板扣费（T16）。（总控 2026-11-05 补：main 上已合并的代码仍是 `pass`/`pack`，由 T9 负责改名。）

**依据**：ARCHITECTURE §6.2 商品表（9 个 id、价格、积分、天数）、「Stripe Product / Price 映射」（三档 Product 各 4 个 Price、积分包 one-time、`lookup_key` 约定）、「分两段上线」、PostHog 参数；§6.3 Stripe 路由表（MP 不传 `payment_method_types`、微信 `client = 'web'`、税码 `txcd_10105001`、「审核没下来之前卡先走普通订阅」）、「要处理的 Stripe 事件」；§6.1 `apply_purchase(user, product_id, event_id)` 用 session id 当 `event_id`；§2 配置示例；DESIGN §4.5（第一屏三档、第二屏月 / 年或 S / M / L、每屏最多三个选项）；建站规格 G3；AGENTS §6 回调验签、§7 测试 2。

**预览环境的支付回调**（总控 2026-11-05）：预览地址每个 PR 不同，且开着 Vercel 部署保护，Stripe 的回调会被挡成 401。做法：本地开发用 `stripe listen` 转发；CI 用签名后的模拟回调测（AGENTS §7 测试 2）；在预览上端到端验收时，打开 Vercel「Protection Bypass for Automation」，Stripe 测试模式登记一个回调，网址 = 正在验收的 PR 的分支地址 + `/api/webhooks/stripe?x-vercel-protection-bypass=<绕行密钥>`，换 PR 验收时只改网址、签名密钥不变。成功页 / 取消页地址由代码按当前部署地址（`core/site-url`）生成。绕行密钥和签名密钥只放 Vercel 环境变量与 Stripe 后台，不进代码、不进 PR。

**范围补充（总控 2026-11-05）**：不接微信支付，只有卡和支付宝（ARCHITECTURE §6.2 / §6.3、DESIGN §4.5）；付费墙档位卡三种材质色和年付节省金额按 DESIGN §4.5；同步把法律页面（`site/content/legal/`）里提到 WeChat Pay 的句子删掉。

**验收**：LAUNCH §5 的商品 / Price 一条、Stripe 卡与钱包两条 + 回调重发三次只发一次 + 签名错误 400；付费墙在 375px 上每屏不超过三个选项、不滚动能完成选择（Codex 验收）。

**依赖**：T2、T5、T6、T15（编号段）、T16（模板扣费字段）。

## T10 订阅续费、取消同步、Customer Portal（等 T9；首个付费用户满 30 天前上线）

**目标**：`invoice.paid`（只认 `subscription_cycle`）→ `apply_subscription_renewal`（invoice id 幂等，`paid_until` 对齐 `period_end`）；`customer.subscription.updated / deleted` 更新镜像表；`charge.refunded` 记录 + Sentry 告警；账号页 Subscription 区块 + Customer Portal 链接。

**范围补充**：迁移编号段 `0100`～`0119`，新增 SQL 函数 `apply_subscription_renewal`（ARCHITECTURE §6.1），测试连本地 Supabase：同一 invoice 重发只发一次、`paid_until` 对齐 `period_end` 且不回退。

**依据**：ARCHITECTURE §6.2「续费失败：什么都不做」「取消：期末生效……不自己写取消界面」「外部退款……不写自动扣回」；DESIGN §4.5 账号页区块；AGENTS §7 测试 2（Stripe 另加四项）和 4。

**验收**：LAUNCH §5 测试时钟续费一条、Portal 取消一条、`charge.refunded` 告警一条、账号页一条。

**依赖**：T9。

## T14 积分双池与按作品判付费（可派，排在 T8 / T9 之前）

**目标**：把「付费身份 = `paid_until`」改成「按作品的 `credit_pool` 判付费」。约 1 天。

**范围**：`supabase/migrations/` 编号段 `0140`～`0159`（`profiles.free_credits`、`generation_jobs.credit_pool`、流水表加 `pool`；改 `handle_new_user`、`reserve_credits`、`refund_job`、`admin_adjust_credits`、`grant_credits`（加 `pool`）、`apply_purchase`（商品天数为空时不碰 `paid_until`，`products.days` 改可空）；删或弃用 `is_paid`）、`core/auth/free-credits.ts`（注册赠送改为 `pool = 'free'`，总控 2026-11-05 补）、`core/billing/credits.ts`、`core/jobs/`（`reserve` 入参、`job-schema` 加 `creditPool`）、`core/storage/watermark.ts`（`shouldWatermark(creditPool)`）、`core/jobs/job-file.ts`（不再调 `isPaid`）、伙伴接口的 generate 走同一函数。不许动：支付通道、页面。

**依据**：ARCHITECTURE §6.1 全文（两个池、「先付费池、后免费池、整单不拆」、`paid_until` 不参与权益、`admin_adjust_credits` 带 `pool`、流水记池）；§6.2「水印在下载路由加，按作品判」「免费作品……买了会员之后仍然是免费作品」「付费作品默认 private……可改公开」；§4 `credit_pool` 字段；§9 第 1、6 条；AGENTS §7 测试 1、4。

**验收**：
- [ ] 新用户 `free_credits = freeCredits`、`credits = 0`
- [ ] 测试：free 3 / paid 0、cost 2 → 扣 free，`credit_pool = 'free'`，`visibility = 'public'`；free 3 / paid 30、cost 2 → 扣 paid，`'paid'`，`'private'`；free 1 / paid 1、cost 2 → 失败；退回退到原池
- [ ] 下载路由：free 作品加水印，paid 作品不加；paid 作品可改 public 且仍不加水印；free 作品改 private 被拒
- [ ] `admin_adjust_credits(user, amount, reason, pool)` 两个池都能调且写流水
- [ ] 邮箱验证后的注册赠送进 `free_credits`，重复登录不重复发；`apply_purchase` 对天数为空的商品不改 `paid_until`（空的仍为空）
- [ ] LAUNCH §5 的四条作品权益项（见该节）

**依赖**：T2、T4（都已合并）。**T8 的余额显示和 T9 的付费墙文案依赖本卡的字段名，先合这张。**

## T13 Waffo 单笔兜底（等 T9）

**目标**：Waffo 托管结账卖 9 个商品的单笔形态（会员按一期、积分包原样），`product_id → Waffo 商品 id` 映射放环境变量，回调验签 + 事件 id 去重 + `apply_purchase`；环境变量切通道时付费墙全部走 Waffo、隐藏微信和「自动续费」文案。

**依据**：ARCHITECTURE §6.3「Waffo：保留，只做单笔兜底」四条；LAUNCH §5 Waffo 两条。开工先核实 Waffo 的回调地址是每笔订单单独传还是后台固定一个：单独传就按当前部署地址生成；固定的就照 T9 的预览回调做法（分支地址 + Vercel 绕行密钥）。**依赖**：T9。

## T11 首页与内页最终文案（价格已定稿，可派）

**依据**：ARCHITECTURE §12、§13；建站规格 §4（首页 TDK 与 6 个 H2 骨架，2026-11-05 定稿）、R10、G1、G3、G4（可核验事实：9 个商品的价格、"from 2 credits"、Standard / HD / Max 三档像素，对外不写 1K / 2K / 3K）、G6（首页 5 句）。同时把 `site.config.ts` 的 `brand.tagline` 改成 "AI photo studio"（建站规格 §1）。**范围补充（总控 2026-11-05）**：`site.config.ts` 的 `billing.freeCredits` 从 3 改为 6，全站免费额度文案改成 "3 free Standard images"（建站规格 G1 / G3 / G4 / FAQ B / 首页 H3 / Description），并同步改 T1 / T5 / T14 里引用免费额度的测试。首页首屏生成器的界面由 T8 实现（复用工作台组件）。

**依赖**：T5。

## T12 模板需求墙（Wishlist）（等 T8）

**目标**：Wishlist tab（墙、发帖、My requests）、投票、后台需求审核页、shipped 闭环；整个功能受 `site.config.features.wishlist` 开关控制（ARCHITECTURE §15.6：关掉时 tab 不渲染、前台和后台路由 404、迁移仍跑、判断只在 `isWishlistEnabled(site)` 一处，配置由调用方传入，core 不 import site）。约 3 天。

**范围**：`core/wishlist/`（总控 2026-11-05 定：需求墙跨模块，放 core）、`supabase/migrations/0060`～`0079`（编号段）、`app/(app)/wishlist/*`、`app/api/wishlist/*`、`app/(app)/admin/requests`。不许动：工作台、模板表结构。

**依据**：
- ARCHITECTURE §15 全文：门槛「至少成功出过 1 张图的账号才能发帖和投票」；状态机 `pending → live → shipped` / `rejected`；参考图「复用第 8.2 节的上传链路……存 R2 `requests/{user_id}/{uuid}.jpg`，不设过期；被拒或下架时服务端删除」；§15.3 两张表、RLS、「投票用一个 SQL 函数：存在即删除并 -1，不存在即插入并 +1，函数内检查门槛」；§15.4 不做清单。
- ARCHITECTURE §10 第二页「待审需求列表、通过 / 拒绝 / 下架、按票数排序、标记 shipped 并关联模板」。
- DESIGN §4.7 三个页面与空状态；§8.2 tab bar 四项；§7 后台豁免 impeccable。
- AGENTS §5「每张表必须开 RLS」；§6「所有接口默认需要登录」。

**验收**：LAUNCH §9.6 八条；删除账号时同时清 `requests/{user_id}/`（在 T1 的 `accountPrefixes` 里加这个前缀并补测试）。其中前五条要有 Vitest（连本地 Supabase）：门槛函数、RLS 可见性、投票切换、拒绝删图（mock R2 断言）、shipped 置顶查询。界面部分 Codex 真机验收。

**依赖**：T1、T4（上传链路）、T8（应用壳）。

---

## T15 迁移基线与自动化（可派，排在 T8 / T9 / T12 之前）

**目标**：把现有 17 个迁移压成一套按业务分组的基线，建立「只由工具执行迁移」的流水线，加当前结构快照和漂移检查。约半天。

**范围**：`supabase/migrations/`（整体替换为基线）、`supabase/schema.sql`（新增）、`scripts/`（导出快照的脚本）、`.github/workflows/`（预览库自动推送、生产库审批推送、快照校验、定时漂移检查）。不许动：业务代码、表结构语义（压缩前后数据库结构必须完全一样）。

**依据**：AGENTS §5「迁移只能由工具执行」「已合并的迁移文件只加不改」「基线」「`supabase/schema.sql` 是唯一可读快照」「漂移检查」；LAUNCH §1 GitHub 密钥两条。

**做法要点**：
- 基线按业务分文件：用户与账号、积分与流水、出图任务、模板、伙伴关联、管理员函数等，每个文件直接写最终定义（以当前 `main` 上全部迁移执行后的结果为准）。编号从 `0001` 重新开始，后续卡继续用分配的编号段。
- 证明压缩前后结构一致：本地分别用旧迁移和新基线建库，各导出一次 schema，逐字比对，结果写进 PR。
- 预览库重建：预览库只有测试数据，用 CLI 对预览库执行重置并按基线重建（Owner 2026-11-05 已同意清空预览库）；重建后 `supabase migration list` 与仓库一致。这是本卡唯一一次对远端库的破坏性操作，执行前在 PR 里写明，执行后附命令输出。
- 工作流：`main` 合并后自动 `supabase db push` 到预览库；生产库工作流手动触发 + `production` environment 审批（生产库还不存在，先建好工作流，不运行）；CI 校验 `schema.sql` 与迁移一致；每天定时比对预览库迁移列表，不一致就失败。
- 需要的密钥由 Owner 在 GitHub 上配置，PR 里列出密钥名，不出现任何值。

**验收**：
- [ ] 旧迁移和新基线导出的 schema 逐字一致（附比对输出）
- [ ] `pnpm test:db` 全过
- [ ] 预览库重建后 `supabase migration list` 与仓库一致，预览环境能登录
- [ ] 改一个迁移但不更新 `schema.sql`，CI 失败（附运行链接后撤回）
- [ ] 合并后预览库自动推送成功（附 Actions 运行链接）

**依赖**：T14（已合并）。执行期间不能有其他卡在写迁移。

---

## T16 按分辨率扣费（等 T15 合并；排在 T8 / T9 之前）

**目标**：把「一个模板一个整数 credit」改成「模板质量档 × 用户选的分辨率（1K / 2K / 3K）」：模板表存三档积分和质量档，预扣在数据库里按分辨率取数，provider 按档出尺寸、按模板传 `quality`，后台能编辑三个数并校验下限。约 1 天。

**范围**：
- `supabase/migrations/` 编号段 **`0020`～`0039`**（T15 PR #24 规划的空闲段；**T15 未合并前不写迁移**，基线合并后编号必须高于 `0006`）：`templates.credits_cost` 改为 jsonb（三个键 `1k` / `2k` / `4k` 必填、正整数，check 约束），`templates.quality` 文本列（`high` / `medium`，默认 `high`）；`admin_upsert_template` 读写这两个字段；`reserve_credits(job_id, resolution)` 从 `templates.credits_cost ->> resolution` 取数（不再信任调用方传入的 cost），非法分辨率抛错；`freeform` 种子行三档都配。一张卡一次成型，不准先加列再改列。
- `modules/image/provider/output-size.ts`：按 ARCHITECTURE §8.1 的三档（1K 1024²、2K 2048²、3K 2880²）× 比例出尺寸表，每档内任何比例的输出 token ≤ 该档正方形（用 OpenAI 官方 token 计算器公式验证，表和验证脚本一起提交）；`openai-image-provider.ts` 传模板的 `quality`，模型名继续从 `OPENAI_IMAGE_MODEL` 读。
- `modules/image/credits-floor.ts`：质量档 × 分辨率的配置下限常量（ARCHITECTURE §6.1 的 `ceil(p95 成本 ÷ $0.06)`，初值 `high` 2 / 4 / 6、`medium` 1 / 2 / 3，LAUNCH §5 成本测量后更新），后台保存模板的服务端动作用它校验。
- `core/jobs/`：`job-schema` 加 `resolution`（默认 `'1k'`），`POST /api/generate` 入参加 `resolution`；`generation_jobs.inputs.resolution` 落库；伙伴接口 `/api/partner/generate` 固定 `'1k'`，契约不改。
- `app/(app)/admin/templates`：质量档下拉 + 三个 credit 输入框，低于下限时显示下限并拒绝保存。
- `core/templates`：公开查询带出 `credits_cost` 三档和 `quality`，给 T8 的模板卡（"From 2 credits"）和工作台分辨率选择器用。
不许动：支付通道、付费墙、工作台视觉（T8）。

**依据**：ARCHITECTURE §5 字段定义与默认值表；§6.1「计价单位是 credit」「配置下限」两条；§4 `inputs.resolution`、`credits_cost` 取法、三步流程第 1～2 步；§8.1 三档像素定义与「同档任何比例 token ≤ 正方形」；§10 后台页功能；§3.2 模型名是配置项；AGENTS §5 迁移规则、§7 测试 3。

**范围补充（总控 2026-11-05）**：生成请求增加可选 `note`（≤300 字符，zod 校验，空值不传），服务端追加在渲染后的模板提示词之后（ARCHITECTURE §4 `inputs.note`），记进 `generation_jobs.inputs`；不新增表、不改迁移以外的结构。界面输入框归 T8。

**范围补充（总控 2026-11-05）**：后台模板编辑页加「上传前图 / 上传后图」，按 ARCHITECTURE §8.3「模板封面另用一个公开桶」实现（私有桶 `uploads-admin/` 中转 → `sharp` 转 WebP → 公开桶 `covers/` → 更新 `cover_before_url` / `cover_after_url` → revalidate 首页和模板页）；新环境变量 `R2_PUBLIC_BUCKET`、`NEXT_PUBLIC_ASSETS_BASE_URL` 写进 `core/env.ts` / `core/public-env.ts` 和 `.env.example`。验收加一条：后台换图后首页无需重新部署即显示新图，公开桶里只有 `covers/`。

**范围补充 2（总控 2026-11-05）**：封面展示媒体支持静态图 / 动图 / 短视频（ARCHITECTURE §8.3 三条），`templates` 加 `cover_media_type`、`cover_video_url`、`cover_poster_url`（新迁移，按 AGENTS §5 一次成型），后台上传支持 GIF→动态 WebP、MP4 ≤15MB ≤15 秒 + 封面帧。验收加一条：后台给一个模板换成视频后，首页卡片显示封面帧、滑入视口后静音循环播放。

**范围补充 3（总控 2026-11-05）**：输出尺寸支持 DESIGN §4.3 的 8 个比例（Original 按原图比例取最接近的模型支持尺寸，其余 16:9 / 4:5 / 1:1 / 9:16 / 3:2 / 4:3 / 2:3），尺寸表放 `modules/image/provider/output-size.ts`，每档清晰度内任何比例的输出 token ≤ 该档正方形。

**验收**：
- [ ] 同一模板 1K / 2K / 3K 各生成一次，`generation_jobs.credits_cost` 分别等于后台配置的三个数，成品像素等于尺寸表
- [ ] 测试：`reserve_credits` 对 `'8k'` 抛错且不扣；调用方传错 cost 不影响扣数；`medium` 模板 1K 扣 1
- [ ] 尺寸表测试：所有比例 × 三档，边长为 16 的倍数、比例 ≤ 3:1、token 数 ≤ 该档正方形
- [ ] 后台把 `high` 模板 1K 改成 1，保存被拒并提示下限 2；改成 3 保存成功
- [ ] `freeform` 从伙伴接口出图扣 1K 档的数
- [ ] `supabase/schema.sql` 快照更新，CI 的 schema 校验通过

**依赖**：T3、T4、T14（都已合并）、T15（基线与编号）。

## T18 埋点与错误监控（可派，排在 T8 / T9 之前）

**目标**：`core/analytics/` 统一埋点和错误上报，接好 PostHog（无 Cookie、同域代理）和 Sentry；给已合并的接口补上服务端事件。约半天。

**范围**：`core/analytics/`（`track()`、`identify()`、`captureError()`，浏览器和服务端两套实现，同一事件字典的 zod 类型）、`app/` 根布局接入 PostHog Provider、`next.config.ts` 的 `/ingest` 改写、`@sentry/nextjs` 配置；在已合并代码里补事件：T1 注册（`signup`）、T4 生成结算（`generate`，web 和伙伴接口都发）、T4 上传（`upload`）。`paywall_view` / `checkout_start` / `purchase` 由 T8 / T9 调用本模块，本卡只提供类型和函数。不许动：业务逻辑和扣费规则。

**依据**：ARCHITECTURE §16 全文（PostHog 配置、事件字典、禁止发个人信息、Sentry 告警清单）；AGENTS §4（env 用 zod、`core/logger` 打码）；LAUNCH §9 事件和告警两条。

**验收**：
- [ ] 预览站打开首页，PostHog 后台 Live events 看到 `$pageview`，浏览器里没有 PostHog 写的 Cookie 和本地存储
- [ ] 注册、上传、生成各做一次，看到 `signup` / `upload` / `generate`，属性齐全且不含邮箱、文案、提示词、图片地址
- [ ] 广告拦截插件开着时事件仍能通过 `/ingest` 送达
- [ ] 故意让一次生成失败，Sentry 收到告警，内容不含用户邮箱和提示词
- [ ] 单元测试：事件字典类型、属性里出现邮箱等字段时被拒绝

**依赖**：无（T1 / T4 已合并）。Sentry DSN 未提供前，Sentry 部分在无 DSN 时自动关闭，不阻塞合并。

## T19 法律页面（可派）

**目标**：英文的服务条款 `/terms`、隐私政策 `/privacy`、退款政策 `/refund-policy`、使用规范 `/acceptable-use`，以及全站页脚的官方站点声明和主体信息。约半天到一天。**上线前须由 Owner 找懂美国法律的人审阅**，开发窗口写的是底稿，不是法律意见。

**主体信息（Owner 2026-11-05 提供）**：Grayscale Luminary LLC，怀俄明州注册，地址 75 E 3rd St, Sheridan, WY 82801，联系邮箱 support@shotviva.com。写进 `site.config.ts` 的 `brand`（`legalName`、`address`、`contactEmail`），页面和页脚只从配置读。

**范围**：`site/content/legal/*`（四页正文）、`app/(marketing)/terms|privacy|refund-policy|acceptable-use`、页脚组件里的法律链接和主体信息、`site.config.ts` 主体字段。四页 `noindex`（不在主词表 CSV 里，AGENTS §9）。不许动：业务逻辑。

**依据与底稿**：
- 退款规则 Owner 定为「和 Graylum 一致」：以 Graylum **staging** 分支 `apps/web/content/legal/refund-policy.html` 为底稿改写；Graylum 条款里凡是依赖 Graylum 独有功能（自助退款页、后台退款流程等）的承诺，Shotviva v1 没有对应功能的，改写成「发邮件到 support@shotviva.com，人工在 Stripe / Waffo 后台处理」（ARCHITECTURE §10），并在 PR 里逐条列出改了哪些。卡支付走 Stripe Managed Payments 时由 Link 作为商户记录方，退款条款要与之相符（ARCHITECTURE §6.3）。
- 服务条款、隐私政策同样参考 Graylum staging `terms.html`、`privacy.html` 的结构，但内容按 Shotviva 事实写：免费作品公开展示并带水印、付费作品私密可商用（§6.2）；用户对上传内容负责、画风模板只用通用风格（§5）；上传照片保留 7 天、成品保留到用户删除（§8.3）；需求墙参考图规则（§15.5）；第三方服务清单（Supabase、Cloudflare R2、OpenAI、Stripe / Link、Waffo、PostHog、Sentry、Resend、Vercel）；PostHog 不使用 Cookie（§16）；连接 Graylum 时共享的信息（账号 id、剩余积分，§14）；账号删除（§13）。
- LAUNCH §8 全部条目。

**验收**：
- [ ] 四页可访问、`noindex`，页脚每页可见并链接到四页，主体信息与配置一致
- [ ] PR 正文附「与 Graylum 条款的差异清单」和「需要律师重点看的条款」清单
- [ ] Owner 审阅通过（律师意见由 Owner 自行安排）

**依赖**：T5（已合并）。

## Owner 侧关键路径（不是任务卡，但比代码慢）

- 第一批 10 个模板（6 类）的真实照片 + 前后对比素材 + 提示词调优
- Stripe 新账户申请（卡 + 支付宝，不接微信支付）
- Waffo 加急开通
- OpenAI 组织验证 + GPT-Image 系列模型权限；决定 `OPENAI_IMAGE_MODEL` 默认用 2.5 还是 2.6（同价，2.6 更快，需比较效果）
- 上线前成本测量：20 张真实照片实测输入图 token（LAUNCH §5，花费 < $5），据此定 `high` 1K 是 2 还是 3 credits
- Resend 域名验证
- ~~价格数字定稿（pricing-research 窗口）~~ 已定稿 2026-11-05（ARCHITECTURE §6.2）；Waffo 费率仍待向商务确认
