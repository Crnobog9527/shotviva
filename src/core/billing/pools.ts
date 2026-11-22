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

// 出图时让员工自选 (ARCHITECTURE §6.5): a member of an org who holds both kinds of org credits
// chooses which kind pays. 'promo' charges the free pool (a free work), 'paid' the paid pool.
export type PoolChoice = 'paid' | 'promo'
// Offered only when the member holds both; the amounts are each pool's whole balance (the org's
// share is spent first in the free pool, last in the paid pool), last is the remembered choice.
export type PoolChoiceOffer = { paid: number; promo: number; last: PoolChoice }

// The balance a chosen kind may pay from: never the other pool (reserve_credits refuses).
export function chosenBalance(balance: Balance, choice: PoolChoice): Balance {
  return choice === 'paid' ? { paid: balance.paid, free: 0 } : { paid: 0, free: balance.free }
}
