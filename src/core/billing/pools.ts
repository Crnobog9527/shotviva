// Two balances (ARCHITECTURE §6.1): 'free' (signup / promo gifts, makes free works: public,
// watermarked) and 'paid' (purchases and compensation, makes paid works: private by default,
// clean, commercial use). Each work records the pool it was charged from.
// No server-only import: job views and the workspace UI read these too.
export const CREDIT_POOLS = ['free', 'paid'] as const
export type CreditPool = (typeof CREDIT_POOLS)[number]

export type Balance = { paid: number; free: number }

// Which pool a charge of `cost` would come from, mirroring reserve_credits: paid first, then
// free, never split across the two. null means neither pool covers it on its own.
export function chargePool(balance: Balance, cost: number): CreditPool | null {
  if (balance.paid >= cost) return 'paid'
  if (balance.free >= cost) return 'free'
  return null
}

// Paid credits still to buy before `cost` is affordable. Purchases only fill the paid pool and a
// charge is never split, so this counts against the paid pool alone.
export function creditsNeeded(balance: Balance, cost: number): number {
  return chargePool(balance, cost) === null ? cost - balance.paid : 0
}

// 在职成员只用企业积分 (ARCHITECTURE §6.5): an active org member pays only with the org's shares,
// and chooses which kind when holding both. 'promo' charges the free pool (a free work), 'paid' the
// paid pool.
export type PoolChoice = 'paid' | 'promo'
// For an active member: the org's paid and promotion shares they can spend, and the remembered
// choice. The picker shows only when both are above 0.
export type PoolChoiceOffer = { paid: number; promo: number; last: PoolChoice }

// What a member may spend: the org's shares only, as a balance.
export const orgBalance = (offer: PoolChoiceOffer): Balance => ({ paid: offer.paid, free: offer.promo })
export const bothKinds = (offer: PoolChoiceOffer) => offer.paid > 0 && offer.promo > 0

// The balance a chosen kind may pay from: never the other pool (reserve_credits refuses).
export function chosenBalance(balance: Balance, choice: PoolChoice): Balance {
  return choice === 'paid' ? { paid: balance.paid, free: 0 } : { paid: 0, free: balance.free }
}

// The kind that actually pays a job of `cost`: the preferred one (the member's last or current
// pick) when it covers the cost, else the other one when that does, else the preferred one (the
// page then asks the admin).
export function coveringChoice(offer: PoolChoiceOffer, preferred: PoolChoice, cost: number): PoolChoice {
  const left = (kind: PoolChoice) => (kind === 'paid' ? offer.paid : offer.promo)
  const other: PoolChoice = preferred === 'paid' ? 'promo' : 'paid'
  if (left(preferred) >= cost || left(other) < cost) return preferred
  return other
}
