import { defineHomePage, type HeadedText, type HomePage } from '@/core/content'

import { site } from '../../site.config'
import { creditFrom, planFrom, usd } from '../offer'
import { zhTemplateCategories } from './featured-templates'
import {
  ZH_TIERS,
  zhFreeImages,
  zhFromCredits,
  zhPhotographerRate,
  zhPlansSentence,
  zhTierList,
  zhTierPixels,
  zhUploadLimits,
  zhYearlySaving,
} from './offer'
import { zhPlaceholderHero, zhSharedCostTable, zhSharedFacts } from './shared'

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
  hero: zhPlaceholderHero('同一张照片、同一个主体：模板只换了光线和背景。'),
  demoNote: `一张手机照片就能做出一整套图：白底主图、生活场景图和促销海报，用的都是同一个商品。请摄影师拍这样一套，价格通常是${zhPhotographerRate}。`,
  steps,
  templateGrid: {
    heading: 'AI改图模板：不用写提示词',
    intro: `每个模板都从你的手机照片开始，到一张成品图结束。选一个，剩下的交给 ${brand}。每张${zhFromCredits}。`,
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
  },
  costTable: zhSharedCostTable(),
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
    { href: '/image-to-image-generator', anchor: '图生图在线工具', note: '想看看图生图对菜品、商品、房间和宠物照片的效果。' },
    { href: '/pricing', anchor: `${brand} 价格`, note: '店主、卖家和房东在月付、年付套餐和一次性积分包之间比较。' },
  ],
  headings: {
    facts: 'AI改图：哪些保持不变',
    costTable: `请摄影师和用 ${brand} 的对比`,
    faq: 'AI改图常见问题',
    related: 'AI改图：餐饮、商品、房间等场景',
  },
})
