import type { PlanCard, PlanStrip } from '@/core/content'
import type { MembershipTier, SiteProduct } from '@/core/config'
import { TIER_LIMITS } from '@/core/billing/tier-limits'

import { PLAN_TIERS, product, usd } from './offer'

// The home page's three monthly plans (SEO launch handbook G10). Plans, names and prices come
// from offer.ts (PLAN_TIERS, product(), usd()), concurrency from the tier table the server
// enforces; never a photo count (Owner, #417). Undefined while any monthly price is undecided
// (product() skips a $0 price), so the strip never shows a gap or "$0".
type Words = {
  // Tier names for this language; undefined: PLAN_TIERS' English names.
  names?: Record<MembershipTier, string>
  label: string
  per: string
  more: string
  credits: (count: string) => string
  concurrency: (count: number) => string
}

type Plan = { name: string; monthly: SiteProduct & { tier: MembershipTier } }

function monthlyPlans(): Plan[] | undefined {
  const plans = PLAN_TIERS.map((tier) => {
    const monthly = product(tier.monthly)
    return monthly && monthly.tier !== 'pack' ? { name: tier.name, monthly: { ...monthly, tier: monthly.tier } } : undefined
  })
  return plans.every((plan) => plan !== undefined) ? plans : undefined
}

function card({ name, monthly }: Plan, words: Words): PlanCard {
  return {
    name: words.names?.[monthly.tier] ?? name,
    price: usd(monthly.priceUsd),
    per: words.per,
    credits: words.credits(monthly.credits.toLocaleString('en-US')),
    concurrency: words.concurrency(TIER_LIMITS[monthly.tier].concurrency),
  }
}

function planStrip(words: Words): PlanStrip | undefined {
  const plans = monthlyPlans()
  if (!plans) return undefined
  const [starter, pro, max] = plans.map((plan) => card(plan, words))
  if (!starter || !pro || !max) return undefined
  return { label: words.label, href: '/pricing', cards: [starter, pro, max], more: words.more }
}

export const homePlans = planStrip({
  label: 'Monthly plans',
  per: '/mo',
  more: 'Compare all plans and credit packs',
  credits: (n) => `${n} credits a month`,
  concurrency: (n) => (n === 1 ? '1 photo generating at a time' : `${n} photos generating at a time`),
})

// Tier names as the Chinese paywall shows them (messages paywall.tiers).
export const zhHomePlans = planStrip({
  names: { starter: '入门版', pro: '专业版', max: '旗舰版' },
  label: '月付套餐',
  per: '/月',
  more: '比较全部套餐和积分包',
  credits: (n) => `每月 ${n} 积分`,
  concurrency: (n) => `同时生成 ${n} 张`,
})
