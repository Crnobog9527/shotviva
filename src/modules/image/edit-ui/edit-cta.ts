import { chargePool, creditsNeeded, tierPool, type Balance, type CreditPool } from '@/core/billing/pools'

// The edit panel's one primary (T6 comp photo.html, DESIGN §4.3 rules): the chosen tier's pool
// can't cover it → "Get credits · N needed" for 2K / 4K, or a dim bar saying 1K uses free credits
// only (buying would not help, 1996); no words yet → dim "Generate" that only points at the
// field; else Generate, with the pool the tier is paid from.
export type EditCta =
  | { kind: 'get-credits'; cost: number; needed: number }
  | { kind: 'free-only'; cost: number }
  | { kind: 'empty'; cost: number }
  | { kind: 'generate'; cost: number; pool: CreditPool }

export function editCta(balance: Balance, cost: number, tier: string, text: string): EditCta {
  const pool = chargePool(balance, cost, tier)
  if (pool === null) return tierPool(tier) === 'free' ? { kind: 'free-only', cost } : { kind: 'get-credits', cost, needed: creditsNeeded(balance, cost, tier) }
  if (text.trim() === '') return { kind: 'empty', cost }
  return { kind: 'generate', cost, pool }
}
