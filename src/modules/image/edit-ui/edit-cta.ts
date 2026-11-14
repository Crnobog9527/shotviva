import { chargePool, creditsNeeded, type Balance, type CreditPool } from '@/core/billing/pools'

// The edit panel's one primary (T6 comp photo.html, DESIGN §4.3 rules): can't afford the chosen
// tier → "Get credits · N needed"; no words yet → dim "Generate" that only points at the field;
// else Generate, with the pool the charge would use.
export type EditCta =
  | { kind: 'get-credits'; cost: number; needed: number }
  | { kind: 'empty'; cost: number }
  | { kind: 'generate'; cost: number; pool: CreditPool }

export function editCta(balance: Balance, cost: number, text: string): EditCta {
  const pool = chargePool(balance, cost)
  if (pool === null) return { kind: 'get-credits', cost, needed: creditsNeeded(balance, cost) }
  if (text.trim() === '') return { kind: 'empty', cost }
  return { kind: 'generate', cost, pool }
}
