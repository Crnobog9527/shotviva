// F4 (ARCHITECTURE §6.2 订单手续费 · 对账): Stripe books Managed Payments 3.5%, Billing 0.7% and
// Radar $0.05 as `stripe_fee` balance transactions with no source (F1 §2.2): nothing in them
// names a payment. This file decides, from the amount alone, which payments a batch covers and
// what share each carries. Pure: no I/O, integer cents throughout.

export type BatchKind = 'mp' | 'billing' | 'radar'
export type FeeBatchKind = BatchKind | 'other'

// The description says what the entry is. Dispute fees are the platform's (the Owner, plan 5.1
// decision 3) and never shared out; anything else unknown is shown to the Owner once.
export function classifyStripeFee(description: string | null | undefined): { kind: FeeBatchKind; known: boolean } {
  const text = description ?? ''
  if (/managed payments/i.test(text)) return { kind: 'mp', known: true }
  if (/billing/i.test(text)) return { kind: 'billing', known: true }
  if (/radar/i.test(text)) return { kind: 'radar', known: true }
  if (/dispute|chargeback/i.test(text)) return { kind: 'other', known: true }
  return { kind: 'other', known: false }
}

// `Managed Payments Transaction Fee (2026-11-10)`: the UTC day of the batch (F1: 23/23); else the
// day it was booked.
export function batchDay(description: string | null | undefined, bookedAt: Date): string {
  const match = /\((\d{4}-\d{2}-\d{2})\)/.exec(description ?? '')
  return match ? match[1] : bookedAt.toISOString().slice(0, 10)
}

// onDay: created on the batch's label day. A batch's label is its first charge's UTC day (F1), so
// a run starts on that day; only its tail may cross midnight into the next.
export type Candidate = { payment_id: number; basis_cents: number | null; onDay?: boolean }
const startsHere = (c: Candidate) => c.onDay !== false
export type Share = { payment_id: number; basis_cents: number; share_cents: number }
export type BatchMatch =
  | { status: 'allocated'; formula_cents: number; items: Share[]; note: string }
  | { status: 'mismatch'; formula_cents: number | null; note: string }

const RATE_BP: Record<Exclude<BatchKind, 'radar'>, number> = { mp: 350, billing: 70 }
export const RADAR_CENTS = 5

// Stripe rounds the batch total, not each payment (F1: $9.90 + $19.90 → 104¢, not 105¢).
const percentOf = (basis: number, bp: number) => Math.floor((basis * bp + 5000) / 10000)

// `total` shared by basis, largest remainder first (ties: older payment), so shares add up exactly.
export function shareOut(total: number, items: readonly { payment_id: number; basis_cents: number }[]): Share[] {
  const weight = items.reduce((sum, item) => sum + item.basis_cents, 0)
  const raw = items.map((item, index) => {
    const exact = weight > 0 ? (total * item.basis_cents) / weight : total / items.length
    return { item, index, floor: Math.floor(exact), rest: exact - Math.floor(exact) }
  })
  let left = total - raw.reduce((sum, r) => sum + r.floor, 0)
  const order = [...raw].sort((a, b) => b.rest - a.rest || a.index - b.index)
  for (const r of order) {
    if (left <= 0) break
    r.floor += 1
    left -= 1
  }
  return raw.map(r => ({ payment_id: r.item.payment_id, basis_cents: r.item.basis_cents, share_cents: r.floor }))
}

// Which of `candidates` (oldest first, from the batch's day until it was booked) one batch of
// `amount` covers.
// - mp / billing: a run of consecutive USD payments whose rounded rate × total is exactly the
//   batch (F1: a batch is a run of consecutive payments; several can share a day). The earliest
//   such run wins, shortest first, so payments a batch nothing explained (or a non-USD payment,
//   whose USD basis is unknown) never block the batches after them. Failing that, all of them
//   when every one is in USD and the rate × total is within a cent per payment (rounding): shared
//   by basis. Anything else is a mismatch — the payments keep their estimate.
// - radar: 5¢ per screened order whatever its currency. A batch at least that large gives each
//   order 5¢ (the rest is failed attempts, the platform's); a smaller multiple of 5¢ covers the
//   oldest orders.
export function matchBatch(kind: BatchKind, amount: number, candidates: readonly Candidate[]): BatchMatch {
  const sameDay = candidates.filter(startsHere)
  if (sameDay.length === 0) return { status: 'mismatch', formula_cents: null, note: 'no payments that day' }
  if (kind === 'radar') return matchRadar(amount, sameDay.map(c => ({ payment_id: c.payment_id, basis_cents: c.basis_cents ?? 0 })))
  const bp = RATE_BP[kind]
  const run = exactRun(amount, bp, candidates)
  if (run) return { status: 'allocated', formula_cents: amount, items: shareOut(amount, run.items), note: `exact, ${run.note}` }
  // The rounding fallback stays within the label day: it cannot tell where a run ends.
  if (sameDay.some(c => c.basis_cents === null)) return { status: 'mismatch', formula_cents: null, note: 'no run matches; a payment is not in USD' }
  const known = sameDay as readonly { payment_id: number; basis_cents: number }[]
  const formula = percentOf(known.reduce((sum, c) => sum + c.basis_cents, 0), bp)
  if (Math.abs(formula - amount) <= known.length) {
    return { status: 'allocated', formula_cents: formula, items: shareOut(amount, known), note: `within rounding, ${known.length} payments` }
  }
  return { status: 'mismatch', formula_cents: formula, note: `formula ${formula} for ${known.length} payments` }
}

type Known = { payment_id: number; basis_cents: number }

// The earliest, then shortest, run of consecutive USD candidates whose rounded rate × total is
// exactly `amount`. Totals only grow along a run, so a run stops once it is past the amount.
function exactRun(amount: number, bp: number, candidates: readonly Candidate[]): { items: Known[]; note: string } | null {
  for (let start = 0; start < candidates.length; start += 1) {
    if (!startsHere(candidates[start])) continue
    let total = 0
    for (let end = start; end < candidates.length; end += 1) {
      const basis = candidates[end].basis_cents
      if (basis === null) break
      total += basis
      const formula = percentOf(total, bp)
      if (formula === amount) {
        return { items: candidates.slice(start, end + 1) as Known[], note: `${end - start + 1} from #${start + 1} of ${candidates.length}` }
      }
      if (formula > amount) break
    }
  }
  return null
}

function matchRadar(amount: number, known: readonly { payment_id: number; basis_cents: number }[]): BatchMatch {
  const formula = RADAR_CENTS * known.length
  const each = (items: typeof known) => items.map(c => ({ payment_id: c.payment_id, basis_cents: c.basis_cents, share_cents: RADAR_CENTS }))
  if (amount >= formula) return { status: 'allocated', formula_cents: formula, items: each(known), note: `${known.length} orders, ${amount - formula}¢ failed attempts` }
  if (amount > 0 && amount % RADAR_CENTS === 0) {
    const count = amount / RADAR_CENTS
    return { status: 'allocated', formula_cents: amount, items: each(known.slice(0, count)), note: `oldest ${count} of ${known.length}` }
  }
  return { status: 'mismatch', formula_cents: formula, note: `formula ${formula} for ${known.length} orders` }
}
