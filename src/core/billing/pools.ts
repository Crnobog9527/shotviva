// Two balances (ARCHITECTURE §6.1): 'free' (signup / promo gifts, makes free works: public,
// watermarked) and 'paid' (purchases and compensation, makes paid works: private by default,
// clean, commercial use). Each work records the pool it was charged from.
// No server-only import: job views and the workspace UI read these too.
export const CREDIT_POOLS = ['free', 'paid'] as const
export type CreditPool = (typeof CREDIT_POOLS)[number]

export type Balance = { paid: number; free: number }

// The output tier decides the pool (Owner 2026-11-23, migration 1996): 1K is paid ONLY from the
// free pool (a free work), 2K and 4K ONLY from the paid pool; never the other pool instead. For an
// active org member the same holds for the org's shares (promotion → 1K, paid → 2K/4K).
export const tierPool = (tier: string): CreditPool => (tier === '1k' ? 'free' : 'paid')

// Which pool a charge of `cost` at `tier` comes from, mirroring reserve_credits; null when that
// pool cannot cover it (the server refuses, it never charges the other pool).
export function chargePool(balance: Balance, cost: number, tier: string): CreditPool | null {
  const pool = tierPool(tier)
  return balance[pool] >= cost ? pool : null
}

// Paid credits still to buy before a 2K / 4K job of `cost` is affordable. Purchases only fill the
// paid pool, so a 1K job (free credits only) is never made affordable by buying: 0.
export function creditsNeeded(balance: Balance, cost: number, tier: string): number {
  return tierPool(tier) === 'paid' && balance.paid < cost ? cost - balance.paid : 0
}

// The tier a fresh form starts on: 2K when paid credits cover it, else 1K when free credits cover
// it, else null (the caller keeps its own default). Only tiers the template offers count.
export function defaultTier<T extends string>(balance: Balance, costs: Partial<Record<T, number>>, tiers: readonly T[]): T | null {
  const fits = (tier: T) => {
    const cost = costs[tier]
    return tiers.includes(tier) && cost !== undefined && chargePool(balance, cost, tier) !== null
  }
  return (['2k', '1k'] as T[]).find(fits) ?? null
}

// 在职成员只用企业积分 (ARCHITECTURE §6.5): an active org member pays only with the org's shares.
// 'promo' is the free pool (a free work), 'paid' the paid pool.
export type PoolChoice = 'paid' | 'promo'
// For an active member: the org's paid and promotion shares they can spend, and the remembered
// choice (no longer picks the pool of an image job: the tier does, 1996).
export type PoolChoiceOffer = { paid: number; promo: number; last: PoolChoice }

// What a member may spend: the org's shares only, as a balance.
export const orgBalance = (offer: PoolChoiceOffer): Balance => ({ paid: offer.paid, free: offer.promo })
