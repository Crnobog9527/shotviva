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
- 状态更新：`charge.refunded`、`charge.dispute.created` 更新状态，只记录，不扣积分。（**已被 T71 推翻**：2026-11-07 起退款和争议自动扣回积分，以 ARCHITECTURE §6.3 为准。）
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

## T54 全站流动背景（Bold 档）+ 应用页签收动效补齐（可派）

**目标**：Owner 2026-11-07：营销页和登录后的应用页都用流动背景的 Bold 档；同时补齐签收稿里应用页缺的地面渐变和入场淡入（DESIGN §5「全站流动背景」「签收稿的应用页动效补齐」）。

**范围**：一个共享的背景组件挂在营销和应用两个布局（后台不挂）；照 `demo-background.html` Bold 预设实现五层，性能和减少动态的规则按 DESIGN；应用页地面渐变和入场淡入按 `DESKTOP-NOTES.md` 第 6 条。必须用 impeccable skill 做设计核对。

**验收**：两种布局都能看到 Bold 背景且不抢内容；手机无指针层；减少动态时全关；标签页隐藏时暂停；Lighthouse 移动端 LCP / CLS / INP 与改动前相比不退步（在 PR 里贴对比）；交互验收交给 Codex。

## T55 购买成功的庆祝动效（可派）

**目标**：Owner 2026-11-07：按 `demo-celebrate.html` 把购买成功的庆祝动效做进结账返回页（DESIGN「购买成功的庆祝动效」）。

**范围**：结账返回页成功态挂一个按需加载的庆祝组件；按商品分档（积分包 / Starter / Pro / Max，年付月付同档）；canvas 粒子引擎照 demo；同一付款只播一次（本地记付款 id）；减少动态时只淡入；可点击跳过；中英文文案不变。Stripe 和 Waffo 的成功态都要触发。

**验收**：四档各播一次且时长、材质对；刷新不重放；处理中不播；减少动态无粒子；其他页面包体不变大；交互验收交给 Codex（测试模式付款）。

## T56 应用页切换过渡动画（可派）

**目标**：Owner 2026-11-07：手机上应用页之间的推入 / 推出过渡（DESIGN §8.2「页面切换过渡」）。

**范围**：用 View Transitions 实现：前进推入、返回推出、tab 之间淡入；电脑只淡入；顶栏和 tab bar 固定不动；不支持时降级为直接切换；减少动态时关闭；≤300ms。必须用 impeccable skill 核对手感。

**验收**：手机上 Create → 工作台、Photos → 详情、返回、切 tab 各走一遍，方向正确、无闪烁、无布局跳动；Safari / Chrome 都试；减少动态时无动画；交互验收交给 Codex（手机模拟）。

## T57 语言提醒改为地球图标动效 + 记住用户选的语言（可派）

**目标**：Owner 2026-11-07：中文用户提醒不用顶部条，改为地球图标上的动效气泡；提醒命中率低、选过的语言记不住，一并修（ARCHITECTURE §17「怎么选语言」、DESIGN §6.9 第 4 条）。

**范围**：删掉 `SwitchBanner` 顶部条（含 404 的两处），改为地球图标的脉冲 + 气泡（营销页电脑和手机顶栏）；判断改为 `navigator.languages` 任意一项是中文；选择前每次访问都提醒；地球菜单、气泡、账号页 Language 都写 `NEXT_LOCALE`（已登录同时写 `user_metadata.locale`）；中间件按 Cookie 做 307 跳转（只在两种语言都有的页面，跳转保留查询参数，爬虫不受影响，没有循环）；应用页也按 Cookie / `user_metadata.locale` 显示。

**验收**：中文浏览器第一次进英文首页看到地球气泡；点切换后之后直接进中文；点关闭后不再提醒且停在英文；登录后应用页语言跟选择一致；Googlebot 抓取英文页不跳转；单测覆盖中间件跳转和判断逻辑；交互验收交给 Codex。


## T58 站点图标和导航换成定稿 Logo「S.」（可派）

**目标**：Owner 2026-11-07 定稿 Logo C「S.」：用字标字体 Instrument Serif 的 S 和句点，句点橙色，按光学尺寸分三档加重（图标 +80、字标旁 +45、favicon +110）。素材和说明在 `design/logo/`（`README.md`、`test.html`、`export/c/`）。

**范围**：
- 替换 `src/app/favicon.ico`（16 / 32 / 48，从 `export/c/favicon-*` 生成），浅色和深色标签栏都要清楚（可加 `icon.svg` 或按配色切换）。
- 加 apple-touch 图标（180）和 manifest 图标（192 / 512，取 `export/c/icon-*`）；没有 manifest 就加最小的一份，颜色按 DESIGN。
- 导航组合：用 `c-s-dot-lockup-tight.svg` 的排法，或者只用字标，二选一用 impeccable skill 核对；同一画面不能出现两个句点。手机顶栏、电脑顶栏、应用页标题栏都要看。
- 不在本卡：OG 分享图、Google OAuth 品牌 logo（Owner 自己上传 `export/c/icon-120.png`）。

**验收**：Chrome / Safari 浅深两种标签栏的 favicon 清楚不切头；iOS「添加到主屏幕」显示 180 图标；manifest 图标被浏览器识别；导航在手机和电脑上都没有两个句点；构建和单测通过；交互验收交给 Codex。

## T59 删除图片上的「Illustrative example」标签（可派）

**目标**：Owner 2026-11-07：全站图片上的「Illustrative example / 示意图」标签全部删掉（DESIGN「The No Badge Rule」）。示意说明改放在文字里，不在图片上。

**范围**：删掉营销页和应用页所有叠在图片上的这个标签：`compare-slider`、`photo-pair`、`shoot-section`（含区块顶部那个 pill）、`PairMedia` 的 `badge`（`feature-card`、`template-sample` 等调用处）以及模板卡上同类标签；清掉不再用的样式（`.mk-illus` 等）和不再用的文案键（中英文一起）。保留：图片替代文字里的「(illustrative example)」，以及区块里本来就有的那一行说明文字（`Template images are illustrative examples` / `模板图片仅为效果示例`）。

**验收**：首页、模板页、Create、价格页、内容页、照片详情页的中英文版在手机和电脑上都看不到这个标签；替代文字仍带说明；构建、单测、lint 通过；交互验收交给 Codex。

## T60 后台模板批量上架 / 下架（可派）

**目标**：Owner 2026-11-07：`/admin/templates` 一次上架多个模板，不用逐个点开关（首批 9 个草稿要一起上架）。

**范围**：
- 模板表每行加勾选框，表头加「全选当前列表」（跟随搜索过滤结果）；勾选后出现批量操作条：「上架所选」「下架所选」「取消选择」，显示已选数量。
- 批量上架和单个上架开关走同一套校验（缺封面、缺名称或说明、积分低于下限等不能上架的，照单个开关的规则拦下）；能上的上架，不能上的保持原状并逐条列出原因，不整批失败。
- 确认弹窗写明将上架 / 下架哪几个模板；下架时提醒会从首页精选里移除（如果单个下架也这样处理）。
- 服务端一次请求处理整批，仍然只认 `profiles.role = 'admin'`；写和单个开关同样的后台操作记录；改完让模板目录缓存失效，和单个开关一致。
- `edit`、`freeform` 这类系统模板如果单个开关有特殊规则，批量也照办。
- 中英文后台文案一起加。

**验收**：勾 9 个草稿一键上架，前台模板列表和 Create 立即出现（缓存按单个开关的方式失效）；混入一个缺封面的，其余照常上架、它单独报原因；批量下架同理；非管理员调接口被拒；单测覆盖批量校验和部分成功；交互验收交给 Codex（测试站）。

## T61 工具链升级（上线后再派）

**目标**：Owner 2026-11-07：工具链升级放到正式上线以后做。旧的草稿 PR #13（Node 26 / pnpm 12 / TS 6 / ESLint 10，11-05）卡在 pnpm 12 的 24 小时发布期限制后无人接手，现在和 main 冲突，作废重做。

**范围**：从当时的 main 重新开分支，不在 #13 上续做；pnpm 12（保留默认 24 小时发布期限制，不加豁免）、TypeScript 6、ESLint 10 及配套插件；Node 先确认 Vercel 是否支持 26.x，不支持就留在 24（`.nvmrc`、`engines`、CI 同步）。只升工具链，不顺带改业务代码；新规则报出的问题单独列清单，能机械修的修，不能的记下来。

**验收**：CI 四项全绿；本地 lint / typecheck / 单测 / build 通过；预览部署正常；构建产物体积和 Lighthouse 不退步；关闭 #13。

## T62 需求墙开关做进后台（可派）

**目标**：Owner 2026-11-07：需求墙开不开由 Owner 在管理后台自己切换，不用改代码、不用部署（ARCHITECTURE §15.6 最后一条）。

**范围**：
- 迁移（编号段 `0420`～`0439`）：`system_settings`（`key text primary key`、`value jsonb`、`updated_by`、`updated_at`），RLS 开启且拒绝所有客户端；`admin_set_system_setting(key, value)` 只认 `role = admin`，只接受登记过的 key（先只有 `wishlist_enabled`，布尔），写后台操作记录（同 `admin_set_feature_access` 的做法）。只加不改，不动已有迁移。
- `core/wishlist`：`isWishlistEnabled(site)` 改为 `features.wishlist && (运行时开关 || 预览覆盖)`；运行时开关读 `system_settings`，走 `'use cache'` + `cacheTag('system-settings')`，读失败按「关」处理且只缓存一分钟（同 #205 的做法）。所有调用处（tab bar、`/wishlist` 布局、`/api/wishlist/*`、后台导航和审核页、首页和定价页的 `wishlistLive`）都改用新判断，判断仍只在一处。
- `site.config.ts`：`features.wishlist` 改为 `true`（含义改为「本站有这个功能」）；上线时运行时开关默认关，所以正式站行为不变。
- 后台「功能权限」页加一个「需求墙」开关卡：显示当前状态、最后修改人和时间；切换前确认弹窗（开：用户 tab 出现第四项、可以提交和投票；关：入口和页面全部隐藏，已有数据保留）；保存后 `updateTag`，刷新前台立即生效。只有中文后台文案。
- 预览覆盖 `FEATURE_WISHLIST_PREVIEW=on` 保留，只在非生产生效。

**验收**：后台打开后，不重新部署，前台登录用户马上看到 Wishlist tab、能提交需求；关掉后 tab 消失、`/wishlist` 和接口 404、后台审核页隐藏、已有数据重开后还在；非管理员调 RPC 被拒；单测覆盖开关组合（站点无此功能 / 开 / 关 / 预览覆盖 / 读失败）；数据库测试覆盖 RLS 和 RPC；交互验收交给 Codex（测试站）。生产迁移走「DB push (production)」工作流，Owner 批准。

## T63 中国大陆手机号验证码登录（阿里云短信）（可派）

**目标**：Owner 2026-11-07：大陆用户不习惯邮箱注册，给中文页加手机号验证码快捷注册 / 登录（ARCHITECTURE §7「中国大陆手机号验证码登录」）。

**范围**：
- 中文登录 / 注册页加「手机号登录 / 邮箱登录」页签（中文默认手机号），英文页不变；按 DESIGN 的表单样式做，必须用 impeccable skill 核对；手机号输入固定 `+86`，验证码 6 格，60 秒倒计时重发。
- Supabase 手机号 OTP（`signInWithOtp({ phone })` + `verifyOtp`）；Send SMS Auth Hook 指向 `app/api/auth/sms-hook`：校验 Hook 签名，限频（同号 60 秒 1 条 / 每天 5 条，同 IP 每天 20 条，非 `+86` 拒绝），再交给短信适配器；适配器两个实现：阿里云号码认证服务 Dypnsapi `SendSmsVerifyCode`（Owner 2026-11-07 改用：免企业资质，赠送签名 + 配套模板；环境变量 `ALIYUN_SMS_ACCESS_KEY_ID` / `ALIYUN_SMS_ACCESS_KEY_SECRET` / `ALIYUN_SMS_SIGN_NAME` / `ALIYUN_SMS_TEMPLATE_CODE`，模板参数 `code` 和 `min`，验证码由 Supabase 生成）和测试用假发送；限频计数用数据库（迁移编号段 `0440`～`0459`，只加不改）或现有限频设施，二选一说明理由。日志、Sentry、埋点里不出现验证码。
- 手机号验证过 = 已验证：出图、注册赠送（同 IP 规则照旧）、埋点 `signup.method = 'phone'`；所有「必须已验证邮箱」的判断改为「邮箱或手机号已验证」。
- 无邮箱账号：结账不传 `customer_email`（让 Stripe / Waffo 收集），工单回复只站内提醒，账号页显示脱敏手机号，后台用户列表 / 搜索 / 用户详情能显示和搜手机号；所有读 `email` 的地方处理空值。
- 合规：手机号注册单独勾选同意隐私政策和个人信息出境（未勾不能发码）；隐私政策加手机号 / 短信服务商 / 出境一节（英文）。
- 环境变量登记进 `.env.example`（只有名字）；`scripts/qa` 给预览加一个用 Supabase 测试号码的手机号 QA 账号说明。

**Owner 侧（不阻塞开发，阻塞上线）**：用 Owner 本人实名的阿里云账号开通号码认证服务的「短信认证」，在控制台取赠送签名名称和配套模板编号，建只有短信认证发送权限的 RAM 子账号并生成 AccessKey，买套餐包或充值，设余额报警；Supabase 预览 / 生产开启手机号登录、配 Send SMS Hook（地址 + 密钥）、预览配测试号码。密钥由 Owner 从剪贴板直接写进 Vercel / Supabase，不经过聊天。

**验收**：中文页手机号注册 → 收码 → 登录 → 能出图、有注册赠送；同号 60 秒内重发被拒、每天第 6 条被拒、非 +86 被拒；未勾同意不能发码；英文页不出现手机号入口；无邮箱账号能结账（支付页收邮箱）、能开工单；后台能搜到手机号；单测覆盖 Hook 签名、限频、适配器（假发送）和空邮箱分支；交互验收交给 Codex（测试站，用 Supabase 测试号码，不发真短信）；生产真短信由 Owner 在第 10 阶段实测一条。

## T64 中文页付款方式加「中国银行卡」（普通 Stripe 结账）（可派）

**目标**：Owner 2026-11-07：Stripe Managed Payments 不收中国大陆买家（正式站真卡实测被拒），中文页加一条普通 Stripe 卡结账「中国银行卡」，并调整付款方式顺序（ARCHITECTURE §6.3「中文页付款方式」）。

**范围**：
- 付费墙 / 定价页的付款方式选择（中文页）：① 中国银行卡 ② 支付宝 ③ 海外银行卡 · Apple Pay · Google Pay（原卡路由改名）；英文页完全不变。说明文案：中国银行卡会员「自动续费，可随时取消」，积分包单笔；海外银行卡照旧。按 DESIGN 的付款方式样式做，必须用 impeccable skill 核对。
- `/api/checkout` 接受新方式 `cn_card`：只在请求带中文 locale 时接受；会员建 `mode: 'subscription'`、积分包 `mode: 'payment'`，不带 `managed_payments`，`allowed_payment_method_types: ['card']`，不开自动税，Checkout `locale: 'zh'`；复用现有的非 MP 卡路由代码，不另写一套。发放、续费、取消、退款走现有回调（`settle_checkout` / `invoice.paid` / 镜像表），确认非 MP 订阅的 Customer Portal 能取消。
- 账号页会员卡上的付款方式显示「中国银行卡」（中文）/ "Card"（英文）；后台订单页渠道显示能区分 MP 卡和普通卡。
- 埋点 `checkout_start.method = 'cn_card'`；Waffo 通道开着时（`PAYMENT_CHANNEL=waffo`）中国银行卡不出现（Waffo 自己有卡）。

**验收**：中文页三项顺序正确、英文页不变；测试模式下用 Stripe 测试卡走中国银行卡买积分包和 Starter 月付，积分和会员到账、续费（测试时钟）、Portal 取消都正常；MP 路由不受影响；单测覆盖 locale 校验、Session 参数（无 managed_payments、只 card）、埋点值；交互验收交给 Codex（测试站）。正式站上线后由 Owner 的朋友用中国 Visa 真卡实测一笔再退款。

## T65 中国大陆访问提速：字体提前加载、网页 App 启动画面（可派）

**目标**：Owner 2026-11-07：大陆用户访问慢（ITDOG 320 个点平均 3.85 秒，慢在跨境下载，12 个点超时），切到中文页时文字闪一下，iPhone「作为网页 App 打开」时长时间黑屏。

**范围**：
- MiSans 改为服务端在 `<head>` 直接引用汇总 CSS（ARCHITECTURE §17「加载」），去掉 hydration 后插入的客户端组件；系统 fallback 字体加 `size-adjust` / `ascent-override` / `descent-override` 贴近 MiSans。字体二进制保持官方原样，不子集化（README 和授权要求）。
- iOS 网页 App：加 `apple-touch-startup-image` 启动图（品牌深色底 + 居中「S.」，覆盖主流 iPhone 尺寸，从 `design/logo/` 生成），打开时不再纯黑屏；中文页使用 `start_url: '/zh'` 的中文 manifest（英文页仍是 `/`），中文用户加到桌面后直接进中文页。
- 测量：上线前后各在测试站测 `/zh` 的 Lighthouse 移动端；CI 的 Lighthouse 不能退步；在 PR 里写清中文页首屏下载的字体字节数前后对比。

**验收**：中文页刷新、从英文切到中文时不再闪（第二次访问起完全不闪）；iPhone 加到桌面并选「作为网页 App 打开」时先显示启动图；中文页加到桌面后打开是中文页；字体文件字节未改（SHA-256 与 `manifest.json` 一致）；交互验收交给 Codex（测试站）+ Owner 用 iPhone 实测。

## T66 会员升级（全价买更高档，立即生效，旧订阅立即取消）（可派）

**目标**：Owner 2026-11-07：有会员的用户现在想买更高档会被 409 拦下且无路可走。规则见 ARCHITECTURE §6.2「升级」：全价买更高档，立即生效、积分立即全额到账、旧订阅立即取消、不补差价不退钱；不能降级。

**范围**：
- 档位顺序：starter < pro < max；同档 month < year。`/api/checkout` 把现在的「已有订阅就 409」改为：目标高于当前 → 放行（标记为升级）；等于或低于 → 409 `DOWNGRADE_NOT_ALLOWED`（文案：不能降级，可在到期后重新订）。Stripe MP 卡、中国银行卡、支付宝、Waffo 四条路都适用。
- 付款回调发放：沿用现有首购发放（积分、`paid_until`、镜像表）；如果是升级，在同一处理里取消该用户其他仍在续费的订阅（Stripe 取消接口，不按比例、不开发票；Waffo `cancel-order`），镜像表同步；取消失败写 Sentry 告警，不回滚新档。先查清 Managed Payments 订阅能否用接口立即取消，PR 里写明结论。
- `current_tier` 等读取以最新生效的那一档为准；账号页会员卡显示新档。
- 付费墙 / 定价页：已有会员时，低档和同档同周期不可选并说明原因，更高档按钮写「升级」/ "Upgrade"；中英文。必须用 impeccable skill 核对样式。
- 如需迁移，编号段 `0480`～`0499`，只加不改。

**验收**：Starter 月付（测试卡）→ 买 Pro 月付：立即变 Pro、积分全额到账、旧 Starter 订阅在 Stripe 里已取消、下月只扣 Pro；Pro 月付 → Pro 年付可以；Pro → Starter 被拒且提示正确；支付宝一次性 Starter → Pro 可以；Waffo 卡订阅升级同样取消旧订阅；单测覆盖档位比较和 409；交互验收交给 Codex（测试站，测试卡 / Waffo 沙盒）。

## T67 中文字体只用于标题，其余用系统字体；字体样式表放进 head（可派）

**目标**：Owner 2026-11-07 选方案 ③：MiSans 只给标题（600），正文和界面用系统中文字体（ARCHITECTURE §17「中文字体只用于标题」）；字体变小后把 #254 的「样式表进 head」一起落地，首访不变慢、切中文不再闪。

**范围**：汇总 CSS 只引用 600 一档的官方分包（不改、不子集化文件，SHA-256 测试保留）；全站 CSS 把中文正文 / 界面字体换成系统字体栈，标题类保留 MiSans；在 #254 的基础上把样式表放进服务端 `<head>`。必须用 impeccable skill 核对，PR 里贴 iPhone（Safari）、安卓（Chrome）、Windows（Chrome）三种系统下中文首页、价格页、Create、账号页的对比截图，Owner 看过再合并。

**验收**：`/zh` 首访字体字节约 265 KB 以内；`/zh` Lighthouse 移动端不低于改动前、LCP < 2.5 s，CI 的 Lighthouse 门槛不放宽也能过；第二次访问和英文切中文都不闪；英文页无变化；交互验收交给 Codex（测试站）。

## T68 工单改为账号页弹窗（新建、列表、往来消息都在弹窗里）（可派）

**目标**：Owner 2026-11-07：点「填写工单 / Help & feedback」不跳到单独页面，在账号页直接弹窗完成所有工单操作（ARCHITECTURE §10「在弹窗里完成」）。

**范围**：账号页弹窗（电脑对话框、手机全高抽屉）含「新建工单」「我的工单」两个页签和工单详情（往来消息 + 补充回复）；复用现有表单、列表、详情组件和接口，不改数据库和限频规则；小红点规则不变，在弹窗里看过即 `mark_ticket_seen`；原 `/account/help*` 三个路由改为跳到 `/account?help=…` 并自动打开弹窗；页脚「Contact」指向 `/account?help=new`；中英文；减少动态时无动画；按 DESIGN 的 Sheet / Dialog 样式，必须用 impeccable skill 核对。

**验收**：账号页点入口弹窗出现，能新建（含附作品 / 付款的类型）、看列表、打开详情、补充回复、关闭后账号页状态不变；旧链接和小红点仍可用；手机 375 和电脑都正常；单测覆盖 `?help=` 参数解析和旧路由跳转；交互验收交给 Codex（测试站）。

## T69 工单支持上传图片（可派，接 T68 同一窗口）

**目标**：Owner 2026-11-07：工单现在只能发文字，用户要能附截图或照片（ARCHITECTURE §10「可以附图片」）。

**范围**：T68 弹窗的新建表单和补充回复框加「添加图片」（最多 3 张，缩略图可删，上传进度）；复用出图上传的直传、HEIC 转换、服务端校验、EXIF 清除；新表 `support_ticket_attachments` 和对应函数（`create_support_ticket` / `add_ticket_message` 接收附件、校验数量和归属）；消息串里显示缩略图，点开看大图（签名地址，短时效）；后台工单详情同样显示，管理员回复可附图；删工单、删号时删 R2 文件；中英文；R2 生命周期不对 `tickets/` 设 7 天过期。

**验收**：新建工单附 3 张图成功、第 4 张被拒；HEIC 能传；R2 里的文件无 EXIF；别的账号拿不到图片地址；后台能看图并回复带图；删号后文件被删；单测 + 数据库测试覆盖数量限制、归属校验、RLS；交互验收交给 Codex（测试站）。

## T70 统计按地区用 Cookie + 欧洲访客同意条 + 录屏遮挡（可派）

**目标**：Owner 2026-11-07：想在 PostHog 看到每个访客从进站到付款的完整路径。欧洲以外直接用 Cookie 记录；欧盟 / 欧洲经济区 / 英国 / 瑞士访客先同意再记录（ARCHITECTURE §16.1）。

**范围**：
- 服务端按 `x-vercel-ip-country` 判断是否需要同意（国家列表放常量，读不到按需要同意），传给 `core/analytics` 的初始化；不需要同意的直接 `localStorage+cookie`，需要的默认 `memory` 并显示同意条。
- 同意条：页面底部细条，中英文，「接受 / 仅必要」，按 DESIGN 样式（impeccable 核对），不遮挡主要内容和手机底部 tab；选择存本地（`localStorage`，只存同意状态）；页脚「Cookie 设置」重新打开。点接受后调用 PostHog 切换持久化，不刷新页面。
- 录屏遮挡先配好：输入框 / 文本域全部遮挡；用户照片和作品图加统一遮挡类名；`/admin`、`/checkout` 不录；录屏是否开启由 PostHog 后台控制，代码里默认不主动开启。
- 隐私政策（英文）补「Analytics and cookies」一节：PostHog、Cookie 用途、按地区、如何关闭；录屏开启前另补一句。
- 不影响 SEO 页面的服务端渲染和首屏（同意条按需加载）；CI 的 JS 预算和 Lighthouse 照常通过。

**验收**：美国 / 中国 IP 访问不弹同意条、刷新后 PostHog 的 distinct_id 不变；欧洲 IP（测试时用请求头模拟或 Vercel 国家覆盖）弹同意条，点「仅必要」后不写 Cookie，点「接受」后开始写；登录后匿名行为并入账号；页脚可改设置；单测覆盖国家判断和持久化切换；交互验收交给 Codex（测试站）。

## T71 退款自动扣回积分（可派）

**目标**：Owner 2026-11-07：退款后用户不能留着积分。规则见 ARCHITECTURE §6.2「退款自动扣回积分」。

**范围**：
- 迁移（编号段 `0760`～`0779`，只加不改）：付款行记 `credits_clawed_back`、`clawback_shortfall`；一个 `clawback_payment_credits(payment_id, event_id, refunded_ratio, reason)` 函数按「发放 × 累计退款比例 − 已扣回，封顶付费余额，不为负」扣回并写流水，幂等；会员退款把 `paid_until` 回退到退款时刻（不早于其他有效购买）；拒付胜诉的「还回」函数；管理员「扣回这笔付款剩余积分」函数（记到该付款名下）。
- 回调：Stripe `charge.refunded`、`charge.dispute.created`、`charge.dispute.closed`（won）；Waffo `refund.succeeded`；会员退款时取消仍在续费的订阅（复用 T66 的取消逻辑）。
- 后台：退款工单和订单页加「扣回这笔付款的剩余积分」按钮（确认弹窗写清数量）；订单页、用户详情显示已扣回 / 欠扣；Sentry 告警含欠扣。
- 条款：英文退款政策 / 条款里的退款一节与新规则一致（7 天内未用积分全额退款；用过积分的个案人工处理、按剩余比例退款；退款会扣回积分）；列入律师审阅清单。
- `scripts/stripe-setup.ts` 或上线清单写明 Stripe 回调要加订阅 `charge.dispute.closed`。

**验收**：测试卡买积分包 → 全额退款 → 积分全部扣回；部分退款按比例；重复回调不重复扣；先在后台人工扣回再部分退款，回调不再多扣；积分已花掉时余额到 0、记欠扣并告警；会员退款立即结束会员并取消订阅；拒付扣回、胜诉还回；Waffo 退款同样；单测 + 数据库测试覆盖幂等、封顶、不为负；交互验收交给 Codex（测试站）。生产迁移走 DB push，Owner 批准。

## T72 中文业务告警发到飞书群机器人（可派）

**目标**：Owner 2026-11-07：Sentry 的告警是英文技术描述，看不懂；要中文、大白话的业务提醒，发到飞书群（ARCHITECTURE §16.4）。

**范围**：`core/alerts` 的 `notifyOwner` + 飞书自定义机器人签名发送 + 去重 + 未配置时跳过；接入点：Stripe / Waffo 退款、拒付开始与结果、付款回调处理失败、出图失败率偏高（每小时最多一次）、新工单 / 补充回复、T66 旧订阅取消失败；T71 合并后退款告警带上扣回 / 欠扣结果（T71 未合并时先写「积分处理见后台」）。中文模板集中一处、可单测；脱敏规则复用 `core/logger`。环境变量 `FEISHU_ALERT_WEBHOOK_URL`、`FEISHU_ALERT_SECRET` 只登记名字。

**Owner 侧**：飞书建一个群 → 群设置 → 群机器人 → 添加「自定义机器人」→ 安全设置勾「签名校验」→ 复制 Webhook 地址和签名密钥（存密码管理器，不发聊天），由配置窗口按剪贴板流程写进 Vercel 正式环境。

**验收**：测试群里能收到每种告警的中文消息、链接能打开后台对应页；同一事件不重复发；飞书挂掉时业务不受影响；单测覆盖模板、签名、去重、失败率阈值；交互验收交给 Codex（测试站配测试群）。

## T73 支付宝收银台加微信支付（可派）

**目标**：Owner 2026-11-07：微信支付已在 Stripe 申请开通；把微信支付加进支付宝那条结账，付款方式改名「支付宝 / 微信支付」（ARCHITECTURE §6.2、§6.3）。

**范围**：
- 结账：钱包路由 `allowed_payment_method_types: ['alipay', 'wechat_pay']` + `payment_method_options.wechat_pay.client: 'web'`；Dashboard 只开了一种时只显示那一种，都没开才拒绝。
- 文案：中文「支付宝 / 微信支付」，英文 "Alipay / WeChat Pay"；说明照旧「不自动续费，一次一期」。中文页顺序：中国银行卡、支付宝 / 微信支付、海外银行卡 · Apple Pay · Google Pay；英文页同样合并成一项。impeccable 核对样式。
- 数据：`payments.method` 允许 `wechat_pay`（迁移编号段 `0560`～`0579`，只放宽约束）；回调按实际付款方式写 `alipay` 或 `wechat_pay`；账号页会员卡、后台订单页显示「微信支付」。
- 埋点 `checkout_start` / `purchase` 的 `method` 加 `wechat_pay`（结账开始时记 `alipay_or_wechat`，付款成功时记实际方式，二选一在 PR 里说明）。
- Waffo 通道不变（Waffo 不支持微信）。

**验收**：测试模式下结账页同时出现支付宝和微信支付，各付一笔积分包和 Starter 一期，到账、付款方式记录正确；只开支付宝时只显示支付宝；英文页同样；单测覆盖 Session 参数和方式记录；交互验收交给 Codex（测试站）。正式站上线前 Owner 确认 Stripe 已批准微信支付。

## T74 后台中文「流量与转化」页 + 补齐统计点（可派）

**目标**：Owner 2026-11-07：PostHog 后台是英文，要在自己的管理后台用中文看用于优化体验和转化的指标（ARCHITECTURE §16.2a，新增事件见 §16.2）。

**范围**：
- 补统计点：`template_view`、`paywall_select`、`checkout_cancel`、`upload_error`；打开 `capture_pageleave`；事件字典单测更新。
- 后台新页 `/admin/analytics`（导航名「流量与转化」）：六块内容按 §16.2a；服务端 HogQL 查询放 `core/admin/analytics/`，每块一个查询函数 + 单测（用录制的响应样例），缓存 10 分钟，失败时该块显示「暂时读不到」不影响其他块；时间范围切换；漏斗维度切换；中文指标说明；「在 PostHog 打开」链接。只有管理员能进。
- 环境变量 `POSTHOG_PERSONAL_API_KEY`（只读，Query 权限）、`POSTHOG_PROJECT_ID`，只登记名字；没配置时页面提示去配置。
- 按 DESIGN 的后台样式，impeccable 核对。

**验收**：测试站配测试数据后六块都有数；切换时间范围和漏斗维度正确；新事件在 PostHog 能查到；缺密钥时页面友好提示；非管理员 404；交互验收交给 Codex。Owner 侧：PostHog 生成只读个人 API 密钥，由配置窗口按剪贴板流程写进 Vercel。

## T75 后台管理模板分类：改中英文名称、新增、删除（可派）

**目标**：Owner 2026-11-08：分类的中英文显示名要能自己改，分类要能自己加、自己删（ARCHITECTURE §5「模板分类由后台管理」）。

**范围**：
- 迁移（`0580`～`0599`）：建 `template_categories`，种入现有六个分类（名称、首页说明照搬现在代码里的中英文，画风 `card_style = compare`）；`templates.category` 回填成 `key`；RLS：公开读、管理员写；删除用一个 SQL 函数（把模板移到目标分类再删，同一事务，至少保留一个分类）。
- 代码：删掉写死的分类常量、`app.categories` 文案和两份 `template-categories.ts`，创作页分类条、首页分组和 SEO 落地页、模板弹窗、按 `'Art Styles'` 判断拖动对比的地方都改成读数据库（带 `templates` 缓存标签）；埋点 `category` 发 `key`。
- 后台：模板页加「分类管理」（列表 + 新增 / 编辑 / 排序 / 删除弹窗，删除时要选移入的分类并列出受影响模板数）；模板编辑页的分类下拉只从已有分类选，去掉「新分类…」。
- 单测：分类读写规则、删除迁移函数、旧数据回填、拖动对比改看 `card_style`。

**验收**：后台改「宠物」中文名后，中文创作页和首页显示新名、英文不变；新增分类并给一个模板选上、上架后创作页出现新分类；删除有模板的分类时被要求选目标分类，删除后模板都在目标分类里；画风的拖动对比照旧；页面源码里分类名和说明仍是服务端渲染；交互验收交给 Codex。

## T76 后台拖动排序：首页精选和模板列表（可派）

**目标**：Owner 2026-11-08：首页精选和模板列表只能一次点一下上下箭头，太慢；要长按 / 按住直接拖动改顺序（ARCHITECTURE §10「拖动排序」）。

**范围**：
- 后台共用的拖动排序组件（放 `src/core/admin/ui/`）：鼠标按住把手拖、触屏长按约 0.3 秒拖、键盘排序、读屏提示、边缘自动滚动、减少动态时不做位移动画。可以用 dnd-kit 一类成熟库，只在后台页面加载，不进公开页面的 JS。
- 「首页精选」列表和模板列表接上这个组件；放下后一次保存整组顺序（新 SQL 函数，同一事务，管理员才能调用；迁移编号段 `0600`～`0619`），乐观更新，失败回滚并提示。
- 模板列表在搜索 / 筛选时禁止拖动并提示。上下箭头保留为备用。
- 单测：整组排序函数（重复 id、缺 id、非管理员都拒绝）、组件的键盘排序。

**验收**：电脑上按住把手把第 8 个精选拖到第 2，刷新后顺序保持，首页模板区跟着变；手机宽度长按拖动可用；键盘能完成一次排序；搜索时不能拖；断网放下后退回原顺序并有提示；交互验收交给 Codex。和 T75（分类管理）同时开发：T75 的分类排序等本卡合并后再换成这个组件。

## T77 后台用户管理：列表、会员等级、筛选、批量操作、详情弹窗（可派）

**目标**：Owner 2026-11-08：用户页打开什么都不显示，每个用户都要手动搜，太粗糙（ARCHITECTURE §10.a）。

**范围**：管理员 SQL 函数列用户（筛选、排序、分页、总数，迁移编号段 `0620`～`0639`）；列表页（50 / 页、等级标签、筛选、搜索、排序）；批量调积分和批量封禁 / 解封（一个事务、幂等、最多 50 人）；详情改成同页弹窗（`?user=<id>`，旧地址跳转，其他后台页的用户链接都改成打开弹窗）；单测（筛选、分页、批量幂等和整批回滚、非管理员拒绝）。

**验收**：打开就有 50 个用户、能翻页；按 Max 筛选只剩 Max 用户；搜邮箱片段能找到；勾 3 个用户批量加 5 付费积分，每人一条流水，重复点不会多发；详情在弹窗里打开、关闭后列表位置不变；交互验收交给 Codex。

## T78 后台界面排查修复 + 出图编号 + 成本对账说明（可派）

**目标**：Owner 2026-11-08：后台有组件重叠（出图记录筛选区）；用户反馈某张图有问题时要能直接找到那一单（ARCHITECTURE §10.a）。

**范围**：除模板页、用户页外所有后台页面四种宽度逐页排查并修复（impeccable 核对）；出图编号（后台列 + 筛选 + 万能查找认编号；用户作品详情显示编号和「这张图有问题？」入口，工单带编号并能跳到那一单）；成本对账页说明文字；单测（编号前缀查找、重名时加长）。

**验收**：出图记录筛选区在各宽度不重叠；后台输入 8 位编号能找到那一单；用户在作品详情点「这张图有问题？」提交的工单，后台能看到编号并跳过去；交互验收交给 Codex。

## T79 模板批量编辑：积分、展示入口、质量档、分类（可派，T76 之后）

**目标**：Owner 2026-11-08：模板批量操作只有上架 / 下架，太少（ARCHITECTURE §10.a）。

**范围**：批量编辑弹窗（三档积分可单独改、展示入口、质量档、分类）；服务端逐个按积分下限校验、整批一个事务（迁移编号段 `0640`～`0659`）；确认框列出改动；单测（下限校验、质量档变化后的下限、整批回滚）。在 T76（拖动排序）合并后做，同一个页面。

**验收**：选 5 个模板把 HD 改成 5、质量改 medium，保存后 5 个都变了；把 Standard 改成低于下限时整批不保存并列出不合格模板；交互验收交给 Codex。

## T80 账号页购买记录：下载收据和发票（可派）

**目标**：Owner 2026-11-08：账号页的购买记录除了列出充值记录，还要能直接下载支付成功的收据和发票（ARCHITECTURE §6.3「账号页购买记录里下载收据和发票」）。

**范围**：先在 Stripe 测试模式逐一核实各付款方式（MP 海外银行卡、中国银行卡、支付宝 / 微信支付、订阅首付与续费）和 Waffo 能拿到的收据 / 发票，结果写进 PR；服务端接口按付款行现取链接（只允许本人）；购买记录弹窗每行加「收据」「发票」按钮（中英文），已退款行标注；单测（越权拒绝、各渠道取链接、取不到时的文案）。

**验收**：测试站用测试卡买一个积分包和一个月付，购买记录里两行都能打开收据，月付能打开发票；用别人的付款 id 调接口被拒；交互验收交给 Codex。

## T81 禁止换脸：审用户输入的文字（可派）

**目标**：Owner 2026-11-08：禁止用我们的 AI 换脸；改表情等可以。换脸一定要靠用户写字，所以只审用户输入的文字，不改模板提示词、不做人脸检测（ARCHITECTURE §5.1a）。

**范围**：关键词预筛（中英文词表 + 单测）；判断模型意图分类（作品编辑并进现有的范围判断，其他入口单独一次只看文字的调用）；在扣积分前拦截，四个入口（补充说明、模板文字字段、作品编辑、伙伴 freeform）；错误码和中英文提示；伙伴接口 422；拒绝记录表（`0700`～`0719`，90 天清理）、后台用户详情显示次数、用户列表标红；`generate_refused` 埋点；使用规范加一句。单测覆盖放行和拒绝两类例句（至少各 20 句，中英文都有），判断失败时放行。

**验收**：「把他的脸换成第二张图的人」「make her look like Taylor Swift」被拒且不扣积分；「让他笑一下」「换成夜景」「三张是同一款包的不同角度，出一张白底图」放行；Graylum 调伙伴接口写换脸指令拿到 422；后台能看到拒绝记录；交互验收交给 Codex。

## T82 拒付申诉证据：平时记录、自动整理、后台一键提交（可派）

**目标**：Owner 2026-11-08：遇到积分用完再拒付的用户，要能向收款平台提交证据申诉（ARCHITECTURE §6.3「拒付申诉证据」）。

**范围**：先核实各渠道的拒付由谁应诉并写进 PR；付款时 IP / UA 和同意条款时间；出图和下载的 IP；`charge.dispute.created` 自动汇总证据并存为 Stripe 草稿；后台「拒付」页（列表、预览、补充、二次确认提交）；飞书告警带截止日期；拒付自动封号；中国银行卡强制 3DS；隐私政策补「防欺诈和处理争议」的用途说明（标进律师审阅清单）；迁移 `0720`～`0739`；单测（证据汇总、只交一次、非管理员拒绝、封号）。

**验收**：测试模式用 Stripe 的拒付测试卡付款并用掉积分，后台出现这笔拒付和完整证据草稿；提交后 Stripe 测试后台看到证据；账号被封；中国银行卡付款弹出 3DS 验证；交互验收交给 Codex。Owner 侧：Stripe 后台公开资料里填好服务条款地址（开启「必须同意条款」需要）。

## T83 收藏模板（可派，T75 合并后接 UI）

**目标**：Owner 2026-11-08：模板多了难找，用户能收藏模板，并在一个地方看到全部收藏、一键调用（ARCHITECTURE §5.1b）。

**范围**：迁移 `0740`～`0759`（表、RLS、上限、级联）；收藏 / 取消接口；模板卡片和弹窗的收藏按钮（中英文、读屏标签、44px 触控区）；创作页和首页选择器的「收藏」分类；未登录先登录再自动收藏；埋点；单测（RLS 只看自己的、上限、下架后不显示、重新上架回来）。创作页分类条与 T75（分类管理，PR #283）改的是同一处，等 #283 合并后再接这部分 UI，数据层可以先做。

**验收**：收藏 3 个模板后分类条出现「收藏」，点开只有这 3 个且最新的在前；取消一个立即消失；未登录点收藏，登录回来已收藏；把其中一个模板下架后收藏里不显示；交互验收交给 Codex。

## T84 模板分类收尾：删旧列和兼容代码（T75 上线稳定一周后再派）

**目标**：T75 用「先扩后收」上线（ARCHITECTURE §5「模板分类由后台管理」）。正式站跑新代码一周且无回滚后，收掉过渡层。

**范围**：迁移删 `templates.category` 和触发器里按名称解析的分支；代码删掉迁移前的兼容读取；`import:prompts`、伙伴接口的 `category` 字段改读 key 对应的英文名（对外输出不变）；单测。

**验收**：伙伴接口返回的 `category` 和收尾前一致；后台模板保存、分类改名、删除移入都正常；交互验收交给 Codex。

## T85 后台模板试跑：首次出图 → 编辑 → 再编辑，一键设封面（可派）

**目标**：Owner 2026-11-08：建完模板后不用去前台出图再回后台传封面；在后台直接试跑，并且完整走一遍用户链路（首次出图、在结果上编辑、再编辑），每一步都能一次跑 3 张（ARCHITECTURE §10.b）。

**范围**：试跑面板（模板编辑页右侧）；测试照片上传与「最近用过」；首次出图和编辑都复用用户的出图 / 编辑流水线（不另写一套），支持一次 3 张；记录树（最近 50 条）和两两对比；一键设封面（自动压缩）；不扣积分、记真实成本、`source = admin_test`、不进统计；每日预算上限（默认 5 美元，后台可改）；30 天清理；迁移 `0780`～`0799`；单测和 DB 测试（预算上限、隔离、设封面、编辑链）。和模板页其他改动（分类、拖动排序、批量编辑）共存。

**验收**：新建一个草稿模板，后台试跑 3 张；在其中一张上编辑一次、再编辑一次（各 3 张）；把编辑结果设为封面，前台封面更新；试跑不扣积分、成本对账里能看到「后台试跑」；超过预算当天被拦；交互验收交给 Codex。

## T86 价格页企业咨询表单 + 后台「企业咨询」（可派）

**目标**：Owner 2026-11-08：价格页「企业合作」的「联系我们」改成弹窗表单，删掉旁边的写信提示；提交结果进管理后台，由 Owner 人工跟进（DESIGN §6.9 第 8 条、ARCHITECTURE §10.c）。

**范围**：弹窗表单（中英文、手机全屏、校验、成功提示）；服务端提交接口（校验、限流、hCaptcha、存表）；迁移 `0800`～`0819`；后台列表 / 详情 / 改状态 / 备注 / 导航角标；飞书新告警种类；`business_inquiry_submit` 事件；隐私政策一句；单测和 DB 测试（校验、限流、非管理员拒绝）。

**验收**：价格页点「联系我们」弹出表单，必填不填不能发送；发送后后台「企业咨询」出现这条、导航有角标；改状态和备注能保存；飞书收到新咨询告警（正式站）；交互验收交给 Codex。

## T87 模板封面按语言适配（可派，T85 合并后做）

**目标**：Owner 2026-11-08：模板封面上的文字要和用户看的页面语言一致（中文页中文封面、英文页英文封面），以后加语言同样适配（ARCHITECTURE §13「封面按语言适配」）。

**范围**：迁移 `0820`～`0839`（`cover_locales` jsonb，只加不改，相关保存函数用新版本）；所有封面读取处按页面语言取、缺项退回默认；后台封面区语言页签；T85 试跑「设为封面」加语言选择；伙伴接口按语言参数返回；单测（取封面的退回规则、各展示处）。

**补充（Owner 2026-11-08）**：已定好的封面一键生成其他语言版本（只翻译图上文字、版式不变，走 T85 试跑记录和预算，预览后再设为该语言封面）；后台语言页签含「准备中」语言（先登记 `ja`），可提前准备封面。

**验收**：给一个模板只上传中文封面后，中文页显示中文封面、英文页仍显示默认封面；删掉中文封面后中文页退回默认；试跑结果能设为中文封面；交互验收交给 Codex。 把一张中文海报封面一键生成英文和日文版，设为英文封面后英文页显示，日文封面在前台暂不显示。

## T88 提速：CI 缓存与重试、只在需要时跑数据库测试、快照自动生成、Codex 自助重置测试账号（可派）

**目标**：Owner 2026-11-08：从开发到上线太慢。去掉流程里与代码无关的等待（AGENTS §5「按风险分级上线」配套）。

**范围**：
- CI：缓存 Supabase CLI 和数据库镜像，下载 / 拉取遇到 5xx 自动重试（指数退避，最多 5 次）；「supabase db tests」只在改了 `supabase/`、`src/**/*.sql`、数据库相关代码或测试时运行（其余 PR 标记跳过且不阻塞合并）。
- `schema.sql` 自动生成：db 任务发现快照过期时，用迁移生成的快照**自动提交回 PR 分支**（同仓库分支；提交信息注明自动生成），然后继续跑测试；fork 的 PR 只给出提示。
- `pnpm qa:reset <persona>`：只重置一个测试账号（复用 qa:accounts 的单个账号逻辑），供 Codex 在自己负责的账号状态不对时自助使用；README 写清「只重置本线账号，不跑全量 qa:accounts」。
- 不改业务代码。

**验收**：一个只改前端的 PR 不跑数据库测试也能合并；一个改了迁移但没更新快照的测试 PR，CI 自动补快照并通过；人为制造一次下载失败能自动重试；`pnpm qa:reset qa-free` 只动 qa-free。

## T89 模板可选开关（首个：「优化摆盘和器皿」），开启前确认（可派）

**目标**：Owner 2026-11-08：餐饮菜品模板在生成时可以选「优化摆盘和器皿」。默认关：沿用商家原来的盘子和摆盘，只改台面、光线、背景。开：模型参考用户照片重新摆盘、换更精致且和模板场景相配的器皿。用户打开时必须弹出提醒，说明成品可能和实物差别明显、可能引起客诉，由用户自己负责。只给菜品模板配（哪些模板配由后台定，代码里不写死分类）；饮品模板不加。

**做法**：
- **字段定义加开关**：`templates.fields.toggles`（可选，最多 3 个）。每个开关：`key`（小写字母、数字、下划线，不能和文案字段重名）、英文 `label`、可选英文 `hint`、`default`（只能是 `false`）、可选 `confirm: { title, body, checkbox, accept }`（英文）。中文放 `translations.zh.fields.<key>`（`label`、`hint`、`confirm` 同结构），缺了回退英文，和文案字段一致。后台模板编辑页可增删开关、填中英文。
- **提示词**：提示词正文用占位符 `{{<key>}}`。开、关两种状态各一段文字，存在 `template_prompts.model_params.toggles.<key>.on` / `.off`（私有，不进公开表，不进仓库，模板制作窗口在后台录）。`renderPrompt` 按用户的选择替换；用户补充说明仍然排在最后。后台保存时：定义了开关但正文里没有对应占位符、或缺开 / 关任一段，拒绝保存并提示。
- **工作台**：模板定义了开关才显示（放在文案字段下面、比例上面），默认关。
  - 打开带 `confirm` 的开关时弹确认框：必须勾选复选框，「开启」才能点；点「取消」或关掉弹窗保持关闭。
  - 同一浏览器会话里同一模板确认过一次就不再弹（sessionStorage）。
  - 首页生成器、批量生成（整批共用一个选择）、「再来一张」（沿用原作品的选择，不再弹）都用同一套逻辑。手机和电脑都要做。
  - T85 后台试跑面板也显示开关（管理员不弹确认），方便模板制作窗口分别实测开、关两种状态。
- **服务端**：校验开关 key 属于该模板、值是布尔；带 `confirm` 的开关为开时，请求必须带确认标记，否则拒绝（`INVALID_INPUT`）。`generation_jobs.inputs` 记 `toggles: { "<key>": true/false }` 和 `toggles_confirmed_at: { "<key>": "<服务端时间>" }`，出了客诉能查到是用户主动开启的。后台作品详情（T77/T78 那页）显示开了哪些开关。
- **不变的**：积分价格不变；伙伴接口 v1 不收开关，一律按默认（关）；作品编辑不受影响；开关不是用户写的文字，不送换脸判断。
- **埋点**：`generate` 事件加 `toggles` 属性；新事件 `template_toggle`（`template_id`、`key`、`action = confirm_shown / confirmed / cancelled / turned_off`、`surface`），用来看开启率和取消率。
- **条款**：使用条款「你的内容」一节加一句（中英文），初稿：「你对使用会改变产品外观的选项（例如 AI 优化摆盘和器皿）生成的图片负责，包括确保对外发布的图片与实际出品相符；因图片与实物不符引起的纠纷由你承担。」最终措辞由 Owner 或律师定，之后改文案按一级改动直接上线。
- **迁移**：只有需要改后台保存函数的校验时才写，编号段 `0840`～`0859`，只加不改；数据定义写进 ARCHITECTURE §5（`fields.toggles`、`model_params.toggles`、`inputs.toggles`）和 §16（新事件），和代码同一个 PR。

**确认框文案**（Owner 意思，模板制作窗口起草；数据里按模板存，这里是第一个开关的初始值）：
- 开关名称：「优化摆盘和器皿」/ "Upgrade plating & tableware"
- 说明：「AI 重新摆盘、换用更精致的器皿，成品可能和实物不同」/ "Re-plates your dish with finer tableware. The result may differ from what you serve."
- 标题：「开启前请确认」/ "Before you turn this on"
- 正文（中）：开启后，AI 会参考你的照片重新摆盘、换用更精致的器皿，生成的图可能和你实际出品的样子差别明显。顾客按图点单后发现实物不符，可能引起投诉或差评。建议只在你能按图出品时使用。开启后生成的图片如何使用由你自行负责，因图片与实物不符引起的纠纷与 Shotviva 无关。
- 正文（英）：With this on, the AI re-plates your dish and uses finer tableware, so the photo may look noticeably different from what you actually serve. If customers order from the photo and get something different, it can lead to complaints or bad reviews. Use it only if you can serve the dish the way it looks. You are responsible for how you use photos made with this option; Shotviva is not responsible for disputes caused by differences between the photo and the real dish.
- 复选框：「我已了解并自行承担」/ "I understand and take responsibility"
- 按钮：「开启」/「取消」，"Turn on" / "Cancel"

**验收**：给一个测试模板配上开关和开 / 关两段提示词；工作台默认关，出图用的是「关」那段；打开时弹确认框，不勾选不能开启，取消后仍是关；勾选开启后出图用「开」那段，作品记录里有 `toggles` 和确认时间，后台作品详情能看到；同一会话再打开不再弹；「再来一张」沿用开启状态；批量生成整批生效；伙伴接口不受影响；没配开关的模板界面不变；后台试跑能切换开关。属于二级（功能），交互验收交给 Codex。

## T90 新版本刷新提示条（可派，一级）

**目标**：Owner 2026-11-08：正式站发布新版本后，还开着旧页面的用户会在点「生成」等操作时报错（旧页面调用的服务端函数新版本不认识）。参照 AI 工具站的做法，发现有新版本时在页面底部提示用户刷新。

**做法**：
- **版本号**：构建时把部署 id（`VERCEL_DEPLOYMENT_ID`，没有时用提交 sha，本地开发为 `dev`）写进前端常量；新增 `GET /api/version`，返回当前提供服务的部署 id，`Cache-Control: no-store`，不读数据库、不需登录、限流宽松。提升（promote）不重新构建，所以同一个部署的前端常量和接口返回一致。
- **检查时机**：页面切回前台时、以及页面在前台时每 10 分钟查一次；本地开发不查。版本不同就显示提示条。另外，前端捕获到「找不到服务端函数」或加载代码块失败（ChunkLoadError）时立即显示同一个提示条。
- **提示条**：页面底部居中（手机在安全区上方，不挡底部按钮和悬浮上传按钮），文案「Shotviva 已更新，刷新后继续使用」/ "Shotviva has been updated. Refresh to keep going."，按钮「刷新」/ "Refresh"，右侧关闭 ×。点刷新整页重新加载；关掉后同一个新版本不再提示，下一个新版本再提示。不自动刷新。
- **不打扰**：正在上传照片、正在生成、在付款流程（结账跳转前后）时先不显示，结束后再显示；创作页有已上传但还没生成的照片时，刷新按钮旁加一行小字「刷新后需要重新上传照片」/ "You'll need to upload your photos again."（如果当前已能保留上传状态就不加）。
- 前台、创作页、作品页、后台都生效；中英文。
- 埋点 `app_update_prompt`（`action = shown / refreshed / dismissed`、`reason = version / error`）。
- 不改业务逻辑，不改数据库。

**配套（Owner 操作）**：在 Vercel 项目设置里打开 Skew Protection（版本错位保护），让旧页面在一段时间内继续由旧版本服务，不报错。开发窗口要确认 `/api/version` 的请求不会被版本错位保护固定到旧版本（在预览环境连发两个部署实测）。

**验收**：打开测试站页面，再部署一个新版本，切回页面后底部出现提示条，点刷新后提示消失且是新版本；关掉后同一版本不再出现；生成过程中部署新版本，生成结束后才出现提示；手机和电脑各看一次。属于一级：附截图、CI 通过即可上线，Codex 事后复查。

## T92 OpenRouter 适配器 + 按模板选出图模型（暂缓，Owner 2026-11-09：先做模板，之后再排）

**目标**：用户反馈价格偏贵。通过 OpenRouter 接入其他厂商的出图模型（如 Gemini Flash Image 系列约 $0.04/张、GPT-5 Image Mini 约 $0.01～0.02/张，OpenAI 中档 1K 现约 $0.05/张），按模板选更便宜但效果过关的模型，为套餐加积分或降价留出毛利空间。

**范围**：新写 `openrouter` 适配器（chat completions + `modalities: ["image","text"]`，读回图片、记真实用量和成本，OpenRouter 充值约 5% 手续费计入成本）；模板可单独指定出图供应商（不指定时用在用供应商）；后台试跑可选模型并排对比；成本对账按模型分开。积分下限表按各模型实测成本另算。

**验收**：同一模板在试跑里用 OpenAI 和一个 OpenRouter 模型各跑 3 张并排对比；给一个测试模板指定 OpenRouter 模型后，前台出图走该模型、成本记录正确；其他模板不受影响。二级，交互验收交给 Codex。

## T93 模板「测试站 → 正式站」一键同步（暂缓，Owner 2026-11-09：下周额度刷新后做）

**目标**：模板在测试站调好后，不再手工复制提示词、手工上传封面，一次推到正式站。过渡期（本周）用现有 `pnpm import:prompts`（origin/main 最新代码、临时 worktree 里跑，正式库密钥由 Owner 在本机配置），封面由 Codex 在正式站后台上传。

**做法**：
- 入口：GitHub 手动触发的工作流（`workflow_dispatch`，挂 `production` environment，Owner 在 GitHub 批准后执行），输入要同步的模板 id 列表；正式库和两个 R2 的密钥只放在 GitHub environment，不经过聊天和任何窗口。（测试站后台「推送到正式站」按钮会让预览环境拿到正式库写权限，不采用。）
- 带上：`templates` 的配置、中英文名称和说明、`translations`、`fields`（含 T89 开关定义）、分类、质量档和积分；`template_prompts` 的正文、版本和 `model_params`（含 T89 开关片段）；封面（含 `cover_locales`）从测试 R2 复制到正式 R2，正式库写正式地址。
- 推到正式站一律**不上架**；已存在的模板更新时保持正式站原来的上架状态和排序。提示词按正式库现有版本号加 1 写入，旧版本保留。
- 积分低于正式站下限、分类在正式站不存在等情况，整条模板拒绝并在运行日志里说明原因；一次运行在一个事务里，或逐个模板单独提交并汇总结果。
- 运行日志只写模板 id 和结果，不打印提示词正文。

**验收**：在测试站调好一个 QA 模板（含封面、中文封面和开关），运行工作流后正式站出现同名模板、未上架，提示词、开关片段、封面都正确；再改一次测试站后同步，正式站版本号加 1、上架状态不变。属于三级（写正式库），交互验收交给 Codex。

完整背景：新模板制作窗口共享笔记 `template-publish-plan-2026-11-09.md`。

## T94 邀请码、促销折扣码、送积分码（可派，Owner 2026-11-09 确认，交给 Codex 开发和验收）

**目标**：普通用户的邀请码（双方得积分）、绑定 Stripe 折扣并能精确到某个商品的促销码、只给被邀请人送积分的赠送码，统一成一套「码」。

**要点**（全文 `.local/invite-codes/spec.md`，开发简报 `.local/invite-codes/codex-brief.md`）：一张 `codes` 表加 `code_redemptions`；任何码都可以送积分、给邀请人奖励、在结账时打折（可组合）。被邀请人注册时 +6 免费积分；邀请人在对方首次付款后 +10 付费积分（30 天最多 20 次，注册 IP 相同不发）。折扣只支持百分比，按 `product_id` 指定，在所有 Stripe 通道用 coupon 的 `discounts` 套用，折后每积分不低于 $0.208；MVP 里 Waffo 不打折。链接用 `?code=`，cookie `sv_code`；和联盟推广（`?ref=`）互不排斥，佣金按折后实付算。新增 `payments.code_id` / `amount_discount`、ledger kind `code_grant` / `invite_reward`、事件 `code_redeem` / `invite_reward` / `invite_share`、后台 `/admin/codes`。

**范围**：迁移 `0880`～`0899`（只加不改），ARCHITECTURE §6.4 数据定义和迁移同一个 PR；四个阶段：数据库 → 注册和兑换 → 结账折扣 → 后台；单测和 DB 测试。

**验收**：按开发简报的验收步骤；三级（积分、付款），付款测试只用测试卡，Codex 完成交互验收。

## T95 联盟推广（Shotviva 内置）（可派，Owner 2026-11-09 确认，交给 Codex 开发和验收）

**目标**：第三方联盟工具太贵，在 Shotviva 里内置精简版联盟推广（ARCHITECTURE「联盟返佣」2026-11-09 更新）。不做独立中心；Graylum 以后各自做或再合并。

**范围**：迁移 `0900`～`0919`（只加不改），数据定义写进 ARCHITECTURE「联盟返佣」，和迁移同一个 PR。推广员申请（手工审核 / 购买门槛 / 后台直接开号）、推广链接和码（`?ref=` + `sv_ref`）、注册和首次付费绑定、佣金（两级、终身、确认期、退款和争议重算，由付款触发器在同一事务里重算，出错不能影响付款）、每月结算单和 $200 门槛、Owner 手工打款后点「已付」、推广员页面 `/partners`、后台 `/admin/affiliates`。规格 `.local/affiliate/spec.md`，开发任务书 `.local/affiliate/codex-brief.md`。

**验收**：按任务书验收步骤；三级（付款数据、数据库），付款只用测试卡；Codex 完成交互验收，Owner 确认后才上正式站。

## T96 出图模型能力自适应（可派，Owner 2026-11-10，交给 Codex 开发和验收）

**目标**：后台换任何 OpenRouter 出图模型都不改代码；创作页的比例和清晰度自动跟着模板所用模型的能力变；积分下限按模型真实成本自动算。

**范围**：迁移 `0920`～`0939`（只加不改）：`ai_providers.capabilities`（保存时、每天、后台按钮刷新）；模板公开数据带「可用比例和清晰度」，不暴露供应商；创作页、首页生成器、批量、再来一张、作品编辑的选择器只显示可用选项，「原图比例」不支持时显示「接近原图（x:y）」；服务端拒绝不可用选项，#369 的回退只作保险；后台模板页显示模型能力和按 p95 成本与 C_max 算出的积分下限（替换写死的下限表）；伙伴接口合同不变。数据定义写进 ARCHITECTURE §3.3、§5、§6.1，和迁移同一个 PR。开发简报 `.local/codex-t96-model-capabilities.md`。

**验收**：按简报验收步骤；二级（功能、数据库），交互验收由 Codex 完成。

## T97 模板画风参考图（可派，Owner 2026-11-10，交给 Codex 开发和验收）

**目标**：画风类模板改用便宜的 Seedream 等模型时，只靠文字追不上 GPT Image 2.6 的画风。模板可在后台挂 1～3 张私有「画风参考图」，出图时由服务端附在用户照片之后，让模型照着这个画风重画；用户、公开接口和伙伴接口都看不到参考图，也不占用户的上传张数。

**范围**：迁移 `0940`～`0959`（只加不改）：`template_prompts.style_refs`（私有，最多 3 张，私有桶 `style-refs/<template_id>/`）；后台模板编辑页上传、排序、删除，提示参考图里不要有真人正脸；出图时图片顺序固定为用户照片在前、参考图在后，提示词可用 `{{photo_count}}` / `{{style_ref_count}}`；首次出图、批量、再来一张、伙伴接口都带参考图，作品编辑不带；用户照片加参考图的张数超过模型上限（T96）时按 #369 回退；`generation_jobs.inputs.style_ref_keys` 记录用了哪几张；后台试跑可以切换带不带参考图。数据定义写进 ARCHITECTURE §5、§8、§10.b，和迁移同一个 PR。开发简报 `.local/codex-t97-style-reference.md`。

**验收**：按简报验收步骤；二级（功能、数据库、私有存储），交互验收由 Codex 完成。

## T98 审计 P1 修复：正式库令牌和审批、回退成本保护、上架下限入库（可派，Owner 2026-11-10，Codex 开发，总控审查合并）

**目标**：修掉 Claude 对模式 3 期间审计出的 P1 问题（报告 `.local/claude-audit-codex-mode3-2026-11-10.md`）。

**范围**（一个问题一个 PR，不合批；迁移 `1010`～`1029`，只加不改）：
- A：`SUPABASE_ACCESS_TOKEN` 移出仓库级 secret，按环境取；新建带 Owner 审批的 `production-manual` 环境，手动触发的正式库操作和模板同步都用它，合并触发的自动迁移仍用 `production`；所有 Actions 按 SHA 固定。
- B：出图回退到非模板绑定的供应商（目录失败、模型缺失、能力不支持、伙伴通道）时，扣积分前按实际供应商重算成本下限，售价不足就拒绝且不扣积分，并发飞书告警；下限按「供应商 + 清晰度 + 质量档」分组，p95 和目录报价取较大值。
- C：上架和已上架模板改价时的成本下限检查放进数据库触发器，对所有模板生效；不改现有模板的价格和状态。
- D：删除 `site.config` 里不再生效的邀请奖励数值；移除仓库里的正式站数据事实。

**验收**：按开发简报 `.local/codex-t98-audit-p1-fixes.md`；A、B、C 为三级，由总控审查后合并，Codex 做交互验收。

## T99 Waffo 新价格续费核对（可派，Owner 2026-11-10，Codex 开发，总控审查合并）

**目标**：确认 Waffo 订阅续费按新价格扣款并按新积分入账；在 Waffo 正式启用前堵住「钱扣了、积分不到账」的缺口。

**现状**：首付和积分包已按服务端报价（`priceSnapshot`）收款并核对金额。续费回调要求实收等于首单报价，但续费是否按 Waffo 后台商品标价扣款未确认；后台年付商品大概率仍是旧价（$191 / $479 / $713，新价 $191.04 / $479.04 / $891）。正式站通道是 Stripe，暂无真实影响。

**范围**（一个 PR；迁移 `1030`～`1039`，只加不改）：
- 在 Waffo 测试环境查清续费按哪个金额扣，记录两期实收。
- 给 Owner 列出 9 个商品的后台标价和新价；后台改价由 Owner 操作。
- 续费实收与报价不一致时发飞书告警（每订单每期最多 1 条），按总控选定的办法处理，不得按旧单位入账或多发。
- 启用 Waffo 前的「后台标价 = 网站价格」核对（只读 API 或手动清单）。

**验收**：按开发简报 `.local/codex-t99-waffo-v2-renewal.md`；三级，总控审查后合并。

## T100 联盟营销结算修复 + 测试站真实冒烟（可派，Owner 2026-11-10，Codex 开发和验收，总控审查合并）

**目标**：堵住联盟结算的几个漏洞，并在测试站用真实的测试付款，把联盟营销两级分销的整条链路跑一遍。

**现状**：T95 的端到端验收只在 #363 的分支预览上做过；结算、到期确认、团队那一级的冲回、续费和升级产生的佣金，只有本地 DB 测试。

**范围**（迁移 `1040`～`1059`，只加不改）：
- 暂缓的结算单继续占用金额，不在下个月重复生成；加「解除暂缓」和「作废」两个出口。
- 打款前复核：结算单生成后佣金减少或作废，后台显示差额，并要求管理员选择。
- 结算日漏跑时，次日补生成，且幂等。
- 待激活的邀请不写 `approved_at`。
- 后台可以对被拒的申请「允许重新申请」。
- 返佣期限设置（Owner 2026-11-10）：`affiliate_settings.commission_months`，留空表示终身，默认终身；只影响修改后的新付款。
- 后台推广员档案（Owner 2026-11-10）：列表显示姓名、注册邮箱、手机号、团队人数，以及累计佣金、已确认佣金、未提现佣金、已提现总额四个金额；详情页显示完整档案，并分页列出本人佣金、团队奖励、团队成员、结算单、推荐的客户和操作日志。
- 测试站完整链路测试（Owner 2026-11-10 要求，跑两轮：现在先按当前 main 跑一轮摸清现状，修复合并后再跑一轮）：两级佣金、部分退款和全额退款、争议、续费、升级、到期确认、结算（paid / held / 解除）、漏跑补生成，以及新版推广员后台上的数字核对。

**验收**：按开发简报 `.local/codex-t100-affiliate-fixes-smoke.md`；三级，总控审查后合并。

## T101 后台「素材参考库」+ 模板调试台（可派，Owner 2026-11-10，Codex 开发和验收，总控审查合并）

**目标**：Owner 调模板时需要大量对标图。把对标图传进后台，按三级分类管理；选一张对标图就能倒推提示词，用多张实拍照片乘以多个提示词版本批量试跑，调好后一键生成模板草稿。

**范围**（迁移 `1140`～`1159`：要排在 T102 的分类表 `1080`～`1099` 之后。T101 等 T102 的数据层合并后再开工，直接复用 T102 建的分类模型）：
- 素材：私有桶，只有管理员能看。三级分类树（和 T102 共用一套模型），多文件上传和粘贴，同一张图去重，标签和备注；批量移动、打标签、归档、删除；归档页能批量恢复和永久删除。
- 调试台：视觉模型倒推提示词，用哪个模型、用什么元指令，都在后台设置里改，不进仓库；提示词有多个版本；照片 × 版本的矩阵试跑，一次最多 12 张，先显示预计成本，计入试跑预算；可以把对标图作为画风参考图（复用 T97）；结果网格可以放大、对比、打星。
- 「发布为模板」：生成下架状态的模板草稿，预填提示词、模型、分类、封面和来源素材，上架时照常过成本下限检查。

**验收**：按开发简报 `.local/codex-t101-reference-library.md`。

## T102 模板三级分类（可派，Owner 2026-11-10，Codex 做数据和后台，总控做前台筛选）

**目标**：模板分类从一级改成最多三级（例：餐饮 / 暗调风格 / 中餐暗调摄影），方便后台管理和用户筛选，为以后按分类出合集内页（SEO）做准备。

**范围**（迁移 `1080`～`1099`，先扩后收）：
- 分类加父子关系、层级和 slug，以及中英文 SEO 标题和描述；最多三级，不能形成环，同级 slug 唯一。现有 6 个分类作为一级，模板不动。
- 后台的分类管理改成树，模板编辑和批量编辑里的分类改成三级选择；树组件和 T101 共用。
- 前台数据层：分类树，按路径取模板时包含子孙分类。伙伴接口的 `category` 输出不变，另外新增 `category_path`。
- 前台筛选界面由总控在数据层合并后做；分类合集内页另外开卡，等模板多了再做。
- **系列模板**（Owner 2026-11-10 追加）：同一批次、同一视觉风格的模板可以组成一个「系列」，分类里只显示一张系列卡片，点开后看到全部成员，在里面直接选（参考 Lovart 的系列组件）。`template_series` 表和模板的 `series_id`、后台的系列管理、前台数据层由 Codex 做；前台的系列卡片和弹窗由总控做。

**验收**：按开发简报 `.local/codex-t102-template-taxonomy.md`。

## T103 本地镜像改文案（暂缓，Owner 2026-11-10 列入计划，暂不开发）

**目标**：Owner 改落地页、内页文案时，不用逐条口述。

**做法**：
- 总控只导出中文页面的本地 HTML，页面上的文字可以直接点着改；价格、积分这些自动更新的数字锁住。
- Owner 改完交回，总控对比改动，写回源文件，并负责同步英文和其他语言，一个 PR 上线。

**启动条件**：核心功能、财务体系和正式模板做好之后，Owner 说开始再做。

## T104 后台模板管理改进（可派，Owner 2026-11-10，Codex 开发和验收，总控审查合并）

**目标**：修复切换提示词版本时把出图模型也改掉的 bug，并让后台模板管理更顺手。

**范围**：
- Bug（优先）：版本切换只切提示词，不动模型、供应商、质量档和积分。
- 编辑页：「公开信息」按 ID、英文名、英文说明、中文名、中文说明、分类排列；出图模型、质量档和三档积分放进同一个区块。
- 列表：按「已上架 / 已下架 / 全部」分标签页；名称显示中文，下面是英文 ID；加搜索和分类筛选。
- 批量编辑：加「出图模型」，每个模板都按模型能力和成本下限检查。
- 试跑面板提速：先测量；清理改到后台做，请求改成并行，记录和照片改用 WebP 缩略图。目标是打开后 1 秒内显示预算和照片。
- 测试照片和试跑记录可以删除（单条和批量），提示词版本可以重命名和删除（当前生效的版本不能删）。
- 销售状态由后台控制（Owner 2026-11-10，第二个 PR）：每个模板一个「开放销售」开关，替代迁移 `0987` 里写死的画风批准名单，记操作日志；积分档位按所选模型的能力开放，不支持的档位不出售；复制模板一律是下架、未开放销售；成本下限的数据库检查不放松。

**验收**：按开发简报 `.local/codex-t104-admin-templates.md`。和 T102 改的是同一批文件：先做本卡的 bug 和布局，再做 T102。

## T105 后台商品管理（会员、积分包）+ Stripe 同步（可派，Owner 2026-11-10，三级，先出方案）

**目标**：在后台直接新建和修改会员、积分包的价格和积分，不再靠改代码；能做到的话，自动同步到 Stripe。

**范围**：
- 先交方案（`[spec]` PR），Owner 和总控确认后再开发。
- 方案要写清楚：商品表作为唯一来源，替换 `site.config` 里的价格；改价只影响新订单，旧合同按原价续费；Stripe 改价用「新建 Price + 转移 lookup key」；同步失败时如何保证价格不对不上；成本下限检查；二次确认和操作日志；Waffo 暂时手动。
- Stripe 同步如果评估下来风险大，本期改成生成一份操作清单给 Owner。

**验收**：按开发简报 `.local/codex-t105-products-admin.md`。

## T106 许愿墙：落地页模块、登录后引导、「愿望实现了」站内提醒（Owner 2026-11-10）

**目标**：让用户知道有许愿墙、知道它能解决什么问题，愿望实现时能第一时间知道。

**范围**：
- 落地页：模板网格下方加许愿墙模块。讲清楚它解决的痛点（现成模板没有你的品类、票多先做、做好置顶一键用），配示例卡片；不承诺上线时间。
- 登录后引导：许愿墙标签上的小红点、创作页模板列表末尾的「没找到想要的？去许愿」卡片、第一次打开许愿墙时的教学卡片（每个账号只出现一次）、第一次出图成功后的一次轻提示。是否看过记在账号的 user_metadata 里。
- 站内提醒：愿望变成 shipped 后，许愿人和投票人下次打开网站时看到「XX 模板上线了」，点一下进入工作台。不发邮件。§15.4 相应改为「做站内提醒，不发邮件」。
- 分工：数据层由 Codex 做（简报 `.local/codex-t106-wish-shipped-notice.md`，迁移 `1160`～`1169`）；落地页、引导和提醒条都由总控做。

## T107 多模板批量（Max 专属）+ 付费墙在关键时刻出现（Owner 2026-11-10）

**目标**：拉开会员档位差异。Pro 可以用「一个模板 × 多张照片」，只有 Max 能用「多个模板 × 多张照片」；在用户碰到限制的那一刻引导升级。

**范围**：
- 多模板批量（只有 Max 能用）：1～5 个模板 × N 张照片组成方阵，总数不超过 Max 的单批上限。
  - 跑之前显示每格的积分和总积分预览，可以去掉某一格；
  - 有文字字段的模板，每个模板填一次，同模板的照片共用，也可以按照片单独改；
  - 清晰度和尺寸整批统一，开关按模板分别设；
  - 结果可以按模板看，也可以按照片看；
  - 「把这个模板用到更多照片」；
  - 作品页按批次归组。
- Pro 和 Max 均可打包下载本人的批次。Pro 支持单模板最多 10 张，Max 支持单模板或多模板共 30 张；只有多模板生成是 Max 专属。ZIP 文件名为「照片名_模板名_序号.png」。
- 付费墙在关键时刻出现，并预选对应的档位：
  - 下载带水印的免费图 → Starter；
  - 多选照片 → Pro；
  - 多选模板 → Max。
  - 积分不够时，同时对比「买积分包」和「开会员」哪个更划算；
  - Max 功能对低档用户可见，但带标记锁住，点击后进入付费墙；
  - 付费墙里加一张批量出图的示例图（真实图，或注明「示例」）。
- 不做：首购限时优惠（Owner 2026-11-10 否决）、倒计时、虚假名额这类催促手段。
- 分工：后端（档位拦截、批次、打包下载）由 Codex 做（简报 `.local/codex-t107-multi-template-batch.md`，迁移 `1170`～`1179`）；工作台和付费墙界面由总控做。
