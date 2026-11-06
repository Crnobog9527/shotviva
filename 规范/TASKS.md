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
| T20 | 数据库收尾：用户总览视图、迁移只加不改检查、收回多余权限 | **可派** | T15 |
| T16 | 按分辨率扣费（模板三档积分 + 质量档） | **等 T15 合并；T8 / T9 之前** | T3、T4、T14、T15 |
| T21 | 简体中文全站（路由、语言提示、中文文案、中文邮件、模板中文名） | 等 T8 合并 | T8、T11、T19 |
| T22 | 中文关键词研究与中文口径主词表（不写代码） | **可派** | — |
| T17 | 出图供应商后台配置（换供应商 / 模型不改代码） | **可派**（与 T8 并行；T8 先合并时 rebase） | T3、T4、T16 |
| T23 | 后台外壳与运营页（概览、用户、订单、出图记录、公告横幅） | **可派**；订单页等 T9 后端合并 | T3、T17、T20；订单页 T9 |
| T24 | 预览站 QA 测试账号与一键登录脚本 | **可派** | T1、T9、T20 |
| T25 | 后台客服工具 + 同 IP 限制 + 封禁范围 | **可派** | T10、T23 |
| T26 | 付款补救与概览待处理 | 接 T25 | T10、T25 |
| T27 | 站内工单（含人工退款审核） | **可派** | T10、T23 |

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

**设计基准（Owner 2026-11-05）**：以 T6 定稿的 B 版 Darkroom（`design/comps-v3-b/` 与更新后的 `design/DESIGN.md`）为准。设计系统已入库（`design/DESIGN.md`、`design/TOKENS.md`、`design/tokens/tokens.css`、`design/.impeccable/design.json`、`design/comps-v3-b/`、`design/assets/img|video/`）；变量照搬 `tokens.css` 进 `globals.css`；`design/TOKENS.md` 末尾的「实现时清理」清单（硬编码颜色改变量、三档材质收进 `:root`、12px 标签、超出两级的发光、非 4 倍数间距、支付宝官方图标）在本卡一并处理。首页「一张手机照 → 一整套」演示用 `design/assets/img/hero-set-*.webp`（v2）。模板样图（`*-before/after.webp`、`*-split.webp`、`*-anim.webp`、`video/*.mp4`）是示意素材，`.json` 附带文件里写了来源和许可，上线前 Owner 在后台替换；需要放进 `public/` 的只放首页演示用的那几张，模板封面走 T16 的公开桶。**范围补充**：生成可以在后台进行，Photos 页显示进行中的任务和进度，按 `current_tier` 的并发上限允许同时发起多张（Starter 1、Pro 3、Max 6），超过上限时按钮提示等待。

**验收**：LAUNCH §7.5 五条 + DESIGN §8.7 真机清单（Codex 验收）。

**依赖**：T4、T6。

**范围补充 2（总控 2026-11-06）**：上线要同时支持简体中文（ARCHITECTURE §17）。本卡新增和改动的界面文字全部走 next-intl（`site/messages/en.json`），不写死；不加 `zh.json`、不做语言路由（T21 做）；字体栈接系统中文字体回退，文字容器不写死宽度（DESIGN §3.2）。

---

## T9 付费墙、/pricing、Stripe 结账与首付发放（价格已定稿；等 T15、T16 合并）

**目标**：付费墙（三档 × 月 / 年 + 三个积分包，两步选、两组付款方式）、`/pricing`、Stripe Checkout Session 按付款方式路由（卡 = Managed Payments 订阅，积分包和钱包 = 单笔）、`checkout.session.completed` 回调 → `apply_purchase` + 写 `subscriptions` 镜像表。上线当天要有的部分。

**范围**：`core/billing/stripe/`、`app/api/webhooks/stripe`、`app/(marketing)/pricing`、付费墙组件、迁移编号段 `0080`～`0099`（T15 PR #24 的规划；**T15 未合并前不写迁移**）：`subscriptions` 表；`products` 表改成 ARCHITECTURE §6.2 的 9 个商品（`starter_monthly` … `pack_l`：改 check 约束、替换种子行，积分包 `days` 为空），一次成型（AGENTS §5：先设计后迁移、一张卡一次成型，不准「先加再改」）；`site/site.config.ts` 的 9 个商品（id、`tier`、`interval`、积分、天数、价格，同步改 T5 的相关测试和 `SiteConfig` 类型）；Stripe Price 按 `lookup_key` 取（§6.2），不加 Price id 环境变量；PostHog `purchase` 参数按 §6.2。不许动：`_apply_credit_change` / `apply_purchase` 的逻辑、续费逻辑（T10）、模板扣费（T16）。（总控 2026-11-05 补：main 上已合并的代码仍是 `pass`/`pack`，由 T9 负责改名。）

**依据**：ARCHITECTURE §6.2 商品表（9 个 id、价格、积分、天数）、「Stripe Product / Price 映射」（三档 Product 各 4 个 Price、积分包 one-time、`lookup_key` 约定）、「分两段上线」、PostHog 参数；§6.3 Stripe 路由表（MP 不传 `allowed_payment_method_types`；非 MP 路由用 `allowed_payment_method_types`，不用已删除的 `payment_method_types`、微信 `client = 'web'`、税码 `txcd_10105001`、「审核没下来之前卡先走普通订阅」）、「要处理的 Stripe 事件」；§6.1 `apply_purchase(user, product_id, event_id)` 用 session id 当 `event_id`；§2 配置示例；DESIGN §4.5（第一屏三档、第二屏月 / 年或 S / M / L、每屏最多三个选项）；建站规格 G3；AGENTS §6 回调验签、§7 测试 2。

**预览环境的支付回调**（总控 2026-11-05）：预览地址每个 PR 不同，且开着 Vercel 部署保护，Stripe 的回调会被挡成 401。做法：本地开发用 `stripe listen` 转发；CI 用签名后的模拟回调测（AGENTS §7 测试 2）；在预览上端到端验收时，打开 Vercel「Protection Bypass for Automation」，Stripe 测试模式登记一个回调，网址 = 正在验收的 PR 的分支地址 + `/api/webhooks/stripe?x-vercel-protection-bypass=<绕行密钥>`，换 PR 验收时只改网址、签名密钥不变。成功页 / 取消页地址由代码按当前部署地址（`core/site-url`）生成。绕行密钥和签名密钥只放 Vercel 环境变量与 Stripe 后台，不进代码、不进 PR。

**范围补充（总控 2026-11-05）**：不接微信支付，只有卡和支付宝（ARCHITECTURE §6.2 / §6.3、DESIGN §4.5）；付费墙档位卡三种材质色和年付节省金额按 DESIGN §4.5；同步把法律页面（`site/content/legal/`）里提到 WeChat Pay 的句子删掉。

**范围补充 2（总控 2026-11-05）**：新增 SQL 函数 `current_tier(user_id)`（ARCHITECTURE §6.2「会员档位权益」），生成限频的并发上限按档位 1 / 3 / 6（没有档位为 1）；付费墙档位卡按 DESIGN §4.5 列权益，Coming soon 单独成组；不写「排队优先」。

**范围补充 3（总控 2026-11-06）**：Owner 已建好 Stripe 账户的沙盒（测试环境），**未提交激活**。本卡：
- 定 Stripe 环境变量名，写进 `core/env.ts` 和 `.env.example`（密钥只在服务端）。
- 写幂等脚本 `scripts/stripe-setup.ts`：用环境变量里的密钥，按 ARCHITECTURE §6.2 建好 9 个商品的 Product 和 15 个 Price（`lookup_key`、`metadata.product_id`、税码 `txcd_10105001`）。已存在的跳过，价格对不上时报错、不覆盖。
- PR 里给 Owner 写清步骤：
  1. 在本机带测试密钥跑一次脚本。
  2. 打开测试环境的 Alipay。
  3. 把密钥填进 Vercel Preview。
  4. 预览部署后登记 Webhook。

  上线时换正式密钥再跑一次。密钥不进聊天、PR、日志。

**验收**：LAUNCH §5 的商品 / Price 一条、Stripe 卡与钱包两条 + 回调重发三次只发一次 + 签名错误 400；付费墙在 375px 上每屏不超过三个选项、不滚动能完成选择（Codex 验收）。

**依赖**：T2、T5、T6、T15（编号段）、T16（模板扣费字段）。

## T10 订阅续费、取消同步、Customer Portal（等 T9；首个付费用户满 30 天前上线）

**目标**：`invoice.paid`（只认 `subscription_cycle`）→ `apply_subscription_renewal`（invoice id 幂等，`paid_until` 对齐 `period_end`）；`customer.subscription.updated / deleted` 更新镜像表；`charge.refunded` 和 `charge.dispute.created` 记录 + Sentry 告警；账号页 Subscription 区块 + Customer Portal 链接。

**范围补充**：迁移编号段 `0100`～`0119`，新增 SQL 函数 `apply_subscription_renewal`（ARCHITECTURE §6.1）；**付款记录表 `payments`**（总控 2026-11-06 补，供后台「订单与收入」显示真实数据）：
- 每次成功付款一行，字段：
  - 用户、商品；
  - Stripe 的 session / invoice / charge id；
  - 实付金额（`amount_total`，含税）、币种、税额；
  - 付款方式（`card` / `alipay`）；
  - 渠道（stripe / waffo）；
  - 状态（`paid` / `refunded` / `partially_refunded` / `disputed`）；
  - 时间。
- 写入：由 `settle_checkout`（首付、单笔）和 `apply_subscription_renewal`（续费）在同一事务里写入。
- 状态更新：`charge.refunded`、`charge.dispute.created` 更新状态，只记录，不扣积分。
- 金额和付款方式由回调从 Stripe 取回后传入，不信任客户端。
- 本卡合并后，T23 的订单页改读这张表（另开一个小 PR），测试连本地 Supabase：同一 invoice 重发只发一次、`paid_until` 对齐 `period_end` 且不回退。

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

**范围补充（总控 2026-11-06）**：迁移编号段 `0200`～`0219`，新增 `settle_waffo_order`（ARCHITECTURE §6「付款记录与续费函数」），Waffo 回调改调它，不再直接调 `apply_purchase`。

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

**范围补充（总控 2026-11-05）**：投票权重按 `current_tier`，Max 为 3，其余为 1（`votes_count` 存加权后的总数，取消投票按同样权重减）。

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
- `supabase/migrations/` 编号段 **`0020`～`0039`**（T15 PR #24 规划的空闲段；**T15 未合并前不写迁移**，基线合并后编号必须高于 `0006`）：`templates.credits_cost` 改为 jsonb（三个键 `1k` / `2k` / `3k` 必填、正整数，check 约束），`templates.quality` 文本列（`high` / `medium`，默认 `high`）；`admin_upsert_template` 读写这两个字段；`reserve_credits(job_id, resolution)` 从 `templates.credits_cost ->> resolution` 取数（不再信任调用方传入的 cost），非法分辨率抛错；`freeform` 种子行三档都配。一张卡一次成型，不准先加列再改列。
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
- 服务条款、隐私政策同样参考 Graylum staging `terms.html`、`privacy.html` 的结构，但内容按 Shotviva 事实写：免费作品公开展示并带水印、付费作品私密可商用（§6.2）；用户对上传内容负责、画风模板只用通用风格（§5）；用来生成的照片随作品保留、没用的上传 7 天删除，成品保留到用户删除（§8.3）；需求墙参考图规则（§15.5）；第三方服务清单（Supabase、Cloudflare R2、OpenAI、Stripe / Link、Waffo、PostHog、Sentry、Resend、Vercel）；PostHog 不使用 Cookie（§16）；连接 Graylum 时共享的信息（账号 id、剩余积分，§14）；账号删除（§13）。
- LAUNCH §8 全部条目。

**验收**：
- [ ] 四页可访问、`noindex`，页脚每页可见并链接到四页，主体信息与配置一致
- [ ] PR 正文附「与 Graylum 条款的差异清单」和「需要律师重点看的条款」清单
- [ ] Owner 审阅通过（律师意见由 Owner 自行安排）

**依赖**：T5（已合并）。

## T20 数据库收尾：用户总览视图、迁移只加不改的 CI 检查、收回多余权限（可派）

**目标**：约半天。
1. 迁移（编号段 `0040`～`0059`）：新建 `admin` schema（不加入 Data API 暴露列表）和视图 `admin.users_overview`（ARCHITECTURE §10 表里的字段，按 `auth.users.email` 可搜），`revoke all` 给 `anon` / `authenticated`，只给 `service_role`；同一迁移或另一迁移里对 `public.templates`、`public.profiles` 执行 `revoke all ... from anon, authenticated` 再按现有 RLS 需要重新授 `select`，消掉 `schema.sql` 里多余的 `REFERENCES / TRIGGER / TRUNCATE / MAINTAIN` 默认授权（T15 PR #24 的观察项）。重新生成 `supabase/schema.sql`。
2. CI：新增一步，PR 里如果修改或删除了 `origin/main` 上已有的 `supabase/migrations/*.sql` 就失败；PR 标题带 `[baseline]` 时放行（AGENTS §5）。
3. 测试：匿名和普通登录用户读 `admin.users_overview` 失败；`service_role` 能读且按邮箱筛出指定用户；`templates` / `profiles` 现有读写行为不变（已有 RLS 测试全过）。

**依据**：ARCHITECTURE §10 运营表；AGENTS §5 新增两条。**依赖**：T15（已合并）。与 T16 并行时注意：两边都会改 `supabase/schema.sql`，后合并的一方 rebase 后重新生成快照，不手工合并。

## T21 简体中文全站（等 T8 合并）

**目标**：上线时用户主路径上的 14 个页面和相关组件有简体中文版（ARCHITECTURE §17 清单）；法律页和 SEO 内页只有英文。
1. 路由：next-intl 开 `zh`，英文不带前缀、中文 `/zh`；中间件只认地址和 `NEXT_LOCALE` Cookie，不按浏览器语言或 IP 自动跳转；浏览器语言为中文的访客在英文页看到可关闭的「切换到中文」提示；页头 / 页脚语言切换器（真实 `<a href>`）。`<html lang>`、hreflang（`en` / `zh-Hans` / `x-default`）、每种语言独立 sitemap；`/zh` 页默认 noindex，T22 的中文主词表合并后，表里的页面放开收录。
2. 文案：`site/messages/zh.json` 补齐全部界面文字；`/zh`、`/zh/image-to-image-generator`、`/zh/pricing` 三个收录页的中文正文放 `site/content/`。直答块、FAQ、Title、Description 按中文真实问法写，不机器直译，遵守建站规格 G13 和 §6.1；主词以 T22 为准。没有中文版的页面按 ARCHITECTURE §17 处理：不输出 `/zh` hreflang，不弹提示条，切换器指向 `/zh` 首页。法律页不做中文；付费墙「支付宝」；Stripe Checkout 传 `locale`。
3. 模板：迁移（编号段 `0120`～`0139`，先合并本卡的 [spec] 定义再写）给 `templates` 加 `translations jsonb not null default '{}'`（ARCHITECTURE §5 结构，check 约束只允许已启用语言的键）；`admin_upsert_template` 读写它；公开查询按当前语言取名称和说明，缺项回退英文；后台模板编辑页加中文名称 / 说明 / 字段标签输入。
4. 字体：按 ARCHITECTURE §17「字体」一条移植 MiSans。分包文件从 Graylum staging 分支 `apps/web/public/fonts/misans/` 原样复制（含 manifest、LICENSE、NOTICE），用 `manifest.json` 的 SHA-256 逐个校验。另外要做的：加载组件、immutable 缓存头、中间件排除、字体栈、署名（按 ARCHITECTURE §17 和 DESIGN §6.9：放在条款页「Third-party notices」一节并链接 LICENSE，不放页脚）。英文页面不应因此多下载中文分包（用浏览器网络面板确认）。
5. 邮件：注册时把当前语言写进 `user_metadata.locale`；`supabase/templates/*.html` 四个模板加中文分支（ARCHITECTURE §7）；本地 Supabase + Mailpit 验证中英两种；PR 里给 Owner 写好重新粘贴的步骤。
6. 埋点：PostHog 事件带 `locale`（ARCHITECTURE §16）。

**不许动**：价格和积分规则、提示词（始终英文）、付费墙结构（T9）。**依据**：ARCHITECTURE §5、§7、§16、§17；建站规格 §6、G3、G13、R4；DESIGN §3.2、§4.5；LAUNCH §7.6。**验收**：LAUNCH §7.6 全部条目（Codex 验收，中文页 375px 和 1280px 截图）。**依赖**：T8（界面组件稳定后再加语言）、T11、T19。

## T22 中文关键词研究与中文口径主词表（可派，不写代码）

**目标**：产出 `seo资料/Shotviva 页面与主词映射（中文口径）.csv`，结构与美国口径 CSV 一致：每个英文页面对应的 `/zh` 页的中文主词、Google 中文月搜索量、难度、搜索意图、建议的中文 Title / H1。只研究 Google（简体中文用户：中国大陆翻墙用户、新加坡、马来西亚、海外华人），不做百度。用哥飞 SEO 工具箱和 Ahrefs 查真实数据，数字只来自工具结果；查不到的写「查不到」。另附一份「中文用户的真实问法」清单（≥20 条，供 T21 写直答块和 FAQ）。

**交付**：一个 [spec] PR（只含 CSV 和一页研究说明），Owner 审阅后合并。**依赖**：无，可与 T8 并行。

## T17 出图供应商后台配置（可派）

**目标**：Owner 在后台增改出图供应商（地址、模型、密钥），测试连接，一键切换当前使用的供应商；换供应商、换模型都不改代码、不重新部署（ARCHITECTURE §3.3）。

**范围**：
- 迁移（编号段 `0140`～`0159`，本卡 [spec] 合并后再写）：表 `ai_providers`（字段、RLS 拒绝客户端、`module` 上 `is_active` 的部分唯一索引、`base_url` 只允许 https 的 check）+ 函数 `admin_activate_provider(p_id)`（service role 调用，同一事务切换）；重新生成 `supabase/schema.sql`。
- `core`：取在用供应商（缓存 + `providers` 标签失效）、AES-256-GCM 加解密（`PROVIDER_SECRETS_KEY` 进 `core/env.ts`，server-only）、`base_url` 校验（https，拒绝 localhost、内网、保留地址）、没有在用供应商时用环境变量兜底；`run-generation` 改为按在用供应商构造适配器，`generation_jobs.provider` 写 `<id 或 env>/<模型>`；模板 `model_params.model` 不再生效。
- `modules/image`：`openai_images` 适配器从配置读 `baseUrl` / `model` / `apiKey`（现有代码已支持 `baseUrl`）。
- 后台 `/admin/providers`：列表、新增 / 编辑（密钥只写不读）、测试连接（`GET {base_url}/models`）、设为当前使用（确认弹窗）、积分下限提醒。界面文字走 next-intl（`en.json`，后台用中文文案时同样放 messages）。
- 埋点：`generate` 事件加 `model`（ARCHITECTURE §16.2）。
- `.env.example` 加 `PROVIDER_SECRETS_KEY`；PR 里写 Owner 步骤：生成密钥、填进 Vercel（Preview 和 Production 用不同的值）、在后台录入第一条供应商并测试。

**不许动**：积分下限表和价格、模板扣费逻辑、提示词内容、T8 的界面组件（只在后台页面内工作）。

**测试**（本地 Supabase，不 mock 数据库）：客户端读 `ai_providers` 被拒绝；`admin_activate_provider` 切换后同模块只有一条在用；加解密往返正确，换密钥后解不开时报明确的错误；`base_url` 是 http、localhost、内网地址时拒绝保存；出图时用在用供应商的地址、模型、密钥（假 fetch 断言请求）；没有在用供应商时走环境变量；模板 `model_params.model` 被忽略；后台接口返回里没有密钥明文。

**验收**：Codex 在预览站用两条供应商（如官方 + 中转，或同一官方地址配两个模型）各出一张图，确认 `generation_jobs.provider` 跟着切换；测试连接对错误密钥显示失败；后台任何地方看不到密钥明文。

**依赖**：T3、T4、T16（都已合并）。和 T8 并行：T8 可能改 `core/jobs` 里的并发上限，后合并的一方 rebase。

## T17b 供应商密钥改存 Supabase Vault（可派，接 T17）

**目标**：照 Graylum 的做法，把出图供应商的 API 密钥改存进 Supabase Vault（ARCHITECTURE §3.3），去掉 `PROVIDER_SECRETS_KEY`。原因：验收时应用侧加密密钥配置出错，后台保存不了；Vault 由 Supabase 在库内加密，不需要另配密钥。

**范围**：
- 新迁移（编号接 T17 段 `0141`～`0159`；本卡 [spec] 合并后再写）：
  - `ai_providers` 加 `vault_secret_id uuid`，删 `api_key_ciphertext`（表里没有数据，按 AGENTS §5 用 `alter`）。
  - 新增 `admin_set_provider_key`、`provider_api_key`。
  - 删除供应商时同时删掉 Vault 记录。
  - 重新生成 `schema.sql`。
- 代码：
  - 删掉 `core/providers/secrets.ts` 的 AES 加解密和 `PROVIDER_SECRETS_KEY`（同时从 `core/env.ts`、`.env.example` 删）。
  - 保存走 `admin_set_provider_key`，出图和测试连接走 `provider_api_key`。
  - 后台「新增 / 编辑」的报错改成对应的原因码。
- 测试（本地 Supabase）：
  - 存、换、清空密钥都正确；
  - 客户端读不到 `vault`；
  - `provider_api_key` 只有 service role 能调；
  - 删除供应商后 Vault 记录也没了；
  - 列表接口不返回明文。

**Owner 步骤**：合并后在 Vercel 删掉两个 `PROVIDER_SECRETS_KEY`（Preview、Production），在后台重新添加供应商。

**依赖**：T17（已合并）。
## T23 后台外壳与运营页（可派）

**目标**：把后台从零散的几页变成完整的运营后台（ARCHITECTURE §10、DESIGN §7），只做本站已有的功能。

**范围**：
1. **后台外壳**：
   - `app/(app)/admin/layout.tsx`：左侧导航，依次是概览、用户、订单与收入、出图记录、模板、出图供应商、需求审核、公告横幅，当前页高亮；顶部放账号和「回到网站」；手机上导航收成下拉。
   - 所有后台路由在 layout 里统一调用 `requireAdmin()`，非管理员仍然 404。
   - 现有的模板页、供应商页挂进外壳，功能不改。
   - 需求审核：`features.wishlist` 关闭时不放进导航。页面本身由 T12 做，本卡只放入口。
2. **概览** `/admin`：`admin_dashboard_stats(p_days)` 一个函数返回全部统计卡片和 30 天趋势，只用 `generation_jobs`、`credit_ledger`、`profiles`、T9 订单表上已有的 `created_at` 索引。
3. **用户** `/admin/users`：
   - 邮箱搜索，最多返回 50 条。
   - 用户详情里的积分流水用游标分页。
   - 调积分、封禁 / 解封都要二次确认并填写原因。
   - 新增 `admin_unban_user(p_user_id, p_reason)`，写审计日志。
4. **订单与收入** `/admin/orders`：
   - 读 T9 的订单 / 订阅表，按商品和渠道汇总，每行链接到 Stripe 后台。
   - T9 后端还没合并时，这一页显示「T9 上线后可用」，不造假数据；也可以先做其他页，等 T9 合并后再补这一页。
5. **出图记录** `/admin/jobs`：筛选、游标分页、失败原因、按模型和清晰度统计次数和估算成本。成本单价是常量，放在 `modules/image/credits-floor.ts` 旁边。
6. **公告横幅**：
   - 迁移，编号段 `0160`～`0179`，本卡 [spec] 合并后再写：
     - `site_announcements` 表和 RLS；
     - `admin_activate_announcement`（启用即切换，自动停用时间段重叠的旧公告），以及 `tstzrange` 排他约束；
     - `admin_unban_user`，同时给 `admin_audit_log.action` 加上 `unban_user`；
     - `admin_dashboard_stats`（不含收入）；
     - `admin_search_users`；
     - 三个全局时间索引（ARCHITECTURE §10「后台数据访问补充」）。
   - 收入函数 `admin_revenue_stats` 由订单页那个 PR 新建。
   - 后台页 `/admin/announcements`。
   - 前台横幅组件：
     - 放在营销页和应用页最顶部，按当前语言显示。
     - 可关闭，关闭状态按公告 id 存在 localStorage。
     - 后台、结账、生成过程中不显示。
     - 读取走缓存，打 `announcements` 标签。
     - 横幅文字用表里的中英两列，不进 messages。

**规则**：
- 遵守 AGENTS §5.1：一个动作对应一个函数；PR 里写明命中的索引；列表分页；不写 `select *`；Advisor 不新增 WARN。
- 后台文案用中文，放在 `copy.ts`（DESIGN §7）。
- 前台横幅用 B 版颜色变量，375px 宽度下不挤压页头。

**不许动**：模板和供应商页的功能、价格和扣费、T9 的支付逻辑、T12 的需求墙逻辑。

**验收**：由 Codex 在预览站验收，截电脑 1280px 和手机 375px 的图：
- 非管理员访问任何 `/admin/*` 都是 404。
- 概览数字和直接查库的结果一致。
- 调积分写流水；封禁、解封写审计日志。
- 公告：定时生效和到期正确；中英文切换正确；关闭后不再出现，换新公告后重新出现。

**依赖**：T3、T17、T20（已合并）；订单页依赖 T9 后端。

## T24 预览站 QA 测试账号与一键登录（可派）

**目标**：每轮浏览器验收不再让 Owner 手动登录、切换账号（Owner 2026-11-06）。用两个本地脚本完成：一个建好固定的测试身份，一个给每个身份生成一次性登录链接。Codex 打开链接，就以对应身份登录。

**范围**：
- `pnpm qa:accounts`（`scripts/qa/`）：建好或重置以下 5 个身份，可以重复运行，每次运行后状态一致：
  | 身份 | 说明 |
  |---|---|
  | `qa-admin` | 管理员，带付费积分 |
  | `qa-creator` | 至少有一次成功出图 |
  | `qa-fresh` | 每次重建，没有出图记录 |
  | `qa-max` | 用测试商品入账成为 Max |
  | `qa-free` | 只有注册赠送的免费积分 |
  - 账号用 Supabase Admin API 创建（邮箱已验证，不设密码），邮箱用 `qa-<身份>@shotviva.com` 这类地址，脚本不发邮件。
  - 积分和会员只通过已有 SQL 函数设置，例如 `admin_adjust_credits`、`settle_checkout`、`apply_purchase`，并带固定幂等键，每笔都写流水。
  - 出图记录也走已有函数，不直接改表。需要占位图时上传到 R2 的该用户目录下。
  - 角色在 `profiles.role` 上设置，属于运营数据（AGENTS §5 允许）。
- `pnpm qa:login <身份> [--next /path]`：
  - 用 `auth.admin.generateLink({ type: 'magiclink' })` 拿到 token hash。
  - 输出 `<验收站>/auth/confirm?token_hash=…&type=magiclink&next=…` 一次性登录链接（复用现有 `/auth/confirm`，不新增路由、不绕过人机验证逻辑）。
  - 每次运行生成新链接，用一次就失效。
- **安全**：
  - 两个脚本只在预览库运行：Supabase 项目编号必须等于预览库 `pnzkiqvktkzznfbyhphe`（可用环境变量覆盖，但永远拒绝生产库），否则直接退出。
  - 服务端密钥只从本机 `.env.local` 读，不进仓库、不打印。
  - 输出的链接等同于登录凭证，不贴进 PR、Issue 或聊天。
- **文档**：`scripts/qa/README.md` 写明用法、每个身份的初始状态，以及给 Codex 的一段固定说明（验收开始先跑 `qa:accounts`，每个窗口用 `qa:login` 登录各自的身份）。

**不许动**：登录流程和人机验证配置、生产环境、任何迁移。

**测试**：
- 单元测试：项目编号守卫（生产或未知编号直接拒绝）、链接拼装。
- 用本地 Supabase 跑一遍：两次 `qa:accounts` 之后数据一致，用 `qa:login` 生成的链接能登录、只能用一次。

**依赖**：T1、T9、T20（已合并）。

## T25 后台客服工具 + 同 IP 限制 + 封禁范围（可派）

**目标**：ARCHITECTURE §10「客服与付款补救」里的万能查找、用户详情补全、后台查看作品、卡住任务和单张补偿、可疑注册五项，加上 §7 的同 IP 限制和封禁范围。

**范围**：
- 迁移（编号段 `0180`～`0199`，本卡 [spec] 合并后再写）：
  - 函数 `admin_lookup`、`admin_signup_ip_clusters`；
  - 两个新索引，部分索引 `generation_jobs(created_at) where status = 'running'`；
  - `admin_audit_log` 的 `action` 加上 `view_work`、`replay_checkout`，并加 `target_id`；
  - 用 `create or replace` 改注册赠送函数，加上同 IP 检查；
  - 用 `create or replace` 改 `admin_ban_user`：同一事务里断开 Graylum 连接。
- 结账路由对被封禁账号返回 403。
- 隐私政策（`site/content/legal/privacy*`）加查看作品的那一句；有中文版时中英都加。
- 后台页面的文案用中文，放在 `copy.ts` 里。

**依据**：ARCHITECTURE §7、§10；`docs/proposals/admin-roadmap.md` 的 A1–A4 和 A7；AGENTS §5.1（每个查询写明用到的索引）。

**测试**：
- 同 IP 24 小时内的第二个账号拿不到赠送、能付费；
- 被封禁的账号结账返回 403，Graylum 连接被断开；
- 补偿同一单只生效一次；
- 卡住的任务能退回，已结算的任务不受影响；
- 查看作品时写审计日志，签发的地址 5 分钟后过期；
- `admin_lookup` 的每种输入都能找到对应用户。

**依赖**：T10、T23（已合并）。

## T26 付款补救与概览待处理（接 T25，同一窗口做）

**目标**：ARCHITECTURE §10 里的「按 Stripe id 重放入账」和概览「待处理」条。

**范围**：
- `core/billing/stripe/` 新增一个重放入账的服务端动作，调用 `settle_checkout` 或 `sync_subscription`，Owner 确认后才写入，并写审计日志。
- 迁移新增函数 `admin_todo_counts`（编号接 T25 的编号段）。
- 概览页顶部加「待处理」条，每一项都能点进对应页面。

**测试**（AGENTS §7 第 2 条）：重放和回调谁先到都只入账一次；session 未付款时拒绝重放；`sub_` 重放只更新镜像行。

**依赖**：T10（已合并）、T25。

## T27 站内工单（可派）

**目标**：ARCHITECTURE §10「站内工单」：用户侧提交表单和「我的工单」、后台工单列表和详情、退款审核面板、小红点提醒，以及退款政策和隐私政策的措辞修改。

**范围**：
- 迁移（编号段 `0220`～`0239`，本卡 [spec] 合并后再写）：两张表、RLS、三个索引、7 个函数。
- 用户页面：账号页「Help & feedback」、页脚「Contact」、提交页、「我的工单」，文案中英文都要有（next-intl）。
- 后台：「工单」导航（带待处理数）、列表、详情、退款面板。
- 概览「待处理」条加上工单数：如果 T26 已经合并，就在它的 `admin_todo_counts` 基础上用 `create or replace` 加一项并在 PR 里写明；如果 T26 还没合并，请先和总控协调。
- 改退款政策和隐私政策的措辞。

**依据**：ARCHITECTURE §10；`docs/proposals/admin-roadmap.md` A8；AGENTS §5.1。

**测试**：
- 退款工单必须关联本人的付款，别人的付款被拒绝。
- 限频：24 小时内第 6 张被拒绝。
- RLS：用户只能看到自己的工单。
- `refund_eligibility` 三项检查正确：首次购买、7 天内、付款后没用过积分（免费积分也算）。
- 未读判断正确，`mark_ticket_seen` 能清除未读。
- 删号时工单一起删除。

**依赖**：T10、T23（已合并）；T21（中文文案，按合并先后协调）。

## T27b 工单按档位时效排序（接 T27，同一窗口做）

**目标**：让 Owner 兑现「Starter 48 小时、Pro 24 小时、Max 当个工作日」。
**范围**：`TIER_SUPPORT_REPLY_HOURS` 改为 Starter 48、Pro 48、Max 24；`admin_list_tickets` 每行返回用户当前档位和 `due_at`（最后一条用户消息时间 + 档位时效小时数）；后台列表默认按 `due_at` 升序，超时标红；`admin_todo_counts` 加「已超时工单」一项。迁移编号沿用 `0220`～`0239`。
**依据**：ARCHITECTURE §6.2「会员档位权益」、§10「站内工单」。
**测试**：三档的 `due_at` 计算；没有档位按 48 小时；超时计数。

## T28 批量上传（可派）

**目标**：Pro 一次 10 张、Max 一次 30 张，按 ARCHITECTURE §6.2「批量上传的语义」。
**范围**：
- 整理 `TIER_LIMITS` 一张表（§6.2），付费墙权益文案从这里读；`perWindow` 按档位替换固定的 20；新增 `TIER_REQUIRED` 错误码和付费墙预选档位。
- 工作台相册多选（相机入口不变），Pro / Max 以外只取第一张并提示；逐张压缩上传、可取消单张；`job-store` 加排队状态和调度器，按并发上限发请求，刷新后能续跑。
- 发起前预检整批费用 ≤ 付费池，不够时按钮变「Get credits · N needed」。
- 生成中改成列表视图（每张一行：缩略图、状态、失败原因、Retry）；`generate` 事件加 `batch_size`。
- 文案中英文都要有；先过一遍 impeccable，手机稿优先。
- 不加迁移（不建表、不加 `batch_id`）。
**测试**：调度器（并发槽位、一张失败不挡后面、刷新恢复）；`perWindow` 按档位的 db 测试；余额预检；Starter 多选只取一张。
**依赖**：T21（中文文案，按合并先后协调）。

## T29 新功能档位权限（可派）

**目标**：ARCHITECTURE §6.2「新功能抢先用」：权限接口和后台先做好，现在注册表可以是空的。
**范围**：
- 迁移（编号段 `0240`～`0259`，本卡 [spec] 已合并）：`feature_access` 表、RLS（打开、不建策略）、`admin_set_feature_access(key, min_tier, open_to_all_at)` 函数（写 `updated_by`）。
- `core/features`：注册表、`featureOpen` 纯函数、`requireFeature(userId, key)`（档位不够抛 `TIER_REQUIRED`）、带缓存标签的读取。
- 后台「功能权限」页 `/admin/features` 和导航项（中文，`copy.ts`）。
- 付费墙 Max 权益文案改成 "Early access to new features"（中英文）。
**测试**：`featureOpen` 各种组合（无行、min_tier 空、到期开放、档位不足 / 足够、无档位）；`requireFeature` 抛错；未知 key 不能写入；保存后缓存失效。
**依赖**：T23（后台外壳，已合并）。

## T30 作品编辑（可派；界面等 T6 出稿）

**目标**：ARCHITECTURE §5.2：在自己的作品上写一句话再改一张，先判断改动范围，再按范围加约束出图。
**范围**：
- 迁移（编号段 `0260`～`0279`，本卡 [spec] 已合并）：`generation_jobs.parent_job_id`（外键 `on delete set null`）；`reserve_credits` 接受编辑任务（校验原作品属于本人且成功）；内置模板 `edit` 的种子（`visible_in` 为空、默认 2 / 4 / 6；提示词和约束段落不进仓库，只放占位，Owner 在后台填）；`ai_providers.module` 允许 `'decision'`。
- `openai_responses` 判断适配器（GPT-6 Luna，结构化输出 `{ scope, confidence, keep, change }`、3 秒超时、失败走兜底，接口可替换）；`modules/image` 的编辑路径：读原作品无水印原图、按范围拼提示词、`/v1/images/edits`、`input_fidelity`。
- 后台：供应商页能配「判断」供应商；`edit` 模板编辑页能改判断指令和六段约束。
- 前台：作品详情页「Edit」按钮和编辑面板（等 T6 稿）；新作品详情显示「Edited from」链接。文案中英文都要有。
- `generate` 事件加 `edit_scope`。
**测试**：只能编辑本人成功作品；扣费、退回和模板出图一致；判断超时 / 失败走兜底；概率最高且 ≥ 0.5 才采用；`inputs` 不含封装提示词；删号时编辑作品一起删。
**效果检查**：PR 里贴中英文各 10 句典型说法的前后对比（§5.2），不设通过门槛。
**依赖**：T6 编辑面板设计稿；T17 / T17b 供应商后台（已合并）；T21（中文文案，按合并先后协调）。

## T33 真实出图成本与账单对账（可派）

**目标**：ARCHITECTURE §10.0：每单记真实用量和成本，后台显示真实成本，并和 OpenAI 实际账单对账。
**范围**：
- 迁移（编号段 `0280`～`0299`，本卡 [spec] 已合并）：`generation_jobs.provider_usage`、`cost_usd`；`ai_providers` 三个单价字段；结算函数多收用量和成本参数（一次往返）；管理员密钥的 Vault 存取函数（照 T17b 的做法）。
- 适配器读出图响应的 `usage`（字段名以 OpenAI 当前文档为准）；作品编辑（T30）合并后把判断那一步的 token 也加进来，谁后合并谁补。
- 后台：供应商页可填单价、没填标红；出图记录每单成本；概览和出图记录的模型统计改用 `cost_usd`，老任务回退估算并标注；新页面 `/admin/costs`（对账）；管理员密钥的填写入口。
- 删掉不再需要的估算用法，`GENERATION_COST_USD` 只留作老任务回退。
**测试**：用量换算成本（含缺字段、单价未填）；结算写入一次往返；失败任务有用量也记成本；对账页在没填管理员密钥、接口出错时的显示；密钥只显示后 4 位、不进日志。
**依赖**：T17 / T17b（已合并）；和 T30 都改结算路径，按合并先后 rebase。

## T34 账号页「集成」区块（可派，小）

**目标**：ARCHITECTURE §13「v1 范围」里的账号页一条：把现在直接摆在账号页上的 Graylum 连接，收进一个「Integrations / 集成」区块。区块里一行一个外部产品，现在只有 Graylum：显示名称、一句说明、状态（已连接为「Enabled / 已启用」，否则「Not enabled / 未启用」），点进去或展开后是现有的连接 / 断开操作。
**范围**：账号页布局和文案（中英文）；不改 Graylum 连接逻辑和接口；状态读现有的连接记录，不多一次查询。照 DESIGN 现有样式，不需要新设计稿。
**测试**：已连接 / 未连接 / 已撤销三种状态显示正确；断开后状态变「未启用」。
**依赖**：T21 中文文案按合并先后协调。

## T32 作品详情显示实拍原图和用户写的话（可派；界面等 T6 出稿）

**目标**：Owner 2026-11-06：Photos 里点进一张作品，除了成品，还要看到当时上传的实拍图和自己写的补充说明，以及模板、清晰度、花费、时间。
**范围**：
- 结算时另存原图小图（ARCHITECTURE §8「原图小图」），已有作品没有小图的显示「原图已按隐私规则删除」（7 天内的老作品可以从 `inputs/` 补一次，不强求）。
- 作品详情页：成品、原图小图（或作品编辑的「Edited from」原作品）、用户写的补充说明 `inputs.note` 或编辑说明 `inputs.instruction`（原文显示，这是用户自己的话，不是我们的提示词）、模板名、清晰度、花费积分、时间。读取一次往返：详情页本来就按主键读 `generation_jobs`，小图用签名地址或现有文件路由。
- 隐私政策改一句（§8）。
- 文案中英文都要有。
**测试**：结算写小图（去 EXIF、尺寸、失败不影响结算）；删号清除；详情页不泄露封装提示词；别人的作品读不到。
**依赖**：T6 详情页设计稿；和 T30（作品编辑）、T31（透明图显示）都改作品详情页，按合并先后 rebase。

## T35 首页 FAQ 改写（接 T21，同一窗口做）

**目标**：建站规格 G6 首页 9 句和「首页 FAQ 的写法」：重写现有 5 句的答案（A 的首句按 G6 固定写法），加 F（不用写提示词）、G（尺寸格式）、H（手机能不能用）、I（What is Shotviva?，放最后）四句，D 后加 4 行对比表；首页以外的页面 Title 以 ` | Shotviva` 结尾（≤60 字符，建站规格 §1）。中英文一起改，中文按 G13 用母语重写。
**范围**：`src/site/content/home.ts` 和中文对应内容；`FaqItem` 支持可选的对比表（服务端渲染成 `<table>`，结构化数据里只放问答文字）；所有数字从 `site.config` 和常量读；FAQPage 结构化数据和页面文字同源。
**测试**：结构化数据和页面文字一致；9 个问题都是 `<h3>`；答案在服务端 HTML 里；数字和价格页一致。
**依赖**：T21 三个 PR 合并后做。

## T36 首页改版（按定稿 v3-b，可派）

**目标**：首页按 `design/comps-v3-b/home.html` 实现（375 / 1280 / 1440 三档，`DESKTOP-NOTES.md`、`SIGN-OFF.md` 第 01 行）。
**范围**：
- 首屏左右两栏 + 生成栏。生成栏真的能出图（DESIGN §6.9 第 9 条）：已登录走和工作台同一条出图路径并跳到工作台生成中视图；未登录弹注册 / 登录并保留选择；积分不够打开付费墙。
- 模板区（并排对比卡、模板选择对话框、悬停擦除）、对比表 / 账单卡（数字从 `site.config` 读）、相关链接卡（只渲染已存在的页面）、FAQ 手风琴（答案在服务端 HTML 里，`home-faq.test.ts` 必须继续通过）、导航（地球语言切换已在主线，对齐样式即可）、页脚。
- 中英文都要；动效在「减少动态效果」下关闭；LCP 图片预加载。
**依赖**：T21 / T35（已合并）。和 T37 共用 `tiers` 相关组件时按合并先后协调。

## T37 定价页和付费墙改版（按定稿 v3-b，可派）

**目标**：`pricing.html`、`paywall.html`（`SIGN-OFF.md` 第 02、03 行）。
**范围**：三档卡（Max 金、Pro 蓝宝石、流光动效）、月付 / 年付切换和「Save up to 40%」、积分包三档、「For business」板（DESIGN §6.9 第 8 条，`contact_sales_click` 事件）、电脑端付费墙居中对话框（920px）、手机底部抽屉；权益文字只从 `TIER_LIMITS` 和配置读。中英文。
**依赖**：T36 并行，共用组件谁后合并谁 rebase。

## T38 应用的电脑端布局（按定稿 v3-b，可派）

**目标**：`create.html`、`workspace.html`、`photos.html`（`SIGN-OFF.md` 第 04～06 行，DESIGN §6.9 第 2、3、7 条）。
**范围**：≥768 底部 tab 变固定顶栏；点模板直接弹出创作对话框（手机底部抽屉，电脑 1040px 两栏），工作台是同一表单的整页形态（一份表单源）；模板缩略图悬停擦除；Photos 网格和并排对比卡；作品详情页已由 T32 / T30 做完，只对齐顶栏。中英文。
**依赖**：T28（批量上传）和 T32 / T30（详情页）已合并，在其上改，不要回退它们的功能。

## T39 账号页改版（按定稿 v3-b，可派）

**目标**：`account.html`（`SIGN-OFF.md` 第 08 行，含 `?sub=cancelled|expired|past_due|wallet` 四种订阅状态）。
**范围**：Plan 卡、Credits 两格、Settings 行（Email / Language / Purchases / Support）、Integrations 区块（T34 已做，只对齐样式；Shopify 行是示意，不实现）、Sign out / Delete account；订阅状态读 T10 的镜像表和 `paid_until`；Manage subscription / Update payment method 走 Stripe Customer Portal。中英文。
**依赖**：T10、T34、T21（已合并）。

## Owner 侧关键路径（不是任务卡，但比代码慢）

- 第一批 10 个模板（6 类）的真实照片 + 前后对比素材 + 提示词调优
- Stripe 新账户申请（卡 + 支付宝，不接微信支付）
- Waffo 加急开通
- OpenAI 组织验证 + GPT-Image 系列模型权限；决定 `OPENAI_IMAGE_MODEL` 默认用 2.5 还是 2.6（同价，2.6 更快，需比较效果）
- 上线前成本测量：20 张真实照片实测输入图 token（LAUNCH §5，花费 < $5），据此定 `high` 1K 是 2 还是 3 credits
- Resend 域名验证
- ~~价格数字定稿（pricing-research 窗口）~~ 已定稿 2026-11-05（ARCHITECTURE §6.2）；Waffo 费率仍待向商务确认

## T40 输入图随作品保留，Make again 随时可用（可派）

**目标**：Owner 2026-11-06 定：作品用的原图跟作品一起保留，保证 Make again 任何时候都能直接用（ARCHITECTURE §8.3「输入图随作品保留」）。

**范围**：
- 结算时把这次的全部输入图用 R2 服务端复制写到 `outputs/{user_id}/{job_id}-in-{n}.jpg`，把这些 key 记在任务上（优先放进现有字段；确实要加列时迁移编号段 `0320`～`0339`）。复制失败只记日志，不影响结算和扣费。
- Make again：作品有保存的输入图时，服务端把它复制成新的 `inputs/{user_id}/{uuid}.jpg`，工作台按旧作品预填模板、尺寸、清晰度、补充说明和照片，直接可以生成，生成链路不变。没有保存的输入图时（T40 之前的老作品、复制失败），走 T6 稿的「原图已删，请再加一次照片」状态（`workspace.html?again=expired`）。
- 删除作品时一起删这些输入图；删号按 `outputs/{user_id}/` 前缀已覆盖，确认一下。
- 768 原图小图（T32）照旧，详情页继续用它。
- 隐私政策中英文改成 §8.3 末尾那句。后台查看作品的「已过期」只对老作品出现。
- `inputs/` 的 7 天生命周期规则不动。

**验收**：新作品过 7 天后 Make again 仍然直接带着照片；删作品后输入图副本也没了；老作品走重新上传状态；复制失败不影响结算；单测和数据库测试覆盖；交互验收交给 Codex。

## T41 用户删除作品（可派）

**目标**：Owner 2026-11-06 定：用户可以删除自己的作品，兑现隐私政策「删除作品时一起删除」（ARCHITECTURE §6.2「删除作品」）。

**范围**：
- 迁移（`0340`～`0359`）：`generation_jobs.deleted_at`；`delete_own_job(p_job_id)`（本人、已完成、幂等）；所有面向用户的读取函数、视图和 RLS 排除已删除的行。
- 服务端动作：调用 `delete_own_job` 后删 R2 文件（成品、原图小图、保留的输入图，用 T40 的 `deleteWorkFiles`），失败只记日志；然后让 Photos 列表的缓存失效。
- 界面：作品详情页加「Delete」和二次确认（中英文），删完回 Photos 并提示已删除；按 T6 稿的样式放（`design/comps-v3-b/photo.html`；没有就放在详情页操作区的末尾，用危险色的次要按钮）。
- 被删作品的编辑作品详情页显示「原作品已删除」；后台出图记录标「用户已删除」，后台查看作品显示「已删除」。
- 隐私政策和账号页里「删除作品」的说法和实际行为一致。

**验收**：删除后 Photos、详情、文件地址、Make again、编辑入口都拿不到这张作品，R2 文件已删除；积分流水和成本统计不变；别人的作品删不了；生成中的删不了；单测和数据库测试覆盖；交互验收交给 Codex。

## T42 登录 / 注册 / 找回密码页按定稿重做（可派）

`auth.html`：`/login`、`/signup`、`/reset`、`/reset/update`，以及验证邮件已发送、链接过期、各种错误和 hCaptcha 状态、`?next=` 回跳（含 Graylum）。只有邮箱 + 密码和 Google，没有 Apple。**共同要求**：照 `design/comps-v3-b/` 里对应的稿做（变体见 `SIGN-OFF.md`），中英两版一起交付（ARCHITECTURE §17「全站中文化」，表外中文页 `noindex`）；文字进 messages / content，不写死；单测覆盖；交互验收交给 Codex；收尾停掉并删除本地 Docker。

## T43 结账返回页和定价页 For business 修订（可派）

`checkout.html`（成功 / 处理中，9 个商品各自的文案，收据链 Stripe 托管收据）；取消回到定价页弹 toast（`pricing.html?checkout=cancel`）；定价页 For business 换成「订单纸」样式（`pricing.html`）。**共同要求**：照 `design/comps-v3-b/` 里对应的稿做（变体见 `SIGN-OFF.md`），中英两版一起交付（ARCHITECTURE §17「全站中文化」，表外中文页 `noindex`）；文字进 messages / content，不写死；单测覆盖；交互验收交给 Codex；收尾停掉并删除本地 Docker。

## T44 404 / 空状态、公告条样式、SEO 落地页（可派）

`404.html`、`empty.html`（一个 `.state` 组件覆盖 Photos、需求墙、My requests、购买记录、404、错误、离线）；公告条两种样式 `tone = info | promo` 按 `home.html?announce=…`，字段来自 `site_announcements`；SEO 落地页骨架 `landing.html`：`/image-to-image-generator` 按稿改版，`/commercial-photography`、`/ai-restaurant-menu` 两页的事实块数字由本卡核实出处后再上（ARCHITECTURE §12）。**共同要求**：照 `design/comps-v3-b/` 里对应的稿做（变体见 `SIGN-OFF.md`），中英两版一起交付（ARCHITECTURE §17「全站中文化」，表外中文页 `noindex`）；文字进 messages / content，不写死；单测覆盖；交互验收交给 Codex；收尾停掉并删除本地 Docker。

## T45 法律四页按定稿版式（只有英文，可派）

`legal.html`：`/terms`、`/privacy`、`/refund-policy`、`/acceptable-use` 的版式；正文以现有英文为准（含 T40 / T41 的照片保留和删除作品说法、MiSans 署名），不做中文版（Owner 2026-11-06 晚）：中文页里的法律链接指向英文页，法律页上的语言切换「中文」指向 `/zh` 首页。**共同要求**：照 `design/comps-v3-b/` 里对应的稿做（变体见 `SIGN-OFF.md`），中英两版一起交付（ARCHITECTURE §17「全站中文化」，表外中文页 `noindex`）；文字进 messages / content，不写死；单测覆盖；交互验收交给 Codex；收尾停掉并删除本地 Docker。

## T46 需求墙和 Graylum 连接页按定稿重做（可派）

`wishlist.html`（墙、门槛态、投票、已上线置顶、发帖页、My requests 四种状态）；`connect.html`（授权、完成、已连接、出错，回跳白名单和一次性 code 的出错文案，ARCHITECTURE §14.2）。**共同要求**：照 `design/comps-v3-b/` 里对应的稿做（变体见 `SIGN-OFF.md`），中英两版一起交付（ARCHITECTURE §17「全站中文化」，表外中文页 `noindex`）；文字进 messages / content，不写死；单测覆盖；交互验收交给 Codex；收尾停掉并删除本地 Docker。

## T47 应用页修订：显影动画、批量三态、Make again、编辑尺寸格（可派）

`workspace.html`：生成中从扫描线改成显影式；批量上传三态（按 ARCHITECTURE §6.2 语义，Coming soon 开关不变）；Make again 的照片格显示「随作品保留的原图」（`?again=1`），老作品走 `?again=expired`；`photo.html?edit=…`：编辑面板加 8 个尺寸格。**共同要求**：照 `design/comps-v3-b/` 里对应的稿做（变体见 `SIGN-OFF.md`），中英两版一起交付（ARCHITECTURE §17「全站中文化」，表外中文页 `noindex`）；文字进 messages / content，不写死；单测覆盖；交互验收交给 Codex；收尾停掉并删除本地 Docker。

## T48 账号页修订：会员卡、用量仪表、胶卷条（可派）

`account.html`：会员卡、积分仪表、最近作品胶卷条；订阅五种状态 `?sub=active|cancelled|expired|past_due|wallet`（已取消显示结束日期和 Resubscribe，到期显示 Choose a plan，续费失败链到 Stripe Customer Portal，支付宝单期显示 Renew）；Shopify 那一行只是示意，不做。**共同要求**：照 `design/comps-v3-b/` 里对应的稿做（变体见 `SIGN-OFF.md`），中英两版一起交付（ARCHITECTURE §17「全站中文化」，表外中文页 `noindex`）；文字进 messages / content，不写死；单测覆盖；交互验收交给 Codex；收尾停掉并删除本地 Docker。

## T49 中文版对齐审计和补齐（可派）

Owner 2026-11-06 发现中文页有功能缺失。逐页对比现有英文页和 `/zh` 页（营销页和登录后的应用页、付费墙、邮件、错误页），列出中文版缺少的区块、按钮、状态和没翻译的文字，并补齐；把审计表写进 PR 正文。新页面由各自的卡负责中文，本卡只管已经上线的页面。**共同要求**：照 `design/comps-v3-b/` 里对应的稿做（变体见 `SIGN-OFF.md`），中英两版一起交付（ARCHITECTURE §17「全站中文化」，表外中文页 `noindex`）；文字进 messages / content，不写死；单测覆盖；交互验收交给 Codex；收尾停掉并删除本地 Docker。

## T50 Waffo 银行卡自动续费订阅（可派）

**目标**：Owner 2026-11-06 晚定：通过 Waffo 买会员，银行卡是自动续费订阅，支付宝仍是单次一期（ARCHITECTURE §6.3「Waffo 上的会员按付款方式分两种」）。

**范围**：
- 先读 Waffo 官方文档，确认卡订阅（定期扣款）的接口、续费 / 失败 / 取消的回调事件和测试方法；把结论写进 PR 正文。Waffo 不支持时停下来报总控，不要自己绕。
- 结账：Waffo 通道下会员 + 银行卡创建订阅，会员 + 支付宝、积分包照旧单笔。`WAFFO_PRODUCT_IDS` 若需要区分订阅商品和单笔商品，扩展映射格式并保持启动校验。
- 回调：首付和每期续费都走 `apply_purchase`（幂等键用 Waffo 的扣款 / 订单号），续费失败不发积分、不延 `paid_until`；订阅状态镜像到 `subscriptions`（`provider = 'waffo'`），取消写 `cancel_at_period_end`。迁移编号段 `0360`～`0379`。
- 账号页：Waffo 卡订阅显示下次续费日和「Cancel subscription」（我们调 Waffo 取消接口，二次确认），中英文；支付宝单期照旧显示 Renew。
- 付款页文案：卡「自动续费，可随时取消」，支付宝「不自动续费」，中英文。
- 退款、后台查找、结账返回页（T43）对 Waffo 订阅同样可用。

**验收**：LAUNCH_CHECKLIST §5 的 Waffo 沙盒一条全部走通；回调重发不重复入账；单测和数据库测试覆盖；交互验收交给 Codex（沙盒卡）。收尾停掉并删除本地 Docker。

## T51 模板封面走本站同源路径（可派）

**目标**：Owner 2026-11-07 定：DNS 留在 Vercel，不绑 `assets.shotviva.com`；封面从 `https://shotviva.com/assets/covers/...` 读（ARCHITECTURE §8.3「公开读」）。

**范围**：`next.config` 加 rewrite `/assets/:path*` → `${R2_PUBLIC_ORIGIN}/:path*`（变量缺失时不加 rewrite、构建不失败）；`/assets/*` 响应头 `Cache-Control: public, max-age=31536000, immutable`；中间件 matcher 排除 `assets/`；`next/image` 如用到封面，`images` 配置允许本站路径；`.env.example`、`public-env.ts` 注释改成新说法；`R2_PUBLIC_ORIGIN` 加进 env 校验（只在设了 `NEXT_PUBLIC_ASSETS_BASE_URL` 为本站路径时必需）。后台上传封面写的 `templates.cover_*_url` 仍是 `NEXT_PUBLIC_ASSETS_BASE_URL` + 路径，不变。

**验收**：预览上把 `NEXT_PUBLIC_ASSETS_BASE_URL` 设成预览站自己的 `/assets` 时封面能显示、响应头带 immutable、第二次请求命中 Vercel 缓存；单测覆盖 rewrite 配置；交互验收交给 Codex。UI 以外不动，无迁移。

## T52 模板英文说明（可派）

**目标**：后台建模板时可以填英文说明，英文页显示它（ARCHITECTURE §5 `templates`「英文说明」）。

**范围**：迁移（`0380`～`0399`）加 `templates.description`；后台模板编辑页加「英文说明」输入框（≤160 字，计数），保存进现有的模板保存函数；所有显示模板说明的地方按语言取值，中文缺失回退英文；预览环境的模板缓存标签照常失效。

**验收**：后台填英文说明后英文页立即显示，中文页显示中文说明，中文为空时显示英文；单测和数据库测试覆盖；交互验收交给 Codex。收尾停掉并删除本地 Docker。

## T53 首页精选模板改为后台挑选（可派）

**目标**：Owner 2026-11-07：首页（和 SEO 落地页）的精选模板不再按 id 写死在代码里，由后台任意挑选、排序、替换（ARCHITECTURE §12 首页「精选模板网格」）。

**范围**：迁移（`0400`～`0419`）加 `templates.featured_rank` 和保存函数参数；后台模板列表加「首页精选」开关 + 排序，最多 12 个、只能选已上架的；首页和落地页的模板区改为读数据库（按分类分组、名称 / 说明按语言、封面用模板自己的封面），静态生成 + `templates` 缓存标签；删除 `site/content` 里写死的模板清单和对应示意图；没有精选时退回最新上架的 6 个。

**验收**：后台勾选、排序、取消后首页立即变化，中英文都对；未上架的模板不能被选；源码里能看到模板名称和说明；单测和数据库测试覆盖；交互验收交给 Codex。收尾停掉并删除本地 Docker。

