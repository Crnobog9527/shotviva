import { defineContentPage } from '@/core/content'

import { site } from '../../../site.config'
import { homeImage, pickCategories } from '../../landing-shared'
import { dayRateUsd, packshotUsd, SET_PHOTOS, styledShotUsd, usdRange } from '../../offer'
import { PLATFORM_SPECS, px } from '../../platform-specs'
import { zhTemplateCategories } from '../featured-templates'
import { productBills, shoot } from '../home'
import { ZH_TIERS, zhFreeImages, zhFromCredits, zhPlansSentence, zhTierList } from '../offer'

// /zh/commercial-photography (T44, ARCHITECTURE §17): noindex until GSC shows Chinese queries
// (中文口径主词表: 「暂不建」, keyword 商业摄影). Written for sellers who ask 「产品拍照一般多少钱」,
// not translated. Same platform figures and prices as the English page, in US dollars.
const brand = site.brand.name
const [, hd, max] = ZH_TIERS
const { amazon, etsy, shopify } = PLATFORM_SPECS

export const zhCommercialPhotography = defineContentPage({
  slug: 'commercial-photography',
  keyword: '商业摄影',
  label: '商业产品摄影',
  module: 'image',
  title: `商业摄影不用进影棚：手机照片出商品图（2026） | ${brand}`,
  description: `商业摄影的活，用一张手机照片就能做：白底主图、生活场景和促销海报，造型和精修都在模板里。新用户送 ${zhFreeImages}。`,
  h1: '商业摄影：一张手机照片，不用约影棚',
  subtitle: '白底主图、生活场景、促销海报，都从你已经拍好的那张商品照出来。',
  answerBlock: `商业摄影对小品牌来说，通常意味着订一天影棚、请摄影师和修图师。${brand} 用一张手机照片做同样的活：上传照片，选「纯白底图」或「生活场景」这类模板，就能下载造型好、精修过的商品图，有${zhTierList}三档。新用户送 ${zhFreeImages}。`,
  hero: {
    before: homeImage('hero-set-phone', '手机随手拍：厨房台面上的一只编织皮托特包，窗边自然光（示意图）'),
    after: homeImage('hero-set-lifestyle', '同一只包放在窗边的咖啡馆椅子上，早晨暖光，生活场景模板（示意图）'),
    caption: '你的手机照片 → 生活场景模板：还是这只包，换成布置好的场景 · 示意图',
    cta: { label: '上传照片', href: '/generate' },
  },
  facts: [
    {
      label: `Amazon：主图纯白底，${px(amazon.zoomPx)} px 以上可放大`,
      value: `Amazon 要求主图是纯白背景，最长边 ${px(amazon.minPx)}～${px(amazon.maxPx)} px，超过 ${px(amazon.zoomPx)} px 买家才能放大看。纯白底图选${hd?.name ?? ''}是 ${px(hd?.px ?? 0)} px。`,
    },
    {
      label: `Etsy 和 Shopify：${px(etsy.minPx)} px 起`,
      value: `Etsy 要求图片宽高都至少 ${px(etsy.minPx)} px；Shopify 说方图用 ${px(shopify.squarePx)} × ${px(shopify.squarePx)} px 显示效果通常最好。${hd?.name ?? ''}（${px(hd?.px ?? 0)} px）和${max?.name ?? ''}（${px(max?.px ?? 0)} px）都够。`,
    },
    {
      label: '图里还是你的商品',
      value: `平台都要求图片展示真实的商品，Etsy 现在还要求每个商品至少有一张未经编辑的实拍图。${brand} 从你的照片出发，商品保持原样；上架前请查看各平台当下的规定。`,
    },
  ],
  costBills: productBills(
    `一次商品拍摄要花多少钱：请摄影师和用 ${brand} 对比`,
    `一个商品，${SET_PHOTOS} 张造型图，精修好、可以直接上架。同样的活，两张账单。`,
    `；影棚一天 ${usdRange(dayRateUsd)}（Shopify，2026 年 1 月）`,
  ),
  faq: [
    {
      question: '产品拍照一般多少钱？',
      answer: `按美国 2026 年的公开报价，白底产品图每张 ${usdRange(packshotUsd)}，造型图每张 ${usdRange(styledShotUsd)}，影棚一天 ${usdRange(dayRateUsd)}。${brand} 用你自己的手机照片做一张造型、精修好的商品图，${zhFromCredits}。${zhPlansSentence()}`,
    },
    {
      question: 'AI 能代替产品摄影师吗？',
      answer: '白底主图、生活场景和促销图这类，只要商品能用手机拍清楚，就可以：造型和精修由模板完成。要请模特、搭道具、做整套创意的广告片，还是值得请摄影师。',
    },
    {
      question: 'AI 商品图能用在 Amazon 和 Etsy 上吗？',
      answer: `两个平台都要求图片如实展示真实的商品，Etsy 现在还要求每个商品至少有一张未经编辑的实拍图。${brand} 从你的照片出发，只换背景、光线和场景。规则会变，上架前请查看平台当下的图片要求。`,
    },
    {
      question: '生成的图片版权归我吗？',
      answer: `归你。用付费积分生成的图私密、无水印，可以用在商品页、广告和社交媒体上。${zhFreeImages}生成的图公开展示，带水印。`,
    },
    {
      question: '手机照片要怎么拍？',
      answer: '白天光线，商品对上焦，前面别有东西挡着。背景乱一点没关系，模板会换掉它。',
    },
  ],
  related: [
    { href: '/', anchor: 'AI改图', note: '全部模板，按餐饮、商品、美妆、房间、宠物和画风分类。' },
    { href: '/image-to-image-generator', anchor: '图生图在线工具', note: '想看看图生图对一张照片能做什么。' },
    { href: '/ai-restaurant-menu', anchor: 'AI菜单配图', note: '餐厅用手机拍菜，直接做成菜单和外卖平台的图。' },
  ],
  headings: {
    facts: '电商平台对商品图的要求',
    faq: '商业产品摄影常见问题',
    related: `${brand} 的其他页面`,
  },
  landing: {
    generatorTemplate: 'pure-white',
    factsNote: '以上来自各平台自己的帮助页面（Amazon、Etsy、Shopify），2026 年 11 月核对。平台规则会变，上架前请再确认。',
    shoot,
    templates: {
      heading: '商品图模板：主图、场景和海报',
      intro: `每个模板都从你的商品手机照片开始，到一张成品图结束，${zhFromCredits}。`,
      categories: pickCategories(zhTemplateCategories, ['products', 'beauty']),
    },
  },
})
