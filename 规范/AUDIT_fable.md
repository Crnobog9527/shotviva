# Shotviva 规范审计报告（Fable）

> 2026-11-04 · 审计对象：`规范/ARCHITECTURE.md`、`AGENTS.md`、`DESIGN.md`、`LAUNCH_CHECKLIST.md`、`COLLABORATION.md`、`seo资料/Shotviva建站规格v2.md`、`seo资料/Shotviva 页面与主词映射（美国口径）.csv`、`seo资料/公开创作库seo方案.md`
> COLLABORATION.md 按 2026-11-04 23:47 版本（含新增 §2.1 和模式记录「4 预定」）审计。
> 对照物：底座 `CharlieLZ/flux-kontext-template`（894c64b，Next 16.3.8）、Graylum `staging`（a6a725b）。本文只提建议，不改任何规范。

## 1. 总判断

这套规范的方向是对的：钱走 SQL 函数、提示词不进仓库、作品页 noindex+不可枚举 ID、8 周闸门、`site.config.ts` 单一口径，这些都是 MVP 阶段最容易省掉又最容易出事的地方，写得很硬，应该原样保留。问题出在「宽度」：ARCHITECTURE 把一个验证付费意愿的 MVP 写成了一个完整 SaaS（五页后台 + 审计日志、Stripe→Waffo 自动故障切换、三种定时任务、到期/删除两套提醒邮件、续费恢复文件、审核管线），LAUNCH_CHECKLIST 又把这些全部列成了「不过不上线」，DESIGN 再要求每个页面（含后台）都先出 impeccable 设计稿并等 Owner 点头。按我的估算，这些加起来是 **3～4 周的纯开发量**，而且没有一项能改变「有没有人付钱」这个答案。同时有三处会直接造成返工的空白没写：底座是 Tailwind v3 且没有 next-intl（规范当成已有）、底座大文件应该删而不是按 AGENTS 3.1「先拆再改」、SEO 页面内容没有规定存放格式导致 `site/` 层无法真正换站。文档之间有 9 处明确矛盾（价格口径、v1 范围、物料页名单、`is_public` 默认值等），下表逐条列出。建议顺序：先把 v1 范围收到「首页 + 工作台 + Stripe Checkout + 一页模板后台」，其余全部标 v1.5/v2，再把模板化只做到 `site/` 与模块开关两层。

## 2. 问题清单（按影响排序）

等级：**A** = 不改会返工或拖慢上线 ≥3 天；**B** = 明显多做或有歧义，1～3 天；**C** = 小修。省时为单人开发天数估计。

| # | 级 | 文件 · 章节 | 问题 | 建议 | 理由 | 影响 / 省时 |
|---|---|---|---|---|---|---|
| 1 | A | ARCHITECTURE §10、§10.1；LAUNCH §9 | v1 要做五个后台页（模板、审核、用户、订单、任务）+ 审计日志 + 借 Kiranism 外壳 + 每页过 impeccable。 | **简化**：v1 后台只做一页「模板与提示词编辑」（因为 `template_prompts` 客户端读不到，必须有个服务端界面）。用户查流水、手动调积分、看订单、看失败任务一律用 Supabase Studio + 两个 SQL 函数（`admin_adjust_credits`、`admin_ban_user`）。作品审核页推迟到第 6～7 周（创作库第 8 周才开）。审计日志推迟。不引 Kiranism。 | 前 8 周只有 Owner 一个人用后台，Supabase Studio 就是现成的表格后台。五页 + 外壳 + 设计稿 + 审计是整个规范里最大的一块非验证工作。 | 省 **7～10 天** |
| 2 | A | ARCHITECTURE §6.2/§6.3；LAUNCH §5；AGENTS §7.2 | Waffo 兜底 + 「模拟 Stripe 不可用切到 Waffo」+ 支付宝/微信走 Waffo 的分支。两条通道各自的回调验签、去重、事务、测试。 | **推迟**：v1 只接 Stripe Checkout（托管页，不是 Elements），卡 + 支付宝 + 微信都从 Stripe 开（美国主体的 Stripe 账户支持 Alipay/WeChat Pay 收 USD）。`site.config.billing.channels` 保留字段，`fallback: null`。Waffo 等 Stripe 真被限制再接。 | 第二条支付通道是「Stripe 出事」的保险，不是付费验证的一部分；Graylum 的经验是双通道 + 故障切换是支付目录膨胀到几千行的主因。 | 省 **4～6 天**；LAUNCH §5 删 2 条 |
| 3 | A | ARCHITECTURE §8；LAUNCH §9.3、§8 | 保留期表要 5 档规则 + 定时清理 + 删除前邮件 + 续费恢复 + 失败文件即时删。 | **简化**：v1 一条规则「原图 7 天后删，成品一律保留」，用 R2 生命周期规则（bucket 上按前缀设置过期）实现，不写定时任务。会员到期后的 90 天/恢复/提醒全部推到有付费用户之后。隐私政策只写「原图 7 天，成品保留至你删除」。 | R2 存 1 万张成品一年不到 1 美元；为了省这点钱写 cron + 邮件 + 恢复逻辑不值。R2 生命周期规则零代码。 | 省 **2～3 天**；去掉 1 个 cron |
| 4 | A | ARCHITECTURE §6.2；DESIGN §4.5；建站规格 G3/§4 | 价格口径三处不一致：建站规格写 **$9.9/月**（订阅语气）；ARCHITECTURE 写会员期 1/3/12 个月一次性买断、不自动续费；DESIGN 付费墙只列积分包、1 个月、12 个月（没有 3 个月）。§6.2 表里说「卡自动续费 v1 不做」，§6.3 又说「参照 Graylum 卡可以自动续费」。 | **修**：定一张价格表写进 ARCHITECTURE，并声明这就是 G3 的唯一口径。我的建议：v1 只卖两样——积分包（一次性）和 1 个月会员（一次性买断，不续费）；12 个月先不上。建站规格 G3 的「$9.9/月」改成「$9.9 for 1 month」。 | G3 自己要求全站一套数字，现在规范内部就是两套。付费验证只需要一个能点的付款按钮，SKU 越少转化数据越干净。 | 不改会在首页/价格页/FAQ/JSON-LD 四处改来改去 |
| 5 | A | ARCHITECTURE §11 vs 建站规格 §8 / R8 / G13 | v1 范围互相矛盾：ARCHITECTURE 说 v1 不做「第 2 周以后的内页」和「多语言内容」；建站规格要求第 2 周 3 个内页、第 3 周博客 3 篇、第 4 周 `/ja` `/id`，R8 还要求「首页必须直链第一批和第二批全部内页」。 | **修**：在 ARCHITECTURE §11 或建站规格 §8 明确「代码 v1 = 建站规格第 1 周交付 + `/image-to-image-generator`（R1 要求它必须存在）+ `/pricing`」；第 2～4 周内页是内容任务，用同一套页面组件填内容，不算新功能。`/ja` `/id` 推到付费验证通过之后（G13 要母语写手，本身就是一笔钱）。R8 改成「首页直链所有已上线内页」。 | 否则执行方会按建站规格第 4 周把 next-intl 日语路由、hreflang、独立 sitemap 都做出来。 | 省 **3～5 天**（多语言） |
| 6 | A | AGENTS §2、§3.1；底座实况 | 规范把底座当成「Tailwind v4 + next-intl + pnpm」。实际底座：**Tailwind 3.4.17**、**没有 next-intl**（13 个语言是 `app/ja/page.tsx` 这样手写的目录）、npm + package-lock、ESLint 9 + Biome 并存、无 `supabase/migrations`（只有 `scripts/setup-database.sql`）、next-auth 4、Stripe SDK 17。 | **加**一节「底座改造清单」：① Tailwind 3→4 迁移（或者干脆新建 Next 16 + Tailwind 4 项目，把底座里值得留的文件拷进去）；② 删 13 个语言目录、`api/debug/*`、`api/v1` rewrite、NextAuth、Turnstile、creem（21 个文件）、content-safety（580 行）、user-tiers、ApiDocumentation/resources 页；③ 引入 next-intl 单语言；④ npm→pnpm；⑤ 删 Biome 只留 ESLint。明确「保留清单」：`services/r2-storage.ts`、`StructuredData.tsx`、`sitemap.ts`/`robots.ts`/`llms.txt`、`seo/metadata-generator`、`payment/stripe.ts` 作参考。 | 底座 27k 行里能直接用的大约 2～3k 行。不写清楚，第一周会在「拆 1955 行文件」上浪费时间（见下一条）。我倾向「新建项目 + 拷文件」：1 天；原地改造 3～5 天。 | 不写会返工 **3～5 天** |
| 7 | A | AGENTS §3.1 末段 | 「底座里的超长文件必须先拆再改」并点名 `FluxKontextGenerator.tsx`（1955）、`api/flux-kontext/route.ts`（804）、`lib/database.ts`（793）。 | **修**为「这三个文件删除，不拆」：工作台按 DESIGN §4.3 重写（三步出图和底座的 prompt 工作台完全不是一个东西）；出图路由被 §4 的任务状态机取代；`database.ts` 是 users 表 CRUD，被 Supabase 客户端 + SQL 函数取代。 | 拆一个 1955 行的 prompt 编辑器再改成「选模板上传照片」比重写慢得多。 | 省 **2～3 天** |
| 8 | A | ARCHITECTURE §1「site/」；建站规格 R10、§4 | 模板化最大的空白：建站规格要求每个 SEO 页五块内容（对比图、事实块、成本表、FAQ、互链），但没有任何文件规定这些内容**以什么格式存在哪里**。没有这一条，`site/` 层就只有品牌名和价格，换站等于重写所有页面。 | **加**：规定 `site/content/pages/<slug>.ts`（或 MDX）一个文件一页，导出 `{ slug, keyword, title, description, answerBlock, facts[], costTable, faq[], related[] }` 这种固定结构；`app/(marketing)/[slug]/page.tsx` 一个通用组件渲染全部内页和标签页；JSON-LD、sitemap、FAQ 从同一结构生成。 | 这一条同时解决 R5（源码可见）、R7（JSON-LD）、G3（数字只出现一次）、R10（五块缺一不可可以用类型检查）。新站只换 `site/content/`。 | 不加，模板化目标落空；加上是 **1 天**基础设施 |
| 9 | A | DESIGN §0 | 任何 UI（含后台、空状态、错误态）都要 impeccable 先出稿 → Owner 点头 → 再写 → 再 impeccable 复查。 | **简化**：impeccable 只做一次「设计方向 + 设计变量 + 三个关键屏（首页、工作台、付费墙）」，Owner 评一次；之后的页面按 DESIGN §3 变量和已定方向直接写，PR 里附截图即可；后台完全豁免。 | 这是串行瓶颈：每个页面都要一轮 Owner 评审，Owner 不在线整个前端就停。后台只有 Owner 自己用。 | 省 **4～6 天**日历时间 |
| 10 | B | ARCHITECTURE §4、§3.1 | 任务状态机 v1 就要 webhook 解析、定时轮询、15 分钟超时 cron。 | **简化**：保留表结构和预扣/确认/退回三步（这是模板的关键接缝），但 v1 只实现同步路径：一次请求内调 GPT-Image-2.5 → 成功确认 / 失败退回。`getStatus`/`parseWebhook` 留接口、不实现；超时 cron 不写，请求超时（Vercel Pro 可设 300s）直接当失败退款。 | GPT-Image 是同步返回的；轮询和回调是视频的需求。 | 省 **1～2 天**；v1 零 cron（与 #3 合起来） |
| 11 | B | ARCHITECTURE §3 `defineModule` | 模块接口 v1 就定义 `templateFieldTypes`、`outputKinds`、`adminPanels`、`modality`。 | **简化**：v1 `defineModule({ id, workspace, provider })` 三个字段，其他等视频模块真要接时再加。 | 过早抽象的接口在第二个模块出现前一定会改；现在写只会约束图片模块的写法。核心做法保留：`core` 不 import `modules`，ESLint 规则强制。 | 省 0.5 天，避免后续改接口 |
| 12 | B | AGENTS §3.1、§3.1 自动检查 | 文件 300 行、函数/组件 60 行、复杂度 10、props ≤8，全部 CI 失败级。 | **简化**：文件 300 行保留（CI error）；`max-lines-per-function` 对带 JSX 的组件改成 warn 或 120（含 JSX 行数计法不同，60 行几乎每个页面组件都会触发）；props 上限不进 CI。 | 规则不可验证时执行方会花时间绕规则而不是写功能。 | 避免每个 PR 为了过 lint 拆无意义的子组件 |
| 13 | B | ARCHITECTURE §9、§4 vs 创作库规格 §3 | `is_public` 默认值矛盾：创作库规格 §3 说 `is_public` 默认 false、`indexable` 默认 false；ARCHITECTURE §9.1 说审核通过即 `is_public = true`。创作库规格的 `ugc_works` 有 `prompt` 字段，ARCHITECTURE §9.2 说改成模板 id + 用户文案；两份文档里是两张表（`ugc_works` vs `generation_jobs` + `assets`），关系没写。 | **修**：ARCHITECTURE 明确 `ugc_works` 不单独建表，公开作品 = `generation_jobs` 里 `status = succeeded AND visibility = 'public'` 的记录；字段用 `visibility: 'public' \| 'private'`（免费用户默认 public，会员可改），`indexable` 字段删掉（作品页永远 noindex，用不到）。创作库规格 §3 的表结构标注「以 ARCHITECTURE §9 为准」。 | 两张表存同一张图必然不同步。 | 省 1 天，免返工 |
| 14 | B | ARCHITECTURE §9 审核；AGENTS §6 末条 | 「公开前先过 OpenAI 审核接口，含人脸或违规内容的不公开」。OpenAI moderation 没有「人脸」类别，这条不可验证；而且前 8 周根本不公开。 | **推迟**：审核管线整体推到第 6～7 周，和审核后台页一起做。v1 上传只做 EXIF 清除 + HEIC 转换 + 大小格式校验。人脸检测要么删掉要么指定具体服务（如 AWS Rekognition），别写「含人脸」。 | 前 8 周没有任何公开页面，审核不影响上线安全。 | 省 **1～2 天** |
| 15 | B | ARCHITECTURE §6.2、§8；LAUNCH §5.4 | 到期前 7 天 / 1 天提醒邮件、删除前提醒邮件，需要 cron + 两套 Resend 模板。 | **推迟**到有付费会员后。v1 的邮件只有 Supabase Auth 的验证邮件和重置密码邮件（通过 Supabase 自定义 SMTP 走 Resend，**不写任何发信代码**，ARCHITECTURE §7 应明说这一点，否则有人会去自建邮件流程）。 | 第一个会员到期至少是上线 30 天后。 | 省 1～2 天 |
| 16 | B | AGENTS §2、§6；LAUNCH §1、§2 | Upstash 限频 + 一次性邮箱域名黑名单 + Sentry + PostHog + Vercel Analytics。 | **简化**：限频用 Vercel Firewall 的 rate-limit 规则（Pro 自带，不加服务）；一次性邮箱黑名单删掉（hCaptcha + 邮箱验证 + 3 张免费额度已经够挡）；监控留 Sentry + PostHog，Vercel Analytics 可开可不开。 | 每多一个第三方服务就是一组密钥、一个账号、一条 checklist。 | 省 0.5～1 天，少 1 个服务 |
| 17 | B | COLLABORATION §2 模式 1、§3 末段 | 模式 1 按「前端 / 后端」切人，§3 又要求「前后端各自独立的部分拆成两张卡、接口由总控先写进任务卡」。 | **修**：按功能竖切，不按层切；同一功能前后端一张卡、一个开发窗口、一个 PR。§3 那句改成「只有当两张卡真能独立合并时才拆」。模式 4 已预定为开发期模式，这条主要影响 §3 的拆卡习惯。 | 工作台这种功能前后端是一个改动，拆两张卡等于总控先写一遍接口再让两个窗口各猜一遍；MVP 期间协调成本比开发成本高。 | 少一半任务卡往返 |
| 18 | B | COLLABORATION §2、§6 vs Owner 全局 CLAUDE.md | §6 已预定开发期切模式 4（Claude 全部开发、Codex 只验收），与 Owner 全局 Graylum 规则一致，矛盾基本解除。但 §2 仍写「默认模式 1」，且全文没说本文覆盖全局规则。 | **修**：§2「默认模式」改成 4，模式 1 保留为可选；开头加一句「本文只适用 Shotviva，优先于全局 Graylum 规则」。另外补三条缺失：谁判定「没额度」（Owner 说了算）、生产迁移/部署由谁执行（Owner 批准后总控执行）、仓库建立前任务卡放哪（规范目录下 `TASKS.md`，建仓后迁 Issue）。 | 「默认 1、预定 4」两句并存，新开的开发窗口读到的是默认 1。 | 避免分工来回扯 |
| 18a | C | COLLABORATION §2.1（新增） | 「总控窗口不写业务代码、每张卡一个开发窗口、并行用 worktree」可行，但有两处没闭环：① 开发窗口汇报只到总控，PR 审查打回后由谁改（原窗口可能已关）；② 每个开发窗口都要重读 6 份规范，上下文成本高。 | **加**两句：① 打回的修改回原开发窗口，窗口已关则新开窗口并在任务卡写明「续做」；② 任务卡里直接摘抄本任务依据的规范条文（而不是只写章节号），开发窗口按卡执行，只在有疑问时回读规范。 | 否则总控会自己动手改 PR，违反 §2.1 第一条。 | — |
| 19 | B | 建站规格 §4 vs CSV | 物料页名单不一致：建站规格 §4 列 4 页含 `/promo-poster`（预筛 0）；CSV 说 promo poster「并入上页 H2，不单独建页」，且 restaurant flyer / poster 的难度是精评后 57.9 / 58.2，不是建站规格里的预筛 5 / 1；ai flyer maker 精评 27.3 vs 预筛 28。 | **修**：建站规格 §4 第三批按 CSV 更新，CSV 标为主词表的唯一来源（AGENTS §9 已经这么要求，但 AGENTS 指向的是建站规格第 4 节）。 | AGENTS §9「不在主词表里的页面一律不建」现在有两份不同的主词表。 | 免争议 |
| 20 | B | 建站规格 R3 | R3 要求 Title ≤60 字符，自己给的示例 "AI Food Photo Generator for Restaurants — Studio Dish Photos from Your Phone (2026)" 约 83 字符。 | **修**示例，或把规则改成「≤60 字符，超出部分放 (2026) 之类可截断的尾缀」。 | 执行方会照抄示例。 | — |
| 21 | B | 建站规格 R1/R6 vs DESIGN §1、建站规格 §0 | 「首页就是模板库」+ R6「只做 /templates/ 聚合页」= 两个页面放同一个模板库，直接违反 R1 一页一词。 | **修**：v1 没有 `/templates` 路由；首页就是模板库；模板分类筛选用首页锚点或 `?category=` 参数页 noindex。`templates` 表的「对应的 SEO 页面」字段保留。 | — | 省半页 |
| 22 | B | 建站规格 G7 | 三篇榜单/对比页（best tools 2026、vs photographer、alternatives）没有 URL、没有周次、不在 CSV。 | **推迟**并补进 CSV（博客批次）；「vs 摄影师」其实就是 `/commercial-photography` 的成本对比，不另建页。 | G7 说这是 AI 推荐类问题的主要来源，但没排期等于不会做。 | — |
| 23 | B | 建站规格 §8 第 1 周；LAUNCH §4.1 | 第 1 周 10～15 个模板，每个要提示词调优 + 真实前后对比图 + 3 次实测主体不变。 | **简化**到 6～8 个模板上线，之后每周加。 | 这是真正的关键路径（提示词调到「餐具摆盘不变」比写代码慢），15 个模板是第 1 周最不可能完成的一项。 | 省 **2～3 天** |
| 24 | C | 创作库规格 开头、§3 | 引用的「01-spec.md」不存在（应为 `Shotviva建站规格v2.md`）；§3「违规或敏感提示词返回 404」在用户不写提示词的产品里没有意义。 | **修**：改引用；改为「审核未通过或已下架的作品返回 404」。 | — | — |
| 25 | C | 建站规格 §7 | 「数据库只存模板和任务，页面内容全部静态生成」「Vercel 或 Cloudflare 部署」与 ARCHITECTURE（十几张表）和 AGENTS（锁定 Vercel）不符。 | **修**：§7 改成「见 ARCHITECTURE」。 | 建站规格是上位文件，过时内容会被当真。 | — |
| 26 | C | LAUNCH §8 末条 | 「欧盟访客看到 Cookie 同意提示」。目标市场是美国，且加横幅要做地域判断。 | **简化**：PostHog 开 cookieless 模式 + 不打 Cookie 横幅；隐私政策写清楚即可。 | 少一个组件、少一条地域逻辑。 | 省 0.5 天 |
| 27 | C | ARCHITECTURE §2、DESIGN §4.5 | 「价格写在 `site.config.ts` **或**数据库」两可。 | **修**：v1 商品定义在 `site.config.ts`（SSG 构建时要读），Stripe price id 放环境变量，数据库只存订单。 | 两可就会两处都写。 | — |
| 28 | C | LAUNCH 整体 | 缺项：Stripe 生产 webhook 端点与签名密钥登记；Supabase Auth 的 Site URL / Redirect URLs 含预览域名通配；PostHog 事件名清单（§9.1 列了漏斗但没名字）；OG 图；「我的作品」页存在且 noindex（DESIGN §4.4 依赖它，但没有任何页面清单提到它）；用户自助删号路径（隐私政策要写）。多项：Waffo、到期提醒、清理任务、五页后台应随 #1/#2/#3/#15 移到 v1.5 清单。 | **加 / 修**。 | 这些漏项每一个都会在上线当天卡住。 | — |
| 29 | C | AGENTS §7.5；LAUNCH §6 | 创作库相关测试和 checklist（noindex 输出、sitemap 不含 /g、关闭模块 404）在第 8 周前只有「404」一条有意义。 | **推迟**前两条到开创作库那个 PR。 | — | — |
| 30 | C | DESIGN §2 | 「优先从 Graylum staging 复制 ui 组件」：Graylum 是 Tailwind v4 + shadcn，复制没问题，但前提是 #6 把底座升到 v4。 | 在 #6 的改造清单里注明依赖。 | — | — |
| 31 | C | 建站规格 R12 | 「每两周看 img to img（难度 14.3）是否先出排名」，但没有任何页面以 img to img 为主词，只在 R8 当锚文本。 | **修**：说明这是首页副词（靠锚文本带），或删掉。 | 不可验证。 | — |
| 32 | C | COLLABORATION §3、§5 | 「规范只有总控能改」：模式 3 下 Codex 是总控会改规范，切回时 Claude 需要 diff 规范；规范目前在仓库外（`规范/` 目录），没有版本历史。 | **加**一句：规范改动必须单独 PR，标题前缀 `[spec]`；仓库建好后立刻把 `规范/` 和 `seo资料/` 移进仓库纳入 git。 | 本次审计发现 COLLABORATION 在审计期间被改过，若无 git 无法知道改了什么。 | — |

### 模板化（目标 2）的专门结论

- **够用的部分**：`core / modules / site / app` 四层 + ESLint 边界 + `site.config.ts` + 模块开关导致「路由 404、不进 sitemap、不进导航」——这是模板化的全部必要条件，保留。
- **缺的部分**：#8（内容格式）是唯一真正阻塞换站的空白；另外要写一句**仓库策略**：Shotviva 仓库本身设成 GitHub template repo，新站 `Use this template`，`site/` 是唯一预期差异目录；不做 monorepo、不做 npm 包。
- **过早的部分**：#11 的 `defineModule` 五个字段、#10 的 webhook/轮询、`core/moderation` 和 `core/gallery` 在第 8 周前全是空目录。模板化的检验标准应写成一句可验证的话：「新建一个站只改 `site/`、`.env`、`supabase/seed`，`pnpm build` 通过」——建议加进 LAUNCH 作最后一条。

## 3. 应该保留的（不要在精简时误删）

1. **钱只走 SQL 函数 + 幂等键**（ARCHITECTURE §6.1、AGENTS §5）和「一条 SQL 原子预扣」（§4.1）。这是整套规范里最值钱的两句话。
2. `template_prompts` 私有表 + 种子提示词不进 git（§5）。
3. 作品页 `noindex, follow`、不可枚举 ID、不进 sitemap、不用 robots.txt 挡（创作库 U1～U5）——全部正确且便宜。
4. 8 周闸门 + 付费墙从第一天起告知（§9.1）。
5. `site.config.ts` 是对外数字的唯一来源（§2、G3）。
6. 删 NextAuth / Turnstile / debug 接口 / `/api/v1` / 全站 CORS（AGENTS §6、LAUNCH §2）——我在底座 `vercel.json` 里确认了这些都在。
7. AGENTS §7 前三条强制测试（积分并发、回调重复乱序、状态机超时）+ 连本地 Supabase 不 mock。
8. LAUNCH §4「连点 5 次只扣对应次数」「每张图成本已记录、定价有毛利」——这两条就是付费验证本身。
9. 管理员身份存 `profiles.role` 不用环境变量邮箱列表。
10. `Validation handoff` 评论格式和「验收方停下请 Owner 处理登录/验证码」（COLLABORATION §4）。
11. 建站规格 R5/G11 源码可见、R10 五块、G1 直答块、U7 标签页做厚——这些决定了 SEO 页的组件结构，和 #8 一起实现一次全站受益。
12. DESIGN §1 四条原则和 §5 文案语气（photo 不说 image generation，template 不说 prompt）。
