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
| T8 | 应用壳与工作台 UI | 等 T6 | T4、T6 |
| T9 | 付费墙、/pricing、Stripe 结账与首付发放 | 等价格数字 | T2、T5、T6 |
| T10 | 订阅续费、取消同步、Customer Portal | 等 T9；首个付费用户满 30 天前上线 | T9 |
| T13 | Waffo 单笔兜底 | 等 T9 | T9 |
| T11 | 首页与内页最终文案 | 等价格数字 | T5 |
| T12 | 模板需求墙（Wishlist） | 等 T8 | T1、T4、T8 |

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

**目标**：`(app)` layout（顶栏 + 四项 tab bar，Wishlist tab 先放占位页，内容在 T12）、Create / Photos / Account 三个 tab 页、工作台流程页、生成中 / 成功 / 失败三态、Share 按钮。

**依据**：DESIGN §4.3、§4.4、§8 全部；`MOBILE_UI_rules_fable.md` §1.8.1 Share 实现规则。

**验收**：LAUNCH §7.5 五条 + DESIGN §8.7 真机清单（Codex 验收）。

**依赖**：T4、T6。

---

## T9 付费墙、/pricing、Stripe 结账与首付发放（等价格数字）

**目标**：付费墙（两个商品 × 两组付款方式）、`/pricing`、Stripe Checkout Session 按付款方式路由（卡 = Managed Payments 订阅，钱包 = 单笔）、`checkout.session.completed` 回调 → `apply_purchase` + 写 `subscriptions` 镜像表。上线当天要有的部分。

**范围**：`core/billing/stripe/`、`app/api/webhooks/stripe`、`app/(marketing)/pricing`、付费墙组件、`subscriptions` 表迁移。不许动：积分 SQL 函数（T2 已定）、续费逻辑（T10）。

**依据**：ARCHITECTURE §6.2 商品表与「同一个商品挂 recurring 和 one-time 两个 Price」「分两段上线」；§6.3 Stripe 路由表（MP 不传 `payment_method_types`、微信 `client = 'web'`、税码 `txcd_10105001`、「审核没下来之前卡先走普通订阅」）、「要处理的 Stripe 事件」；§6.1 `apply_purchase(user, product_id, event_id)` 用 session id 当 `event_id`；DESIGN §4.5；AGENTS §6 回调验签、§7 测试 2。

**验收**：LAUNCH §5 前三条 + 回调重发三次只发一次 + 签名错误 400。

**依赖**：T2、T5、T6、价格数字定稿。

## T10 订阅续费、取消同步、Customer Portal（等 T9；首个付费用户满 30 天前上线）

**目标**：`invoice.paid`（只认 `subscription_cycle`）→ `apply_purchase`（invoice id 当 `event_id`）并把 `paid_until` 延到 `period_end`；`customer.subscription.updated / deleted` 更新镜像表；`charge.refunded` 记录 + Sentry 告警；账号页 Subscription 区块 + Customer Portal 链接。

**依据**：ARCHITECTURE §6.2「续费失败：什么都不做」「取消：期末生效……不自己写取消界面」「外部退款……不写自动扣回」；DESIGN §4.5 账号页区块；AGENTS §7 测试 2（Stripe 另加四项）和 4。

**验收**：LAUNCH §5 测试时钟续费一条、Portal 取消一条、`charge.refunded` 告警一条、账号页一条。

**依赖**：T9。

## T13 Waffo 单笔兜底（等 T9）

**目标**：Waffo 托管结账卖 `monthly` / `yearly` 的单笔形态，回调验签 + 事件 id 去重 + `apply_purchase`；环境变量切通道时付费墙全部走 Waffo、隐藏微信和「自动续费」文案。

**依据**：ARCHITECTURE §6.3「Waffo：保留，只做单笔兜底」四条；LAUNCH §5 Waffo 两条。**依赖**：T9。

## T11 首页与内页最终文案（等价格数字）

**依据**：ARCHITECTURE §12、§13；建站规格 §4、R10。**依赖**：T5、价格数字定稿。

## T12 模板需求墙（Wishlist）（等 T8）

**目标**：Wishlist tab（墙、发帖、My requests）、投票、后台需求审核页、shipped 闭环。约 3 天。

**范围**：`core/wishlist/`（总控 2026-11-05 定：需求墙跨模块，放 core）、`supabase/migrations/0060`～`0079`（编号段）、`app/(app)/wishlist/*`、`app/api/wishlist/*`、`app/(app)/admin/requests`。不许动：工作台、模板表结构。

**依据**：
- ARCHITECTURE §15 全文：门槛「至少成功出过 1 张图的账号才能发帖和投票」；状态机 `pending → live → shipped` / `rejected`；参考图「复用第 8.2 节的上传链路……存 R2 `requests/{user_id}/{uuid}.jpg`，不设过期；被拒或下架时服务端删除」；§15.3 两张表、RLS、「投票用一个 SQL 函数：存在即删除并 -1，不存在即插入并 +1，函数内检查门槛」；§15.4 不做清单。
- ARCHITECTURE §10 第二页「待审需求列表、通过 / 拒绝 / 下架、按票数排序、标记 shipped 并关联模板」。
- DESIGN §4.7 三个页面与空状态；§8.2 tab bar 四项；§7 后台豁免 impeccable。
- AGENTS §5「每张表必须开 RLS」；§6「所有接口默认需要登录」。

**验收**：LAUNCH §9.6 八条；删除账号时同时清 `requests/{user_id}/`（在 T1 的 `accountPrefixes` 里加这个前缀并补测试）。其中前五条要有 Vitest（连本地 Supabase）：门槛函数、RLS 可见性、投票切换、拒绝删图（mock R2 断言）、shipped 置顶查询。界面部分 Codex 真机验收。

**依赖**：T1、T4（上传链路）、T8（应用壳）。

---

## Owner 侧关键路径（不是任务卡，但比代码慢）

- 6～8 个模板的真实菜品照片 + 前后对比素材 + 提示词调优
- Stripe 新账户申请；向 Stripe 确认 Managed Payments 下 Alipay / WeChat
- Waffo 加急开通
- OpenAI 组织验证 + GPT-Image-2.5 权限
- Resend 域名验证
- 价格数字定稿（pricing-research 窗口）
