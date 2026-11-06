# Shotviva 后台补强方案（提案）

> 2026-11-06 · 调研窗口起草，交给总控。**这是提案，不是规范**：采纳哪几项、怎么改 ARCHITECTURE §10 和 TASKS，由总控决定。本文件不改 `规范/`，也没有写任何代码。
>
> 依据：ARCHITECTURE §3.3、§4、§6、§7、§9、§10、§13–§16；AGENTS §5、§5.1；main `94f4ac7` 上的后台代码（`src/app/(app)/admin/*`、`src/core/admin/*`）和 `supabase/schema.sql`；T10 的 [spec] PR #79（`payments` 表和续费函数，未合并）；Graylum `staging` 分支 `apps/web/src/app/(zh-hans)/admin/*`。

## 0. 一屏总览

大小：S ≈ 半天，M ≈ 1～2 天，L ≈ 3 天以上。优先级：**P0 上线前**，**P1 上线后第一个月**，**P2 以后**。

| # | 功能 | 给 Owner 解决什么 | 大小 | 优先级 | 依赖未完成的卡 | 新数据库对象 |
|---|---|---|---|---|---|---|
| A1 | 万能查找框 | 用户发来邮箱、作品链接或 Stripe 收据号，一次就找到对应用户 | S | P0 | 付款号部分要等 T10 | 函数 `admin_lookup` |
| A2 | 用户详情补全 | 一页看全一个用户：付款、订阅、Graylum 连接、同 IP 账号、需求 | M | P0 | 付款部分要等 T10 | 索引 `profiles(signup_ip)`、`payments(user_id, created_at)` |
| A3 | 后台查看作品 | 用户投诉「出图不对」时能看到原图和成品 | S | P0 | 隐私政策要加一句 | 审计日志加 `view_work` |
| A4 | 卡住任务退回、单张补偿 | 函数中途崩溃的任务积分一直扣着；对效果差的单张一键补偿且不会补两次 | S | P0 | — | 部分索引 `generation_jobs(created_at) where status = 'running'` |
| A5 | 按 Stripe id 重放入账 | 用户付了款没到账时，按 session id 补入账，不用手调积分 | M | P0 | T10（`settle_checkout` 改签名）；Waffo 部分要等 T13 | 无（复用 `settle_checkout`） |
| A6 | 概览「待处理」条 | 每天打开后台先看到要处理的事 | S | P0 | 退款计数要等 T10 | 函数 `admin_todo_counts` |
| A7 | 同 IP 注册排查 | 发现批量注册薅免费额度，并决定要不要开 §7 的 IP 限制 | S | P0 | 需要 Owner 拍板 | 索引 `profiles(signup_ip, created_at)` |
| B1 | 模板表现 | 每个模板的用量、成功率、重做率、积分、估算收入和成本，看出该先改哪个 | M | P1 | — | 函数 `admin_template_stats` |
| B2 | 毛利表（模型 × 分辨率 × 质量档） | 换供应商或模型后，看毛利还守不守得住 60% | M | P1 | T10（实收金额） | 函数 `admin_margin_stats` |
| B3 | 记录每单真实 token 用量 | 成本从按标价估算改成按实际用量算，积分下限也有了持续数据 | M | P1 | — | `generation_jobs` 加 3 个整数列 |
| B4 | 失败分析 | 按失败原因 × 模型 × 模板分组，加一个短的供应商错误类型 | S | P1 | — | 函数 `admin_failure_stats`；`generation_jobs.error_detail` |
| B5 | 退款 / 争议待办与扣回积分 | Stripe 退了款，提醒并一键扣回对应积分，不会重复扣 | S | P1 | T10 | 部分索引 `payments(created_at) where status <> 'paid'` |
| B6 | 审计日志扩展与查看页 | 谁在什么时候改了供应商、模板、公告、积分，能查得到 | M | P1 | — | `admin_audit_log` 加列；函数 `admin_list_audit` |
| B7 | 运行时开关 `system_settings` | 不重新部署就能暂停出图、暂停注册赠送、切换付款通道 | M | P1 | 通道开关要等 T13 | 表 `system_settings` |
| B8 | Graylum 连接 | 看连接数、Graylum 来源的出图和积分；后台替用户断开 | S | P1 | — | 函数 `admin_partner_stats` |
| B9 | 后台代删账号 | 登录不了的用户发邮件要求删号时，Owner 能在后台处理 | S | P1 | 先做 B6 | 无（复用删号逻辑） |
| C1 | 作品审核队列 | 公开创作库开放前必须有（§9 第 5 条） | L | P2（第 6～7 周） | 创作库卡、审核方案（未定） | `generation_jobs` 加审核状态；表 `work_reports` |
| C2 | 需求 → 模板闭环 | 看做出来的模板有没有人用，墙上投票的人有没有回来用 | S | P2 | 先做 B1 | 无 |
| C3 | CSV 导出（只导付款和汇总） | 记账、报税时导出某月付款 | S | P2 | T10 | 无 |
| C4 | 批量补偿（免费池） | 出图大面积故障后，给受影响的用户补积分 | S | P2 | — | 函数 `admin_bulk_grant` |
| C5 | 需求审核分页与用户搜索性能 | 数据变多以后不变慢 | S | P2 | — | 视数据量再定 |

**不建议做**（详见第 4 节）：工单系统、后台里直接退款、v1 的优惠券 / 促销码、后台设管理员、把价格和免费额度搬进数据库、Graylum 式的「系统诊断」和「性能监控」页、全站积分流水总表、按条件筛选的全量用户列表、后台发邮件、在后台重做 PostHog 漏斗。

**建议拆成 5 张卡**（第 6 节）：P0 两张（「客服工具」A1–A4、A7；「付款补救与待处理」A5、A6，等 T10），P1 三张（「经营数据」B1–B4；「审计与开关」B5–B7、B9；B8 可以并进其中一张），P2 等创作库排期再定。

---

## 1. 现在有什么、缺什么

### 1.1 已有（T3、T16、T17、T12、T23 合并后）

| 页面 | 已有能力 | 读写的数据 |
|---|---|---|
| 概览 `/admin` | 今日 / 7 天 / 30 天：注册、出图、成功率、两池积分消耗、新付费用户；30 天趋势；收入卡片 | `admin_dashboard_stats(p_days)`、`admin_revenue_stats(p_days)` |
| 用户 `/admin/users` | 按邮箱子串搜（最多 50 条）；详情：两池余额、会员到期、最近出图、积分流水分页；调积分（选池、填原因）、封禁 / 解封 | `admin_search_users` → `admin.users_overview`；`credit_ledger_user_id_created_at_idx`；`admin_adjust_credits`、`admin_ban_user`、`admin_unban_user` |
| 订单与收入 `/admin/orders` | 付款记录和订阅状态，按商品和渠道汇总，每行跳 Stripe 搜索 | 目前读 `credit_ledger` 里 `kind = 'purchase'` 的行，金额取 `products.price_usd`（标价，不是实收）；T10 合并后改读 `payments` |
| 出图记录 `/admin/jobs` | 按状态、模板、模型、来源、日期筛选，游标分页；失败显示 `error_code`；按模型和分辨率统计次数和估算成本 | `generation_jobs_created_at_id_idx`；成本单价 `modules/image/generation-cost.ts`（只按分辨率，取 high 质量标价） |
| 模板 `/admin/templates` | 新建、编辑公开字段和私有提示词、三档积分（低于下限拒绝）、封面上传、上下架、排序 | `admin_upsert_template`、`admin_reorder_templates` |
| 出图供应商 `/admin/providers` | 增改、测试连接、切换在用，密钥存 Vault | `ai_providers`、`admin_activate_provider` |
| 需求审核 `/admin/requests` | 通过、拒绝、下架、标 shipped 并关联模板 | `admin_list_template_requests()`（每个状态最多 500 条） |
| 公告横幅 `/admin/announcements` | 中英两版、定时、启用即切换 | `site_announcements`、`admin_activate_announcement` |

### 1.2 一个人运营时会卡住的地方

按 Owner 每天会遇到的事逐条对照现有后台：

1. **客服找人**：只能按账号邮箱搜。用户经常发来的是作品链接（含 job id）、Stripe 收据上的号，或者付款时用的另一个邮箱，现在都搜不到。
2. **看不到用户的图**：下载路由 `/api/files/[jobId]` 只给作品主人（`core/jobs/job-file.ts`），Owner 无法核实「出图不对」的投诉。
3. **卡住的任务**：同步出图如果在预扣之后、结算之前函数崩溃，任务一直是 `running`，积分一直扣着。v1 按规范不写定时清理（§4），限频代码 6 分钟后不再把它算进并发（`core/jobs/rate-limit.ts` 的 `RUNNING_STALE_MS`），但积分不会自动退回，后台也看不到。
4. **付了款没到账**：只能用 `admin_adjust_credits` 手动补。它只加积分，不会写 `paid_until`、`subscriptions` 镜像、档位所需的入账流水和 `payments`，用户的档位和账号页会显示错，之后 Stripe 重发回调时也没法和手动那笔对上。
5. **成本只是标价估算**：`/admin/jobs` 的成本按分辨率 × high 质量标价算，不分模型、不分质量档，也不含输入图 token。换成中转或更贵的模型后，Owner 看不出毛利变化。
6. **失败原因太粗**：`error_code` 只有 `PROVIDER_FAILED`、`PROVIDER_TIMEOUT`、`CONTENT_REJECTED`、`OUTPUT_WRITE_FAILED`、`CONFIRM_FAILED` 几种（`core/jobs/generation-failure.ts`），分不出是额度用完、鉴权失败还是中转限流。
7. **防刷只有数据没有视图**：`profiles.signup_ip` 已经在记（`core/auth/signup-ip.ts`），但注册赠送没检查它，后台也看不到同 IP 的账号。每个新号的 6 个免费 credit 按 high 1K 标价约合 $0.21～0.24 的真实成本（3 张 × 输出 $0.053 + 输入图 $0.012～0.021 + 提示词约 $0.005）。
8. **审计不全**：`admin_audit_log` 只允许 `ban_user` / `unban_user` 两种动作；切换供应商只写 logger；模板、公告、需求审核没有操作记录。并且 `admin_audit_log.user_id` 外键是 `on delete cascade`，用户删号后这个人的封禁记录也一起没了。
9. **开关都在环境变量里**：切 Stripe / Waffo 通道（§6.3）要改 Vercel 环境变量再重新部署；出图供应商出事故时没有「先暂停出图」的开关。

---

## 2. 判断依据

1. **只做 Shotviva 有的业务**（§10）：照这个店的日常写，不照 Graylum 的页面清单写。
2. **守 AGENTS §5.1**：
   - 每个统计页一个 SQL 函数，一次往返算完；
   - 只在已有的 `created_at` 索引上做 ≤90 天的范围扫描，和 `admin_dashboard_stats` 一样（`p_days` 7～90）；
   - 新查询都写明命中哪个索引，列表一律按 `(created_at, id)` 游标分页；
   - 不新建「每个请求一行」的表，访问和漏斗留在 PostHog。
3. **钱的写操作不另起炉灶**：补入账、扣回、补偿都复用已有的幂等函数（`settle_checkout`、`admin_adjust_credits` 的 `p_idempotency_key`、`refund_job`），只是在后台加按钮，并约定固定的幂等键格式。
4. **v1 不做的事继续不做**：优惠券、自动退款、自动扣回、发信、定时任务（§6.2、§13）。下面凡是碰到这些的，都改成「后台提示 + Owner 手动点」。

### 2.1 Graylum staging 后台里借什么、不借什么

| Graylum 页面 | 借 / 不借 | 理由 |
|---|---|---|
| `costs`：美元成本和积分消耗分开看、高成本用户 TOP 10、调用日志 | **借思路**，进 B2 | Shotviva 同样需要把「积分」和「真实美元成本」分开，避免把积分误读成成本；TOP 10 用 `generation_jobs` 聚合，不建调用日志表 |
| `finance`：已付收入、预估毛利 | **借思路**，进 B2 | 收入用 T10 的 `payments` 实收（扣税、扣退款） |
| `users`：调积分对话框显示「调整后余额」、操作日志 | **借**，进 A2 和 B6 | 小改动，防手误 |
| `transactions`：全站积分流水总表 | 不借 | 全站流水无界增长；单用户流水已有，审计页（B6）覆盖管理员操作 |
| `settings`：维护模式、新用户赠送积分、主力模型等 | **只借「维护模式」**，进 B7 | 赠送额度、价格按建站规格 G3 只写在 `site.config.ts`；模型已由供应商页管 |
| `diagnostics`：一键跑全部功能测试 | 不借 | Sentry 告警 + LAUNCH §10 的 `launch:doctor` 已覆盖；后台只放 A6 的状态条 |
| `performance`：对话数、缓存命中率、响应时间 | 不借 | 是聊天产品的指标，Shotviva 没有对话和缓存；出图耗时 PostHog `generate` 事件里已有 `duration_ms` |
| `models`：每个模型的 token 单价编辑 | 不借编辑页 | 成本单价和积分下限是同一张代码常量表（§6.1），保存模板时靠它校验；放进数据库就和下限脱钩 |
| `packages`：积分套餐编辑 | 不借 | 9 个商品写死在 `site.config.ts` 和 Stripe lookup key（§6.2） |
| `tickets`、`founders`、`skills`、`publish-monitor`、`secrets`、`payment-notices`、`refunds` | 不借 | Shotviva 没有这些功能（§10 已点名）；密钥只在供应商页经 Vault 写入 |

---

## 3. 逐项说明

每项都按同一格式写：问题、做法、数据、大小 / 优先级 / 依赖，有风险的另加说明。

### A1 万能查找框（P0 · S）

- **问题**：客服时手里的线索不一定是账号邮箱。
- **做法**：用户页顶部的搜索框接受任意一种输入，按格式分流，一次往返：
  - 邮箱子串 → 现有 `admin_search_users`；
  - uuid → 先按用户 id 查 `profiles`，没有再按 job id 查 `generation_jobs`，跳到该用户详情并高亮这一单；
  - `cs_…` → `credit_ledger` 的幂等键 `purchase:cs_…`（`credit_ledger_idempotency_key_key` 唯一索引）；
  - `in_…` / `ch_…` / Waffo 订单号 → T10 的 `payments`（每种 id 都是唯一约束，自带索引）；
  - `sub_…` → `subscriptions` 主键。
- **数据**：新函数 `admin_lookup(p_query text)`，返回 `{ kind, user_id, job_id }`，只授权 `service_role`。不新建索引。
- **依赖**：`in_` / `ch_` / Waffo 号要等 T10（`payments`）；其余现在就能做。

### A2 用户详情补全（P0 · M）

- **问题**：处理一个用户的问题，现在要在用户页、订单页、Stripe 后台、Supabase Studio 之间来回切。
- **做法**：在现有详情页加五块，每块一个查询，都只读需要的列：
  1. **付款**：最近 10 笔，带实收、税、方式、状态、Stripe 链接（`payments`，新索引 `payments(user_id, created_at desc)`）；
  2. **订阅**：镜像行（已有索引 `subscriptions_user_id_idx`），加 `current_tier()` 的结果；
  3. **Graylum**：`partner_links` 主键 `(user_id, partner)` 取一行，显示已连接 / 已断开和时间；
  4. **同 IP**：`signup_ip` 和同 IP 的其他账号数，点开看列表（新索引 `profiles(signup_ip, created_at)`，和 A7 共用）；
  5. **需求**：本人需求条数和状态（已有 `template_requests_user_id_created_at_idx`）。
- 调积分对话框加「调整后余额」预览（借 Graylum）。
- **依赖**：付款块等 T10；其余现在能做。

### A3 后台查看作品（P0 · S）

- **问题**：不看图就没法判断投诉是模板问题、模型问题还是用户照片问题。
- **做法**：
  - 用户详情和出图记录里每一单都加「查看」，服务端签一个 5 分钟的 R2 GET 地址；
  - 成品给无水印原图；输入图只有 7 天内还在（`inputs/` 生命周期），过期就显示「已过期」；
  - 每次查看写一条审计 `view_work`（需要 B6 的表结构，至少先把 `action` 允许值和 `target_id` 列加上）。
- **前提**：隐私政策（`src/site/content/legal/privacy-*.ts`）现在没写「客服或安全需要时我们可能查看你的照片和成品」。付费作品默认私密，**上线前要先加这一句**（交给 T19 的后续或总控）。
- **数据**：没有新表；`admin_audit_log` 的改动见 B6。

### A4 卡住任务退回、单张补偿（P0 · S）

- **问题**：
  - 卡住的任务：Vercel 函数最长 300 秒，所以超过 10 分钟还是 `running` 的任务一定已经死了，但积分没退。
  - 补偿：现在只能手调积分，没有和具体哪一单关联，也可能补两次。
- **做法**：
  - 出图记录页加「卡住的任务」视图：`status = 'running' and created_at < now() - 10 min`。可以单个退回，也可以「全部退回」，调用已有的 `refund_job(job, 'STUCK_TIMEOUT')`，它是幂等的，已结算的单会报错不动。
  - 已成功的单加「补偿这一单」：调用 `admin_adjust_credits(user, credits_cost, '补偿 job <id>', credit_pool, 'comp:<job_id>')`。幂等键固定，同一单只能补一次；退回到这一单原来扣的池。
- **数据**：
  - 新部分索引 `generation_jobs(created_at) where status = 'running'`。这个索引很小，只含进行中的行；不建它，这个查询就得走全表时间索引。
  - 函数全部已有。
- **说明**：被手动退回的任务，如果供应商之后才返回结果，`confirm_job` 会因状态不对而失败，成品丢掉，积分已退。这对用户是公平的，在页面上写明即可。

### A5 按 Stripe id 重放入账（P0 · M）

- **问题**：回调失败、绕行密钥过期、预览地址填错这类事，最可能在上线头几天出现。用 `admin_adjust_credits` 手补会留下第 1.2 节第 4 条的错账。
- **做法**：后台输入一个 `cs_…`，服务端走下面几步：
  1. 用 Stripe API 取回 session，确认 `payment_status = 'paid'`，从 metadata 拿用户和商品；
  2. 和回调走**同一个函数**：`settle_checkout`（同一个 session id 当幂等键，回调后来到了也只入账一次）；
  3. 输入 `sub_…` 时，取回订阅后调用 T10 的 `sync_subscription`。

  页面先显示取回的内容和将要入账的积分，Owner 确认后才写，写完记一条审计 `replay_checkout`。
- **数据**：没有新表和新函数，属于 `core/billing/stripe/` 的一个服务端动作。
- **依赖**：T10 会把 `settle_checkout` 改成带金额和方式的新签名（PR #79），**在 T10 合并后做**，避免写两遍。Waffo 的重放等 T13。
- **测试**：属于支付代码，要照 AGENTS §7 第 2 条测试：重放和回调谁先到都只入账一次；session 未付款时拒绝。

### A6 概览「待处理」条（P0 · S）

- **问题**：Owner 每天打开后台，应该先看到要处理的事，而不是先看曲线。
- **做法**：概览页最上面一行计数，每个都能点进对应页面：
  - 卡住的任务（A4 的部分索引）；
  - 近 1 小时和 24 小时的失败率（`generation_jobs_created_at_id_idx` 的短范围）；
  - 待审需求（`template_requests_status_created_at_idx`）；
  - 待处理的退款 / 争议（B5，T10 之后）；
  - 最近一笔入账的时间：上线后如果几天都没有入账，可能是回调坏了（`credit_ledger_purchases_created_at_id_idx` 取 1 行）；
  - 当前在用的供应商和模型。
- **数据**：新函数 `admin_todo_counts()`，一次返回全部计数，每个计数都有索引撑着。

### A7 同 IP 注册排查（P0 · S + Owner 决定）

- **问题**：免费额度是真金白银（见 1.2 第 7 条），批量注册从上线第一天就可能出现。
- **做法**：
  - 用户页加一个「可疑注册」视图：近 24 小时 / 7 天里同一个 `signup_ip` 注册 ≥3 个账号的 IP，按账号数倒序；点开列出账号、各自免费积分用了多少，可以逐个封禁。批量封禁放 P1，先看真实情况。
  - 用户详情显示同 IP 账号（A2 第 4 块）。
- **数据**：新索引 `profiles(signup_ip, created_at)`；新函数 `admin_signup_ip_clusters(p_days)`，只扫描 `profiles_created_at_idx` 范围内的行再分组。
- **要 Owner 决定**：§7 已经写了「要加 IP 限制就在发放免费额度的 SQL 函数里查 `signup_ip` 24 小时内是否已发过，一行」。建议上线就开，但注意学校、公司和手机运营商的 NAT 会让多人共用一个 IP。折中做法：同 IP 24 小时内只给第一个账号发赠送，后面的账号照常能注册和付费，只是没有免费额度。这条是业务规则，不是后台功能，是否开启需要 Owner 拍板，再由总控写进 §7。

### B1 模板表现（P1 · M）

- **问题**：Owner 的核心工作是调模板，要知道哪个模板值得投入。
- **做法**：新页面「模板表现」（或者作为模板页的一个标签），每个模板一行，可以排序：
  - 出图数、成功率、`CONTENT_REJECTED` 比例（比例高说明提示词容易触发模型的安全拒绝）；
  - **重做率**：同一用户、同一模板、15 分钟内再出一张的比例，是「对结果不满意」最便宜的代理指标；
  - 免费池和付费池各占多少：免费池占比高、付费池占比低的模板，拉新有用但不带来付费；
  - 净消耗积分、估算成本（B2 / B3 的单价）、估算收入（付费池积分 × 近 90 天每个付费 credit 的实收单价，见 B2）；
  - 各分辨率占比；
  - 来自哪条需求（`template_requests.template_id` 反查）。
- **数据**：新函数 `admin_template_stats(p_days)`，在 `generation_jobs_created_at_id_idx` 的 ≤90 天范围内聚合。重做率用 `lag() over (partition by user_id, template_id order by created_at)`，在同一个范围内算，不另建表。模板名一次读 `templates`（只有几十行）。
- **不做**：下载率、分享率。这些在 PostHog 里看，页面上放一个跳到 PostHog 对应看板的链接。

### B2 毛利表：模型 × 分辨率 × 质量档（P1 · M）

- **问题**：§3.3 允许随时换供应商和模型，§6.1 的积分下限按 high 质量标价定。Owner 需要看到换了之后毛利还守不守得住 60%。
- **做法**：改造 `/admin/jobs` 现有的「按模型统计」，变成毛利表：
  - **成本**：有 B3 的真实 token 就按 token × 单价算，没有就退回按分辨率 × 质量档的标价估算，并标出「估算」；
  - **收入**：付费池净消耗积分 × **实收单价**。实收单价 = 近 90 天 `payments` 的（实收 − 税 − 已退款）÷ 同期发出的付费积分。T10 之前只能用标价，页面标明；
  - **免费池**：消耗单独列成「获客成本」，不算进毛利；
  - 低于 60% 的行标红。页面再写一句（§3.3 已有的提醒）：换更贵的模型前先请总控更新下限。
  - 借 Graylum：加「高成本用户 TOP 10」，从同一个范围按 `user_id` 聚合。
- **数据**：
  - 新函数 `admin_margin_stats(p_days)`；
  - 单价表从「只按分辨率」扩成「按模型 × 质量档 × 分辨率」，仍然是 `modules/image/generation-cost.ts` 里的代码常量，和 `credits-floor.ts` 放一起；
  - 质量档要从 `templates.quality` 关联（模板只有几十行）。
- **依赖**：实收单价要等 T10。

### B3 记录每单真实 token 用量（P1 · M）

- **问题**：现在的成本全是估算。输入图 token 是 LAUNCH §5 上线前手工测 20 张，之后就没有数据了。
- **做法**：OpenAI Images 接口的响应里带 `usage`（输入图 token、输入文字 token、输出 token）。适配器读出来，结算时写进 `generation_jobs`。中转地址不返回 `usage` 时写空，B2 自动退回估算。
- **数据**：`generation_jobs` 加 `usage_image_in`、`usage_text_in`、`usage_out` 三个可空整数列。这是 §4 字段表的改动，要先改规范（AGENTS §5「先设计、后迁移」）。三个整数不违反 §5.1 第 2 条（不存模型的原始返回）。
- **说明**：如果 Owner 想让积分下限在上线时就用真实数据定，可以把 B3 提到 P0，和 LAUNCH §5 的实测一起做。

### B4 失败分析（P1 · S）

- **问题**：失败率高时，要知道是哪个模型、哪个模板、哪类错误。
- **做法**：
  - 出图记录页加「失败分析」：按 `error_code` × 模型 × 模板分组的计数和占比，再加近 48 小时按小时的失败趋势；
  - `generation_jobs` 新增 `error_detail`（≤120 字符），只存供应商返回的 HTTP 状态和错误类型，例如 `429 rate_limit_exceeded`、`401 invalid_api_key`、`400 moderation_blocked`。不存错误正文、提示词或图片，日志打码规则照旧。
- **数据**：新函数 `admin_failure_stats(p_days)`；新列 `error_detail`（同样先改 §4）。

### B5 退款 / 争议待办与扣回积分（P1 · S）

- **问题**：§6.2 规定 `charge.refunded` 只记录、告警，由 Owner 手动扣回。没有清单的话，Owner 容易忘，或者扣两次。
- **做法**：订单页加「待处理」标签，列出 `payments.status` 为 `refunded` / `partially_refunded` / `disputed` 且还没扣回的付款：
  - 判断是否已扣回：查有没有幂等键为 `clawback:<charge_id>` 的流水，唯一索引一次查到；
  - 「扣回」按钮预填 min(该商品积分 × 退款比例, 当前付费余额)，调用 `admin_adjust_credits(..., 'paid', 'clawback:<charge_id>')`，同一笔付款只能扣一次；
  - 争议只提示，不建议扣（还没判）。
- **数据**：新部分索引 `payments(created_at) where status <> 'paid'`；函数都是已有的。
- **依赖**：T10。

### B6 审计日志扩展与查看页（P1 · M）

- **问题**：见 1.2 第 8 条。现在只有 Owner 一个管理员，但 `qa-admin` 测试账号（T24）也是管理员；以后 Owner 请人帮忙时也要能查。
- **做法**：
  - `admin_audit_log`：
    - 加 `actor_id`（谁做的）、`target_type`、`target_id`（text）、`details`（jsonb，≤1KB，只存改了哪些字段名，不存提示词全文）；
    - `user_id` 改为可空，外键改成 `on delete set null`，用户删号后审计记录还在（同时满足删号的隐私要求：不再关联到人）；
    - `action` 允许值加上 `view_work`、`refund_stuck_job`、`compensate_job`、`replay_checkout`、`clawback`、`switch_provider`、`save_template`、`publish_template`、`activate_announcement`、`review_request`、`revoke_partner_link`、`delete_account`、`change_setting`。
  - 每个后台写操作都在**它自己的那个 SQL 函数里**顺手写一行审计，不另起一次往返。
  - 新页面「操作记录」：按时间倒序，游标分页，可以按动作和目标筛选。`admin_adjust` 的积分流水按 §10「调积分只写积分流水」保留在流水表，在查看页里用 union 合并显示。
- **数据**：新函数 `admin_list_audit(p_cursor, p_action)`；新索引 `admin_audit_log(created_at desc, id desc)` 和部分索引 `credit_ledger(created_at desc, id desc) where kind = 'admin_adjust'`。
- **注意**：这是改已有表和多个已有函数，迁移要按 AGENTS §5 用 `alter` 和 `create or replace`，一张卡一次成型。

### B7 运行时开关 `system_settings`（P1 · M）

- **问题**：出事故时要改环境变量再重新部署，太慢。§15.6 已经预见到「以后真需要运行时开关，再加一个 `system_settings` 行」。
- **做法**：只放这几个键，代码里写死白名单，不做通用的键值编辑器：

  | 键 | 作用 | 取代 |
  |---|---|---|
  | `generation_paused` + 中英两版提示语 | 供应商故障或成本异常时暂停出图（网页和伙伴接口都停），工作台显示提示 | 无（现在没有办法） |
  | `signup_bonus_paused` | 遇到批量注册时临时停发免费额度 | 无 |
  | `payment_channel`（`stripe` / `waffo`） | 切换付款通道 | §6.3 的环境变量 |
  | `wishlist_posting_paused` | 垃圾需求太多时暂停发帖，墙照常能看 | §15.6 预留的那一行 |

  - 读取走 Next 缓存，打 `settings` 标签，改动后立即失效；
  - 写入用 `admin_set_setting(key, value)`，一个函数里完成校验并写审计。
- **依赖**：`payment_channel` 等 T13 合并后再挪；其他三个现在就能做。
- **不放进来的**：价格、免费额度、商品、积分下限（见第 4 节）。

### B8 Graylum 连接（P1 · S）

- **问题**：§14 的连接器上线后，Owner 需要知道它带来了多少用量和付费，并且能处理「帮我断开」或滥用。
- **做法**：
  - 概览加一块「Graylum」：已连接账号数、近 7 天新连接和断开数，Graylum 来源的出图数和积分（按 `source` 统计，已有数据）；
  - 用户详情显示连接状态（A2），加「替用户断开」，写 `revoked_at` 和审计；
  - 从 Graylum 来的充值转化不在数据库里算：PostHog 里 `paywall_view` 的 `trigger = 'graylum'` 和 utm 已经有了，页面放一个跳转链接。
- **数据**：新函数 `admin_partner_stats(p_days)`；`partner_links` 很小，按主键或扫描都可以，不加索引。

### B9 后台代删账号（P1 · S）

- **问题**：登录不了的用户发邮件要求删除数据（隐私法规），Owner 现在只能去 Studio 删，R2 文件不会一起清。
- **做法**：
  - 用户详情加「删除账号」，复用账号页的删号逻辑（`auth.admin.deleteUser` + 按前缀清 R2 + 级联）；
  - 确认框要输入对方邮箱才能删；
  - 审计记录写 `delete_account`，B6 改完外键后，删号后记录仍保留。
- **依赖**：先做 B6，否则审计记录会被级联删掉。

### C1 作品审核队列（P2 · L，第 6～7 周，创作库开放前必须完成）

- **问题**：§9 第 5 条、AGENTS §6、LAUNCH §10：创作库开放前必须有内容审核。审核方案「到时再定，要指定具体服务」。
- **建议方案**（给总控写规范时参考）：
  - **自动初筛**：成功出图后用 OpenAI 的 omni-moderation（免费）扫成品，只对 `visibility = 'public'` 的作品扫。结果写成审核状态，不存原始返回。
  - **人工队列**：只看三类：自动标记的、用户举报的、每天随机抽样的少量作品。后台页显示缩略图（走 A3 的签名地址），可以通过或隐藏。
  - **隐藏**：免费作品按 §6.1 不能改私密，所以审核要单独加一个「隐藏」状态。隐藏的作品在 /g 返回 404（创作库规格：审核未通过或已下架的作品返回 404，不返回 200 + noindex），本人仍然能看到。
  - **举报**：/g 页面的「举报」按钮写入新表 `work_reports`（`job_id`、`reporter_id`、`reason` 枚举、`created_at`），同一个人对同一作品只能举报一次。
- **数据**：
  - `generation_jobs` 加 `moderation_status`（`unreviewed` / `auto_flagged` / `approved` / `hidden`）和 `moderated_at`；
  - 新表 `work_reports`；
  - 部分索引 `generation_jobs(created_at) where visibility = 'public' and moderation_status in ('auto_flagged', 'unreviewed')`。
- **依赖**：创作库卡（还没编号）、审核方案的规范。现在不要做。

### C2 需求 → 模板闭环（P2 · S）

- 需求审核页给 `live` 的需求加「用它建模板草稿」：只带入描述作为备注。**不带参考图**：参考图是用户上传的，没有拿它当封面的授权。
- 模板表现（B1）里显示「来自需求，N 票」，以及上线后 30 天的使用量、投过票的人里有多少回来用了这个模板。后者用 `template_request_votes` 主键加 `generation_jobs_user_id_created_at_idx` 按人查。
- 不做通知（§15.4）。

### C3 CSV 导出（P2 · S）

- **只导两样**：
  - 某月的付款（Stripe + Waffo 合并，含实收、税、退款、方式），给记账和报税用；
  - 按天的汇总（出图、积分、成本、收入）。
- 时间范围 ≤31 天，服务端按游标每批 500 行流式输出，每次导出写审计。
- **不导用户邮箱名单**：没有正当用途、风险大，真需要时在 Supabase Studio 导。
- Stripe 自己的付款导出已经很全；这一项的价值主要在于把 Waffo 和支付宝合到一起，所以放 P2。

### C4 批量补偿（P2 · S）

- 场景：供应商故障导致一段时间大面积失败。失败本身会自动退回积分；补偿是 Owner 愿意额外送一点。
- 做法：按「某时间段内有失败任务的用户」或粘贴一组用户 id（≤500）选人，调用新函数 `admin_bulk_grant(user_ids, amount, pool, campaign_key)`。一次事务、一次往返，幂等键 `campaign:<key>:<user_id>`。默认进免费池：送的积分不应该产出无水印的付费作品，除非 Owner 明确选付费池。
- **这不是优惠券**：v1 不做优惠券和促销码（§6.2「不做：首月优惠券」、§13）。对外的促销继续用公告横幅（`tone = 'promo'`）。

### C5 需求审核分页与用户搜索性能（P2 · S，观察项）

- `admin_list_template_requests()` 每个状态最多返回 500 条，没有分页。墙上的需求变多后，改成按状态加游标分页（已有 `template_requests_status_created_at_idx`）。
- `admin_search_users` 在 `admin.users_overview` 上做 `ilike '%q%'`，等于扫一遍 `auth.users`。几万用户以内没问题。超过约 5 万后，改成前缀匹配，或在 `profiles` 冗余一列小写邮箱再建索引（`auth` schema 不能自己加索引）。现在不用动。

---

## 4. 不建议做的

| 不做 | 理由 |
|---|---|
| 工单 / 客服系统 | 客服走 support@ 邮箱进飞书（§7）；一个人运营，工单系统只是多一个要看的地方。A1–A3 让回邮件时查得快就够了 |
| 后台里直接调 Stripe 退款 | §6.2、§10：退款在 Stripe / Waffo 后台做；Managed Payments 下 Link 还会不经我们直接退。后台只做记录和扣回（B5），不写会动钱的退款代码 |
| 优惠券、促销码、首单折扣 | v1 明确不做（§6.2、§13）；促销用公告横幅。以后要做，先改规范，而且要先确认 Managed Payments 结账页支不支持 |
| 后台设管理员、角色管理 | §10：在 Studio 改 `profiles.role`。放进网页就多了一条提权路径，而这件事一年也做不了几次 |
| 把价格、免费额度、商品、积分下限搬进数据库设置 | 建站规格 G3：对外数字只写在 `site.config.ts`，营销页、FAQ、结构化数据都是静态生成的，从这里读；积分下限是保存模板时的服务端校验，不能被后台一个开关绕过 |
| 成本单价的后台编辑页 | 同上，它和积分下限是一张表，改动要经过代码审查 |
| Graylum 式「系统诊断」「性能监控」页 | Sentry 告警（§16.3）+ `launch:doctor`（LAUNCH §10）+ A6 状态条已经覆盖；性能页是聊天产品的指标 |
| 全站积分流水总表 | 行数无界增长，筛选条件多了就需要一堆索引（§5.1 第 3 条）；单用户流水 + 审计页够用 |
| 可按档位、余额筛选、排序的全量用户列表 | `current_tier` 是函数算出来的，按它筛就得全表算；运营上真正需要的是 A1（找某个人）、A7（找可疑的一群）、B2 的 TOP 10 |
| 后台给用户发邮件或站内通知 | v1 不写发信代码（§7、§15.4）；全站公告已有 |
| 在后台重做漏斗、留存、来源分析 | PostHog 已经有这些事件（§16.2），后台只放跳转链接；不建「每个请求一行」的表（§5.1 第 2 条） |
| Realtime 实时大屏 | §5.1 第 8 条不用 Realtime；后台手动刷新就够 |
| 多管理员权限分级 | 只有 Owner 一个人；B6 的 `actor_id` 已经能区分是谁做的 |
| 现在就做作品审核 | 创作库前 8 周不开（§9），作品目前只有本人能看到（`/api/files` 只给作品主人）；C1 放到第 6～7 周 |

---

## 5. 需要 Owner 或总控拍板的问题

1. **A7 的 IP 限制**：上线就开「同 IP 24 小时内只有第一个账号拿免费额度」吗？（建议开；这是业务规则，要写进 §7。）
2. **A3 的隐私政策**：同意在隐私政策里加「客服和安全需要时，我们可能查看你上传的照片和生成的图片，每次查看都有记录」吗？不加就不能做 A3。
3. **B3 提前到 P0**：要不要上线时就开始记录真实 token，让积分下限一上线就有持续数据？
4. **B7 的付款通道开关**：同意把 §6.3「通过环境变量指定当前用哪条通道」改成后台开关吗？环境变量可以留作兜底。
5. **封禁的范围**：现在封禁只拦出图（`reserve_credits`，Graylum 那边的出图也因此被拦）和需求墙。被封的用户还能登录、能付款，Graylum 连接也不会断开。要不要同时拦结账、自动断开 Graylum 连接？（建议拦结账，免得被封的人付款后再来要退款。）
6. **B6 的外键**：同意把 `admin_audit_log.user_id` 改成可空、外键改成 `on delete set null` 吗？这会改 T23 已合并的表。

---

## 6. 建议的拆卡和顺序

| 卡 | 内容 | 什么时候派 | 改不改库 |
|---|---|---|---|
| 后台-1 客服工具 | A1（先不含 T10 的 id）、A2（先不含付款块）、A3、A4、A7 | 现在可派，前提是第 5 节第 1、2 问已有答复 | 改：`admin_lookup`、`admin_signup_ip_clusters`、两个索引、审计 `action` 和 `target_id` 列（B6 的最小子集） |
| 后台-2 付款补救与待处理 | A5、A6，以及 A1 / A2 补上 T10 的部分 | T10 合并后 | 改：`admin_todo_counts`、`payments(user_id, created_at)` 索引 |
| 后台-3 经营数据 | B1、B2、B3、B4 | 上线后一周内（先有几天真实数据） | 改：三个统计函数、`generation_jobs` 加 4 列 |
| 后台-4 审计与开关 | B5、B6、B7、B9；B8 也可以放这里 | 上线后第一个月 | 改：`admin_audit_log` 改表、`system_settings`、若干函数 `create or replace` |
| 后台-5 创作库审核 | C1；C2–C5 视情况带上 | 创作库排期（第 6～7 周） | 改：审核状态列、`work_reports` |

后台-1 和后台-3 都会给 `generation_jobs` 加列或索引，也都会改 `supabase/schema.sql`。两张卡不要同时开工；后合并的一方 rebase 后重新生成快照（T20 的惯例）。

每张卡照 T23 的规则：遵守 AGENTS §5.1，PR 写明每个查询命中的索引，Advisor 不新增 WARN，后台文案中文、放 `copy.ts`；交互验收由 Codex 在预览站用 T24 的 `qa-admin` 身份做。
