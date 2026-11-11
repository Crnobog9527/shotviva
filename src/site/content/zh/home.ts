import { baselineOffers, type OfferFacts } from '../offer'
import { defineHomePage, type CostBills, type HeadedText, type HomePage, type ImageRef, type ShootDemo } from '@/core/content'

import { site } from '../../site.config'
import {
  SET_PHOTOS,
  packshotUsd,
  photoSeconds,
  quoteUsd,
  setShotsUsd,
  styledShotUsd,
  usd,
  usdRange,
} from '../offer'
import {
  planLabel,
  ZH_TIERS,
  zhFreeImages,
  zhPlansSentence,
  zhTierList,
  zhTierPixels,
  zhUploadLimits,
} from './offer'
import { withFirstFrame } from '../landing-shared'
import { zhHomeWishlist } from './home-wishlist'
import { zhSharedFacts } from './shared'
import { zhHomePlans } from '../plan-strip'

// /zh home (T21). Keyword 「AI改图」 from the Chinese keyword map; Title and H1 start with it,
// written as one unbroken string (建站规格 §6.1 rule 7). The direct answer says plainly what
// changes (light, scene, style), what stays (the subject) and that templates replace prompts,
// so nobody expects free-form editing (中文用户真实问法 C7). Numbers come from offer.ts.
const brand = site.brand.name
const [standard, hd, max] = ZH_TIERS

function plansText(offers: OfferFacts): HeadedText {
  const { planFrom, yearlySaving } = offers
  const heading = planFrom ? `套餐每月 ${usd(planFrom.priceUsd)} 起` : '套餐和积分包'
  const yearly = yearlySaving ? `按年付最多省 ${yearlySaving}%。` : ''
  return {
    heading,
    text: `${zhPlansSentence(offers)}${yearly}付费积分永不过期，用它生成的每张图都私密、无水印。下面和请摄影师、自己拍对比一下。`,
  }
}

// The same illustrative tote set as the English home (public/home/hero-set-*.webp).
const photo = (file: string, alt: string): ImageRef => ({ src: `/home/${file}.webp`, alt, width: 1080, height: 1350 })
const phoneShot = photo('hero-set-phone', '手机随手拍：厨房台面上的一只编织皮托特包，窗边自然光（示意图）')
const listingShot = photo('hero-set-listing', '同一只编织皮托特包的白底商品图，柔和影棚光（示意图）')

// 首屏 AI 那一半：同一张手机照片做出的三个场景轮流展示（Owner 2026-11-11），和英文首页一致。
const heroScenes = [
  { image: photo('hero-ai-street', 'AI 示例：同一只编织皮托特包挎在女生肩上，阳光下的巴黎街头，身后是咖啡馆座位'), caption: '同一只包，换了街景和模特' },
  { image: photo('hero-ai-terrace', 'AI 示例：同一只包放在海边露台的大理石咖啡桌上，旁边的女生端着咖啡'), caption: '同一只包，放上海边露台的咖啡桌' },
  { image: photo('hero-ai-villa', 'AI 示例：同一只包放在阳光下别墅廊下的石凳上，墙上有树叶的影子'), caption: '同一只包，换了光线和场景' },
] as const

// Also the /zh/commercial-photography demo (T44).
export const shoot: ShootDemo = {
  heading: { lead: '一张手机照片 → ', emphasis: '一整套图' },
  intro: '在厨房台面上用手机随手拍了一张。做出三张成品图，每张里都是同一只包：编织纹路、缝线、链条都没变。',
  phone: { image: phoneShot, file: 'IMG_2047.jpg', caption: '手机原图：窗边光线，台面很乱，钥匙和杯子都入镜了。' },
  arrow: '三个模板，同一只包',
  results: [
    { image: listingShot, title: '电商主图', template: '纯白底图模板' },
    { image: photo('hero-set-lifestyle', '同一只包放在窗边的咖啡馆椅子上，早晨暖光（示意图）'), title: '生活场景图', template: '生活场景模板' },
    { image: photo('hero-set-promo', '同一只包做成新品促销海报，明亮影棚光（示意图）'), title: '促销海报', template: '促销海报模板' },
  ],
  bill: {
    photographer: { who: '摄影师', amount: '一整场拍摄', note: '预约、影棚、造型和精修' },
    site: { who: brand, amount: '无需重新实拍', note: '一张手机照，做出主图、场景图和促销海报' },
    line: '换个模板，就能把同一张商品照用在不同地方。',
  },
}

// Same two bills as the English home, same figures from site.config, in dollars (§6.1 rule 8).
// The landing pages reuse it with their own heading and intro; `moreFine` adds a source.
// `planLine: false` on the home page, whose plan strip under the bills already shows Starter
// (SEO launch handbook S1/G10), so it is not listed twice.
export function productBills({ planFrom }: OfferFacts, heading: string, intro: string, moreFine = '', { planLine = true } = {}): CostBills {
  const plan = planFrom ? usd(planFrom.priceUsd) : '暂无月付套餐'
  const shared = [
    { label: '拍摄准备', value: '用已有的手机照' },
    { label: '可做成', value: '主图、场景图、促销海报' },
  ] as const
  return {
    heading,
    intro,
    photographer: {
      title: '摄影师报价',
      total: { amount: usdRange(quoteUsd), when: '几天后交图' },
      lines: [
        { label: `${SET_PHOTOS} 张造型图，每张 ${usdRange(styledShotUsd)}`, value: usdRange(setShotsUsd) },
        { label: '预约、拍摄、修图', value: '几天' },
      ],
      fine: `美国 2026 年公开的单张价格：造型产品图 ${usdRange(styledShotUsd)}（Shopify，2026 年 1 月）；纯白底产品图 ${usdRange(packshotUsd)}（工作室价目表）${moreFine}。很多工作室另收预约或布景费。实际报价因人而异。`,
    },
    site: {
      title: brand,
      total: { amount: plan, suffix: planFrom ? '/月起' : '', when: `每张 ${photoSeconds} 秒左右` },
      lines: planLine ? [{ label: planLabel(planFrom), value: plan }, ...shared] : shared,
      fine: `造型和精修都在模板里，主体保持你拍的样子。先用 ${zhFreeImages}试试，不用绑卡。`,
    },
  }
}

const steps = {
  heading: 'AI改图怎么用：3 步完成',
  items: [
    { heading: '上传一张照片', text: `用手机拍一张，或者从相册里选：${zhUploadLimits}。让主体完整地留在画面里。` },
    {
      heading: '选一个模板',
      text: '选餐饮、商品、美妆、房间、宠物或画风模板。光线、场景或画风由模板决定，什么都不用写。',
    },
    {
      heading: `下载${zhTierList}`,
      text: `${standard.name} ${standard.px} px，适合${standard.use}；${hd.name} ${hd.px} px，适合${hd.use}；${max.name} ${max.px} px，适合${max.use}。`,
    },
  ],
} as const satisfies HomePage['steps']

// 「白底图、电商主图怎么做」 (SEO launch handbook G9): the white-background template, the
// product kept as shot, and the three export sizes.
const whiteBackgroundGuide = {
  id: 'white-bg',
  heading: '白底图、电商主图怎么做',
  cards: [
    { heading: '选「纯白底图」模板', text: '上传一张商品照片，选「纯白底图」模板，背景换成干净的纯白，适合做电商平台的主图。不用自己抠图，也不用写提示词。' },
    { heading: '商品主体保持原样', text: '商品的形状、颜色、标签和文字按你拍的样子保留，只换背景和光线。拍的时候让商品完整入镜、对上焦。' },
    { heading: `${ZH_TIERS.length} 档导出尺寸`, text: `每张图导出为 PNG，分 ${ZH_TIERS.length} 档：${zhTierPixels}。主图需要放大看细节时，选更高一档。` },
  ],
} as const satisfies HomePage['topics']

// 「3 步」 in FAQ A is the length of the steps block, never typed.
const STEP_COUNT = steps.items.length

const copy = {
  slug: '',
  keyword: 'AI改图',
  label: 'AI改图',
  // SEO launch handbook G9 (Owner 2026-11-11: add AI修图, keep 「主体不变，更换光线、场景或画风」).
  title: 'AI改图·AI修图：主体不变，更换光线、场景或画风',
  description: `AI改图 / AI修图：上传手机照片选模板，换光线、场景或画风，主体保持原样。可做白底商品图、电商主图和菜单图，不用写提示词，新用户送 ${zhFreeImages}。`,
  h1: 'AI改图：主体不变，换光线、场景或画风',
  subtitle: '从你拍的真实照片出发的 AI 影棚。',
  answerBlock: `AI改图就是把你拍好的照片换一种光线、场景或画风，照片里的主体保持原样。上传一张手机照片，选一个餐饮、商品、美妆、房间、宠物或画风模板就能出图，不用写提示词。新用户送 ${zhFreeImages}。`,
  hero: {
    before: withFirstFrame(phoneShot),
    after: heroScenes[0].image,
    caption: heroScenes[0].caption,
    cta: { label: '上传照片', href: '/generate' },
    scenes: { label: '同一张照片做出的 AI 场景', items: heroScenes },
  },
  shoot,
  steps,
  templateGrid: {
    heading: 'AI改图模板：不用写提示词',
    intro: `每个模板都从你的手机照片开始，到一张成品图结束。选一个，剩下的交给 ${brand}。`,
    note: '模板图片均为示意图。',
  },
  topics: whiteBackgroundGuide,
  wishlist: zhHomeWishlist,
  factsIntro: `很多 AI改图工具给你的是一张新图。你要的其实是自己那张图，只是更好看：还是那件商品、那道菜、那个房间，光线更好，画面更干净。${brand} 就是为这个做的。下面的价格和尺寸在本站每一页都一样。`,
  related: [
    { href: '/ai-restaurant-menu', anchor: 'AI菜单配图', note: '餐厅用手机拍菜，直接做成菜单和外卖平台的图。' },
    { href: '/commercial-photography', anchor: '商业产品摄影', note: '网店和卖家不请摄影师，也能做出影棚级商品图。' },
    { href: '/image-to-image-generator', anchor: '图生图在线工具', note: '想看看图生图对菜品、商品、房间和宠物照片的效果。' },
    { href: '/pricing', anchor: `${brand} 价格`, note: '店主、卖家和房东在月付、年付套餐和一次性积分包之间比较。' },
  ],
  headings: {
    facts: `AI改图为什么选 ${brand}`,
    faq: 'AI改图常见问题',
    related: 'AI改图：餐饮、商品、房间等场景',
  },
} as const

const homeFaq = (offers: OfferFacts): HomePage['faq'] => [
  // I, the brand question, comes first on /zh and opens by default (建站规格 G6 exception,
  // Owner 2026-11-08: Chinese visitors first need to know what Shotviva is). English keeps it last.
  {
    question: `${brand} 是什么？`,
    answer: `${brand} 是一个网页版的 AI 照片工作室：用一张手机照片，套上菜品、商品、房间、宠物或画风模板，做出成品图。和凭提示词生成整张图的 AI 生图工具不同，${brand} 从你真实拍的照片出发，主体保持原样。新用户送 ${zhFreeImages}。`,
  },
  // A–H follow 建站规格 G6 in order, asked the way Chinese users ask (G13, 中文用户真实问法).
  // A's first sentence is the Chinese form of G6's fixed sentence: brand and keyword together.
  {
    question: '怎么把自己的照片变成 AI 图？',
    answer: `${brand} 是一个 AI改图工具：把你已有的照片换个样子，主体保持原样，只要 ${STEP_COUNT} 步——上传一张手机照片、选一个模板、选${zhTierList}。AI改图从你的照片出发，不是从一段文字描述开始，所以变的是光线、场景或画风，商品、菜品、房间或宠物还是你拍的那个。`,
  },
  {
    question: 'AI改图免费吗？',
    answer: `${brand} 给新账号 ${site.billing.freeCredits} 个积分，用来试一个模板。每张图按模板和尺寸消耗积分，生成按钮上会显示具体数字。免费生成的图公开、带水印；${offers.planFrom ? `付费套餐每月 ${usd(offers.planFrom.priceUsd)} 起。` : zhPlansSentence(offers)}`,
  },
  {
    question: 'AI改图会不会把我照片里的东西改掉？',
    answer: `${brand} 的模板专门保留你拍的主体：商品标签、摆盘、房间布局或宠物都按原样留着，只改光线、背景、场景或画风。不少 AI改图工具会连主体一起重画，用之前最好先看一眼效果。${brand} 不做人像美颜修图。`,
  },
  {
    question: 'AI改图和 AI 生图有什么区别？',
    answer: 'AI改图从你拍的照片出发，只换它的样子；AI 生图从一段提示词出发，整张图都是生成出来的。用 AI改图，主体是真实拍的，也不用你去描述它。',
    link: { href: '/image-to-image-generator', anchor: '看看图生图工具怎么用。' },
    table: {
      caption: 'AI改图和 AI 生图对比',
      headers: ['', 'AI改图', 'AI 生图'],
      rows: [
        ['从哪开始', '你拍的一张照片', '一段提示词'],
        ['主体', '保持你拍的样子', '照着文字生成'],
        ['适合', '要上架、要发出去的商品、菜品、房间和宠物照片', '创意、插画和现实里没有的场景'],
        ['风险', '原图模糊或没拍全，效果会打折扣', '商品标签、商标和细节容易画错'],
      ],
    },
  },
  {
    question: 'AI 生成的图片可以商用吗？',
    answer: `${brand} 上用付费积分生成的图私密、无水印，可以商用：放进菜单、外卖平台、网店商品页或广告里都行。用免费积分生成的图带水印，也不是私密的。`,
  },
  {
    question: 'AI改图要自己写提示词吗？',
    answer: `${brand} 不用写提示词。选一个模板，按提示填几个字就行，光线、场景和画风模板都已经定好了。出图后想调整，用大白话说一句要改哪里，比如「背景换成浅蓝色」。`,
    link: { href: '/image-to-image-generator', anchor: '看看图生图工具里有哪些模板。' },
  },
  {
    question: '导出的图片是什么尺寸、什么格式？',
    answer: `${brand} 每张图都导出为 PNG，分 ${ZH_TIERS.length} 档：${zhTierPixels}。画面比例由模板决定。用付费积分生成的图可以下载完整尺寸、无水印的版本。`,
  },
  {
    question: '手机上能用吗？要下载软件吗？',
    answer: `${brand} 直接在手机浏览器里就能用，iPhone 用 Safari、安卓手机用 Chrome 都行，不用下载软件。可以用相机现拍，也可以从相册选一张，出图后保存或分享。`,
  },
  // Two questions after A–H (SEO launch handbook G9); each answer opens with Shotviva.
  {
    question: 'AI修图和AI改图有什么区别？',
    answer: `${brand} 做的是 AI改图：从你拍的照片出发，主体不变，只换光线、场景或画风。常说的 AI修图多指人像美颜、磨皮和瘦脸，${brand} 不做人像美颜；换白底、换背景、把商品图调亮这类修图，选对应的模板就能做。`,
  },
  {
    question: '白底图能不能直接生成？',
    answer: `${brand} 可以直接生成白底图：上传一张商品照片，选「纯白底图」模板，背景换成纯白，商品本身保持原样，可以直接做电商主图。导出 PNG，分 ${ZH_TIERS.length} 档：${zhTierPixels}。`,
  },
]

export const makeZhHomePage = (offers: OfferFacts, plans = zhHomePlans(offers.products)) => defineHomePage({
  ...copy,
  facts: zhSharedFacts(offers),
  freeOffer: {
    heading: '免费 AI改图：你能得到什么',
    points: [
      {
        // SEO PATCH v4.1 (2026-11-11): the free credits are no heading of their own and no photo count.
        heading: '先试效果再付费',
        text: `新账号一次性获得 ${site.billing.freeCredits} 个积分，用来试一个模板，不会每天或每月刷新。免费生成的图公开展示、带水印，仅限个人非商业用途。`,
      },
      {
        heading: '免费图公开带水印，付费图私密无水印',
        text: `用免费积分生成的图会公开展示，并带一个小小的 ${brand} 水印，仅限个人非商业用途。用付费积分生成的图私密、无水印，可以商用。之后再买套餐，不会改变已经生成的图。`,
      },
    ],
    plans: plansText(offers),
    sample: { src: '/home/example-skincare-after.webp', alt: '', width: 900, height: 1125 },
  },
  ...(plans ? { plans } : {}),
  costBills: productBills(offers,
    `${SET_PHOTOS} 张商品图要花多少钱：请摄影师和用 ${brand} 对比`,
    `一个商品，${SET_PHOTOS} 张造型图，精修好、可以直接发。同样的活，两张账单。`,
    '',
    { planLine: false },
  ),
  faq: homeFaq(offers),
})

export const zhHomePage = makeZhHomePage(baselineOffers)
