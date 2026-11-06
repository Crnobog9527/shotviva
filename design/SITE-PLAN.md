# Shotviva 全站页面设计计划（T6 第三轮，2026-11-06）

Owner 11-06 要求：把全站页面的设计都提上计划。路由清单取自 `规范/ARCHITECTURE.md`，壳类型按 `规范/DESIGN.md` §8.1（营销页 = 简洁导航 + 正文 + 页脚；应用页 = 固定顶栏 + tab bar / 顶栏镜像，无页脚）。所有稿都在 `design/comps-v3-b/`，375 / 1280 / 1440 三档。

## 已有稿（本轮按 Owner 十条修改中）

| 路由 | 稿 | 壳 | 本轮改动 |
|---|---|---|---|
| `/` | home.html | 营销 | hero 紧凑生成栏、左右并排对比、桌面导航、价值对比表、氛围动效、页脚 |
| `/pricing` | pricing.html | 营销 | Max 奢华、积分包分层、Yearly 折扣标、动效 |
| 付费墙（应用内弹层） | paywall.html | 应用 | 同上（共用 tiers.css） |
| `/generate`（Create tab） | create.html | 应用 | 缩略图悬停播放、点模板直接进创作弹窗 |
| `/generate/[templateId]` | workspace.html | 应用（流程页） | 变成创作面板的全页形态：直链、手机、Photos「再做一张」用 |
| `/photos` | photos.html | 应用 | 卡片改左右并排规则 |

## 还没有稿、按优先级排

优先级按「上线必经路径」排：没有它用户走不通的先做。

### P0 上线必经

| 路由 | 说明 | 稿怎么做 |
|---|---|---|
| `/login` `/signup` | 邮件魔法链接 + Google（T1/T24） | 首页已有注册 sheet；补独立页：一列表单，桌面居中 420 宽，背景同 hero 安全灯 |
| `/reset` `/reset/update` | 重设密码两步 | 同登录页骨架 |
| `/photos/[jobId]` | **已出稿 `photo.html`**（11-06）：大图 + Result / Original 视图、透明 PNG 棋盘格、原图已删空态、Your note 引文、Download、Edit（编辑面板，规范 §5.2）、Make again、事实表；generating / failed / Edited from 结果页 | 桌面左图右信息两栏；手机单列 + 底部抽屉编辑面板 |
| `/account` | **骨架稿已出 `account.html`**（11-06，含 Language 行）。订阅区块（DESIGN §4.5：档位、状态、续费日、Manage subscription / Renew）、余额（付费 + 免费分开）、购买记录、邮箱、删除账号 | 应用页，分组卡片；桌面 max 720 |
| 结账返回页 | Stripe 成功 / 取消返回（T9） | 成功：一张卡 + 「去创作」；取消：回定价页 |
| 404 / 空状态 | DESIGN §4.6：404 给首页和模板库入口；每个列表有空状态 | 一套空状态组件（图标 + 一句话 + 一个按钮），404 用同一组件 |
| 法务页 | Terms / Privacy / Refunds / Acceptable use（T19 已建页） | 营销壳的「阅读」版式：72ch 正文、目录、Instrument Serif 标题；MiSans 署名若保留放 Terms 页脚注 |
| 站内公告条 | T23 的全站公告（用户侧） | 顶栏上方一条，可关闭，颜色按 info / warning |

### P1 增长页

| 路由 | 说明 | 稿怎么做 |
|---|---|---|
| `/templates` | 模板库营销页（SEO） | 复用首页模板区 + 分类筛选，每张卡左右并排 |
| `/image-to-image-generator` `/commercial-photography` `/ai-restaurant-menu` | SEO 落地页 | 复用首页骨架（H1 / 生成栏 / 对比示例 / 表 / FAQ），只换文案和示例图 |
| `/wishlist` | 需求墙 + My requests + Request a template（DESIGN §4.7） | 应用页；卡片列表、投票按钮、提交 sheet |
| `/connect/graylum` | 合作方接入（T7） | 一张说明卡 + 授权按钮 |
| `/zh` `/ja` | 多语言（T21 在做） | 不另出稿，中文字体方案见 seo资料/全站中文字体.md |

### 不出用户侧稿

`/admin/*`（T23 自己的后台壳）、`/api/*`。

## 「What a set of photos costs」数字来源（上线前请 Owner 确认）

稿里摄影师一列的数字取自 2026 年公开的行业报价文章，多数是厂商博客，没有独立调查；写法是「typical published 2026 studio rates (US)」并加脚注。

- 首页「What 3 Product Photos Cost」两张账单的算法：摄影师 = 3 张造型图 × $89–$300 + 精修 3 × $10–$30 = $297–$990；Shotviva = Starter $19.90 / 50 credits，3 张 Standard 6 credits ≈ $2.40，当月还剩 22 张（44 credits ÷ 2）。
- 单张产品图：白底 packshot $15–$50，造型图 $89–$300；精修另加 $10–$30 / 张。来源：claid.ai「product photography pricing」、acquireconvert 价目表、clippingworld 2026 指南。
- 日租：$500–$3,000。来源：同上汇总。
- 餐饮半天：US $400–$1,500 / 半天，食物造型师另计；澳洲 10 道菜 3–4 小时 $800–$2,100；英国半天 £350–£900。来源：splento 餐厅摄影定价文、bark.com 商业摄影价、foodshot-studio 价目。
- Shotviva 一列的美元数是按 Starter（$19.90 / 50 credits = $0.398 / credit）折算：Standard 一张 2 credits ≈ $0.80，三张 6 credits ≈ $2.40。credits 仍是界面单位，美元只在这张对比表出现（已报总控裁定）。
- 年付折扣（Owner 11-06 定，规范 PR #100 已合并）：Starter / Pro 年付 8 折、Max 6 折，取整到整美元：Starter $191（vs $238.80，省 $47.80）、Pro $479（vs $598.80，省 $119.80）、Max $713（vs $1,188，省 $475）；按钮标「Save up to 40%」（Max 的 39.98% 取最大值写 40）。T9 改 site.config、Stripe 价格和文案。
- 总控 11-06 裁定：对比表里的所有数字、年付折扣标、积分包单价，实现时一律从 `site.config` 取（G3 单一来源），不写死在页面里。
- 积分包单价：$9.90/20 = $0.495；$24.90/55 = $0.453；$49.90/115 = $0.434 → 稿里写 $0.50 / $0.45 / $0.43 per credit。
