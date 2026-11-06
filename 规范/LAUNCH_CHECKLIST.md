# Shotviva 上线检查清单

> v3 · 2026-11-05 按 `AUDIT2_fable.md` 和 Owner 拍板修订（v2：2026-11-04）· 第 1~9 节上线前逐条勾选，任何一条不过就不上线。第 10 节是推迟项，不卡上线。SEO 部分只列要点，细则见建站规格和创作库规格。

## 1. 账号和服务

- [ ] Vercel Pro 项目建好，绑定 shotviva.com，www 跳转到不带 www 的主域名
- [ ] Supabase 生产项目 `shotviva` 和预览用的测试项目 `shotviva-preview` 分开，都在美国西部一区（us-west-1）。生产项目先用免费计划（Owner 2026-11-05）：第一笔真实付款到账后立刻转进 Pro 组织（转移后地址和密钥不变）；在那之前留意免费项目一周无请求会暂停、没有每日备份
- [ ] Supabase Auth 的 Site URL 和 Redirect URLs 配好，包含预览域名通配
- [ ] GitHub 仓库密钥已配好：Supabase 访问令牌、预览库数据库密码、生产库数据库密码；`production` environment 设为必须 Owner 批准
- [ ] 生产库的全部迁移由「生产迁移」工作流执行（Owner 批准记录可查），`supabase migration list` 与仓库完全一致；没有任何手动执行过的 SQL
- [ ] Stripe：同一主体下新开的独立账户，开通卡和支付宝（不接微信支付）；账单描述设为 SHOTVIVA（卡支付在 Managed Payments 下显示 `LINK.COM* SHOTVIVA`）。Managed Payments 资格审核已提交；审核没下来时卡走普通订阅兜底（ARCHITECTURE §6.3）。账户本身没通过时用 Waffo
- [ ] Waffo：申请加急，测试和生产密钥分开创建，回调格式选 Raw
- [ ] Stripe 和 Waffo 的生产回调地址、签名密钥都已登记到环境变量
- [ ] OpenAI：组织验证完成，有 GPT-Image 系列模型权限（`OPENAI_IMAGE_MODEL` 指定的那个，默认由 Owner 定），设好每月消费上限
- [ ] Resend：shotviva.com 的 SPF、DKIM、DMARC 都验证通过，已配成 Supabase Auth 的 SMTP
- [ ] Cloudflare R2：生产桶和预览桶分开，都是私有桶；`inputs/`、`uploads-admin/` 前缀设好 7 天过期规则；CORS 只放行站点域名的 PUT、GET 和 Content-Type（生产桶的来源是 `https://shotviva.com`）
- [ ] 模板封面公开桶 `shotviva-assets` 已建，绑定 `assets.shotviva.com`，公开桶里只有 `covers/`；10 个模板的封面都已由 Owner 在后台上传
- [ ] 伙伴密钥：预览和生产各一把，登记到环境变量；预览密钥在生产调用返回 401
- [ ] hCaptcha：站点密钥建好，已在 Supabase Auth 里启用
- [ ] Sentry、PostHog（cookieless 模式）已接入；Vercel Firewall 限频规则已配置
- [ ] GitHub 仓库建好（Owner 2026-11-06 改为公开，省 CI 费用；上线后可能改回私密），main 分支开启保护，仓库设为 Template Repository

## 2. 安全

- [ ] 代码里没有调试接口、公开出图接口、全站跨域放行
- [ ] 所有表都开了 RLS，`template_prompts` 客户端读不到（用匿名身份实测）
- [ ] 前端打包产物里搜不到任何密钥和提示词正文
- [ ] 生成接口有 IP 限频和账号限频
- [ ] 上传的照片已清除 EXIF（用带 GPS 的 iPhone 照片实测，检查 R2 里的对象）
- [ ] 没有任何 API 路由接收或返回图片字节（代码审查 + 直接 POST 一张图到 /api/generate 应 4xx）
- [ ] 直传一个 25MB 文件和一个改后缀的文本文件到 R2 后调用生成，都返回 422 且对象被删除
- [ ] 管理后台只有 `role = admin` 能进，普通账号访问返回 404
- [ ] 生产库 Supabase Advisor（Performance + Security）没有 WARN 级别的问题；转 Pro 之后打开 Leaked Password Protection

- [ ] 出图供应商（ARCHITECTURE §3.3）：后台已录入在用供应商（密钥存 Supabase Vault）并测试连接成功，出一张图后 `generation_jobs.provider` 正确

## 3. 登录

- [ ] 邮箱 + 密码注册，收到 Resend 发的验证邮件（发件人 support@shotviva.com），点击后能登录；Gmail、Outlook 各测一次，记录进收件箱还是垃圾箱
- [ ] 发信域名预热：shotviva.com 2026-11-05 才注册，正式推广前至少留一周少量发信，确认 Gmail / Outlook / 飞书都能正常收到（预览验收时飞书企业邮箱曾一直收不到）
- [ ] 未验证邮箱的账号不能生成
- [ ] Google 登录可用，回跳地址正确
- [ ] hCaptcha 在注册和登录时生效
- [ ] 忘记密码流程可用

## 4. 生成

- [ ] 第一批 10 个模板（ARCHITECTURE §5）已由 Owner 在后台调好提示词并上架；模板质量由 Owner 把关，不设统一的实测门槛（Owner 2026-11-05）
- [ ] iPhone 相册直接选 HEIC 照片能上传（Safari 自动转 JPEG）；竖拍照片方向正确；20MB 照片能上传；Android HEIC 文件给出「请换 JPEG」提示
- [ ] 手机 4G 下上传有 Compressing → Uploading（进度）→ Generating 三段状态；生成中切后台再回来能恢复结果
- [ ] 连点 5 次生成，只扣对应次数，余额不会变成负数
- [ ] 模拟出图失败和超时，积分自动退回
- [ ] 每张图的实际成本已记录，定价有毛利

## 5. 支付

- [ ] 价格数字（ARCHITECTURE §6.2 的 9 个商品）已填进 `site.config.ts`，首页、价格页、FAQ、结构化数据的数字完全一致；Stripe 里 Starter / Pro / Max 各一个 Product（税码 `txcd_10105001`）挂 4 个 Price（月付 / 年付 × recurring / one-time），三个积分包各一个 one-time Price；每个 Price 的 `lookup_key` 和 `metadata.product_id` 按 §6.2 的约定填好，服务端按 lookup key 能取到全部 15 个 Price
- [ ] 成本测量（**不是主体保持测试，不设质量门槛**）：用 20 张真实手机照片（长边 2048）对 `OPENAI_IMAGE_MODEL` 各跑一次 `/v1/images/edits`，读 `usage.input_tokens_details.image_tokens`，总花费 < $5；按 p95 算 1K high 单次成本，若 > $0.12 就把 `high` 的 1K 配置下限改为 3 credits，或把上传长边降到 1536；结果写进 `modules/image` 的下限表注释
- [ ] 按分辨率扣费：同一模板分别以 1K / 2K / 3K 生成，扣的 credits 等于后台配置的三个数，成品像素等于该档尺寸表；后台把某档改成低于下限的数被拒绝保存
- [ ] Stripe 测试模式·卡：`starter_monthly` 和 `pro_yearly` 各订阅一次（Managed Payments），结账页显示税，到账后付费池 `credits` +50 / +1,620，`paid_until` = 付款时间 +30 / +365 天（首付按天数累加；从首次续费起对齐 `period_end`，T10），`subscriptions.product_id` 正确
- [ ] Stripe 测试模式·钱包：支付宝单笔买一次 `starter_monthly`，结账页无税，付费池 +50、`paid_until` +30 天，付费墙写明不自动续费；再用卡（MP 单笔）和支付宝各买一次 `pack_s`，付费池 +20、`paid_until` 不变
- [ ] 用 Stripe 测试时钟把一个 `starter_monthly` 订阅推进到续费：`invoice.paid` 到账后付费池 +50、`paid_until` 延到新一期；再推进一次让续费失败，不发积分、`paid_until` 不延、账号页显示已过期，已有付费积分仍可用
- [ ] 在 Customer Portal 取消订阅：镜像表 `cancel_at_period_end = true`，`paid_until` 不变，期末后不再续
- [ ] Waffo 沙盒：卡、支付宝各单笔买一次 `starter_monthly`（一期）和 `pack_s`，都能到账，积分和 `paid_until` 与 Stripe 单笔一致；9 个商品的 Waffo 映射都配了，缺一个启动报错；付款页不显示微信、不显示「自动续费」
- [ ] 只开 Waffo、只开 Stripe 两种开关状态下，付款页显示正确
- [ ] 两条通道的回调各重发 3 次，积分只加一次；签名错误返回 400、不加积分；`charge.refunded` 产生 Sentry 告警且不动积分
- [ ] Stripe / Waffo 正式模式的回调只登记 `https://shotviva.com/...`；测试模式的预览回调（分支地址 + Vercel 绕行密钥）没有出现在正式模式里；绕行密钥不在代码和 PR 里
- [ ] 账号页显示订阅状态和下次续费日，「Manage subscription」能打开 Stripe Customer Portal
- [ ] 新账号有 6 个免费积分（对外写 3 free Standard images）、0 个付费积分；用免费积分生成的作品 `credit_pool = 'free'`、公开、下载带右下角「Made with Shotviva」水印、不能改私密、可以删除
- [ ] 买任何商品后生成：优先扣付费池、整单不拆，作品 `credit_pool = 'paid'`、默认私密、下载无水印、可改公开；付费池用完后再生成又回到免费作品并弹付费墙
- [ ] 付费后，之前的免费作品仍带水印、仍公开（R2 里每张只有一份文件）
- [ ] 没买会员只买 `pack_s` 的账号，生成的作品同样是付费作品（无水印、私密）
- [ ] 切到生产密钥后，对上线时实际开着的通道用真卡付一笔最小金额，确认到账后在后台退款

## 6. 创作库（上线前 8 周闸门）

- [ ] `gallery.enabled = false`：/gallery、/tag/*、/g/* 都返回 404
- [ ] 免费用户生成前能看到公开展示的告知
- [ ] 免费作品 `visibility = 'public'`，付费用户可改成私密
- [ ] 公开数据里没有封装提示词

## 7. SEO 和 GEO（要点）

- [ ] Ctrl+U 查看源码：H1、直答块、模板名、FAQ、价格数字都在源码里
- [ ] 每页 Title ≤ 60 字符、Description ≤ 155 字符，只有一个 H1
- [ ] 每页 canonical 指向自己
- [ ] robots.txt 放行 GPTBot、OAI-SearchBot、PerplexityBot、ClaudeBot、ChatGPT-User，没有 `Disallow: /`
- [ ] sitemap index 拆分正确，提交到 GSC
- [ ] JSON-LD：首页有 SoftwareApplication + Organization，带 FAQ 的页面有 FAQPage，内页有 BreadcrumbList
- [ ] 首屏对比图没有懒加载，alt 符合规则；每页有 OG 图
- [ ] 「我的作品」、后台、登录页都是 noindex
- [ ] 移动端 LCP < 2.5s、CLS < 0.1、INP < 200ms
- [ ] /llms.txt 已发布

## 7.6 简体中文（Owner 2026-11-06，ARCHITECTURE §17）

- [ ] ARCHITECTURE §17 清单里的 14 个页面都有 `/zh` 版，语言切换器是真实链接，切换后停在对应页面；法律页和 SEO 内页没有 `/zh` 版，切换器指向 `/zh` 首页，也不输出 `/zh` hreflang
- [ ] 浏览器语言为中文时，英文页出「切换到中文」提示；不自动跳转；选过一次后不再提示
- [ ] 应用界面、付费墙（「支付宝」）、错误提示、空状态没有漏翻的英文；Stripe 托管结账页显示中文
- [ ] 中文邮箱注册收到中文验证邮件，重置密码邮件也是中文
- [ ] 模板名称和说明在 `/zh` 下显示中文；缺翻译的回退英文而不是空白
- [ ] hreflang（`en` / `zh-Hans` / `x-default`）互指正确；`/zh` 独立 sitemap 只列 3 个收录页；其余 `/zh` 页是 noindex；每个 `/zh` 页 canonical 指向自己；中文页没有中英混排（建站规格 §6.1）
- [ ] 中文页在 375px 上没有溢出、截断或重叠
- [ ] 中文页显示的是 MiSans：网络面板里只有同源 `/fonts/misans/` 的分包请求，没有任何外部字体主机；首屏不被字体阻塞；服务条款页「Third-party notices」一节有 MiSans 署名和协议链接；`/fonts/misans/*.woff2` 带一年 immutable 缓存头

## 7.5 移动端应用壳（iOS Safari 真机 + Android Chrome 真机各一遍）

- [ ] 应用页有底部 tab bar（Create / Photos / Account），营销页没有；工作台、生成中、结果页隐藏 tab bar 并有底部固定主按钮
- [ ] 底部栏不被 iOS 地址栏顶出屏幕；键盘弹出时正在输入的字段可见
- [ ] 付费墙、比例选择、模板预览在手机上是底部抽屉，可下拉关闭
- [ ] 结果页 Share 弹出系统分享面板，能存相册、能发到已装的 WhatsApp / Instagram；微信内置浏览器里按钮显示为 Download 且能保存
- [ ] 整页无横向滚动；没有 hover 才能触发的功能

## 8. 法律页面

- [ ] 服务条款、隐私政策、使用规范、退款政策：从 Graylum staging 改写成英文版
- [ ] 条款写明：免费作品公开展示、生成内容的权利归属、用户授权我们展示免费作品
- [ ] 隐私政策写明：用来生成作品的照片随作品保留、删除作品时一起删除，没用的上传 7 天后删除（T40），成品保留到用户删除（T41 可自助删除作品）、用了哪些第三方服务、PostHog 不使用 Cookie、连接 Graylum 时共享哪些信息（账号 id、剩余张数）
- [ ] 隐私政策写明：客服和安全需要时可能查看用户的照片和成品，每次查看都有记录（T25）
- [ ] 退款政策写明：在网站的 Help & feedback 里提交退款申请，也可以发邮件；隐私政策写明工单内容保留到删号为止（T27）
- [ ] 用户能在账号页自助删除账号，删除后 `inputs/` 和 `outputs/` 下该用户的对象、任务记录、伙伴关联一起删除
- [ ] 页脚有官方站点声明和联系方式，不写运营主体和地址；服务条款和隐私政策的联系方式一节、首页 Organization 结构化数据里有主体名称和地址（建站规格 G8）
- [ ] 律师顺带确认：MiSans 字体文件通过网站对外提供，是否符合小米字体协议的「再分发」条款（ARCHITECTURE §17）

## 9. 运营和模板化

- [ ] PostHog 事件名已定并能看到：`signup`、`upload`、`generate`、`paywall_view`、`checkout_start`、`purchase`
- [ ] 出图失败、支付回调失败会在 Sentry 告警
- [ ] 后台能新建、编辑、上下架模板和提示词
- [ ] `admin_adjust_credits`、`admin_ban_user` 两个 SQL 函数可用，调用会写流水
- [ ] 模板化验收：把 `site/` 换成一份示例配置、`modules.image = false`、`features.wishlist = false`，`pnpm build` 能通过，`/generate`、`/wishlist`、`/admin/requests` 都返回 404，tab bar 只剩三项

## 9.5 Graylum 连接器（Shotviva 侧）

- [ ] 从 Graylum 预览环境点「连接 Shotviva」，未登录时先到 Shotviva 登录页，登录后一键授权，302 回到 Graylum 并显示已连接和剩余张数
- [ ] Graylum 里用模板出一张图、用自由文字出一张图，Shotviva 各扣 1 张，「我的作品」里能看到，`source = 'graylum'`
- [ ] 同一个 `Idempotency-Key` 重发请求，不重复扣费，返回同一个 job
- [ ] 张数用完时返回 402 和 `top_up_url`，跳到 `/pricing?from=graylum`，付款后回到 Graylum
- [ ] 在 Shotviva 账号页点「断开」后，Graylum 再调用返回 401
- [ ] `return_to` 填非白名单域名时拒绝回跳
- [ ] 用预览密钥调生产返回 401

## 9.6 模板需求墙

- [ ] 上线前一个小 PR：`site.config.ts` 的 `features.wishlist` 改为 `true`，删掉只在预览生效的 `FEATURE_WISHLIST_PREVIEW`（代码和 Vercel Preview 变量都删，T12 PR #73 的临时开关）

- [ ] 没出过图的账号：能看墙，发帖和投票按钮灰掉；出过 1 张图后两者都可用
- [ ] 提交需求后只有本人在 My requests 看到 Pending，墙上和其他账号都看不到
- [ ] 后台通过后上墙；拒绝后本人看到 Rejected，R2 `requests/` 下该需求的参考图被删除
- [ ] 同一账号对同一需求连点投票 5 次，计数在 0 和 1 之间切换，数据库里最多一行
- [ ] 后台标记 shipped 并关联模板后，卡片置顶显示 Shipped 并能跳到该模板
- [ ] 脱敏用户名不泄露邮箱或完整显示名
- [ ] Wishlist 所有页面 noindex；未登录访问跳登录页
- [ ] 服务条款含「参考图由上传者负责，我们可以不经说明下架」；隐私政策写明参考图保留规则
- [ ] 删除账号后 `requests/{user_id}/` 下的参考图一并删除

## 10. 推迟项（不卡上线，到时再勾）

- [ ] **建站工具包**（Owner 2026-11-06 定：上线并跑通第一笔真实付款后做）：
  - 仓库设成 GitHub 模板仓库。
  - 配置文件 `launch.yaml`，填品牌、域名、价格、地区和各平台令牌。
  - `pnpm launch:bootstrap`：一条命令自动配好以下各项，最后列出剩下的手动步骤（Google OAuth 客户端、Stripe 激活、Google 品牌验证、律师审条款）：
    - Supabase：建项目，用 `config.toml` 加 `supabase config push` 推送登录设置、邮件模板、SMTP、回调地址、hCaptcha；
    - Vercel：建项目、设环境变量、绑域名；
    - R2：建桶，配跨域和生命周期；
    - Stripe：建商品、价格和回调；
    - Resend：加域名，并把 DNS 记录写进 Vercel DNS；
    - PostHog / Sentry 项目。
  - `pnpm launch:doctor`：检查环境变量和外部服务是否连通、配置是否一致。
  - 第一步先把 Shotviva 自己的 Supabase 登录配置和邮件模板改成 CI 推送，以后改模板不再手贴。

- [ ] 第 6~7 周：内容审核 + 作品审核后台页（创作库开放前必须完成）
- [ ] 第 8 周开创作库时：noindex、sitemap 不含 /g 的测试和验收（创作库规格第 4 节）
- [ ] 有付费会员后：会员到期提醒邮件、到期后保留 90 天和续费恢复
- [ ] 有付费用户后：卡支付自动续费、自动故障切换

## 预上线（支付审核期，ARCHITECTURE §12.0）

- [ ] 生产 `SITE_INDEXING` 未设或为 `off`；`curl -sI https://shotviva.com/` 带 `x-robots-tag: noindex, nofollow`
- [ ] `robots.txt` 里 AI 爬虫全部 Disallow，没有 Sitemap 行；`/sitemap.xml`、`/llms.txt` 返回 404
- [ ] `www.shotviva.com` 和 `shotviva.vercel.app` 308 跳到 `https://shotviva.com`
- [ ] 无痕窗口能匿名打开首页、`/pricing`、`/terms`、`/privacy`、`/refund-policy`（给支付审核员）
- [ ] Deployment Protection 保持 Standard，不关闭
- [ ] 绑域名时没有删改飞书 MX、SPF 和 Resend 的 DNS 记录

## 开放收录那天

- [ ] Production 把 `SITE_INDEXING` 改成 `on` 并重新部署；`curl` 确认页面变 `index, follow`、AI 爬虫按 R11 放行、sitemap 和 llms.txt 可访问
- [ ] GSC 和 Bing 提交 `sitemap.xml`（和 `sitemap-zh.xml`）
- [ ] 合并把 `seo:check` 期望值改成 `open` 的 PR

## 上线后再做

- [ ] 申请「Sign in with ChatGPT」（目前只对选定合作方开放，通过 OpenAI 对接人进候补名单）；拿到 `oaiapp_` 客户端编号后再加按钮（Owner 2026-11-06）
- [ ] 「用 Apple 登录」暂不做（Owner 2026-11-06）：要开发者年费、每 6 个月续密钥、登记私密转发邮件域名；上线后看 iPhone 注册流失再定
