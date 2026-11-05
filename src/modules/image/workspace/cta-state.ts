import { chargePool, creditsNeeded, type Balance, type CreditPool } from '@/core/billing/pools'

// The workspace's one primary (DESIGN §4.3, §8.2), decided in this order: can't afford the
// chosen resolution → "Get credits · N needed" (neutral fill, opens the paywall); too many
// photos already developing → wait; no photo yet / still uploading → disabled; else Generate.
export type CtaState =
  | { kind: 'generate'; cost: number; pool: CreditPool }
  | { kind: 'get-credits'; cost: number; needed: number }
  | { kind: 'wait'; limit: number }
  | { kind: 'need-photo' }
  | { kind: 'uploading' }
  | { kind: 'need-copy' }

export type CtaInput = {
  balance: Balance
  cost: number
  running: number
  limit: number
  photo: 'none' | 'uploading' | 'ready'
  // A required template text field (headline, price) is still empty.
  copyMissing?: boolean
}

export function ctaState({ balance, cost, running, limit, photo, copyMissing = false }: CtaInput): CtaState {
  const pool = chargePool(balance, cost)
  if (pool === null) return { kind: 'get-credits', cost, needed: creditsNeeded(balance, cost) }
  if (running >= limit) return { kind: 'wait', limit }
  if (photo === 'none') return { kind: 'need-photo' }
  if (photo === 'uploading') return { kind: 'uploading' }
  if (copyMissing) return { kind: 'need-copy' }
  return { kind: 'generate', cost, pool }
}

// Whether a tier's credits read as affordable (greyed when not, DESIGN §4.3).
export const canAfford = (balance: Balance, cost: number) => chargePool(balance, cost) !== null
