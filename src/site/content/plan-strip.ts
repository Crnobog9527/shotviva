import type { PlanCard, PlanStrip } from '@/core/content'
import { MEMBERSHIP_TIERS, type MembershipTier, type SiteProduct } from '@/core/config'
import { TIER_LIMITS } from '@/core/billing/tier-limits'

import { product, usd } from './offer'

// The home page's three monthly plans (SEO launch handbook G10). Prices come from the published
// catalog the page renders with (the fixed `<tier>_monthly` ids, ARCHITECTURE §6.2), concurrency
// from the tier table the server enforces; never a photo count (Owner, #417). Undefined while any
// monthly plan is unpublished or undecided (product() skips a $0 price), so the strip never shows
// a gap or "$0".
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

const NAMES: Record<MembershipTier, string> = { starter: 'Starter', pro: 'Pro', max: 'Max' }

function monthlyPlans(products: readonly SiteProduct[]): Plan[] | undefined {
  const plans = MEMBERSHIP_TIERS.map((tier) => {
    const monthly = product(`${tier}_monthly`, products)
    return monthly && monthly.tier === tier ? { name: NAMES[tier], monthly: { ...monthly, tier } } : undefined
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

function planStrip(words: Words, products: readonly SiteProduct[]): PlanStrip | undefined {
  const plans = monthlyPlans(products)
  if (!plans) return undefined
  const [starter, pro, max] = plans.map((plan) => card(plan, words))
  if (!starter || !pro || !max) return undefined
  return { label: words.label, href: '/pricing', cards: [starter, pro, max], more: words.more }
}

export const homePlans = (products: readonly SiteProduct[]) => planStrip({
  label: 'Monthly plans',
  per: '/mo',
  more: 'Compare all plans and credit packs',
  credits: (n) => `${n} credits a month`,
  concurrency: (n) => (n === 1 ? '1 photo generating at a time' : `${n} photos generating at a time`),
}, products)

// Tier names as the Chinese paywall shows them (messages paywall.tiers).
export const zhHomePlans = (products: readonly SiteProduct[]) => planStrip({
  names: { starter: '入门版', pro: '专业版', max: '旗舰版' },
  label: '月付套餐',
  per: '/月',
  more: '比较全部套餐和积分包',
  credits: (n) => `每月 ${n} 积分`,
  concurrency: (n) => `同时生成 ${n} 张`,
}, products)
