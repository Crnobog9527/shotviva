# Shotviva v3-b「暗房」稿 · 签收清单（2026-11-06）

看板：`design/comps-v3-b/desktop-board.html`（本地起静态服务器后打开，三档宽度并排）。所有稿在 `design/comps-v3-b/`，示意图全部标「Illustrative example」，上线前换真图。数字（价格、折扣、credits、像素）构建时一律从 `site.config` 取，稿里只是副本。

| # | 页 | 文件 | 查看变体（查询串） | 还开着的点 |
|---|---|---|---|---|
| 01 | 首页 `/` | `home.html` | `?frame=1`（375）、`?photo=1&signup=1`、`?preview=pure-white`、`?open=pure-white`、`?lang=zh`（中文提示条）、`?menu=lang`（地球菜单）、`?faq=all`（九问全开）、`?links=live`（相关链接只剩两卡） | 成本账单两张卡的摄影师报价需 Owner 上线前确认；相关链接卡里 /ai-restaurant-menu 与 /commercial-photography 两页未上线，代码只渲染存在的页面，初期只显示两卡；「Start free」与 Generate 并存是 Owner 定的 One Primary 例外 |
| 02 | 定价 `/pricing` | `pricing.html` | `?billing=m`、`?frame=1`、`?lang=zh`、`?menu=lang` | 年付 $191 / $479 / $713、「Save up to 40%」已定；Brand kit / Early access to new features / 批量上传仍 Coming soon；新增「For business」板（§6.9 第 8 条，无价格、无 SLA / SSO / 席位承诺，Contact us 为 mailto） |
| 03 | 付费墙（应用内弹层） | `paywall.html` | `?billing=m`、`?frame=1` | 与定价页同一份 `tiers.js`，权益文案与代码 T9 #102 一致 |
| 04 | Create `/generate` | `create.html` | `?open=pure-white`（创作弹窗）、`?hover=<id>`、`?frame=1` | 悬停播放仅装饰；触屏进视口播一次 |
| 05 | 工作台 `/generate/[templateId]` | `workspace.html` | `?t=<id>&state=empty\|ready\|generating\|done\|failed`、`?balance=0`、`?frame=1` | 创作面板的全页形态（直链、手机、Photos「再做一张」） |
| 06 | Photos `/photos` | `photos.html` | `?frame=1` | 卡片链到详情页 |
| 07 | 作品详情 `/photos/[jobId]` | `photo.html` | `?state=done\|generating\|failed`、`?edited=1`、`?edit=empty\|typing\|low`、`?view=original`、`?png=1&view=checker`、`?orig=expired&view=original`、`?note=none\|long`、`?frame=1` | 编辑面板（T30）、原图 / 说明 / 透明 PNG（T31 / T32）；终审 ship |
| 08 | 账号 `/account` | `account.html` | `?sub=active\|cancelled\|expired\|past_due\|wallet`（订阅状态）、`?lang=open`（语言抽屉）、`?integ=open`（Integrations 展开）、`?frame=1` | 骨架稿；**Shopify 行仅示意，不实现**；订阅四个变体已画：已取消（Ends 日期 + Resubscribe）、到期（No plan + Choose a plan，余额仍可用）、续费失败（Payment failed + Update payment method → Stripe Customer Portal）、支付宝单期（不自动续费 + Renew） |
| 09 | 登录 / 注册 / 重设 `/login` `/signup` `/reset` `/reset/update` | `auth.html` | `?v=login\|signup\|verify\|reset\|reset-sent\|update\|updated\|expired`、`?err=creds\|unverified\|exists\|weak\|mismatch`、`?captcha=1`、`?next=photo`、`?resent=1`、`?frame=1` | 邮箱 + 密码 + 验证邮件 + Google（ARCHITECTURE §7）；hCaptcha 备用复选框是第三方 iframe 的占位画法；**首页 / 定价页注册弹窗里的「Continue with Apple」已删**（规范没有 Apple 登录） |
| 10 | 结账返回 | `checkout.html` + `pricing.html?checkout=cancel` | `?r=success\|pending`、`?p=<9 个商品 id>`、`?frame=1` | 取消不落返回页，回定价页出 toast；收据链接是 Stripe 托管收据 |
| 11 | 404 / 空状态 | `404.html`、`empty.html` | `404.html?v=404\|error`；`empty.html?v=photos\|wishlist\|requests\|purchases\|404\|error\|offline` | 一个 `.state` 组件；404 页下面三张模板卡 |
| 12 | 法务四页 `/terms` `/privacy` `/refund-policy` `/acceptable-use` | `legal.html` | `?page=privacy\|refunds\|acceptable-use`、`#third-party-notices`、`?frame=1` | **正文是样稿**，文字归 T19 并由律师审；MiSans 署名在 Terms 的 Third-party notices |
| 13 | 站内公告条 | `home.html?announce=…`、`create.html?announce=…` | `?announce=info\|warning` | 文案来自公告表；后台 / 结账 / 生成中不显示 |
| 14 | SEO 落地页 `/image-to-image-generator`（v1）、`/commercial-photography`、`/ai-restaurant-menu` | `landing.html` | `?p=image-to-image-generator\|commercial-photography\|ai-restaurant-menu`、`?frame=1` | 一个骨架三页内容（ARCHITECTURE §12）；**事实块里的平台尺寸和餐饮摄影师报价由内容任务核实**；`/templates` 按 §13 v1 不建，未出稿 |
| 15 | 需求墙 `/wishlist` | `wishlist.html` | `?v=wall\|request\|mine`、`?gate=0`、`?request=filled`、`?sent=1`、`?frame=1` | 门槛态、投票态、shipped 置顶、发帖流程页、My requests 四种状态 |
| 16 | Graylum 连接 `/connect/graylum` | `connect.html` + `auth.html?next=graylum` | `?v=allow\|done\|already\|error`、`?frame=1` | 回跳域名白名单、code 10 分钟一次性（§14.2）都在 error 态文案里体现 |

共用：`css/studio.css`（变量与基础组件、toast、公告条）、`css/app.css`（应用页）、`css/marketing.css` + `js/marketing.js`（营销页：生成栏、模板选择、注册弹窗、中文提示条、地球菜单）、`css/tiers.css` + `js/tiers.js`（三档与积分包）、`js/studio.js`（模板数据、底部抽屉、创作与编辑面板）。

## 本轮一致性核对（11-06）

- 价格：Starter $19.90 / Pro $49.90 / Max $99 月付；年付 $191 / $479 / $713；徽章「Save up to 40%」；积分包 $9.90 / $24.90 / $49.90。八张稿里没有旧数字。
- 权益：Starter「Email support, reply within 48 hours」、Pro 不单写客服行、Max「Priority email support, reply within 24 hours」；Pro / Max 的 Coming soon：批量上传 10 / 30、Brand kit（原文）；Max 另有「Early access to new features」；需求墙 3 倍票。
- 页脚（home / pricing）：字标、support@shotviva.com、© 2026 Shotviva、Terms · Privacy · Refunds · Acceptable use、「English · 简体中文」；没有运营主体行。
- 语言：导航地球菜单（手机顶栏也有）、页脚文字切换、`?lang=zh` 中文提示条、账号页 Language 行。
- 「prompt」：应用页、组件与脚本里为零；营销页只出现在规范规定的用户原话里（直答块「No prompts to write」、H2「No Prompts to Write」、FAQ「Do I need to write prompts?」）。
- 首页相关链接卡：路径行已换成一句收益文案（规范 #125 后 Owner 追加），箭头保留。
- 首页 FAQ：G6 八问 A–H + 第九问「What is Shotviva?」（规范 #125），A 的首句按规范原文「Shotviva is an image to image AI tool that…」；答案在 HTML 里（details / summary，A 默认展开），D 后带 4 行对比表并链 `/image-to-image-generator`。

## 第二批 P0（09–13）与第三批 P1（14–16），11-06 夜

全部已出稿，见上表，等 Owner 签收。账号页订阅四个变体也已补上（第 08 行）。没画的只有 `/templates`（v1 不建）。
