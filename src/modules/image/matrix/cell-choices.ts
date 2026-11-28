import { tierPool, type Balance, type CreditPool } from '@/core/billing/pools'
import { NOTE_MAX_LENGTH, RESOLUTIONS, type Resolution } from '@/core/templates/output-options'

import type { CatalogueTemplate } from '../catalogue/catalogue-template'

// Each result of Batch create picks its own tier and its own note (Owner 2026-11-28). The tier
// decides the pool (1996): 1K is free credits only, and a batch takes free credits only from an
// affiliate org's promotion share (2034), so 1K is offered only when `promo` is on. A template
// offers the tiers its model makes and the admin sells (template_image_options), never more.
export function batchTiers(template: Pick<CatalogueTemplate, 'imageOptions'>, promo: boolean): Resolution[] {
  const sold = template.imageOptions?.resolutions ?? RESOLUTIONS
  return RESOLUTIONS.filter((tier) => sold.includes(tier) && (promo || tierPool(tier) === 'paid'))
}

// The wanted tier when the template offers it, else the nearest one it does (higher on a tie, so
// a 2K batch default lands on 4K before 1K). Null: the template offers nothing to a batch.
export function cellTier(wanted: Resolution, offered: readonly Resolution[]): Resolution | null {
  if (offered.includes(wanted)) return wanted
  const at = RESOLUTIONS.indexOf(wanted)
  const distance = (tier: Resolution) => Math.abs(RESOLUTIONS.indexOf(tier) - at) * 2 - (RESOLUTIONS.indexOf(tier) > at ? 1 : 0)
  return offered.reduce<Resolution | null>((best, tier) => (best === null || distance(tier) < distance(best) ? tier : best), null)
}

export type PoolCell = { credits: number; pool: CreditPool; removed: boolean }

// What the kept cells need from each pool: the paid pool for 2K / 4K, the free pool (an
// affiliate member's promotion share) for 1K.
export function poolTotals(cells: readonly PoolCell[]): Record<CreditPool, number> {
  const totals = { paid: 0, free: 0 }
  for (const cell of cells) if (!cell.removed) totals[cell.pool] += cell.credits
  return totals
}

// Credits still short in each pool; buying fills only the paid pool.
export function shortfall(cells: readonly PoolCell[], balance: Balance): Record<CreditPool, number> {
  const need = poolTotals(cells)
  return { paid: Math.max(0, need.paid - balance.paid), free: Math.max(0, need.free - balance.free) }
}

// A note as the server will take it: trimmed, capped (ARCHITECTURE §4 inputs.note), blank = none.
export const cleanNote = (note: string) => note.trim().slice(0, NOTE_MAX_LENGTH)

// Writing one note into several results: "append" keeps what each one had and adds the new words
// on a new line (cut at the cap), "replace" swaps it. A result that had nothing just takes it.
export type NoteMode = 'append' | 'replace'
export function mergedNote(current: string, next: string, mode: NoteMode): string {
  const added = cleanNote(next)
  if (mode === 'replace' || !current.trim()) return added
  if (!added) return current
  return `${current.trim()}\n${added}`.slice(0, NOTE_MAX_LENGTH)
}
