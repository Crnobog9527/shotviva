# Shotviva 连接器：按 Graylum staging 源码推出的最短技术路径（Fable，2026-11-05）

> Owner 决定：Graylum 里出图既用 Shotviva 模板也支持自由文字；连接器随 Shotviva 一起做，Shotviva 上线就要能用。
> 依据：Graylum `staging`（a6a725b）源码实读；Shotviva 规范 ARCHITECTURE/AGENTS。本文替代连接器开发文档 v1 的 §2～§4、§9、§13。

## 1. Graylum 源码里决定路径的 6 个事实

| # | 事实 | 位置 | 对连接器的含义 |
|---|---|---|---|
| 1 | Agent 工具就是 `RuntimeTool { name, description, parameters(zod), execute(args, callId) → Promise<string> }`；每种会话的工具清单在 `turn_open` 前由 `planTurnTools` 决定，定义在整个会话内字节不变，不能用的工具标 `trimmed` 并给原因 | `packages/api/src/services/turn/agent/runner.ts:12`，`turn/tools/types.ts`，`turn/tools/chatTools.ts` | `generate_image` 就是再加一个 `RuntimeTool`，走现成的「offered / available / trimmed」机制。不需要任何新框架 |
| 2 | 免费工具（`read_source`、`load_skill`）**不写 `turn_calls` 行**，只有付费研究工具才写 begin/record | `turn/tools/meter.ts` 顶部注释（Owner 10-28） | Shotviva 出图在 Graylum 侧零积分 → 按免费工具接，没有计费改动。这正是 Owner「不搞内部结算」在代码里的落点 |
| 3 | Graylum **不存任何用户级外部令牌**。平台级密钥只有一个来源：管理员 Vault 的 `getPlatformSecret(slot)`；社媒连接的 OAuth token 在 Post for Me 那边，Graylum 的 `social_connections` 只存 `provider_account_id` 和状态 | `services/platformSecrets/*`，`services/publishMonitor/connect.ts`，`research/runtime/secrets.ts` | 要在 Graylum 存每个用户的 Shotviva access/refresh token（OAuth 方案）或 API key，得先建加密存储，这是全新基础设施。**最短路径是让 Graylum 一个用户密钥都不存** |
| 4 | 聊天正文的 Markdown 图片被渲染成 alt 文本，原因是「模型文本是数据」 | `apps/web/src/components/chat/MessageMarkdown.tsx:10,23` | 生成的图不能靠模型回一段 `![]()` 显示，必须走结构化事件 + 卡片（现成模式：`research_call` 事件 → `research-call-list.tsx`） |
| 5 | `/api/turn` 的 `maxDuration = 300`；工具在 turn 内同步执行；研究工具的供应商 fetch 自带超时、响应字节上限、禁止重定向 | `apps/web/src/app/api/turn/route.ts:20`，`research/agentKey.ts boundedFetch` | GPT-Image 20～60 秒同步返回完全放得下。不需要 202 + webhook + 轮询 |
| 6 | 已装 `@modelcontextprotocol/client` 2.2.0，但 Master Plan §8.1 明说「现有 AgentKey 客户端是特定契约，不等于任意 OAuth 服务改 URL 即用」；`agentKey.ts` 把端点写死、要求经过审查的 contract decoder | `packages/api/package.json`，`docs/launch/Graylum_Master_Plan_v11.md:254`，`research/agentKey.ts:7` | 用 MCP 接 Shotviva 不省任何代码：还是要写新 adapter。一个 `fetch` 更短 |

另外两个事实：Graylum 的「成果夹」（`services/artifacts`）是 ≤20000 字的文本工作流产物，`library` 是文档上传，**没有图片存储管线**——图片留在 Shotviva 的 R2 里，Graylum 不转存。`membershipEntitlements.ts` 按 `profiles.membership_level` 读套餐，Pro/Gold 门槛直接复用。

## 2. 方案：跳转式一次性 code + 伙伴密钥，Graylum 只存一个账号 id

```
Graylum 连接器面板「连接 Shotviva」
  ──302──▶ shotviva.com/connect/graylum?state=<随机值，Graylum 存 cookie>
           用户在 Shotviva 登录或注册（没账号的在这里顺手注册），看到「允许 Graylum 用你的额度出图」→ 点允许
  ◀──302── graylum.com/api/connectors/shotviva/callback?code=<一次性 code，10 分钟>&state=<原值>
Graylum 服务器 校验 state ──POST /api/partner/link {code}（Authorization: Bearer <伙伴密钥>）──▶ Shotviva
                            ◀── { account_id, display_name, credits_remaining }
Graylum 写 profiles.shotviva_account_id = account_id（只存这一个 id，不存任何令牌）

对话里 AI 调 generate_image
Graylum 服务器 ──POST /api/partner/generate（伙伴密钥 + X-Shotviva-Account: <id> + Idempotency-Key: <callId>）──▶ Shotviva
                ◀── { job_id, image_url(签名 7 天), credits_charged, credits_remaining }   或 402 / 422 / 500
   Graylum 侧 120 秒超时 ──GET /api/partner/jobs/{job_id}──▶ 查一次状态（Shotviva 可能已完成并扣费）
Graylum 发 image_result 事件 → 聊天里一张卡片：图 + 「在 Shotviva 查看」+ 剩余额度
```

这是 OAuth 授权码流程的形，没有它的骨：没有 token 端点、PKCE、refresh、scope、客户端注册。code 只换一个账号 id，换完即作废。

> 2026-11-05 修订（Owner 追问后改的三处）：① 粘贴连接码改为跳转链接——后端不变，用户不用手动复制，没有 Shotviva 账号的人在跳转链路里直接注册；② 加 `GET /api/partner/jobs/{id}`——Graylum 侧超时断开后 Shotviva 可能仍完成并扣费，没有状态查询就会出现「扣了费但对话里显示失败」；③ 签名地址从 24 小时改为 7 天（R2 预签名上限），对话第二天打开图不裂，卡片永远带「在 Shotviva 查看」兜底。

为什么这比 OAuth / API key 短：
- **Graylum 一个用户密钥都不存**：伙伴密钥是一把平台级密钥，放进现成的管理员 Vault（`platformSecrets` 新增 slot `shotviva`），读法和 `postforme`、`tikhub` 一样。用户侧只存 `shotviva_account_id`，泄露了也调不了（没有伙伴密钥）。伙伴密钥本身泄露的后果是「能以任何已连接用户的身份花他的额度」，和「Graylum 数据库泄露导致所有用户 token 泄露」是同一量级，所以 Shotviva 侧按账号限频 + 密钥可轮换即可，不比 OAuth 差。
- **撤销 = 一行**：用户在 Shotviva 账号页点「断开 Graylum」→ `partner_links.revoked_at` 置值 → 下次调用 Shotviva 返回 `401 link_revoked` → Graylum 清掉那一列并提示重新连接。
- **身份由 Shotviva 校验**：伙伴密钥证明「是 Graylum 在调」，`X-Shotviva-Account` 必须在 `partner_links` 里有未撤销的记录，否则 401。这满足 Master Plan §8.1「用户/连接/目标对象必须由服务端校验」。
- **Idempotency-Key 免费拿**：Graylum 每次工具调用自带 `callId`，直接当幂等键；Shotviva `generation_jobs` 加一个 `(partner, idempotency_key)` 唯一列。

## 3. Shotviva 侧要做的（随 MVP 一起，约 3.5 天）

全部复用 ARCHITECTURE 已有的任务状态机、积分 SQL 函数、模板表、R2 签名地址。

| 项 | 内容 | 量 |
|---|---|---|
| 自由文字 = 一个内置模板 | `templates` 表里一条 `freeform`：字段定义只有 `prompt`（+ 可选参考图），`template_prompts` 里的提示词是直通。这样「模板」和「自由文字」在连接器和工作台里**是同一条代码路径**，`list_templates` 自然包含它。是否在 Shotviva 自己的前台展示 `freeform`，由 `templates.visible_in` 字段控制 | 半天 |
| `partner_links` 表 | `user_id`、`partner`('graylum')、`link_code`、`code_expires_at`、`linked_at`、`revoked_at`。RLS：用户只读自己的 | 半天 |
| 授权页 `/connect/graylum` + 账号页 | 授权页：未登录先走 Shotviva 自己的登录/注册，回来显示「允许 Graylum 用你的额度出图」一个按钮，点后生成 code 并 302 回 Graylum（回跳地址只允许 Graylum 的两个域名，`state` 原样带回）。账号页：「已连接 Graylum / 断开」 | 1 天 |
| 五个路由（`core/partner/`，全部校验伙伴密钥） | `POST /api/partner/link`（换 code → account）；`GET /api/partner/account`（额度 + `top_up_url`）；`GET /api/partner/templates`；`POST /api/partner/generate`（同步；入参 `template_id`、`inputs`、可选 `image` URL；出参见 §2；错误码 `quota_exhausted`(402, 带 `top_up_url`)、`link_revoked`(401)、`invalid_input`(422)、`content_rejected`(422，来自 OpenAI 自己的安全拒绝，不扣费)、`generation_failed`(500，已退回)）；`GET /api/partner/jobs/{id}`（状态 + 成功时的签名地址，给超时兜底用，只读 `generation_jobs`） | 1.5 天 |
| 充值回跳 | `/pricing?from=graylum&return_to=…`，`return_to` 只允许 Graylum 的两个域名 | 半天 |
| 类型文件 | `partner-types.ts`（zod schema + 推导类型）拷给 Graylum 当契约 | 0 |

不做：OAuth 服务器、MCP 服务、OpenAPI、webhook、取消、沙盒、双语文案、按客户端限流（复用按账号限频）、unlink 接口（断开按钮即是）、独立审核管线。

## 4. Graylum 侧要做的（11-15 之后，约 4 天）

| 项 | 落在哪 | 量 |
|---|---|---|
| Vault slot `shotviva` | `services/platformSecrets/slots.ts` 加一个 slot；读法同 `publishMonitor/secrets.ts` | 0.5 天 |
| `profiles.shotviva_account_id` + 连接器面板 + 回调路由 | 一条迁移；面板放在 Agent composer 里（plan-core §: 连接器不占一级导航）：「连接 Shotviva」按钮生成 `state` 存 httpOnly cookie 后 302 到 Shotviva 授权页；`/api/connectors/shotviva/callback` 校验 `state` → 用伙伴密钥调 `/link` → 存 id → 回到面板；面板显示剩余额度和「断开」（只清本列） | 1.5 天 |
| `generate_image` RuntimeTool | `turn/tools/` 新文件；`planTurnTools` 里：账号未连接或非 Pro/Gold → `trimmed`（复用 `TrimReason` 'disabled'，或加 'not_linked'，并写进 `note` 让模型告诉用户去连接）；`execute` 用有超时（120 秒）和字节上限的 fetch（照 `agentKey.ts boundedFetch` 的写法）调 `/generate`，`callId` 作 `Idempotency-Key`；超时则查一次 `/jobs/{id}`，仍未完成就把卡片置为「仍在生成，稍后到 Shotviva 查看」而不是「失败」；返回给模型的字符串只含 `job_id`、尺寸、剩余额度和「已显示给用户」，不含图片地址（模型不需要） | 1 天 |
| `image_result` 事件 + 卡片 | `shared/researchTurn.ts` 事件联合加一型；`sse.ts` 透传；`components/chat/` 一个卡片：图（签名地址 7 天内有效）、「在 Shotviva 查看 / 下载」（永久链接，图裂了也能点）、剩余额度；402 时卡片变成「额度用完，去 Shotviva 充值」按钮（`top_up_url` 已带 `return_to`） | 1 天 |
| 测试 | mock Shotviva HTTP（和研究工具的 `fixtureAdapter` 同法）：成功、402、401 撤销、422、超时后状态查询为 succeeded / running、`state` 不匹配拒绝 | 0.5 天 |

不做：图片转存到成果夹（没有图片存储管线，而且 Shotviva「我的作品」已永久保存）、自动刷新令牌（没有令牌）、注销时通知 Shotviva（用户在 Shotviva 侧自己断开；Graylum 注销只清本地那一列）。

## 5. 与连接器开发文档 v1 的对照

| v1 要求 | 本方案 | 原因 |
|---|---|---|
| OAuth 2.1 授权服务器 | 跳转式一次性 code + 伙伴密钥 | Graylum 没有用户令牌存储；同一公司两个产品不需要第三方授权协议。跳转体验和 OAuth 一样，后端只剩换 id 这一步 |
| 远程 MCP 服务 | 直接 HTTP | Graylum 的 MCP 客户端是 AgentKey 专用契约，接 Shotviva 仍要新写；外部助手接入以后再用 SDK 包一层 |
| 202 + webhook + 轮询 + 取消 | 同步 + 超时后查一次状态 | turn 有 300 秒，出图 20～60 秒。**未验证**：GPT-Image-2.5 的 p95 延迟要 Shotviva 工作台跑起来才有数；若常超 90 秒，Graylum 侧改成「立即返回 job_id + 卡片轮询 `/jobs/{id}`」，Shotviva 侧不用改 |
| 沙盒故障注入 | Graylum 自己 mock | 研究工具已经是这么测的 |
| 两段审核 + 5 类原因码 | OpenAI 自身拒绝 → `content_rejected` | 自由文字直通 OpenAI，它的安全系统就是审核 |
| OpenAPI + `/v1` 保留期 | 一个 zod 类型文件 | 一个消费者 |
| 图片进 Graylum 成果夹 | 留在 Shotviva | Graylum 没有图片存储 |

## 6. 验收（两边联调时逐条）

1. 跳转连接：已有账号 / 没有账号（链路里注册）两条都能回到 Graylum 并显示已连接；`state` 不匹配或 code 过期（10 分钟）/ 重用 → 拒绝；回跳地址不在白名单 → Shotviva 拒绝 302
2. 未连接 / 免费会员：`generate_image` 在 `opened` 事件里是 `trimmed`，模型提示去连接或升级，不调 Shotviva
3. 正常出图：卡片显示图和剩余额度；Shotviva 只扣一次；同一 `callId` 重发不重复扣
4. 额度用完：402 → 卡片按钮 → 充值后 `return_to` 回到原对话
5. Shotviva 侧断开 → Graylum 下次调用 401 → 列清空、提示重新连接
6. 出图失败：Shotviva 退回积分，Graylum 卡片显示失败
7. Graylum 侧超时但 Shotviva 随后成功：`/jobs/{id}` 查到 succeeded，卡片补上图，额度只扣一次；仍在 running 则卡片显示「仍在生成」并给 Shotviva 链接
8. 签名地址第 8 天失效后，卡片的「在 Shotviva 查看」仍可打开原图
9. 伙伴密钥错误 → 403；预览环境的密钥在生产无效
