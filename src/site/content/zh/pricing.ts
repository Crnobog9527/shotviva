import type { BusinessBlock, CreditBuysBlock, FaqItem } from '@/core/content'

import { site } from '../../site.config'
import type { PricingContent } from '../pricing'
import { ZH_TIERS, zhFreeImages, zhFromCredits, zhPackFrom, zhTierList, zhYearlySaving } from './offer'

// /zh/pricing (T21, laid out as comps-v3-b pricing.html in T37). Keyword 「Shotviva 价格」;
// every figure from site.config through offer.ts, in US dollars only, never converted to RMB
// (建站规格 §6.1 rule 8, G3).
const brand = site.brand.name

const creditBuys: CreditBuysBlock = {
  heading: '一个积分能买什么',
  tiers: ZH_TIERS.map((tier) => ({ name: tier.name, credits: tier.credits })),
  unit: '积分',
  note: `大多数模板每张图的消耗，分别对应 ${ZH_TIERS.map((tier) => tier.px).join('、')} px。同一清晰度下，任何尺寸和比例的价格都一样。`,
}

// 能为企业安排的事，不是现成功能（Owner 2026-11-06：还没有后台和代码），所以不写 SLA、单点登录、团队账号。
const business: BusinessBlock = {
  heading: '企业合作',
  tag: '按需定制',
  who: '适合品牌、电商卖家、餐饮连锁和代运营公司这类需要大批量出图的团队。告诉我们你需要什么，我们来为你安排：',
  items: [
    { title: '批量价格和发票付款', detail: '按每月出图量给更低的单张价，可签年度合同、按发票付款。' },
    { title: '专属模板', detail: '按你的品牌规范、产品线和平台规格定制，整个商品目录风格统一。' },
    { title: '更大的并发和批量', detail: '一次处理整个商品目录，不用一张一张来。' },
    { title: 'API 接入', detail: `把 ${brand} 接进你的商品系统或店铺，自动出图。` },
    { title: '隐私和数据条款', detail: '作品保持私密，需要时可以签数据处理协议。' },
    { title: '专人对接', detail: '一位专人负责上手培训和优先支持。' },
  ],
  cta: '联系我们',
  aside: ['也可以直接写信到 ', '，附上每月出图量和使用的平台。'],
  prompts: ['公司名称：', '每月大概出图量：', '用在哪些平台（电商平台、外卖平台、自己的网站）：', '想定制什么（模板、API、发票付款）：'],
}

const yearly = zhYearlySaving ? `${zhYearlySaving}。` : ''

const faq: readonly FaqItem[] = [
  { question: '积分会过期吗？', answer: '不会。付费积分永不过期，套餐续费时没用完的积分会继续保留。' },
  {
    question: '免费图包含什么？',
    answer: `新用户一次性获得 ${zhFreeImages}。用免费积分生成的图公开展示并带水印；用付费积分生成的图私密、无水印，可以商用。`,
  },
  {
    question: '不订阅能单买积分吗？',
    answer: '可以。积分包是一次性付款，所有人都能买，得到的付费积分和套餐里的一样。',
  },
  {
    question: '能用支付宝付款吗？',
    answer: '可以。用支付宝买套餐是一次性付款，买一个月或一年，到期不会自动扣款；积分包也能用支付宝买。价格同样以美元计。',
  },
  {
    question: '怎么取消套餐？',
    answer: '打开「我的」页面，点「管理订阅」。套餐会在已付费周期结束时到期，积分留在你的账号里。',
  },
]

// Waffo channel: every purchase is one-time (ARCHITECTURE §6.3), so no cancel question and no
// renewal wording.
const CANCEL_QUESTION = '怎么取消套餐？'
const oneTimeFaq = faq
  .filter((item) => item.question !== CANCEL_QUESTION)
  .map((item) => {
    if (item.question === '积分会过期吗？') return { ...item, answer: '不会。付费积分永不过期，没用完的积分会一直留在你的账号里。' }
    if (item.question === '能用支付宝付款吗？') return { ...item, answer: '可以。所有套餐和积分包都是一次性付款，到期不会自动扣款。价格同样以美元计。' }
    return item
  })

export const zhPricingPage: PricingContent = {
  path: '/pricing',
  label: '价格',
  title: `${brand} 价格：积分和套餐，美元计价（2026）`,
  description: `${brand} 价格：入门版、专业版、旗舰版套餐，按月或按年付，另有一次性积分包。新用户送 ${zhFreeImages}，积分永不过期。`,
  h1: `${brand} 价格：按月付、按年付，或一次性买积分`,
  h1Em: '',
  intro: `用付费积分生成的图私密、无水印。一张图 ${zhFromCredits}，取决于模板和你选的${zhTierList}。${yearly}积分包 ${zhPackFrom}。所有价格以美元计。`,
  gift: `新用户送 ${zhFreeImages}，不用绑卡。`,
  creditBuys,
  business,
  headings: { faq: '价格常见问题' },
  faq,
  oneTime: { faq: oneTimeFaq },
}
