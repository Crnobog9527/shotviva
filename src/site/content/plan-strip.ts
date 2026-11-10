import type { PlanCard, PlanStrip } from '@/core/content'
import { MEMBERSHIP_TIERS, type MembershipTier } from '@/core/config'
import { TIER_LIMITS } from '@/core/billing/tier-limits'

import { site } from '../site.config'
import { usd } from './offer'

// The home page's three monthly plans (SEO launch handbook G10). Prices and credits from
// site.config, concurrency from the tier table the server enforces; never a photo count
// (Owner, #417). Undefined while a monthly plan is missing, so the strip never shows a gap.
type Words = {
  names: Record<MembershipTier, string>
  label: string
  per: string
  more: string
  credits: (count: string) => string
  concurrency: (count: number) => string
}

const count = (n: number) => n.toLocaleString('en-US')

function card(tier: MembershipTier, words: Words): PlanCard | undefined {
  const monthly = site.billing.products.find((product) => product.tier === tier && product.interval === 'month')
  if (!monthly) return undefined
  return {
    name: words.names[tier],
    price: usd(monthly.priceUsd),
    per: words.per,
    credits: words.credits(count(monthly.credits)),
    concurrency: words.concurrency(TIER_LIMITS[tier].concurrency),
  }
}

function planStrip(words: Words): PlanStrip | undefined {
  const [starter, pro, max] = MEMBERSHIP_TIERS.map((tier) => card(tier, words))
  if (!starter || !pro || !max) return undefined
  return { label: words.label, href: '/pricing', cards: [starter, pro, max], more: words.more }
}

// Tier names as the paywall shows them (messages paywall.tiers).
export const homePlans = planStrip({
  names: { starter: 'Starter', pro: 'Pro', max: 'Max' },
  label: 'Monthly plans',
  per: '/mo',
  more: 'Compare all plans and credit packs',
  credits: (n) => `${n} credits a month`,
  concurrency: (n) => (n === 1 ? '1 photo generating at a time' : `${n} photos generating at a time`),
})

export const zhHomePlans = planStrip({
  names: { starter: '入门版', pro: '专业版', max: '旗舰版' },
  label: '月付套餐',
  per: '/月',
  more: '比较全部套餐和积分包',
  credits: (n) => `每月 ${n} 积分`,
  concurrency: (n) => `同时生成 ${n} 张`,
})
