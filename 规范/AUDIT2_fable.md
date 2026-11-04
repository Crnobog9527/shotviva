# Shotviva 规范第二轮审计（Fable，2026-11-05）

> 审计对象：`规范/` 与 `seo资料/` 下 11-05 01:00 前后的全部文件（ARCHITECTURE v2、AGENTS v2、DESIGN、LAUNCH v2、COLLABORATION v2、PRICING_RESEARCH、建站规格 v2、主词表 CSV、创作库规格）。
> 四个问题：有没有更优解、是不是最短路径、还有没有过度工程、能不能开工。

## 1. 结论

**v2 已经是一份可以开工的工程规范，但不是一份可以开工的产品规范。** 第一轮提出的 9 条 A 级问题有 8 条被完整采纳（后台一页、同步出图、R2 生命周期、新建项目拷文件、§12 内容格式、impeccable 只评一次、模式 4 默认、`/templates` 不建），剩下的过度工程只有零星两三处（hCaptcha 双层、Magic UI、防刷），都是半天量级，不值得再争。

但 v2 之后出现了三类新问题：

1. **连接器没进规范。** Owner 11-05 决定「连接器随 Shotviva 一起做，上线就要用」，而 ARCHITECTURE v2 §13 v1 范围、LAUNCH、AGENTS §6「所有接口默认需要登录」都没有它。`CONNECTOR_shortest_path_fable.md` 还是一份建议，没有并入正文。这是现在最大的缺口。
2. **四个会返工的技术陷阱没有写进去**：Vercel 函数请求体 4.5MB 上限（手机照片 3～12MB，必须浏览器直传 R2）；Vercel 上的 `sharp` 不带 HEIC 解码（规范两处写「HEIC 转 JPEG」，按现在写法做不出来）；「30 天通行证 + 12 个月菜单包」隐含积分过期和付费身份窗口两套逻辑，ARCHITECTURE §6 的积分模型装不下；水印「怎么加、在哪加」没有定义。
3. **定价结构未定导致三件事做不了**：付费墙（impeccable 三个关键屏之一）、`/pricing` 页、首页 FAQ/成本表/JSON-LD 的文案。价格数字可以晚定，**SKU 结构必须现在定**（几个商品、各是什么形态），否则付费墙和积分表都没法写。

能开工的部分（约 70% 的工程量）和不能开工的部分见 §5。建议：先定 §4 的三个决定，总控同时写 `TASKS.md`，工程基础设施当天开工。

## 2. 第一轮 32 条的采纳情况

| 结果 | 条目 |
|---|---|
| 已采纳 | #1 后台一页、#2 Stripe Checkout（Waffo 改为同接但不自动切换，有正当理由，见 §3-9）、#3 保留期、#4 价格口径（改为「待定 + 唯一来源」）、#5 v1 范围、#6 底座改造（改为新建）、#7 大文件删不拆、#8 内容格式、#9 impeccable、#10 同步任务、#11 defineModule 三字段、#12 行数规则、#13 `ugc_works` 合并、#14 审核推迟、#15 邮件、#16 Upstash/一次性邮箱、#17 竖切、#18/#18a 模式 4 与 §2.1 闭环、#19 CSV 唯一来源、#20 R3 示例、#21 `/templates`、#22 G7 排期、#24 创作库引用、#25 §7、#26 Cookie、#27 价格位置、#28 漏项、#29 测试推迟、#30 Tailwind、#31 R12、#32 `[spec]` PR |
| 部分采纳 | #23 模板数：ARCHITECTURE §5 和 LAUNCH 改成 6～8，**建站规格 §8 第 1 周仍写 10～15**（见 §3-13） |
| 未采纳 | 无 |

## 3. 这一轮的发现（按影响排序）

| # | 级 | 文件 · 章节 | 问题 | 建议 | 估算 |
|---|---|---|---|---|---|
| 1 | A | ARCHITECTURE §13、LAUNCH、AGENTS §6 | 连接器不在 v1 范围内，但 Owner 11-05 已定「上线就要用」。缺：`partner_links` 表、`/connect/graylum` 授权页、`core/partner/` 五个路由、`freeform` 直通模板、`templates.visible_in` 字段、`/pricing` 的 `return_to` 白名单；AGENTS §6「所有接口默认需要登录」没有为伙伴密钥鉴权留例外；LAUNCH 没有连接器验收项。 | **加**：把 `CONNECTOR_shortest_path_fable.md` §3 并入 ARCHITECTURE 新增 §14「伙伴接口」，§13 v1 范围加一行；AGENTS §6 加「`/api/partner/*` 用伙伴密钥 + 账号 id 鉴权，不走用户会话」；LAUNCH 加 §9.5 连接器 5 条（跳转连接、出图扣一次、402 回跳、撤销 401、预览密钥生产无效）。`freeform` 模板在 Shotviva 前台不展示（DESIGN §1 禁止出现 prompt）。 | 规范 1 小时；代码 3.5 天已估 |
| 2 | A | ARCHITECTURE §4、§8；DESIGN §4.3；LAUNCH §4 | **上传路径没写，按直觉写会撞 Vercel 4.5MB 请求体上限。** 手机菜品照 3～12MB，走 Next 路由上传必失败；LAUNCH §4「大于 10MB 的照片能正确处理」现在不可能通过。 | **加**：上传 = 浏览器端先压到长边 2048、JPEG 质量 0.85（通常 <1.5MB），再用预签名 PUT **直传 R2** `originals/`，服务端只收 R2 key。EXIF 在客户端压缩重编码时自然丢失，服务端再用 `sharp` 兜底一次。生成路由从 R2 读原图喂 OpenAI。 | 不写会返工 1～2 天 |
| 3 | A | ARCHITECTURE §8、AGENTS §6、LAUNCH §4 | **「HEIC 转 JPEG」在 Vercel 上做不到**：Vercel 预编译的 `sharp`/libvips 不含 HEIF 解码器（专利原因）。三处规范都把它当成已有能力。 | **改**：不在服务端转 HEIC。iOS Safari 通过 `<input type=file accept="image/*">` 选相册照片时默认转码为 JPEG；只需 ① 不在 `accept` 里写 `image/heic`，② 客户端检测到 HEIC 仍漏进来时提示「请在 iPhone 设置 → 相机 → 格式 选兼容性最佳，或截图后上传」。LAUNCH §4 改为「iPhone 相册直接选图可上传」。 | 省 1 天 + 一次返工 |
| 4 | A | ARCHITECTURE §6、PRICING §四 | **积分模型装不下定价方案。** PRICING 推荐「30 天通行证 30 张」+「菜单包 120 张 12 个月有效」，隐含两件事：积分有有效期（按批次 FIFO 消耗、到期作废），和「付费身份」（私密、无水印、可商用）有窗口。ARCHITECTURE §6.1 是单一余额 + 流水，§6.2 说「会员是一次性买断一段会员期」，但哪来的「期」没定义。两套逻辑混在一个余额里，SQL 函数会写得很复杂。 | **定一个简单模型并写进 §6**：`profiles.credits`（整数，**不过期**）+ `profiles.paid_until`（时间戳）。通行证 = +30 积分，`paid_until = max(paid_until, now)+30d`；菜单包 = +120 积分，`paid_until = max(paid_until, now)+365d`。付费身份 = `paid_until > now`。积分不过期，比「30 张 30 天内用完」对用户更友好，SQL 只多一列。PRICING 里「30 天内」改成「付费身份 30 天」。 | 省 2 天 SQL + 测试 |
| 5 | A | ARCHITECTURE §6.2、PRICING §六 | 水印「免费作品下载带小水印」已定，但**在哪加、存几份**没写。 | **加**：成品只存一份无水印原图；下载路由按 `visibility='public' AND 当前非付费身份` 用 `sharp` 叠角标后返回（~50ms）；工作台预览和将来创作库展示同样走这个路由。付费后旧作品自动无水印，无需重处理。 | 半天；不写会存两份 |
| 6 | A | ARCHITECTURE §6.2、DESIGN §4.5、LAUNCH §5 | 价格数字可以晚定，但 **SKU 结构**（几个商品、什么形态）不定，付费墙设计、`/pricing` 页、积分 SQL、Stripe/Waffo 商品映射、PostHog `purchase` 事件参数全部卡住。Owner 说方案偏保守，但没给方向（是嫌便宜还是嫌 SKU 少）。 | **先定结构再定数字**：建议锁定「2 个 SKU：短期通行证 + 长期大包，都一次性」这个形态，价格字段留 `site.config.ts`。impeccable 付费墙按 2 个选项设计。 | 不定则前端 1/3 的页面无法开工 |
| 7 | B | 建站规格 §6、§8 第 4 周 vs ARCHITECTURE §13、AGENTS §2 | 多语言仍矛盾：建站规格要第 4 周上 `/ja` `/id`（G13 还要求母语写手），ARCHITECTURE v1 不做多语言内容。 | **修**建站规格 §8 第 4 周：`/ja` `/id` 推到付费验证通过之后；§6 架构保留（next-intl 从第一天带前缀能力）。 | 省 3～5 天 + 写手费用 |
| 8 | B | 建站规格 §0 vs R6 / ARCHITECTURE §13 | §0「不做聊天框，**首页就是模板库**」与 R6「模板库是首页的一块内容，不能只是模板卡片」自相矛盾；§4 `/commercial-photography` 仍写「vs $9.9/月」。 | **修** §0 为「首页是工具落地页，模板库是首屏之后的一块」；§4 价格改为引用 G3。 | — |
| 9 | B | ARCHITECTURE §6.3 | Waffo v1 同接的理由（Stripe 审核可能来不及）成立，但两条通道各一套回调 + 测试是 3～4 天。 | **顺序而非取舍**：先接 Waffo（上线必有），Stripe 放第二张卡，Stripe 账户通过前不卡合并。另外 **Stripe Managed Payments 是 Stripe 当商户记录方（MoR）**，有产品类目和地区的准入限制，且 Alipay/WeChat 在 MoR 模式下是否可用**未核实**——开工前问 Stripe 一次，不要等接完才发现。 | 避免 1 天空等 |
| 10 | B | LAUNCH §9 末条、ARCHITECTURE §1.1 | 模板化验收写「关掉 image 打开 video，`pnpm build` 能通过」，但 video 模块 v1 只有类型、没有 workspace，打开它要么 build 失败要么得写一个占位页——后者违反 §3.2「不写任何视频页面」。 | **改**为「把 `site/` 换成示例配置、`modules.image=false`，`pnpm build` 通过且 `/generate` 返回 404」。 | 避免为验收写死代码 |
| 11 | B | ARCHITECTURE §7 | 「hCaptcha 隐形验证 + 弹窗验证」是 Graylum 的双层做法（`invisibleCaptcha.ts` + `DialogCaptcha`）。Supabase Auth 校验只需要一个 token。 | **简化**：只做隐形 hCaptcha，失败时降级为显式 checkbox。不抄 Graylum 两套。 | 省半天 |
| 12 | B | PRICING §五、AGENTS §6 | 「同一设备 / IP 限领一次免费额度」是防刷建议；设备指纹是新依赖。 | v1 只用邮箱验证 + hCaptcha；IP 限领如果要做，就是注册 SQL 函数里查 `profiles.signup_ip` 24 小时内是否已发过免费额度，一行。不引任何指纹库。 | 省 1 天 |
| 13 | C | 建站规格 §8 第 1 周 | 仍写「10～15 个菜品图模板」，ARCHITECTURE §5 和 LAUNCH §4 已改 6～8。 | **修**为 6～8。 | — |
| 14 | C | DESIGN §2 | Magic UI 列为营销页必选来源；它增加依赖、拖 LCP（R11 要求 <2.5s）。 | 改为「可选，impeccable 设计方向需要时再引」。 | 省半天 + 首屏风险 |
| 15 | C | DESIGN §4.2/§4.3、PRICING | 单位叫法三种：「credit」「张」「积分」。 | 定一句：1 credit = 1 image，前台英文一律 "image"（"3 free images"、"uses 1 image"），后台和代码叫 credit。 | — |
| 16 | C | ARCHITECTURE §13、LAUNCH §8 | 「用户能自助删除账号」（隐私要求）在 LAUNCH 有，ARCHITECTURE 没对应功能：Supabase `auth.admin.deleteUser` + R2 按前缀清 + `generation_jobs` 级联。 | §13 加一行「账号页：删除账号（服务端路由，级联删 R2）」。 | 半天 |
| 17 | C | AGENTS §7 末段 | 测试连本地 Supabase 意味着 GitHub Actions 里要装 Supabase CLI + Docker 起库。 | 加一句「CI 用 `supabase/setup-cli` action + `supabase start`，首个 PR 把 workflow 建好」。 | 半天，不写会在第一个 PR 卡住 |
| 18 | C | COLLABORATION §3 | 「仓库建立前任务卡写在 `规范/TASKS.md`」——文件还不存在。 | 总控现在就建，先写 §5 的开工清单。 | — |

## 4. 开工前必须由 Owner 拍板的三件事

1. **SKU 结构**（#6）：是否接受「2 个一次性 SKU：短期通行证 + 长期大包」这个形态，价格数字可以之后填。
2. **积分模型**（#4）：是否接受「积分不过期 + `paid_until` 付费身份窗口」。
3. **连接器并入 v1**（#1）：确认按 `CONNECTOR_shortest_path_fable.md` 并入 ARCHITECTURE，Shotviva 侧随 MVP 做。

另外一件不需要拍板但要**开工前问清**：Stripe Managed Payments 下 Alipay/WeChat 是否可用（#9）。

## 5. 能不能开工

**现在就能开（不依赖上面任何决定）**，建议作为 `TASKS.md` 第一批卡：

| 卡 | 内容 | 依据 |
|---|---|---|
| T0 仓库骨架 | 新建 Next 16 + Tailwind 4 + next-intl + pnpm + shadcn；四层目录；ESLint 边界与行数规则；CI（lint/type/test/build + 本地 Supabase）；`core/env.ts`、`core/logger`、`core/errors` | ARCHITECTURE §1、§11；AGENTS §3～§5、§7 |
| T1 登录 | Supabase Auth 邮箱 + Google + hCaptcha；Resend SMTP；`profiles` 表与 `role` | ARCHITECTURE §7 |
| T2 积分与任务 | `profiles.credits`/`paid_until`、流水表、预扣/确认/退回/管理员调整 SQL 函数及测试；`generation_jobs` 表 | ARCHITECTURE §4、§6.1（按 #4 模型） |
| T3 模板与后台 | `templates`/`template_prompts` 表、RLS、种子导入脚本、后台一页 | ARCHITECTURE §5、§10 |
| T4 上传与出图 | 客户端压缩 + 预签名直传 R2；GPT-Image-2.5 适配器；同步生成路由；下载路由（含水印） | ARCHITECTURE §3、§4、§8（按 #2、#3、#5） |
| T5 SEO 内容框架 | `site.config.ts`、`site/content/pages/` 类型、通用渲染组件、JSON-LD/sitemap/robots/llms.txt | ARCHITECTURE §2、§12；建站规格 R5～R7 |
| T6 设计方向 | impeccable 一次：变量 + 首页 + 工作台（付费墙等 #6） | DESIGN §0 |
| T7 伙伴接口 | `partner_links`、`/connect/graylum`、五个路由、`freeform` 模板 | CONNECTOR_shortest_path §3（待 #1 并入） |

**要等决定的**：付费墙与 `/pricing`（等 #6）、Stripe/Waffo 结账与回调（等 #6 的商品映射；Waffo 可先做沙盒）、首页五块正文的最终文案（等价格数字）。

**不在规范里但在关键路径上的 Owner 事务**：6～8 个模板的提示词调优需要真实菜品照片和「前/后」对比图素材；Stripe 新账户、Waffo 加急、OpenAI 组织验证、Resend 域名验证都要提前申请——这些比任何代码都慢。

## 6. 仍然值得保留、不要再精简的

和第一轮 §3 相同，另加 v2 新增的四条：§1.1 仓库策略一句话验收、§12 内容格式、§13「`/templates` 两个条件同时满足才建」、COLLABORATION §2.1 总控不写业务代码。
