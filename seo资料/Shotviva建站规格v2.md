# Shotviva 建站规格 v2

> 交给 Claude Code 的唯一执行依据 · 2026-11-04 定稿 · 数据口径：Google Ads 规划师美国月搜索量 + 哥飞版 KD（进前十口径）

## 0. 一句话定位
通用的傻瓜式 image to image AI 工具（Owner 2026-11-05 改定：之前「主要针对餐饮商家」的定位是错的，餐饮降为分类之一）：上传一张手机实拍图 + 选模板 + 填文案，出影棚级成品图或换画风，主体保持原样。服务日常用户和小商家：网店和二手卖家、餐饮店、美妆品牌、房东、宠物主人、想换画风的普通人（分类见 规范/ARCHITECTURE.md §5 第一批 6 类 10 个模板）。不做聊天框；首页是工具落地页，模板库是首屏之后的一块内容（见 R6、R10，2026-11-05 修订，原文「首页就是模板库」与 R6 矛盾）。
三个卖点必须在每个页面出现：照片主体保持原样不变（垂直页可具体化，例如餐饮页写「餐具摆盘不变」）；不需要写提示词；3 步出图。

## 1. 域名与品牌（已定稿，不再讨论）
- 唯一域名：shotviva.com（已注册）。不使用 .ai，不做 301 跳转。
- 商标：USPTO 已查，无 shotviva 冲突。
- 品牌写法全站统一 Shotviva（Logo、Title 后缀、structured data 的 brand 字段、社交账号）。
- shotviva 与食物/图片无字面关联，Logo 旁必须常驻 tagline："AI food & product photo studio"；每个页面副标题也带一句功能说明。
- 首页 footer 固定一行站方声明（唯一官方站点），并占用 X / Instagram / Product Hunt / LinkedIn 的 shotviva 账号名。

## 2. SEO 硬规则（12 条，违反任意一条视为不合格交付）
R1 一页一主词：每个 URL 只对应一个主词，全站不许两页打同一主词。首页主词 image to image ai（美国 18,100/月，难度 36.8）。因此 /image-to-image-generator 必须存在，专门承接 image to image generator（2,900/月，难度 34.4）。
R2 一页覆盖一族写法但不做多主词：Title 放主词，H2 逐条承接同族写法。/ai-food-photography → 主词 ai food photography（50/月），H2 依次承接 ai food photo（140）、ai generated food images（210）、menu photoshoot（390）、virtual photography（260），族内合计约 1,050/月。
R3 TDK 规范：Title ≤60 字符，结构为主词 + 场景/差异点（可带年份，GEO 要求），首页例 "Image to Image AI: Restyle a Photo, Keep the Subject (2026)"（59 字符），垂直页例 "AI Food Photo Generator for Restaurants (2026)"（46 字符）。Description ≤155 字符，写「给谁、做什么、代价（价格/免费额度）」，不堆词。H1 全页只有一个，主词出现在 H1 前半段。H 层级不跳级，不许把 H2 做成纯装饰。
R4 URL 规范：全小写、连字符分隔、无参数、无中文、无日期；层级不超过两级；尾斜杠全站统一（统一不带），其余版本 301 到唯一版本。
R5 渲染与抓取（最易翻车）：必须 SSG/ISR/SSR。页面源码（Ctrl+U）里必须能看到正文、H1、模板名称、FAQ 文字、价格数字。正文靠 JS 执行后才出现 = 不合格（Google 首轮抓取与 ChatGPT 抓取都读不到）。不用弹窗或「点击展开才加载」承载关键信息。
R6 索引管理：每页 canonical 自指；sitemap.xml 拆 index（sitemap-pages / sitemap-templates / sitemap-blog / sitemap-ja…），上线当天提交 GSC；noindex 只用于搜索结果页、筛选参数组合页、登录/账户页、草稿；薄页控制：/templates/xxx 单页第一期一律不做，模板库是首页的一块内容（首页仍须有 R10 五块正文，不能只是一排模板卡片）；第一期不建 /templates（模板只有 6~8 个，会与首页重复抢词，见 R1），模板数达到 20 个以上且找到与首页不撞词、已核实搜索量的独立主词后再建 /templates 聚合页 + 分类筛选，规则见 规范/ARCHITECTURE.md §13；分页 canonical 指向自身。
R7 结构化数据（JSON-LD 四类必做）：SoftwareApplication（首页+所有工具页：name / applicationCategory / operatingSystem: Web / offers 价格+币种）；FAQPage（所有带 FAQ 页，问题用真实问法）；Organization（首页：name / url / logo / sameAs）；BreadcrumbList（所有内页）。可选 HowTo、ImageObject（对比图带 caption）。
R8 内链规则：任何页面从首页出发 ≤3 次点击；内页指回首页锚文本只用「AI image to image」或「img to img」；同族互链（interior↔architectural、restaurant-flyer↔restaurant-poster、工具页↔模板分类、首页模板分类块的每个分类↔对应垂直页）；博客每篇至少链回一个工具页且锚文本用该页主词；首页必须直链所有已上线的内页。
R9 图片 SEO：WebP/AVIF + CDN；首屏对比图不许 lazy load（LCP 要素）；alt 写「场景+主体+光线」，例 "AI food photo of grilled salmon on ceramic plate, studio lighting"，不许 image1、不许堆词；每张对比图配一行可见 caption（说明改了什么）。
R10 内容模块（每页五块，缺一不算完成）：① 首屏 1 张前后对比图 + 一句直答（G1）+ 试用入口 ② 可核验事实块（平台尺寸/免费张数/价格/支持语言）③ 成本对比表（请摄影师 vs 本站，全站一套价格）④ FAQ 3~5 条用真实问法 ⑤ 族内互链块 2~3 个相关页。
R11 技术底座：Next.js App Router + next-intl，SSG/ISR。robots.txt 显式放行 GPTBot、OAI-SearchBot、PerplexityBot、ClaudeBot、ChatGPT-User，不许 Disallow: /。移动端 LCP <2.5s、CLS <0.1、INP <200ms。
R12 监控节奏：上线当天 GSC 验证站点 + 提交 sitemap；上线满 2 周起每两周看一次 img to img（难度 14.3，首页的副词，不单独建页，靠首页文案和内页回链锚文本带动）是否先出排名、首页均排是否进前 20；每月看 AI 引荐来源与首页模板区点击率。判定线：上线 8 周后首页有排名（前 20）但首页→模板（点开任一模板进入工作台）点击率 <5%，才考虑换首页主词，此前不许动。另看一条「付费链路」指标（2026-11-05 补）：首页→垂直页（/ai-restaurant-menu、/commercial-photography、/interior-photography）的点击占比，低于 5% 先改首页的用例 / 内链块（§4 首页骨架的最后一个 H2），不改首页主词——通用定位下这是唯一能判断「泛流量有没有漏到付费页」的指标。

## 3. GEO 规则（13 条）
SEO 争排名，GEO 争「被抄进答案」——每页都要有能整段摘走的句子和数字。
G1 每页顶部写「直答块」：H1 下方 40~60 个英文词，以主词开头、自带完整信息、不需上下文。首页定稿（2026-11-05，59 词）："Image to image AI takes a photo you already have and gives it a new look while the subject stays as shot. With Shotviva you upload one phone photo, pick a template for food, products, rooms, pets or an art style, and download it in Standard, HD or Max. No prompts to write. You start with 3 free credits." 垂直页照此格式写，以该页主词开头。必须放正文最前、不许折叠。
G2 Title 带年份与限定词：AI 联网会自己组带年份的搜索词，Title 精确对上易被引用。所有工具页 Title 带 (2026)；垂直页另带 for Restaurants / for Etsy Sellers 这类人群限定，首页不带人群限定（首页是通用页）。
G3 每个数字只能一套口径：免费额度（"3 free credits"，计价单位是 credit 不是「张」，因为不同模板消耗的 credit 不同）、价格（唯一来源是 site.config.ts；Owner 2026-11-05 定稿：Starter $19.90/月 50 credits 或 $139/年 600 credits，Pro $49.90/月 135 或 $349/年 1,620，Max $99/月 280 或 $699/年 3,360；积分包 $9.90/20、$24.90/55、$49.90/115；卡支付可订阅自动续费，钱包和积分包为单笔，见 规范/ARCHITECTURE.md §6.1、§6.2）、每张图消耗（按模板和清晰度：Standard / HD / Max 三档，即 1024 / 2048 / 2880 px，标准模板 2 / 4 / 6 credits，页面上写 "from 2 credits"；对外不写 1K / 2K / 3K，不写 4K）、支持语言数、出图耗时，全站（首页/价格页/FAQ/结构化数据/站外目录）完全一致；AI 交叉比对发现两套就不引用；改价一次改全站。
G4 每页写死可核验事实，至少 3 条。全站通用的：免费额度（3 free credits）与价格档位；每张消耗（from 2 credits）；输出三档像素（Standard 1024 / HD 2048 / Max 2880 px）；上传限制（JPG / PNG / WebP，最大 20MB）；出图耗时（秒/张）；保留主体不变的技术说明。垂直页另加本行业的：餐饮页写 DoorDash/Uber Eats/Grubhub 菜单图推荐尺寸与比例，电商页写 Amazon / eBay / Etsy 主图要求，空间页写 Airbnb 封面图比例。
G5 用 HTML 表格承载对比（成本、尺寸要求、模板分类），不用图片——AI 抽表格成功率显著高于段落。
G6 FAQ 必须用用户原话。首页 5 句（通用，2026-11-05 定）：
A What is image to image AI?
B Is image to image AI free?（答：3 free credits，之后 from 2 credits a photo，价格从配置读）
C Does image to image AI keep my photo's subject the same?
D How is image to image AI different from an AI image generator?（答案末尾链 /image-to-image-generator）
E Can I use the photos commercially?（答：付费积分生成的作品无水印、可商用；免费作品公开带水印）
垂直页 8 句（餐饮线，原文保留），每句都有承接页：
1 how can I make my restaurant food photos look professional without hiring a photographer
2 is there an AI that turns phone photos into studio product photos
3 best AI tool for menu photos for Uber Eats and DoorDash
4 how much does food photography cost for a small restaurant
5 can AI design a flyer for my cafe
6 which AI is best for generating images for menu food
7 AI menu maker for a small restaurant
8 how to take better food photos with my iPhone
分配：1/2/4 → /ai-food-photography 与 /commercial-photography；3 → /ai-restaurant-menu；6/8 → 博客；5 → 物料期 /restaurant-flyer；7 → 菜单页。首页不再承接这 8 句中的任何一句（原来由首页兼顾的 2 改由 /commercial-photography 承接）。
G7 榜单与对比页（AI 回答推荐类问题的主要来源）必做三篇：best AI food photography tools 2026；Shotviva vs hiring a photographer（成本对比）；foodshot.ai alternatives / ezmaker.ai alternatives。规矩：真实列出竞品并给客观描述，纯自夸的榜单 AI 不引用。排期：Shotviva vs hiring a photographer 并入 /commercial-photography 的成本对比，不另建页；另外两篇作为博客排在第 3 周，URL 已登记在主词表 CSV，搜索量核实后再建。
G8 实体信息写全：每页页脚或 About 说明是谁做的、何时上线、服务哪些国家、联系方式（AI 判断可信度会看实体是否明确）。
G9 站外要有独立来源（每月 3~5 个，持续不像一次砸完）：Reddit r/smallbusiness / r/Etsy / r/Flipping / r/restaurateur / r/Chefit / r/airbnb_hosts（回答问题不发广告，按分类分散）；Product Hunt 上线页；AI 工具目录（There's An AI For That、Futurepedia 等）；1~2 篇第三方评测或访谈。
G10 robots 与 AI 抓取：robots.txt 放行上述五个爬虫，不要因怕被白嫖而屏蔽 AI 爬虫（GEO 是本站流量大头）；可选 /llms.txt 列主要页面与一句话说明。
G11 服务端渲染 + 语义化 HTML：AI 抓取不看 JS 渲染后的 DOM，直答块/事实块/FAQ 必须在源码里；FAQ 用 <h3>+<p>，不用 <div> 拼。
G12 每周自测 SOP：每周一把 G6 首页 5 句 + 垂直页八句原话丢进开联网的 ChatGPT（另加 Perplexity 抽查 2 句），记录①提没提 ②排第几 ③引用哪个页面 ④截图存档。连续 4 周不提 → 检查承接页是否上线、直答块是否在源码；提到但引用竞品 → 抄它的页面结构、补它有你没有的事实块。
G13 多语言 GEO：/ja、/id 上线后直答块与 FAQ 必须母语写手重写，不许机器直译（日语/印尼语问法与英文差异大，直译的句子 AI 不引用）。

## 4. 页面与主词映射（一页一主词）

**首页（第 1 周）**，主词 image to image ai（18,100，难度 36.8），2026-11-05 按通用定位重写，Owner 用哥飞 SEO agent 出初稿、audit-fable 窗口按产品事实修订：
- Title（59 字符）："Image to Image AI: Restyle a Photo, Keep the Subject (2026)"；要带品牌时用 "Image to Image AI: New Look, Same Subject | Shotviva"（52 字符）。
- Description（151 字符）："Image to image AI that turns a phone photo into a studio shot or a new art style. Pick a template, no prompts, the subject stays as shot. 3 free credits."
- H1："Image to Image AI: Restyle a Photo, Keep the Subject"；副标题用 `<p>` 不用 H2："Shotviva: one phone photo in, a studio-quality photo out. No prompts to write."；直答块见 G1。
- H2 / H3 骨架（6 个 H2，顺序即 ARCHITECTURE §13 的首页区块顺序；H3 里的 credits 数和价格从 `site.config.ts` 读）：
  1. H2 "How Image to Image AI Works in 3 Steps"：H3 Upload One Photo / Pick a Template / Download in Standard, HD or Max（**不写 "original resolution"**，输出是三档像素，不是原图尺寸）。
  2. H2 "Img to Img Templates: No Prompts to Write"（承接副词 img to img）：模板网格按 ARCHITECTURE §5 的 6 个分类分组，每个分类一个 H3（Food & Drink / Products & Resale / Beauty & Skincare / Rooms & Spaces / Pets / Art Styles），H3 下列该分类的模板名和一句用途；已有垂直页的分类在 H3 末尾链过去（Food → /ai-restaurant-menu、/ai-food-photography；Products → /commercial-photography；Rooms → /interior-photography、/architectural-photography）。**不按「anime / cartoon / portrait retouching」这类风格分组**：第一批只有一个画风模板，人像修图不做（ARCHITECTURE §5）。
  3. H2 "AI Image to Image: What Stays the Same"（承接同族写法 ai image to image，8,100/月、今年 3 月起从 2,900 涨到 14,800）：事实块，G4 的通用事实用表格写。
  4. H2 "Free Image to Image AI: What You Get"（承接 image to image ai free，3,600/月）：H3 "3 Free Credits When You Sign Up"（**不是 "free images every day"**，免费额度只发一次）/ "Free Photos Are Public and Watermarked, Paid Photos Are Private"（按作品判付费，ARCHITECTURE §6.1）/ "Plans From $19.90 a Month" + 成本对比表（请摄影师 / 自己拍 / Shotviva）。
  5. H2 "Image to Image AI FAQ"：G6 首页 5 句。「vs AI image generator」做成 FAQ 的一问，不单独开 H2（避免首页去打 /image-to-image-generator 的词）。
  6. H2 "Image to Image AI for Food, Products, Rooms and More"：内链块，直链全部已上线内页和 /pricing（R8），每个链接一句话说明给谁用。
- 淘汰："Image to Image AI for Restaurants & Small Shops"、"Built for Small Restaurants, Not Photographers" 那套 H1 / H2 全部作废；全站 H1、Title 里不再出现 Restaurants（垂直页除外）。

第一批 第 2 周：/ai-restaurant-menu（ai restaurant menu，均值 260、最新月 1,600 上升，难度 45.8，工具页+菜单模板+平台尺寸事实）；/commercial-photography（commercial photography，3,600 +22%，难度 34.3，替代方案页+成本对比）；/image-to-image-generator（image to image generator，2,900，难度 34.4，工具页隔离首页主词）。
/ai-restaurant-menu 是全站最优机会：30（2025-10）→260→880→1,600（2026-09），广告出价 $6.00~$18.94 全站最高，前十没有产品首页正面打这个词。
/commercial-photography 打「替代摄影师」意图：首屏三张商家实拍→商业图对比，中段成本对比（请摄影师一套几千 vs Shotviva 的价格，数字按 G3 从 `site.config.ts` 读，不手写），FAQ 覆盖 cost / can I do it myself。
第二批 第 3~4 周：/interior-photography（590，难度 33.1，盘面最弱：第1名 DR27 个人站、体验分 5）；/architectural-photography（3,600，最新 5,400 +28%，难度 40.3，与 interior 互链）；/ai-food-photography（词族，主词 50、族内约 1,050，难度 42.6，餐饮线的垂直落地页之一，和 /ai-restaurant-menu 相邻、从首页模板分类块的 Food & Drink 直接链过去）。
/ai-food-photography 流量低是设计如此，不许因数据差就砍，它承接 G6 垂直页前三句问法。它不再是 GEO 的主力页：GEO 主力换成首页的直答块、事实块和 FAQ（2026-11-05 改定）。/ai-restaurant-menu 和 /commercial-photography 的排期和主词不变，它们承担付费用户转化，重要性上升。
第三批 物料期 第 9~14 周（以主词表 CSV 为准，难度均为哥飞版 KD 精评值）：/ai-flyer-maker（ai flyer maker，1,900，KD 27.3，物料主攻页）；/restaurant-flyer（880，KD 57.9，GEO + 长尾承接，不设前十目标）；/restaurant-poster（390，KD 58.2，GEO + 长尾承接，不设前十目标）；promo poster（210，KD 40）不单独建页，并入 /ai-flyer-maker 的 H2。
物料晚做：产品图的功能就是物料页同一套底座，物料只加排版能力；物料大词全被大站占死（ai flyer generator 难度 67.1、前十 7 席是 google 自己、最弱占位 design.com DR 83）。

## 5. 明确不做的词（防开发乱加页面）
food photography 8,100（难度 65.6，前十 6 席 google 自己，全年 -50%）；ai flyer generator 5,400（难度 67.1，前十 7 席 google 自己，最弱占位 DR 83）；flyer maker / poster maker 18,100（预筛 49/62，adobe、canva、postermywall 主场）；menu design 8,100（广告竞争 100/100，-30%）；restaurant menu template 1,900（预筛 42，从 1,900 掉到 880）；product photography 6,600（同名域名占第 3）；ai image editor / ai photo editor（ezmaker.ai 领地，难度 70.8/72.2）；ai menu 4,400（难度 57.8，前九 8 席大媒体）；ai food images 720（难度 57.3，前十含卫报、Pinterest、Pexels）；virtual staging 4,400（同名域名 + 6 席 google 自己，持续下滑）。

## 6. 多语言架构（第一天留好，后期改等于重构）
子目录 + 英文 slug：/{lang}/{english-slug}，例 /ja/interior-photography、/id/ai-restaurant-menu。slug 用英文的理由：主词全是英文关键词，模板与组件可跨语言复用；将来某语言要做本地词，只在该语言下用本地 slug，不影响其他语言。hreflang 全语言互指（含自身），x-default 指向英文版。每种语言独立 sitemap 挂在根 sitemap index 下。语言切换器必须是真实 <a href>，不许 JS 跳转。语言前缀不做自动跳转（IP 自动跳语言会让爬虫反复重定向）。语言优先级（依据 foodshot.ai 真实地区分布）：en（美国 16.3%）→ ja（4%）→ id（4%）→ pt-BR（3.6%）。**v1 只上英文**（2026-11-05 修订，与 ARCHITECTURE §13 一致）：next-intl 从第一天带前缀能力，但 /ja、/id 的内容推到付费验证通过之后，先 /ja /id，其余等 GSC 数据。

## 7. 技术栈
以 规范/ARCHITECTURE.md 和 规范/AGENTS.md 第 2 节为准：Next.js App Router + next-intl，营销页 SSG/ISR，部署在 Vercel；数据库存模板、生成任务、订单和积分流水，SEO 页面内容按 ARCHITECTURE §12 的固定结构静态生成。

## 8. 上线节奏与验收
第 1 周：首页（§4 首页骨架）+ 第一批 10 个模板（6 类，与 ARCHITECTURE §5 一致）+ /image-to-image-generator + /pricing + sitemap/robots/结构化数据。验收：能真实出图；Ctrl+U 源码可见正文；GSC 提交成功。
第 2 周：第一批 3 个内页。验收：每页五块齐（R10）；一页一词。
第 3 周：interior + architectural + 3 篇问题式博客。验收：内链互通，深度 ≤3。
第 4 周：/ai-food-photography + 第一批站外来源。验收：ChatGPT 自测跑第一轮。（/ja /id 推到付费验证通过之后，届时验收 hreflang 校验通过；见 §6）
满 2 周：看 img to img 是否先出排名、首页均排是否进 20。
第 9~14 周：物料期 4 个页面，物料功能上线。
位次目标：3~4 月进前 20；5~7 月进前 10（体验分 60+：停留 >180s、跳出 <40%、人均 >4 页）；7~10 月进 4~6 位；10~14 月搏前 2。

## 9. 竞品参照
image-to-image.ai：18.8 万/月、DR 6、13 个月新站、体验分 11（全盘最差）——必拿下，先超它。
ezmaker.ai：152.3 万/月、DR 37、5 个月做到、直访 43.1%——不正面打，做 alternatives。
foodshot.ai：8.9 万/月、DR 37、1282 出词几乎全 /blog/、美国仅 16.3%——用工具页对位它的博客页。
postermywall.com：262.9 万/月——不同生意，不争。

## 10. 风险
1. ezmaker.ai 快速扩张，窗口期约 12 个月。
2. 只有一个域名：别人可能抢注 shotviva.ai 或近似域名冒充。对策 = 首页 footer 官方声明 + 早占社交账号名 + 品牌写法全站一致。
3. /ai-food-photography 数据差是设计如此，不许砍。
4. 首页泛流量不转化的判定线见 R12，8 周前不许动首页主词；通用定位下先盯「首页→垂直页点击占比」，低于 5% 改首页用例 / 内链块。
5. 主词表里 img to img 与 image to image 在 Google Ads 规划师里是同一组（两者月度曲线完全相同，14,800 是整组的量），不要把 14,800 当成 img to img 自己的搜索量去立项。