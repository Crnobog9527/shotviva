import type { Balance } from '@/core/billing/pools'

import { poolTotals, type PoolCell } from './cell-choices'
import type { MatrixBlock } from './matrix-state'

export type MatrixCta =
  | { kind: 'blocked'; block: MatrixBlock }
  | { kind: 'checking' }
  | { kind: 'get-credits'; total: number; needed: number; count: number }
  | { kind: 'generate'; total: number; count: number }
  | { kind: 'promo-short'; needed: number }

// Each pool must cover its own cells (1996): 2K / 4K from the paid pool, 1K (an affiliate org
// member only, 2034) from the promotion share. Buying fills only the paid pool, so a promotion
// shortfall says so instead of opening the paywall.
export function matrixCta(block: MatrixBlock | null, cells: readonly PoolCell[], count: number, balance: Balance, checking: boolean): MatrixCta {
  if (checking) return { kind: 'checking' }
  if (block && block !== 'uploading' && block !== 'copy') return { kind: 'blocked', block }
  const need = poolTotals(cells)
  const total = need.paid + need.free
  if (count > 0 && need.paid > balance.paid) return { kind: 'get-credits', total, needed: need.paid - balance.paid, count }
  if (count > 0 && need.free > balance.free) return { kind: 'promo-short', needed: need.free - balance.free }
  if (block) return { kind: 'blocked', block }
  return { kind: 'generate', total, count }
}
