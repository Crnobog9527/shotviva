import { chargePool, creditsNeeded, type Balance, type CreditPool } from '@/core/billing/pools'

// The workspace's one primary (DESIGN §4.3, §8.2), decided in this order: can't afford it →
// "Get credits · N needed" (neutral fill, opens the paywall); a single photo with too many
// already developing → wait; no photo yet / still uploading → disabled; else Generate.
// A batch (count > 1) is paid credits only (ARCHITECTURE §6.2): the whole cost must fit the paid
// pool, so no watermarked photo ends up in it. It skips the wait: its photos queue. So is
// 「去水印：用付费积分重新生成」 (paidOnly, 2026-11-22): its whole point is a clean, paid photo.
export type CtaState =
  | { kind: 'generate'; cost: number; pool: CreditPool; count: number }
  | { kind: 'get-credits'; cost: number; needed: number; count: number }
  | { kind: 'wait'; limit: number }
  | { kind: 'need-photo' }
  | { kind: 'uploading' }
  | { kind: 'need-copy' }
  | { kind: 'no-options' }
  | { kind: 'need-size' }
  // The batch preflight is pricing and checking every photo (T107).
  | { kind: 'checking' }

export type CtaInput = {
  balance: Balance
  // Credits for one photo at the chosen resolution.
  cost: number
  running: number
  limit: number
  photo: 'none' | 'uploading' | 'ready'
  // A required template text field (headline, price) is still empty.
  copyMissing?: boolean
  // Photos this run will generate; 1 (or 0, nothing picked yet) is a single photo.
  count?: number
  // Only paid credits may pay (Remove watermark): free credits would make another marked photo.
  paidOnly?: boolean
}

type Charge = { pool: CreditPool } | { needed: number }

function charge(balance: Balance, cost: number, count: number, paidOnly: boolean): Charge {
  if (count > 1 || paidOnly) return balance.paid >= cost ? { pool: 'paid' } : { needed: cost - balance.paid }
  const pool = chargePool(balance, cost)
  return pool === null ? { needed: creditsNeeded(balance, cost) } : { pool }
}

export function ctaState({ balance, cost, running, limit, photo, copyMissing = false, count = 1, paidOnly = false }: CtaInput): CtaState {
  const photos = Math.max(1, count)
  const total = cost * photos
  const verdict = charge(balance, total, photos, paidOnly)
  if ('needed' in verdict) return { kind: 'get-credits', cost: total, needed: verdict.needed, count: photos }
  if (photos === 1 && running >= limit) return { kind: 'wait', limit }
  if (photo === 'none') return { kind: 'need-photo' }
  if (photo === 'uploading') return { kind: 'uploading' }
  if (copyMissing) return { kind: 'need-copy' }
  return { kind: 'generate', cost: total, pool: verdict.pool, count: photos }
}

// Whether a tier's credits read as affordable (greyed when not, DESIGN §4.3).
export const canAfford = (balance: Balance, cost: number) => chargePool(balance, cost) !== null
