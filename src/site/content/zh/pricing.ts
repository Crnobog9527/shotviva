import type { FaqItem } from '@/core/content'

import { site } from '../../site.config'
import { PACKS, PLAN_TIERS, creditsOf, perCredit, priceOf } from '../offer'
import type { PricingContent, PricingTable } from '../pricing'
import { ZH_TIERS, zhFreeImages, zhPackFrom, zhPlanFrom, zhYearlySaving } from './offer'

// /zh/pricing (T21). Keyword 「Shotviva 价格」; every figure from site.config through offer.ts,
// in US dollars only, never converted to RMB (建站规格 §6.1 rule 8, G3).
const brand = site.brand.name

const PLAN_NAMES: Record<string, string> = { Starter: '入门版', Pro: '专业版', Max: '旗舰版' }
const PACK_NAMES: Record<string, string> = { pack_s: '小包', pack_m: '中包', pack_l: '大包' }

const plansTable: PricingTable = {
  caption: '按月和按年的套餐',
  headers: ['套餐', '按月', '每月积分', '按年', '每年积分（一次到账）', '按年时每积分'],
  rows: PLAN_TIERS.map((tier) => [
    PLAN_NAMES[tier.name] ?? tier.name,
    priceOf(tier.monthly),
    creditsOf(tier.monthly),
    priceOf(tier.yearly),
    creditsOf(tier.yearly),
    perCredit(tier.yearly),
  ]),
}

const packsTable: PricingTable = {
  caption: '一次性积分包，人人可买',
  headers: ['积分包', '价格', '积分', '每积分'],
  rows: PACKS.map((pack) => [PACK_NAMES[pack.id] ?? pack.name, priceOf(pack.id), creditsOf(pack.id), perCredit(pack.id)]),
}

const photoCostTable: PricingTable = {
  caption: '大多数模板每张图消耗多少',
  headers: ['清晰度', '像素', '适合', '积分'],
  rows: ZH_TIERS.map((tier) => [tier.name, `${tier.px} px`, tier.use, String(tier.credits)]),
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
  h1: `${brand} 价格与积分`,
  intro: `每个新账号送 ${zhFreeImages}。之后按积分付费：一张图消耗几个积分，取决于模板和你选的清晰度。可以选套餐（${zhPlanFrom}），只需要几张图时也可以买积分包（${zhPackFrom}）。${yearly}所有价格以美元计。`,
  tables: { plans: plansTable, packs: packsTable, photoCost: photoCostTable },
  headings: { payment: '怎么付款', faq: '价格常见问题' },
  payment: [
    '银行卡、Apple Pay 或 Google Pay：套餐自动续费，随时可以取消。取消后只是不再续费，积分会保留。',
    '支付宝：一次性支付一个月或一年的套餐，不自动续费。',
    '积分包一律一次性付款，不开套餐也能买。',
  ],
  faq,
  oneTime: {
    payment: ['银行卡或支付宝：一次性支付一个月或一年的套餐，到期后想继续用再买一次。', '积分包一律一次性付款，不开套餐也能买。'],
    faq: oneTimeFaq,
  },
}
