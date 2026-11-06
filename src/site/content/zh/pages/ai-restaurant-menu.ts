import { defineContentPage, type CostBills } from '@/core/content'

import { site } from '../../../site.config'
import { CATEGORY, pairImage, SIZE_COUNT } from '../../landing-shared'
import { foodHalfDayUsd, MENU_DISHES, menuCostUsd, menuCredits, photoSeconds, photosLeftAfterMenu, planFrom, usd, usdRange } from '../../offer'
import { PLATFORM_SPECS, px } from '../../platform-specs'
import { ZH_TIERS, zhFreeImages, zhFromCredits, zhTierList } from '../offer'

// /zh/ai-restaurant-menu (T44, ARCHITECTURE §17): noindex (中文口径主词表: 「暂不建」, keyword
// ai菜单). For restaurant owners who put dishes on delivery apps; the US apps' figures are kept
// because they are what the page is about. Same prices as the English page, in US dollars.
const brand = site.brand.name
const [standard, hd] = ZH_TIERS
const { doordash, uberEats, grubhub } = PLATFORM_SPECS

function menuBills(): CostBills {
  const plan = planFrom ? usd(planFrom.priceUsd) : ''
  return {
    heading: `菜单配图要花多少钱：请美食摄影师和用 ${brand} 对比`,
    intro: `${MENU_DISHES} 道菜，做菜单和外卖平台用。同样的活，两张账单。`,
    photographer: {
      title: '美食摄影师报价',
      total: { amount: usdRange(foodHalfDayUsd), when: '拍半天，另加修图' },
      lines: [
        { label: '半天美食拍摄', value: usdRange(foodHalfDayUsd) },
        { label: '食物造型师', value: '通常另算' },
        { label: '预约、拍摄、修图', value: '几天' },
      ],
      fine: `美国 2025～2026 年公开的半天美食拍摄价格（PricingLink、Jobbers、FoodShot）：大约 ${usdRange(foodHalfDayUsd)}；食物造型师通常另外收费。实际报价因人而异。`,
    },
    site: {
      title: brand,
      total: { amount: plan, suffix: '/月起', when: `每张 ${photoSeconds} 秒左右` },
      lines: [
        { label: `入门版，每月 ${planFrom?.credits ?? ''} 积分`, value: plan },
        { label: `${MENU_DISHES} 道菜，${standard?.name ?? ''}`, value: `${menuCredits} 积分 ≈ ${menuCostUsd ?? ''}` },
        { label: '这个月还能再做', value: `${photosLeftAfterMenu ?? ''} 张` },
      ],
      fine: `每道菜在出菜口用手机拍一张，光线和造型交给模板。先用 ${zhFreeImages}试试，不用绑卡。`,
    },
  }
}

export const zhAiRestaurantMenu = defineContentPage({
  slug: 'ai-restaurant-menu',
  keyword: 'ai菜单',
  label: 'AI菜单配图',
  module: 'image',
  title: `AI菜单配图：手机拍的菜直接做成外卖图（2026） | ${brand}`,
  description: `AI菜单配图：用你已经拍好的菜品照片，做成菜单、外卖平台和促销图，盘里的菜保持原样。新用户送 ${zhFreeImages}。`,
  h1: 'AI菜单配图：手机拍一张，菜单图就有了',
  subtitle: '你店里本来就在卖的菜，在出菜口用手机拍一张，就能做成菜单、外卖和促销图。',
  answerBlock: `AI菜单配图是从你已经拍好的菜品照片出发，做成菜单图、外卖平台图或促销图，盘里的菜保持原样。在 ${brand} 上传一张手机照片，选「外卖菜单」「暗调氛围」或「促销海报」模板，就能下载${zhTierList}的成图。新用户送 ${zhFreeImages}。`,
  hero: {
    before: pairImage('example-dish-before', '手机随手拍：后厨出菜口上的一盘菜，顶灯偏硬（示意图）'),
    after: pairImage('example-dish-after', '同一盘菜做成明亮的外卖平台图，柔和日光，外卖菜单模板（示意图）'),
    caption: '你的手机照片 → 外卖菜单模板：还是这盘菜，光线更亮 · 示意图',
    cta: { label: '上传照片', href: '/generate' },
  },
  facts: [
    {
      label: `DoorDash：横版 ${doordash.ratio}，至少 ${px(doordash.minW)} × ${px(doordash.minH)} px`,
      value: `DoorDash 要求横版 ${doordash.ratio}、至少 ${px(doordash.minW)} × ${px(doordash.minH)} px，而且必须是实际出餐的那道菜。横幅 16:9 选${hd?.name ?? ''}是 ${px(hd?.px ?? 0)} × ${px(Math.round(((hd?.px ?? 0) * 9) / 16))} px。`,
    },
    {
      label: 'Uber Eats 和 Grubhub',
      value: `Uber Eats 建议 ${uberEats.ratio}、至少 ${px(uberEats.minW)} × ${px(uberEats.minH)} px，一张图只放一道菜；Grubhub 用方图，至少 ${px(grubhub.minPx)} × ${px(grubhub.minPx)} px。3:2 适合 Uber Eats，1:1 适合 Grubhub；${SIZE_COUNT} 种尺寸都导出 PNG。`,
    },
    {
      label: '菜还是那道菜',
      value: `外卖平台要的是你实际卖的菜。${brand} 从你自己的手机照片出发，只换光线和背景，不改菜本身。`,
    },
  ],
  costBills: menuBills(),
  faq: [
    {
      question: '外卖平台的菜单能用 AI 图吗？',
      answer: `外卖平台要求图片展示你实际出餐的菜。${brand} 从你自己的手机照片出发，盘里的菜保持原样，只换光线和背景，所以图里还是你的菜。上传前请查看平台当下的图片规定。`,
    },
    {
      question: '菜单图片要多大尺寸？',
      answer: `DoorDash 要横版 ${doordash.ratio}、至少 ${px(doordash.minW)} × ${px(doordash.minH)} px，Uber Eats 是 ${uberEats.ratio}，Grubhub 用方图。印刷菜单和社交媒体常用 4:5 或 1:1。${brand} 导出 PNG，分${zhTierList}三档，${SIZE_COUNT} 种尺寸。`,
    },
    {
      question: '请美食摄影师要多少钱？',
      answer: `按美国的公开报价，拍半天大约 ${usdRange(foodHalfDayUsd)}，食物造型师通常另外收费。${brand} 用你的手机照片做一张菜单图，${zhFromCredits}。`,
    },
    {
      question: '要自己写提示词吗？',
      answer: '不用。选「外卖菜单」「暗调氛围」或「促销海报」，光线和造型由模板决定。只有一行选填的「有什么想改的？」，比如写「辣椒油要看得见」。',
    },
    {
      question: '能直接做整张菜单吗？',
      answer: `它做的是照片，一次一道菜，另外可以做一张促销海报。排版整张多道菜的菜单或价目表，${brand} 不做。`,
    },
  ],
  related: [
    { href: '/', anchor: 'AI改图', note: '全部模板，按餐饮、商品、美妆、房间、宠物和画风分类。' },
    { href: '/commercial-photography', anchor: '商业产品摄影', note: '网店和卖家不请摄影师，也能做出影棚级商品图。' },
    { href: '/image-to-image-generator', anchor: '图生图在线工具', note: '想看看图生图对一张照片能做什么。' },
  ],
  headings: {
    facts: '菜单和外卖平台的图片尺寸',
    faq: 'AI菜单配图常见问题',
    related: `${brand} 的其他页面`,
  },
  landing: {
    factsNote: '以上来自各外卖平台自己的商家帮助页面（DoorDash、Uber Eats、Grubhub），2026 年 11 月核对。平台规则会变，上传前请再确认。',
    templates: {
      heading: '菜单配图模板：外卖平台、菜单和海报',
      intro: `每个模板都从你的菜品手机照片开始，到一张能上菜单的图结束，${zhFromCredits}。`,
      categoryKeys: [CATEGORY.food],
    },
  },
})
