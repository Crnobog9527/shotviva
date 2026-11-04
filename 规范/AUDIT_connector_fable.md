# Shotviva × Graylum 连接器开发文档 审计（Fable，2026-11-05）

> 审计对象：Graylum 总控起草的《Shotviva × Graylum 连接器开发文档 v1》。三个问题：有没有过度工程、是不是最短路径、有没有违反第一性原理。只提意见，不改原文。

## 1. 结论

**这份文档把一个「同一家公司的两个产品互相调一下」的需求，写成了对外开放平台的规格**：自建 OAuth 2.1 授权服务器、远程 MCP 服务、`/v1` 版本化公开 API + OpenAPI 3.1 + 契约测试、异步任务 + 签名 webhook + 24 小时重试 + 取消、带故障注入的沙盒、双语错误文案、按客户端限流和指标、密钥轮换、授权应用管理页。按我的估算是 **19～27 个开发日**，比 Shotviva 自己的 MVP 还大，而且文档建议 Shotviva「现在到 11-15」先做这个——也就是让一个还没验证有没有人付费的产品，把头两三周花在给另一个产品当 API 平台上。这直接违反 Shotviva 规范第 0 条「MVP 验证付费」。

更根本的问题在产品层：文档里的 `generate_image(prompt, model, size, n, reference_images)` 是一个**通用文生图 API**，而 Shotviva 的产品是「手机实拍图 + 模板 + 文案」。Graylum 用户（做视频的人）要的是封面图，不是餐饮菜品模板。两边没对上，所以这份文档在为一个 Shotviva 并不存在的产品写接口。这一点不先由 Owner 拍板，后面所有接口都会返工。

Owner 原话的实际需求只有三句：Graylum 里能出图、额度归 Shotviva、用完跳去充值。**最短路径是 3～4 天**：一把连接密钥 + 三个同步接口。

## 2. 第一性原理检查

| 文档的假设 | 实际 | 后果 |
|---|---|---|
| Shotviva 要当「标准 OAuth 授权服务器」供任意第三方接入 | 唯一消费者是同一家公司的 Graylum；外部 AI 助手接入不在 Owner 原话里 | OAuth 服务器（授权页、PKCE、refresh 轮换、revoke、元数据、授权应用页、注册后回跳）是整份文档最贵的一块，而「同一公司」恰恰是可以不做 OAuth 的理由 |
| 出图是异步长任务，要 202 + webhook + 轮询 + 取消 | Shotviva 用 GPT-Image-2.5，同步返回，20～60 秒；Graylum 的工具调用本来就是等结果 | webhook 签名、重试、去重、取消、幂等存储全是为视频级任务准备的；Shotviva 规范里视频 v1 根本不做 |
| Graylum 的 CI 需要 Shotviva 提供能触发 402/422/超时/5xx/重复回调的沙盒 | Graylum 自己的测试 mock 一个 HTTP 接口就够（msw/nock），这是每个调外部 API 的项目都这么做的 | 让供应方给消费方写故障注入沙盒，是把 Graylum 的测试成本转嫁给 Shotviva |
| 接口要 OpenAPI 3.1 + 契约测试 + `/v1` 保留 6 个月 + 错误码只增不改 | 一个消费者，两边同一个 Owner、同一组 agent；改接口就是两个窗口同时改 | 一个共享的 TypeScript 类型文件（或 zod schema）就是契约 |
| 返回文案要中英双语 | 文档自己说 Graylum 只按 `code` 显示中性提示，不显示 Shotviva 的 message | `language` 参数和双语 message 一行都不用写 |
| 「连接器就是 MCP」 | MCP 对 Graylum→Shotviva 这条链路没有增加任何能力：Graylum 服务端的 `generate_image` 工具直接 HTTP 调 Shotviva 更短。MCP 的价值在 Claude/ChatGPT 等外部助手接入，那是另一个（也许值得做的）产品决定 | 多出 MCP 服务 + MCP 客户端 + MCP 授权规范三层；而 MCP 包装本身很薄（SDK 下 100 行左右），真正贵的是它要求的 OAuth |
| 内容审核在 Shotviva 侧，生成前查提示词、生成后查图、给 5 类原因码 | Shotviva 产品里用户不写提示词；审核需求是 Graylum 送来自由文本才产生的 | 这是通用文生图 API 才需要的审核管线。文档 §12.5 自己承认对 Owner 那句「连接的应用自己负责」的理解不确定，却据此把审核全放到 Shotviva |
| 用户注销 Graylum 要通知 Shotviva 解除关联；Shotviva 要有「已授权的应用」页和 unlink 接口 | 密钥模式下「解除」= 删掉一行密钥 | 两个接口 + 一个页面可以不存在 |

## 3. 逐项判定

| # | 文档章节 | 判定 | 建议 | 估算 |
|---|---|---|---|---|
| 1 | §13 时间安排「现在到 11-15 Shotviva 先做 OAuth/API/MCP/沙盒」 | **顺序错** | 连接器排在 Shotviva 自己上线并看到第一笔付费之后。它复用 Shotviva 的任务状态机和积分函数，提前做反而要先把那些做出来 | 否则 MVP 延后 3～4 周 |
| 2 | §4.3 `prompt / model / size / n / reference_images` | **产品不对齐，先问 Owner** | 二选一：A）Graylum 展示 Shotviva 模板，用户传一张图 + 文案（= Shotviva 现有产品，但 Graylum 用户未必要餐饮模板）；B）Shotviva 为 Graylum 开「自由提示词」模式（= Shotviva 变成 OpenAI 图片的计费代理，承担审核）。Owner 11-05 说「展示模板，没有模型选择」倾向 A，但文档主体按 B 写 | 不定就全返工 |
| 3 | §3 自建 OAuth 2.1 服务器 | **过度** | v1 用**连接密钥**：Shotviva 账号页一个按钮生成 `sv_live_…`，Graylum 加密保存。撤销 = 账号页删除。真要 OAuth 时用 Supabase Auth 自带的 OAuth 2.1 Server（2025 年已发布，正是为 MCP 场景做的），不要自己写 | 省 4～6 天 |
| 4 | §2/§4.5 远程 MCP 服务 + MCP 授权规范 | **推迟** | Graylum 直接 HTTP 调。MCP 作为 v1.5：用官方 SDK 把同样三个函数包一层、Bearer 用连接密钥，1～2 天；OAuth 元数据/动态注册等外部助手真要接时再加 | 省 3～4 天 |
| 5 | §4.3/§4.4 异步 202 + webhook 签名 + 24h 重试 + 取消 + `callback_url` | **过度** | 一个**同步** `POST /api/connector/generate`，等 GPT-Image 返回（Vercel Pro 函数可设 300s），直接返回签名图片地址和实际扣费。没有 webhook、轮询、取消。`Idempotency-Key` 可留：在 jobs 表上一个唯一列，5 行代码 | 省 3～4 天 |
| 6 | §9.2 带故障注入的沙盒 | **砍** | Graylum 自己 mock。Shotviva 预览环境 + 一个测试账号 + 一个「固定返回样图」的测试模板（模板表加 `is_test` 标志）足够联调 | 省 2～3 天 |
| 7 | §4 OpenAPI 3.1 + 契约测试 + `/v1` 6 个月保留 + §9.5 错误码政策 | **砍** | `packages/connector-types.ts`（或直接把 zod schema 文件拷到 Graylum）就是契约 | 省 2 天 |
| 8 | §7 两段式审核 + 5 类原因码 | 随 #2 决定 | 走 A 就复用 Shotviva 自己的上传校验，无额外审核；走 B 才需要 OpenAI moderation，返回 `content_rejected` 一个码即可 | 省 2～3 天 |
| 9 | §4.1 `/v1/me` + `/v1/quota`、§4.2 `/v1/catalog` | **保留，合并** | `GET /api/connector/account`（id、display_name、剩余额度、top_up_url）+ `GET /api/connector/templates`。两个读接口，各半天 | — |
| 10 | §5.3/§5.4 402 + `top_up_url` + `return_to` 白名单 + utm | **保留** | 便宜且直接服务 Owner 原话。`return_to` 只允许 Graylum 的两个域名 | 半天 |
| 11 | §5.1/§5.2 只成功扣费、幂等 | **保留** | Shotviva 规范 §4/§6 已经保证，连接器零额外代码 | 0 |
| 12 | §8 按客户端限流、并发上限、健康检查、503 降级；§9.6 按 OAuth 客户端的指标 | **砍到一条** | 复用 Shotviva 的按账号限频；`/api/connector/health` 返回 200 可以有。其余不做 | 省 1 天 |
| 13 | §9.8 双语 message、§4.3 `language` | **砍** | 只返回 `code` + 英文 message | 省半天 |
| 14 | §9.7 密钥轮换新旧并存、§4.4 webhook 密钥两把 | **砍**（随 #5 webhook 消失） | 连接密钥按用户撤销重生成即可 | — |
| 15 | §4.6 unlink 接口、§1 注销 Graylum 通知 Shotviva、§3 授权应用管理页 | **砍** | 密钥撤销即解除 | 省 1～2 天 |
| 16 | §6 保留期 ≤30 天、不训练、日志不记提示词、仅 HTTPS | **保留** | 与 Shotviva 规范一致（原图 7 天更严）。「第三方模型供应商选不用于训练」：OpenAI API 默认不用于训练，写进隐私政策即可 | 0 |
| 17 | §8 地区 us-west | **保留** | Shotviva 的 Vercel 函数区域设 sfo1/pdx1；底座 vercel.json 里现在是 hkg1/sin1/sfo1，要改 | 0 |
| 18 | §12「仍待确认：无」 vs §4.2 仍标「待 Owner 确认」、§12.5 自认理解不确定 | **文档自相矛盾** | 把 #2 和「审核谁负责」两条重新列为待确认 | — |
| 19 | §11 验收清单 16 条 | 随上面缩减 | 密钥 + 同步模式下只剩 7 条：连接、出图扣一次、重复 Key 不重复扣、402 跳转回跳、失败不扣、密钥撤销后 401、预览/生产隔离 | — |

## 4. 最短路径版本（建议替换 §3、§4、§9、§13）

**前提**：Shotviva 已上线，任务状态机、积分 SQL 函数、模板表、R2 签名地址都已存在（这些是 Shotviva MVP 本身的东西）。在此基础上：

Shotviva 侧（约 3～4 天）：
1. `connector_keys` 表：`user_id`、`key_hash`、`label`、`created_at`、`revoked_at`。账号页「连接 Graylum」按钮生成一次性显示的密钥。RLS：用户只能看自己的。
2. 三个路由，全部 `Authorization: Bearer <key>`，复用 `core`：
   - `GET /api/connector/account` → `{ account_id, display_name, credits_remaining, top_up_url }`
   - `GET /api/connector/templates` → 模板表的公开字段
   - `POST /api/connector/generate`（同步）→ 入参 `template_id`、`inputs`、`image`（URL 或 multipart）、可选 `Idempotency-Key`；出参 `{ job_id, image_url(签名, 24h), credits_charged }`；错误 `402 quota_exhausted{top_up_url}`、`422 invalid_input`、`500 generation_failed`（已退回）
3. `/pricing?from=graylum&return_to=…`：付款成功页按白名单回跳。
4. 一份 `connector-types.ts` 拷给 Graylum。

Graylum 侧：连接器页存密钥（加密）、`generate_image` 工具调上面接口、402 显示充值按钮。Graylum 测试用 mock。

v1.5（有外部助手需求时，1～2 天）：用 MCP SDK 把三个函数包成远程 MCP，Bearer 仍是连接密钥；需要 OAuth 时开 Supabase OAuth 2.1 Server。

## 5. 必须先问 Owner 的两件事

1. **Graylum 里出图到底是什么**：Shotviva 的餐饮模板（A），还是自由文字出封面（B）？B 意味着 Shotviva 要多一个和主产品无关的「自由提示词」模式和审核责任。
2. **先后顺序**：连接器是否排在 Shotviva 自己上线并看到付费信号之后？文档目前建议 Shotviva 先做连接器。
