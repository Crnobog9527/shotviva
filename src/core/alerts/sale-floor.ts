import { createHash } from 'node:crypto'

import type { SupabaseClient } from '@supabase/supabase-js'

import type { SaleFloorExample, SaleFloorHiddenAlert, SaleFloorReason } from './alert-kinds'

// 「模板不在创作页」 (1295, ARCHITECTURE §6.1): the catalogue lists only templates whose default 1K
// route can be sold, and the cost floor of a route without an approved price moves with its jobs'
// p95. When published templates drop out, the Owner is told: after a costed job settles (at most
// every 10 minutes per instance, in after() work) and by the cron. One message per hidden set.

export const SALE_FLOOR_CHECK_EVERY_MS = 10 * 60_000
export const SALE_FLOOR_EXAMPLES = 5
const LOOKUP_TIMEOUT_MS = 5000

const REASONS: readonly SaleFloorReason[] = ['sale_closed', 'unpriced', 'no_route', 'route_unsupported', 'below_floor']
const BASES = ['p95', 'estimate', 'catalog', 'list'] as const

const num = (value: unknown): number | null => (typeof value === 'number' && Number.isFinite(value) ? value : null)

// One row of admin_sale_floor_hidden(); anything unexpected is dropped rather than guessed at.
const record = (value: unknown): Record<string, unknown> | null =>
  value && typeof value === 'object' && !Array.isArray(value) ? (value as Record<string, unknown>) : null

function parseRow(row: unknown): SaleFloorExample[] {
  const r = record(row)
  if (!r || typeof r.template_id !== 'string' || !REASONS.includes(r.reason as SaleFloorReason)) return []
  const floor = record(r.floor)
  return [{
    templateId: r.template_id,
    reason: r.reason as SaleFloorReason,
    quality: typeof r.quality === 'string' ? r.quality : '',
    price: num(r.price),
    floor: num(floor?.credits),
    basis: BASES.find((b) => b === floor?.basis) ?? null,
    samples: num(floor?.samples),
  }]
}

export function parseSaleFloorHidden(data: unknown): SaleFloorExample[] {
  return Array.isArray(data) ? data.flatMap(parseRow) : []
}

// null when nothing is hidden. The fingerprint is the set of ids and reasons, not the numbers, so
// a floor that moves by a credit does not send the same news again.
export function saleFloorAlert(rows: readonly SaleFloorExample[]): SaleFloorHiddenAlert | null {
  if (rows.length === 0) return null
  const sorted = [...rows].sort((a, b) => a.templateId.localeCompare(b.templateId))
  const fingerprint = createHash('sha256')
    .update(sorted.map((r) => `${r.templateId}:${r.reason}`).join('\n'))
    .digest('hex')
    .slice(0, 16)
  const belowFloor = sorted.filter((r) => r.reason === 'below_floor')
  // Floor examples first: they are the ones a price change fixes.
  const examples = [...belowFloor, ...sorted.filter((r) => r.reason !== 'below_floor')].slice(0, SALE_FLOOR_EXAMPLES)
  return { kind: 'sale_floor_hidden', fingerprint, total: sorted.length, belowFloor: belowFloor.length, examples }
}

export async function readSaleFloorHidden(db: SupabaseClient): Promise<SaleFloorExample[]> {
  const { data, error } = await db.rpc('admin_sale_floor_hidden').abortSignal(AbortSignal.timeout(LOOKUP_TIMEOUT_MS))
  if (error) throw new Error(`admin_sale_floor_hidden failed: ${error.message}`)
  return parseSaleFloorHidden(data)
}
