import type { Balance } from '@/core/billing/pools'

import type { MatrixBlock } from './matrix-state'

export type MatrixCta =
  | { kind: 'blocked'; block: MatrixBlock }
  | { kind: 'checking' }
  | { kind: 'get-credits'; total: number; needed: number; count: number }
  | { kind: 'generate'; total: number; count: number }

// A batch is paid credits only (ARCHITECTURE §6.2): the whole total must fit the paid pool.
export function matrixCta(block: MatrixBlock | null, total: number, count: number, balance: Balance, checking: boolean): MatrixCta {
  if (checking) return { kind: 'checking' }
  if (block && block !== 'uploading' && block !== 'copy') return { kind: 'blocked', block }
  if (count > 0 && total > balance.paid) return { kind: 'get-credits', total, needed: total - balance.paid, count }
  if (block) return { kind: 'blocked', block }
  return { kind: 'generate', total, count }
}
