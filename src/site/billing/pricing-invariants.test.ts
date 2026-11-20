import { readFileSync } from 'node:fs'

import { afterEach, describe, expect, it, vi } from 'vitest'

import { packPriceCents } from '@/core/billing/pack-price'
import { MEMBERSHIP_TIERS, type MembershipProduct, type SiteProduct } from '@/core/config'

import { privateDoc } from '../../../tests/support/private-docs'

// The 2026-11-21 terms (Owner: 「用只改积分的版本」, ARCHITECTURE §6.2), published as new
// /admin/products revisions: every price stays; Pro / Max get 5,500 / 11,500 credits a month and
// yearly 12 × that at 20% off on every plan (Max yearly $891 → $950.40, Owner: 「用 b」); M / L packs: members pay 100 / 95 / 90%. site.config keeps the revision-2 seed
// the database was created with (tests/db/product-catalog.test.ts), so the terms are written here.
const PACK_PAY = { starter: 100, pro: 95, max: 90 }
const TERMS: readonly SiteProduct[] = [
  { id: 'starter_monthly', tier: 'starter', interval: 'month', credits: 1990, paidDays: 30, priceUsd: 19.9 },
  { id: 'starter_yearly', tier: 'starter', interval: 'year', credits: 23880, paidDays: 365, priceUsd: 191.04 },
  { id: 'pro_monthly', tier: 'pro', interval: 'month', credits: 5500, paidDays: 30, priceUsd: 49.9 },
  { id: 'pro_yearly', tier: 'pro', interval: 'year', credits: 66000, paidDays: 365, priceUsd: 479.04 },
  { id: 'max_monthly', tier: 'max', interval: 'month', credits: 11500, paidDays: 30, priceUsd: 99 },
  { id: 'max_yearly', tier: 'max', interval: 'year', credits: 138000, paidDays: 365, priceUsd: 950.4 },
  { id: 'pack_s', tier: 'pack', interval: null, credits: 990, paidDays: null, priceUsd: 9.9 },
  { id: 'pack_m', tier: 'pack', interval: null, credits: 2490, paidDays: null, priceUsd: 24.9, packMemberPayPct: PACK_PAY },
  { id: 'pack_l', tier: 'pack', interval: null, credits: 4990, paidDays: null, priceUsd: 49.9, packMemberPayPct: PACK_PAY },
]

const cents = (p: SiteProduct) => Math.round(p.priceUsd * 100)
const monthly = (products: readonly SiteProduct[], tier: string) =>
  products.find((p): p is MembershipProduct => p.tier === tier && p.interval === 'month')!

// Invariant 1: a member's M / L pack never costs less per credit than that tier's monthly plan.
function memberPackBelowPlan(products: readonly SiteProduct[]): string[] {
  return products.filter(p => p.id === 'pack_m' || p.id === 'pack_l').flatMap(pack => MEMBERSHIP_TIERS.flatMap(tier => {
    const plan = monthly(products, tier)
    // pack cents / pack credits < plan cents / plan credits, in integers.
    return packPriceCents(pack, tier) * plan.credits < cents(plan) * pack.credits ? [`${pack.id}:${tier}`] : []
  }))
}

// Cheapest self-serve USD per credit: every plan, every pack, every member pack price.
function cheapestPerCredit(products: readonly SiteProduct[]): number {
  return Math.min(...products.flatMap(p => [null, ...MEMBERSHIP_TIERS].map(tier => packPriceCents(p, tier) / 100 / p.credits)))
}

describe('pricing invariants (ARCHITECTURE §6.2, 2026-11-21 terms)', () => {
  afterEach(() => { vi.unstubAllEnvs(); vi.resetModules() })

  it('keeps every member pack at or above its tier\'s monthly price per credit', () => {
    expect(memberPackBelowPlan(TERMS)).toEqual([])
  })

  it('fixes what the revision-2 terms broke: the Starter member pack undercut Starter monthly', async () => {
    vi.stubEnv('NEXT_PUBLIC_PRICING_CATALOG_VERSION', 'v2')
    vi.resetModules()
    const { site } = await import('../site.config')
    expect(memberPackBelowPlan(site.billing.products)).toEqual(['pack_m:starter', 'pack_l:starter'])
  })

  it('gives yearly twelve months of credits, saving the same share of price and of each credit', () => {
    const saving = MEMBERSHIP_TIERS.map(tier => {
      const plan = monthly(TERMS, tier)
      const year = TERMS.find(p => p.tier === tier && p.interval === 'year')!
      expect(year.credits).toBe(plan.credits * 12)
      return (1 - cents(year) / (cents(plan) * 12)) * 100
    })
    expect(saving.map(s => Math.round(s * 1e6) / 1e6)).toEqual([20, 20, 20])
  })

  // Invariant 2 and the enterprise margin rule. The tiers and the cost budget are private
  // (ARCHITECTURE §6.2 「企业包」 in shotviva-docs); skipped where that repo is absent (CI).
  const spec = privateDoc('规范', 'ARCHITECTURE.md')
  it.skipIf(!spec)('prices every enterprise tier at or below the cheapest self-serve credit, keeping the 60% typical margin target', () => {
    const text = readFileSync(spec!, 'utf8')
    const line = text.match(/^- \*\*企业包\*\*.*$/m)?.[0] ?? ''
    const tiers = [...line.matchAll(/\$([\d,]+) → ([\d,]+) 积分/g)].map(m => Number(m[1]!.replaceAll(',', '')) / Number(m[2]!.replaceAll(',', '')))
    expect(tiers.length, 'ARCHITECTURE §6.2 states the enterprise tiers').toBeGreaterThan(0)
    const budget = Number(text.match(/C_max = \$([\d.]+)\/积分/)?.[1])
    expect(budget).toBeGreaterThan(0)
    for (const perCredit of tiers) {
      expect(perCredit).toBeLessThanOrEqual(cheapestPerCredit(TERMS))
      // Offline transfer, no refund, no commission: the price is the take. Cost × 1.10 buffer.
      expect(1 - (budget * 1.1) / perCredit).toBeGreaterThanOrEqual(0.6)
    }
  })
})
