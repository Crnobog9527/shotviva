import { MEMBERSHIP_TIERS, PRICE_PENDING, type SiteProduct } from '@/core/config'
import { memberPackOff, packNoteValues } from '@/core/billing/paywall/perks'
import { MAX_UPLOAD_BYTES, UPLOAD_CONTENT_TYPES } from '@/core/storage/rules'

import { site } from '../../site.config'
import { type OfferFacts, baselineOffers, OUTPUT_TIERS, packFrom, planFrom, usd, yearlySaving } from '../offer'
import type { YearlySaving } from '@/core/billing/paywall/offer'

// The Chinese wording of every public number (建站规格 G3, §6.1): same figures as offer.ts,
// read from site.config, written the way mainland e-commerce sellers say it. Prices stay in
// US dollars; nothing is converted to RMB (§6.1 rule 8).

// The tier names are 1K / 2K / 4K in both languages (same as the app's messages).
export const ZH_TIERS = OUTPUT_TIERS.map((tier, i) => ({
  ...tier,
  use: (['社交媒体和外卖平台', '官网和网店', '印刷和放大查看'] as const)[i] ?? tier.use,
}))

// 「1K、2K 或 4K」
export const zhTierList = `${ZH_TIERS.slice(0, -1).map((t) => t.name).join('、')} 或 ${ZH_TIERS.at(-1)?.name}`

// 「1K 1024 px、2K 2048 px、4K 2880 px」（方图边长）
export const zhTierPixels = ZH_TIERS.map((tier) => `${tier.name} ${tier.px} px`).join('、')

// 「N 积分起」: filled when the page renders, like fromCredits (../credits).
export const zhFromCredits = '⟦积分起价⟧'

export const zhFreeImages = `${site.billing.freeCredits} 个免费积分`

const FORMATS: Record<string, string> = { 'image/jpeg': 'JPG', 'image/png': 'PNG', 'image/webp': 'WebP' }
const formats = UPLOAD_CONTENT_TYPES.map((type) => FORMATS[type] ?? type)
// 「JPG、PNG 或 WebP，最大 20MB」
export const zhUploadLimits = `${formats.slice(0, -1).join('、')} 或 ${formats.at(-1)}，最大 ${MAX_UPLOAD_BYTES / 1024 / 1024}MB`

const LANGUAGE_NAMES: Record<string, string> = { en: '英文', zh: '简体中文' }
export const zhLanguages = site.locales.enabled.map((code) => LANGUAGE_NAMES[code] ?? code).join('、')

export const zhPlanFrom = planFrom ? `${usd(planFrom.priceUsd)}/月起` : PRICE_PENDING
export const zhPackFrom = packFrom ? `${usd(packFrom.priceUsd)} 起` : PRICE_PENDING
// 「年付送 2 个月，比按月付约省 17%」(pricing O2), else 「按年付最多省 25%」: the saving each plan
// really gets (offer.yearlySaving, DESIGN §6.9).
export function zhYearlyClaim({ pct, upTo, freeMonths }: YearlySaving): string {
  if (freeMonths) return `年付送 ${freeMonths} 个月，比按月付约省 ${pct}%`
  return `按年付${upTo ? '最多' : ''}省 ${pct}%`
}
// 「中包和大包按当前会员等级享折扣，入门版原价、专业版 95 折、旗舰版 9 折。」 from the listed
// M / L packs (each revision has its own member rate); empty when none is discounted.
export function zhMemberPacksSentence(products: readonly SiteProduct[]): string {
  const off = memberPackOff(products)
  if (!off || MEMBERSHIP_TIERS.every(t => off[t] === 0)) return ''
  const v = packNoteValues(off)
  return `中包和大包按当前会员等级享折扣，入门版${v.starterZh}、专业版${v.proZh}、旗舰版${v.maxZh}。`
}
export const zhYearlySaving = yearlySaving ? zhYearlyClaim(yearlySaving) : ''

export function planLabel(plan: OfferFacts['planFrom']) {
  if (!plan) return '月付套餐'
  const names = { starter: '入门版', pro: '专业版', max: '旗舰版' }
  return `${names[plan.tier]}，每月 ${plan.credits} 积分`
}

// 「套餐每月 $19.90 起，含 50 积分；也可以单买积分包，$9.90 起。」
export function zhPlansSentence({ planFrom, packFrom } = baselineOffers): string {
  if (!planFrom) return packFrom ? `一次性积分包 ${usd(packFrom.priceUsd)} 起。` : '付费套餐和积分包即将上线。'
  const packs = packFrom ? `；也可以单买积分包，${usd(packFrom.priceUsd)} 起` : ''
  return `套餐每月 ${usd(planFrom.priceUsd)} 起，含 ${planFrom.credits} 积分${packs}。`
}
