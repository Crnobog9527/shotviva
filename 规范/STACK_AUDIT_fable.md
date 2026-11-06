# 技术栈审计（Fable，2026-11-05）

> 审计对象：AGENTS §2 锁定的技术栈 + 仓库 `main`（5d7ceba）里实际锁定的版本和配置。三个问题：是不是最优解、是不是最新稳定版、要不要调。版本数据全部来自本轮 `npm view` 和官方文档，不凭记忆。

## 1. 结论

**选型本身没有要换的。** Next 16 + Vercel、Supabase、R2、Stripe Checkout、Tailwind 4 + shadcn、Vitest、pnpm，每一项都是「这个场景下最省事的主流选择」，换任何一项都是为换而换。T0 落地的版本也基本是最新的：Next 16.4.5 是两天前发的 latest，Vitest 5.1、zod 4.6、next-intl 4.14、supabase-js 2.119 都是 latest。

**要调的是两类**：支付通道的写法（Stripe Managed Payments 不支持支付宝和微信；Graylum 已用「一个账户、按付款方式路由」解决，Shotviva 照搬即可，见 §3-A1），和五处版本钉子（Node 版本本地 24 / Vercel 会跑 26、Supabase CLI 钉在 6 月的旧版、pnpm 落后两个大版本、ESLint 和 TypeScript 还在上一个大版本）。版本这些加起来是一个 `chore` PR，半天。

## 2. 版本核对

| 包 | 仓库锁定 | npm latest（11-05） | 判定 |
|---|---|---|---|
| next | 16.4.5 | 16.4.5（2026-11-03） | ✓ 最新。16.0 于 2025-10-22 发布，已稳定一年 |
| react / react-dom | 19.3.0 | 19.3.1（10-14） | 补丁落后，顺手升 |
| typescript | ^5 → 5.9.3（2025-09） | **7.0.2**（2026-07-08）；6.0.3 为过渡版 | 见 §3-B3，升到 6.0.x，7 还不能全量用 |
| eslint | ^9 | **10.14.0** | eslint-config-next 16.4.5 peer `>=9`，typescript-eslint peer 含 `^10`，可升 |
| eslint-config-next | 16.4.5 | 16.4.5 | ✓ |
| tailwindcss / @tailwindcss/turbopack | ^4 → 4.3.4 | 4.3.4 | ✓ |
| next-intl | 4.14.9 | 4.14.9 | ✓ |
| @supabase/supabase-js / ssr | 2.119.0 / 0.12.7 | 2.119.0 / 0.12.7 | ✓ |
| zod | 4.6.7 | 4.6.7 | ✓ |
| vitest | 5.1.0 | 5.1.0（5.0 于 9 月发布） | ✓ |
| pg / @types/pg | 8.23.1 | 8.23.1 | ✓（只在 db 测试用） |
| pnpm（packageManager） | **10.34.5**（2026-07） | **12.16.1**（11 于 4 月、12 于 8 月发布） | 落后两个大版本，见 §3-B2 |
| Node | `.nvmrc` 24，`engines >=24` | Vercel 默认 **26.x**，可选 24.x / 22.x | **不一致**，见 §3-A2 |
| Supabase CLI（CI） | **2.107.0**（2026-06） | 3.0.0（11-02，官方标「experimental」）；v2.stable = 2.122.1 | 升到 2.122.1，见 §3-B1 |
| Postgres（supabase/config.toml） | 17 | Supabase 新项目默认 17 | ✓ |
| 未装、规范指定的 | — | sharp 0.35.5、stripe 23.1.0、@sentry/nextjs 11.10.0（peer next ^16 ✓）、posthog-js 1.446、vaul 1.1.2、@hcaptcha/react-hcaptcha 2.2.0、browser-image-compression 2.0.2、aws4fetch 1.0.20 | 到对应任务卡时装 latest 即可 |

## 3. 要调整的

### A1 · Stripe Managed Payments 不支持支付宝和微信（产品决定，Owner 拍板）

Stripe 官方文档 Managed Payments「Payment method availability」表列出的支付方式是：Cards、Apple Pay、Google Pay、Link、Klarna（US）、Cash App Pay（US）、Afterpay（US）、韩国卡与 Kakao/Naver/Samsung Pay、UPI（印度）、Pix（巴西）、Bancontact（比利时）。**没有 Alipay，没有 WeChat Pay。** 另外三条约束：顾客所在国限制里**中国在列**；结账页不支持自定义域名；顾客账单显示的是 `LINK.COM* SHOTVIVA`，顾客看到的商户是 Link，不是 Shotviva。

这和 ARCHITECTURE §6.2「卡、支付宝、微信都能付」字面冲突，但**不需要二选一**。Owner 指出 Graylum 已经解决了这个问题，我读了 staging 的实现（`packages/api/src/services/payments/methodRouting.ts`、`stripeCheckoutIntent.ts`、`docs/launch/evidence/stripe-managed-payments-20261012/README.md`）：

- **同一个 Stripe 账户，按付款方式路由，不是按浏览器语言或 IP。** `card`（国际卡 / Apple Pay / Google Pay）建 Checkout Session 时带 `managed_payments: { enabled: true }`；`wechat_pay` / `alipay` 建普通单笔 Session，`payment_method_types: ['alipay']` 或 `['wechat_pay']`（Graylum 当时的写法；Shotviva 用的 Stripe API 2026-09-30 已删除该参数，改用 `allowed_payment_method_types`，见 ARCHITECTURE §6.3）（微信加 `payment_method_options.wechat_pay.client = 'web'`）；`card_cn`（大陆卡订阅）走普通 Stripe 不开 MP。Graylum 文档原话：「服务端只认用户选的方式，不用 IP 强制」——前端把方式列出来让用户自己选，大陆用户自然选微信/支付宝。
- Graylum 2026-10-12 在 Stripe 沙盒实测：**MP 订阅和微信/支付宝单笔共用一个账户 PASS**；MP 结账页选国家为中国时 Stripe 报 "China is not currently supported"，所以大陆用户不能走 MP，这正是分流的原因。Owner 已为「微信/支付宝单笔由 Graylum 当卖家」咨询过税务。
- MP 要求每个商品带 AI 服务税码 `txcd_10105001`（Graylum 常量 `MANAGED_PAYMENTS_TAX_CODE`），Shotviva 的 `pass` / `pack` 同样要设。
- 正式环境的 MP 要等 Stripe 资格审核，测试模式里是即用的。

**Shotviva 照搬，而且比 Graylum 简单**：Shotviva 只有一次性商品，没有订阅，所以不需要 `card_cn` 这条路，也没有续费、宽限、测试时钟那一套。付费墙上两组按钮：「Card / Apple Pay / Google Pay」→ MP；「支付宝 / 微信」→ 普通单笔。代码差别只在建 Session 时的几个字段，回调处理完全相同（都看 `checkout.session.completed`，按 `metadata.orderId` 幂等发积分）。多出来的工作量不到半天。

按此改规范：ARCHITECTURE §6.3 改为「一个 Stripe 账户、按付款方式路由：卡走 Managed Payments，支付宝/微信走普通单笔；商品设税码 `txcd_10105001`」并删掉「尚未核实」；LAUNCH §1 账单描述改为「卡支付显示 `LINK.COM* SHOTVIVA`，钱包支付显示 SHOTVIVA」，§5 加「卡付款（MP）结账页有税、钱包付款无税」两条实测；DESIGN §4.5 付款方式按两组展示；TASKS T10 解除「等核实」。

**后记（同日下午）**：Owner 随后确认 Shotviva 要做订阅制——卡走 MP 订阅、钱包走单笔「一期会员」；Waffo 保留为单笔兜底，不砍。下面这段的「可省」建议未被采纳，保留作记录。

**顺带一个可省的点**：Waffo 在 ARCHITECTURE §6.3 里的唯一理由是「Stripe 新账户审核可能来不及，上线当天只有 Waffo 能收款」。Graylum 侧 Waffo 已冻结（PAY-WAFFO frozen，不再是任何方式的路由目标）。Shotviva 有一个更便宜的兜底：Stripe 账户本身通过后、MP 资格审核还没下来的那段时间，`card` 先不带 `managed_payments` 走普通模式（Shotviva 当卖家，MVP 量级的美国销售税敞口极小），审核通过后翻一个开关。这样 Waffo 那 3～4 天（第二套回调、沙盒、对账）可以不做。是否砍 Waffo 由 Owner 定；不砍也不影响上面的路由方案。

### A2 · Node 版本：本地和 CI 跑 24，Vercel 会跑 26

> **总控注（2026-11-05）**：Owner 决定统一到 **Node 26**（不是下面建议的 24），chore 卡已按 26 派出；若 `sharp` 等原生依赖在 26 上 CI 不过，再退回 24。另：T4 已用 `@aws-sdk/client-s3` 连 R2 且测试通过，v1 保留，不换 aws4fetch。

`package.json` 写的是 `"engines": { "node": ">=24" }`。Vercel 文档明确：开区间（如 `>=22.0.0`）映射到**最新 26.x**，而 Vercel 自 2026 年起新项目默认 26.x。`.nvmrc` 和 CI 是 24。结果是本地测过的二进制依赖（将来的 `sharp`）在线上跑另一个 Node 大版本。

**改法**：`"node": "24.x"`，和 `.nvmrc` 一致。Node 24 是当前 LTS，维护到 2028-04，Vercel 支持。等 Node 26 在 Vercel 上跑满几个月、`sharp` 等预编译包都稳定了，再一起升到 26（改三处：`.nvmrc`、`engines`、CI 自动跟 `.nvmrc`）。

### B1 · Supabase CLI 钉在 2.107.0

CI 钉的 2.107.0 是 6 月的版本。3.0.0 三天前刚发，官方标为 experimental 且有一批破坏性改动（`--yes` 语义、删除命令、容器命名）。**改法**：CI 改钉 `v2.stable`（当前 2.122.1）；2.122 起会对将被 v3 删除的命令发警告，正好用来提前清理；v3 等它去掉 experimental 再升。

### B2 · pnpm 10.34.5 → 12.x

pnpm 11（4 月）和 12（8 月，Rust 重写，官方说「pnpm 11 的命令、参数、配置、锁文件原样可用」）都已经发布，12.16.1 是 `latest`。项目才三天、锁文件 540 条，现在升成本最低。**改法**：`packageManager` 改 `pnpm@12.16.1`，`pnpm install` 重新生成锁文件，CI 的 `pnpm/action-setup@v4` 自动读 `packageManager`。注意 12 对 `pnpm-workspace.yaml` 里不认识的键会直接报错（目前没有 workspace 文件，无影响）。

### B3 · TypeScript：^5 → 6.0.x，7 先不全量用

TS 7.0（Go 重写，`tsc` 快 8～10 倍）已是 `latest`。但 eslint-config-next 16.4.5 依赖的 typescript-eslint 8.x peer 是 `typescript >=4.8.4 <6.1.0`，装 7 会 ERESOLVE；typescript-eslint 官方说等 TS 7.1 的 API。**改法**：`typescript` 改 `~6.0.3`（6.0 是官方的过渡版，把 7 里会删的选项提前报错，正好让项目从第一天就是 7-ready）。想要 7 的速度，加 `@typescript/native-preview` 跑 `typecheck`、ESLint 继续用 6——这是可选项，等 T0 之外的代码多了再决定。

### B4 · ESLint ^9 → ^10

eslint-config-next 16.4.5 的 peer 是 `eslint >=9`，typescript-eslint 的 peer 含 `^10`，没有阻碍。顺手升。

### B5 · react 19.3.0 → 19.3.1

补丁版本，顺手。

### C1 · R2 客户端用 `aws4fetch`，不用 `@aws-sdk/client-s3`

T4 还没派。R2 只需要四个操作：生成 presigned PUT、HEAD、GET、DELETE。`aws4fetch`（20KB，纯 fetch）全部能做；`@aws-sdk/client-s3` + `s3-request-presigner` 是几 MB 的依赖树，拖冷启动。底座 `r2-storage.ts` 用的是 AWS SDK，拷过来时换掉。写进 T4 卡。

### C2 · `tsconfig.target` ES2017 → ES2022

Next 脚手架默认值。目标浏览器是 iOS Safari 15+ / Chrome 近两年版本，ES2022 产物更小，`??=`、顶层 await 不用降级。随 B3 一起改，零风险。

### C3 · `cacheComponents: true`

Next 16 的 Cache Components（PPR 的正式版）已开。对营销页 SSG 没问题，但开发窗口要知道动态数据必须包 `Suspense` 或 `'use cache'`，否则 build 报错。在 AGENTS §2 渲染一行加一句「已开 cacheComponents，动态段用 Suspense 或 `use cache`」即可，不是问题，是提醒。

## 4. 不用动的（和为什么不换）

| 选型 | 可能的替代 | 为什么不换 |
|---|---|---|
| Next 16 + Vercel | Cloudflare Workers（OpenNext）、SvelteKit | 同步出图要 300 秒函数（Vercel Pro Fluid 支持）、`sharp` 水印、ISR——Workers 上每一项都要绕。Vercel 是最短路径 |
| Supabase（Postgres + Auth + RLS） | Neon + Better Auth、Clerk | 一个服务顶三个，SQL 函数做积分原子性正是需要的；Clerk 按 MAU 收费 |
| Cloudflare R2 | Supabase Storage、Vercel Blob | R2 出流免费；Supabase Storage 出流收费、Vercel Blob 更贵。图片站出流是主要成本 |
| Stripe Checkout（托管页）+ Waffo | Lemon Squeezy、Paddle（MoR） | Managed Payments 已经是 MoR；Waffo 补支付宝。再加第三家只增加回调数量 |
| Tailwind 4 + shadcn（new-york） | — | 和 Graylum 同栈，组件可拷 |
| next-intl（v1 只开 en） | 不装、等多语言再装 | 后装等于把所有页面的 slug 和 metadata 重做一遍；现在装只多一个 `request.ts` |
| Vitest 5 + 本地 Supabase | Jest、mock 数据库 | 积分和 RLS 的测试必须打真库 |
| ESLint 9/10 + eslint-config-next | Biome | 分层边界靠 `eslint-plugin-import` 的 `no-restricted-paths`，Biome 没有等价规则；Next 官方配置只有 ESLint 版 |
| pnpm | npm、bun | Vercel 原生支持、锁文件稳定、硬链接省盘；bun 作为运行时和 Next 16 的 Cache Components 还有边角 |
| hCaptcha（经 Supabase Auth） | Cloudflare Turnstile | Supabase 两个都支持，都免费，都一个 token；hCaptcha 和 Graylum 一致，不折腾 |
| Resend 只作 SMTP | — | v1 不写发信代码，SMTP 是最少集成 |
| Sentry + PostHog（cookieless） | Vercel Analytics | PostHog 事件漏斗是付费验证需要的，Vercel Analytics 只有页面级 |
| Vercel 区域 sfo1 | — | 已和伙伴接口文档一致 |

## 5. 动作清单

1. **Owner 确认 A1**：按 Graylum 的「一个 Stripe 账户、按付款方式路由」照搬（卡走 MP，支付宝/微信走普通单笔）；顺带决定 Waffo 是否还做。
2. **总控派一张 `chore` 卡**（半天，T0 的后续，不碰业务代码）：`engines.node = "24.x"`；`packageManager = pnpm@12.16.1` 并重生成锁文件；`typescript ~6.0.3`、`eslint ^10`、`react 19.3.1`；`tsconfig.target = ES2022`；CI 的 `supabase/setup-cli` 改 `version: v2.stable`；AGENTS §2 加 cacheComponents 提醒。CI 全绿即合并。
3. **T4 任务卡加一条**：R2 用 `aws4fetch`，不装 AWS SDK。
4. **规范按 A1 的结果改**：ARCHITECTURE §6.3、LAUNCH §1 / §5、DESIGN §4.5、TASKS T10 解除「等核实」；若砍 Waffo，再改 ARCHITECTURE §6.3、§2 `channels`、AGENTS §2、LAUNCH §1 / §5、TASKS T9。

## 6. 来源

- npm registry（`npm view … dist-tags / time / peerDependencies`，2026-11-05）
- Vercel《Supported Node.js versions》（last_updated 2026-02-27；列 26.x 默认、24.x、22.x；开区间映射到最新 26.x）：https://vercel.com/docs/functions/runtimes/node-js/node-js-versions
- Stripe《How Managed Payments works》Payment method availability 表、《Managed Payments eligibility》Restricted countries：https://docs.stripe.com/payments/managed-payments/how-it-works 、https://docs.stripe.com/payments/managed-payments/eligibility
- Supabase《Migrating to Supabase CLI v3》、CLI v3.0.0 release notes：https://supabase.com/docs/guides/local-development/cli/migrating-to-v3 、https://github.com/supabase/cli/releases/tag/v3.0.0
- pnpm 12.0 发布说明：https://pnpm.io/blog/releases/12.0
- typescript-eslint 对 TS 7 的支持状态（peer `<6.1.0`，等 TS 7.1）：https://ecorpit.com/typescript-7-migration-readiness-eslint-astro-blockers-2026/
