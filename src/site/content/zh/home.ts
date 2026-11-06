import { defineHomePage, type HeadedText } from '@/core/content'

import { site } from '../../site.config'
import { planFrom, usd } from '../offer'
import { zhTemplateCategories } from './featured-templates'
import {
  ZH_TIERS,
  zhFreeImages,
  zhFromCredits,
  zhPhotographerRate,
  zhPlansSentence,
  zhTierList,
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
  steps: {
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
  },
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
    {
      question: '怎么把自己的照片变成 AI 图？',
      answer: `上传一张照片，选一个模板就行。AI改图是用你已有的照片生成新图，而不是从一段文字描述开始。在 ${brand} 上，主体保持不变，换的是光线、场景或画风。`,
    },
    {
      question: 'AI改图免费吗？',
      answer: `可以免费开始：新用户送 ${zhFreeImages}。之后每张${zhFromCredits}。${zhPlansSentence()}免费图会公开展示并带水印。`,
    },
    {
      question: 'AI改图会不会把我照片里的东西改掉？',
      answer: `很多工具会重画主体。${brand} 的模板专门保留你拍的样子，比如商品标签、摆盘或房间布局，只改光线、背景、场景或画风。我们不做人像美颜修图。`,
    },
    {
      question: 'AI改图和 AI 生图有什么区别？',
      answer: 'AI 生图从一段提示词开始，整张图都是生成出来的。AI改图从你的照片开始，主体是真实拍的，也不用你去描述它。',
      link: { href: '/image-to-image-generator', anchor: '看看图生图工具怎么用。' },
    },
    {
      question: 'AI 生成的图片可以商用吗？',
      answer: '用付费积分生成的可以：这些图私密、无水印，可以用在网店、菜单、房源或广告里。用免费积分生成的图会公开展示并带水印。',
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
