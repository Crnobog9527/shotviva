import { PRICE_PENDING } from '@/core/config'
import { MAX_UPLOAD_BYTES, UPLOAD_CONTENT_TYPES } from '@/core/storage/rules'

import { site } from '../../site.config'
import { OUTPUT_TIERS, PHOTOGRAPHER_HOURLY_USD, freeStandardImages, packFrom, planFrom, setCredits, usd, yearlySaving } from '../offer'

// The Chinese wording of every public number (建站规格 G3, §6.1): same figures as offer.ts,
// read from site.config, written the way mainland e-commerce sellers say it. Prices stay in
// US dollars; nothing is converted to RMB (§6.1 rule 8).

// 标准 / 高清 / 超清, the zh names of Standard / HD / Max (same as the app's messages).
export const ZH_TIERS = OUTPUT_TIERS.map((tier, i) => ({
  ...tier,
  name: (['标准', '高清', '超清'] as const)[i] ?? tier.name,
  use: (['社交媒体和外卖平台', '官网和网店', '印刷和放大查看'] as const)[i] ?? tier.use,
}))

const [STANDARD] = ZH_TIERS

// 「标准、高清或超清」
export const zhTierList = `${ZH_TIERS.slice(0, -1).map((t) => t.name).join('、')}或${ZH_TIERS.at(-1)?.name}`

// 「标准 1024 px、高清 2048 px、超清 2880 px」
export const zhTierPixels = ZH_TIERS.map((tier) => `${tier.name} ${tier.px} px`).join('、')

// 「2 积分起」
export const zhFromCredits = `${STANDARD?.credits ?? 2} 积分起`

// 「3 张免费标准图」: the only place the site counts in images instead of credits.
export const zhFreeImages = `${freeStandardImages} 张免费标准图`

export const zhSetCredits = `${setCredits} 积分`

const FORMATS: Record<string, string> = { 'image/jpeg': 'JPG', 'image/png': 'PNG', 'image/webp': 'WebP' }
const formats = UPLOAD_CONTENT_TYPES.map((type) => FORMATS[type] ?? type)
// 「JPG、PNG 或 WebP，最大 20MB」
export const zhUploadLimits = `${formats.slice(0, -1).join('、')} 或 ${formats.at(-1)}，最大 ${MAX_UPLOAD_BYTES / 1024 / 1024}MB`

const LANGUAGE_NAMES: Record<string, string> = { en: '英文', zh: '简体中文' }
export const zhLanguages = site.locales.enabled.map((code) => LANGUAGE_NAMES[code] ?? code).join('、')

// Same market rate as offer.ts (Snappr, US city, 2026), in dollars like every other figure.
export const zhPhotographerRate = `美国城市每小时 ${usd(PHOTOGRAPHER_HOURLY_USD.low)}–${usd(PHOTOGRAPHER_HOURLY_USD.high)}`

export const zhPlanFrom = planFrom ? `${usd(planFrom.priceUsd)}/月起` : PRICE_PENDING
export const zhPackFrom = packFrom ? `${usd(packFrom.priceUsd)} 起` : PRICE_PENDING
// 「按年付最多省 40%」: offer.ts's yearlySaving is the largest saving, rounded (DESIGN §6.9).
export const zhYearlySaving = yearlySaving ? `按年付最多省 ${yearlySaving}%` : ''

// 「套餐每月 $19.90 起，含 50 积分；也可以单买积分包，$9.90 起。」
export function zhPlansSentence(): string {
  if (!planFrom) return '付费套餐和积分包即将上线。'
  const packs = packFrom ? `；也可以单买积分包，${usd(packFrom.priceUsd)} 起` : ''
  return `套餐每月 ${usd(planFrom.priceUsd)} 起，含 ${planFrom.credits} 积分${packs}。`
}
