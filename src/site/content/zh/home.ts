import { defineHomePage, type CostBills, type HeadedText, type HomePage, type ImageRef, type ShootDemo } from '@/core/content'

import { site } from '../../site.config'
import {
  SET_PHOTOS,
  creditFrom,
  packshotUsd,
  photoSeconds,
  photosLeftInPlan,
  planFrom,
  quoteUsd,
  setCostUsd,
  setCredits,
  setShotsUsd,
  styledShotUsd,
  usd,
  usdRange,
} from '../offer'
import { zhTemplateCategories } from './template-categories'
import {
  ZH_TIERS,
  zhFreeImages,
  zhFromCredits,
  zhPlansSentence,
  zhTierList,
  zhTierPixels,
  zhUploadLimits,
  zhYearlySaving,
} from './offer'
import { zhSharedFacts } from './shared'

// /zh home (T21). Keyword 「AI改图」 from the Chinese keyword map; Title and H1 start with it,
// written as one unbroken string (建站规格 §6.1 rule 7). The direct answer says plainly what
// changes (light, scene, style), what stays (the subject) and that templates replace prompts,
// so nobody expects free-form editing (中文用户真实问法 C7). Numbers come from offer.ts.
const brand = site.brand.name
const [standard, hd, max] = ZH_TIERS

function plansText(): HeadedText {
  const heading = planFrom ? `套餐每月 ${usd(planFrom.priceUsd)} 起` : '套餐和积分包'
  const yearly = zhYearlySaving ? `${zhYearlySaving}。` : ''
  return {
    heading,
    text: `${zhPlansSentence()}${yearly}付费积分永不过期，用它生成的每张图都私密、无水印。下面和请摄影师、自己拍对比一下。`,
  }
}

// The same illustrative tote set as the English home (public/home/hero-set-*.webp).
const photo = (file: string, alt: string): ImageRef => ({ src: `/home/${file}.webp`, alt, width: 1080, height: 1350 })
const phoneShot = photo('hero-set-phone', '手机随手拍：厨房台面上的一只编织皮托特包，窗边自然光（示意图）')
const listingShot = photo('hero-set-listing', '同一只编织皮托特包的白底商品图，柔和影棚光（示意图）')

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
    site: { who: brand, amount: `${setCredits} 积分`, note: `${SET_PHOTOS} 张${ZH_TIERS[0]?.name ?? ''}图，用你已经拍好的照片` },
    line: '请摄影师要按一整场拍摄收费的东西，用你已经拍好的照片就能做出来。',
  },
}

// Same two bills as the English home, same figures from site.config, in dollars (§6.1 rule 8).
// The landing pages reuse it with their own heading and intro; `moreFine` adds a source.
export function productBills(heading: string, intro: string, moreFine = ''): CostBills {
  const plan = planFrom ? usd(planFrom.priceUsd) : ''
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
      total: { amount: plan, suffix: '/月起', when: `每张 ${photoSeconds} 秒左右` },
      lines: [
        { label: `入门版，每月 ${planFrom?.credits ?? ''} 积分`, value: plan },
        { label: `这 ${SET_PHOTOS} 张，${standard.name}`, value: `${setCredits} 积分 ≈ ${setCostUsd ?? ''}` },
        { label: '这个月还能再做', value: `${photosLeftInPlan ?? ''} 张` },
      ],
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
      text: `${standard.name} ${standard.px} px，适合${standard.use}；${hd.name} ${hd.px} px，适合${hd.use}；${max.name} ${max.px} px，适合${max.use}。一张${standard.name}图${zhFromCredits}。`,
    },
  ],
} as const satisfies HomePage['steps']

// 「3 步」 in FAQ A is the length of the steps block, never typed.
const STEP_COUNT = steps.items.length

export const zhHomePage = defineHomePage({
  slug: '',
  keyword: 'AI改图',
  label: 'AI改图',
  title: 'AI改图：换光线换场景换画风，照片主体不变（2026）',
  description: `AI改图：上传一张手机照片，选个模板，换光线、场景或画风，主体保持原样。不用写提示词，新用户送 ${zhFreeImages}。`,
  h1: 'AI改图：上传一张照片，主体不变，换光线、场景或画风',
  subtitle: '从你拍的真实照片出发的 AI 影棚。你拍的东西不变，模板只换光线、场景或画风。',
  answerBlock: `AI改图就是拿一张你已经拍好的照片，换一种光线、场景或画风，照片里的主体保持原样。在 ${brand} 上传一张手机照片，选一个餐饮、商品、美妆、房间、宠物或画风模板，就能下载${zhTierList}的成图。改什么由模板决定，不用写提示词。新用户送 ${zhFreeImages}。`,
  hero: {
    before: phoneShot,
    after: listingShot,
    caption: '你的手机照片 → 纯白底图模板：还是这只包，只换了光线和背景 · 示意图',
    cta: { label: '上传照片', href: '/generate' },
  },
  shoot,
  steps,
  templateGrid: {
    heading: 'AI改图模板：不用写提示词',
    intro: `每个模板都从你的手机照片开始，到一张成品图结束。选一个，剩下的交给 ${brand}。每张${zhFromCredits}。`,
    note: '模板图片均为示意图。',
    categories: zhTemplateCategories,
  },
  facts: zhSharedFacts(),
  factsIntro: `很多 AI改图工具会把整张图重画一遍。${brand} 的模板专门保留你拍的东西，比如商品、菜品、房间或宠物，只改它周围的样子。下面这些信息在本站每一页都一样。`,
  freeOffer: {
    heading: '免费 AI改图：你能得到什么',
    points: [
      {
        heading: `注册送 ${zhFreeImages}`,
        text: `每个新账号一次性获得 ${site.billing.freeCredits} 个免费积分，大多数模板够做 ${zhFreeImages}。免费积分不会每天或每月刷新。`,
      },
      {
        heading: '免费图公开带水印，付费图私密无水印',
        text: `用免费积分生成的图会公开展示，并带一个小小的 ${brand} 水印。用付费积分生成的图私密、无水印，可以商用。之后再买套餐，不会改变已经生成的图。`,
      },
    ],
    plans: plansText(),
    sample: { src: '/home/example-skincare-after.webp', alt: '', width: 900, height: 1125 },
  },
  costBills: productBills(
    `${SET_PHOTOS} 张商品图要花多少钱：请摄影师和用 ${brand} 对比`,
    `一个商品，${SET_PHOTOS} 张造型图，精修好、可以直接发。同样的活，两张账单。`,
  ),
  faq: [
    // A–I follow 建站规格 G6 in order, asked the way Chinese users ask (G13, 中文用户真实问法).
    // A's first sentence is the Chinese form of G6's fixed sentence: brand and keyword together.
    {
      question: '怎么把自己的照片变成 AI 图？',
      answer: `${brand} 是一个 AI改图工具：把你已有的照片换个样子，主体保持原样，只要 ${STEP_COUNT} 步——上传一张手机照片、选一个模板、选${zhTierList}。AI改图从你的照片出发，不是从一段文字描述开始，所以变的是光线、场景或画风，商品、菜品、房间或宠物还是你拍的那个。`,
    },
    {
      question: 'AI改图免费吗？',
      answer: `${brand} 给每个新用户送 ${zhFreeImages}，AI改图可以先免费试。之后每张 ${zhFromCredits}。${zhPlansSentence()}${creditFrom ? `折算下来，每个积分最低 ${creditFrom}。` : ''}免费生成的图带水印，也不是私密的。`,
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
    // I: the brand question, last.
    {
      question: `${brand} 是什么？`,
      answer: `${brand} 是一个网页版的 AI 照片工作室：用一张手机照片，套上菜品、商品、房间、宠物或画风模板，做出成品图。和凭提示词生成整张图的 AI 生图工具不同，${brand} 从你真实拍的照片出发，主体保持原样。新用户送 ${zhFreeImages}，之后每张 ${zhFromCredits}。`,
    },
  ],
  related: [
    { href: '/ai-restaurant-menu', anchor: 'AI菜单配图', note: '餐厅用手机拍菜，直接做成菜单和外卖平台的图。' },
    { href: '/commercial-photography', anchor: '商业产品摄影', note: '网店和卖家不请摄影师，也能做出影棚级商品图。' },
    { href: '/image-to-image-generator', anchor: '图生图在线工具', note: '想看看图生图对菜品、商品、房间和宠物照片的效果。' },
    { href: '/pricing', anchor: `${brand} 价格`, note: '店主、卖家和房东在月付、年付套餐和一次性积分包之间比较。' },
  ],
  headings: {
    facts: 'AI改图：哪些保持不变',
    faq: 'AI改图常见问题',
    related: 'AI改图：餐饮、商品、房间等场景',
  },
})
