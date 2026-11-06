# Shotviva 开发规范（AGENTS.md）

> 给所有写代码的 Agent 和人看的唯一执行规则 · v3 · 2026-11-05 按 `AUDIT2_fable.md` 和 Owner 拍板修订（v2：2026-11-04）
> 仓库建好后放在仓库根目录，`规范/` 和 `seo资料/` 一起移进仓库纳入 git。

## 1. 先读什么

动手前按顺序读：

1. `规范/ARCHITECTURE.md`：代码结构、模块边界、业务规则、v1 范围
2. `seo资料/Shotviva建站规格v2.md`：页面、SEO、GEO 规则
3. `seo资料/公开创作库seo方案.md`：/g、/tag、/gallery 的规则
4. `规范/DESIGN.md`：UI 规范
5. `规范/LAUNCH_CHECKLIST.md`：上线前逐条勾选
6. `规范/COLLABORATION.md`：Claude 和 Codex 的分工、四种协作模式、任务卡和验收流程

文件之间冲突时：SEO 问题以建站规格和创作库规格为准，代码结构和业务规则以 ARCHITECTURE.md 为准，拿不准就停下问 Owner。

## 2. 技术栈（锁定，不许私自换）

| 用途 | 选型 |
|---|---|
| 框架 | Next.js 16 App Router + React 19 + TypeScript strict |
| 渲染 | 营销页、模板页、标签页一律 SSG / ISR，源码可见正文（建站规格 R5） |
| 多语言 | next-intl：英文 `en`（默认，不带前缀）+ 简体中文 `zh`（前缀 `/zh`），**v1 上线两种都要有**（Owner 2026-11-06），规则见 ARCHITECTURE §17 |
| 样式和组件 | Tailwind CSS v4 + shadcn/ui（new-york）；Magic UI 可选，只在 impeccable 设计方向需要时引入 |
| 数据库和登录 | Supabase（Postgres + Auth），所有表开 RLS |
| 存储 | Cloudflare R2（S3 协议） |
| 支付 | Stripe Checkout（托管页）+ Waffo 托管结账页，v1 都接 |
| 发信 | Resend，v1 只作为 Supabase Auth 的 SMTP，不写发信代码 |
| 人机验证 | hCaptcha（经 Supabase Auth 校验） |
| 限频 | Vercel Firewall 限频规则（Pro 自带，不另加服务） |
| 监控和分析 | Sentry、PostHog（cookieless 模式） |
| 部署 | Vercel Pro |
| 包管理 | pnpm（版本写在 `packageManager` 字段） |

参考 Graylum 代码时，一律看 `Crnobog9527/GraylumAI_vercel` 的 **staging 分支**，不看 main。

## 3. 目录和边界

按 ARCHITECTURE.md 第 1 节的 `core / modules / site / app` 四层放代码。硬规则：

- `core` 不能 import `modules` 和 `site`；模块之间不能互相 import。用 ESLint `no-restricted-imports` 强制检查。
- `app/` 下的路由文件只做组装：取数据、拼组件。业务逻辑放进 `core` 或 `modules`。
- 品牌名、价格、免费额度等对外数字只从 `site.config.ts` 读。
- 不写「以后可能用到」的代码，不建空目录。视频模块 v1 只有接口类型。
- 做之前先看 ARCHITECTURE.md 第 13 节：不在 v1 范围里的功能不做。

## 3.1 文件拆分（硬规则，CI 检查）

| 对象 | 上限 | 超过怎么办 |
|---|---|---|
| 任何 `.ts` / `.tsx` 文件 | **300 行**（不含空行和注释） | 按职责拆成多个文件 |
| 普通函数 | **60 行** | 抽子函数 |
| React 组件 | **120 行**（JSX 行数多，单独放宽） | 抽子组件 |
| 单个组件的 props | 8 个（审查时看，不进 CI） | 拆组件，或把相关参数合成一个对象 |
| 单个 SQL 迁移文件 | 一件事 | 一个迁移只改一类东西，不混写 |

拆分方式：

- **一个文件只做一件事**：一个组件一个文件；数据请求、状态、界面分开放。
- **组件按「容器 + 展示」拆**：容器负责取数据和处理事件，展示组件只接收 props 渲染。展示组件不准直接调接口。
- **逻辑放进 hook 或纯函数**：组件里超过 10 行的计算或副作用，抽成 `use-xxx.ts` 或 `xxx.ts`。纯函数要能单独测试。
- **一个功能一个文件夹**，结构统一：

  ```
  modules/image/workspace/
    image-workspace.tsx        容器
    upload-panel.tsx           展示
    copy-fields.tsx            展示
    use-generation-job.ts      状态与请求
    generation-schema.ts       zod 校验
    index.ts                   只导出对外用的东西
  ```

- **对外只通过 `index.ts` 暴露**，其他文件夹不准深层 import 别人的内部文件。
- 路由文件（`page.tsx`、`route.ts`）不超过 80 行，只做组装和调用。
- 项目是新建的，从底座拷文件时只拷 ARCHITECTURE.md 第 11 节列出的文件，拷进来就要符合本节规则。底座的超长文件不拷、不拆。

自动检查（CI 失败级）：ESLint `max-lines`（300，跳过空行和注释）、`max-lines-per-function`（普通函数 60，`.tsx` 组件 120）、`complexity`（10）。生成的文件（数据库类型、迁移快照）加入忽略名单。

## 4. TypeScript 和代码写法

- `strict: true`，禁止 `any`；确实不知道类型时用 `unknown` 再收窄。
- 所有外部输入都用 zod 校验：请求体、查询参数、回调内容、环境变量。
- 环境变量统一在 `core/env.ts` 里用 zod 解析，其他地方不准直接读 `process.env`。
- 密钥只能在服务端用。服务端模块顶部加 `import 'server-only'`。`NEXT_PUBLIC_` 开头的变量里不能放任何密钥。
- 不准用 `console.log`，统一用 `core/logger`，它会自动打码邮箱、token、密钥。
- 错误统一用错误码：`{ code: 'CREDITS_INSUFFICIENT', message }`，错误码列表放在 `core/errors.ts`。给用户看的提示和日志分开写。
- 命名：文件用 kebab-case，组件用 PascalCase，函数和变量用 camelCase，数据库表和字段用 snake_case。
- 注释写「为什么这样做」，不写「做了什么」。

## 5. 数据库

- 所有改动都写成迁移文件，放在 `supabase/migrations/`，文件名带序号，例如 `0007_generation_jobs.sql`。禁止在后台手改表结构。
- **迁移只能由工具执行，不准人手贴 SQL**（Owner 2026-11-05，吸取 Graylum 467 个迁移、靠事后台账倒推执行情况的教训）：
  - 预览库：`main` 每次合并后，CI 自动执行 `supabase db push`。
  - 生产库：只通过 GitHub Actions 手动触发的工作流执行，工作流挂 `production` environment，必须 Owner 在 GitHub 上点批准。
  - 禁止任何人（包括总控和开发窗口）用 Supabase 后台、SQL 编辑器、MCP 工具或脚本手动执行迁移、改表、改函数。排查问题只读不写。**例外：Owner 的运营数据修改**（如把某个账号的 `role` 改成 `admin`、在 Studio 修正一行业务数据、调用 `admin_adjust_credits` / `admin_ban_user`）不是迁移，可以在 Supabase 后台做。
- CI 拦截修改或删除已合并迁移文件的 PR（基线压缩需 Owner 同意后在 PR 标题加 `[baseline]` 才放行）。
- **已合并的迁移文件只加不改。** 要改一个函数或表，就写一个新迁移。
- **先设计、后迁移**：任何表、字段、SQL 函数的新增或改动，先改 ARCHITECTURE.md 里对应的数据定义（字段表、函数规则），规范合并后才写迁移。不准边写代码边试着加字段、改函数。
- **一张卡一次成型**：一个 PR 里的迁移就是这张卡的最终设计。PR 合并前发现要改，直接改这个 PR 里的迁移文件，不准再追加「修上一个迁移」的补丁迁移。同一张卡里不准出现「先建再删」「先加再改」。
- **改函数用 `create or replace`，改表用 `alter`**，不准把已有函数删掉重建（签名必须变的除外，PR 里写明原因）。
- **总控审查必查**：迁移是否和 ARCHITECTURE 的数据定义一致；是否在修补刚合并不久的迁移（是的话说明当初的设计漏了什么，并补进规范）；`supabase/schema.sql` 的改动是否只有本卡该有的内容。
- **基线**：生产上线前，全部迁移一次性压成按业务分组的基线文件（每个文件直接写成最终样子，没有「删了重建」）。上线后每完成一个阶段，经 Owner 同意可再压一次（`supabase migration squash`）。
- **`supabase/schema.sql` 是当前数据库结构的唯一可读快照**：由脚本从本地库导出，和迁移一起提交。迁移改了、快照没更新，CI 失败。想知道一张表或一个函数现在长什么样，只看这个文件。
- **漂移检查**：CI 定时比对预览库已执行的迁移和仓库里的迁移，多了少了都报警。
- 每张表必须开 RLS，并写清楚谁能读写。私有表（`template_prompts`、积分流水、订单）拒绝所有客户端访问。
- **积分和订单只能通过 SQL 函数修改**，函数里完成余额判断、写流水和幂等检查。服务端用 service role 调用，前端不能调用。
- 涉及钱的写操作必须有幂等键：生成任务按任务 id，支付回调按事件 id 和订单 id。
- 种子数据里不准出现真实提示词，提示词从不进 git 的本地文件导入。

### 5.1 读写效率（Owner 2026-11-06：不重蹈 Graylum 的覆辙，一开始就用最省的读写方式）

Graylum 踩过的坑：
- 手工执行的迁移（已由上面的规则解决）；
- 权限判断写成层层嵌套、逐行递归的 SQL 函数，100 条记录的视图要 23 秒；
- 长文本塞进数据库；
- 后台按条件筛选却没有对应索引。

Shotviva 的写法：

1. **一个业务动作只往返数据库一次。** 写操作走一个 SQL 函数，在一个事务里做完。不在应用代码里先读、再判断、再写。钱和积分已经这样做，其他写操作也一样。
2. **大内容不进数据库。** 图片和文件只存 R2 的 key。不存 base64，不存模型返回的原始内容，不存请求日志。提示词只放在 `template_prompts`。访问统计交给 PostHog，不建「每个请求写一行」的表。
3. **每个查询都要有索引撑着。** 新增或修改查询的 PR 要写明命中哪个索引（例如 `generation_jobs(user_id, created_at)`），必要时附 `EXPLAIN`。不加没有对应查询的「以防万一」索引。
4. **列表一律分页。** 按 `(created_at, id)` 游标取一页（默认 30 条），不一次读出全部。
5. **只选需要的列。** 不写 `select *`，大 jsonb 字段只在详情页读。
6. **公共数据走缓存。** 模板、商品、在用供应商用 Next 缓存加标签失效，不每个请求都查库。
7. **权限保持扁平。** RLS 只写 `user_id = auth.uid()`、角色判断这类单层条件。不写递归函数，不写互相调用的权限函数链。需要复杂判断时，在一个 plpgsql 函数里一次查完。
8. **不用 Realtime 订阅。** 任务状态只在任务进行中轮询：间隔不低于 3 秒，页面不可见时停止，任务结束就停。
9. **服务端只用 supabase-js（HTTP / PostgREST）访问数据库。** 不在 Serverless 函数里直连 Postgres，以免连接数耗尽。
10. **每张改库的卡合并前，在预览库跑一遍 Supabase Advisor**（Performance + Security）。PR 里写明没有新增 WARN 级别的问题。INFO 级别里「开了 RLS 但没有 policy」是私有表的有意设计，可以忽略。

## 6. 安全

- 所有接口默认需要登录。公开接口要在路由文件顶部注释说明为什么公开。**唯一例外**：`/api/partner/*` 用伙伴密钥 + `X-Shotviva-Account` 鉴权，不走用户会话（ARCHITECTURE.md 第 14.3 节）；预览密钥在生产无效。
- **任何 API 路由不得接收或返回图片字节**（Vercel 函数 4.5MB 上限）。上传走浏览器压缩 + 预签名直传 R2，出图结果写 R2 后只返回 key 或签名地址（ARCHITECTURE.md 第 8 节）。
- 不开全站跨域：删除底座 `vercel.json` 里 `/api/*` 的 `Access-Control-Allow-Origin: *`。R2 桶的 CORS 只放行站点域名的 PUT（直传）和 GET（付费作品经 302 跳到签名地址后，分享按钮要在浏览器里读图；T31，2026-11-06）。
- 不准出现底座里那种调试接口和公开出图接口（`/api/debug/*`、`/api/v1`）。
- 生成接口用 Vercel Firewall 按 IP 限频，再在代码里按账号限频；伙伴接口复用按账号限频。
- 支付回调先验签，再按事件 id 去重；验签失败返回 400，临时故障返回 500 让对方重试。
- 上传文件：浏览器端校验类型和大小（≤20MB）并压缩重编码（EXIF 随之丢失）；生成前服务端 HEAD 校验对象大小和类型。**服务端不转 HEIC**，`accept` 里不列 heic。
- 创作库开放（第 8 周）前必须先上线内容审核，见 ARCHITECTURE.md 第 9 节。

## 7. 测试

用 Vitest。以下代码没有测试不许合并：

1. 积分的预扣、确认、退回，包括并发连点和重复结算；池的选择：有付费积分先扣付费池且整单不拆，付费池不够才扣免费池，作品 `credit_pool` 与实际扣的池一致，退回退到原池
2. 支付回调（Stripe、Waffo 各一套）：重复事件、乱序事件、验签失败；Stripe 另加：同一 `invoice.paid` 重发只发一次积分、非 `subscription_cycle` 的发票不发、`subscription.deleted` 只改镜像表不动 `paid_until`、`charge.refunded` 只记录不扣积分
3. 生成任务：成功、失败、超时都能正确结算，失败一定退回积分；扣的数等于模板在所选分辨率的 `credits_cost`，非法分辨率 422；后台保存低于下限的 credit 数被拒绝
4. `paid_until` 的叠加与到期：连续购买累加、订阅续费延到本期 `period_end`、续费失败不延；水印和可见性只看作品的 `credit_pool`，与 `paid_until` 无关（免费作品在用户付费后仍带水印）
5. 模块开关：关掉的模块路由返回 404、不进 sitemap
6. 创作库的 noindex 和 sitemap 测试，在开放创作库的那个 PR 里补上
7. 伙伴接口：code 用一次即废、重复 `Idempotency-Key` 不重复扣费、撤销后 401、`return_to` 非白名单拒绝
8. 上传：HEAD 校验对 >20MB 和改后缀的对象返回 422 并删除对象

涉及数据库函数的测试连本地 Supabase（`supabase start`）跑，不要用 mock 冒充数据库。CI 用 `supabase/setup-cli` action + `supabase start` 起库，第一个 PR（仓库骨架）就把 workflow 建好。

**本地 Docker 用完就收（Owner 2026-11-06）。** 本地 Supabase 和其他 Docker 容器只在测试时开着：
- 一轮本地测试跑完、短时间内不再用，就停掉自己的栈（`supabase stop --no-backup`，或停掉并删除自己起的容器）。
- 任务收尾（PR 合并或交接）时，确认本卡起过的容器、网络和卷都已删除，并在交接笔记里写一句「本地 Docker 已清理」。
- 只动自己这张卡的栈（容器名带本卡编号，如 `shotviva-t25`），不碰别的窗口正在用的，也不碰 Graylum 的容器。
- 本机 Docker 卡死、命令不返回时，停下来告诉总控，由总控请 Owner 处理，不要反复重试。

## 8. Git 和发布

- `main` 就是生产环境。不准直接推 main，所有改动走分支和 PR。
- 分支命名：`feat/xxx`、`fix/xxx`、`chore/xxx`。
- 提交信息用 Conventional Commits，英文写。
- 每个 PR 必须通过 CI：lint、类型检查、测试、构建。PR 描述写清楚改了什么、怎么验证、是否涉及数据库迁移或支付。
- Vercel 预览环境连测试用的 Supabase 项目、Stripe 测试模式、Waffo 沙盒，不碰生产数据。
- 涉及支付、积分、登录的 PR，合并前要在预览环境用测试卡跑通一次，并把结果写进 PR。
- 生产环境的数据库迁移、支付配置改动、密钥轮换，必须先经 Owner 同意。

## 9. 页面和 SEO

- 按建站规格 R1~R12、G1~G13 和创作库规格 U1~U12 执行，不在这里重复。
- 新建任何可收录页面前，先确认它在对应语言的主词表里：英文页看 `seo资料/Shotviva 页面与主词映射（美国口径）.csv`，`/zh` 页看 `seo资料/Shotviva 页面与主词映射（中文口径）.csv`（T22 产出；每种语言以各自的 CSV 为唯一来源）；不在表里的页面一律 `noindex` 或不建。
- **用户能看到的文字一律不写死在组件里**：界面文字走 next-intl 的 `site/messages/{en,zh}.json`，营销页 / 法律页正文按语言放在 `site/content/` 下（后台页面例外：只用中文，文案放在功能目录的 `copy.ts`，见 DESIGN §7）；新增或修改界面文字的 PR 必须同时给出 en 和 zh（T21 合并后生效，ARCHITECTURE §17）。
- SEO 页面内容按 ARCHITECTURE.md 第 12 节的固定结构写。
- noindex 由全局配置统一控制，禁止逐页手写。预上线期全站关闭收录由 `SITE_INDEXING` 开关控制（ARCHITECTURE §12.0）。

## 10. 什么时候必须停下问 Owner

- 要改技术栈，或要新增第三方服务
- 要改价格、免费额度、对外数字
- 要新增可收录的页面或标签
- 发现规范之间互相冲突
- 任何生产环境的不可逆操作

## 11. 改规范

- 规范只有总控能改（2026-11-05 的 v3 修订由 Owner 直接授权审计窗口执行，是一次性例外）。仓库建好后，规范改动单独开 PR，标题前缀 `[spec]`，不和代码改动混在一起。
- 执行方发现规范有问题，在任务卡里提出来，不自己改。
