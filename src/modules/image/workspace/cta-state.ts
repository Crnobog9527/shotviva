import { chargePool, creditsNeeded, tierPool, type Balance, type CreditPool } from '@/core/billing/pools'

// The workspace's one primary (DESIGN §4.3, §8.2), decided in this order: the tier's pool can't
// cover it → "Get credits · N needed" for 2K / 4K (neutral fill, opens the paywall), or a disabled
// bar saying why for 1K (free credits only: buying would not help, 1996); a single photo with too
// many already developing → wait; no photo yet / still uploading → disabled; else Generate.
// A batch (count > 1) is paid credits only (ARCHITECTURE §6.2): the whole cost must fit the paid
// pool, so no watermarked photo ends up in it, and 1K (free only) cannot be batched. It skips the
// wait: its photos queue. So is 「去水印：用付费积分重新生成」 (paidOnly, 2026-11-22): its whole
// point is a clean, paid photo.
export type CtaState =
  | { kind: 'generate'; cost: number; pool: CreditPool; count: number }
  | { kind: 'get-credits'; cost: number; needed: number; count: number }
  // free-only: 1K and the free pool cannot cover it; paid-only: 1K picked for a batch or Remove
  // watermark, which only paid credits (2K / 4K) may pay.
  | { kind: 'tier-pool'; reason: 'free-only' | 'paid-only'; cost: number; count: number }
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
  // Credits for one photo at the chosen resolution, and that resolution (it decides the pool).
  cost: number
  tier: string
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

type Charge = { pool: CreditPool } | { needed: number } | { reason: 'free-only' | 'paid-only' }

function charge(balance: Balance, cost: number, tier: string, paidOnly: boolean): Charge {
  if (paidOnly && tierPool(tier) === 'free') return { reason: 'paid-only' }
  const pool = chargePool(balance, cost, tier)
  if (pool !== null) return { pool }
  return tierPool(tier) === 'free' ? { reason: 'free-only' } : { needed: creditsNeeded(balance, cost, tier) }
}

export function ctaState({ balance, cost, tier, running, limit, photo, copyMissing = false, count = 1, paidOnly = false }: CtaInput): CtaState {
  const photos = Math.max(1, count)
  const total = cost * photos
  const verdict = charge(balance, total, tier, photos > 1 || paidOnly)
  if ('reason' in verdict) return { kind: 'tier-pool', reason: verdict.reason, cost: total, count: photos }
  if ('needed' in verdict) return { kind: 'get-credits', cost: total, needed: verdict.needed, count: photos }
  return readiness({ running, limit, photo, copyMissing }, photos) ?? { kind: 'generate', cost: total, pool: verdict.pool, count: photos }
}

// What still stops an affordable run: the concurrency limit (a single photo only), the photo, the text.
function readiness({ running, limit, photo, copyMissing }: Pick<CtaInput, 'running' | 'limit' | 'photo'> & { copyMissing: boolean }, photos: number): CtaState | null {
  if (photos === 1 && running >= limit) return { kind: 'wait', limit }
  if (photo === 'none') return { kind: 'need-photo' }
  if (photo === 'uploading') return { kind: 'uploading' }
  if (copyMissing) return { kind: 'need-copy' }
  return null
}

// Whether a tier's credits read as affordable from that tier's own pool (greyed when not, DESIGN §4.3).
export const canAfford = (balance: Balance, cost: number, tier: string) => chargePool(balance, cost, tier) !== null
